-- Sales Reports Functions (Excluding Returned Items)
-- Functions to calculate revenue and performance metrics while excluding returned sales/items

-- Function to get net revenue (excluding returned sales)
CREATE OR REPLACE FUNCTION public.get_net_revenue(
    p_workspace_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    total_revenue NUMERIC,
    total_cost NUMERIC,
    net_profit NUMERIC,
    total_sales_count BIGINT,
    total_items_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Use current user's workspace if not provided
    IF p_workspace_id IS NULL THEN
        SELECT workspace_id INTO p_workspace_id 
        FROM public.profiles 
        WHERE id = auth.uid();
    END IF;

    RETURN QUERY
    SELECT 
        COALESCE(SUM(si.total_price), 0) as total_revenue,
        COALESCE(SUM(si.cost_price * si.quantity), 0) as total_cost,
        COALESCE(SUM(si.total_price - (si.cost_price * si.quantity)), 0) as net_profit,
        COUNT(DISTINCT s.id) as total_sales_count,
        SUM(si.quantity) as total_items_count
    FROM public.sales s
    INNER JOIN public.sale_items si ON s.id = si.sale_id
    WHERE s.workspace_id = p_workspace_id
      AND COALESCE(s.is_returned, FALSE) = FALSE
      AND COALESCE(si.is_returned, FALSE) = FALSE
      AND (p_start_date IS NULL OR s.created_at >= p_start_date)
      AND (p_end_date IS NULL OR s.created_at <= p_end_date);
END;
$$;

-- Function to get team performance (excluding returned sales)
CREATE OR REPLACE FUNCTION public.get_team_performance(
    p_workspace_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    cashier_id UUID,
    cashier_name TEXT,
    total_sales_count BIGINT,
    total_revenue NUMERIC,
    total_items_count BIGINT,
    average_sale_value NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Use current user's workspace if not provided
    IF p_workspace_id IS NULL THEN
        SELECT workspace_id INTO p_workspace_id 
        FROM public.profiles 
        WHERE id = auth.uid();
    END IF;

    RETURN QUERY
    SELECT 
        s.cashier_id,
        COALESCE(p.name, 'Unknown') as cashier_name,
        COUNT(DISTINCT s.id) as total_sales_count,
        COALESCE(SUM(si.total_price), 0) as total_revenue,
        SUM(si.quantity) as total_items_count,
        COALESCE(AVG(s.total_amount), 0) as average_sale_value
    FROM public.sales s
    INNER JOIN public.sale_items si ON s.id = si.sale_id
    LEFT JOIN public.profiles p ON s.cashier_id = p.id
    WHERE s.workspace_id = p_workspace_id
      AND COALESCE(s.is_returned, FALSE) = FALSE
      AND COALESCE(si.is_returned, FALSE) = FALSE
      AND (p_start_date IS NULL OR s.created_at >= p_start_date)
      AND (p_end_date IS NULL OR s.created_at <= p_end_date)
    GROUP BY s.cashier_id, p.name
    ORDER BY total_revenue DESC;
END;
$$;

-- Function to get top selling products (excluding returned items)
CREATE OR REPLACE FUNCTION public.get_top_products(
    p_workspace_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    product_sku TEXT,
    total_quantity_sold BIGINT,
    total_revenue NUMERIC,
    total_sales_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Use current user's workspace if not provided
    IF p_workspace_id IS NULL THEN
        SELECT workspace_id INTO p_workspace_id 
        FROM public.profiles 
        WHERE id = auth.uid();
    END IF;

    RETURN QUERY
    SELECT 
        pr.id as product_id,
        pr.name as product_name,
        pr.sku as product_sku,
        SUM(si.quantity) as total_quantity_sold,
        COALESCE(SUM(si.total_price), 0) as total_revenue,
        COUNT(DISTINCT si.sale_id) as total_sales_count
    FROM public.sale_items si
    INNER JOIN public.sales s ON si.sale_id = s.id
    INNER JOIN public.products pr ON si.product_id = pr.id
    WHERE s.workspace_id = p_workspace_id
      AND COALESCE(s.is_returned, FALSE) = FALSE
      AND COALESCE(si.is_returned, FALSE) = FALSE
      AND (p_start_date IS NULL OR s.created_at >= p_start_date)
      AND (p_end_date IS NULL OR s.created_at <= p_end_date)
    GROUP BY pr.id, pr.name, pr.sku
    ORDER BY total_quantity_sold DESC
    LIMIT p_limit;
END;
$$;

-- Function to get sales summary for dashboard (excluding returned items)
CREATE OR REPLACE FUNCTION public.get_sales_summary(
    p_workspace_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    -- Use current user's workspace if not provided
    IF p_workspace_id IS NULL THEN
        SELECT workspace_id INTO p_workspace_id 
        FROM public.profiles 
        WHERE id = auth.uid();
    END IF;

    SELECT jsonb_build_object(
        'totalRevenue', COALESCE(SUM(CASE WHEN COALESCE(s.is_returned, FALSE) = FALSE AND COALESCE(si.is_returned, FALSE) = FALSE THEN si.total_price ELSE 0 END), 0),
        'totalCost', COALESCE(SUM(CASE WHEN COALESCE(s.is_returned, FALSE) = FALSE AND COALESCE(si.is_returned, FALSE) = FALSE THEN si.cost_price * si.quantity ELSE 0 END), 0),
        'netProfit', COALESCE(SUM(CASE WHEN COALESCE(s.is_returned, FALSE) = FALSE AND COALESCE(si.is_returned, FALSE) = FALSE THEN si.total_price - (si.cost_price * si.quantity) ELSE 0 END), 0),
        'totalSales', COUNT(DISTINCT CASE WHEN COALESCE(s.is_returned, FALSE) = FALSE THEN s.id END),
        'totalItems', SUM(CASE WHEN COALESCE(s.is_returned, FALSE) = FALSE AND COALESCE(si.is_returned, FALSE) = FALSE THEN si.quantity ELSE 0 END),
        'averageSaleValue', COALESCE(AVG(CASE WHEN COALESCE(s.is_returned, FALSE) = FALSE THEN s.total_amount END), 0),
        'returnedSales', COUNT(DISTINCT CASE WHEN s.is_returned = TRUE THEN s.id END),
        'returnedItems', SUM(CASE WHEN si.is_returned = TRUE THEN si.quantity ELSE 0 END)
    ) INTO result
    FROM public.sales s
    INNER JOIN public.sale_items si ON s.id = si.sale_id
    WHERE s.workspace_id = p_workspace_id
      AND (p_start_date IS NULL OR s.created_at >= p_start_date)
      AND (p_end_date IS NULL OR s.created_at <= p_end_date);

    RETURN result;
END;
$$;
