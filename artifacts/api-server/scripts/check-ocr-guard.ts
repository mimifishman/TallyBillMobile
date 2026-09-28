/**
 * Pins the OCR usage limits. Run: pnpm run check:ocr-guard
 *
 * The cases that matter: a forged X-Forwarded-For never picks the counter,
 * guests are limited but never locked out for good, a refused caller does not
 * eat the service-wide ceiling, and the ceiling stops everyone.
 */
import {
  addressKey,
  checkUsage,
  clientAddress,
  policyFromEnv,
  translateTooBig,
  type Bump,
  type Caller,
} from "../src/lib/usage-limits.ts";

let failed = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (!ok) { failed++; console.log(`FAIL  ${name}`); if (got !== undefined) console.log("      got ", JSON.stringify(got)); }
  else console.log(`PASS  ${name}`);
}

// ─── Client address ──────────────────────────────────────────────────────────

// Dev, as measured through Replit's proxy on 2026-09-27.
const dev = clientAddress("9.9.9.9, 176.229.21.27, 10.52.43.204", "127.0.0.1", 0);
check("dev: forged left entry is ignored", dev.address === "176.229.21.27" && !dev.local, dev);
check("dev: no forgery", clientAddress("176.229.21.27, 10.52.43.204", "127.0.0.1", 0).address === "176.229.21.27");

// Prod: Google appends "<client>, <load balancer>", internal hops after it.
const prod = clientAddress("9.9.9.9, 176.229.21.27, 34.111.179.208, 169.254.1.1", "169.254.8.1", 1);
check("prod: skips the load balancer and forged entry", prod.address === "176.229.21.27", prod);
check("prod: no forgery", clientAddress("176.229.21.27, 34.111.179.208", "10.0.0.1", 1).address === "176.229.21.27");
check("prod: forged junk on the left", clientAddress("not-an-ip, 176.229.21.27, 34.111.179.208", "10.0.0.1", 1).address === "176.229.21.27");
check("a chain shorter than expected uses the right-most public address",
  clientAddress("176.229.21.27", "10.0.0.1", 1).address === "176.229.21.27");

const local = clientAddress(undefined, "127.0.0.1", 0);
check("a script on the server itself is local", local.local === true, local);
check("a proxied request from loopback is not local", clientAddress("176.229.21.27", "127.0.0.1", 0).local === false);
check("::ffff: v4 addresses are unwrapped", clientAddress("::ffff:176.229.21.27", "127.0.0.1", 0).address === "176.229.21.27");

check("IPv6 is keyed by its /64",
  addressKey("2a02:6680:1101:ab::1") === addressKey("2a02:6680:1101:ab:ffff:1:2:3") &&
  addressKey("2a02:6680:1101:ab::1") === "2a02:6680:1101:ab::/64", addressKey("2a02:6680:1101:ab::1"));
check("IPv4 is keyed as is", addressKey("176.229.21.27") === "176.229.21.27");

// ─── Translate size ─────────────────────────────────────────────────────────

check("a real receipt translates", !translateTooBig(Array(60).fill("שניצל עם צ'יפס ברוטב")));
check("200+ items is refused", translateTooBig(Array(201).fill("x")));
check("a wall of text is refused", translateTooBig(["x".repeat(20_001)]));

// ─── Counting ────────────────────────────────────────────────────────────────

function memoryStore(): Bump & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const bump = (async (counters) => {
    for (const c of counters) counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
    return new Map(counters.map((c) => [c.key, counts.get(c.key)!]));
  }) as Bump & { counts: Map<string, number> };
  bump.counts = counts;
  return bump;
}

const policy = policyFromEnv({});
check("default scan numbers", policy.scan.guest.hour === 10 && policy.scan.guest.day === 25 &&
  policy.scan.user.hour === 15 && policy.scan.user.day === 40 && policy.scan.dailyCeiling === 5000, policy.scan);
check("default translate numbers", policy.translate.guest.hour === 15 && policy.translate.guest.day === 40 &&
  policy.translate.user.hour === 20 && policy.translate.user.day === 60 && policy.translate.dailyCeiling === 10000,
  policy.translate);
