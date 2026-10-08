# danny-bot

<img align="left" src="profile/img/profile2.jpeg" width="250" height="250" alt="profile">
<br><br>
Hi! I'm Danny, the Money Monkey 🐵, your Telegram ledger bot.
<br><br>
Link your Google Sheet, and I'll handle the rest. I create a dedicated sheet to automatically log every income and expense for you. To get started, find me on Telegram at:
<br><br>

```
@danny_ledger_bot
```
<br clear="left">


## Commands

- `/start` — If no spreadsheet is linked yet, asks for the spreadsheet URL. Creates a sheet named **Transactions** (or **Transactions 2** if that name exists) and does not change existing sheets. Headers stay English: Date, Time, Name, Type, Unit Amount, Units, Amount. Then asks what to call you. Later `/start` skips spreadsheet setup if it is already linked.
- `/menu` — Opens the main menu.
- `/cancel` — Stops the current question and returns to the menu (when setup is done).

## Menu

- **Add Income** — optional description (Skip stores `Income`), then total amount, then confirm (or type a different amount). Unit amount and units stay blank.
- **Add Outcome** — optional description (Skip stores `Outcome`), optional units, optional unit amount. If both numbers are filled, the bot shows "units × unit amount" and you can confirm or type another amount. If either is skipped, it asks for the total amount.
- **Today Expenses** — rows for today in the configured timezone.
- **Monthly Expenses** — pick a year with Previous year / Next year, then a month (newest month at the top). Lists that month's rows.
- **Total Balance** — all income minus all outcome, plus the two totals.
- **Delete Rows** — filter by date; if "I don't know" → filter by description; if "I don't know" → no filter; then income / outcome / all. Multi-select rows, confirm, and those rows are removed so later rows move up.
- **Settings** — change currency, language (English, Burmese, German, Japanese), the name the bot uses, or the linked spreadsheet. Replacing the spreadsheet asks for confirmation and leaves the old spreadsheet unchanged.

## Hosting (recommended: Cloudflare Workers, free)

Production runs as a **Telegram webhook** Worker under [`worker/`](worker/). User settings live in Cloudflare **D1**; transactions stay in Google Sheets. See [`worker/README.md`](worker/README.md) for deploy, secrets, D1, and `setWebhook`.

Do **not** also run polling (`python -m bot.main` or a Render Background Worker) with the same bot token, or Telegram returns `409 Conflict`.

Render free Web Services are a poor fit (no HTTP port + sleep). Prefer the Worker for $0 always-on.

## Setup (local Python polling, optional)

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. In Google Cloud, create a service account, enable the Google Sheets API, and download the JSON key. Save it as `service-account.json` in this folder. Do not commit it.
3. Copy the environment file and fill it in:

    ```bash
    cp .env.example .env
    ```

    `TELEGRAM_BOT_TOKEN` is the BotFather token. `TIMEZONE` defaults to `Asia/Yangon`. User settings (nickname, language, currency, spreadsheet id, sheet id) live in local `bot.db` when using Python. Transaction rows stay only in the spreadsheet.

4. Activate the conda env, install, and run (**stop the Cloudflare webhook first** if the same token is deployed):

    ```bash
    conda activate danny_bot_env
    pip install -r requirements.txt
    python -m bot.main
    ```

5. In Google Sheets, share the spreadsheet with the service account email (`client_email` in the key file) as **Editor**.
6. Open the bot, send `/start`, and paste the spreadsheet URL.

## Tests

```bash
conda activate danny_bot_env
python -m unittest discover -s tests -v
```

## Lint

- Ruff runs on each commit via pre-commit:

    ```bash
    conda activate danny_bot_env
    pip install pre-commit ruff
    pre-commit install
    ```

- Manual check:

    ```bash
    ruff check --fix bot tests
    ruff format bot tests
    ```

## Note

- Question flows include **Back** and **Cancel**.
- Dates use `TIMEZONE`.
- Chat text comes from `locales/en.json`, `locales/mm.json`, `locales/de.json`, and `locales/jp.json`. Sheet headers stay in English.
- Convention:
    - Google Sheets spreadsheet, spreadsheet = the file;
    - sheet = a sheet inside it.
