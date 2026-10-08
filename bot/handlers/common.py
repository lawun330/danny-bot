"""shared replies, dates, and sheet error text."""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from telegram import Message

from bot import config, db, sheets
from bot.i18n import t
from bot.keyboards import is_label, main_menu
from bot.ledger import Entry, format_number

logger = logging.getLogger(__name__)

LANGS = {"en", "my", "de", "ja"}


def lang_of(user: dict | None) -> str:
    if not user:
        return "en"
    code = user.get("language") or "en"
    return code if code in LANGS else "en"


def clear_flow(context) -> None:
    context.user_data.clear()


def now_local() -> datetime:
    return datetime.now(ZoneInfo(config.TIMEZONE))


def clean_name(text: str) -> str | None:
    name = " ".join(text.split())
    if not name or len(name) > 100:
        return None
    return name


def clean_currency(text: str) -> str | None:
    currency = " ".join(text.split())
    if not currency or len(currency) > 16:
        return None
    return currency


async def send_menu(message: Message, user: dict) -> None:
    lang = lang_of(user)
    await message.reply_text(
        t(lang, "start.ready", name=user["nickname"]),
        reply_markup=main_menu(lang),
    )


async def require_ready(message: Message, user: dict) -> bool:
    if db.is_ready(user):
        return True
    await message.reply_text(t(lang_of(user), "errors.need_setup"))
    return False


async def cancel_to_menu(message: Message, context, user: dict) -> None:
    clear_flow(context)
    lang = lang_of(user)
    if db.is_ready(user):
        await message.reply_text(t(lang, "common.cancelled"), reply_markup=main_menu(lang))
        return
    await message.reply_text(t(lang, "common.cancelled"))


def is_cancel(lang: str, text: str) -> bool:
    return is_label(lang, "common.cancel", text)


def is_back(lang: str, text: str) -> bool:
    return is_label(lang, "common.back", text)


async def reply_sheet_error(message: Message, lang: str, exc: Exception) -> None:
    email = sheets.service_account_email() or "the service account"
    if isinstance(exc, sheets.SheetNotShared):
        text = t(lang, "errors.not_shared", email=email)
    elif isinstance(exc, sheets.SheetTabMissing):
        text = t(lang, "errors.tab_missing")
    elif isinstance(exc, sheets.CredentialsMissing):
        text = t(lang, "errors.no_credentials")
    elif isinstance(exc, sheets.BadSheetUrl):
        text = t(lang, "errors.bad_url")
    else:
        logger.error("sheet operation failed", exc_info=exc)
        text = t(lang, "errors.generic")
    await message.reply_text(text)


def format_entry(entry: Entry, lang: str, currency: str) -> str:
    if entry.type == "income":
        type_label = t(lang, "common.income_type")
    elif entry.type == "outcome":
        type_label = t(lang, "common.outcome_type")
    else:
        type_label = entry.type
    amount = format_number(entry.amount)
    if entry.units is not None and entry.unit_amount is not None:
        detail = t(
            lang,
            "list.detail_units",
            units=format_number(entry.units),
            price=format_number(entry.unit_amount),
            currency=currency,
            amount=amount,
        )
    else:
        detail = t(lang, "list.detail_amount", amount=amount, currency=currency)
    return t(
        lang,
        "list.line",
        date=entry.date,
        time=entry.time,
        name=entry.name,
        type=type_label,
        detail=detail,
    )


def split_text(text: str, limit: int = 3900) -> list[str]:
    if len(text) <= limit:
        return [text]
    parts: list[str] = []
    current = ""
    for block in text.split("\n\n"):
        candidate = block if not current else f"{current}\n\n{block}"
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            parts.append(current)
        if len(block) <= limit:
            current = block
            continue
        for start in range(0, len(block), limit):
            parts.append(block[start : start + limit])
        current = ""
    if current:
        parts.append(current)
    return parts
