-- Mix-Currency POS Extension: TRY Support

-- 1. Update Workspaces table
ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS try_conversion_enabled BOOLEAN DEFAULT FALSE;

-- 2. Update get_workspace_features RPC to include the new field
DROP FUNCTION IF EXISTS public.get_workspace_features();
CREATE OR REPLACE FUNCTION public.get_workspace_features()
RETURNS TABLE (
    allow_pos BOOLEAN,
    allow_customers BOOLEAN,
    allow_orders BOOLEAN,
    allow_invoices BOOLEAN,
    is_configured BOOLEAN,
    default_currency TEXT,
    iqd_display_preference TEXT,
    workspace_name TEXT,
    eur_conversion_enabled BOOLEAN,
    try_conversion_enabled BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.allow_pos,
        w.allow_customers,
        w.allow_orders,
        w.allow_invoices,
        w.is_configured,
        w.default_currency,
        w.iqd_display_preference,
        w.name as workspace_name,
        w.eur_conversion_enabled,
        w.try_conversion_enabled
    FROM public.workspaces w
    JOIN public.profiles p ON p.workspace_id = w.id
    WHERE p.id = auth.uid();
END;
$$;

-- 3. Update complete_sale RPC to handle try products validation and auto-calculate cost
DROP FUNCTION IF EXISTS public.complete_sale(JSONB);
CREATE OR REPLACE FUNCTION public.complete_sale(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_sale_id UUID;
    item JSONB;
    p_workspace_id UUID;
    total_sale_amount NUMERIC := 0;
    v_allow_pos BOOLEAN;
    v_eur_enabled BOOLEAN;
    v_try_enabled BOOLEAN;
    v_product RECORD;
    v_cost_price NUMERIC;
    v_converted_cost_price NUMERIC;
    v_settlement_currency TEXT;
    v_original_currency TEXT;
    v_rate_data JSONB;
BEGIN
    -- Get current user's workspace
    SELECT workspace_id INTO p_workspace_id 
    FROM public.profiles 
    WHERE id = auth.uid();

    IF p_workspace_id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to a workspace';
    END IF;

    -- Check if POS feature and EUR/TRY (if needed) are enabled
    SELECT 
        allow_pos, 
        eur_conversion_enabled,
        try_conversion_enabled
    INTO 
        v_allow_pos, 
        v_eur_enabled,
        v_try_enabled
    FROM public.workspaces
    WHERE id = p_workspace_id;

    IF NOT COALESCE(v_allow_pos, false) THEN
        RAISE EXCEPTION 'POS feature is not enabled for this workspace';
    END IF;

    -- Validate EUR/TRY products if disabled (backend safety)
    IF NOT COALESCE(v_eur_enabled, false) OR NOT COALESCE(v_try_enabled, false) THEN
        FOR item IN SELECT * FROM jsonb_array_elements(payload->'items')
        LOOP
            IF NOT COALESCE(v_eur_enabled, false) AND (item->>'original_currency') = 'eur' THEN
                RAISE EXCEPTION 'EUR products are not enabled for this workspace';
            END IF;
            IF NOT COALESCE(v_try_enabled, false) AND (item->>'original_currency') = 'try' THEN
                RAISE EXCEPTION 'TRY products are not enabled for this workspace';
            END IF;
        END LOOP;
    END IF;

    total_sale_amount := (payload->>'total_amount')::NUMERIC;
    v_settlement_currency := COALESCE(payload->>'settlement_currency', 'usd');

    -- Insert Sale Record with snapshot metadata
    INSERT INTO public.sales (
        id,
        workspace_id, 
        cashier_id, 
        total_amount, 
        settlement_currency,
        exchange_source,
        exchange_rate,
        exchange_rate_timestamp,
        exchange_rates,
        origin
    )
    VALUES (
        COALESCE((payload->>'id')::UUID, gen_random_uuid()),
        p_workspace_id, 
        auth.uid(), 
        total_sale_amount, 
        v_settlement_currency,
        COALESCE(payload->>'exchange_source', 'mixed'),
        COALESCE((payload->>'exchange_rate')::NUMERIC, 0),
        COALESCE((payload->>'exchange_rate_timestamp')::TIMESTAMPTZ, NOW()),
        COALESCE(payload->'exchange_rates', '[]'::jsonb),
        COALESCE(payload->>'origin', 'pos')
    )
    RETURNING id INTO new_sale_id;

    -- Process Items
    FOR item IN SELECT * FROM jsonb_array_elements(payload->'items')
    LOOP
        -- Fetch product cost from DB
        SELECT cost_price, currency INTO v_product
        FROM public.products
        WHERE id = (item->>'product_id')::UUID AND workspace_id = p_workspace_id;

        v_cost_price := COALESCE(v_product.cost_price, 0);
        v_original_currency := COALESCE(item->>'original_currency', v_product.currency, 'usd');
        v_converted_cost_price := v_cost_price; -- Default: no conversion

        -- Convert cost if currencies differ
        IF v_original_currency <> v_settlement_currency THEN
            -- Find the relevant rate from exchange_rates array
            -- We look for a pair like 'USD/IQD', 'EUR/IQD', 'TRY/IQD' etc.
            -- The rate stored is "per 100 units" so we divide by 100.
            
            -- Simplified conversion logic: use the rate that matches the original currency to settlement
            -- For complex paths (e.g., TRY->EUR), this requires chaining, but server-side we approximate.
            
            -- Try to find direct rate: ORIGINAL/SETTLEMENT
            SELECT er INTO v_rate_data FROM jsonb_array_elements(payload->'exchange_rates') er
            WHERE (er->>'pair') = (UPPER(v_original_currency) || '/' || UPPER(v_settlement_currency));
            
            IF v_rate_data IS NOT NULL THEN
                v_converted_cost_price := v_cost_price * ((v_rate_data->>'rate')::NUMERIC / 100);
            ELSE
                -- Try inverse: SETTLEMENT/ORIGINAL
                SELECT er INTO v_rate_data FROM jsonb_array_elements(payload->'exchange_rates') er
                WHERE (er->>'pair') = (UPPER(v_settlement_currency) || '/' || UPPER(v_original_currency));
                
                IF v_rate_data IS NOT NULL THEN
                    v_converted_cost_price := v_cost_price / ((v_rate_data->>'rate')::NUMERIC / 100);
                ELSE
                    -- Fallback: Try chaining through IQD if available
                    -- e.g., TRY -> IQD -> USD requires TRY/IQD and USD/IQD rates
                    DECLARE
                        v_orig_iqd_rate NUMERIC := NULL;
                        v_settle_iqd_rate NUMERIC := NULL;
                    BEGIN
                        SELECT (er->>'rate')::NUMERIC INTO v_orig_iqd_rate FROM jsonb_array_elements(payload->'exchange_rates') er
                        WHERE (er->>'pair') = (UPPER(v_original_currency) || '/IQD');
                        
                        SELECT (er->>'rate')::NUMERIC INTO v_settle_iqd_rate FROM jsonb_array_elements(payload->'exchange_rates') er
                        WHERE (er->>'pair') = (UPPER(v_settlement_currency) || '/IQD');
                        
                        IF v_orig_iqd_rate IS NOT NULL AND v_settle_iqd_rate IS NOT NULL THEN
                            v_converted_cost_price := (v_cost_price * (v_orig_iqd_rate / 100)) / (v_settle_iqd_rate / 100);
                        END IF;
                    END;
                END IF;
            END IF;
        END IF;

        -- Insert Sale Item with cost tracking
        INSERT INTO public.sale_items (
            sale_id, 
            product_id, 
            quantity, 
            unit_price, 
            total_price,
            cost_price,
            converted_cost_price,
            original_currency,
            original_unit_price,
            converted_unit_price,
            settlement_currency
        )
        VALUES (
            new_sale_id,
            (item->>'product_id')::UUID,
            (item->>'quantity')::INTEGER,
            (item->>'unit_price')::NUMERIC,
            (item->>'total_price')::NUMERIC,
            v_cost_price,
            v_converted_cost_price,
            v_original_currency,
            COALESCE((item->>'original_unit_price')::NUMERIC, (item->>'unit_price')::NUMERIC),
            COALESCE((item->>'converted_unit_price')::NUMERIC, (item->>'unit_price')::NUMERIC),
            v_settlement_currency
        );

        -- Update Inventory
        UPDATE public.products
        SET quantity = quantity - (item->>'quantity')::INTEGER
        WHERE id = (item->>'product_id')::UUID
          AND workspace_id = p_workspace_id;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'sale_id', new_sale_id);
END;
$$;
