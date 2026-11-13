-- История диалогов ИИ-ассистента.
--
-- Диалог сохраняет сервер после каждого ответа (app/api/chat, onFinish потока)
-- от имени вошедшего пользователя. Каждый видит и меняет только свои диалоги:
-- это обеспечивает RLS, а не код сайта.
--
-- messages — сообщения окна чата (UIMessage) без выводов инструментов: модели
-- для продолжения нужен только текст, а выводы бывают большими.

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Новый диалог' CHECK (char_length(title) <= 200),
    messages JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(messages) = 'array' AND pg_column_size(messages) <= 2000000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_conversations_user_updated_idx
    ON public.assistant_conversations (user_id, updated_at DESC);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own assistant conversations" ON public.assistant_conversations;
CREATE POLICY "Own assistant conversations" ON public.assistant_conversations
    FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.assistant_conversations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_conversations TO authenticated;
GRANT ALL ON public.assistant_conversations TO service_role;

-- PostgREST должен увидеть новую таблицу.
NOTIFY pgrst, 'reload schema';
