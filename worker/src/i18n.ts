import de from "./locales/de.json";
import en from "./locales/en.json";
import jp from "./locales/jp.json";
import mm from "./locales/mm.json";

type Catalog = Record<string, unknown>;

const CATALOGS: Record<string, Catalog> = {
  en: en as Catalog,
  mm: mm as Catalog,
  de: de as Catalog,
  jp: jp as Catalog,
};

const LANGS = ["en", "mm", "de", "jp"] as const;

export function languages(): readonly string[] {
  return LANGS;
}

export function t(
  lang: string,
  key: string,
  kwargs: Record<string, string | number> = {},
): string {
  let value = lookup(lang, key);
  if (typeof value !== "string") value = lookup("en", key);
  if (typeof value !== "string") return key;
  return Object.keys(kwargs).reduce(
    (text, name) => text.replaceAll(`{${name}}`, String(kwargs[name])),
    value,
  );
}

export function tList(lang: string, key: string): unknown[] {
  let value = lookup(lang, key);
  if (!Array.isArray(value)) value = lookup("en", key);
  if (!Array.isArray(value)) return [];
  return value;
}

function lookup(lang: string, key: string): unknown {
  let node: unknown = CATALOGS[lang] ?? CATALOGS.en;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object" || !(part in (node as object))) {
      return undefined;
    }
    node = (node as Catalog)[part];
  }
  return node;
}
