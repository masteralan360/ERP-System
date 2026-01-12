-- Locked Workspace Feature Migration
-- Run this in your Supabase SQL Editor to enable workspace locking.

-- 1. Add locked_workspace column to workspaces
ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS locked_workspace BOOLEAN DEFAULT false;

-- 2. Update get_workspace_features RPC to return locked_workspace
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
    try_conversion_enabled BOOLEAN,
    locked_workspace BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    p_workspace_id UUID;
BEGIN
    -- Get current user's workspace
    SELECT workspace_id INTO p_workspace_id 
    FROM public.profiles 
    WHERE id = auth.uid();

    IF p_workspace_id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to a workspace';
    END IF;

    RETURN QUERY
    SELECT 
        w.allow_pos,
        w.allow_customers,
        w.allow_orders,
        w.allow_invoices,
        w.is_configured,
        w.default_currency,
        COALESCE(w.iqd_display_preference, 'integer')::TEXT,
        w.name as workspace_name,
        COALESCE(w.eur_conversion_enabled, false),
        COALESCE(w.try_conversion_enabled, false),
        COALESCE(w.locked_workspace, false)
    FROM public.workspaces w
    WHERE w.id = p_workspace_id;
END;
$$;

-- 3. Update existing admin feature update RPC to include locked_workspace
-- Note: Assuming the original RPC name and parameters based on Admin.tsx usage
DROP FUNCTION IF EXISTS public.admin_update_workspace_features(TEXT, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN);
CREATE OR REPLACE FUNCTION public.admin_update_workspace_features(
    provided_key TEXT,
    target_workspace_id UUID,
    new_allow_pos BOOLEAN,
    new_allow_customers BOOLEAN,
    new_allow_orders BOOLEAN,
    new_allow_invoices BOOLEAN,
    new_locked_workspace BOOLEAN DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify admin passkey
    IF NOT public.verify_admin_passkey(provided_key) THEN
        RAISE EXCEPTION 'Invalid admin passkey';
    END IF;

    UPDATE public.workspaces
    SET 
        allow_pos = new_allow_pos,
        allow_customers = new_allow_customers,
        allow_orders = new_allow_orders,
        allow_invoices = new_allow_invoices,
        locked_workspace = COALESCE(new_locked_workspace, locked_workspace)
    WHERE id = target_workspace_id;

    RETURN true;
END;
$$;
