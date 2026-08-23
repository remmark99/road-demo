# Развёртывание `road-demo` и `bus_stop_analytics` на новом сервере

Эта инструкция описывает последовательное развёртывание двух связанных проектов:

- `road-demo` — веб-интерфейс на Next.js;
- `bus_stop_analytics` — обработка видеопотоков, детекторы, Qwen verifier, Redis и MediaMTX в Docker Compose.

Инструкция рассчитана на новый сервер Ubuntu. Команды выполняются по очереди. Значения в угловых скобках, например `<ROAD_DEMO_DOMAIN>`, нужно заменить своими. Секреты в документ, Git, тикеты и общие чаты не вставлять.

## 1. Как компоненты связаны

```text
Пользователь
    |
    v
Nginx :443
    |
    +--> road-demo :3000 --> Supabase
    |
    +--> MediaMTX/HLS (если просмотр видео нужен из браузера)

Камеры/VMS
    |
    v
bus_stop_analytics:
ingestion --> Redis --> Stage1 --> Stage2/Qwen --> Supabase
                    \--> вспомогательные workers
```

Supabase является общей точкой данных: аналитика записывает туда события и изображения, а `road-demo` читает их и показывает пользователю. Поэтому сначала должна быть готова база, затем backend аналитики и frontend.

## 2. Что подготовить заранее

### 2.1. Зафиксировать версии кода

Для production нельзя разворачивать «последнее состояние ветки» без фиксации. Перед началом должны быть известны два проверенных commit SHA или два tag:

```text
ROAD_DEMO_REVISION=<полный commit SHA или tag>
BUS_STOP_ANALYTICS_REVISION=<полный commit SHA или tag>
```

Это нужно для воспроизводимого развёртывания и быстрого отката. Локальные незакоммиченные изменения на новый сервер не попадут.

### 2.2. Подготовить секреты и артефакты

Понадобятся:

- read-only deploy key или другой разрешённый способ клонирования обоих репозиториев;
- адрес Supabase;
- Supabase anon key для frontend;
- Supabase service-role key для server-side функций и аналитики;
- production-файл `cameras.yml` с адресами и учётными данными камер;
- действующий `license.key` для `bus_stop_analytics`;
- модели `yolov8m.pt`, `yolov8n-pose.pt` и custom-модель `best.pt`;
- `HF_TOKEN`, если он требуется для загрузки модели Qwen;
- доменное имя и TLS-сертификат для `road-demo`;
- при использовании почты, GigaChat, MCP или контроллера — их отдельные credentials.

Передавать эти файлы нужно через password manager, защищённое хранилище или `scp`/`rsync` по SSH. Не копировать значения в shell history.

### 2.3. Рекомендуемые ресурсы сервера

- Ubuntu 22.04 или 24.04 x86_64;
- NVIDIA GPU, доступная из Docker; CPU-only режим текущим Dockerfile не предусмотрен;
- ориентир — GPU с 16 GB VRAM или больше для текущей Qwen 4B и детекторов;
- 16 CPU cores, 64 GB RAM;
- не менее 150 GB SSD: Docker images, YOLO-модели и Hugging Face cache занимают заметный объём;
- стабильный доступ к RTSP-камерам/VMS и Supabase;
- корректная синхронизация системного времени.

Это ориентиры, а не универсальный sizing. Финальные ресурсы зависят от количества камер, FPS и одновременно включённых моделей.

## 3. Подготовить операционную систему

