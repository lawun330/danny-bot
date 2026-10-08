import { BotContext } from "../context";
import { clearFlow, updateUser, UserRow } from "../db";
import { t } from "../i18n";
import {
  backCancel,
  isLabel,
  languageCode,
  languageMenu,
  mainMenu,
  settingsAction,
  settingsMenu,
  yesNo,
} from "../keyboards";
import * as states from "../states";
import { cancelToMenu, cleanCurrency, isBack, isCancel, langOf, sendMenu } from "./common";

export async function beginSettings(ctx: BotContext, user: UserRow): Promise<void> {
  clearFlow(ctx.session);
  ctx.session.state = states.AWAIT_SETTINGS_MENU;
  const lang = langOf(user);
  await ctx.reply(t(lang, "settings.title"), {
    reply_markup: settingsMenu(lang),
  });
}

export async function beginSheetConfirm(ctx: BotContext, user: UserRow): Promise<void> {
  clearFlow(ctx.session);
  ctx.session.state = states.AWAIT_SHEET_CONFIRM;
  const lang = langOf(user);
  await ctx.reply(t(lang, "settings.confirm_sheet"), {
    reply_markup: yesNo(lang),
  });
}

export async function handleSettingsText(ctx: BotContext, user: UserRow): Promise<void> {
  const state = ctx.session.state as string | undefined;
  const lang = langOf(user);
  const text = ctx.message?.text ?? "";

  if (isCancel(lang, text)) {
    await cancelToMenu(ctx, user);
    return;
  }

  if (state === states.AWAIT_SETTINGS_MENU) {
    if (isBack(lang, text)) {
      clearFlow(ctx.session);
      await sendMenu(ctx, user);
      return;
    }
    const action = settingsAction(lang, text);
    if (action === "currency") {
      ctx.session.state = states.AWAIT_CURRENCY;
      await ctx.reply(t(lang, "settings.ask_currency"), {
        reply_markup: backCancel(lang),
      });
      return;
    }
    if (action === "language") {
      ctx.session.state = states.AWAIT_LANGUAGE;
      await ctx.reply(t(lang, "settings.pick_language"), {
        reply_markup: languageMenu(lang),
      });
      return;
    }
    if (action === "nickname") {
      ctx.session.state = states.AWAIT_SETTINGS_NICKNAME;
      await ctx.reply(t(lang, "settings.ask_nickname"), {
        reply_markup: backCancel(lang),
      });
      return;
    }
    if (action === "sheet") {
      await beginSheetConfirm(ctx, user);
      return;
    }
    await beginSettings(ctx, user);
    return;
  }

  if (isBack(lang, text)) {
    await beginSettings(ctx, user);
    return;
  }

  if (state === states.AWAIT_CURRENCY) {
    const currency = cleanCurrency(text);
    if (!currency) {
      await ctx.reply(t(lang, "errors.bad_currency"), {
        reply_markup: backCancel(lang),
      });
      return;
    }
    user = await updateUser(ctx.env.DB, user.telegram_id, { currency });
    ctx.dbUser = user;
    clearFlow(ctx.session);
    await ctx.reply(t(lang, "settings.currency_saved", { currency }), {
      reply_markup: mainMenu(lang),
    });
    return;
  }

  if (state === states.AWAIT_LANGUAGE) {
    const code = languageCode(text);
    if (code == null) {
      await ctx.reply(t(lang, "settings.pick_language"), {
        reply_markup: languageMenu(lang),
      });
      return;
    }
    user = await updateUser(ctx.env.DB, user.telegram_id, { language: code });
    ctx.dbUser = user;
    clearFlow(ctx.session);
    await ctx.reply(t(code, "settings.language_saved"), {
      reply_markup: mainMenu(code),
    });
    return;
  }

  if (state === states.AWAIT_SHEET_CONFIRM) {
    if (isLabel(lang, "common.yes", text)) {
      const { beginSheetQuestion } = await import("./onboarding");
      await beginSheetQuestion(ctx, user, true);
      return;
    }
    if (isLabel(lang, "common.no", text)) {
      clearFlow(ctx.session);
      await ctx.reply(t(lang, "settings.sheet_kept"), {
        reply_markup: mainMenu(lang),
      });
      return;
    }
    await beginSheetConfirm(ctx, user);
  }
}
