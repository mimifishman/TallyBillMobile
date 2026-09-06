/**
 * Finds users in the database that no longer exist in Clerk, and (with
 * --delete) removes them and every row that belongs to them.
 *
 * Deletion mirrors `DELETE /api/me` (src/routes/me.ts) exactly, one user per
 * transaction, so a deleted user's name still survives on OTHER people's bills
 * and circles with `linked_user_id` nulled — that is deliberate, not a bug.
 *
 * Run it against whichever database DATABASE_URL points at, with the
 * CLERK_SECRET_KEY of the matching Clerk instance. Dry run by default.
 *
 *   node --experimental-strip-types --no-warnings \
 *     --import ./scripts/register-ts.mjs ./scripts/prune-orphan-users.ts
 *
 * Flags:
 *   --delete                 actually delete (default: report only)
 *   --include-null-clerk-id  also treat users with no clerk_id as orphans
 */
import { db } from "@workspace/db";
import {
  usersTable,
  billsTable,
  billUsersTable,
  billMembersTable,
  billLinesTable,
  billLineMembersTable,
  circlesTable,
  circleMembersTable,
} from "@workspace/db";
import { eq, inArray, count } from "drizzle-orm";
import { createClerkClient } from "@clerk/express";
import { Storage } from "@google-cloud/storage";
import { writeFileSync } from "node:fs";

const DO_DELETE = process.argv.includes("--delete");
const INCLUDE_NULL = process.argv.includes("--include-null-clerk-id");

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error("CLERK_SECRET_KEY must be set");
const clerk = createClerkClient({ secretKey });

const instance = secretKey.startsWith("sk_live_")
  ? "PRODUCTION"
  : secretKey.startsWith("sk_test_")
    ? "development/test"
    : "unknown";

/** Every Clerk user id in the instance the secret key points at. */
async function fetchAllClerkIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const limit = 500;
  let offset = 0;
  let totalCount = 0;

  for (;;) {
    const page = await clerk.users.getUserList({ limit, offset });
    totalCount = page.totalCount;
    for (const u of page.data) ids.add(u.id);
    if (page.data.length < limit) break;
    offset += limit;
    if (offset > 100_000) throw new Error("Refusing to page past 100k Clerk users");
  }

  // A silent auth failure or a wrong key would return an empty list, and then
  // every local user would look like an orphan. Never let that reach a delete.
  if (ids.size === 0) {
    throw new Error("Clerk returned 0 users — refusing to continue. Check CLERK_SECRET_KEY.");
  }
  if (ids.size !== totalCount) {
    throw new Error(`Clerk paging incomplete: got ${ids.size} of ${totalCount} users. Aborting.`);
  }
  return ids;
}

/** Row counts that would disappear with this user, for the report. */
async function summarise(userId: number) {
  const ownedBills = await db
    .select({ id: billsTable.id, receiptImagePath: billsTable.receiptImagePath })
    .from(billsTable)
    .where(eq(billsTable.ownerUserId, userId));
  const ownedCircles = await db
    .select({ id: circlesTable.id })
    .from(circlesTable)
    .where(eq(circlesTable.ownerUserId, userId));
  const [joined] = await db
    .select({ n: count() })
    .from(billUsersTable)
    .where(eq(billUsersTable.userId, userId));
  const [linked] = await db
    .select({ n: count() })
    .from(billMembersTable)
    .where(eq(billMembersTable.linkedUserId, userId));

  return {
    ownedBills: ownedBills.length,
    receiptImages: ownedBills.filter(
      (b) => typeof b.receiptImagePath === "string" && b.receiptImagePath.length > 0,
    ).length,
    ownedCircles: ownedCircles.length,
    joinedBills: joined?.n ?? 0,
    linkedMembers: linked?.n ?? 0,
  };
}

/**
 * Same phases, same order, as the DELETE /api/me handler.
 *
 * Every row is read back inside the same transaction before anything is
 * removed, so the returned snapshot is an exact record of what was destroyed.
 * There is no other undo — write it to disk before trusting this.
 */
