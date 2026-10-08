# danny-bot Cloudflare Worker

Production hosting for danny-bot on the **Cloudflare Workers free tier** (Telegram webhook + D1 + Google Sheets REST).

Do **not** run `python -m bot.main` (polling) at the same time as this Worker with the same bot token — Telegram allows only one update consumer.

## Prerequisites

- Cloudflare account
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (`npm i` in this folder installs it)
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- Google service account JSON with Sheets API enabled

## One-time setup

```bash
cd worker
npm install
npx wrangler login
```

Create D1 and apply migrations:

```bash
npx wrangler d1 create danny-bot
```

Copy the printed `database_id` into [`wrangler.toml`](wrangler.toml) (`[[d1_databases]].database_id`).

```bash
npx wrangler d1 migrations apply danny-bot --remote
```

Set secrets (paste when prompted):

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any long random string
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON   # full JSON file contents
```

Optional timezone (default in `wrangler.toml` is `Asia/Yangon`):

```bash
npx wrangler secret put TIMEZONE
# or edit [vars] TIMEZONE in wrangler.toml
```

## Deploy

```bash
npx wrangler deploy
```

Note the Worker URL, e.g. `https://danny-bot.<subdomain>.workers.dev`.

Stop any local/Render polling process, then point Telegram at the Worker:

```bash
export BOT_TOKEN='...'
export WEBHOOK_SECRET='...'   # same value as TELEGRAM_WEBHOOK_SECRET
export WORKER_URL='https://danny-bot.<subdomain>.workers.dev'

curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${WORKER_URL}/" \
  -d "secret_token=${WEBHOOK_SECRET}"

curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

Open Telegram and send `/start`.

## Local Python bot

The [`../bot`](../bot) package remains for local polling/dev. For production, use this Worker only.

## Share spreadsheet

Share each Google spreadsheet with the service account `client_email` as **Editor** (same as before).
