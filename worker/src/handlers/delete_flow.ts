import { BotContext, nowLocal } from "../context";
import { clearFlow, UserRow } from "../db";
import { t } from "../i18n";
import {
  calendarKeyboard,
  idkKeyboard,
  isLabel,
  mainMenu,
  monthNavTargets,
  rowPicker,
  typeKeyboard,
  yesNo,
} from "../keyboards";
import { Entry, entriesEqual, filterEntries, parseIsoDate } from "../ledger";
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

interface DeleteState {
  date: string | null;
  name: string | null;
  use_name: boolean;
  came_from_idk: boolean;
  tx_type: string | null;
  matches: Entry[];
  selected: number[];
  page: number;
  year: number;
  month: number;
  button_map: Record<string, number>;
  delete_label: string;
}

function freshDelete(ctx: BotContext): DeleteState {
  const today = nowLocal(ctx.env.TIMEZONE || "Asia/Yangon");
  return {
    date: null,
    name: null,
    use_name: false,
    came_from_idk: false,
    tx_type: null,
    matches: [],
    selected: [],
    page: 0,
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    button_map: {},
    delete_label: "",
  };
}

export async function beginDelete(ctx: BotContext, user: UserRow): Promise<void> {
  clearFlow(ctx.session);
  ctx.session.state = states.AWAIT_DELETE_DATE;
  ctx.session.delete = freshDelete(ctx);
  await askDate(ctx, langOf(user));
}

export async function handleDeleteText(ctx: BotContext, user: UserRow): Promise<void> {
  const state = ctx.session.state as string | undefined;
  const lang = langOf(user);
  const deleteState = ctx.session.delete as DeleteState | undefined;
  const text = ctx.message?.text ?? "";
  if (!deleteState) {
    await beginDelete(ctx, user);
    return;
  }

  if (isCancel(lang, text)) {
    await cancelToMenu(ctx, user);
    return;
  }
  if (isBack(lang, text)) {
    await handleBack(ctx, user, state, deleteState);
    return;
  }

  if (state === states.AWAIT_DELETE_DATE) {
    await handleDate(ctx, user, deleteState, text);
    return;
  }

  if (state === states.AWAIT_DELETE_NAME) {
    if (isLabel(lang, "common.idk", text)) {
      deleteState.name = null;
      deleteState.use_name = false;
      ctx.session.delete = deleteState;
      await askType(ctx, lang);
      return;
    }
    const name = cleanName(text);
    if (!name) {
      await ctx.reply(t(lang, "errors.bad_name"), {
        reply_markup: idkKeyboard(lang),
      });
      return;
    }
    deleteState.name = name;
    deleteState.use_name = true;
    ctx.session.delete = deleteState;
    await askType(ctx, lang);
    return;
  }

  if (state === states.AWAIT_DELETE_TYPE) {
    if (isLabel(lang, "common.income_type", text)) {
      deleteState.tx_type = "income";
    } else if (isLabel(lang, "common.outcome_type", text)) {
      deleteState.tx_type = "outcome";
    } else if (isLabel(lang, "common.idk", text)) {
      deleteState.tx_type = null;
    } else {
      await ctx.reply(t(lang, "delete.ask_type"), {
        reply_markup: typeKeyboard(lang),
      });
      return;
    }
    ctx.session.delete = deleteState;
    await queryAndShow(ctx, user, deleteState);
    return;
  }

  if (state === states.AWAIT_DELETE_PICK) {
    await handlePick(ctx, user, deleteState, text);
    return;
  }

  if (state === states.AWAIT_DELETE_CONFIRM) {
    if (isLabel(lang, "common.yes", text)) {
      await deleteSelected(ctx, user, deleteState);
      return;
    }
    if (isLabel(lang, "common.no", text)) {
      ctx.session.state = states.AWAIT_DELETE_PICK;
      await showPicker(ctx, user, deleteState);
      return;
    }
    await ctx.reply(t(lang, "delete.confirm", { count: deleteState.selected.length }), {
      reply_markup: yesNo(lang),
    });
  }
}

