import { Keyboard } from "grammy";

import { t, tList } from "./i18n";
import { Entry, formatNumber, shiftMonth } from "./ledger";

export const PAGE_SIZE = 6;

export const LANGUAGE_LABELS: Record<string, string> = {
  English: "en",
  မြန်မာ: "mm",
  Deutsch: "de",
  日本語: "jp",
};

function markup(rows: string[][]): Keyboard {
  return Keyboard.from(rows).resized();
}

export function navRow(lang: string, back = true): string[] {
  const row: string[] = [];
  if (back) row.push(t(lang, "common.back"));
  row.push(t(lang, "common.cancel"));
  return row;
}

export function mainMenu(lang: string): Keyboard {
  return markup([
    [t(lang, "menu.income"), t(lang, "menu.outcome")],
    [t(lang, "menu.today"), t(lang, "menu.month")],
    [t(lang, "menu.balance")],
    [t(lang, "menu.delete"), t(lang, "menu.settings")],
  ]);
}

export function settingsMenu(lang: string): Keyboard {
  return markup([
    [t(lang, "settings.currency")],
    [t(lang, "settings.language")],
    [t(lang, "settings.nickname")],
    [t(lang, "settings.sheet")],
    navRow(lang),
  ]);
}

export function languageMenu(lang: string): Keyboard {
  return markup([
    ["English"],
    ["မြန်မာ"],
    ["Deutsch"],
    ["日本語"],
    navRow(lang),
  ]);
}

export function cancelOnly(lang: string): Keyboard {
  return markup([navRow(lang, false)]);
}

export function backCancel(lang: string): Keyboard {
  return markup([navRow(lang)]);
}

export function skipKeyboard(lang: string): Keyboard {
  return markup([[t(lang, "common.skip")], navRow(lang)]);
}

export function notApplicableKeyboard(lang: string): Keyboard {
  return markup([[t(lang, "common.not_applicable")], navRow(lang)]);
}

export function confirmAmountKeyboard(lang: string): Keyboard {
  return markup([[t(lang, "common.confirm")], navRow(lang)]);
}

export function yesNo(lang: string): Keyboard {
  return markup([[t(lang, "common.yes"), t(lang, "common.no")], navRow(lang)]);
}

export function typeKeyboard(lang: string): Keyboard {
  return markup([
    [t(lang, "common.income_type"), t(lang, "common.outcome_type")],
    [t(lang, "common.idk")],
    navRow(lang),
  ]);
}

export function idkKeyboard(lang: string): Keyboard {
  return markup([[t(lang, "common.idk")], navRow(lang)]);
}

/** monday-first weeks matching Python calendar.Calendar(firstweekday=0). */
function monthDaysCalendar(year: number, month: number): number[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // JS getUTCDay: Sun=0; Python firstweekday=0 means Monday=0
  const startWeekday = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks: number[][] = [];
  let week: number[] = Array(startWeekday).fill(0);
  for (let day = 1; day <= daysInMonth; day++) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(0);
    weeks.push(week);
  }
  return weeks;
}

export function calendarKeyboard(
  lang: string,
  year: number,
  month: number,
): Keyboard {
  const monthDays = monthDaysCalendar(year, month);
  const rows: string[][] = [[t(lang, "common.prev"), t(lang, "common.next")]];
  for (const week of monthDays) {
    let row: string[] = [];
    for (const day of week) {
      if (day === 0) continue;
      row.push(
        `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      );
      if (row.length === 3) {
        rows.push(row);
        row = [];
      }
    }
    if (row.length) rows.push(row);
  }
  rows.push([t(lang, "common.idk")]);
  rows.push(navRow(lang));
  return markup(rows);
}

export function monthNavTargets(
  year: number,
  month: number,
): [[number, number], [number, number]] {
  return [shiftMonth(year, month, -1), shiftMonth(year, month, 1)];
}

export function monthsNewestFirst(
  year: number,
  currentYear: number,
  currentMonth: number,
): number[] {
  const top = year === currentYear ? currentMonth : 12;
  if (year > currentYear) return [];
  const months: number[] = [];
  for (let month = top; month >= 1; month--) months.push(month);
  return months;
}

export function monthPickerKeyboard(
  lang: string,
  year: number,
  currentYear: number,
  currentMonth: number,
): { keyboard: Keyboard; buttonMap: Record<string, string> } {
  const names = tList(lang, "list.months") as string[];
  const rows: string[][] = [
    [t(lang, "common.prev_year"), t(lang, "common.next_year")],
  ];
  const buttonMap: Record<string, string> = {};
  for (const month of monthsNewestFirst(year, currentYear, currentMonth)) {
    const stamp = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
    const name = names[month - 1] ?? stamp;
    const label = `${name} (${stamp})`;
    buttonMap[label] = stamp;
    rows.push([label]);
  }
  rows.push(navRow(lang));
  return { keyboard: markup(rows), buttonMap };
}

export function rowPicker(
  lang: string,
  entries: Entry[],
  selected: number[],
  page: number,
): {
  keyboard: Keyboard;
  pageLabel: string;
  page: number;
  buttonMap: Record<string, number>;
  deleteLabel: string;
} {
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  page = Math.max(0, Math.min(page, pages - 1));
  const chunk = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const rows: string[][] = [];
  const buttonMap: Record<string, number> = {};
  for (const entry of chunk) {
    const mark = selected.includes(entry.row_number) ? "☑" : "☐";
    const name =
      entry.name.length <= 16 ? entry.name : `${entry.name.slice(0, 15)}…`;
    let label = `${mark} ${entry.date.slice(5)} ${entry.time} ${name} ${formatNumber(entry.amount)}`;
    if (label.length > 64) label = label.slice(0, 64);
    buttonMap[label] = entry.row_number;
    rows.push([label]);
  }
  const nav: string[] = [];
  if (page > 0) nav.push(t(lang, "common.page_prev"));
  if (page + 1 < pages) nav.push(t(lang, "common.page_next"));
  if (nav.length) rows.push(nav);
  const deleteLabel = t(lang, "delete.button", { count: selected.length });
  rows.push([deleteLabel]);
  rows.push(navRow(lang));
  const pageLabel = t(lang, "delete.page", { page: page + 1, pages });
  return {
    keyboard: markup(rows),
    pageLabel,
    page,
    buttonMap,
    deleteLabel,
  };
}

export function isLabel(lang: string, key: string, text: string): boolean {
  return text === t(lang, key);
}

export function menuAction(lang: string, text: string): string | null {
  const mapping: Record<string, string> = {
    [t(lang, "menu.income")]: "income",
    [t(lang, "menu.outcome")]: "outcome",
    [t(lang, "menu.today")]: "today",
    [t(lang, "menu.month")]: "month",
    [t(lang, "menu.balance")]: "balance",
    [t(lang, "menu.delete")]: "delete",
    [t(lang, "menu.settings")]: "settings",
  };
  return mapping[text] ?? null;
}

export function settingsAction(lang: string, text: string): string | null {
  const mapping: Record<string, string> = {
    [t(lang, "settings.currency")]: "currency",
    [t(lang, "settings.language")]: "language",
    [t(lang, "settings.nickname")]: "nickname",
    [t(lang, "settings.sheet")]: "sheet",
  };
  return mapping[text] ?? null;
}

export function languageCode(text: string): string | null {
  return LANGUAGE_LABELS[text] ?? null;
}
