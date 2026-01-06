-- Workspace System Setup

-- 1. Create workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Function to generate unique workspace code (e.g., ABCD-1234)
CREATE OR REPLACE FUNCTION generate_workspace_code() RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    new_code TEXT;
    is_unique BOOLEAN DEFAULT FALSE;
BEGIN
    WHILE NOT is_unique LOOP
        new_code := '';
        FOR i IN 1..4 LOOP
            new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
        END LOOP;
        new_code := new_code || '-';
        FOR i IN 1..4 LOOP
            new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
        END LOOP;
        
        SELECT NOT EXISTS (SELECT 1 FROM public.workspaces WHERE code = new_code) INTO is_unique;
    END LOOP;
    RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Set default code using the function
ALTER TABLE public.workspaces ALTER COLUMN code SET DEFAULT generate_workspace_code();

-- 3. Add workspace_id to all data tables
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);

-- 4. Security & RLS
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to view workspaces by code (needed for joining)
-- and allow them to insert (needed for creating a workspace on signup)
CREATE POLICY "Public view workspace" ON public.workspaces FOR SELECT USING (true);
CREATE POLICY "Public create workspace" ON public.workspaces FOR INSERT WITH CHECK (true);

-- 5. Helper Function for Signup
-- This function allows creating a workspace and returning its ID/Code in one go
CREATE OR REPLACE FUNCTION public.create_workspace(w_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_id UUID;
    new_code TEXT;
BEGIN
    INSERT INTO public.workspaces (name)
    VALUES (w_name)
    RETURNING id, code INTO new_id, new_code;
    
    RETURN jsonb_build_object('id', new_id, 'code', new_code);
END;
$$;
