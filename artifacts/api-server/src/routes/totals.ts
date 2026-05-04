import { Router } from "express";
import { db } from "@workspace/db";
import { billsTable, billMembersTable, billLinesTable, billLineMembersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const billId = parseInt((req.params as Record<string, string>)["billId"]!);

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId)).limit(1);
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }

  const billMembers = await db.select().from(billMembersTable).where(eq(billMembersTable.billId, billId));
  const lines = await db.select().from(billLinesTable).where(eq(billLinesTable.billId, billId));
  const lineIds = lines.map((l) => l.id);
  const assignments = lineIds.length > 0
    ? await db.select().from(billLineMembersTable).where(inArray(billLineMembersTable.billLineId, lineIds))
    : [];

  const taxPercent = parseFloat(String(bill.taxPercent)) || 0;
  const billTipPercent = parseFloat(String(bill.tipPercent)) || 0;

  const personSubtotals = new Map<number, number>();
  const personItems = new Map<number, Array<{ billLineId: number; description: string; lineTotal: number; share: number; splitWithNames: string[] }>>();
  const memberNameById = new Map<number, string>();
  for (const member of billMembers) {
    personSubtotals.set(member.id, 0);
    personItems.set(member.id, []);
    memberNameById.set(member.id, member.name);
  }

  for (const line of lines) {
    const lineTotal = parseFloat(String(line.total)) || 0;
    const lineAssignments = assignments.filter((a) => a.billLineId === line.id);
    if (lineAssignments.length === 0) continue;
    const share = lineTotal / lineAssignments.length;
    const assignedMemberIds = lineAssignments.map((a) => a.billMemberId);
    for (const assignment of lineAssignments) {
      personSubtotals.set(assignment.billMemberId, (personSubtotals.get(assignment.billMemberId) ?? 0) + share);
      const splitWithNames = assignedMemberIds
        .filter((uid) => uid !== assignment.billMemberId)
        .map((uid) => memberNameById.get(uid) ?? "")
        .filter((n) => n.length > 0);
      personItems.get(assignment.billMemberId)!.push({
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

  const perPerson = billMembers.map((member) => {
    const subtotal = personSubtotals.get(member.id) ?? 0;
    const proportion = billSubtotal > 0 ? subtotal / billSubtotal : 0;
    const taxShare = Math.round(taxAmount * proportion * 100) / 100;

    const hasOverride = member.tipPercentOverride !== null && member.tipPercentOverride !== undefined;
    const personTipPercent = hasOverride
      ? (parseFloat(String(member.tipPercentOverride)) || 0)
      : billTipPercent;

    const personTipAmount = Math.round(subtotal * (personTipPercent / 100) * 100) / 100;

    return {
      billUserId: member.id,
      name: member.name,
      color: member.color,
      subtotal: Math.round(subtotal * 100) / 100,
      taxShare,
      tipPercent: personTipPercent,
      tipAmount: personTipAmount,
      tipIsCustom: hasOverride,
      total: Math.round((subtotal + taxShare + personTipAmount) * 100) / 100,
      items: personItems.get(member.id) ?? [],
    };
  });

  const totalTipAmount = perPerson.reduce((sum, p) => sum + p.tipAmount, 0);
  const grandTotal = Math.round((billSubtotal + taxAmount + totalTipAmount) * 100) / 100;

  const averageTipPercent = billMembers.length > 0
    ? Math.round(perPerson.reduce((sum, p) => sum + p.tipPercent, 0) / billMembers.length * 100) / 100
    : billTipPercent;

  const assignedLineIds = new Set(assignments.map((a) => a.billLineId));
  const settled =
    lines.length > 0 &&
    billMembers.length > 0 &&
    lines.every((l) => assignedLineIds.has(l.id));

  const unsplitLines = lines
    .filter((l) => !assignedLineIds.has(l.id))
    .map((l) => ({
      id: l.id,
      description: l.description,
      total: Math.round((parseFloat(String(l.total)) || 0) * 100) / 100,
    }));

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
    unsplitLines,
  });
});

export default router;
