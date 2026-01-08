-- Fix: Allow product deletion by handling foreign key constraint on sale_items table
-- This script modifies the sale_items table to allow products to be deleted even if they have associated sales.
-- Note: Using ON DELETE CASCADE will remove the individual sale items when a product is deleted.
-- The overall sale total will remain in the 'sales' table, but the itemized list will be cleared for that product.

-- 1. Drop the existing foreign key constraint
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_product_id_fkey;

-- 2. Add the new foreign key constraint with ON DELETE CASCADE
ALTER TABLE public.sale_items
ADD CONSTRAINT sale_items_product_id_fkey
FOREIGN KEY (product_id)
REFERENCES public.products(id)
ON DELETE CASCADE;
