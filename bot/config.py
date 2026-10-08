"""runtime settings loaded from the environment."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv(
    "GOOGLE_SERVICE_ACCOUNT_FILE", "service-account.json"
).strip()
TIMEZONE = os.getenv("TIMEZONE", "Asia/Yangon").strip() or "Asia/Yangon"
LOCALES_DIR = ROOT / "locales"


def sqlite_path() -> Path:
    return ROOT / "bot.db"


def service_account_path() -> Path:
    path = Path(GOOGLE_SERVICE_ACCOUNT_FILE)
    if not path.is_absolute():
        path = ROOT / path
    return path
