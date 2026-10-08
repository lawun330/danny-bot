import { BotContext } from "../context";
import { clearFlow, hasSheet, isReady, updateUser, UserRow } from "../db";
import { t } from "../i18n";
import { backCancel, cancelOnly, mainMenu } from "../keyboards";
import { parseSpreadsheetId } from "../ledger";
import * as sheets from "../sheets";
import * as states from "../states";
import { cleanName, isBack, isCancel, langOf, replySheetError, sendMenu } from "./common";

export async function beginSheetQuestion(
  ctx: BotContext,
  user: UserRow,
  replace = false,
): Promise<void> {
  const keepReplace = replace || Boolean(ctx.session.sheet_replace);
  clearFlow(ctx.session);
  ctx.session.state = states.AWAIT_SHEET_URL;
  if (keepReplace) ctx.session.sheet_replace = true;
  const lang = langOf(user);
  const email = sheets.serviceAccountEmail(ctx.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const text = email ? t(lang, "start.ask_sheet", { email }) : t(lang, "start.ask_sheet_no_email");
  const markup = keepReplace ? backCancel(lang) : cancelOnly(lang);
  await ctx.reply(text, { reply_markup: markup });
}

export async function beginNicknameQuestion(ctx: BotContext, user: UserRow): Promise<void> {
  clearFlow(ctx.session);
  ctx.session.state = states.AWAIT_NICKNAME;
  const lang = langOf(user);
  await ctx.reply(t(lang, "start.ask_nickname"), {
    reply_markup: backCancel(lang),
  });
}

export async function handleSheetUrl(ctx: BotContext, user: UserRow): Promise<void> {
  const lang = langOf(user);
  const text = ctx.message?.text ?? "";
  const replace = Boolean(ctx.session.sheet_replace);

  if (isCancel(lang, text)) {
    clearFlow(ctx.session);
    if (isReady(user)) {
      await ctx.reply(t(lang, "common.cancelled"), {
        reply_markup: mainMenu(lang),
      });
      return;
    }
    await ctx.reply(t(lang, "common.cancelled"));
    await beginSheetQuestion(ctx, user, false);
    return;
  }

  if (isBack(lang, text)) {
    if (replace) {
      const { beginSheetConfirm } = await import("./settings");
      await beginSheetConfirm(ctx, user);
      return;
    }
    await beginSheetQuestion(ctx, user, false);
    return;
  }

  const spreadsheetId = parseSpreadsheetId(text);
  if (!spreadsheetId) {
    const markup = replace ? backCancel(lang) : cancelOnly(lang);
    await ctx.reply(t(lang, "errors.bad_url"), { reply_markup: markup });
    return;
  }

  try {
    const linked = await sheets.linkNewTab(ctx.env.GOOGLE_SERVICE_ACCOUNT_JSON, spreadsheetId);
    user = await updateUser(ctx.env.DB, user.telegram_id, {
      spreadsheet_id: linked.spreadsheetId,
      sheet_id: linked.sheetId,
      sheet_title: linked.title,
    });
    ctx.dbUser = user;
    await ctx.reply(t(lang, "start.sheet_saved", { title: linked.title }));
    delete ctx.session.sheet_replace;
    if (!user.nickname) {
      await beginNicknameQuestion(ctx, user);
      return;
    }
    clearFlow(ctx.session);
    await sendMenu(ctx, user);
  } catch (exc) {
    if (exc instanceof sheets.SheetError) {
      await replySheetError(ctx, lang, exc);
      return;
    }
    console.error("failed to link spreadsheet", exc);
    await ctx.reply(t(lang, "errors.sheet_failed"));
  }
}

export async function handleNickname(
  ctx: BotContext,
  user: UserRow,
  settings: boolean,
): Promise<void> {
  const lang = langOf(user);
  const text = ctx.message?.text ?? "";

  if (isCancel(lang, text)) {
    clearFlow(ctx.session);
    if (isReady(user) || (user.nickname && hasSheet(user))) {
      if (isReady(user)) {
        await ctx.reply(t(lang, "common.cancelled"), {
          reply_markup: mainMenu(lang),
        });
        return;
      }
    }
    await ctx.reply(t(lang, "common.cancelled"));
    if (hasSheet(user) && !user.nickname) {
      await beginNicknameQuestion(ctx, user);
    }
    return;
  }

  if (isBack(lang, text)) {
    if (settings) {
      const { beginSettings } = await import("./settings");
      await beginSettings(ctx, user);
      return;
    }
    await beginSheetQuestion(ctx, user, Boolean(ctx.session.sheet_replace));
    return;
  }

  const name = cleanName(text);
  if (!name) {
    await ctx.reply(t(lang, "errors.bad_name"), {
      reply_markup: backCancel(lang),
    });
    return;
  }
  user = await updateUser(ctx.env.DB, user.telegram_id, { nickname: name });
  ctx.dbUser = user;
  clearFlow(ctx.session);
  if (settings) {
    await ctx.reply(t(lang, "settings.nickname_saved", { name }), {
      reply_markup: mainMenu(lang),
    });
    return;
  }
  await sendMenu(ctx, user);
}
