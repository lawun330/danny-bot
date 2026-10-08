import { DecimalStr, Entry, decimalToSheet, parseDecimal } from "./ledger";

export const HEADERS = ["Date", "Time", "Name", "Type", "Unit Amount", "Units", "Amount"];
const BASE_TITLE = "Transactions";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export class SheetError extends Error {
  constructor(message = "sheet error") {
    super(message);
    this.name = "SheetError";
  }
}
export class BadSheetUrl extends SheetError {
  constructor() {
    super("bad sheet url");
    this.name = "BadSheetUrl";
  }
}
export class SheetNotShared extends SheetError {
  constructor() {
    super("sheet not shared");
    this.name = "SheetNotShared";
  }
}
export class SheetTabMissing extends SheetError {
  constructor() {
    super("sheet tab missing");
    this.name = "SheetTabMissing";
  }
}
export class CredentialsMissing extends SheetError {
  constructor() {
    super("credentials missing");
    this.name = "CredentialsMissing";
  }
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function parseServiceAccount(raw: string): ServiceAccount {
  try {
    const data = JSON.parse(raw) as ServiceAccount;
    if (!data.client_email || !data.private_key) throw new CredentialsMissing();
    return data;
  } catch (exc) {
    if (exc instanceof SheetError) throw exc;
    throw new CredentialsMissing();
  }
}

export function serviceAccountEmail(rawJson: string): string | null {
  try {
    const email = parseServiceAccount(rawJson).client_email;
    return email || null;
  } catch {
    return null;
  }
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64Url(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(rawJson: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.accessToken;
  }
  const sa = parseServiceAccount(rawJson);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SHEETS_SCOPE,
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!response.ok) {
    throw new CredentialsMissing();
  }
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!payload.access_token) throw new CredentialsMissing();
  cachedToken = {
    accessToken: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600),
  };
  return payload.access_token;
}

async function sheetsFetch(
  rawJson: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken(rawJson);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new SheetNotShared();
  }
  return response;
}

interface SpreadsheetMeta {
  sheets?: Array<{
    properties?: { sheetId?: number; title?: string };
  }>;
}

async function getSpreadsheet(rawJson: string, spreadsheetId: string): Promise<SpreadsheetMeta> {
  const response = await sheetsFetch(
    rawJson,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
  );
  if (!response.ok) {
    const text = await response.text();
    if (isAccessText(text) || response.status === 400) throw new SheetNotShared();
    throw new SheetError(text);
  }
  return (await response.json()) as SpreadsheetMeta;
}

function isAccessText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("permission") ||
    lower.includes("not found") ||
    lower.includes("403") ||
    lower.includes("404")
  );
}

export function entriesFromValues(values: string[][]): Entry[] {
  const entries: Entry[] = [];
  for (let offset = 1; offset < values.length; offset++) {
    const raw = values[offset] ?? [];
    if (!raw.some((cell) => String(cell ?? "").trim())) continue;
    const padded = [...raw.map((cell) => String(cell ?? "")), "", "", "", "", "", "", ""].slice(
      0,
      7,
    );
    const amount = parseDecimal(padded[6]);
    entries.push({
      row_number: offset + 1,
      date: padded[0].trim(),
      time: padded[1].trim(),
      name: padded[2].trim(),
      type: padded[3].trim().toLowerCase(),
      unit_amount: parseDecimal(padded[4]),
      units: parseDecimal(padded[5]),
      amount: amount ?? "0",
    });
  }
  return entries;
}