async function deleteUser(
  userId: number,
): Promise<{ snapshot: Record<string, unknown>; receiptPaths: string[] }> {
  return db.transaction(async (tx) => {
    const ownedBills = await tx
      .select({ id: billsTable.id, receiptImagePath: billsTable.receiptImagePath })
      .from(billsTable)
      .where(eq(billsTable.ownerUserId, userId));
    const ownedBillIds = ownedBills.map((b) => b.id);

    const linkedMembers = await tx
      .select({ id: billMembersTable.id })
      .from(billMembersTable)
      .where(eq(billMembersTable.linkedUserId, userId));
    const linkedMemberIds = linkedMembers.map((m) => m.id);

    const ownedLineRows =
      ownedBillIds.length > 0
        ? await tx.select().from(billLinesTable).where(inArray(billLinesTable.billId, ownedBillIds))
        : [];
    const ownedLineRowIds = ownedLineRows.map((l) => l.id);

    const ownedCircleRows = await tx
      .select()
      .from(circlesTable)
      .where(eq(circlesTable.ownerUserId, userId));
    const ownedCircleRowIds = ownedCircleRows.map((c) => c.id);

    const snapshot = {
      user: await tx.select().from(usersTable).where(eq(usersTable.id, userId)),
      ownedBills:
        ownedBillIds.length > 0
          ? await tx.select().from(billsTable).where(inArray(billsTable.id, ownedBillIds))
          : [],
      ownedBillLines: ownedLineRows,
      ownedBillLineMembers:
        ownedLineRowIds.length > 0
          ? await tx
              .select()
              .from(billLineMembersTable)
              .where(inArray(billLineMembersTable.billLineId, ownedLineRowIds))
          : [],
      ownedBillUsers:
        ownedBillIds.length > 0
          ? await tx.select().from(billUsersTable).where(inArray(billUsersTable.billId, ownedBillIds))
          : [],
      ownedBillMembers:
        ownedBillIds.length > 0
          ? await tx
              .select()
              .from(billMembersTable)
              .where(inArray(billMembersTable.billId, ownedBillIds))
          : [],
      // Rows on OTHER people's bills — these go too, unlike the name-only rows
      // that survive with linked_user_id nulled.
      ownMembershipsElsewhere: await tx
        .select()
        .from(billUsersTable)
        .where(eq(billUsersTable.userId, userId)),
      ownMemberRowsElsewhere: await tx
        .select()
        .from(billMembersTable)
        .where(eq(billMembersTable.linkedUserId, userId)),
      ownLineAssignmentsElsewhere:
        linkedMemberIds.length > 0
          ? await tx
              .select()
              .from(billLineMembersTable)
              .where(inArray(billLineMembersTable.billMemberId, linkedMemberIds))
          : [],
      ownedCircles: ownedCircleRows,
      ownedCircleMembers:
        ownedCircleRowIds.length > 0
          ? await tx
              .select()
              .from(circleMembersTable)
              .where(inArray(circleMembersTable.circleId, ownedCircleRowIds))
          : [],
      ownCircleMembershipsElsewhere: await tx
        .select()
        .from(circleMembersTable)
        .where(eq(circleMembersTable.linkedUserId, userId)),
    };

    if (ownedBillIds.length > 0) {
      const ownedLines = await tx
        .select({ id: billLinesTable.id })
        .from(billLinesTable)
        .where(inArray(billLinesTable.billId, ownedBillIds));
      const ownedLineIds = ownedLines.map((l) => l.id);
      if (ownedLineIds.length > 0) {
        await tx
          .delete(billLineMembersTable)
          .where(inArray(billLineMembersTable.billLineId, ownedLineIds));
      }
    }
    if (linkedMemberIds.length > 0) {
      await tx
        .delete(billLineMembersTable)
        .where(inArray(billLineMembersTable.billMemberId, linkedMemberIds));
    }

    if (ownedBillIds.length > 0) {
      await tx.delete(billLinesTable).where(inArray(billLinesTable.billId, ownedBillIds));
      await tx.delete(billUsersTable).where(inArray(billUsersTable.billId, ownedBillIds));
    }
    await tx.delete(billUsersTable).where(eq(billUsersTable.userId, userId));

    if (ownedBillIds.length > 0) {
      await tx.delete(billMembersTable).where(inArray(billMembersTable.billId, ownedBillIds));
    }
    if (linkedMemberIds.length > 0) {
      await tx.delete(billMembersTable).where(inArray(billMembersTable.id, linkedMemberIds));
    }

    if (ownedBillIds.length > 0) {
      await tx.delete(billsTable).where(inArray(billsTable.id, ownedBillIds));
    }

    const ownedCircles = await tx
      .select({ id: circlesTable.id })
      .from(circlesTable)
      .where(eq(circlesTable.ownerUserId, userId));
    const ownedCircleIds = ownedCircles.map((c) => c.id);
    if (ownedCircleIds.length > 0) {
      await tx
        .delete(circleMembersTable)
        .where(inArray(circleMembersTable.circleId, ownedCircleIds));
    }
    await tx.delete(circleMembersTable).where(eq(circleMembersTable.linkedUserId, userId));
    if (ownedCircleIds.length > 0) {
      await tx.delete(circlesTable).where(inArray(circlesTable.id, ownedCircleIds));
    }

    await tx.delete(usersTable).where(eq(usersTable.id, userId));

    return {
      snapshot,
      receiptPaths: ownedBills
        .map((b) => b.receiptImagePath)
        .filter((p): p is string => typeof p === "string" && p.length > 0),
    };
  });
}