### 3.1. Обновить систему и установить базовые утилиты

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git nginx ffmpeg openssl
```

Зачем:

- `git` получает код;
- `nginx` завершает TLS и проксирует запросы к Next.js;
- `ffmpeg`/`ffprobe` помогают проверить RTSP-потоки;
- `ca-certificates` нужны для HTTPS-подключений.

Проверить время:

```bash
timedatectl status
```

Если синхронизация выключена:

```bash
sudo timedatectl set-ntp true
```

Точное время важно для timestamps кадров, cooldown и эпизодов событий. Сервер можно оставить в UTC.

### 3.2. Создать отдельного системного пользователя

```bash
sudo useradd --system --create-home --home-dir /opt/city --shell /bin/bash cityapp
sudo install -d -o cityapp -g cityapp /opt/city
sudo install -d -m 700 -o cityapp -g cityapp /opt/city/secrets
sudo install -d -m 700 -o cityapp -g cityapp /opt/city/secrets/models
```

Отдельный пользователь ограничивает влияние приложений на остальную систему. Не запускайте Node.js-процесс от `root`.

## 4. Установить Docker и NVIDIA runtime

Установить Docker Engine и Compose plugin по официальной инструкции для Ubuntu:

- [Docker Engine for Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Docker Compose plugin](https://docs.docker.com/compose/install/linux/)

После установки проверить:

```bash
sudo systemctl enable --now docker
docker --version
docker compose version
```

Разрешить `cityapp` работать с Docker:

```bash
sudo usermod -aG docker cityapp
```

После этого нужно завершить SSH-сессию и войти заново, чтобы применилось членство в группе. Пользователь из группы `docker` фактически имеет высокие права на сервере, поэтому добавлять туда посторонних нельзя.

Установить NVIDIA driver подходящей версии, затем NVIDIA Container Toolkit по официальной инструкции:

- [NVIDIA Container Toolkit installation guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)

После установки toolkit:

```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
nvidia-smi
```

Проверить доступ GPU из контейнера:

```bash
docker run --rm --gpus all nvidia/cuda:12.8.1-base-ubuntu22.04 nvidia-smi
```

Не продолжать запуск аналитики, пока эта команда не видит GPU.

## 5. Установить Node.js

`road-demo` использует Next.js 16. Для него нужен Node.js не ниже 20.9. Рекомендуется установить актуальный Node.js 20 LTS или более новую поддерживаемую LTS-версию через разрешённый системный или внутренний package repository.

Официальное требование Next.js: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation).

Проверить:

```bash
node --version
npm --version
command -v npm
```

Для systemd лучше системная установка Node.js, а не `nvm`: путь к `npm` должен быть стабильным и доступным без интерактивного shell.

## 6. Получить код

Команды выполнять от `cityapp` с настроенным deploy key:

```bash
sudo -iu cityapp
cd /opt/city
git clone git@github.com:remmark99/road-demo.git
git clone git@github.com:remmark99/bus_stop_analytics.git
```

Переключить каждый репозиторий на заранее утверждённую revision:

```bash
cd /opt/city/road-demo
git fetch --tags --prune
git checkout --detach <ROAD_DEMO_REVISION>
git rev-parse HEAD

cd /opt/city/bus_stop_analytics
git fetch --tags --prune
git checkout --detach <BUS_STOP_ANALYTICS_REVISION>
git rev-parse HEAD
```

Записать выведенные SHA в журнал развёртывания. Detached checkout здесь намеренный: сервер не должен сам двигаться вслед за веткой.

## 7. Подготовить Supabase

### Вариант A — использовать существующий Supabase

Это предпочтительный путь, если переносится только application server. Нужно проверить доступ нового сервера к существующему Supabase и сохранить существующие таблицы, Auth, RLS и Storage.

Ничего в базе автоматически не менять.

### Вариант B — новый Supabase

Нужно восстановить полный проверенный backup существующего проекта: PostgreSQL schema и данные, Auth-настройки, Storage buckets, policies и необходимые secrets.

SQL-файлы в `road-demo/sql` не являются полным bootstrap нового Supabase. Некоторые из них нельзя запускать вслепую:

- `cameras_schema.sql` содержит удаление таблицы и может уничтожить данные;
- `alerts_migration.sql` меняет существующую таблицу и RLS;
- `lying_person_episodes_migration.sql` — отдельная additive migration для новой функции эпизодов;
- `business_queries.sql` содержит запросы, а не миграцию схемы.

Перед любой миграцией нужны backup, проверка в staging и отдельное подтверждение. В этой инструкции миграции не выполняются.

### Проверить Supabase

Нужно убедиться, что:

- существуют используемые приложением таблицы и RPC;
- настроен Storage bucket `alert_images` или другое имя, совпадающее с backend `.env`;
- service-role key может записывать alerts, observations и изображения;
- anon/authenticated роли имеют только необходимые права чтения;
- в Supabase Auth указан новый Site URL и разрешены redirect URLs нового домена;
- CORS и Storage policies разрешают обращения с нового frontend origin.

Service-role key нельзя передавать браузеру или записывать в переменную с префиксом `NEXT_PUBLIC_`.

## 8. Развернуть `road-demo`

### 8.1. Создать production environment

Создать `/opt/city/road-demo/.env.production.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<SUPABASE_PROJECT>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>

# Опционально: SMTP
# SMTP_HOST=<SMTP_HOST>
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=<SMTP_USER>
# SMTP_PASS=<SMTP_PASSWORD>
# SMTP_FROM=<FROM_ADDRESS>

