/**
 * How much receipt scanning and translation one caller may do, and who the
 * caller is. Pure logic: the counters are passed in, so this file can be
 * checked without a database (pnpm run check:ocr-guard).
 *
 * Nobody has to sign in. A guest is counted by the phone it scans from (the
 * app's own guest id), a signed-in user by account, and every call also counts
 * toward a daily ceiling for the whole service, which is the hard stop on
 * model spend. A network address only gets a loose backstop, because many
 * real people share one: friends on a restaurant's wifi, a whole carrier
 * behind one address. Counting guests by address locked the developer's own
 * phone out after a day of testing from the same home connection.
 *
 * No relative imports here: the check script loads this file directly with
 * --experimental-strip-types.
 */
import { BlockList, isIP } from "node:net";

export type Route = "scan" | "translate";

export interface Allowance {
  hour: number;
  day: number;
}

export interface Policy {
  /** Plural noun for messages: "scans", "translations". */
  noun: string;
  /** Per phone, for a guest whose app sent its guest id. */
  guest: Allowance;
  user: Allowance;
  /**
   * Per network address, for guests who sent a guest id: a backstop against a
   * script inventing a new id per call, set far above what one table needs.
   */
  network: Allowance;
  /** Calls per UTC day for everyone together. */
  dailyCeiling: number;
  /** Shown when the ceiling is reached. */
  pausedMessage: string;
}

/**
 * The numbers, and why:
 *
 * - Real use is small. A meal is one receipt: one scan, two or three with a
 *   retake. A busy hour (dinner, then drinks) is about five. A heavy day, a
 *   group trip with four meals, is about ten. The most on record is the
 *   developer testing on dev: 4 in an hour, 11 in a day.
 * - A signed-in user gets 15 an hour and 40 a day: two or three times a heavy
 *   day, and far below what a script would want.
 * - A guest gets 10 an hour and 25 a day per phone, so "sign in to scan more"
 *   is true. The phone is the app's guest id (X-Guest-Owner-Id), which every
 *   build already sends.
 * - A network address gets 60 an hour and 300 a day across all its guests:
 *   dozens of tables on one wifi or carrier address, and still a hard stop for
 *   a script that makes up a fresh guest id per call. A guest with no id (not
 *   the app) is held to the per-phone numbers by address, as before.
 *   IPv6 is counted per /64.
 * - The daily ceiling is for everyone together and is set for growth, not for
 *   today's traffic: 5,000 scans is roughly 1,000 to 2,000 people splitting a
 *   bill in one day. A scan is up to three model calls (gpt-4o, a gpt-4o
 *   re-read, gpt-5.4), about 3 to 10 cents, so it caps a runaway day near
 *   $150 to $500. Raise OCR_DAILY_CEILING when the "DAILY CEILING REACHED" log
 *   line shows up on a normal day.
 * - Translate is one short text call per tap, used once or twice per scan.
 *
 * Every number can be changed without a code change, via the env names in
 * policyFromEnv.
 */
export function policyFromEnv(env: Record<string, string | undefined>): Record<Route, Policy> {
  const n = (name: string, fallback: number): number => {
    const raw = env[name];
    const value = raw === undefined ? NaN : Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
  return {
    scan: {
      noun: "scans",
      guest: { hour: n("OCR_GUEST_PER_HOUR", 10), day: n("OCR_GUEST_PER_DAY", 25) },
      user: { hour: n("OCR_USER_PER_HOUR", 15), day: n("OCR_USER_PER_DAY", 40) },
      network: { hour: n("OCR_NETWORK_PER_HOUR", 60), day: n("OCR_NETWORK_PER_DAY", 300) },
      dailyCeiling: n("OCR_DAILY_CEILING", 5000),
      pausedMessage: "Receipt scanning is paused for today. Try again later, or add the items by hand.",
    },
    translate: {
      noun: "translations",
      guest: { hour: n("TRANSLATE_GUEST_PER_HOUR", 15), day: n("TRANSLATE_GUEST_PER_DAY", 40) },
      user: { hour: n("TRANSLATE_USER_PER_HOUR", 20), day: n("TRANSLATE_USER_PER_DAY", 60) },
      network: { hour: n("TRANSLATE_NETWORK_PER_HOUR", 90), day: n("TRANSLATE_NETWORK_PER_DAY", 400) },
      dailyCeiling: n("TRANSLATE_DAILY_CEILING", 10000),
      pausedMessage: "Translation is paused for today. Try again later.",
    },
  };
}

/** A translate request bigger than any real receipt is refused before it is counted. */
export const TRANSLATE_MAX_ITEMS = 200;
export const TRANSLATE_MAX_CHARS = 20_000;

export function translateTooBig(descriptions: unknown): boolean {
  if (!Array.isArray(descriptions)) return false;
  if (descriptions.length > TRANSLATE_MAX_ITEMS) return true;
  let chars = 0;
  for (const d of descriptions) chars += typeof d === "string" ? d.length : String(d).length;
  return chars > TRANSLATE_MAX_CHARS;
}

// ─── Who is calling ──────────────────────────────────────────────────────────

/** Addresses that only ever belong to a proxy inside the hosting network. */
const INTERNAL = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16],
] as const) INTERNAL.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::", 127], ["fc00::", 7], ["fe80::", 10]] as const) {
  INTERNAL.addSubnet(net, bits, "ipv6");
}

