-- Рассылка сводного отчёта по расписанию («Настройки» → «Настройки сводного отчёта»).
--
-- У каждого пользователя одна строка: как часто, в каком формате и куда присылать отчёт.
-- Сайт читает и пишет её служебным ключом (app/api/settings/report-schedule),
-- планировщик в процессе сайта (instrumentation.ts) раз в минуту проверяет, кому пора.
-- Пока таблицы нет, сайт работает как раньше: расписание просто не сохраняется.

CREATE TABLE IF NOT EXISTS public.report_schedules (
    user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    frequency    TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly')),
    -- 1 — понедельник … 7 — воскресенье; для ежедневной рассылки не используется.
    weekday      SMALLINT NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 1 AND 7),
    -- Время отправки по Сургуту, «09:00».
    send_time    TEXT NOT NULL DEFAULT '09:00' CHECK (send_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    format       TEXT NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf', 'xlsx', 'docx')),
    to_email     BOOLEAN NOT NULL DEFAULT TRUE,
    email        TEXT CHECK (email IS NULL OR char_length(email) <= 320),
    to_max       BOOLEAN NOT NULL DEFAULT FALSE,
    -- Момент расписания, за который отчёт уже взят в работу: второй раз за него не отправляем.
    last_slot_at TIMESTAMPTZ,
    last_run_at  TIMESTAMPTZ,
    -- running | sent | partial | failed
    last_status  TEXT,
    last_message TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_schedules FROM anon, authenticated;
GRANT ALL ON public.report_schedules TO service_role;

-- PostgREST должен увидеть новую таблицу.
NOTIFY pgrst, 'reload schema';
