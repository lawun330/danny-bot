"""delete rows by date, name, and type."""

import asyncio
import logging

from telegram import Message

from bot import sheets, states
from bot.handlers.common import (
    cancel_to_menu,
    clean_name,
    clear_flow,
    is_back,
    is_cancel,
    lang_of,
    now_local,
    reply_sheet_error,
    send_menu,
)
from bot.i18n import t
from bot.keyboards import (
    calendar_keyboard,
    idk_keyboard,
    is_label,
    main_menu,
    month_nav_targets,
    row_picker,
    type_keyboard,
    yes_no,
)
from bot.ledger import filter_entries, parse_iso_date

logger = logging.getLogger(__name__)


def _fresh_delete() -> dict:
    today = now_local()
    return {
        "date": None,
        "name": None,
        "use_name": False,
        "came_from_idk": False,
        "tx_type": None,
        "matches": [],
        "selected": [],
        "page": 0,
        "year": today.year,
        "month": today.month,
        "button_map": {},
        "delete_label": "",
    }


async def begin_delete(message: Message, context, user: dict) -> None:
    clear_flow(context)
    context.user_data["state"] = states.AWAIT_DELETE_DATE
    context.user_data["delete"] = _fresh_delete()
    await _ask_date(message, context, lang_of(user))


async def handle_delete_text(message: Message, context, user: dict) -> None:
    state = context.user_data.get("state")
    lang = lang_of(user)
    delete = context.user_data.get("delete")
    text = message.text or ""
    if delete is None:
        await begin_delete(message, context, user)
        return

    if is_cancel(lang, text):
        await cancel_to_menu(message, context, user)
        return

    if is_back(lang, text):
        await _handle_back(message, context, user, state, delete)
        return

    if state == states.AWAIT_DELETE_DATE:
        await _handle_date(message, context, user, delete, text)
        return

    if state == states.AWAIT_DELETE_NAME:
        if is_label(lang, "common.idk", text):
            delete["name"] = None
            delete["use_name"] = False
            await _ask_type(message, context, lang)
            return
        name = clean_name(text)
        if not name:
            await message.reply_text(
                t(lang, "errors.bad_name"),
                reply_markup=idk_keyboard(lang),
            )
            return
        delete["name"] = name
        delete["use_name"] = True
        await _ask_type(message, context, lang)
        return

    if state == states.AWAIT_DELETE_TYPE:
        if is_label(lang, "common.income_type", text):
            delete["tx_type"] = "income"
        elif is_label(lang, "common.outcome_type", text):
            delete["tx_type"] = "outcome"
        elif is_label(lang, "common.idk", text):
            delete["tx_type"] = None
        else:
            await message.reply_text(
                t(lang, "delete.ask_type"),
                reply_markup=type_keyboard(lang),
            )
            return
        await _query_and_show(message, context, user, delete)
        return

    if state == states.AWAIT_DELETE_PICK:
        await _handle_pick(message, context, user, delete, text)
        return

    if state == states.AWAIT_DELETE_CONFIRM:
        if is_label(lang, "common.yes", text):
            await _delete_selected(message, context, user, delete)
            return
        if is_label(lang, "common.no", text):
            context.user_data["state"] = states.AWAIT_DELETE_PICK
            await _show_picker(message, user, delete)
            return
        await message.reply_text(
            t(lang, "delete.confirm", count=len(delete["selected"])),
            reply_markup=yes_no(lang),
        )


async def _handle_back(message, context, user, state, delete) -> None:
    lang = lang_of(user)
    if state == states.AWAIT_DELETE_DATE:
        clear_flow(context)
        await send_menu(message, user)
        return
    if state == states.AWAIT_DELETE_NAME:
        delete["name"] = None
        delete["use_name"] = False
        delete["came_from_idk"] = False
        await _ask_date(message, context, lang)
        return
    if state == states.AWAIT_DELETE_TYPE:
        delete["tx_type"] = None
        if delete["came_from_idk"]:
            await _ask_name(message, context, lang)
        else:
            await _ask_date(message, context, lang)
        return
    if state == states.AWAIT_DELETE_PICK:
        delete["matches"] = []
        delete["selected"] = []
        delete["button_map"] = {}
        delete["page"] = 0
        await _ask_type(message, context, lang)
        return
    if state == states.AWAIT_DELETE_CONFIRM:
        context.user_data["state"] = states.AWAIT_DELETE_PICK
        await _show_picker(message, user, delete)


async def _handle_date(message, context, user, delete, text) -> None:
    lang = lang_of(user)
    if is_label(lang, "common.prev", text):
        prev_month, _ = month_nav_targets(delete["year"], delete["month"])
        delete["year"], delete["month"] = prev_month
        await _ask_date(message, context, lang)
        return
    if is_label(lang, "common.next", text):
        _, next_month = month_nav_targets(delete["year"], delete["month"])
        delete["year"], delete["month"] = next_month
        await _ask_date(message, context, lang)
        return
    if is_label(lang, "common.idk", text):
        delete["date"] = None
        delete["use_name"] = False
        delete["came_from_idk"] = True
        await _ask_name(message, context, lang)
        return
    parsed = parse_iso_date(text)
    if parsed is None:
        await message.reply_text(
            t(lang, "errors.bad_date"),
            reply_markup=calendar_keyboard(lang, delete["year"], delete["month"]),
        )
        return
    delete["date"] = parsed
    delete["use_name"] = False
    delete["came_from_idk"] = False
    await message.reply_text(t(lang, "delete.selected_date", date=parsed))
    await _ask_type(message, context, lang)


