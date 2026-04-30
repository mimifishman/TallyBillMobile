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
  const tipPercent = parseFloat(String(bill.tipPercent)) || 0;

  const personSubtotals = new Map<number, number>();
  for (const user of billUsers) {
    personSubtotals.set(user.id, 0);
  }

  for (const line of lines) {
    const lineTotal = parseFloat(String(line.total)) || 0;
    const lineAssignments = assignments.filter((a) => a.billLineId === line.id);
    if (lineAssignments.length === 0) continue;
    const share = lineTotal / lineAssignments.length;
    for (const assignment of lineAssignments) {
      personSubtotals.set(assignment.billUserId, (personSubtotals.get(assignment.billUserId) ?? 0) + share);
    }
  }

  const billSubtotal = Array.from(personSubtotals.values()).reduce((a, b) => a + b, 0);

  const taxAmount = Math.round(billSubtotal * (taxPercent / 100) * 100) / 100;
  const tipAmount = Math.round(billSubtotal * (tipPercent / 100) * 100) / 100;

  const customTipTotal = billUsers
    .filter((u) => u.tipOverride !== null)
    .reduce((sum, u) => sum + (parseFloat(String(u.tipOverride)) || 0), 0);

  const perPerson = billUsers.map((user) => {
    const subtotal = personSubtotals.get(user.id) ?? 0;
    const proportion = billSubtotal > 0 ? subtotal / billSubtotal : 0;
    const taxShare = Math.round(taxAmount * proportion * 100) / 100;

    let personTip: number;
    let tipIsCustom: boolean;
    if (user.tipOverride !== null && user.tipOverride !== undefined) {
      personTip = parseFloat(String(user.tipOverride)) || 0;
      tipIsCustom = true;
    } else {
      const unassignedTip = tipAmount - customTipTotal;
      const usersWithoutOverride = billUsers.filter((u) => u.tipOverride === null || u.tipOverride === undefined);
      const subtotalWithoutOverride = usersWithoutOverride.reduce(
        (sum, u) => sum + (personSubtotals.get(u.id) ?? 0), 0
      );
      const proportionOfRemaining = subtotalWithoutOverride > 0 ? subtotal / subtotalWithoutOverride : 0;
      personTip = Math.round(unassignedTip * proportionOfRemaining * 100) / 100;
      tipIsCustom = false;
    }

    return {
      billUserId: user.id,
      name: user.name,
      color: user.color,
      subtotal: Math.round(subtotal * 100) / 100,
      taxShare,
      tipAmount: personTip,
      tipIsCustom,
      total: Math.round((subtotal + taxShare + personTip) * 100) / 100,
    };
  });

  res.json({
    billSubtotal: Math.round(billSubtotal * 100) / 100,
    taxPercent,
    taxAmount,
    tipPercent,
    tipAmount,
    grandTotal: Math.round((billSubtotal + taxAmount + tipAmount) * 100) / 100,
    perPerson,
  });
});

export default router;
