"""income and outcome question flows."""

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
    back_cancel,
    confirm_amount_keyboard,
    is_label,
    main_menu,
    not_applicable_keyboard,
    skip_keyboard,
)
from bot.ledger import default_name, format_number, multiply, parse_positive_number

logger = logging.getLogger(__name__)


def _blank_draft(tx_type: str) -> dict:
    return {
        "type": tx_type,
        "name": None,
        "units": None,
        "unit_amount": None,
        "amount": None,
        "suggested": None,
    }


async def begin_income(message: Message, context, user: dict) -> None:
    clear_flow(context)
    context.user_data["state"] = states.AWAIT_INCOME_NAME
    context.user_data["draft"] = _blank_draft("income")
    await _ask_income_name(message, context, lang_of(user))


async def begin_outcome(message: Message, context, user: dict) -> None:
    clear_flow(context)
    context.user_data["state"] = states.AWAIT_OUTCOME_NAME
    context.user_data["draft"] = _blank_draft("outcome")
    await _ask_outcome_name(message, context, lang_of(user))


async def handle_entry_text(message: Message, context, user: dict) -> None:
    state = context.user_data.get("state")
    lang = lang_of(user)
    draft = context.user_data.setdefault("draft", _blank_draft("income"))
    text = message.text or ""

    if is_cancel(lang, text):
        await cancel_to_menu(message, context, user)
        return

    if is_back(lang, text):
        await _handle_back(message, context, user, state, draft)
        return

    if state in (states.AWAIT_INCOME_NAME, states.AWAIT_OUTCOME_NAME):
        if is_label(lang, "common.skip", text):
            draft["name"] = default_name(draft["type"])
        else:
            name = clean_name(text)
            if not name:
                await message.reply_text(
                    t(lang, "errors.bad_name"),
                    reply_markup=skip_keyboard(lang),
                )
                return
            draft["name"] = name
        if state == states.AWAIT_INCOME_NAME:
            await _ask_income_amount(message, context, lang)
        else:
            await _ask_units(message, context, lang)
        return

    if state == states.AWAIT_INCOME_AMOUNT:
        amount = parse_positive_number(text)
        if amount is None:
            await message.reply_text(
                t(lang, "errors.bad_number"),
                reply_markup=back_cancel(lang),
            )
            return
        draft["amount"] = amount
        await _save(message, context, user, draft)
        return

    if state == states.AWAIT_OUTCOME_UNITS:
        if is_label(lang, "common.not_applicable", text):
            draft["units"] = None
            await _ask_price(message, context, lang)
            return
        units = parse_positive_number(text)
        if units is None:
            await message.reply_text(
                t(lang, "errors.bad_number"),
                reply_markup=not_applicable_keyboard(lang),
            )
            return
        draft["units"] = units
        await _ask_price(message, context, lang)
        return

    if state == states.AWAIT_OUTCOME_PRICE:
        if is_label(lang, "common.not_applicable", text):
            draft["unit_amount"] = None
            await _ask_outcome_amount(message, context, lang)
            return
        price = parse_positive_number(text)
        if price is None:
            await message.reply_text(
                t(lang, "errors.bad_number"),
                reply_markup=not_applicable_keyboard(lang),
            )
            return
        draft["unit_amount"] = price
        await _after_price(message, context, user, draft)
        return

    if state == states.AWAIT_OUTCOME_CONFIRM:
        if is_label(lang, "common.confirm", text):
            draft["amount"] = draft["suggested"]
            await _save(message, context, user, draft)
            return
        amount = parse_positive_number(text)
        if amount is None:
            await message.reply_text(
                t(lang, "errors.bad_number"),
                reply_markup=confirm_amount_keyboard(lang),
            )
            return
        draft["amount"] = amount
        await _save(message, context, user, draft)
        return

    if state == states.AWAIT_OUTCOME_AMOUNT:
        amount = parse_positive_number(text)
        if amount is None:
            await message.reply_text(
                t(lang, "errors.bad_number"),
                reply_markup=back_cancel(lang),
            )
            return
        draft["amount"] = amount
        await _save(message, context, user, draft)