function normalize(raw: string): string | null {
  let a = raw.trim();
  if (a.startsWith("[")) a = a.slice(1, a.indexOf("]"));           // [v6]:port
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(a)) a = a.split(":")[0]!; // v4:port
  if (a.toLowerCase().startsWith("::ffff:") && isIP(a.slice(7)) === 4) a = a.slice(7);
  return isIP(a) ? a : null;
}

function isInternal(address: string): boolean {
  return INTERNAL.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
}

/**
 * The caller's real address, read from X-Forwarded-For.
 *
 * Each proxy APPENDS the address it received the request from, so the right
 * end of the header is the trustworthy end; anything on the left may have
 * been typed by the caller. Measured 2026-09-27:
 *
 * - dev (Replit proxy):  "<forged>, <client>, 10.x.x.x"   socket 127.0.0.1
 * - prod (Google load balancer, "via: 1.1 google"): Google documents
 *   "<forged>, <client>, <load balancer's own public address>", and Replit's
 *   hops behind it are internal.
 *
 * So: drop internal addresses from the right, then drop `publicHops` more (the
 * load balancer: 1 in a Replit deployment, 0 on dev), and take the next one.
 */
export function clientAddress(
  forwardedFor: string | undefined,
  socketAddress: string | undefined,
  publicHops: number,
): { address: string; local: boolean } {
  const socket = normalize(socketAddress ?? "") ?? "unknown";
  if (!forwardedFor || !forwardedFor.trim()) {
    // Only a caller on the same machine arrives with no proxy header at all:
    // every request through Replit's or Google's front door carries one.
    return { address: socket, local: /^127\.|^::1$/.test(socket) };
  }
  const chain = forwardedFor.split(",").map(normalize);
  let i = chain.length - 1;
  while (i >= 0 && chain[i] !== null && isInternal(chain[i]!)) i--;
  const lastPublic = i;
  i -= publicHops;
  // A chain shorter than expected: use the right-most public address rather
  // than trust a left-hand entry the caller may have written.
  const pick = i >= 0 && chain[i] ? chain[i]! : lastPublic >= 0 && chain[lastPublic] ? chain[lastPublic]! : socket;
  return { address: pick, local: false };
}

/**
 * The counter key for an address. IPv6 is keyed by its /64: one phone or one
 * home gets a whole /64 and could otherwise hop to a fresh address per call.
 */