/**
 * Deletes one receipt photo from the bucket.
 *
 * This repeats the few lines of `deleteObjectEntity` rather than importing the
 * service: that module pulls in `objectAcl.ts`, which uses a TypeScript `enum`
 * that node's strip-only type stripping cannot compile. Keep this in step with
 * `src/lib/objectStorage.ts` if that file changes.
 */
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

async function deleteReceiptObject(objectPath: string): Promise<void> {
  if (!objectPath.startsWith("/objects/")) return;
  const parts = objectPath.slice(1).split("/");
  if (parts.length < 2) return;

  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR must be set to remove receipt images");

  const entityDir = dir.endsWith("/") ? dir : `${dir}/`;
  const full = `${entityDir}${parts.slice(1).join("/")}`;
  const withLeadingSlash = full.startsWith("/") ? full : `/${full}`;
  const pathParts = withLeadingSlash.split("/");
  if (pathParts.length < 3) throw new Error(`Invalid object path: ${full}`);

  const bucketName = pathParts[1]!;
  const objectName = pathParts.slice(2).join("/");
  await storageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
}

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL!).host;
  console.log(`Database host : ${dbHost}`);
  console.log(`Clerk instance: ${instance}`);
  console.log(`Mode          : ${DO_DELETE ? "DELETE (destructive)" : "dry run (no changes)"}`);
  console.log(`Object dir    : ${process.env.PRIVATE_OBJECT_DIR ?? "(not set)"}`);
  console.log("");

  const clerkIds = await fetchAllClerkIds();
  console.log(`Clerk users: ${clerkIds.size}`);

  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      clerkId: usersTable.clerkId,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable);
  console.log(`Database users: ${users.length}`);
  console.log("");

  const keep = users.filter((u) => u.clerkId !== null && clerkIds.has(u.clerkId));
  const missingInClerk = users.filter((u) => u.clerkId !== null && !clerkIds.has(u.clerkId));
  const noClerkId = users.filter((u) => u.clerkId === null);

  const report = async (label: string, rows: typeof users) => {
    console.log(`--- ${label}: ${rows.length} ---`);
    for (const u of rows) {
      const s = await summarise(u.id);
      console.log(
        `  id=${u.id}  ${u.email}  clerk=${u.clerkId ?? "(none)"}  ` +
          `created=${u.createdAt.toISOString().slice(0, 10)}  ` +
          `ownedBills=${s.ownedBills} receiptImages=${s.receiptImages} ` +
          `ownedCircles=${s.ownedCircles} ` +
          `joinedBills=${s.joinedBills} linkedMembers=${s.linkedMembers}`,
      );
    }
    console.log("");
  };

  console.log(`--- KEEP (present in Clerk): ${keep.length} ---\n`);
  await report("ORPHAN A: clerk_id set but user gone from Clerk", missingInClerk);
  await report("ORPHAN B: no clerk_id at all (legacy password users)", noClerkId);

  const targets = INCLUDE_NULL ? [...missingInClerk, ...noClerkId] : missingInClerk;
  console.log(
    `Would delete ${targets.length} user(s)` +
      (INCLUDE_NULL ? " (groups A + B)" : " (group A only; pass --include-null-clerk-id to add B)"),
  );

  if (!DO_DELETE) {
    console.log("\nDry run. Nothing was changed. Re-run with --delete to apply.");
    return;
  }
  if (targets.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  const orphanedImages: string[] = [];
  const backupPath = `./prune-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const backup: unknown[] = [];
  let done = 0;

  // Rewritten after every user, so an interrupted run still leaves on disk a
  // full record of everything it managed to destroy.
  const saveBackup = () =>
    writeFileSync(backupPath, JSON.stringify({ dbHost, deleted: backup }, null, 2));
  saveBackup();
  console.log(`Backup file: ${backupPath}`);

  for (const u of targets) {
    const { snapshot, receiptPaths } = await deleteUser(u.id);
    backup.push({ id: u.id, email: u.email, clerkId: u.clerkId, rows: snapshot });
    saveBackup();
    done += 1;
    console.log(`deleted id=${u.id} ${u.email} (${receiptPaths.length} receipt image(s))`);
    for (const objectPath of receiptPaths) {
      try {
        await deleteReceiptObject(objectPath);
      } catch (err) {
        orphanedImages.push(objectPath);
        console.error(`  ORPHANED RECEIPT IMAGE (delete by hand): ${objectPath}`, err);
      }
    }
  }

  console.log(`\nDeleted ${done} user(s). Backup written to ${backupPath}`);
  if (orphanedImages.length > 0) {
    console.error(`${orphanedImages.length} receipt image(s) left in object storage:`);
    for (const p of orphanedImages) console.error(`  ${p}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