async def _handle_back(message, context, user, state, draft) -> None:
    lang = lang_of(user)
    if state == states.AWAIT_INCOME_NAME:
        clear_flow(context)
        await send_menu(message, user)
        return
    if state == states.AWAIT_INCOME_AMOUNT:
        draft["amount"] = None
        await _ask_income_name(message, context, lang)
        return
    if state == states.AWAIT_OUTCOME_NAME:
        clear_flow(context)
        await send_menu(message, user)
        return
    if state == states.AWAIT_OUTCOME_UNITS:
        draft["units"] = None
        await _ask_outcome_name(message, context, lang)
        return
    if state == states.AWAIT_OUTCOME_PRICE:
        draft["unit_amount"] = None
        await _ask_units(message, context, lang)
        return
    if state in (states.AWAIT_OUTCOME_AMOUNT, states.AWAIT_OUTCOME_CONFIRM):
        draft["amount"] = None
        draft["suggested"] = None
        await _ask_price(message, context, lang)
        return


async def _ask_income_name(message: Message, context, lang: str) -> None:
    context.user_data["state"] = states.AWAIT_INCOME_NAME
    await message.reply_text(t(lang, "income.ask_name"), reply_markup=skip_keyboard(lang))


async def _ask_outcome_name(message: Message, context, lang: str) -> None:
    context.user_data["state"] = states.AWAIT_OUTCOME_NAME
    await message.reply_text(t(lang, "outcome.ask_name"), reply_markup=skip_keyboard(lang))


async def _ask_income_amount(message: Message, context, lang: str) -> None:
    context.user_data["state"] = states.AWAIT_INCOME_AMOUNT
    await message.reply_text(t(lang, "income.ask_amount"), reply_markup=back_cancel(lang))


async def _ask_units(message: Message, context, lang: str) -> None:
    context.user_data["state"] = states.AWAIT_OUTCOME_UNITS
    await message.reply_text(
        t(lang, "outcome.ask_units"),
        reply_markup=not_applicable_keyboard(lang),
    )


async def _ask_price(message: Message, context, lang: str) -> None:
    context.user_data["state"] = states.AWAIT_OUTCOME_PRICE
    await message.reply_text(
        t(lang, "outcome.ask_price"),
        reply_markup=not_applicable_keyboard(lang),
    )


async def _ask_outcome_amount(message: Message, context, lang: str) -> None:
    context.user_data["state"] = states.AWAIT_OUTCOME_AMOUNT
    await message.reply_text(t(lang, "outcome.ask_amount"), reply_markup=back_cancel(lang))


async def _after_price(message: Message, context, user: dict, draft: dict) -> None:
    lang = lang_of(user)
    if draft["units"] is not None and draft["unit_amount"] is not None:
        suggested = multiply(draft["units"], draft["unit_amount"])
        draft["suggested"] = suggested
        context.user_data["state"] = states.AWAIT_OUTCOME_CONFIRM
        await message.reply_text(
            t(
                lang,
                "outcome.confirm_amount",
                amount=format_number(suggested),
                currency=user["currency"],
            ),
            reply_markup=confirm_amount_keyboard(lang),
        )
        return
    await _ask_outcome_amount(message, context, lang)


async def _save(message: Message, context, user: dict, draft: dict) -> None:
    lang = lang_of(user)
    name = draft["name"] or default_name(draft["type"])
    try:
        await asyncio.to_thread(
            sheets.append_entry,
            user["spreadsheet_id"],
            user["sheet_id"],
            when=now_local(),
            name=name,
            tx_type=draft["type"],
            unit_amount=draft.get("unit_amount"),
            units=draft.get("units"),
            amount=draft["amount"],
        )
    except sheets.SheetError as exc:
        await reply_sheet_error(message, lang, exc)
        return
    except Exception:
        logger.exception("failed to append entry")
        await message.reply_text(t(lang, "errors.generic"), reply_markup=main_menu(lang))
        return
    key = "income.saved" if draft["type"] == "income" else "outcome.saved"
    text = t(
        lang,
        key,
        name=name,
        amount=format_number(draft["amount"]),
        currency=user["currency"],
    )
    clear_flow(context)
    await message.reply_text(text, reply_markup=main_menu(lang))
