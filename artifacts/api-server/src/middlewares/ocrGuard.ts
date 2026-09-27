import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import {
  addressKey,
  checkUsage,
  clientAddress,
  policyFromEnv,
  translateTooBig,
  type Bump,
  type Caller,
  type Route,
} from "../lib/usage-limits.js";

/**
 * Meters POST /api/ocr and POST /api/ocr/translate. Guests are NOT refused:
 * the App Store listing promises scanning with no account. They are limited
 * by network address instead, signed-in users by account, and everyone
 * together by a daily ceiling. See lib/usage-limits.ts for the numbers.
 *
 * Counters live in Postgres, not in memory: the deployment is autoscale, so
 * there can be several copies of this server, and each one starts empty.
 *
 * If the database does not answer within DB_WAIT_MS, the call goes ahead
 * unmetered. A slow database must never stop someone splitting a bill.
 */

const POLICY = policyFromEnv(process.env);

// Behind Google's load balancer (Replit deployments) there is one public hop
// to skip; on the dev workspace there is none. OCR_PROXY_PUBLIC_HOPS overrides.
const hopsEnv = process.env.OCR_PROXY_PUBLIC_HOPS;
const PUBLIC_HOPS = hopsEnv && /^\d+$/.test(hopsEnv) ? Number(hopsEnv) : process.env.REPLIT_DEPLOYMENT ? 1 : 0;

const DB_WAIT_MS = 2_000;

// Must match lib/db/src/schema/usage-counters.ts, or `drizzle-kit push --force`
// will rewrite the table.
const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS "usage_counters" (
  "key" text PRIMARY KEY NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
)`;

let tableReady: Promise<unknown> | null = null;
function ensureTable(): Promise<unknown> {
  tableReady ??= pool.query(CREATE_TABLE).catch((err) => {
    tableReady = null;
    throw err;
  });
  return tableReady;
}

let lastSweep = 0;
function sweep(): void {
  const now = Date.now();
  if (now - lastSweep < 60 * 60 * 1000) return;
  lastSweep = now;
  pool
    .query(`DELETE FROM usage_counters WHERE expires_at < now() - interval '1 hour'`)
    .catch((err) => logger.warn({ err }, "ocr-guard: could not sweep old counters"));
}

const bump: Bump = async (counters) => {
  await ensureTable();
  const { rows } = await pool.query<{ key: string; count: number }>(
    `INSERT INTO usage_counters (key, count, expires_at)
     SELECT k, 1, e FROM unnest($1::text[], $2::timestamptz[]) AS t(k, e)
     ON CONFLICT (key) DO UPDATE SET count = usage_counters.count + 1
     RETURNING key, count`,
    [counters.map((c) => c.key), counters.map((c) => c.expiresAt.toISOString())],
  );
  sweep();
  return new Map(rows.map((r) => [r.key, r.count]));
};

function withDeadline<T>(work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer in ${DB_WAIT_MS}ms`)), DB_WAIT_MS);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

let chainLogged = false;

function whoIsCalling(req: Request): Caller {
  let userId: string | null = null;
  try {
    userId = getAuth(req).userId;
  } catch (err) {
    // A broken session is a guest, never a failed scan.
    logger.warn({ err }, "ocr-guard: could not read the session; counting as a guest");
  }
  if (userId) return { kind: "user", id: userId };
  const forwarded = req.headers["x-forwarded-for"];
  const { address, local } = clientAddress(
    Array.isArray(forwarded) ? forwarded.join(",") : forwarded,
    req.socket.remoteAddress,
    PUBLIC_HOPS,
  );
  if (!chainLogged && !local) {
    // Once per server start: shows which address was picked out of the
    // chain, so a change in the hosting's proxies is visible in the logs.
    chainLogged = true;
    logger.info({ forwarded, picked: address, publicHops: PUBLIC_HOPS }, "ocr-guard: client address");
  }
  return local ? { kind: "local", id: address } : { kind: "guest", id: addressKey(address) };
}

export function ocrGuard(req: Request, res: Response, next: NextFunction): void {
  const route: Route | null =
    req.method !== "POST" ? null : req.path === "/" ? "scan" : req.path === "/translate" ? "translate" : null;
  if (!route) {
    next();
    return;
  }

  if (route === "translate" && translateTooBig(req.body?.descriptions)) {
    res.status(413).json({ error: "Too many items to translate at once." });
    return;
  }

  const caller = whoIsCalling(req);
  withDeadline(checkUsage(bump, route, POLICY[route], caller, new Date()))
    .then((verdict) => {
      if (verdict.ok) {
        if (verdict.limit !== null && verdict.remaining !== null) {
          res.setHeader("RateLimit-Limit", String(verdict.limit));
          res.setHeader("RateLimit-Remaining", String(verdict.remaining));
          res.setHeader("RateLimit-Reset", String(verdict.resetSeconds));
        }
        next();
        return;
      }
      if (verdict.reason === "ceiling") {
        if (verdict.ceilingJustHit) {
          logger.error(
            { route, ceiling: POLICY[route].dailyCeiling },
            `ocr-guard: DAILY CEILING REACHED for ${route}. Refusing every ${route} call until 00:00 UTC.`,
          );
        }
      } else {
        logger.info({ route, caller: caller.kind, id: caller.id, count: verdict.count }, "ocr-guard: caller over limit");
      }
      res.setHeader("Retry-After", String(verdict.retryAfterSeconds));
      res.status(429).json({ error: verdict.message });
    })
    .catch((err) => {
      logger.error({ err, route }, "ocr-guard: counters unavailable, letting the call through unmetered");
      next();
    });
}
