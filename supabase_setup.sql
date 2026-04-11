-- Run this in your Supabase SQL Editor to prepare your cloud database

-- 1. Create Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT NOT NULL,
    local_id INTEGER,
    bill_no INTEGER,
    bill_date TEXT,
    customer_name TEXT,
    payment_mode TEXT,
    total_amount NUMERIC,
    items_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Products table (Mirror for mobile inventory view)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT NOT NULL,
    local_id INTEGER,
    name TEXT,
    price NUMERIC,
    cost_price NUMERIC,
    quantity INTEGER,
    expiry_date TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT NOT NULL,
    type TEXT, -- 'EXPIRY' or 'LOW_STOCK'
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Enable RLS (Optional - for production, you should set policies)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Note: Since we use the 'Anon' key for now, we create a public policy (for testing)
DROP POLICY IF EXISTS "Public Access" ON public.invoices;
CREATE POLICY "Public Access" ON public.invoices FOR ALL USING (true);
DROP POLICY IF EXISTS "Public Access" ON public.products;
CREATE POLICY "Public Access" ON public.products FOR ALL USING (true);
DROP POLICY IF EXISTS "Public Access" ON public.notifications;
CREATE POLICY "Public Access" ON public.notifications FOR ALL USING (true);
