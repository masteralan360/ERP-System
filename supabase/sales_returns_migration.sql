-- Add return fields to sales and sale_items tables
-- Migration: Add Sales Returns Functionality

-- Add return fields to sales table
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS is_returned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS return_reason TEXT,
ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS returned_by UUID REFERENCES auth.users(id);

-- Add return fields to sale_items table
ALTER TABLE public.sale_items 
ADD COLUMN IF NOT EXISTS is_returned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS return_reason TEXT,
ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS returned_by UUID REFERENCES auth.users(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_is_returned ON public.sales(is_returned);
CREATE INDEX IF NOT EXISTS idx_sale_items_is_returned ON public.sale_items(is_returned);
CREATE INDEX IF NOT EXISTS idx_sales_returned_by ON public.sales(returned_by);
CREATE INDEX IF NOT EXISTS idx_sale_items_returned_by ON public.sale_items(returned_by);
