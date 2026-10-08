"""today, month, and balance reports."""

import asyncio
import logging

from telegram import Message

from bot import sheets
from bot.handlers.common import (
    format_entry,
    lang_of,
    now_local,
    reply_sheet_error,
    split_text,
)
from bot.i18n import t
from bot.keyboards import main_menu
from bot.ledger import filter_entries, format_number, totals

logger = logging.getLogger(__name__)


async def show_today(message: Message, user: dict) -> None:
    today = now_local().strftime("%Y-%m-%d")
    entries = await _load(message, user)
    if entries is None:
        return
    matched = filter_entries(entries, on_date=today)
    title = t(lang_of(user), "list.today_title", date=today)
    await _send_list(message, user, title, matched)


async def show_month(message: Message, user: dict) -> None:
    month = now_local().strftime("%Y-%m")
    entries = await _load(message, user)
    if entries is None:
        return
    matched = filter_entries(entries, year_month=month)
    title = t(lang_of(user), "list.month_title", month=month)
    await _send_list(message, user, title, matched)


async def show_balance(message: Message, user: dict) -> None:
    lang = lang_of(user)
    entries = await _load(message, user)
    if entries is None:
        return
    if not entries:
        text = f"{t(lang, 'balance.title')}\n\n{t(lang, 'balance.empty')}"
    else:
        sums = totals(entries)
        currency = user["currency"]
        text = "\n".join(
            [
                t(lang, "balance.title"),
                t(lang, "balance.income", amount=format_number(sums["income"]), currency=currency),
                t(
                    lang,
                    "balance.outcome",
                    amount=format_number(sums["outcome"]),
                    currency=currency,
                ),
                t(
                    lang,
                    "balance.remaining",
                    amount=format_number(sums["remaining"]),
                    currency=currency,
                ),
            ]
        )
    await message.reply_text(text, reply_markup=main_menu(lang))


async def _load(message: Message, user: dict):
    lang = lang_of(user)
    try:
        return await asyncio.to_thread(
            sheets.list_entries,
            user["spreadsheet_id"],
            user["sheet_id"],
        )
    except sheets.SheetError as exc:
        await reply_sheet_error(message, lang, exc)
    except Exception:
        logger.exception("failed to read transactions")
        await message.reply_text(t(lang, "errors.generic"))
    return None


async def _send_list(message: Message, user: dict, title: str, entries) -> None:
    lang = lang_of(user)
    if not entries:
        await message.reply_text(
            f"{title}\n\n{t(lang, 'list.empty')}",
            reply_markup=main_menu(lang),
        )
        return
    blocks = [format_entry(entry, lang, user["currency"]) for entry in entries]
    parts = split_text(f"{title}\n\n" + "\n\n".join(blocks))
    last = len(parts) - 1
    for index, part in enumerate(parts):
        markup = main_menu(lang) if index == last else None
        await message.reply_text(part, reply_markup=markup)
