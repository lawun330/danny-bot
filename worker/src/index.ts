import { Bot, session, webhookCallback } from "grammy";

import { BotContext, BotSession } from "./context";
import { ensureUser, loadSession, saveSession } from "./db";
import { Env } from "./env";
import { cancel, menu, onText, start } from "./handlers/router";

function createBot(env: Env): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

  bot.use(async (ctx, next) => {
    ctx.env = env;
    await next();
  });

  bot.use(
    session({
      initial: (): BotSession => ({}),
      getSessionKey: (ctx) =>
        ctx.from?.id != null ? String(ctx.from.id) : undefined,
      storage: {
        read: async (key) => loadSession(env.DB, Number(key)),
        write: async (key, value) =>
          saveSession(env.DB, Number(key), value ?? {}),
        delete: async (key) => saveSession(env.DB, Number(key), {}),
      },
    }),
  );

  bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    ctx.dbUser = await ensureUser(env.DB, ctx.from.id);
    await next();
  });

  bot.command("start", start);
  bot.command("menu", menu);
  bot.command("cancel", cancel);
  bot.on("message:text", onText);

  bot.catch((err) => {
    console.error("bot error", err);
  });

  return bot;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "GET") {
      return new Response("danny-bot worker ok", { status: 200 });
    }
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }

    if (!env.TELEGRAM_BOT_TOKEN) {
      return new Response("missing bot token", { status: 500 });
    }

    const bot = createBot(env);
    const handleUpdate = webhookCallback(bot, "cloudflare-mod");
    return handleUpdate(request);
  },
};
