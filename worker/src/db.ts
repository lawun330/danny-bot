export interface UserRow {
  telegram_id: number;
  nickname: string | null;
  language: string;
  currency: string;
  spreadsheet_id: string | null;
  sheet_id: number | null;
  sheet_title: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = new Set([
  "nickname",
  "language",
  "currency",
  "spreadsheet_id",
  "sheet_id",
  "sheet_title",
]);

function nowIso(): string {
  return new Date().toISOString();
}

export async function getUser(
  db: D1Database,
  telegramId: number,
): Promise<UserRow | null> {
  return (
    (await db
      .prepare("SELECT * FROM users WHERE telegram_id = ?")
      .bind(telegramId)
      .first<UserRow>()) ?? null
  );
}

export async function ensureUser(
  db: D1Database,
  telegramId: number,
): Promise<UserRow> {
  const existing = await getUser(db, telegramId);
  if (existing) return existing;
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO users (telegram_id, language, currency, created_at, updated_at)
       VALUES (?, 'en', 'MMK', ?, ?)`,
    )
    .bind(telegramId, now, now)
    .run();
  const created = await getUser(db, telegramId);
  if (!created) throw new Error("failed to create user");
  return created;
}

export async function updateUser(
  db: D1Database,
  telegramId: number,
  fields: Partial<
    Pick<
      UserRow,
      | "nickname"
      | "language"
      | "currency"
      | "spreadsheet_id"
      | "sheet_id"
      | "sheet_title"
    >
  >,
): Promise<UserRow> {
  const unknown = Object.keys(fields).filter((key) => !COLUMNS.has(key));
  if (unknown.length) {
    throw new Error(`unknown user fields: ${unknown.sort().join(", ")}`);
  }
  await ensureUser(db, telegramId);
  if (!Object.keys(fields).length) {
    const user = await getUser(db, telegramId);
    if (!user) throw new Error("user missing");
    return user;
  }
  const payload = { ...fields, updated_at: nowIso() };
  const assignments = Object.keys(payload)
    .map((column) => `${column} = ?`)
    .join(", ");
  const values = [...Object.values(payload), telegramId];
  await db
    .prepare(`UPDATE users SET ${assignments} WHERE telegram_id = ?`)
    .bind(...values)
    .run();
  const user = await getUser(db, telegramId);
  if (!user) throw new Error("user missing after update");
  return user;
}

export function hasSheet(user: UserRow | null): boolean {
  return Boolean(user && user.spreadsheet_id && user.sheet_id != null);
}

export function isReady(user: UserRow | null): boolean {
  return hasSheet(user) && Boolean(user?.nickname);
}

export type SessionData = Record<string, unknown>;

export async function loadSession(
  db: D1Database,
  telegramId: number,
): Promise<SessionData> {
  const row = await db
    .prepare("SELECT data FROM sessions WHERE telegram_id = ?")
    .bind(telegramId)
    .first<{ data: string }>();
  if (!row?.data) return {};
  try {
    const parsed = JSON.parse(row.data) as SessionData;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveSession(
  db: D1Database,
  telegramId: number,
  data: SessionData,
): Promise<void> {
  const now = nowIso();
  const json = JSON.stringify(data);
  await db
    .prepare(
      `INSERT INTO sessions (telegram_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .bind(telegramId, json, now)
    .run();
}

export function clearFlow(session: SessionData): void {
  for (const key of Object.keys(session)) {
    delete session[key];
  }
}
