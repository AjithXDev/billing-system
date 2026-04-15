-- ═══════════════════════════════════════════════════════════════════
--  SUPABASE SETUP SCRIPT — SaaS Billing System
--  Purpose: Multi-shop data isolation, owner auth, device pairing
-- ═══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════
--  1. SHOPS TABLE (Desktop registers on first launch)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.shops (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_name TEXT NOT NULL,
    mobile_number TEXT NOT NULL,
    name TEXT DEFAULT 'My Shop',
    master_key TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shops_anon_all" ON public.shops;
CREATE POLICY "shops_anon_all" ON public.shops FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
--  2. PAIRING CODES TABLE (6-digit device pairing)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.pairing_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    code TEXT NOT NULL,               -- 6-digit code
    status TEXT DEFAULT 'pending',    -- pending | used | expired
    device_id TEXT,                   -- filled when used
    user_id UUID,                     -- filled when used (auth.users ref)
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pairing_codes_shop ON public.pairing_codes(shop_id);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_code ON public.pairing_codes(code);

ALTER TABLE public.pairing_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pairing_anon_all" ON public.pairing_codes;
CREATE POLICY "pairing_anon_all" ON public.pairing_codes FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
--  3. PAIRED DEVICES TABLE (Authorized devices)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.paired_devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id UUID,                     -- auth.users reference
    user_email TEXT,
    device_name TEXT DEFAULT 'Unknown Device',
    device_id TEXT NOT NULL,          -- unique per device
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
--  4. SHOP STATS TABLE (Cloud sync for mobile dashboard)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.shop_stats (
    shop_id UUID PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
    stats_json JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.shop_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stats_anon_all" ON public.shop_stats;
CREATE POLICY "stats_anon_all" ON public.shop_stats FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
--  5. INVOICES TABLE (Synced from desktop)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    local_id INTEGER,
    bill_no TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    total_amount NUMERIC,
    tax_amount NUMERIC,
    payment_mode TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_anon_all" ON public.invoices;
CREATE POLICY "invoices_anon_all" ON public.invoices FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
--  6. PRODUCTS TABLE (Synced from desktop)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    local_id INTEGER,
    name TEXT,
    category_name TEXT,
    price NUMERIC,
    quantity NUMERIC,
    unit TEXT,
    expiry_date TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_anon_all" ON public.products;
CREATE POLICY "products_anon_all" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════
--  7. NOTIFICATIONS TABLE
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
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
--  8. SOFTWARE LICENSES TABLE
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
--  9. REAL-TIME REPLICATION
-- ══════════════════════════════════════════════════════
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

ALTER PUBLICATION supabase_realtime ADD TABLE shops;
ALTER PUBLICATION supabase_realtime ADD TABLE pairing_codes;
ALTER PUBLICATION supabase_realtime ADD TABLE paired_devices;
ALTER PUBLICATION supabase_realtime ADD TABLE shop_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE software_licenses;

-- ══════════════════════════════════════════════════════
--  10. ADMINS TABLE (For Admin Panel Authentication)
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, -- We'll store hashed passwords
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage themselves" ON public.admins FOR ALL USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE admins;