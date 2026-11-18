-- Счётчик токенов и месячный лимит ИИ-ассистента.
--
-- assistant_usage — по строке на ответ ассистента: токены модели (вход и выход).
-- Пишет сервер от имени пользователя после ответа; читать все строки нельзя
-- никому, кроме service_role, — общий расход за месяц отдаёт функция
-- assistant_usage_month (только сумму токенов и число ответов).
--
-- assistant_settings — одна строка (id = 1): месячный лимит в токенах. Видят все
-- вошедшие (полоска расхода в окне чата), меняют только администраторы.

CREATE TABLE IF NOT EXISTS public.assistant_usage (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    conversation_id UUID,
    source TEXT NOT NULL DEFAULT 'chat' CHECK (source IN ('chat', 'report')),
    model TEXT CHECK (char_length(model) <= 200),
    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0)
);

CREATE INDEX IF NOT EXISTS assistant_usage_created_idx ON public.assistant_usage (created_at);

ALTER TABLE public.assistant_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Insert own assistant usage" ON public.assistant_usage;
CREATE POLICY "Insert own assistant usage" ON public.assistant_usage
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.assistant_usage FROM PUBLIC, anon, authenticated;
GRANT INSERT ON public.assistant_usage TO authenticated;
GRANT ALL ON public.assistant_usage TO service_role;

CREATE TABLE IF NOT EXISTS public.assistant_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    monthly_limit_tokens BIGINT NOT NULL DEFAULT 100000000 CHECK (monthly_limit_tokens >= 0 AND monthly_limit_tokens <= 10000000000),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.assistant_settings (id, monthly_limit_tokens) VALUES (1, 100000000) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.assistant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read assistant settings" ON public.assistant_settings;
CREATE POLICY "Read assistant settings" ON public.assistant_settings
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins change assistant settings" ON public.assistant_settings;
CREATE POLICY "Admins change assistant settings" ON public.assistant_settings
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'));

REVOKE ALL ON public.assistant_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.assistant_settings TO authenticated;
GRANT ALL ON public.assistant_settings TO service_role;

-- Общий расход за период: токены и число ответов, без строк пользователей.
CREATE OR REPLACE FUNCTION public.assistant_usage_month(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (tokens BIGINT, requests BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(input_tokens::BIGINT + output_tokens), 0)::BIGINT, COUNT(*)
    FROM public.assistant_usage
    WHERE created_at >= p_from AND created_at < p_to
$$;

REVOKE ALL ON FUNCTION public.assistant_usage_month(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assistant_usage_month(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
