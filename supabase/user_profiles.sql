-- User Profiles System for Workspace Members
-- This table mirrors auth.users metadata for easier querying and member list display

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    role TEXT,
    workspace_id UUID REFERENCES public.workspaces(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Policies
-- Users can view all profiles in their OWN workspace
CREATE POLICY "Users can view profiles in their workspace" ON public.profiles
    FOR SELECT USING (workspace_id = (auth.jwt() -> 'user_metadata' ->> 'workspace_id')::uuid);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- 4. Automatic Profile Creation Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, role, workspace_id)
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        new.raw_user_meta_data->>'role',
        (new.raw_user_meta_data->>'workspace_id')::uuid
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Backfill existing users (if any)
-- This is useful if the system already has users before this script is run
INSERT INTO public.profiles (id, name, role, workspace_id)
SELECT 
    id, 
    raw_user_meta_data->>'name', 
    raw_user_meta_data->>'role', 
    (raw_user_meta_data->>'workspace_id')::uuid
FROM auth.users
ON CONFLICT (id) DO NOTHING;
