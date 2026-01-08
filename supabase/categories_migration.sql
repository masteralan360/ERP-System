-- Migration: Implement Dynamic Categories System

-- 1. Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- 2. Add uniqueness constraint on name per workspace (ignoring case)
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_name_workspace 
ON public.categories (workspace_id, LOWER(name)) 
WHERE (is_deleted IS FALSE);

-- 3. Add RLS to categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categories viewable by workspace members" ON public.categories;
CREATE POLICY "Categories viewable by workspace members"
ON public.categories FOR SELECT
USING (
    workspace_id IN (
        SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Categories manageable by admins and staff" ON public.categories;
CREATE POLICY "Categories manageable by admins and staff"
ON public.categories FOR ALL
USING (
    workspace_id IN (
        SELECT workspace_id FROM public.profiles 
        WHERE id = auth.uid() AND (role = 'admin' OR role = 'staff')
    )
);

-- 4. Update products table
-- Add category_id column
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

-- 5. Data Migration: Create categories from existing unique product category strings
DO $$
DECLARE
    rec RECORD;
    new_cat_id UUID;
BEGIN
    FOR rec IN 
        SELECT workspace_id, category, MIN(user_id) as user_id 
        FROM public.products 
        WHERE category IS NOT NULL AND category != '' AND category != 'Other'
        GROUP BY workspace_id, category
    LOOP
        -- Insert category if it doesn't exist
        INSERT INTO public.categories (workspace_id, name, user_id)
        VALUES (rec.workspace_id, rec.category, rec.user_id)
        ON CONFLICT (workspace_id, LOWER(name)) DO UPDATE SET updated_at = NOW()
        RETURNING id INTO new_cat_id;

        -- Update products to link to this category
        UPDATE public.products 
        SET category_id = new_cat_id 
        WHERE workspace_id = rec.workspace_id AND category = rec.category;
    END LOOP;
END $$;

-- 6. Clean up: Rename category column to category_legacy (optional, but safer than immediate drop)
-- ALTER TABLE public.products RENAME COLUMN category TO category_legacy;

-- 7. Triggers for updated_at
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_categories_workspace_id ON public.categories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
