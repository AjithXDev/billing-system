-- ═══════════════════════════════════════════════════════════════════
--  SUPABASE SETUP SCRIPT — SaaS Billing System
--  Purpose: Multi-shop data isolation, owner auth, device pairing
-- ═══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════
--  1. SHOPS TABLE
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.shops (
    id TEXT PRIMARY KEY DEFAULT ('shop-' || lower(substr(md5(random()::text), 1, 8))),
    owner_name TEXT,
    mobile_number TEXT,
    owner_email TEXT,
    name TEXT DEFAULT 'My Shop',
    master_key TEXT,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shops_anon_all" ON public.shops;
CREATE POLICY "shops_anon_all" ON public.shops FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
--  2. ADMINS TABLE (Moved up so we can insert later)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage themselves" ON public.admins;
CREATE POLICY "Admins can manage themselves" ON public.admins FOR ALL USING (true);

-- Insert Default Admin
INSERT INTO public.admins (email, password_hash) 
VALUES ('admin@iva.com', 'admin123')
ON CONFLICT (email) DO NOTHING;

-- ══════════════════════════════════════════════════════
--  3. PAIRING CODES TABLE
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.pairing_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    device_id TEXT,
    user_id UUID,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pairing_codes_shop ON public.pairing_codes(shop_id);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_code ON public.pairing_codes(code);

ALTER TABLE public.pairing_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pairing_anon_all" ON public.pairing_codes;
CREATE POLICY "pairing_anon_all" ON public.pairing_codes FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
--  4. PAIRED DEVICES TABLE
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.paired_devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id UUID,
    user_email TEXT,
    device_name TEXT DEFAULT 'Unknown Device',
    device_id TEXT NOT NULL,
    paired_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_paired_devices_shop ON public.paired_devices(shop_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_paired_devices_unique ON public.paired_devices(shop_id, device_id);

ALTER TABLE public.paired_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "devices_anon_all" ON public.paired_devices;
CREATE POLICY "devices_anon_all" ON public.paired_devices FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
--  5. SHOP STATS TABLE
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.shop_stats (
    shop_id TEXT PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
    stats_json JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.shop_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stats_anon_all" ON public.shop_stats;
CREATE POLICY "stats_anon_all" ON public.shop_stats FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
--  6. INVOICES TABLE
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    local_id INTEGER,
    bill_no TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    total_amount NUMERIC,
    tax_amount NUMERIC,
    payment_mode TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(shop_id, local_id)
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_anon_all" ON public.invoices;
CREATE POLICY "invoices_anon_all" ON public.invoices FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
--  7. PRODUCTS TABLE
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    local_id INTEGER,
    name TEXT,
    category_name TEXT,
    price NUMERIC,
    quantity NUMERIC,
    unit TEXT,
    barcode TEXT,
    expiry_date TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(shop_id, local_id)
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_anon_all" ON public.products;
CREATE POLICY "products_anon_all" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
--  8. NOTIFICATIONS TABLE
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    type TEXT,
    title TEXT,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifs_anon_all" ON public.notifications;
CREATE POLICY "notifs_anon_all" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
--  9. SOFTWARE LICENSES TABLE
-- ══════════════════════════════════════════════════════
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
DROP POLICY IF EXISTS "licenses_select" ON public.software_licenses;
CREATE POLICY "licenses_select" ON public.software_licenses FOR SELECT USING (true);
DROP POLICY IF EXISTS "licenses_insert" ON public.software_licenses;
CREATE POLICY "licenses_insert" ON public.software_licenses FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "licenses_update" ON public.software_licenses;
CREATE POLICY "licenses_update" ON public.software_licenses FOR UPDATE USING (true);

-- ══════════════════════════════════════════════════════
--  10. REAL-TIME REPLICATION
-- ══════════════════════════════════════════════════════
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

ALTER PUBLICATION supabase_realtime ADD TABLE shops;
ALTER PUBLICATION supabase_realtime ADD TABLE admins;
ALTER PUBLICATION supabase_realtime ADD TABLE pairing_codes;
ALTER PUBLICATION supabase_realtime ADD TABLE paired_devices;
ALTER PUBLICATION supabase_realtime ADD TABLE shop_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE software_licenses;

-- ══════════════════════════════════════════════════════
--  11. SCHEMA UPDATES (MIGRATION)
-- ══════════════════════════════════════════════════════

-- Shops Updates
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS owner_email TEXT;

-- Products Updates
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id INTEGER;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_type TEXT DEFAULT 'exclusive';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS default_discount NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Invoices Updates
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS bill_date TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_id INTEGER;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_address TEXT;
