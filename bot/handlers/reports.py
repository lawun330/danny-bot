"""today, month, and balance reports."""

import asyncio
import logging
import re

from telegram import Message

from bot import sheets, states
from bot.handlers.common import (
    cancel_to_menu,
    clear_flow,
    format_entry,
    is_back,
    is_cancel,
    lang_of,
    now_local,
    reply_sheet_error,
    send_menu,
    split_text,
)
from bot.i18n import t
from bot.keyboards import is_label, main_menu, month_picker_keyboard
from bot.ledger import filter_entries, format_number, totals

logger = logging.getLogger(__name__)

_YEAR_MONTH = re.compile(r"^\d{4}-\d{2}$")


async def show_today(message: Message, user: dict) -> None:
    today = now_local().strftime("%Y-%m-%d")
    entries = await _load(message, user)
    if entries is None:
        return
    matched = filter_entries(entries, on_date=today)
    title = t(lang_of(user), "list.today_title", date=today)
    await _send_list(message, user, title, matched)


async def begin_month_picker(message: Message, context, user: dict) -> None:
    clear_flow(context)
    today = now_local()
    context.user_data["state"] = states.AWAIT_MONTH_PICK
    context.user_data["month_pick"] = {"year": today.year}
    await _show_month_picker(message, context, user)


async def handle_month_pick_text(message: Message, context, user: dict) -> None:
    lang = lang_of(user)
    text = message.text or ""
    pick = context.user_data.setdefault("month_pick", {"year": now_local().year})
    today = now_local()

    if is_cancel(lang, text) or is_back(lang, text):
        if is_cancel(lang, text):
            await cancel_to_menu(message, context, user)
        else:
            clear_flow(context)
            await send_menu(message, user)
        return

    if is_label(lang, "common.prev_year", text):
        pick["year"] = int(pick["year"]) - 1
        await _show_month_picker(message, context, user)
        return

    if is_label(lang, "common.next_year", text):
        next_year = int(pick["year"]) + 1
        if next_year > today.year:
            await _show_month_picker(message, context, user)
            return
        pick["year"] = next_year
        await _show_month_picker(message, context, user)
        return

    stamp = pick.get("button_map", {}).get(text)
    if stamp is None and _YEAR_MONTH.match(text):
        stamp = text
    if stamp is None:
        await _show_month_picker(message, context, user)
        return

    entries = await _load(message, user)
    if entries is None:
        return
    matched = filter_entries(entries, year_month=stamp)
    title = t(lang, "list.month_title", month=stamp)
    clear_flow(context)
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


async def _show_month_picker(message: Message, context, user: dict) -> None:
    lang = lang_of(user)
    today = now_local()
    pick = context.user_data["month_pick"]
    year = int(pick["year"])
    markup, button_map = month_picker_keyboard(lang, year, today.year, today.month)
    pick["button_map"] = button_map
    context.user_data["state"] = states.AWAIT_MONTH_PICK
    await message.reply_text(
        t(lang, "list.pick_month", year=year),
        reply_markup=markup,
    )


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
