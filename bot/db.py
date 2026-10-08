"""sqlite storage for each telegram user's settings."""

import sqlite3
from datetime import UTC, datetime

from bot import config

_COLUMNS = {
    "nickname",
    "language",
    "currency",
    "spreadsheet_id",
    "sheet_id",
    "sheet_title",
}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.sqlite_path())
    conn.row_factory = sqlite3.Row
    return conn


def init() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                telegram_id INTEGER PRIMARY KEY,
                nickname TEXT,
                language TEXT NOT NULL DEFAULT 'en',
                currency TEXT NOT NULL DEFAULT 'MMK',
                spreadsheet_id TEXT,
                sheet_id INTEGER,
                sheet_title TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def get_user(telegram_id: int) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE telegram_id = ?",
            (telegram_id,),
        ).fetchone()
    return dict(row) if row else None


def ensure_user(telegram_id: int) -> dict:
    existing = get_user(telegram_id)
    if existing:
        return existing
    now = _now()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO users (
                telegram_id, language, currency, created_at, updated_at
            ) VALUES (?, 'en', 'MMK', ?, ?)
            """,
            (telegram_id, now, now),
        )
    return get_user(telegram_id)


def update_user(telegram_id: int, **fields) -> dict:
    unknown = set(fields) - _COLUMNS
    if unknown:
        raise ValueError(f"unknown user fields: {sorted(unknown)}")
    ensure_user(telegram_id)
    if not fields:
        return get_user(telegram_id)
    fields["updated_at"] = _now()
    assignments = ", ".join(f"{column} = ?" for column in fields)
    values = list(fields.values()) + [telegram_id]
    with _connect() as conn:
        conn.execute(
            f"UPDATE users SET {assignments} WHERE telegram_id = ?",
            values,
        )
    return get_user(telegram_id)


def has_sheet(user: dict | None) -> bool:
    return bool(user and user.get("spreadsheet_id") and user.get("sheet_id") is not None)


def is_ready(user: dict | None) -> bool:
    return has_sheet(user) and bool(user.get("nickname"))


def _now() -> str:
    return datetime.now(UTC).isoformat()
