import { Context, SessionFlavor } from "grammy";

import { SessionData, UserRow } from "./db";
import { Env } from "./env";

export type BotSession = SessionData;

export type BotContext = Context &
  SessionFlavor<BotSession> & {
    env: Env;
    dbUser: UserRow;
  };

export function nowLocal(timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  return new Date(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second")),
  );
}
