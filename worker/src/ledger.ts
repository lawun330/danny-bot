/** pure ledger helpers. no telegram or google calls. */

const SPREADSHEET_ID = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
const BARE_ID = /^[a-zA-Z0-9-_]{20,}$/;

export type DecimalStr = string;

export interface Entry {
  row_number: number;
  date: string;
  time: string;
  name: string;
  type: string;
  unit_amount: DecimalStr | null;
  units: DecimalStr | null;
  amount: DecimalStr;
}

export function parseSpreadsheetId(text: string): string | null {
  const cleaned = text.trim();
  const match = SPREADSHEET_ID.exec(cleaned);
  if (match) return match[1];
  if (BARE_ID.test(cleaned)) return cleaned;
  return null;
}

export function defaultName(txType: string): string {
  if (txType === "income") return "Income";
  if (txType === "outcome") return "Outcome";
  throw new Error(txType);
}

function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return value;
}

export function parsePositiveNumber(text: string): DecimalStr | null {
  const value = parseNumber(text);
  if (value === null || value <= 0) return null;
  return normalizeDecimal(value);
}

export function parseDecimal(text: string): DecimalStr | null {
  const value = parseNumber(text);
  if (value === null) return null;
  return normalizeDecimal(value);
}

export function parseIsoDate(text: string): string | null {
  const cleaned = text.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return null;
  const parsed = new Date(`${cleaned}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const [y, m, d] = cleaned.split("-").map(Number);
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() + 1 !== m ||
    parsed.getUTCDate() !== d
  ) {
    return null;
  }
  return cleaned;
}

function normalizeDecimal(value: number): DecimalStr {
  if (Number.isInteger(value)) return String(value);
  let text = String(value);
  if (text.includes("e") || text.includes("E")) {
    text = value.toFixed(12);
  }
  if (text.includes(".")) {
    text = text.replace(/\.?0+$/, "");
  }
  return text;
}

export function decimalToSheet(value: DecimalStr): string {
  let text = value;
  if (text.includes(".")) {
    text = text.replace(/\.?0+$/, "");
  }
  return text;
}

export function formatNumber(value: DecimalStr | number): string {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (Number.isInteger(num)) {
    return Math.trunc(num).toLocaleString("en-US");
  }
  const rendered = String(num);
  const [wholeRaw, fracRaw = ""] = rendered.split(".");
  const frac = fracRaw.replace(/0+$/, "");
  let sign = "";
  let whole = wholeRaw;
  if (whole.startsWith("-")) {
    sign = "-";
    whole = whole.slice(1);
  }
  return `${sign}${Number(whole).toLocaleString("en-US")}.${frac}`;
}

export function multiply(units: DecimalStr, unitAmount: DecimalStr): DecimalStr {
  return normalizeDecimal(Number(units) * Number(unitAmount));
}

export function filterEntries(
  entries: Entry[],
  opts: {
    on_date?: string | null;
    year_month?: string | null;
    name?: string | null;
    tx_type?: string | null;
  } = {},
): Entry[] {
  const nameKey = opts.name != null ? opts.name.toLowerCase() : null;
  return entries.filter((entry) => {
    if (opts.on_date != null && entry.date !== opts.on_date) return false;
    if (opts.year_month != null && !entry.date.startsWith(`${opts.year_month}-`)) {
      return false;
    }
    if (nameKey != null && entry.name.toLowerCase() !== nameKey) return false;
    if (opts.tx_type != null && entry.type !== opts.tx_type) return false;
    return true;
  });
}

export function totals(entries: Entry[]): {
  income: DecimalStr;
  outcome: DecimalStr;
  remaining: DecimalStr;
} {
  let income = 0;
  let outcome = 0;
  for (const entry of entries) {
    const amount = Number(entry.amount);
    if (entry.type === "income") income += amount;
    else if (entry.type === "outcome") outcome += amount;
  }
  return {
    income: normalizeDecimal(income),
    outcome: normalizeDecimal(outcome),
    remaining: normalizeDecimal(income - outcome),
  };
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): [number, number] {
  const index = year * 12 + (month - 1) + delta;
  return [Math.floor(index / 12), (index % 12) + 1];
}

export function entriesEqual(a: Entry | undefined, b: Entry | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.row_number === b.row_number &&
    a.date === b.date &&
    a.time === b.time &&
    a.name === b.name &&
    a.type === b.type &&
    a.unit_amount === b.unit_amount &&
    a.units === b.units &&
    a.amount === b.amount
  );
}
