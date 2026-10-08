# Danny Bot as Cloudflare Worker

Production hosting for danny-bot on the Cloudflare Workers free tier (Telegram webhook + D1 + Google Sheets REST).

**Do not run `python -m bot.main` (polling) at the same time** as this Worker with the same bot token as Telegram allows only one update consumer.

## Prerequisites

- Cloudflare account
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (`npm i` in this folder installs it)
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- Google service account JSON with Sheets API enabled

## One-Time Setup

1. Install:

   ```bash
   cd worker
   npm install
   npx wrangler login
   ```

2. Create D1 and apply migrations:

   ```bash
   npx wrangler d1 create danny-bot
   ```

3. Copy the printed `database_id` into [wrangler.toml](wrangler.toml) > `database_id`.

   ```bash
   npx wrangler d1 migrations apply danny-bot --remote
   ```

4. Generate a long random string:

   ```bash
   openssl rand -hex 24
   ```

5. Set secrets (paste when prompted):

   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET       # the long random string
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON   # full JSON file contents
   ```

6. Optional timezone (default in [wrangler.toml](wrangler.toml) is Asia/Yangon):

   ```bash
   npx wrangler secret put TIMEZONE
   # or edit [vars] TIMEZONE in wrangler.toml
   ```

## Deployment

1. Deploy:

   ```bash
   npx wrangler deploy
   ```

   Note the Worker URL, e.g. `https://danny-bot.<subdomain>.workers.dev`.

2. Stop any local/Render polling process, then point Telegram at the Worker:

   ```bash
   curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
     -d "url=${WORKER_URL}/" \
     -d "secret_token=${WEBHOOK_SECRET}"

   curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
   ```

3. Open Telegram and send `/start`.
