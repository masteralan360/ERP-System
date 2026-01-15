-- Add canBeReturned and returnRules fields to products table
-- This migration adds the new fields for product return functionality

ALTER TABLE public.products 
ADD COLUMN can_be_returned BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN return_rules TEXT;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_can_be_returned ON public.products(can_be_returned);
