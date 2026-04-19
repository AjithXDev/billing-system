-- ═══════════════════════════════════════════════════════════════════
--  SUPABASE FULL SETUP — SaaS CONTROL PLANE (Main Database)
--  Purpose: Global shop management, Admin Auth, Validity enforcement
--  Location: YOUR MAIN SUPABASE PROJECT
-- ═══════════════════════════════════════════════════════════════════

-- 1. ADMINS TABLE (For Admin Dashboard Access)
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY DEFAULT auth.uid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, -- Note: In production use hashed passwords
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed Initial Admin
INSERT INTO public.admins (email, password_hash) 
VALUES ('admin@iva.com', 'admin123')
ON CONFLICT (email) DO NOTHING;

-- 2. SHOPS TABLE (The Master List)
CREATE TABLE IF NOT EXISTS public.shops (
    id TEXT PRIMARY KEY, -- "shop-XXXXXX"
    owner_name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    owner_phone TEXT NOT NULL,
    store_name TEXT NOT NULL,
    master_key TEXT NOT NULL, -- The 6-digit key for initial mobile login
    
    -- Software Control
    is_active BOOLEAN DEFAULT false, -- Set to TRUE by admin after verification
    software_status TEXT DEFAULT 'pending_activation', -- 'active', 'deactivated', 'expired'
    
    -- Subscription Tracking
    is_paid BOOLEAN DEFAULT false,
    validity_start TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    validity_end TIMESTAMP WITH TIME ZONE NOT NULL,
    payment_status TEXT DEFAULT 'unpaid', -- 'paid', 'unpaid', 'grace_period'
    
    -- SaaS Multi-Tenancy (Data Plane Connection)
    shop_supabase_url TEXT,
    shop_supabase_key TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_login TIMESTAMP WITH TIME ZONE
);

-- 3. SHOP STATS (Mirrored analytics for Mobile Dashboard)
CREATE TABLE IF NOT EXISTS public.shop_stats (
    shop_id TEXT PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
    stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. PAIRING CODES (Temporary 6-digit codes for mobile linking)
CREATE TABLE IF NOT EXISTS public.pairing_codes (
    id BIGSERIAL PRIMARY KEY,
    shop_id TEXT REFERENCES public.shops(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'pending' -- 'pending', 'used', 'expired'
);

-- ═══════════════════════════════════════════════════════════════════
--  SUPABASE FULL SETUP — SHOP DATA PLANE (Per-Shop Database)
--  Purpose: transactional data isolation
--  Location: INDIVIDUAL SHOP SUPABASE PROJECTS
-- ═══════════════════════════════════════════════════════════════════

/* 
-- RUN THIS IN EACH INDIVIDUAL SHOP PROJECT
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    price DECIMAL(12,2) NOT NULL,
    cost DECIMAL(12,2) DEFAULT 0,
    quantity INTEGER DEFAULT 0,
    unit TEXT DEFAULT 'pcs',
    barcode TEXT,
    expiry_date DATE,
    gst_rate DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE customers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT,
    phone TEXT UNIQUE NOT NULL,
    address TEXT,
    loyalty_points INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE invoices (
    id BIGSERIAL PRIMARY KEY,
    bill_no INTEGER NOT NULL,
    bill_date DATE DEFAULT CURRENT_DATE,
    customer_name TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    customer_id BIGINT REFERENCES customers(id),
    payment_mode TEXT DEFAULT 'Cash',
    total_amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE invoice_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT REFERENCES invoices(id) ON DELETE CASCADE,
    product_id BIGINT,
    quantity INTEGER NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    gst_rate DECIMAL(5,2) DEFAULT 0,
    gst_amount DECIMAL(12,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0
);

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    type TEXT, -- 'low_stock', 'expiry', 'system'
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
*/
