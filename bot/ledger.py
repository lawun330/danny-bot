"""pure ledger helpers. no telegram or google calls."""

import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation

_SPREADSHEET_ID = re.compile(r"/spreadsheets/d/([a-zA-Z0-9-_]+)")
_BARE_ID = re.compile(r"^[a-zA-Z0-9-_]{20,}$")


@dataclass(frozen=True)
class Entry:
    row_number: int
    date: str
    time: str
    name: str
    type: str
    unit_amount: Decimal | None
    units: Decimal | None
    amount: Decimal


def parse_spreadsheet_id(text: str) -> str | None:
    cleaned = text.strip()
    match = _SPREADSHEET_ID.search(cleaned)
    if match:
        return match.group(1)
    if _BARE_ID.match(cleaned):
        return cleaned
    return None


def default_name(tx_type: str) -> str:
    if tx_type == "income":
        return "Income"
    if tx_type == "outcome":
        return "Outcome"
    raise ValueError(tx_type)


def parse_positive_number(text: str) -> Decimal | None:
    cleaned = text.strip().replace(",", "")
    if not cleaned:
        return None
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        return None
    if not value.is_finite() or value <= 0:
        return None
    return value


def parse_decimal(text: str) -> Decimal | None:
    cleaned = text.strip().replace(",", "")
    if not cleaned:
        return None
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        return None
    if not value.is_finite():
        return None
    return value


def parse_iso_date(text: str) -> str | None:
    try:
        parsed = datetime.strptime(text.strip(), "%Y-%m-%d")
    except ValueError:
        return None
    return parsed.strftime("%Y-%m-%d")


def decimal_to_sheet(value: Decimal) -> str:
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def format_number(value: Decimal) -> str:
    if value == value.to_integral_value():
        return f"{int(value.to_integral_value()):,}"
    rendered = format(value, "f")
    whole, frac = rendered.split(".")
    frac = frac.rstrip("0")
    sign = ""
    if whole.startswith("-"):
        sign = "-"
        whole = whole[1:]
    return f"{sign}{int(whole):,}.{frac}"


def multiply(units: Decimal, unit_amount: Decimal) -> Decimal:
    return units * unit_amount


def filter_entries(
    entries: list[Entry],
    *,
    on_date: str | None = None,
    year_month: str | None = None,
    name: str | None = None,
    tx_type: str | None = None,
) -> list[Entry]:
    matched: list[Entry] = []
    name_key = name.casefold() if name is not None else None
    for entry in entries:
        if on_date is not None and entry.date != on_date:
            continue
        if year_month is not None and not entry.date.startswith(f"{year_month}-"):
            continue
        if name_key is not None and entry.name.casefold() != name_key:
            continue
        if tx_type is not None and entry.type != tx_type:
            continue
        matched.append(entry)
    return matched


def totals(entries: list[Entry]) -> dict[str, Decimal]:
    income = Decimal("0")
    outcome = Decimal("0")
    for entry in entries:
        if entry.type == "income":
            income += entry.amount
        elif entry.type == "outcome":
            outcome += entry.amount
    return {
        "income": income,
        "outcome": outcome,
        "remaining": income - outcome,
    }


def shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1