# Опционально: MCP/GigaChat. Заполнять только если функции включены.
# MCP_SERVER_URL=<MCP_URL>
# MCP_API_KEY=<MCP_API_KEY>
# GIGACHAT_CREDENTIALS=<GIGACHAT_CREDENTIALS>
# GIGACHAT_SCOPE=<GIGACHAT_SCOPE>
# GIGACHAT_MODEL=<MODEL>
# GIGACHAT_AUTH_URL=<AUTH_URL>
# GIGACHAT_API_BASE_URL=<API_URL>
# GIGACHAT_REQUEST_TIMEOUT_MS=120000
# GIGACHAT_PROXY_REQUIRED=false
# GIGACHAT_PROXY_URL=<PROXY_URL>
```

Ограничить доступ:

```bash
chmod 600 /opt/city/road-demo/.env.production.local
```

`NEXT_PUBLIC_*` значения встраиваются в frontend во время `npm run build`, поэтому файл должен быть готов до сборки. После смены этих значений frontend нужно пересобрать.

### 8.2. Установить зависимости и собрать

```bash
cd /opt/city/road-demo
npm ci
npm run lint
npm run build
```

Используется `npm ci`, потому что он устанавливает версии из lockfile и даёт более воспроизводимую сборку. Проверить весь вывод сборки: конфигурация проекта допускает пропуск части TypeScript-ошибок при Next.js build, поэтому успешный exit code не заменяет просмотр предупреждений.

### 8.3. Создать systemd unit

Сначала узнать абсолютный путь:

```bash
command -v npm
```

Создать от `root` файл `/etc/systemd/system/road-demo.service`. Если `npm` установлен не в `/usr/bin/npm`, заменить путь в `ExecStart`:

```ini
[Unit]
Description=Road Demo Next.js frontend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=cityapp
Group=cityapp
WorkingDirectory=/opt/city/road-demo
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Запустить:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now road-demo
sudo systemctl status road-demo --no-pager
curl -I http://127.0.0.1:3000/login
```

Посмотреть лог:

```bash
sudo journalctl -u road-demo -n 100 --no-pager
```

Привязка к `127.0.0.1` не даёт обходить Nginx и TLS прямым обращением к порту 3000.

## 9. Подготовить `bus_stop_analytics`

### 9.1. Передать секретные файлы

На рабочей машине безопасно передать файлы, не вставляя их содержимое в команду:

```bash
scp cameras.yml <SERVER>:/opt/city/secrets/cameras.yml
scp license.key <SERVER>:/opt/city/secrets/license.key
scp yolov8m.pt yolov8n-pose.pt best.pt <SERVER>:/opt/city/secrets/models/
```

На сервере:

```bash
sudo chown cityapp:cityapp /opt/city/secrets/cameras.yml /opt/city/secrets/license.key
sudo chown -R cityapp:cityapp /opt/city/secrets/models
sudo chmod 600 /opt/city/secrets/cameras.yml /opt/city/secrets/license.key
sudo chmod 600 /opt/city/secrets/models/*

sudo -iu cityapp
install -m 600 /opt/city/secrets/cameras.yml /opt/city/bus_stop_analytics/cameras.yml
install -m 600 /opt/city/secrets/license.key /opt/city/bus_stop_analytics/license.key
```

`cameras.yml` может содержать RTSP credentials. Его нельзя печатать командой `cat`, прикладывать к логам или коммитить.

### 9.2. Создать backend `.env`

Создать `/opt/city/bus_stop_analytics/.env`:

```dotenv
# Стабильное имя Docker Compose project и его volumes/network.
COMPOSE_PROJECT_NAME=bus-stop-analytics

# Сгенерировать длинный URL-safe пароль, например hex, и хранить только в secret storage.
REDIS_PASSWORD=<STRONG_URL_SAFE_PASSWORD>

LICENSE_FILE=/app/license.key
LICENSE_CHECK_ENABLED=true

SUPABASE_URL=https://<SUPABASE_PROJECT>.supabase.co
SUPABASE_KEY=<SUPABASE_SERVICE_ROLE_KEY>
SUPABASE_BUCKET=alert_images

HF_TOKEN=<HF_TOKEN_IF_REQUIRED>

YOLO_MODEL=/app/data/models/yolov8m.pt
POSE_WEIGHTS=/app/data/models/yolov8n-pose.pt
SMOKING_WEIGHTS=/app/data/models/best.pt
STAGE2_MODEL=Qwen/Qwen3-VL-4B-Instruct

# Multi-frame dogs verification
DOG_VERIFICATION_FRAME_COUNT=5
DOG_VERIFICATION_INTERVAL_SECONDS=1
DOG_VERIFICATION_SESSION_TIMEOUT_SECONDS=10
DOG_VERIFICATION_COOLDOWN_SECONDS=10
DOG_VERIFICATION_MAX_IMAGE_SIDE=640
DOG_VERIFICATION_JPEG_QUALITY=75

# Сначала оставить выключенным. См. отдельный раздел об episodes.
LYING_EPISODES_ENABLED=false
LYING_EPISODE_REDIS_URL=
LYING_HEARTBEAT_SECONDS=60
LYING_EPISODE_GAP_SECONDS=600
LYING_EPISODE_CLOSE_SCAN_SECONDS=30

# Jupyter в production не запускается, но не оставлять стандартный token.
JUPYTER_TOKEN=<RANDOM_UNUSED_TOKEN>

# Только если включается интеграция с контроллером.
# CONTROLLER_BASE=<CONTROLLER_URL>
# CONTROLLER_USER=<CONTROLLER_USER>
# CONTROLLER_PASSWORD=<CONTROLLER_PASSWORD>
```

Ограничить доступ:

```bash
chmod 600 /opt/city/bus_stop_analytics/.env
```

Почему `SUPABASE_KEY` здесь должен быть service-role: workers выполняют server-side запись alerts, RPC и Storage upload. Этот key не должен попадать в frontend.

### 9.3. Собрать Docker images

```bash
cd /opt/city/bus_stop_analytics
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml build
```

Первая сборка долгая: скачиваются CUDA/PyTorch dependencies. `config --quiet` заранее выявляет ошибки Compose и отсутствующие переменные.

### 9.4. Скопировать модели в named volume

Compose хранит модели в volume `app-data`, а не в Git checkout. Скопировать их:

```bash
cd /opt/city/bus_stop_analytics
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  run --rm --no-deps \
  -v /opt/city/secrets/models:/seed:ro \
  stage1-basic \
  sh -lc 'mkdir -p /app/data/models && cp -a /seed/. /app/data/models/'
```

Проверить только имена и размеры, не содержимое:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  run --rm --no-deps stage1-basic \
  sh -lc 'ls -lh /app/data/models'
```

При первом старте Stage2 Qwen может дополнительно скачиваться в Hugging Face cache внутри `app-data`. Нужно дождаться завершения и следить за свободным местом.

## 10. Проверить доступ к камерам

С хоста проверить один production RTSP URL:

```bash
ffprobe -v error -rtsp_transport tcp -show_streams '<RTSP_URL>'
```

URL вводить локально и не сохранять в общие логи. Если камера доступна только через VPN или закрытую сеть, сначала настроить route/VPN и убедиться, что доступ не зависит от интерактивной пользовательской сессии.

Проверяется именно сетевой путь нового сервера до камер. Без него контейнер ingestion запустится, но кадров не будет.

## 11. Запустить backend по этапам

Не выполнять простой `docker compose up -d` без списка сервисов: базовый Compose содержит Jupyter и отладочные компоненты, которые не следует публиковать в production.

Для удобства дальнейшие команды используют:

```bash
cd /opt/city/bus_stop_analytics
```

### 11.1. Запустить внутреннюю инфраструктуру

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  up -d redis mediamtx

docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml ps
```

Redis связывает pipeline через streams. MediaMTX отдаёт преобразованные видеопотоки для просмотра.

### 11.2. Запустить ingestion

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  up -d ingestion

docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  logs --tail=100 ingestion
```

В логах не должно быть постоянных RTSP reconnect/error. Дождаться поступления кадров до запуска моделей: так проще отделить сетевые ошибки от ML-ошибок.

### 11.3. Запустить основной ML pipeline

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  up -d stage1-basic stage1-pose stage2-verifier

docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  logs --tail=150 stage1-basic stage1-pose stage2-verifier
```

Проверить:

- все сервисы остаются в состоянии Up/healthy;
- CUDA видна и модели загрузились;
- Stage2 не падает из-за отсутствующей Qwen-модели или VRAM;
- появляются обрабатываемые frames/candidates;
- нет повторяющихся ошибок Supabase/Storage.

### 11.4. Включить вспомогательные workers только при необходимости

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  up -d bin-worker busyness
```

`glass-break-worker` запускать только после настройки и проверки `CONTROLLER_*`:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  up -d glass-break-worker
```

Не запускать в production без отдельной необходимости:

- `jupyter` — открывает интерактивную среду;
- `redis-commander` — отладочный UI Redis.

Если Redis Commander временно нужен администратору, оставлять bind на `127.0.0.1` и обращаться только через SSH tunnel.

## 12. Отдельно: эпизоды лежачих людей

Функция `lying_person_episodes` должна включаться только после трёх условий:

1. применена и проверена additive migration `lying_person_episodes_migration.sql`;
2. frontend и backend развёрнуты в совместимых revisions;
3. настроен отдельный persistent Redis и его URL записан в `LYING_EPISODE_REDIS_URL`.

Основной Redis текущего Compose запускается без AOF и snapshots. Он подходит для обычного transient pipeline, но не даёт требуемой надёжности confirmed observation stream при перезапуске. Поэтому до подготовки persistent Redis оставить:

```dotenv
LYING_EPISODES_ENABLED=false
LYING_EPISODE_REDIS_URL=
```

После отдельного preflight, backup базы и подтверждённой миграции:

```dotenv
LYING_EPISODES_ENABLED=true
LYING_EPISODE_REDIS_URL=rediss://<USER>:<PASSWORD>@<PERSISTENT_REDIS_HOST>:<PORT>/<DB>
```

Затем пересоздать затронутые сервисы и запустить aggregator:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  up -d --force-recreate stage1-pose stage2-verifier

docker compose --profile lying-episodes \
  -f docker-compose.yml -f docker-compose.gpu.server.yml \
  up -d lying-person-aggregator
```

Проверить логи aggregator и создание episode на тестовой камере. Не включать feature flag как часть первого общего запуска сервера.

## 13. Настроить Nginx и TLS

Создать `/etc/nginx/sites-available/road-demo`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <ROAD_DEMO_DOMAIN>;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
```

Включить сайт:

```bash
sudo ln -s /etc/nginx/sites-available/road-demo /etc/nginx/sites-enabled/road-demo
sudo nginx -t
sudo systemctl reload nginx
```

Установить TLS-сертификат принятым в организации способом или через ACME/Certbot. После этого HTTP должен перенаправляться на HTTPS. Справка по proxy-настройкам: [NGINX proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

### Доступ к MediaMTX

В текущем Compose могут публиковаться:

- `8083` — HLS;
- `8889` — WebRTC;
- `8554` — RTSP;
- `9997` — MediaMTX API.

Открывать наружу нужно только реально используемые браузером протоколы. RTSP и API оставить закрытыми или доступными только из доверенной сети. HLS URL в Supabase должен совпадать с тем адресом, который доступен браузеру пользователя.

Если MediaMTX проксируется отдельным hostname через Nginx, сначала проверить HLS paths, CORS и ссылки из базы. Не менять URL массово без проверки frontend.

## 14. Настроить firewall

Минимально:

- SSH `22` — только с административных адресов/VPN;
- HTTP/HTTPS `80/443` — для пользователей;
- HLS/WebRTC — только если нужны и только из разрешённых сетей;
- Redis `6379` — никогда не публиковать в Internet;
- Jupyter `8888` — не публиковать;
- Redis Commander `8081` — не публиковать;
- MediaMTX API `9997` и RTSP `8554` — закрыть, если нет отдельной необходимости.

Конкретные правила зависят от используемого firewall/облачной security group. До открытия портов проверить `ss -lntup` и фактические Docker port mappings.

## 15. Финальная проверка

### 15.1. Состояние сервисов

```bash
sudo systemctl status road-demo nginx docker --no-pager

cd /opt/city/bus_stop_analytics
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml ps
nvidia-smi
df -h
docker system df
```

### 15.2. Frontend

```bash
curl -I http://127.0.0.1:3000/login
curl -I https://<ROAD_DEMO_DOMAIN>/login
```

Затем вручную проверить:

- вход пользователя через Supabase Auth;
- список остановок и камер;
- страницу уведомлений;
- загрузку изображения alert;
- live/HLS video, если функция используется;
- отсутствие service-role key в browser network/source.

### 15.3. Analytics

На тестовой камере последовательно проверить:

- ingestion получает кадры без постоянных reconnect;
- обычное событие доходит до Stage2;
- положительное событие создаёт одну запись в Supabase;
- alert image открывается из Storage;
- событие отображается в `road-demo`;
- multi-frame dogs verification не создаёт alert при появлении человека в одном из пяти кадров;
- legacy smoking/abandoned/other enabled flows продолжают работать;
- при включённых lying episodes создаётся один episode/alert и observations продлевают его.

Проверять на staging/test camera. Не инициировать опасные ситуации ради теста.

### 15.4. Логи

```bash
sudo journalctl -u road-demo -n 200 --no-pager

cd /opt/city/bus_stop_analytics
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  logs --tail=200 ingestion stage1-basic stage1-pose stage2-verifier
```

Перед передачей логов удалить/замаскировать RTSP URLs, tokens и персональные данные.

## 16. Обновление системы

Обновление делать только на новую заранее проверенную revision.

### `road-demo`

```bash
cd /opt/city/road-demo
git fetch --tags --prune
git checkout --detach <NEW_APPROVED_REVISION>
npm ci
npm run lint
npm run build
sudo systemctl restart road-demo
curl -I http://127.0.0.1:3000/login
```

### `bus_stop_analytics`

```bash
cd /opt/city/bus_stop_analytics
git fetch --tags --prune
git checkout --detach <NEW_APPROVED_REVISION>
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml build
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  up -d redis mediamtx ingestion stage1-basic stage1-pose stage2-verifier
```

Опциональные workers обновить тем же явным списком. Не использовать слепой `git pull` и не запускать все Compose services без проверки.

## 17. Откат

До обновления сохранить предыдущие SHA и backup базы/Storage, если менялись данные.

### Откат frontend

```bash
cd /opt/city/road-demo
git checkout --detach <PREVIOUS_ROAD_DEMO_REVISION>
npm ci
npm run build
sudo systemctl restart road-demo
```

### Откат analytics

```bash
cd /opt/city/bus_stop_analytics
git checkout --detach <PREVIOUS_ANALYTICS_REVISION>
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml build
docker compose -f docker-compose.yml -f docker-compose.gpu.server.yml \
  up -d redis mediamtx ingestion stage1-basic stage1-pose stage2-verifier
```

Если проблема связана с lying episodes:

1. вернуть `LYING_EPISODES_ENABLED=false`;
2. пересоздать `stage1-pose` и `stage2-verifier`;
3. остановить `lying-person-aggregator`;
4. не удалять новые таблицы в аварийном порядке — additive schema не мешает legacy flows.

Rollback базы выполнять только по отдельному проверенному плану. Удаление таблиц — не штатный способ отката.

## 18. Резервное копирование и эксплуатация

Настроить:

- регулярные backup Supabase/PostgreSQL и проверку восстановления;
- backup нужных Storage buckets;
- защищённое хранение `.env`, `cameras.yml` и `license.key` вне сервера;
- мониторинг свободного диска, GPU memory, container restarts и ошибок камер;
- ротацию systemd/Docker logs;
- уведомления о недоступности камер, Supabase и persistent Redis;
- периодическую ротацию deploy keys и service credentials.

Docker volume `app-data` содержит модели и Hugging Face cache. Его потеря не должна уничтожить события, но приведёт к повторной загрузке моделей и простою. Данные событий должны оставаться в Supabase.

## 19. Короткий итоговый чек-лист

- [ ] Зафиксированы SHA обоих проектов.
- [ ] Новый сервер синхронизирует время.
- [ ] Docker Compose и NVIDIA runtime видят GPU.
- [ ] Установлен Node.js 20.9+.
- [ ] Репозитории checkout на утверждённые SHA.
- [ ] Supabase восстановлен или подтверждён без запуска опасных SQL.
- [ ] Auth redirects, RLS, Storage и CORS проверены.
- [ ] Секреты имеют права `600` и не находятся в Git.
- [ ] `road-demo` собран и работает через systemd на `127.0.0.1:3000`.
- [ ] Nginx и TLS работают на публичном домене.
- [ ] Backend images собраны, модели находятся в `app-data`.
- [ ] RTSP доступен с нового сервера.
- [ ] Сервисы запущены поэтапно; Jupyter/Redis Commander наружу не открыты.
- [ ] Redis и служебные MediaMTX-порты закрыты firewall.
- [ ] End-to-end alert появляется в Supabase и `road-demo`.
- [ ] Lying episodes оставлены выключенными до migration и persistent Redis.
- [ ] Записан и проверен план отката.