async def _handle_pick(message, context, user, delete, text) -> None:
    lang = lang_of(user)
    if text == delete.get("delete_label"):
        if not delete["selected"]:
            await message.reply_text(
                t(lang, "delete.none_selected"),
            )
            await _show_picker(message, user, delete)
            return
        context.user_data["state"] = states.AWAIT_DELETE_CONFIRM
        await message.reply_text(
            t(lang, "delete.confirm", count=len(delete["selected"])),
            reply_markup=yes_no(lang),
        )
        return
    if is_label(lang, "common.page_prev", text):
        delete["page"] = max(0, delete["page"] - 1)
        await _show_picker(message, user, delete)
        return
    if is_label(lang, "common.page_next", text):
        delete["page"] = delete["page"] + 1
        await _show_picker(message, user, delete)
        return
    row_number = delete.get("button_map", {}).get(text)
    if row_number is not None:
        selected = delete["selected"]
        if row_number in selected:
            selected.remove(row_number)
        else:
            selected.append(row_number)
        await _show_picker(message, user, delete)
        return
    await _show_picker(message, user, delete)


async def _ask_date(message: Message, context, lang: str) -> None:
    delete = context.user_data["delete"]
    context.user_data["state"] = states.AWAIT_DELETE_DATE
    month = f"{delete['year']:04d}-{delete['month']:02d}"
    await message.reply_text(
        t(lang, "delete.ask_date", month=month),
        reply_markup=calendar_keyboard(lang, delete["year"], delete["month"]),
    )


async def _ask_name(message: Message, context, lang: str) -> None:
    context.user_data["state"] = states.AWAIT_DELETE_NAME
    await message.reply_text(t(lang, "delete.ask_name"), reply_markup=idk_keyboard(lang))


async def _ask_type(message: Message, context, lang: str) -> None:
    context.user_data["state"] = states.AWAIT_DELETE_TYPE
    await message.reply_text(t(lang, "delete.ask_type"), reply_markup=type_keyboard(lang))


async def _query_and_show(message: Message, context, user: dict, delete: dict) -> None:
    lang = lang_of(user)
    try:
        entries = await asyncio.to_thread(
            sheets.list_entries,
            user["spreadsheet_id"],
            user["sheet_id"],
        )
    except sheets.SheetError as exc:
        await reply_sheet_error(message, lang, exc)
        return
    except Exception:
        logger.exception("failed to query rows for delete")
        await message.reply_text(t(lang, "errors.generic"), reply_markup=main_menu(lang))
        return
    matched = filter_entries(
        entries,
        on_date=delete["date"],
        name=delete["name"] if delete["use_name"] else None,
        tx_type=delete["tx_type"],
    )
    if not matched:
        clear_flow(context)
        await message.reply_text(t(lang, "errors.no_rows"), reply_markup=main_menu(lang))
        return
    delete["matches"] = matched
    delete["selected"] = []
    delete["page"] = 0
    context.user_data["state"] = states.AWAIT_DELETE_PICK
    await _show_picker(message, user, delete)


async def _show_picker(message: Message, user: dict, delete: dict) -> None:
    lang = lang_of(user)
    markup, page_label, page, button_map, delete_label = row_picker(
        lang, delete["matches"], delete["selected"], delete["page"]
    )
    delete["page"] = page
    delete["button_map"] = button_map
    delete["delete_label"] = delete_label
    await message.reply_text(
        t(lang, "delete.pick", page=page_label),
        reply_markup=markup,
    )


async def _delete_selected(message: Message, context, user: dict, delete: dict) -> None:
    lang = lang_of(user)
    selected = list(delete["selected"])
    stored = {entry.row_number: entry for entry in delete["matches"]}
    try:
        current = await asyncio.to_thread(
            sheets.list_entries,
            user["spreadsheet_id"],
            user["sheet_id"],
        )
    except sheets.SheetError as exc:
        await reply_sheet_error(message, lang, exc)
        return
    except Exception:
        logger.exception("failed to reload rows before delete")
        await message.reply_text(t(lang, "errors.generic"), reply_markup=main_menu(lang))
        return
    current_by_row = {entry.row_number: entry for entry in current}
    for row_number in selected:
        if stored.get(row_number) != current_by_row.get(row_number):
            clear_flow(context)
            await message.reply_text(
                t(lang, "errors.sheet_changed"),
                reply_markup=main_menu(lang),
            )
            return
    try:
        await asyncio.to_thread(
            sheets.delete_rows,
            user["spreadsheet_id"],
            user["sheet_id"],
            selected,
        )
    except sheets.SheetError as exc:
        await reply_sheet_error(message, lang, exc)
        return
    except Exception:
        logger.exception("failed to delete rows")
        await message.reply_text(t(lang, "errors.generic"), reply_markup=main_menu(lang))
        return
    clear_flow(context)
    await message.reply_text(
        t(lang, "delete.done", count=len(selected)),
        reply_markup=main_menu(lang),
    )
