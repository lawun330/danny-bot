import { describe, expect, it } from "vitest";

import {
  filterEntries,
  formatNumber,
  parsePositiveNumber,
  parseSpreadsheetId,
  shiftMonth,
  totals,
} from "./ledger";

describe("ledger", () => {
  it("parses spreadsheet urls and bare ids", () => {
    expect(
      parseSpreadsheetId(
        "https://docs.google.com/spreadsheets/d/abcDEF1234567890_-/edit",
      ),
    ).toBe("abcDEF1234567890_-");
    expect(parseSpreadsheetId("abcDEF1234567890_-zzzz")).toBe(
      "abcDEF1234567890_-zzzz",
    );
    expect(parseSpreadsheetId("nope")).toBeNull();
  });

  it("parses positive numbers", () => {
    expect(parsePositiveNumber("1,200.5")).toBe("1200.5");
    expect(parsePositiveNumber("-1")).toBeNull();
    expect(parsePositiveNumber("abc")).toBeNull();
  });

  it("formats and totals", () => {
    expect(formatNumber("1000")).toBe("1,000");
    const sums = totals([
      {
        row_number: 2,
        date: "2026-01-01",
        time: "10:00",
        name: "a",
        type: "income",
        unit_amount: null,
        units: null,
        amount: "100",
      },
      {
        row_number: 3,
        date: "2026-01-01",
        time: "11:00",
        name: "b",
        type: "outcome",
        unit_amount: null,
        units: null,
        amount: "40",
      },
    ]);
    expect(sums.remaining).toBe("60");
  });

  it("filters and shifts months", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual([2025, 12]);
    const entries = [
      {
        row_number: 2,
        date: "2026-03-01",
        time: "10:00",
        name: "x",
        type: "outcome",
        unit_amount: null,
        units: null,
        amount: "1",
      },
    ];
    expect(filterEntries(entries, { year_month: "2026-03" })).toHaveLength(1);
    expect(filterEntries(entries, { year_month: "2026-02" })).toHaveLength(0);
  });
});
