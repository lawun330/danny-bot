"""currency, language, nickname, and sheet replacement."""

from telegram import Message

from bot import db, states
from bot.handlers.common import (
    cancel_to_menu,
    clean_currency,
    clear_flow,
    is_back,
    is_cancel,
    lang_of,
    send_menu,
)
from bot.handlers.onboarding import begin_sheet_question
from bot.i18n import t
from bot.keyboards import (
    back_cancel,
    is_label,
    language_code,
    language_menu,
    main_menu,
    settings_action,
    settings_menu,
    yes_no,
)


async def begin_settings(message: Message, context, user: dict) -> None:
    clear_flow(context)
    context.user_data["state"] = states.AWAIT_SETTINGS_MENU
    await message.reply_text(
        t(lang_of(user), "settings.title"),
        reply_markup=settings_menu(lang_of(user)),
    )


async def begin_sheet_confirm(message: Message, context, user: dict) -> None:
    clear_flow(context)
    context.user_data["state"] = states.AWAIT_SHEET_CONFIRM
    await message.reply_text(
        t(lang_of(user), "settings.confirm_sheet"),
        reply_markup=yes_no(lang_of(user)),
    )


async def handle_settings_text(message: Message, context, user: dict) -> None:
    state = context.user_data.get("state")
    lang = lang_of(user)
    text = message.text or ""

    if is_cancel(lang, text):
        await cancel_to_menu(message, context, user)
        return

    if state == states.AWAIT_SETTINGS_MENU:
        if is_back(lang, text):
            clear_flow(context)
            await send_menu(message, user)
            return
        action = settings_action(lang, text)
        if action == "currency":
            context.user_data["state"] = states.AWAIT_CURRENCY
            await message.reply_text(
                t(lang, "settings.ask_currency"),
                reply_markup=back_cancel(lang),
            )
            return
        if action == "language":
            context.user_data["state"] = states.AWAIT_LANGUAGE
            await message.reply_text(
                t(lang, "settings.pick_language"),
                reply_markup=language_menu(lang),
            )
            return
        if action == "nickname":
            context.user_data["state"] = states.AWAIT_SETTINGS_NICKNAME
            await message.reply_text(
                t(lang, "settings.ask_nickname"),
                reply_markup=back_cancel(lang),
            )
            return
        if action == "sheet":
            await begin_sheet_confirm(message, context, user)
            return
        await begin_settings(message, context, user)
        return

    if is_back(lang, text):
        await begin_settings(message, context, user)
        return

    if state == states.AWAIT_CURRENCY:
        currency = clean_currency(text)
        if not currency:
            await message.reply_text(
                t(lang, "errors.bad_currency"),
                reply_markup=back_cancel(lang),
            )
            return
        user = db.update_user(user["telegram_id"], currency=currency)
        clear_flow(context)
        await message.reply_text(
            t(lang, "settings.currency_saved", currency=currency),
            reply_markup=main_menu(lang),
        )
        return

    if state == states.AWAIT_LANGUAGE:
        code = language_code(text)
        if code is None:
            await message.reply_text(
                t(lang, "settings.pick_language"),
                reply_markup=language_menu(lang),
            )
            return
        user = db.update_user(user["telegram_id"], language=code)
        clear_flow(context)
        await message.reply_text(
            t(code, "settings.language_saved"),
            reply_markup=main_menu(code),
        )
        return

    if state == states.AWAIT_SHEET_CONFIRM:
        if is_label(lang, "common.yes", text):
            await begin_sheet_question(message, context, user, replace=True)
            return
        if is_label(lang, "common.no", text):
            clear_flow(context)
            await message.reply_text(
                t(lang, "settings.sheet_kept"),
                reply_markup=main_menu(lang),
            )
            return
        await begin_sheet_confirm(message, context, user)
