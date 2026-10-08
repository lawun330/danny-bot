# danny-bot

Telegram ledger bot. Each person links their own Google Sheet. The bot adds a new tab and records income and outcome there.

## What it does

On `/start`, the bot asks for a Google Sheet URL once. It creates a tab named `Transactions` (or `Transactions 2` if that name exists) and does not change existing tabs. Then it asks what to call you.

The menu:

- **Income** — optional name (skip stores `Income`), then amount. Units and unit price stay blank.
- **Outcome** — optional name (skip stores `Outcome`), optional units, optional unit price. If both numbers are filled, the bot shows units × unit price and you can confirm or type another amount. If either is skipped, it asks for the amount.
- **Today** and **This month** — rows for the current day or month in the configured timezone.
- **Remaining balance** — all income minus all outcome.
- **Delete** — filter by date, or by name, then by income, outcome, or all. Pick rows, confirm, and those rows are removed so later rows move up.
- **Settings** — currency, language (English, Burmese, German, Japanese), the name the bot uses, and replacing the linked sheet. Replacing the sheet asks for confirmation and leaves the old spreadsheet unchanged.

`/menu` opens the menu. `/cancel` stops the current question.

## Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. In Google Cloud, create a service account, enable the Google Sheets API, and download the JSON key. Save it as `service-account.json` in this folder. Do not commit it.
3. Copy the environment file and fill it in:

```bash
cp .env.example .env
```

`TELEGRAM_BOT_TOKEN` is the BotFather token. `TIMEZONE` defaults to `Asia/Yangon`, which is what "today" and "this month" use. User settings (linked sheet id, nickname, language, currency) are stored in a local `bot.db` file next to the project. Transaction rows stay only in Google Sheets.

4. Activate the conda env, install, and run:

```bash
conda activate danny_bot_env
pip install -r requirements.txt
python -m bot.main
```

5. In Google Sheets, share the spreadsheet with the service account email (`client_email` in the key file) as **Editor**.
6. Open the bot, send `/start`, and paste the spreadsheet URL.

Chat text comes from `locales/en.json`, `locales/mm.json`, `locales/de.json`, and `locales/jp.json`. Sheet headers stay in English: Date, Time, Name, Type, Unit Amount, Units, Amount.

## Tests

```bash
python -m unittest discover -s tests -v
```

## Lint before commit

Ruff runs automatically on each commit via pre-commit:

```bash
conda activate danny_bot_env
pip install pre-commit ruff
pre-commit install
```

Manual check:

```bash
ruff check --fix bot tests
ruff format bot tests
```
