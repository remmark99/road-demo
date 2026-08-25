# Вектор Города

Демо для администрации.

## Уведомления Email и MAX

1. Задеплойте приложение с переменными из `.env.example`. Используйте новый токен MAX; токен, попавший в чат или лог, предварительно отзовите.
2. Примените `sql/notifications_schema.sql` к Supabase после деплоя API-маршрутов. Эта миграция создаёт таблицы и функции, но ещё не включает рассылку.
3. В Supabase Vault создайте секреты:
   - `notification_dispatch_url`: `https://<домен>/api/internal/notifications/dispatch`;
   - `notification_dispatch_secret`: значение `NOTIFICATION_DISPATCH_SECRET`.
4. Зарегистрируйте HTTPS webhook MAX на `https://<домен>/api/webhooks/max` с событиями `bot_started` и `bot_stopped`; параметр `secret` должен совпадать с `MAX_WEBHOOK_SECRET`.
5. Проверьте тестовый email и привязку тестового пользователя MAX. Затем примените `sql/notifications_activate.sql`, выполните тестовый INSERT и проверьте обе доставки.

`notifications_activate.sql` включает триггеры и минутный резервный cron. Для аварийной остановки примените `sql/notifications_deactivate.sql`; preferences и очередь при этом сохраняются.

Пользователь может независимо выбрать типы событий для Email и MAX. `NULL` в `email_event_types`/`max_event_types` означает все типы, пустой массив — ни одного типа; изменение фильтра действует только на будущие и ещё не отправленные события.
