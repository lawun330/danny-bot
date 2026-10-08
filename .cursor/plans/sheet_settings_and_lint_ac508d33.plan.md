---
name: Sheet settings and lint
overview: Drop the SQLite path setting, switch every button to a reply keyboard that sends text, add Back and Cancel on every question step, confirm the chosen delete date, and run Ruff before each commit. Same bot process. No new service.
todos:
  - id: drop-sqlite-path
    content: Remove SQLITE_PATH and always use project bot.db
    status: completed
  - id: reply-keyboards
    content: Replace inline keyboards with reply keyboards that send the button text
    status: completed
  - id: cancel-and-date
    content: Add Back and Cancel on every question step, and show the selected date
    status: completed
  - id: ruff-hook
    content: Add Ruff config, pre-commit hook, and format the current Python files
    status: completed
isProject: false
---

# Sheet settings, cancel, and Ruff

## SQLite path

The ledger is already only the Google Sheet. [`bot/db.py`](bot/db.py) does not store transactions. It remembers which Telegram user linked which spreadsheet, plus nickname, language, and currency, so a restart can reopen that sheet.

Remove `SQLITE_PATH` from [`.env.example`](.env.example), [`.env`](.env), [`README.md`](README.md), and [`bot/config.py`](bot/config.py). `sqlite_path()` always returns `bot.db` next to the project. The file stays gitignored. No database setting to fill in.

## Reply keyboards

Replace `InlineKeyboardMarkup` in [`bot/keyboards.py`](bot/keyboards.py) with `ReplyKeyboardMarkup` (`resize_keyboard=True`). A tap replaces the phone keyboard and sends the button label as a normal chat message. [`bot/handlers/router.py`](bot/handlers/router.py) reads that text in `on_text`. No `callback_data`. Drop `CallbackQueryHandler` once nothing inline remains.

Same process: `python -m bot.main`. `python-telegram-bot` already includes reply keyboards. No second bot, no extra package, no extra service.

Match labels in the user's current language. Main menu stays up after each result. Question steps swap in that step's keys (Back, Cancel, Skip, Not applicable, Confirm, Yes, No, Income, Outcome, I don't know, language names, settings items).

Calendar days send `YYYY-MM-DD`. Previous and next month send the translated labels and the bot redraws the month. Weekday names are not buttons.

Delete rows: each match is a reply button (date, time, name, amount). A tap toggles it. The bot sends the keyboard again with a check mark on selected rows. Delete and Cancel are buttons on that keyboard. Labels are stored against row numbers in `user_data` so two similar rows still map to the right sheet row.

## Cancel during entry and delete

`/cancel` already aborts any question. Add a **Cancel** reply button on every step:

- Income and outcome: name, amount, units, unit price, and amount confirmation in [`bot/handlers/entry.py`](bot/handlers/entry.py)
- Delete: calendar, name, type, row picker, and the final yes/no step in [`bot/handlers/delete_flow.py`](bot/handlers/delete_flow.py)

The button text, in the active language, hits `on_text`, clears the question, and shows the main menu. Nothing is written or deleted. Remaining balance, today, and this month are one result each, not a question sequence, so they only show the main menu.

## Back on every step

Add a **Back** reply button beside Cancel on every question step. The label is a new locale key, `common.back`, distinct from month **Previous** in all four languages (German **Zurück** must not be reused for both). A tap sends that word. `on_text` treats it as Back, not as a name or amount. Already-saved sheet rows stay saved.

Back moves one step and drops the answer from the step being left:

- Income: amount to name. Name to the main menu.
- Outcome: amount confirmation to unit price, amount to unit price, unit price to units, units to name. Name to the main menu.
- Delete: yes/no back to the row picker (selection kept), picker back to type (selection cleared), type back to name when the date was "I don't know" otherwise back to the calendar, name back to the calendar. Calendar back to the main menu.
- Settings: currency, language, nickname, and sheet confirmation back to the settings list. Sheet URL back to the yes/no confirmation. Settings list back to the main menu.
- First-time setup: nickname back to the sheet URL question. The tab already created is left in place. The sheet URL question is the first step, so it has Cancel only, no Back.

## Selected date

After a calendar day or a typed `YYYY-MM-DD`, send one line before the income/outcome question, in all four locale files:

- English: `You selected {date}.`
- Burmese, German, and Japanese equivalents in [`locales/my.json`](locales/my.json), [`locales/de.json`](locales/de.json), and [`locales/ja.json`](locales/ja.json)

Choosing "I don't know" does not show that line.

## Ruff before each commit

Add [`pyproject.toml`](pyproject.toml) with Ruff's default lint rules and formatter, and [`.pre-commit-config.yaml`](.pre-commit-config.yaml) using the official `ruff-pre-commit` hooks: `ruff --fix`, then `ruff-format`. Install the hook into `.git/hooks` (this does not change git user config). Format the current Python files once so the hook is clean on the next commit.
