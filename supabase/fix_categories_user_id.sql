-- Migration: Add user_id to categories table to fix sync issues

-- 1. Add user_id column to categories
-- We'll allow it to be NULL initially to avoid issues with existing data, 
-- but we'll try to populate it if possible.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Try to populate user_id from existing products in the same workspace
-- This is a best-effort to assign a creator to existing categories.
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT id, workspace_id FROM public.categories WHERE user_id IS NULL LOOP
        UPDATE public.categories
        SET user_id = (
            SELECT user_id 
            FROM public.products 
            WHERE workspace_id = rec.workspace_id 
            LIMIT 1
        )
        WHERE id = rec.id;
    END LOOP;
END $$;

-- 3. Set a default user_id for any remaining (e.g. from profiles)
-- Or just leave it as NULL for now if no products exist.
-- But the sync engine will provide it for NEW categories.

-- 4. Update the trigger (no changes needed as it's for updated_at)

-- 5. Add index for user_id
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);
