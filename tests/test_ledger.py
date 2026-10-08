"""ledger math, sheet row parsing, and locale catalogs."""

import json
import unittest
from decimal import Decimal
from pathlib import Path

from bot import db, i18n
from bot.keyboards import months_newest_first
from bot.ledger import (
    Entry,
    default_name,
    filter_entries,
    format_number,
    multiply,
    parse_iso_date,
    parse_positive_number,
    parse_spreadsheet_id,
    shift_month,
    totals,
)
from bot.sheets import deletion_requests, entries_from_values

ROOT = Path(__file__).resolve().parent.parent


def entry(**kwargs) -> Entry:
    base = dict(
        row_number=2,
        date="2026-10-08",
        time="09:15",
        name="Salary",
        type="income",
        unit_amount=None,
        units=None,
        amount=Decimal("3000"),
    )
    base.update(kwargs)
    return Entry(**base)


class LedgerTests(unittest.TestCase):
    def test_defaults_and_product(self):
        self.assertEqual(default_name("income"), "Income")
        self.assertEqual(default_name("outcome"), "Outcome")
        self.assertEqual(multiply(Decimal("3"), Decimal("1000")), Decimal("3000"))
        self.assertEqual(multiply(Decimal("0.1"), Decimal("3")), Decimal("0.3"))

    def test_parse_numbers_and_dates(self):
        self.assertEqual(parse_positive_number("1,000.50"), Decimal("1000.50"))
        self.assertIsNone(parse_positive_number("0"))
        self.assertIsNone(parse_positive_number("-4"))
        self.assertIsNone(parse_positive_number("nope"))
        self.assertEqual(parse_iso_date("2026-10-08"), "2026-10-08")
        self.assertIsNone(parse_iso_date("2026-13-01"))
        self.assertEqual(format_number(Decimal("3000")), "3,000")
        self.assertEqual(format_number(Decimal("-4.5")), "-4.5")
        self.assertEqual(format_number(Decimal("10.50")), "10.5")

    def test_spreadsheet_url(self):
        url = "https://docs.google.com/spreadsheets/d/abc123_DEF-456/edit#gid=0"
        self.assertEqual(parse_spreadsheet_id(url), "abc123_DEF-456")
        self.assertIsNone(parse_spreadsheet_id("https://example.com"))

    def test_filters_and_balance(self):
        rows = [
            entry(row_number=2, date="2026-10-08", type="income", amount=Decimal("10")),
            entry(
                row_number=3,
                date="2026-10-08",
                name="Rent",
                type="outcome",
                amount=Decimal("4"),
                units=Decimal("2"),
                unit_amount=Decimal("2"),
            ),
            entry(
                row_number=4,
                date="2026-09-30",
                name="Salary bonus",
                type="income",
                amount=Decimal("7"),
            ),
            entry(
                row_number=5,
                date="2026-10-02",
                name="Gift",
                type="other",
                amount=Decimal("100"),
            ),
        ]
        self.assertEqual(
            [row.row_number for row in filter_entries(rows, on_date="2026-10-08")],
            [2, 3],
        )
        self.assertEqual(
            [row.row_number for row in filter_entries(rows, year_month="2026-10")],
            [2, 3, 5],
        )
        self.assertEqual(
            [row.row_number for row in filter_entries(rows, name="salary")],
            [2],
        )
        self.assertEqual(
            [row.row_number for row in filter_entries(rows, name="Salary", tx_type="outcome")],
            [],
        )
        sums = totals(rows)
        self.assertEqual(sums["income"], Decimal("17"))
        self.assertEqual(sums["outcome"], Decimal("4"))
        self.assertEqual(sums["remaining"], Decimal("13"))
        self.assertEqual(totals([])["remaining"], Decimal("0"))

    def test_month_shift(self):
        self.assertEqual(shift_month(2026, 1, -1), (2025, 12))
        self.assertEqual(shift_month(2026, 12, 1), (2027, 1))

    def test_months_newest_first(self):
        self.assertEqual(months_newest_first(2026, 2026, 10), list(range(10, 0, -1)))
        self.assertEqual(months_newest_first(2025, 2026, 10), list(range(12, 0, -1)))
        self.assertEqual(months_newest_first(2027, 2026, 10), [])

    def test_sheet_values_and_delete_order(self):
        values = [
            ["Date", "Time", "Name", "Type", "Unit Amount", "Units", "Amount"],
            ["2026-10-08", "09:15", "Income", "income", "", "", "3000"],
            ["", "", "", "", "", "", ""],
            ["2026-10-08", "10:00", "Tea", "OUTCOME", "500", "2", "900"],
        ]
        parsed = entries_from_values(values)
        self.assertEqual(parsed[0].row_number, 2)
        self.assertIsNone(parsed[0].units)
        self.assertIsNone(parsed[0].unit_amount)
        self.assertEqual(parsed[0].amount, Decimal("3000"))
        self.assertEqual(parsed[1].row_number, 4)
        self.assertEqual(parsed[1].type, "outcome")
        self.assertEqual(parsed[1].units, Decimal("2"))
        self.assertEqual(parsed[1].amount, Decimal("900"))
        requests = deletion_requests(99, [4, 2, 4])
        indexes = [item["deleteDimension"]["range"]["startIndex"] for item in requests]
        self.assertEqual(indexes, [3, 1])
        self.assertEqual(requests[0]["deleteDimension"]["range"]["sheetId"], 99)

    def test_locale_keys_match_english(self):
        catalogs = {
            code: json.loads((ROOT / "locales" / f"{code}.json").read_text(encoding="utf-8"))
            for code in ("en", "my", "de", "ja")
        }

        def keys(node, prefix=""):
            found = set()
            for key, value in node.items():
                path = f"{prefix}{key}"
                if isinstance(value, dict):
                    found |= keys(value, path + ".")
                else:
                    found.add(path)
            return found

        english = keys(catalogs["en"])
        for code, catalog in catalogs.items():
            self.assertEqual(keys(catalog), english, code)
        self.assertIn("menu.income", english)
        self.assertEqual(i18n.t("en", "menu.income"), "Add Income")
        self.assertEqual(i18n.t("missing", "menu.delete"), i18n.t("en", "menu.delete"))
        self.assertEqual(len(i18n.t_list("ja", "calendar.weekdays")), 7)
        self.assertEqual(len(i18n.t_list("en", "list.months")), 12)
        self.assertIn("confirm_amount", i18n._lookup("en", "income"))

    def test_user_settings_roundtrip(self):
        import tempfile

        from bot import config

        with tempfile.TemporaryDirectory() as folder:
            original = config.sqlite_path
            config.sqlite_path = lambda: Path(folder) / "bot.db"
            try:
                db.init()
                created = db.ensure_user(42)
                self.assertEqual(created["currency"], "MMK")
                self.assertEqual(created["language"], "en")
                updated = db.update_user(
                    42,
                    nickname="Danny",
                    language="de",
                    currency="EUR",
                    spreadsheet_id="sheet",
                    sheet_id=7,
                    sheet_title="Transactions",
                )
                self.assertEqual(updated["nickname"], "Danny")
                self.assertTrue(db.is_ready(updated))
                self.assertEqual(db.get_user(42)["sheet_title"], "Transactions")
            finally:
                config.sqlite_path = original


if __name__ == "__main__":
    unittest.main()
