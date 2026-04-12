-- ═══ SUPABASE SETUP SCRIPT FOR SMART BILLING ═══
-- Purpose: Syncs Local SQLite data to Supabase for Mobile Dashboard Access.

-- 1. Create Invoices Table (Detailed for analytics)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT NOT NULL,
    local_id INTEGER,
    bill_no TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    total_amount NUMERIC,
    tax_amount NUMERIC,
    payment_mode TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Products Table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT NOT NULL,
    local_id INTEGER,
    name TEXT,
    category_name TEXT,
    price NUMERIC,
    quantity NUMERIC,
    unit TEXT,
    expiry_date TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Notifications (Alerts)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT NOT NULL,
    type TEXT, -- E.g., 'EXPIRY', 'LOW_STOCK', 'DEAD_STOCK'
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Security Policies (Bypass RLS for simplicity during setup)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow All" ON public.invoices;
CREATE POLICY "Allow All" ON public.invoices FOR ALL USING (true);
DROP POLICY IF EXISTS "Allow All" ON public.products;
CREATE POLICY "Allow All" ON public.products FOR ALL USING (true);
DROP POLICY IF EXISTS "Allow All" ON public.notifications;
CREATE POLICY "Allow All" ON public.notifications FOR ALL USING (true);

-- 5. Real-time Replication (Optional)
-- alter publication supabase_realtime add table invoices;
-- alter publication supabase_realtime add table products;