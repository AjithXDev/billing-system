-- ═══════════════════════════════════════════════════════════════════
--  IVA SMART BILLING — v4 Registration Fix Migration
--  Run this in Supabase SQL Editor (baawqrqihlhsrghvjlpx)
--  Adds missing columns for: hardware ID, activation tracking, shop info
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add missing columns to shops table
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'My Shop';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS mobile_number TEXT DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS shop_email TEXT DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS hardware_id TEXT DEFAULT '';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS ever_activated BOOLEAN DEFAULT false;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS master_key TEXT DEFAULT 'owner123';

-- 2. Backfill ever_activated for existing active shops
UPDATE public.shops SET ever_activated = true WHERE is_active = true AND ever_activated = false;

-- 3. Ensure activation_requested column exists (should already exist)
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS activation_requested BOOLEAN DEFAULT false;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS last_request_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS request_notes TEXT;

-- 4. Add notifications table if missing
CREATE TABLE IF NOT EXISTS public.notifications (
    id BIGSERIAL PRIMARY KEY,
    shop_id TEXT REFERENCES public.shops(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'info',
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_all" ON public.notifications;
CREATE POLICY "notifications_all" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- 5. Reload schema cache
NOTIFY pgrst, 'reload schema';

SELECT 'Migration complete! All columns added.' as status;
