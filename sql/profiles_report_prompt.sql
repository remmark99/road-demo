-- «Запрос для отчёта» из настроек: пожелания пользователя к отчётам ИИ-ассистента.
--
-- Сайт читает и сохраняет его сам (app/api/settings/report-prompt), ассистент
-- подмешивает в инструкции, когда пользователь просит отчёт. Пока колонки нет,
-- сайт работает как раньше: запрос просто не сохраняется между визитами.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS report_prompt TEXT
    CHECK (report_prompt IS NULL OR char_length(report_prompt) <= 2000);

-- PostgREST должен увидеть новую колонку.
NOTIFY pgrst, 'reload schema';
