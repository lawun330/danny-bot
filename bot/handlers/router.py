"""telegram command and text routing."""

import logging

from telegram import Update
from telegram.ext import ContextTypes

from bot import db, states
from bot.handlers.common import cancel_to_menu, clear_flow, lang_of, require_ready, send_menu
from bot.handlers.delete_flow import begin_delete, handle_delete_text
from bot.handlers.entry import begin_income, begin_outcome, handle_entry_text
from bot.handlers.onboarding import (
    begin_nickname_question,
    begin_sheet_question,
    handle_nickname,
    handle_sheet_url,
)
from bot.handlers.reports import (
    begin_month_picker,
    handle_month_pick_text,
    show_balance,
    show_today,
)
from bot.handlers.settings import begin_settings, handle_settings_text
from bot.i18n import t
from bot.keyboards import main_menu, menu_action

logger = logging.getLogger(__name__)

_ENTRY_STATES = {
    states.AWAIT_INCOME_NAME,
    states.AWAIT_INCOME_AMOUNT,
    states.AWAIT_INCOME_CONFIRM,
    states.AWAIT_OUTCOME_NAME,
    states.AWAIT_OUTCOME_UNITS,
    states.AWAIT_OUTCOME_PRICE,
    states.AWAIT_OUTCOME_AMOUNT,
    states.AWAIT_OUTCOME_CONFIRM,
}
_DELETE_STATES = {
    states.AWAIT_DELETE_DATE,
    states.AWAIT_DELETE_NAME,
    states.AWAIT_DELETE_TYPE,
    states.AWAIT_DELETE_PICK,
    states.AWAIT_DELETE_CONFIRM,
}
_SETTINGS_STATES = {
    states.AWAIT_SETTINGS_MENU,
    states.AWAIT_CURRENCY,
    states.AWAIT_LANGUAGE,
    states.AWAIT_SHEET_CONFIRM,
}


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    user = db.ensure_user(update.effective_user.id)
    if not db.has_sheet(user):
        await begin_sheet_question(message, context, user)
        return
    if not user.get("nickname"):
        await begin_nickname_question(message, context, user)
        return
    clear_flow(context)
    await send_menu(message, user)


async def menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    user = db.ensure_user(update.effective_user.id)
    if not await require_ready(message, user):
        return
    clear_flow(context)
    await send_menu(message, user)


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    user = db.ensure_user(update.effective_user.id)
    await cancel_to_menu(message, context, user)


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.effective_message
    user = db.ensure_user(update.effective_user.id)
    state = context.user_data.get("state")
    lang = lang_of(user)
    text = message.text or ""
    try:
        if state == states.AWAIT_SHEET_URL:
            await handle_sheet_url(message, context, user)
            return
        if state == states.AWAIT_NICKNAME:
            await handle_nickname(message, context, user, settings=False)
            return
        if state == states.AWAIT_SETTINGS_NICKNAME:
            await handle_nickname(message, context, user, settings=True)
            return
        if state in _SETTINGS_STATES:
            await handle_settings_text(message, context, user)
            return
        if state in _ENTRY_STATES:
            await handle_entry_text(message, context, user)
            return
        if state in _DELETE_STATES:
            await handle_delete_text(message, context, user)
            return
        if state == states.AWAIT_MONTH_PICK:
            await handle_month_pick_text(message, context, user)
            return
        if db.is_ready(user):
            action = menu_action(lang, text)
            if action:
                await _on_menu(message, context, user, action)
                return
            await send_menu(message, user)
            return
        await message.reply_text(t(lang, "errors.need_setup"))
    except Exception:
        logger.exception("text handler failed")
        markup = main_menu(lang) if db.is_ready(user) else None
        await message.reply_text(t(lang, "errors.generic"), reply_markup=markup)


async def _on_menu(message, context, user: dict, action: str) -> None:
    if not await require_ready(message, user):
        return
    if action == "income":
        await begin_income(message, context, user)
    elif action == "outcome":
        await begin_outcome(message, context, user)
    elif action == "today":
        clear_flow(context)
        await show_today(message, user)
    elif action == "month":
        await begin_month_picker(message, context, user)
    elif action == "balance":
        clear_flow(context)
        await show_balance(message, user)
    elif action == "delete":
        await begin_delete(message, context, user)
    elif action == "settings":
        await begin_settings(message, context, user)
