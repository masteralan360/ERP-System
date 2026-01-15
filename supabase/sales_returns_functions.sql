-- Sales Returns RPC Functions
-- Functions to handle whole sale returns and individual item returns

-- Function to return a whole sale
CREATE OR REPLACE FUNCTION public.return_whole_sale(
    p_sale_id UUID,
    p_return_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    sale_record RECORD;
    item_record RECORD;
    p_workspace_id UUID;
    v_user_role TEXT;
    v_allow_pos BOOLEAN;
BEGIN
    -- Get sale record and workspace
    SELECT * INTO sale_record
    FROM public.sales 
    WHERE id = p_sale_id;
    
    IF sale_record IS NULL THEN
        RAISE EXCEPTION 'Sale not found';
    END IF;

    -- Check if sale is already returned
    IF sale_record.is_returned = TRUE THEN
        RAISE EXCEPTION 'Sale is already returned';
    END IF;

    -- Get workspace info
    SELECT workspace_id INTO p_workspace_id FROM public.sales WHERE id = p_sale_id;
    
    -- Check if POS feature is enabled
    SELECT allow_pos INTO v_allow_pos
    FROM public.workspaces
    WHERE id = p_workspace_id;

    IF NOT COALESCE(v_allow_pos, false) THEN
        RAISE EXCEPTION 'POS feature is not enabled for this workspace';
    END IF;

    -- Check user permissions
    SELECT role INTO v_user_role
    FROM public.profiles 
    WHERE id = auth.uid() 
    AND workspace_id = p_workspace_id;

    IF v_user_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can return whole sales';
    END IF;

    -- Update the sale as returned
    UPDATE public.sales
    SET 
        is_returned = TRUE,
        return_reason = p_return_reason,
        returned_at = NOW(),
        returned_by = auth.uid()
    WHERE id = p_sale_id;

    -- Update all items in the sale as returned
    UPDATE public.sale_items
    SET 
        is_returned = TRUE,
        return_reason = 'Whole sale returned: ' || p_return_reason,
        returned_at = NOW(),
        returned_by = auth.uid()
    WHERE sale_id = p_sale_id;

    -- Restore inventory
    FOR item_record IN SELECT * FROM public.sale_items WHERE sale_id = p_sale_id
    LOOP
        UPDATE public.products
        SET quantity = quantity + item_record.quantity
        WHERE id = item_record.product_id
          AND workspace_id = p_workspace_id;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'message', 'Sale returned successfully');
END;
$$;

-- Function to return individual sale items with quantities
CREATE OR REPLACE FUNCTION public.return_sale_items(
    p_sale_item_ids UUID[],
    p_return_quantities INTEGER[],
    p_return_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item_record RECORD;
    p_workspace_id UUID;
    v_user_role TEXT;
    v_allow_pos BOOLEAN;
    sale_id UUID;
    v_index INTEGER;
BEGIN
    -- Check if arrays are empty or mismatched
    IF p_sale_item_ids IS NULL OR array_length(p_sale_item_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'No items selected for return';
    END IF;
    
    IF p_return_quantities IS NULL OR array_length(p_return_quantities, 1) IS NULL THEN
        RAISE EXCEPTION 'No quantities provided for return';
    END IF;
    
    IF array_length(p_sale_item_ids, 1) != array_length(p_return_quantities, 1) THEN
        RAISE EXCEPTION 'Items and quantities arrays must have the same length';
    END IF;

    -- Get first item to determine workspace and sale
    SELECT si.*, s.workspace_id
    INTO item_record
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE si.id = ANY(p_sale_item_ids)
    LIMIT 1;
    
    -- Extract workspace_id from the record
    p_workspace_id := item_record.workspace_id;
    
    IF item_record IS NULL THEN
        RAISE EXCEPTION 'Sale items not found';
    END IF;

    -- Check if POS feature is enabled
    SELECT allow_pos INTO v_allow_pos
    FROM public.workspaces
    WHERE id = p_workspace_id;

    IF NOT COALESCE(v_allow_pos, false) THEN
        RAISE EXCEPTION 'POS feature is not enabled for this workspace';
    END IF;

    -- Check user permissions (Admin or Staff can return items)
    SELECT role INTO v_user_role
    FROM public.profiles 
    WHERE id = auth.uid() 
    AND workspace_id = p_workspace_id;

    IF v_user_role NOT IN ('admin', 'staff') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins and staff can return items';
    END IF;

    -- Process each item with its quantity
    FOR v_index IN 1..array_length(p_sale_item_ids, 1) LOOP
        -- Get the current item
        SELECT si.*, s.id as sale_id
        INTO item_record
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id
        WHERE si.id = p_sale_item_ids[v_index];
        
        -- Check if item exists
        IF item_record IS NULL THEN
            CONTINUE; -- Skip if item not found
        END IF;
        
        -- Check if item is already fully returned
        IF item_record.is_returned = TRUE THEN
            CONTINUE; -- Skip already returned items
        END IF;
        
        -- Validate return quantity
        IF p_return_quantities[v_index] <= 0 OR p_return_quantities[v_index] > item_record.quantity THEN
            RAISE EXCEPTION 'Invalid return quantity for item %: must be between 1 and %', item_record.id, item_record.quantity;
        END IF;
        
        -- Check if this is a partial return or full return
        IF p_return_quantities[v_index] = item_record.quantity THEN
            -- Full return - mark item as returned
            UPDATE public.sale_items
            SET 
                is_returned = TRUE,
                return_reason = p_return_reason,
                returned_at = NOW(),
                returned_by = auth.uid(),
                returned_quantity = item_record.quantity
            WHERE id = item_record.id;
            
            -- Restore full inventory
            UPDATE public.products
            SET quantity = quantity + item_record.quantity
            WHERE id = item_record.product_id
              AND workspace_id = p_workspace_id;
        ELSE
            -- Partial return - update returned_quantity and reduce quantity
            UPDATE public.sale_items
            SET 
                quantity = quantity - p_return_quantities[v_index],
                total_price = total_price - (p_return_quantities[v_index] * (item_record.total_price / item_record.quantity)),
                returned_quantity = returned_quantity + p_return_quantities[v_index],
                return_reason = CASE 
                    WHEN returned_quantity = 0 THEN p_return_reason
                    ELSE COALESCE(return_reason, '') || ', ' || p_return_reason
                END,
                returned_at = CASE 
                    WHEN returned_quantity = 0 THEN NOW()
                    ELSE COALESCE(returned_at, NOW())
                END,
                returned_by = CASE 
                    WHEN returned_quantity = 0 THEN auth.uid()
                    ELSE COALESCE(returned_by, auth.uid())
                END
            WHERE id = item_record.id;
            
            -- Update the sale total amount
            UPDATE public.sales
            SET total_amount = total_amount - (p_return_quantities[v_index] * COALESCE(item_record.converted_unit_price, item_record.unit_price))
            WHERE id = item_record.sale_id;
            
            -- Restore inventory for returned quantity
            UPDATE public.products
            SET quantity = quantity + p_return_quantities[v_index]
            WHERE id = item_record.product_id
              AND workspace_id = p_workspace_id;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'message', 'Items returned successfully');
END;
$$;
