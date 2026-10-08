"""google sheets access through a service account."""

import json
import logging
from datetime import datetime
from decimal import Decimal

import gspread
from gspread.exceptions import APIError, SpreadsheetNotFound, WorksheetNotFound

from bot import config
from bot.ledger import Entry, decimal_to_sheet, parse_decimal

logger = logging.getLogger(__name__)

HEADERS = ["Date", "Time", "Name", "Type", "Unit Amount", "Units", "Amount"]
_BASE_TITLE = "Transactions"


class SheetError(Exception):
    """base error for sheet operations the bot can explain."""


class BadSheetUrl(SheetError):
    """the text was not a spreadsheet url or id."""


class SheetNotShared(SheetError):
    """the service account cannot open the spreadsheet."""


class SheetTabMissing(SheetError):
    """the tab this bot created is no longer in the spreadsheet."""


class CredentialsMissing(SheetError):
    """the service account key file is missing or unreadable."""


def service_account_email() -> str | None:
    path = config.service_account_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    email = data.get("client_email")
    return email if isinstance(email, str) and email else None


def link_new_tab(spreadsheet_id: str) -> tuple[str, int, str]:
    spreadsheet = _open(spreadsheet_id)
    worksheet = _add_transactions_tab(spreadsheet)
    return spreadsheet_id, worksheet.id, worksheet.title


def entries_from_values(values: list[list[str]]) -> list[Entry]:
    entries: list[Entry] = []
    for offset, raw in enumerate(values[1:], start=2):
        if not any(cell.strip() for cell in raw):
            continue
        padded = list(raw) + [""] * (7 - len(raw))
        amount = parse_decimal(padded[6])
        entries.append(
            Entry(
                row_number=offset,
                date=padded[0].strip(),
                time=padded[1].strip(),
                name=padded[2].strip(),
                type=padded[3].strip().casefold(),
                unit_amount=parse_decimal(padded[4]),
                units=parse_decimal(padded[5]),
                amount=amount if amount is not None else Decimal("0"),
            )
        )
    return entries


def list_entries(spreadsheet_id: str, sheet_id: int) -> list[Entry]:
    worksheet = _worksheet(spreadsheet_id, sheet_id)
    return entries_from_values(worksheet.get_all_values())


def append_entry(
    spreadsheet_id: str,
    sheet_id: int,
    *,
    when: datetime,
    name: str,
    tx_type: str,
    unit_amount,
    units,
    amount,
) -> None:
    worksheet = _worksheet(spreadsheet_id, sheet_id)
    row = [
        when.strftime("%Y-%m-%d"),
        when.strftime("%H:%M"),
        name,
        tx_type,
        "" if unit_amount is None else decimal_to_sheet(unit_amount),
        "" if units is None else decimal_to_sheet(units),
        decimal_to_sheet(amount),
    ]
    worksheet.append_row(row, value_input_option="RAW")


def deletion_requests(sheet_id: int, row_numbers: list[int]) -> list[dict]:
    requests = []
    for row_number in sorted(set(row_numbers), reverse=True):
        requests.append(
            {
                "deleteDimension": {
                    "range": {
                        "sheetId": sheet_id,
                        "dimension": "ROWS",
                        "startIndex": row_number - 1,
                        "endIndex": row_number,
                    }
                }
            }
        )
    return requests


def delete_rows(spreadsheet_id: str, sheet_id: int, row_numbers: list[int]) -> None:
    if not row_numbers:
        return
    spreadsheet = _open(spreadsheet_id)
    spreadsheet.batch_update({"requests": deletion_requests(sheet_id, row_numbers)})


def _client() -> gspread.Client:
    path = config.service_account_path()
    if not path.is_file():
        raise CredentialsMissing()
    try:
        return gspread.service_account(filename=str(path))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise CredentialsMissing() from exc


def _open(spreadsheet_id: str):
    try:
        return _client().open_by_key(spreadsheet_id)
    except SpreadsheetNotFound as exc:
        raise SheetNotShared() from exc
    except PermissionError as exc:
        raise SheetNotShared() from exc
    except APIError as exc:
        if _is_access_error(exc):
            raise SheetNotShared() from exc
        raise SheetError(str(exc)) from exc


def _worksheet(spreadsheet_id: str, sheet_id: int):
    spreadsheet = _open(spreadsheet_id)
    try:
        return spreadsheet.get_worksheet_by_id(sheet_id)
    except WorksheetNotFound as exc:
        raise SheetTabMissing() from exc


def _add_transactions_tab(spreadsheet):
    titles = {worksheet.title for worksheet in spreadsheet.worksheets()}
    title = _BASE_TITLE
    suffix = 2
    while title in titles:
        title = f"{_BASE_TITLE} {suffix}"
        suffix += 1
    worksheet = spreadsheet.add_worksheet(title=title, rows=1000, cols=len(HEADERS))
    try:
        worksheet.update([HEADERS], "A1:G1", raw=True)
        worksheet.freeze(rows=1)
    except Exception:
        try:
            spreadsheet.del_worksheet(worksheet)
        except Exception:
            logger.exception("could not remove incomplete tab %s", title)
        raise
    return worksheet


def _is_access_error(exc: APIError) -> bool:
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    if status in (401, 403, 404):
        return True
    text = str(exc).lower()
    return "permission" in text or "not found" in text or "403" in text or "404" in text
