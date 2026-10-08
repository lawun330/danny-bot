import { BotContext } from "../context";
import { clearFlow, isReady, UserRow } from "../db";
import { t } from "../i18n";
import { mainMenu, menuAction } from "../keyboards";
import * as states from "../states";
import { cancelToMenu, langOf, requireReady, sendMenu } from "./common";
import { beginDelete, handleDeleteText } from "./delete_flow";
import { beginIncome, beginOutcome, handleEntryText } from "./entry";
import {
  beginNicknameQuestion,
  beginSheetQuestion,
  handleNickname,
  handleSheetUrl,
} from "./onboarding";
import { beginMonthPicker, handleMonthPickText, showBalance, showToday } from "./reports";
import { beginSettings, handleSettingsText } from "./settings";

const ENTRY_STATES = new Set([
  states.AWAIT_INCOME_NAME,
  states.AWAIT_INCOME_AMOUNT,
  states.AWAIT_INCOME_CONFIRM,
  states.AWAIT_OUTCOME_NAME,
  states.AWAIT_OUTCOME_UNITS,
  states.AWAIT_OUTCOME_PRICE,
  states.AWAIT_OUTCOME_AMOUNT,
  states.AWAIT_OUTCOME_CONFIRM,
]);

const DELETE_STATES = new Set([
  states.AWAIT_DELETE_DATE,
  states.AWAIT_DELETE_NAME,
  states.AWAIT_DELETE_TYPE,
  states.AWAIT_DELETE_PICK,
  states.AWAIT_DELETE_CONFIRM,
]);

const SETTINGS_STATES = new Set([
  states.AWAIT_SETTINGS_MENU,
  states.AWAIT_CURRENCY,
  states.AWAIT_LANGUAGE,
  states.AWAIT_SHEET_CONFIRM,
]);

export async function start(ctx: BotContext): Promise<void> {
  const user = ctx.dbUser;
  if (!user.spreadsheet_id || user.sheet_id == null) {
    await beginSheetQuestion(ctx, user);
    return;
  }
  if (!user.nickname) {
    await beginNicknameQuestion(ctx, user);
    return;
  }
  clearFlow(ctx.session);
  await sendMenu(ctx, user);
}

export async function menu(ctx: BotContext): Promise<void> {
  const user = ctx.dbUser;
  if (!(await requireReady(ctx, user))) return;
  clearFlow(ctx.session);
  await sendMenu(ctx, user);
}

export async function cancel(ctx: BotContext): Promise<void> {
  await cancelToMenu(ctx, ctx.dbUser);
}

export async function onText(ctx: BotContext): Promise<void> {
  const user = ctx.dbUser;
  const state = ctx.session.state as string | undefined;
  const lang = langOf(user);
  const text = ctx.message?.text ?? "";
  try {
    if (state === states.AWAIT_SHEET_URL) {
      await handleSheetUrl(ctx, user);
      return;
    }
    if (state === states.AWAIT_NICKNAME) {
      await handleNickname(ctx, user, false);
      return;
    }
    if (state === states.AWAIT_SETTINGS_NICKNAME) {
      await handleNickname(ctx, user, true);
      return;
    }
    if (state && SETTINGS_STATES.has(state)) {
      await handleSettingsText(ctx, user);
      return;
    }
    if (state && ENTRY_STATES.has(state)) {
      await handleEntryText(ctx, user);
      return;
    }
    if (state && DELETE_STATES.has(state)) {
      await handleDeleteText(ctx, user);
      return;
    }
    if (state === states.AWAIT_MONTH_PICK) {
      await handleMonthPickText(ctx, user);
      return;
    }
    if (isReady(user)) {
      const action = menuAction(lang, text);
      if (action) {
        await onMenu(ctx, user, action);
        return;
      }
      await sendMenu(ctx, user);
      return;
    }
    await ctx.reply(t(lang, "errors.need_setup"));
  } catch (exc) {
    console.error("text handler failed", exc);
    const markup = isReady(user) ? mainMenu(lang) : undefined;
    await ctx.reply(t(lang, "errors.generic"), { reply_markup: markup });
  }
}

async function onMenu(ctx: BotContext, user: UserRow, action: string): Promise<void> {
  if (!(await requireReady(ctx, user))) return;
  if (action === "income") await beginIncome(ctx, user);
  else if (action === "outcome") await beginOutcome(ctx, user);
  else if (action === "today") {
    clearFlow(ctx.session);
    await showToday(ctx, user);
  } else if (action === "month") await beginMonthPicker(ctx, user);
  else if (action === "balance") {
    clearFlow(ctx.session);
    await showBalance(ctx, user);
  } else if (action === "delete") await beginDelete(ctx, user);
  else if (action === "settings") await beginSettings(ctx, user);
}