check("signing in always gives more", policy.scan.user.hour > policy.scan.guest.hour &&
  policy.scan.user.day > policy.scan.guest.day);
check("env overrides a number", policyFromEnv({ OCR_GUEST_PER_HOUR: "5" }).scan.guest.hour === 5);
check("a bad env value keeps the default", policyFromEnv({ OCR_GUEST_PER_HOUR: "lots" }).scan.guest.hour === policy.scan.guest.hour);

const at = new Date("2026-09-27T14:35:00Z");
const guest: Caller = { kind: "guest", id: "176.229.21.27" };
const user: Caller = { kind: "user", id: "user_abc" };

{
  const store = memoryStore();
  let last;
  const G = policy.scan.guest.hour;
  for (let i = 0; i < G; i++) last = await checkUsage(store, "scan", policy.scan, guest, at);
  check(`a guest's ${G}th scan in an hour goes ahead`, last!.ok === true && last!.ok && last.remaining === 0, last);
  const refused = await checkUsage(store, "scan", policy.scan, guest, at);
  check(`scan ${G + 1} is refused with a plain message`, !refused.ok && refused.reason === "caller" &&
    refused.message === "Too many scans from this network this hour. Try again in 25 minutes, or sign in to scan more." &&
    refused.retryAfterSeconds === 25 * 60, refused);
  check("a refused call does not use up the ceiling", store.counts.get("scan:all:d:2026-09-27") === G, [...store.counts]);

  const nextHour = await checkUsage(store, "scan", policy.scan, guest, new Date("2026-09-27T15:00:00Z"));
  check("the next hour the guest can scan again", nextHour.ok, nextHour);

  const other = await checkUsage(store, "scan", policy.scan, { kind: "guest", id: "8.8.8.8" }, at);
  check("another network is not affected", other.ok, other);

  const translate = await checkUsage(store, "translate", policy.translate, guest, at);
  check("translate has its own counter", translate.ok, translate);
}

{
  const store = memoryStore();
  let last;
  // Spread over enough hours that no single hour is over its limit.
  const { hour: H, day: D } = policy.scan.guest;
  for (let h = 0; h < Math.ceil((D + 1) / H); h++) {
    for (let i = 0; i < H; i++) {
      last = await checkUsage(store, "scan", policy.scan, guest, new Date(Date.UTC(2026, 8, 27, 8 + h, 5)));
    }
  }
  check(`a guest's day limit is ${D}`, !last!.ok && /today\. Try again in \d+ hours/.test(last!.message), last);
}

{
  const store = memoryStore();
  let last;
  const U = policy.scan.user.hour;
  for (let i = 0; i < U + 1; i++) last = await checkUsage(store, "scan", policy.scan, user, at);
  check(`a signed-in user gets ${U} an hour, and is not told to sign in`, !last!.ok &&
    last!.message === "Too many scans from your account this hour. Try again in 25 minutes.", last);
}

{
  const store = memoryStore();
  const small = policyFromEnv({ OCR_DAILY_CEILING: "3" }).scan;
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await checkUsage(store, "scan", small, { kind: "guest", id: `1.1.1.${i}` }, at));
  }
  check("the ceiling stops everyone", results.map((r) => r.ok).join() === "true,true,true,false,false", results);
  const hit = results.filter((r) => !r.ok) as Extract<(typeof results)[number], { ok: false }>[];
  check("the ceiling is reported once, at the moment it is hit",
    hit[0]!.ceilingJustHit === true && hit[1]!.ceilingJustHit === false && hit[0]!.reason === "ceiling", hit);
  const localCall = await checkUsage(store, "scan", small, { kind: "local", id: "127.0.0.1" }, at);
  check("a local script is held by the ceiling too", !localCall.ok, localCall);
}

{
  const store = memoryStore();
  let last;
  for (let i = 0; i < 100; i++) last = await checkUsage(store, "scan", policy.scan, { kind: "local", id: "127.0.0.1" }, at);
  check("a local eval has no per-caller limit", last!.ok, last);
}

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
