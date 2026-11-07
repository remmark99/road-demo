-- Optional contact details on public.profiles: full name and phone.
--
-- Both are nullable — a user may leave either blank. They are shown in the
-- navigation bar (ФИО instead of email) and attached to support requests so
-- the support team knows who to call back.
--
-- Safe to run repeatedly.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN public.profiles.full_name IS 'ФИО пользователя, опционально';
COMMENT ON COLUMN public.profiles.phone IS 'Контактный телефон пользователя, опционально';

-- Users read their own profile from the browser (module access, display name),
-- so the existing self-select policy already covers the new columns. Writes go
-- through /api/settings/profile with the service role key, which bypasses RLS.
