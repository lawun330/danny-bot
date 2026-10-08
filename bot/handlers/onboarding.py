"""sheet link and nickname questions."""

import asyncio
import logging

from telegram import Message

from bot import db, sheets, states
from bot.handlers.common import (
    clean_name,
    clear_flow,
    is_back,
    is_cancel,
    lang_of,
    reply_sheet_error,
    send_menu,
)
from bot.i18n import t
from bot.keyboards import back_cancel, cancel_only, main_menu
from bot.ledger import parse_spreadsheet_id

logger = logging.getLogger(__name__)


async def begin_sheet_question(
    message: Message,
    context,
    user: dict,
    *,
    replace: bool = False,
) -> None:
    keep_replace = replace or bool(context.user_data.get("sheet_replace"))
    clear_flow(context)
    context.user_data["state"] = states.AWAIT_SHEET_URL
    if keep_replace:
        context.user_data["sheet_replace"] = True
    lang = lang_of(user)
    email = sheets.service_account_email()
    if email:
        text = t(lang, "start.ask_sheet", email=email)
    else:
        text = t(lang, "start.ask_sheet_no_email")
    markup = back_cancel(lang) if keep_replace else cancel_only(lang)
    await message.reply_text(text, reply_markup=markup)


async def begin_nickname_question(message: Message, context, user: dict) -> None:
    clear_flow(context)
    context.user_data["state"] = states.AWAIT_NICKNAME
    await message.reply_text(
        t(lang_of(user), "start.ask_nickname"),
        reply_markup=back_cancel(lang_of(user)),
    )


async def handle_sheet_url(message: Message, context, user: dict) -> None:
    lang = lang_of(user)
    text = message.text or ""
    replace = bool(context.user_data.get("sheet_replace"))

    if is_cancel(lang, text):
        clear_flow(context)
        if db.is_ready(user):
            await message.reply_text(t(lang, "common.cancelled"), reply_markup=main_menu(lang))
            return
        await message.reply_text(t(lang, "common.cancelled"))
        await begin_sheet_question(message, context, user, replace=False)
        return

    if is_back(lang, text):
        if replace:
            from bot.handlers.settings import begin_sheet_confirm

            await begin_sheet_confirm(message, context, user)
            return
        await begin_sheet_question(message, context, user, replace=False)
        return

    spreadsheet_id = parse_spreadsheet_id(text)
    if not spreadsheet_id:
        markup = back_cancel(lang) if replace else cancel_only(lang)
        await message.reply_text(t(lang, "errors.bad_url"), reply_markup=markup)
        return
    try:
        linked_id, sheet_id, title = await asyncio.to_thread(sheets.link_new_tab, spreadsheet_id)
    except sheets.SheetError as exc:
        await reply_sheet_error(message, lang, exc)
        return
    except Exception:
        logger.exception("failed to link spreadsheet")
        await message.reply_text(t(lang, "errors.sheet_failed"))
        return
    user = db.update_user(
        user["telegram_id"],
        spreadsheet_id=linked_id,
        sheet_id=sheet_id,
        sheet_title=title,
    )
    await message.reply_text(t(lang, "start.sheet_saved", title=title))
    context.user_data.pop("sheet_replace", None)
    if not user.get("nickname"):
        await begin_nickname_question(message, context, user)
        return
    clear_flow(context)
    await send_menu(message, user)


async def handle_nickname(message: Message, context, user: dict, *, settings: bool) -> None:
    lang = lang_of(user)
    text = message.text or ""

    if is_cancel(lang, text):
        clear_flow(context)
        if db.is_ready(user) or (user.get("nickname") and db.has_sheet(user)):
            user = db.get_user(user["telegram_id"]) or user
            if db.is_ready(user):
                await message.reply_text(t(lang, "common.cancelled"), reply_markup=main_menu(lang))
                return
        await message.reply_text(t(lang, "common.cancelled"))
        if db.has_sheet(user) and not user.get("nickname"):
            await begin_nickname_question(message, context, user)
        return

    if is_back(lang, text):
        if settings:
            from bot.handlers.settings import begin_settings

            await begin_settings(message, context, user)
            return
        await begin_sheet_question(
            message,
            context,
            user,
            replace=bool(context.user_data.get("sheet_replace")),
        )
        return

    name = clean_name(text)
    if not name:
        await message.reply_text(
            t(lang, "errors.bad_name"),
            reply_markup=back_cancel(lang),
        )
        return
    user = db.update_user(user["telegram_id"], nickname=name)
    clear_flow(context)
    if settings:
        await message.reply_text(
            t(lang, "settings.nickname_saved", name=name),
            reply_markup=main_menu(lang),
        )
        return
    await send_menu(message, user)