export async function listEntries(
  rawJson: string,
  spreadsheetId: string,
  sheetId: number,
): Promise<Entry[]> {
  const meta = await getSpreadsheet(rawJson, spreadsheetId);
  const sheet = meta.sheets?.find((item) => item.properties?.sheetId === sheetId);
  const title = sheet?.properties?.title;
  if (!title) throw new SheetTabMissing();
  const encodedTitle = encodeURIComponent(title);
  const response = await sheetsFetch(
    rawJson,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedTitle}`,
  );
  if (!response.ok) {
    throw new SheetError(await response.text());
  }
  const payload = (await response.json()) as { values?: string[][] };
  return entriesFromValues(payload.values ?? []);
}

export async function appendEntry(
  rawJson: string,
  spreadsheetId: string,
  sheetId: number,
  opts: {
    when: Date;
    name: string;
    txType: string;
    unitAmount: DecimalStr | null | undefined;
    units: DecimalStr | null | undefined;
    amount: DecimalStr;
  },
): Promise<void> {
  const meta = await getSpreadsheet(rawJson, spreadsheetId);
  const sheet = meta.sheets?.find((item) => item.properties?.sheetId === sheetId);
  const title = sheet?.properties?.title;
  if (!title) throw new SheetTabMissing();
  // when is already wall-clock time in the bot timezone
  const row = [
    formatLocalDate(opts.when),
    formatLocalTime(opts.when),
    opts.name,
    opts.txType,
    opts.unitAmount == null ? "" : decimalToSheet(opts.unitAmount),
    opts.units == null ? "" : decimalToSheet(opts.units),
    decimalToSheet(opts.amount),
  ];
  const range = encodeURIComponent(`${title}!A:G`);
  const response = await sheetsFetch(
    rawJson,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values: [row] }),
    },
  );
  if (!response.ok) {
    throw new SheetError(await response.text());
  }
}

function formatLocalDate(when: Date): string {
  const y = when.getFullYear();
  const m = String(when.getMonth() + 1).padStart(2, "0");
  const d = String(when.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatLocalTime(when: Date): string {
  const h = String(when.getHours()).padStart(2, "0");
  const min = String(when.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

export function deletionRequests(
  sheetId: number,
  rowNumbers: number[],
): Array<Record<string, unknown>> {
  const unique = [...new Set(rowNumbers)].sort((a, b) => b - a);
  return unique.map((rowNumber) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: "ROWS",
        startIndex: rowNumber - 1,
        endIndex: rowNumber,
      },
    },
  }));
}

export async function deleteRows(
  rawJson: string,
  spreadsheetId: string,
  sheetId: number,
  rowNumbers: number[],
): Promise<void> {
  if (!rowNumbers.length) return;
  const response = await sheetsFetch(
    rawJson,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({ requests: deletionRequests(sheetId, rowNumbers) }),
    },
  );
  if (!response.ok) {
    throw new SheetError(await response.text());
  }
}

export async function linkNewTab(
  rawJson: string,
  spreadsheetId: string,
): Promise<{ spreadsheetId: string; sheetId: number; title: string }> {
  const meta = await getSpreadsheet(rawJson, spreadsheetId);
  const titles = new Set(
    (meta.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title)),
  );
  let title = BASE_TITLE;
  let suffix = 2;
  while (titles.has(title)) {
    title = `${BASE_TITLE} ${suffix}`;
    suffix += 1;
  }
  const addResponse = await sheetsFetch(
    rawJson,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: HEADERS.length,
                },
              },
            },
          },
        ],
      }),
    },
  );
  if (!addResponse.ok) {
    throw new SheetError(await addResponse.text());
  }
  const added = (await addResponse.json()) as {
    replies?: Array<{ addSheet?: { properties?: { sheetId?: number; title?: string } } }>;
  };
  const sheetId = added.replies?.[0]?.addSheet?.properties?.sheetId;
  const createdTitle = added.replies?.[0]?.addSheet?.properties?.title ?? title;
  if (sheetId == null) throw new SheetError("missing sheet id after create");

  try {
    const headerResponse = await sheetsFetch(
      rawJson,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${createdTitle}!A1:G1`)}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({ values: [HEADERS] }),
      },
    );
    if (!headerResponse.ok) {
      throw new SheetError(await headerResponse.text());
    }
    const freezeResponse = await sheetsFetch(
      rawJson,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId,
                  gridProperties: { frozenRowCount: 1 },
                },
                fields: "gridProperties.frozenRowCount",
              },
            },
          ],
        }),
      },
    );
    if (!freezeResponse.ok) {
      throw new SheetError(await freezeResponse.text());
    }
  } catch (exc) {
    try {
      await sheetsFetch(
        rawJson,
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: "POST",
          body: JSON.stringify({
            requests: [{ deleteSheet: { sheetId } }],
          }),
        },
      );
    } catch {
      // ignore cleanup failure
    }
    throw exc;
  }

  return { spreadsheetId, sheetId, title: createdTitle };
}
