import { BotContext, nowLocal } from "../context";
import { clearFlow, UserRow } from "../db";
import { t } from "../i18n";
import {
  backCancel,
  confirmAmountKeyboard,
  isLabel,
  mainMenu,
  notApplicableKeyboard,
  skipKeyboard,
} from "../keyboards";
import {
  DecimalStr,
  defaultName,
  formatNumber,
  multiply,
  parsePositiveNumber,
} from "../ledger";
import * as sheets from "../sheets";
import * as states from "../states";
import {
  cancelToMenu,
  cleanName,
  isBack,
  isCancel,
  langOf,
  replySheetError,
  sendMenu,
} from "./common";

interface Draft {
  type: string;
  name: string | null;
  units: DecimalStr | null;
  unit_amount: DecimalStr | null;
  amount: DecimalStr | null;
  suggested: DecimalStr | null;
}

function blankDraft(txType: string): Draft {
  return {
    type: txType,
    name: null,
    units: null,
    unit_amount: null,
    amount: null,
    suggested: null,
  };
}

function getDraft(ctx: BotContext): Draft {
  const draft = ctx.session.draft as Draft | undefined;
  if (draft) return draft;
  const created = blankDraft("income");
  ctx.session.draft = created;
  return created;
}

export async function beginIncome(
  ctx: BotContext,
  user: UserRow,
): Promise<void> {
  clearFlow(ctx.session);
  ctx.session.state = states.AWAIT_INCOME_NAME;
  ctx.session.draft = blankDraft("income");
  await askIncomeName(ctx, langOf(user));
}

export async function beginOutcome(
  ctx: BotContext,
  user: UserRow,
): Promise<void> {
  clearFlow(ctx.session);
  ctx.session.state = states.AWAIT_OUTCOME_NAME;
  ctx.session.draft = blankDraft("outcome");
  await askOutcomeName(ctx, langOf(user));
}

