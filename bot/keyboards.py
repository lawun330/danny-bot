"""reply keyboards. tap sends the button text as a chat message."""

from calendar import Calendar

from telegram import KeyboardButton, ReplyKeyboardMarkup

from bot.i18n import t, t_list
from bot.ledger import Entry, format_number, shift_month

PAGE_SIZE = 6
LANGUAGE_LABELS = {
    "English": "en",
    "မြန်မာ": "my",
    "Deutsch": "de",
    "日本語": "ja",
}


def _markup(rows: list[list[str]]) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[KeyboardButton(cell) for cell in row] for row in rows],
        resize_keyboard=True,
    )


def nav_row(lang: str, *, back: bool = True) -> list[str]:
    row: list[str] = []
    if back:
        row.append(t(lang, "common.back"))
    row.append(t(lang, "common.cancel"))
    return row


def main_menu(lang: str) -> ReplyKeyboardMarkup:
    return _markup(
        [
            [t(lang, "menu.income"), t(lang, "menu.outcome")],
            [t(lang, "menu.today"), t(lang, "menu.month")],
            [t(lang, "menu.balance")],
            [t(lang, "menu.delete"), t(lang, "menu.settings")],
        ]
    )


def settings_menu(lang: str) -> ReplyKeyboardMarkup:
    return _markup(
        [
            [t(lang, "settings.currency")],
            [t(lang, "settings.language")],
            [t(lang, "settings.nickname")],
            [t(lang, "settings.sheet")],
            nav_row(lang),
        ]
    )


def language_menu(lang: str) -> ReplyKeyboardMarkup:
    return _markup(
        [
            ["English"],
            ["မြန်မာ"],
            ["Deutsch"],
            ["日本語"],
            nav_row(lang),
        ]
    )


def cancel_only(lang: str) -> ReplyKeyboardMarkup:
    return _markup([nav_row(lang, back=False)])


def back_cancel(lang: str) -> ReplyKeyboardMarkup:
    return _markup([nav_row(lang)])


def skip_keyboard(lang: str) -> ReplyKeyboardMarkup:
    return _markup([[t(lang, "common.skip")], nav_row(lang)])


def not_applicable_keyboard(lang: str) -> ReplyKeyboardMarkup:
    return _markup([[t(lang, "common.not_applicable")], nav_row(lang)])


def confirm_amount_keyboard(lang: str) -> ReplyKeyboardMarkup:
    return _markup([[t(lang, "common.confirm")], nav_row(lang)])


def yes_no(lang: str) -> ReplyKeyboardMarkup:
    return _markup(
        [
            [t(lang, "common.yes"), t(lang, "common.no")],
            nav_row(lang),
        ]
    )


def type_keyboard(lang: str) -> ReplyKeyboardMarkup:
    return _markup(
        [
            [t(lang, "common.income_type"), t(lang, "common.outcome_type")],
            [t(lang, "common.idk")],
            nav_row(lang),
        ]
    )


def idk_keyboard(lang: str) -> ReplyKeyboardMarkup:
    return _markup([[t(lang, "common.idk")], nav_row(lang)])


def calendar_keyboard(lang: str, year: int, month: int) -> ReplyKeyboardMarkup:
    month_days = Calendar(firstweekday=0).monthdayscalendar(year, month)
    rows: list[list[str]] = [
        [t(lang, "common.prev"), t(lang, "common.next")],
    ]
    for week in month_days:
        row = []
        for day in week:
            if day == 0:
                continue
            row.append(f"{year:04d}-{month:02d}-{day:02d}")
            if len(row) == 3:
                rows.append(row)
                row = []
        if row:
            rows.append(row)
    rows.append([t(lang, "common.idk")])
    rows.append(nav_row(lang))
    return _markup(rows)


def month_nav_targets(year: int, month: int) -> tuple[tuple[int, int], tuple[int, int]]:
    return shift_month(year, month, -1), shift_month(year, month, 1)


def months_newest_first(year: int, current_year: int, current_month: int) -> list[int]:
    top = current_month if year == current_year else 12
    if year > current_year:
        return []
    return list(range(top, 0, -1))


def month_picker_keyboard(
    lang: str,
    year: int,
    current_year: int,
    current_month: int,
) -> tuple[ReplyKeyboardMarkup, dict[str, str]]:
    names = t_list(lang, "list.months")
    rows: list[list[str]] = [[t(lang, "common.prev_year"), t(lang, "common.next_year")]]
    button_map: dict[str, str] = {}
    for month in months_newest_first(year, current_year, current_month):
        stamp = f"{year:04d}-{month:02d}"
        name = names[month - 1] if month - 1 < len(names) else stamp
        label = f"{name} ({stamp})"
        button_map[label] = stamp
        rows.append([label])
    rows.append(nav_row(lang))
    return _markup(rows), button_map


def row_picker(
    lang: str,
    entries: list[Entry],
    selected: list[int],
    page: int,
) -> tuple[ReplyKeyboardMarkup, str, int, dict[str, int], str]:
    pages = max(1, (len(entries) + PAGE_SIZE - 1) // PAGE_SIZE)
    page = max(0, min(page, pages - 1))
    chunk = entries[page * PAGE_SIZE : (page + 1) * PAGE_SIZE]
    rows: list[list[str]] = []
    button_map: dict[str, int] = {}
    for entry in chunk:
        mark = "☑" if entry.row_number in selected else "☐"
        name = entry.name if len(entry.name) <= 16 else entry.name[:15] + "…"
        label = f"{mark} {entry.date[5:]} {entry.time} {name} {format_number(entry.amount)}"
        if len(label) > 64:
            label = label[:64]
        button_map[label] = entry.row_number
        rows.append([label])
    nav = []
    if page > 0:
        nav.append(t(lang, "common.page_prev"))
    if page + 1 < pages:
        nav.append(t(lang, "common.page_next"))
    if nav:
        rows.append(nav)
    delete_label = t(lang, "delete.button", count=len(selected))
    rows.append([delete_label])
    rows.append(nav_row(lang))
    page_label = t(lang, "delete.page", page=page + 1, pages=pages)
    return _markup(rows), page_label, page, button_map, delete_label


def is_label(lang: str, key: str, text: str) -> bool:
    return text == t(lang, key)


def menu_action(lang: str, text: str) -> str | None:
    mapping = {
        t(lang, "menu.income"): "income",
        t(lang, "menu.outcome"): "outcome",
        t(lang, "menu.today"): "today",
        t(lang, "menu.month"): "month",
        t(lang, "menu.balance"): "balance",
        t(lang, "menu.delete"): "delete",
        t(lang, "menu.settings"): "settings",
    }
    return mapping.get(text)


def settings_action(lang: str, text: str) -> str | None:
    mapping = {
        t(lang, "settings.currency"): "currency",
        t(lang, "settings.language"): "language",
        t(lang, "settings.nickname"): "nickname",
        t(lang, "settings.sheet"): "sheet",
    }
    return mapping.get(text)


def language_code(text: str) -> str | None:
    return LANGUAGE_LABELS.get(text)
