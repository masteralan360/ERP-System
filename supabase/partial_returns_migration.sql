-- Add partial return tracking fields
-- Migration: Add Partial Returns Support

-- Add returned_quantity field to sale_items table
ALTER TABLE public.sale_items 
ADD COLUMN IF NOT EXISTS returned_quantity INTEGER DEFAULT 0;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_sale_items_returned_quantity ON public.sale_items(returned_quantity);