export async function handleEntryText(
  ctx: BotContext,
  user: UserRow,
): Promise<void> {
  const state = ctx.session.state as string | undefined;
  const lang = langOf(user);
  const draft = getDraft(ctx);
  const text = ctx.message?.text ?? "";

  if (isCancel(lang, text)) {
    await cancelToMenu(ctx, user);
    return;
  }
  if (isBack(lang, text)) {
    await handleBack(ctx, user, state, draft);
    return;
  }

  if (
    state === states.AWAIT_INCOME_NAME ||
    state === states.AWAIT_OUTCOME_NAME
  ) {
    if (isLabel(lang, "common.skip", text)) {
      draft.name = defaultName(draft.type);
    } else {
      const name = cleanName(text);
      if (!name) {
        await ctx.reply(t(lang, "errors.bad_name"), {
          reply_markup: skipKeyboard(lang),
        });
        return;
      }
      draft.name = name;
    }
    ctx.session.draft = draft;
    if (state === states.AWAIT_INCOME_NAME) await askIncomeAmount(ctx, lang);
    else await askUnits(ctx, lang);
    return;
  }

  if (state === states.AWAIT_INCOME_AMOUNT) {
    const amount = parsePositiveNumber(text);
    if (amount == null) {
      await ctx.reply(t(lang, "errors.bad_number"), {
        reply_markup: backCancel(lang),
      });
      return;
    }
    draft.suggested = amount;
    ctx.session.draft = draft;
    await askIncomeConfirm(ctx, user, amount);
    return;
  }

  if (state === states.AWAIT_INCOME_CONFIRM) {
    if (isLabel(lang, "common.confirm", text)) {
      draft.amount = draft.suggested;
      ctx.session.draft = draft;
      await save(ctx, user, draft);
      return;
    }
    const amount = parsePositiveNumber(text);
    if (amount == null) {
      await ctx.reply(t(lang, "errors.bad_number"), {
        reply_markup: confirmAmountKeyboard(lang),
      });
      return;
    }
    draft.amount = amount;
    ctx.session.draft = draft;
    await save(ctx, user, draft);
    return;
  }

  if (state === states.AWAIT_OUTCOME_UNITS) {
    if (isLabel(lang, "common.not_applicable", text)) {
      draft.units = null;
      ctx.session.draft = draft;
      await askPrice(ctx, lang);
      return;
    }
    const units = parsePositiveNumber(text);
    if (units == null) {
      await ctx.reply(t(lang, "errors.bad_number"), {
        reply_markup: notApplicableKeyboard(lang),
      });
      return;
    }
    draft.units = units;
    ctx.session.draft = draft;
    await askPrice(ctx, lang);
    return;
  }

  if (state === states.AWAIT_OUTCOME_PRICE) {
    if (isLabel(lang, "common.not_applicable", text)) {
      draft.unit_amount = null;
      ctx.session.draft = draft;
      await askOutcomeAmount(ctx, lang);
      return;
    }
    const price = parsePositiveNumber(text);
    if (price == null) {
      await ctx.reply(t(lang, "errors.bad_number"), {
        reply_markup: notApplicableKeyboard(lang),
      });
      return;
    }
    draft.unit_amount = price;
    ctx.session.draft = draft;
    await afterPrice(ctx, user, draft);
    return;
  }

  if (state === states.AWAIT_OUTCOME_CONFIRM) {
    if (isLabel(lang, "common.confirm", text)) {
      draft.amount = draft.suggested;
      ctx.session.draft = draft;
      await save(ctx, user, draft);
      return;
    }
    const amount = parsePositiveNumber(text);
    if (amount == null) {
      await ctx.reply(t(lang, "errors.bad_number"), {
        reply_markup: confirmAmountKeyboard(lang),
      });
      return;
    }
    draft.amount = amount;
    ctx.session.draft = draft;
    await save(ctx, user, draft);
    return;
  }

  if (state === states.AWAIT_OUTCOME_AMOUNT) {
    const amount = parsePositiveNumber(text);
    if (amount == null) {
      await ctx.reply(t(lang, "errors.bad_number"), {
        reply_markup: backCancel(lang),
      });
      return;
    }
    draft.amount = amount;
    ctx.session.draft = draft;
    await save(ctx, user, draft);
  }
}

async function handleBack(
  ctx: BotContext,
  user: UserRow,
  state: string | undefined,
  draft: Draft,
): Promise<void> {
  const lang = langOf(user);
  if (state === states.AWAIT_INCOME_NAME) {
    clearFlow(ctx.session);
    await sendMenu(ctx, user);
    return;
  }
  if (state === states.AWAIT_INCOME_AMOUNT) {
    draft.amount = null;
    draft.suggested = null;
    ctx.session.draft = draft;
    await askIncomeName(ctx, lang);
    return;
  }
  if (state === states.AWAIT_INCOME_CONFIRM) {
    draft.amount = null;
    draft.suggested = null;
    ctx.session.draft = draft;
    await askIncomeAmount(ctx, lang);
    return;
  }
  if (state === states.AWAIT_OUTCOME_NAME) {
    clearFlow(ctx.session);
    await sendMenu(ctx, user);
    return;
  }
  if (state === states.AWAIT_OUTCOME_UNITS) {
    draft.units = null;
    ctx.session.draft = draft;
    await askOutcomeName(ctx, lang);
    return;
  }
  if (state === states.AWAIT_OUTCOME_PRICE) {
    draft.unit_amount = null;
    ctx.session.draft = draft;
    await askUnits(ctx, lang);
    return;
  }
  if (
    state === states.AWAIT_OUTCOME_AMOUNT ||
    state === states.AWAIT_OUTCOME_CONFIRM
  ) {
    draft.amount = null;
    draft.suggested = null;
    ctx.session.draft = draft;
    await askPrice(ctx, lang);
  }
}

async function askIncomeName(ctx: BotContext, lang: string): Promise<void> {
  ctx.session.state = states.AWAIT_INCOME_NAME;
  await ctx.reply(t(lang, "income.ask_name"), {
    reply_markup: skipKeyboard(lang),
  });
}

