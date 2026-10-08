---
name: Locales income month picker
overview: Sync English locale wording into Burmese, German, and Japanese; add an income amount confirmation step; replace the instant month report with a year-navigable month picker that lists months newest-first.
todos:
  - id: sync-locales
    content: Sync en wording into my/de/ja and add income.confirm_amount plus month-picker strings
    status: completed
  - id: income-confirm
    content: Add AWAIT_INCOME_CONFIRM and confirm step in entry flow
    status: completed
  - id: month-picker
    content: Replace direct month report with year-navigable newest-first month selector
    status: completed
isProject: false
---

# Locales, income confirm, month picker

## Sync locale wording

Copy the updated English meaning into [`locales/de.json`](locales/de.json), [`locales/ja.json`](locales/ja.json), and [`locales/my.json`](locales/my.json). Keys stay the same; only the strings change to match [`locales/en.json`](locales/en.json):

- Menu: Add Income / Add Outcome, Today Expenses, Monthly Expenses, Total Balance, Delete Rows
- Income/outcome: description prompts, unit amount, total amount
- Settings: Change Currency / Language / Name / Google Sheet, updated save and sheet-kept lines
- Delete name: description prompt
- Add `income.confirm_amount` in all four files (same pattern as outcome)
- Add month-picker strings: `list.pick_month` (show year), `list.month_title` stays for the result header, month names `list.months` as a 12-item list (Jan…Dec), and year nav labels `common.prev_year` / `common.next_year` (keep calendar month prev/next as they are)

## Income amount confirmation

Same UX as outcome confirm: after a valid amount, show `income.confirm_amount` with Confirm + Back/Cancel. Confirm saves; typing another positive number saves that instead.

- Add `AWAIT_INCOME_CONFIRM` in [`bot/states.py`](bot/states.py)
- In [`bot/handlers/entry.py`](bot/handlers/entry.py): store amount as `suggested`, enter confirm state; Confirm uses suggested; Back from confirm returns to ask amount and clears suggested
- Register the new state in [`bot/handlers/router.py`](bot/handlers/router.py)

## Monthly Expenses picker

Today still lists today only. Monthly Expenses no longer jumps straight to the current month.

```mermaid
flowchart TD
  menu[Monthly Expenses] --> picker[Show year with 12-or-fewer month buttons]
  picker -->|"<" or ">"| yearShift[Shift year by 1 redraw]
  picker -->|tap YYYY-MM| listRows[List that month then main menu]
  picker -->|Back or Cancel| mainMenu[Main menu]
```

- New state `AWAIT_MONTH_PICK` and reply keyboard in [`bot/keyboards.py`](bot/keyboards.py): `[prev_year] [next_year]`, then one button per month as `YYYY-MM`, then Back/Cancel
- Month order newest first: for the current year, from the current month down to January; for any other year, December down to January
- Default year = current year in `Asia/Yangon`
- [`bot/handlers/reports.py`](bot/handlers/reports.py) + router: open picker on menu tap; year buttons redraw; month label loads that month’s rows (existing list logic); Back/Cancel return to main menu
- Wire through [`bot/handlers/router.py`](bot/handlers/router.py) like other flows

No new services; same reply-keyboard bot process.