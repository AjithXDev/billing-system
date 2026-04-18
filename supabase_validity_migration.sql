-- ═══════════════════════════════════════════════════════════════════
--  SUPABASE MIGRATION — Validity / Subscription System
--  Run this in your ADMIN Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add validity columns to shops table
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS validity_start TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS validity_end TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS shop_supabase_url TEXT;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS shop_supabase_key TEXT;

-- 2. Set default validity for existing shops (30 days from now)
UPDATE public.shops 
SET validity_start = NOW(), 
    validity_end = NOW() + INTERVAL '30 days',
    is_paid = true
WHERE validity_start IS NULL;

-- 3. Function to auto-set validity on new shop registration
CREATE OR REPLACE FUNCTION set_shop_validity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.validity_start IS NULL THEN
        NEW.validity_start := NOW();
        NEW.validity_end := NOW() + INTERVAL '30 days';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_shop_validity ON public.shops;
CREATE TRIGGER trigger_shop_validity
    BEFORE INSERT ON public.shops
    FOR EACH ROW
    EXECUTE FUNCTION set_shop_validity();

-- 4. Function to renew validity (called by admin when toggling is_paid ON)
CREATE OR REPLACE FUNCTION renew_shop_validity(shop_id_input TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE public.shops 
    SET validity_start = NOW(),
        validity_end = NOW() + INTERVAL '30 days',
        is_paid = true,
        is_active = true
    WHERE id = shop_id_input;
END;
$$ LANGUAGE plpgsql;