async function handleBack(
  ctx: BotContext,
  user: UserRow,
  state: string | undefined,
  deleteState: DeleteState,
): Promise<void> {
  const lang = langOf(user);
  if (state === states.AWAIT_DELETE_DATE) {
    clearFlow(ctx.session);
    await sendMenu(ctx, user);
    return;
  }
  if (state === states.AWAIT_DELETE_NAME) {
    deleteState.name = null;
    deleteState.use_name = false;
    deleteState.came_from_idk = false;
    ctx.session.delete = deleteState;
    await askDate(ctx, lang);
    return;
  }
  if (state === states.AWAIT_DELETE_TYPE) {
    deleteState.tx_type = null;
    ctx.session.delete = deleteState;
    if (deleteState.came_from_idk) await askName(ctx, lang);
    else await askDate(ctx, lang);
    return;
  }
  if (state === states.AWAIT_DELETE_PICK) {
    deleteState.matches = [];
    deleteState.selected = [];
    deleteState.button_map = {};
    deleteState.page = 0;
    ctx.session.delete = deleteState;
    await askType(ctx, lang);
    return;
  }
  if (state === states.AWAIT_DELETE_CONFIRM) {
    ctx.session.state = states.AWAIT_DELETE_PICK;
    await showPicker(ctx, user, deleteState);
  }
}

async function handleDate(
  ctx: BotContext,
  user: UserRow,
  deleteState: DeleteState,
  text: string,
): Promise<void> {
  const lang = langOf(user);
  if (isLabel(lang, "common.prev", text)) {
    const [prev] = monthNavTargets(deleteState.year, deleteState.month);
    deleteState.year = prev[0];
    deleteState.month = prev[1];
    ctx.session.delete = deleteState;
    await askDate(ctx, lang);
    return;
  }
  if (isLabel(lang, "common.next", text)) {
    const [, next] = monthNavTargets(deleteState.year, deleteState.month);
    deleteState.year = next[0];
    deleteState.month = next[1];
    ctx.session.delete = deleteState;
    await askDate(ctx, lang);
    return;
  }
  if (isLabel(lang, "common.idk", text)) {
    deleteState.date = null;
    deleteState.use_name = false;
    deleteState.came_from_idk = true;
    ctx.session.delete = deleteState;
    await askName(ctx, lang);
    return;
  }
  const parsed = parseIsoDate(text);
  if (parsed == null) {
    await ctx.reply(t(lang, "errors.bad_date"), {
      reply_markup: calendarKeyboard(lang, deleteState.year, deleteState.month),
    });
    return;
  }
  deleteState.date = parsed;
  deleteState.use_name = false;
  deleteState.came_from_idk = false;
  ctx.session.delete = deleteState;
  await ctx.reply(t(lang, "delete.selected_date", { date: parsed }));
  await askType(ctx, lang);
}

async function handlePick(
  ctx: BotContext,
  user: UserRow,
  deleteState: DeleteState,
  text: string,
): Promise<void> {
  const lang = langOf(user);
  if (text === deleteState.delete_label) {
    if (!deleteState.selected.length) {
      await ctx.reply(t(lang, "delete.none_selected"));
      await showPicker(ctx, user, deleteState);
      return;
    }
    ctx.session.state = states.AWAIT_DELETE_CONFIRM;
    await ctx.reply(t(lang, "delete.confirm", { count: deleteState.selected.length }), {
      reply_markup: yesNo(lang),
    });
    return;
  }
  if (isLabel(lang, "common.page_prev", text)) {
    deleteState.page = Math.max(0, deleteState.page - 1);
    ctx.session.delete = deleteState;
    await showPicker(ctx, user, deleteState);
    return;
  }
  if (isLabel(lang, "common.page_next", text)) {
    deleteState.page += 1;
    ctx.session.delete = deleteState;
    await showPicker(ctx, user, deleteState);
    return;
  }
  const rowNumber = deleteState.button_map[text];
  if (rowNumber != null) {
    const selected = deleteState.selected;
    const index = selected.indexOf(rowNumber);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(rowNumber);
    deleteState.selected = selected;
    ctx.session.delete = deleteState;
    await showPicker(ctx, user, deleteState);
    return;
  }
  await showPicker(ctx, user, deleteState);
}

async function askDate(ctx: BotContext, lang: string): Promise<void> {
  const deleteState = ctx.session.delete as DeleteState;
  ctx.session.state = states.AWAIT_DELETE_DATE;
  const month = `${String(deleteState.year).padStart(4, "0")}-${String(deleteState.month).padStart(2, "0")}`;
  await ctx.reply(t(lang, "delete.ask_date", { month }), {
    reply_markup: calendarKeyboard(lang, deleteState.year, deleteState.month),
  });
}

