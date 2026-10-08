"""lookup user-facing strings from one json file per language."""

import json

from bot import config

_LANGS = ("en", "mm", "de", "jp")
_CATALOGS: dict[str, dict] = {}


def load() -> None:
    _CATALOGS.clear()
    for lang in _LANGS:
        path = config.LOCALES_DIR / f"{lang}.json"
        _CATALOGS[lang] = json.loads(path.read_text(encoding="utf-8"))


def languages() -> tuple[str, ...]:
    return _LANGS


def t(lang: str, key: str, **kwargs) -> str:
    value = _lookup(lang, key)
    if not isinstance(value, str):
        value = _lookup("en", key)
    if not isinstance(value, str):
        return key
    if kwargs:
        return value.format(**kwargs)
    return value


def t_list(lang: str, key: str) -> list:
    value = _lookup(lang, key)
    if not isinstance(value, list):
        value = _lookup("en", key)
    if not isinstance(value, list):
        return []
    return value


def _lookup(lang: str, key: str):
    node = _CATALOGS.get(lang) or _CATALOGS.get("en")
    if node is None:
        return None
    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


load()
