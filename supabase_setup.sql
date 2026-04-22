-- ═══════════════════════════════════════════════════════════════════
--  MAIN SUPABASE SCHEMA — iVA Control Plane (SaaS Control)
--  Purpose: Shop management, validity, auth, pairing, and global stats
-- ═══════════════════════════════════════════════════════════════════

-- 1. SHOPS TABLE (Control Switch)
CREATE TABLE IF NOT EXISTS public.shops (
    id TEXT PRIMARY KEY, -- Shop ID
    name TEXT DEFAULT 'My Shop',
    owner_name TEXT,
    owner_phone TEXT, -- For WhatsApp reminders
    owner_email TEXT,
    shop_email TEXT,
    mobile_number TEXT,
    gst_number TEXT,
    master_key TEXT DEFAULT 'owner123',
    
    -- SaaS Controls
    is_active BOOLEAN DEFAULT true,
    is_paid BOOLEAN DEFAULT true,
    validity_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    validity_end TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    
    -- Logic for Shop-Specific Supabase
    shop_supabase_url TEXT,
    shop_supabase_key TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS & Realtime
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read/Write Access" ON public.shops FOR ALL USING (true) WITH CHECK (true);

-- 2. SHOP STATS (JSON snapshots for mobile dashboard)
CREATE TABLE IF NOT EXISTS public.shop_stats (
    shop_id TEXT PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
    stats_json JSONB DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.shop_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stats Read/Write" ON public.shop_stats FOR ALL USING (true) WITH CHECK (true);

-- 3. PAIRING CODES (6-digit linking flow)
CREATE TABLE IF NOT EXISTS public.pairing_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    code TEXT NOT NULL, -- 6 digit code
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '10 minutes'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.pairing_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pairing Read/Write" ON public.pairing_codes FOR ALL USING (true) WITH CHECK (true);

-- 4. NOTIFICATIONS (Central alerts)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_id TEXT REFERENCES public.shops(id) ON DELETE CASCADE,
    type TEXT,
    title TEXT,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notifs Read/Write" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- 5. ADMINS (For your Admin Portal)
CREATE TABLE IF NOT EXISTS public.admins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. ENABLE REALTIME REPLICATION
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

ALTER PUBLICATION supabase_realtime ADD TABLE shops;
ALTER PUBLICATION supabase_realtime ADD TABLE pairing_codes;
ALTER PUBLICATION supabase_realtime ADD TABLE shop_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

NOTIFY pgrst, 'reload schema';
