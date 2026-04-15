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

-- 4. Security Policies (Strict Row Level Security for Multi-Shop Data Isolation)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop insecure policies
DROP POLICY IF EXISTS "Allow All" ON public.invoices;
DROP POLICY IF EXISTS "Allow All" ON public.products;
DROP POLICY IF EXISTS "Allow All" ON public.notifications;

-- Create a table for authenticated users mapped to specific shops
CREATE TABLE IF NOT EXISTS public.shop_users (
    user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
    shop_id TEXT NOT NULL
);

-- Invoices Policy: Select/Insert/Update ONLY if the authenticated user's shop_id matches the invoice's shop_id
DROP POLICY IF EXISTS "Shop Isolation Invoices" ON public.invoices;
CREATE POLICY "Shop Isolation Invoices" ON public.invoices
    FOR ALL
    USING (shop_id = (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()));

-- Products Policy
DROP POLICY IF EXISTS "Shop Isolation Products" ON public.products;
CREATE POLICY "Shop Isolation Products" ON public.products
    FOR ALL
    USING (shop_id = (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()));

-- Notifications Policy
DROP POLICY IF EXISTS "Shop Isolation Notifications" ON public.notifications;
CREATE POLICY "Shop Isolation Notifications" ON public.notifications
    FOR ALL
    USING (shop_id = (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()));

-- 5. Real-time Replication (Required for Web/Mobile Apps)
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;
alter publication supabase_realtime add table invoices;
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table notifications;

-- 6. Software Licensing (Remote Activation System)
CREATE TABLE IF NOT EXISTS public.software_licenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    machine_id TEXT UNIQUE NOT NULL,
    shop_name TEXT,
    owner_details TEXT,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    activated_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.software_licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read for specific machine_id" ON public.software_licenses;
CREATE POLICY "Allow public read for specific machine_id" ON public.software_licenses
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anonymous insert for registration" ON public.software_licenses;
CREATE POLICY "Allow anonymous insert for registration" ON public.software_licenses
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow master update" ON public.software_licenses;
CREATE POLICY "Allow master update" ON public.software_licenses
    FOR UPDATE USING (true);

alter publication supabase_realtime add table software_licenses;