async function askOutcomeName(ctx: BotContext, lang: string): Promise<void> {
  ctx.session.state = states.AWAIT_OUTCOME_NAME;
  await ctx.reply(t(lang, "outcome.ask_name"), {
    reply_markup: skipKeyboard(lang),
  });
}

async function askIncomeAmount(ctx: BotContext, lang: string): Promise<void> {
  ctx.session.state = states.AWAIT_INCOME_AMOUNT;
  await ctx.reply(t(lang, "income.ask_amount"), {
    reply_markup: backCancel(lang),
  });
}

async function askIncomeConfirm(
  ctx: BotContext,
  user: UserRow,
  amount: DecimalStr,
): Promise<void> {
  const lang = langOf(user);
  ctx.session.state = states.AWAIT_INCOME_CONFIRM;
  await ctx.reply(
    t(lang, "income.confirm_amount", {
      amount: formatNumber(amount),
      currency: user.currency,
    }),
    { reply_markup: confirmAmountKeyboard(lang) },
  );
}

async function askUnits(ctx: BotContext, lang: string): Promise<void> {
  ctx.session.state = states.AWAIT_OUTCOME_UNITS;
  await ctx.reply(t(lang, "outcome.ask_units"), {
    reply_markup: notApplicableKeyboard(lang),
  });
}

async function askPrice(ctx: BotContext, lang: string): Promise<void> {
  ctx.session.state = states.AWAIT_OUTCOME_PRICE;
  await ctx.reply(t(lang, "outcome.ask_price"), {
    reply_markup: notApplicableKeyboard(lang),
  });
}

async function askOutcomeAmount(ctx: BotContext, lang: string): Promise<void> {
  ctx.session.state = states.AWAIT_OUTCOME_AMOUNT;
  await ctx.reply(t(lang, "outcome.ask_amount"), {
    reply_markup: backCancel(lang),
  });
}

async function afterPrice(
  ctx: BotContext,
  user: UserRow,
  draft: Draft,
): Promise<void> {
  const lang = langOf(user);
  if (draft.units != null && draft.unit_amount != null) {
    const suggested = multiply(draft.units, draft.unit_amount);
    draft.suggested = suggested;
    ctx.session.draft = draft;
    ctx.session.state = states.AWAIT_OUTCOME_CONFIRM;
    await ctx.reply(
      t(lang, "outcome.confirm_amount", {
        amount: formatNumber(suggested),
        currency: user.currency,
      }),
      { reply_markup: confirmAmountKeyboard(lang) },
    );
    return;
  }
  await askOutcomeAmount(ctx, lang);
}

async function save(
  ctx: BotContext,
  user: UserRow,
  draft: Draft,
): Promise<void> {
  const lang = langOf(user);
  const name = draft.name || defaultName(draft.type);
  if (draft.amount == null || user.spreadsheet_id == null || user.sheet_id == null) {
    await ctx.reply(t(lang, "errors.generic"), {
      reply_markup: mainMenu(lang),
    });
    return;
  }
  try {
    await sheets.appendEntry(
      ctx.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      user.spreadsheet_id,
      user.sheet_id,
      {
        when: nowLocal(ctx.env.TIMEZONE || "Asia/Yangon"),
        name,
        txType: draft.type,
        unitAmount: draft.unit_amount,
        units: draft.units,
        amount: draft.amount,
      },
    );
  } catch (exc) {
    if (exc instanceof sheets.SheetError) {
      await replySheetError(ctx, lang, exc);
      return;
    }
    console.error("failed to append entry", exc);
    await ctx.reply(t(lang, "errors.generic"), {
      reply_markup: mainMenu(lang),
    });
    return;
  }
  const key = draft.type === "income" ? "income.saved" : "outcome.saved";
  const text = t(lang, key, {
    name,
    amount: formatNumber(draft.amount),
    currency: user.currency,
  });
  clearFlow(ctx.session);
  await ctx.reply(text, { reply_markup: mainMenu(lang) });
}
