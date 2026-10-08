import { BotContext } from "../context";
import { clearFlow, isReady, UserRow } from "../db";
import { t } from "../i18n";
import { isLabel, mainMenu } from "../keyboards";
import { Entry, formatNumber } from "../ledger";
import {
  BadSheetUrl,
  CredentialsMissing,
  serviceAccountEmail,
  SheetNotShared,
  SheetTabMissing,
} from "../sheets";

export const LANGS = new Set(["en", "mm", "de", "jp"]);

export function langOf(user: UserRow | null): string {
  if (!user) return "en";
  const code = user.language || "en";
  return LANGS.has(code) ? code : "en";
}

export function cleanName(text: string): string | null {
  const name = text.split(/\s+/).join(" ").trim();
  if (!name || name.length > 100) return null;
  return name;
}

export function cleanCurrency(text: string): string | null {
  const currency = text.split(/\s+/).join(" ").trim();
  if (!currency || currency.length > 16) return null;
  return currency;
}

export async function sendMenu(ctx: BotContext, user: UserRow): Promise<void> {
  const lang = langOf(user);
  await ctx.reply(t(lang, "start.ready", { name: user.nickname ?? "" }), {
    reply_markup: mainMenu(lang),
  });
}

export async function requireReady(ctx: BotContext, user: UserRow): Promise<boolean> {
  if (isReady(user)) return true;
  await ctx.reply(t(langOf(user), "errors.need_setup"));
  return false;
}

export async function cancelToMenu(ctx: BotContext, user: UserRow): Promise<void> {
  clearFlow(ctx.session);
  const lang = langOf(user);
  if (isReady(user)) {
    await ctx.reply(t(lang, "common.cancelled"), {
      reply_markup: mainMenu(lang),
    });
    return;
  }
  await ctx.reply(t(lang, "common.cancelled"));
}

export function isCancel(lang: string, text: string): boolean {
  return isLabel(lang, "common.cancel", text);
}

export function isBack(lang: string, text: string): boolean {
  return isLabel(lang, "common.back", text);
}

export async function replySheetError(ctx: BotContext, lang: string, exc: unknown): Promise<void> {
  const email = serviceAccountEmail(ctx.env.GOOGLE_SERVICE_ACCOUNT_JSON) || "the service account";
  let text: string;
  if (exc instanceof SheetNotShared) {
    text = t(lang, "errors.not_shared", { email });
  } else if (exc instanceof SheetTabMissing) {
    text = t(lang, "errors.tab_missing");
  } else if (exc instanceof CredentialsMissing) {
    text = t(lang, "errors.no_credentials");
  } else if (exc instanceof BadSheetUrl) {
    text = t(lang, "errors.bad_url");
  } else {
    console.error("sheet operation failed", exc);
    text = t(lang, "errors.generic");
  }
  await ctx.reply(text);
}

export function formatEntry(entry: Entry, lang: string, currency: string): string {
  let typeLabel: string;
  if (entry.type === "income") typeLabel = t(lang, "common.income_type");
  else if (entry.type === "outcome") typeLabel = t(lang, "common.outcome_type");
  else typeLabel = entry.type;
  const amount = formatNumber(entry.amount);
  const detail =
    entry.units != null && entry.unit_amount != null
      ? t(lang, "list.detail_units", {
          units: formatNumber(entry.units),
          price: formatNumber(entry.unit_amount),
          currency,
          amount,
        })
      : t(lang, "list.detail_amount", { amount, currency });
  return t(lang, "list.line", {
    date: entry.date,
    time: entry.time,
    name: entry.name,
    type: typeLabel,
    detail,
  });
}

export function splitText(text: string, limit = 3900): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let current = "";
  for (const block of text.split("\n\n")) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) parts.push(current);
    if (block.length <= limit) {
      current = block;
      continue;
    }
    for (let start = 0; start < block.length; start += limit) {
      parts.push(block.slice(start, start + limit));
    }
    current = "";
  }
  if (current) parts.push(current);
  return parts;
}
