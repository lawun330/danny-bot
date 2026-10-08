import { BotContext, nowLocal } from "../context";
import { clearFlow, UserRow } from "../db";
import { t } from "../i18n";
import { isLabel, mainMenu, monthPickerKeyboard } from "../keyboards";
import { Entry, filterEntries, formatNumber, totals } from "../ledger";
import * as sheets from "../sheets";
import * as states from "../states";
import {
  cancelToMenu,
  formatEntry,
  isBack,
  isCancel,
  langOf,
  replySheetError,
  sendMenu,
  splitText,
} from "./common";

const YEAR_MONTH = /^\d{4}-\d{2}$/;

interface MonthPick {
  year: number;
  button_map?: Record<string, string>;
}

export async function showToday(ctx: BotContext, user: UserRow): Promise<void> {
  const today = nowLocal(ctx.env.TIMEZONE || "Asia/Yangon");
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const entries = await load(ctx, user);
  if (entries == null) return;
  const matched = filterEntries(entries, { on_date: stamp });
  const title = t(langOf(user), "list.today_title", { date: stamp });
  await sendList(ctx, user, title, matched);
}

export async function beginMonthPicker(ctx: BotContext, user: UserRow): Promise<void> {
  clearFlow(ctx.session);
  const today = nowLocal(ctx.env.TIMEZONE || "Asia/Yangon");
  ctx.session.state = states.AWAIT_MONTH_PICK;
  ctx.session.month_pick = { year: today.getFullYear() } satisfies MonthPick;
  await showMonthPicker(ctx, user);
}

export async function handleMonthPickText(ctx: BotContext, user: UserRow): Promise<void> {
  const lang = langOf(user);
  const text = ctx.message?.text ?? "";
  const pick = (ctx.session.month_pick as MonthPick | undefined) ?? {
    year: nowLocal(ctx.env.TIMEZONE || "Asia/Yangon").getFullYear(),
  };
  ctx.session.month_pick = pick;
  const today = nowLocal(ctx.env.TIMEZONE || "Asia/Yangon");

  if (isCancel(lang, text) || isBack(lang, text)) {
    if (isCancel(lang, text)) await cancelToMenu(ctx, user);
    else {
      clearFlow(ctx.session);
      await sendMenu(ctx, user);
    }
    return;
  }

  if (isLabel(lang, "common.prev_year", text)) {
    pick.year = Number(pick.year) - 1;
    ctx.session.month_pick = pick;
    await showMonthPicker(ctx, user);
    return;
  }

  if (isLabel(lang, "common.next_year", text)) {
    const nextYear = Number(pick.year) + 1;
    if (nextYear > today.getFullYear()) {
      await showMonthPicker(ctx, user);
      return;
    }
    pick.year = nextYear;
    ctx.session.month_pick = pick;
    await showMonthPicker(ctx, user);
    return;
  }

  let stamp = pick.button_map?.[text];
  if (stamp == null && YEAR_MONTH.test(text)) stamp = text;
  if (stamp == null) {
    await showMonthPicker(ctx, user);
    return;
  }

  const entries = await load(ctx, user);
  if (entries == null) return;
  const matched = filterEntries(entries, { year_month: stamp });
  const title = t(lang, "list.month_title", { month: stamp });
  clearFlow(ctx.session);
  await sendList(ctx, user, title, matched);
}

export async function showBalance(ctx: BotContext, user: UserRow): Promise<void> {
  const lang = langOf(user);
  const entries = await load(ctx, user);
  if (entries == null) return;
  let text: string;
  if (!entries.length) {
    text = `${t(lang, "balance.title")}\n\n${t(lang, "balance.empty")}`;
  } else {
    const sums = totals(entries);
    const currency = user.currency;
    text = [
      t(lang, "balance.title"),
      t(lang, "balance.income", {
        amount: formatNumber(sums.income),
        currency,
      }),
      t(lang, "balance.outcome", {
        amount: formatNumber(sums.outcome),
        currency,
      }),
      t(lang, "balance.remaining", {
        amount: formatNumber(sums.remaining),
        currency,
      }),
    ].join("\n");
  }
  await ctx.reply(text, { reply_markup: mainMenu(lang) });
}

async function showMonthPicker(ctx: BotContext, user: UserRow): Promise<void> {
  const lang = langOf(user);
  const today = nowLocal(ctx.env.TIMEZONE || "Asia/Yangon");
  const pick = ctx.session.month_pick as MonthPick;
  const year = Number(pick.year);
  const { keyboard, buttonMap } = monthPickerKeyboard(
    lang,
    year,
    today.getFullYear(),
    today.getMonth() + 1,
  );
  pick.button_map = buttonMap;
  ctx.session.month_pick = pick;
  ctx.session.state = states.AWAIT_MONTH_PICK;
  await ctx.reply(t(lang, "list.pick_month", { year }), {
    reply_markup: keyboard,
  });
}

async function load(ctx: BotContext, user: UserRow): Promise<Entry[] | null> {
  const lang = langOf(user);
  if (user.spreadsheet_id == null || user.sheet_id == null) {
    await ctx.reply(t(lang, "errors.generic"));
    return null;
  }
  try {
    return await sheets.listEntries(
      ctx.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      user.spreadsheet_id,
      user.sheet_id,
    );
  } catch (exc) {
    if (exc instanceof sheets.SheetError) {
      await replySheetError(ctx, lang, exc);
    } else {
      console.error("failed to read transactions", exc);
      await ctx.reply(t(lang, "errors.generic"));
    }
    return null;
  }
}

async function sendList(
  ctx: BotContext,
  user: UserRow,
  title: string,
  entries: Entry[],
): Promise<void> {
  const lang = langOf(user);
  if (!entries.length) {
    await ctx.reply(`${title}\n\n${t(lang, "list.empty")}`, {
      reply_markup: mainMenu(lang),
    });
    return;
  }
  const blocks = entries.map((entry) => formatEntry(entry, lang, user.currency));
  const parts = splitText(`${title}\n\n${blocks.join("\n\n")}`);
  const last = parts.length - 1;
  for (let index = 0; index < parts.length; index++) {
    await ctx.reply(parts[index], {
      reply_markup: index === last ? mainMenu(lang) : undefined,
    });
  }
}