async function askName(ctx: BotContext, lang: string): Promise<void> {
  ctx.session.state = states.AWAIT_DELETE_NAME;
  await ctx.reply(t(lang, "delete.ask_name"), {
    reply_markup: idkKeyboard(lang),
  });
}

async function askType(ctx: BotContext, lang: string): Promise<void> {
  ctx.session.state = states.AWAIT_DELETE_TYPE;
  await ctx.reply(t(lang, "delete.ask_type"), {
    reply_markup: typeKeyboard(lang),
  });
}

async function queryAndShow(
  ctx: BotContext,
  user: UserRow,
  deleteState: DeleteState,
): Promise<void> {
  const lang = langOf(user);
  if (user.spreadsheet_id == null || user.sheet_id == null) {
    await ctx.reply(t(lang, "errors.generic"), {
      reply_markup: mainMenu(lang),
    });
    return;
  }
  try {
    const entries = await sheets.listEntries(
      ctx.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      user.spreadsheet_id,
      user.sheet_id,
    );
    const matched = filterEntries(entries, {
      on_date: deleteState.date,
      name: deleteState.use_name ? deleteState.name : null,
      tx_type: deleteState.tx_type,
    });
    if (!matched.length) {
      clearFlow(ctx.session);
      await ctx.reply(t(lang, "errors.no_rows"), {
        reply_markup: mainMenu(lang),
      });
      return;
    }
    deleteState.matches = matched;
    deleteState.selected = [];
    deleteState.page = 0;
    ctx.session.delete = deleteState;
    ctx.session.state = states.AWAIT_DELETE_PICK;
    await showPicker(ctx, user, deleteState);
  } catch (exc) {
    if (exc instanceof sheets.SheetError) {
      await replySheetError(ctx, lang, exc);
      return;
    }
    console.error("failed to query rows for delete", exc);
    await ctx.reply(t(lang, "errors.generic"), {
      reply_markup: mainMenu(lang),
    });
  }
}

async function showPicker(ctx: BotContext, user: UserRow, deleteState: DeleteState): Promise<void> {
  const lang = langOf(user);
  const result = rowPicker(lang, deleteState.matches, deleteState.selected, deleteState.page);
  deleteState.page = result.page;
  deleteState.button_map = result.buttonMap;
  deleteState.delete_label = result.deleteLabel;
  ctx.session.delete = deleteState;
  await ctx.reply(t(lang, "delete.pick", { page: result.pageLabel }), {
    reply_markup: result.keyboard,
  });
}

async function deleteSelected(
  ctx: BotContext,
  user: UserRow,
  deleteState: DeleteState,
): Promise<void> {
  const lang = langOf(user);
  const selected = [...deleteState.selected];
  const stored = new Map(deleteState.matches.map((entry) => [entry.row_number, entry]));
  if (user.spreadsheet_id == null || user.sheet_id == null) {
    await ctx.reply(t(lang, "errors.generic"), {
      reply_markup: mainMenu(lang),
    });
    return;
  }
  try {
    const current = await sheets.listEntries(
      ctx.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      user.spreadsheet_id,
      user.sheet_id,
    );
    const currentByRow = new Map(current.map((entry) => [entry.row_number, entry]));
    for (const rowNumber of selected) {
      if (!entriesEqual(stored.get(rowNumber), currentByRow.get(rowNumber))) {
        clearFlow(ctx.session);
        await ctx.reply(t(lang, "errors.sheet_changed"), {
          reply_markup: mainMenu(lang),
        });
        return;
      }
    }
    await sheets.deleteRows(
      ctx.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      user.spreadsheet_id,
      user.sheet_id,
      selected,
    );
  } catch (exc) {
    if (exc instanceof sheets.SheetError) {
      await replySheetError(ctx, lang, exc);
      return;
    }
    console.error("failed to delete rows", exc);
    await ctx.reply(t(lang, "errors.generic"), {
      reply_markup: mainMenu(lang),
    });
    return;
  }
  clearFlow(ctx.session);
  await ctx.reply(t(lang, "delete.done", { count: selected.length }), {
    reply_markup: mainMenu(lang),
  });
}
