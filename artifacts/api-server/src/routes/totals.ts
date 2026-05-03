import { Router } from "express";
import { db } from "@workspace/db";
import { billsTable, billUsersTable, billLinesTable, billLineUsersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const billId = parseInt((req.params as Record<string, string>)["billId"]!);

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId)).limit(1);
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }

  const billUsers = await db.select().from(billUsersTable).where(eq(billUsersTable.billId, billId));
  const lines = await db.select().from(billLinesTable).where(eq(billLinesTable.billId, billId));
  const lineIds = lines.map((l) => l.id);
  const assignments = lineIds.length > 0
    ? await db.select().from(billLineUsersTable).where(inArray(billLineUsersTable.billLineId, lineIds))
    : [];

  const taxPercent = parseFloat(String(bill.taxPercent)) || 0;
  const billTipPercent = parseFloat(String(bill.tipPercent)) || 0;

  const personSubtotals = new Map<number, number>();
  const personItems = new Map<number, Array<{ billLineId: number; description: string; lineTotal: number; share: number; splitWithNames: string[] }>>();
  const userNameById = new Map<number, string>();
  for (const user of billUsers) {
    personSubtotals.set(user.id, 0);
    personItems.set(user.id, []);
    userNameById.set(user.id, user.name);
  }

  for (const line of lines) {
    const lineTotal = parseFloat(String(line.total)) || 0;
    const lineAssignments = assignments.filter((a) => a.billLineId === line.id);
    if (lineAssignments.length === 0) continue;
    const share = lineTotal / lineAssignments.length;
    const assignedUserIds = lineAssignments.map((a) => a.billUserId);
    for (const assignment of lineAssignments) {
      personSubtotals.set(assignment.billUserId, (personSubtotals.get(assignment.billUserId) ?? 0) + share);
      const splitWithNames = assignedUserIds
        .filter((uid) => uid !== assignment.billUserId)
        .map((uid) => userNameById.get(uid) ?? "")
        .filter((n) => n.length > 0);
      personItems.get(assignment.billUserId)!.push({
        billLineId: line.id,
        description: line.description,
        lineTotal: Math.round(lineTotal * 100) / 100,
        share: Math.round(share * 100) / 100,
        splitWithNames,
      });
    }
  }

  const billSubtotal = Array.from(personSubtotals.values()).reduce((a, b) => a + b, 0);
  const taxAmount = Math.round(billSubtotal * (taxPercent / 100) * 100) / 100;

  const perPerson = billUsers.map((user) => {
    const subtotal = personSubtotals.get(user.id) ?? 0;
    const proportion = billSubtotal > 0 ? subtotal / billSubtotal : 0;
    const taxShare = Math.round(taxAmount * proportion * 100) / 100;

    const hasOverride = user.tipPercentOverride !== null && user.tipPercentOverride !== undefined;
    const personTipPercent = hasOverride
      ? (parseFloat(String(user.tipPercentOverride)) || 0)
      : billTipPercent;

    const personTipAmount = Math.round(subtotal * (personTipPercent / 100) * 100) / 100;

    return {
      billUserId: user.id,
      name: user.name,
      color: user.color,
      subtotal: Math.round(subtotal * 100) / 100,
      taxShare,
      tipPercent: personTipPercent,
      tipAmount: personTipAmount,
      tipIsCustom: hasOverride,
      total: Math.round((subtotal + taxShare + personTipAmount) * 100) / 100,
      items: personItems.get(user.id) ?? [],
    };
  });

  const totalTipAmount = perPerson.reduce((sum, p) => sum + p.tipAmount, 0);
  const grandTotal = Math.round((billSubtotal + taxAmount + totalTipAmount) * 100) / 100;

  const averageTipPercent = billUsers.length > 0
    ? Math.round(perPerson.reduce((sum, p) => sum + p.tipPercent, 0) / billUsers.length * 100) / 100
    : billTipPercent;

  const assignedLineIds = new Set(assignments.map((a) => a.billLineId));
  const settled =
    lines.length > 0 &&
    billUsers.length > 0 &&
    lines.every((l) => assignedLineIds.has(l.id));

  res.json({
    billSubtotal: Math.round(billSubtotal * 100) / 100,
    taxPercent,
    taxAmount,
    tipPercent: billTipPercent,
    tipAmount: Math.round(totalTipAmount * 100) / 100,
    averageTipPercent,
    grandTotal,
    perPerson,
    settled,
  });
});

export default router;