export function addressKey(address: string): string {
  if (isIP(address) !== 6) return address;
  const [head, tail = ""] = address.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = address.includes("::")
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * The app's guest id, if it looks like one; anything else counts as no id.
 * The app makes it as `guest_<time>_<random>` and keeps it on the phone.
 */
export function guestDeviceKey(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(id) ? id : null;
}

export type Caller =
  | { kind: "user"; id: string }
  /** `id` is the network key; `device` the app's guest id, when it sent one. */
  | { kind: "guest"; id: string; device?: string | null }
  /** A script on the server itself (an eval over localhost). No per-caller limit. */
  | { kind: "local"; id: string };

// ─── Counting ────────────────────────────────────────────────────────────────

export interface Counter {
  key: string;
  expiresAt: Date;
}

/** Add one to each counter and return the new counts, by key. */
export type Bump = (counters: Counter[]) => Promise<Map<string, number>>;

export type Verdict =
  | { ok: true; limit: number | null; remaining: number | null; resetSeconds: number }
  | {
      ok: false;
      reason: "caller" | "ceiling";
      message: string;
      retryAfterSeconds: number;
      /** True only on the one call that first went over the ceiling today. */
      ceilingJustHit: boolean;
      count: number;
    };

function inWords(seconds: number): string {
  if (seconds < 90) return "a minute";
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} minutes`;
  const hours = Math.round(seconds / 3600);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

/**
 * Count one call and say whether it may go ahead.
 *
 * The caller's own counters are bumped first; the service-wide ceiling is only
 * bumped for a call that passed them. Otherwise one busy address that keeps
 * getting refused would use up the ceiling and lock out everyone else.
 */
export async function checkUsage(
  bump: Bump,
  route: Route,
  policy: Policy,
  caller: Caller,
  now: Date,
): Promise<Verdict> {
  const iso = now.toISOString();
  const hourEnd = new Date(now);
  hourEnd.setUTCMinutes(60, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setUTCHours(24, 0, 0, 0);
  const secondsTo = (end: Date) => Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000));

  let limit: number | null = null;
  let remaining: number | null = null;

  if (caller.kind !== "local") {
    // What this call counts against, most personal first. A guest from the
    // app counts against its phone AND, loosely, its network; anything else
    // against one thing, as before.
    const meters: Array<{ who: string; allowance: Allowance; from: string }> =
      caller.kind === "user"
        ? [{ who: `${route}:user:${caller.id}`, allowance: policy.user, from: "your account" }]
        : caller.device
          ? [
              { who: `${route}:device:${caller.device}`, allowance: policy.guest, from: "this phone" },
              { who: `${route}:network:${caller.id}`, allowance: policy.network, from: "this network" },
            ]
          : [{ who: `${route}:guest:${caller.id}`, allowance: policy.guest, from: "this network" }];
    const keys = meters.map((m) => ({ hour: `${m.who}:h:${iso.slice(0, 13)}`, day: `${m.who}:d:${iso.slice(0, 10)}` }));
    const counts = await bump(keys.flatMap((k) => [
      { key: k.hour, expiresAt: hourEnd },
      { key: k.day, expiresAt: dayEnd },
    ]));
    const signIn = caller.kind === "guest" && route === "scan" ? ", or sign in to scan more" : "";
    for (let m = 0; m < meters.length; m++) {
      const { allowance, from } = meters[m]!;
      const perHour = counts.get(keys[m]!.hour) ?? 0;
      const perDay = counts.get(keys[m]!.day) ?? 0;
      if (perDay > allowance.day) {
        const wait = secondsTo(dayEnd);
        return {
          ok: false, reason: "caller", count: perDay, ceilingJustHit: false, retryAfterSeconds: wait,
          message: `Too many ${policy.noun} from ${from} today. Try again in ${inWords(wait)}${signIn}.`,
        };
      }
      if (perHour > allowance.hour) {
        const wait = secondsTo(hourEnd);
        return {
          ok: false, reason: "caller", count: perHour, ceilingJustHit: false, retryAfterSeconds: wait,
          message: `Too many ${policy.noun} from ${from} this hour. Try again in ${inWords(wait)}${signIn}.`,
        };
      }
      if (m === 0) {
        limit = allowance.hour;
        remaining = allowance.hour - perHour;
      }
    }
  }

  const ceilingKey = `${route}:all:d:${iso.slice(0, 10)}`;
  const total = (await bump([{ key: ceilingKey, expiresAt: dayEnd }])).get(ceilingKey) ?? 0;
  if (total > policy.dailyCeiling) {
    return {
      ok: false, reason: "ceiling", count: total, retryAfterSeconds: secondsTo(dayEnd),
      ceilingJustHit: total === policy.dailyCeiling + 1,
      message: policy.pausedMessage,
    };
  }
  return { ok: true, limit, remaining, resetSeconds: secondsTo(hourEnd) };
}
