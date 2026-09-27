import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBillByCode,
  getGetBillByCodeQueryKey,
  useGetBillTotals,
  getGetBillTotalsQueryKey,
  useUpdateBill,
  useCreateBillUser,
  useDeleteBillUser,
  useCreateBillLine,
  useUpdateBillLine,
  useDeleteBillLine,
  useToggleBillLineUser,
  useUpdateBillUser,
  type Bill,
  type BillDetail,
  type BillLine,
  type BillMember,
  type PersonTotal,
  type UpdateBillRequest,
} from "@workspace/api-client-react";
import { CURRENCY_OPTIONS, formatMoney, PEOPLE_COLORS } from "@/lib/currency";
import {
  amountFromPercent,
  applyPercent,
  baseTotalOf,
  discountRate,
  fmtPct,
  getInitials,
  parsePercent,
  percentInput,
  percentLabel,
  toPercent,
  type DiscountableLine,
  type MoneyMode,
} from "@workspace/utils";

function num(v: unknown): number {
  return typeof v === "number" ? v : parseFloat(String(v ?? 0)) || 0;
}

/* ─── Toast system ─────────────────────────────────────────────────── */

type Toast = { id: number; message: string };
let _toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((message: string) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);
  return { toasts, show };
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none px-4 w-full max-w-sm lg:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-enter bg-foreground text-background text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg text-center"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

/* ─── Top bar ───────────────────────────────────────────────────────── */

function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      className={`sticky top-0 z-40 bg-card border-b border-border transition-shadow duration-200 ${scrolled ? "shadow-md" : ""}`}
    >
      <div className="max-w-2xl mx-auto px-4 h-12 flex items-center gap-2.5">
        <img src={import.meta.env.BASE_URL + "favicon.svg"} alt="TallyBill" className="w-7 h-7 rounded-lg" />
        <span className="text-base font-bold text-foreground tracking-tight">TallyBill</span>
      </div>
    </div>
  );
}

/* ─── Loading skeleton ──────────────────────────────────────────────── */

function BillSkeleton() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <header className="bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
          <div className="skeleton h-7 w-48 rounded-lg" />
          <div className="skeleton h-4 w-28 rounded" />
          <div className="flex gap-2 pt-1">
            <div className="skeleton h-9 flex-1 rounded-lg" />
            <div className="skeleton h-9 w-32 rounded-lg" />
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="skeleton h-4 w-16 rounded" />
            <div className="skeleton h-8 w-14 rounded-lg" />
          </div>
          <div className="flex gap-3 pb-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="skeleton w-12 h-12 rounded-full" />
                <div className="skeleton h-3 w-10 rounded" />
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-2">
          <div className="flex items-center justify-between mb-3">
            <div className="skeleton h-4 w-12 rounded" />
            <div className="skeleton h-8 w-20 rounded-lg" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </section>
        <div className="skeleton h-36 rounded-2xl" />
      </main>
    </div>
  );
}

/* ─── Page entry ────────────────────────────────────────────────────── */

export default function BillPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const qc = useQueryClient();
  const queryKey = getGetBillByCodeQueryKey(code);
  const { data, isLoading, error } = useGetBillByCode(code, {
    query: { queryKey, enabled: !!code },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey });
    if (data) {
      qc.invalidateQueries({ queryKey: getGetBillTotalsQueryKey(data.bill.id) });
    }
  };

  if (isLoading) {
    return <BillSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-background">
        <div className="text-center max-w-sm">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <img src={import.meta.env.BASE_URL + "favicon.svg"} alt="TallyBill" className="w-9 h-9 rounded-xl" />
            <span className="text-xl font-bold text-foreground tracking-tight">TallyBill</span>
          </div>
          <div className="text-6xl mb-4">🧾</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Bill not found</h1>
          <p className="text-sm text-muted-foreground mb-6">
            The link may be wrong or the bill was deleted.
          </p>
          <a
            href="https://apps.apple.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-6 py-3 rounded-xl min-h-[44px] hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.18 1.27-2.16 3.8.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            Get TallyBill
          </a>
        </div>
      </div>
    );
  }

  return <BillView data={data} onChange={invalidate} />;
}

/* ─── SSE hook ──────────────────────────────────────────────────────── */

function useBillSSE(billId: number, joinCode: string, invalidate: () => void) {
  const retryDelayRef = useRef(1000);
  const esRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const invalidateRef = useRef(invalidate);
  useEffect(() => { invalidateRef.current = invalidate; }, [invalidate]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    const params = new URLSearchParams({ joinCode });
    const es = new EventSource(`/api/bills/${billId}/events?${params}`);
    esRef.current = es;

    es.onopen = () => {
      retryDelayRef.current = 1000;
      invalidateRef.current();
    };

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed?.event === "bill_changed") {
          invalidateRef.current();
        }
      } catch {
      }
    };

    const scheduleReconnect = () => {
      if (!mountedRef.current) return;
      es.close();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      const delay = retryDelayRef.current;
      retryDelayRef.current = Math.min(delay * 2, 30_000);
      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };

    es.onerror = scheduleReconnect;
  }, [billId, joinCode]);

  useEffect(() => {
    mountedRef.current = true;
    retryDelayRef.current = 1000;
    connect();
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);
}

/* ─── Bill view ─────────────────────────────────────────────────────── */

function BillView({ data, onChange }: { data: BillDetail; onChange: () => void }) {
  const { bill, lines, users, ownerName } = data;
  const billId = bill.id;

  useBillSSE(billId, bill.joinCode, onChange);

  const { toasts, show: showToast } = useToast();

  const totalsQuery = useGetBillTotals(billId, {
    query: { queryKey: getGetBillTotalsQueryKey(billId) },
  });
  const totals = totalsQuery.data;

  const updateBill = useUpdateBill({ mutation: { onSuccess: onChange } });
  const addPerson = useCreateBillUser({
    mutation: {
      onSuccess: () => { onChange(); showToast("Person added"); },
    },
  });
  const removePerson = useDeleteBillUser({
    mutation: {
      onSuccess: () => { onChange(); showToast("Person removed"); },
    },
  });
  const addLine = useCreateBillLine({
    mutation: {
      onSuccess: () => { onChange(); showToast("Item added"); },
    },
  });
  const updateLine = useUpdateBillLine({ mutation: { onSuccess: onChange } });
  const deleteLine = useDeleteBillLine({
    mutation: {
      onSuccess: () => { onChange(); showToast("Item removed"); },
    },
  });
  const toggleAssignment = useToggleBillLineUser({ mutation: { onSuccess: onChange } });
  const renamePerson = useUpdateBillUser({
    mutation: {
      onSuccess: () => { onChange(); showToast("Saved"); },
    },
  });

  const saveBill = (patch: UpdateBillRequest) =>
    updateBill.mutate({ billId, data: patch });

  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemTotal, setNewItemTotal] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");

  const [splitLineId, setSplitLineId] = useState<number | null>(null);
  const [splitQtyInput, setSplitQtyInput] = useState("");
  const [splitError, setSplitError] = useState("");

  const [editPersonId, setEditPersonId] = useState<number | null>(null);
  const editPerson = users.find((u) => u.id === editPersonId) ?? null;
  const [editPersonName, setEditPersonName] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [showDiscount, setShowDiscount] = useState(false);
  const [showTaxTip, setShowTaxTip] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  // "That's me": lets a diner tap their name once and thereafter see their own
  // share pinned at the top. Persisted per-bill so it survives refreshes.
  const meStorageKey = `tallybill:me:${bill.joinCode}`;
  const [meId, setMeId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(meStorageKey);
    return raw ? Number(raw) : null;
  });
  useEffect(() => {
    if (meId != null) window.localStorage.setItem(meStorageKey, String(meId));
    else window.localStorage.removeItem(meStorageKey);
  }, [meId, meStorageKey]);
  // Clear the identity if that person is removed from the bill.
  useEffect(() => {
    if (meId != null && !users.some((u) => u.id === meId)) setMeId(null);
  }, [users, meId]);

  /**
   * The totals, worked out exactly as the app's bill screen works them out.
   * See artifacts/mobile/app/bill/[id]/index.tsx — the two screens show the
   * same bill, so there is one arithmetic and this is a copy of it, not a
   * second opinion.
   *
   * A line's `total` is already net of its own discount, so what is owed for
   * the items is simply their sum.
   */
  const chargedTotal = useMemo(
    () => Math.round(lines.reduce((s, l) => s + num(l.total), 0) * 100) / 100,
    [lines],
  );
  // Lines carry their own discount, so the bill-wide figure is just their sum.
  const discountTotal = useMemo(
    () => Math.round(lines.reduce((s, l) => s + num(l.discountAmount), 0) * 100) / 100,
    [lines],
  );
  /**
   * The subtotal shown is BEFORE the discount, so the card can be read down:
   * subtotal, less discount, plus tax and tip, equals total. Line totals are
   * stored net, so the discount has to be added back to get there.
   */
  const subtotal = Math.round((chargedTotal + discountTotal) * 100) / 100;
  const taxPercent = num(bill.taxPercent);
  const tipPercent = num(bill.tipPercent);
  // Worked out on what is owed, not on the pre-discount subtotal: tax is
  // charged on the discounted price and a tip on a cheaper bill is smaller.
  const taxAmount = Math.round(chargedTotal * (taxPercent / 100) * 100) / 100;
  const tipAmount = Math.round(chargedTotal * (tipPercent / 100) * 100) / 100;
  const grandTotal = Math.round((chargedTotal + taxAmount + tipAmount) * 100) / 100;
  const fmt = (n: number) => formatMoney(n, bill.currency ?? null);
  const defaultDiscountPercent = num(bill.discountPercent);

  // The photo the bill was scanned from, served through the bill's own storage
  // route, which the join code opens. The same URL the app builds.
  const receiptObjectId = bill.receiptImagePath ? bill.receiptImagePath.split("/").pop() ?? null : null;
  const receiptUrl = receiptObjectId
    ? `/api/bills/${billId}/storage/objects/uploads/${receiptObjectId}?joinCode=${encodeURIComponent(bill.joinCode)}`
    : null;

  const discountLines: DiscountLine[] = lines.map((l) => ({
    id: l.id,
    description: l.description,
    total: num(l.total),
    originalTotal: l.originalTotal != null ? num(l.originalTotal) : null,
  }));

  /**
   * Writes back only the lines whose price actually moved, as the app does,
   * and remembers the rate as the bill's default for next time.
   */
  const handleDiscountSave = (results: DiscountResultRow[], newDefaultPercent: number) => {
    setShowDiscount(false);
    const byId = new Map(lines.map((l) => [l.id, l]));
    let changed = 0;
    for (const result of results) {
      const line = byId.get(result.id);
      if (!line) continue;
      const currentOriginal = line.originalTotal != null ? num(line.originalTotal) : null;
      if (num(line.total) === result.total && currentOriginal === result.originalTotal) continue;
      const quantity = num(line.quantity) || 1;
      changed += 1;
      updateLine.mutate({
        billId,
        lineId: line.id,
        data: {
          description: line.description,
          quantity,
          unitPrice: Math.round((result.total / quantity) * 100) / 100,
          total: result.total,
          originalTotal: result.originalTotal,
        },
      });
    }
    if (newDefaultPercent !== defaultDiscountPercent) saveBill({ discountPercent: newDefaultPercent });
    if (changed > 0) showToast("Discount saved");
  };

  /**
   * An item is edited as its FULL price plus money off it, as in the app, so a
   * discount survives an edit instead of being dropped by it.
   */
  const handleUpdateLine = (
    line: BillLine,
    patch: { description: string; quantity: number; total: number; discountAmount: number },
  ) => {
    const charged = Math.round((patch.total - patch.discountAmount) * 100) / 100;
    updateLine.mutate({
      billId,
      lineId: line.id,
      data: {
        description: patch.description,
        quantity: patch.quantity,
        unitPrice: charged / (patch.quantity || 1),
        total: charged,
        // Sent every time, so an edit neither drops a discount nor leaves a
        // stale original claiming a saving that no longer matches the price.
        originalTotal: patch.discountAmount > 0 ? patch.total : null,
      },
    });
  };

  const openEditPerson = (u: BillMember) => {
    setEditPersonId(u.id);
    setEditPersonName(u.name);
    setConfirmRemove(false);
  };

  const handleAddPerson = () => {
    const name = newPersonName.trim();
    if (!name) return;
    const color = PEOPLE_COLORS[users.length % PEOPLE_COLORS.length]!;
    addPerson.mutate({ billId, data: { name, color } });
    setNewPersonName("");
    setShowAddPerson(false);
  };

  const handleAddItem = () => {
    const desc = newItemDesc.trim();
    if (!desc) return;
    const total = parseFloat(newItemTotal) || 0;
    const quantity = Math.max(1, parseFloat(newItemQty) || 1);
    const unitPrice = quantity > 0 ? total / quantity : total;
    addLine.mutate({
      billId,
      data: { description: desc, quantity, unitPrice, total },
    });
    setNewItemDesc("");
    setNewItemTotal("");
    setNewItemQty("1");
    setShowAddItem(false);
  };

  const handleConfirmSplit = () => {
    if (splitLineId === null) return;
    const line = lines.find((l) => l.id === splitLineId);
    if (!line) return;

    const currentQty = parseFloat(String(line.quantity));
    const splitQty = parseFloat(splitQtyInput);

    if (isNaN(splitQty) || splitQty <= 0 || splitQty >= currentQty) {
      setSplitError(`Enter a number between 0 and ${currentQty} (exclusive).`);
      return;
    }

    const lineUnitPrice = parseFloat(String(line.unitPrice));
    const lineTotal = parseFloat(String(line.total));
    const splitTotal = Math.round(splitQty * lineUnitPrice * 100) / 100;
    const remainderTotal = Math.round((lineTotal - splitTotal) * 100) / 100;
    const remainderQty = currentQty - splitQty;

    // A discount belongs to the units, not to the row, so splitting the row
    // splits it too. Without this, splitting a discounted line quietly put both
    // halves back to full price and the bill went up.
    const lineOriginal = line.originalTotal != null ? num(line.originalTotal) : null;
    const splitOriginal = lineOriginal != null && lineOriginal > lineTotal
      ? Math.round((lineOriginal / currentQty) * splitQty * 100) / 100
      : null;
    const remainderOriginal = lineOriginal != null && splitOriginal != null
      ? Math.round((lineOriginal - splitOriginal) * 100) / 100
      : null;

    setSplitLineId(null);
    setSplitQtyInput("");
    setSplitError("");

    updateLine.mutate({
      billId,
      lineId: splitLineId,
      data: {
        description: line.description,
        quantity: remainderQty,
        unitPrice: lineUnitPrice,
        total: remainderTotal,
        originalTotal: remainderOriginal,
      },
    });

    addLine.mutate({
      billId,
      data: {
        description: line.description,
        quantity: splitQty,
        unitPrice: lineUnitPrice,
        total: splitTotal,
        originalTotal: splitOriginal,
        afterLineId: splitLineId,
      },
    });
  };

  const hasUnassigned = totals && !totals.settled;
  const myTotal =
    meId != null ? totals?.perPerson.find((p) => p.billUserId === meId) ?? null : null;
  const myName = users.find((u) => u.id === meId)?.name ?? "";

  const scrollToPerPerson = () => {
    document.getElementById("per-person")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen pb-24">
      <TopBar />

      <header className="bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <HeaderEditable bill={bill} onSave={saveBill} ownerName={ownerName} peopleCount={users.length} />
          {receiptUrl && (
            <button
              onClick={() => setShowReceipt(true)}
              className="mt-3 w-full flex items-center gap-3 border border-border rounded-xl p-2 text-left hover:bg-muted transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img src={receiptUrl} alt="" className="w-12 h-12 object-cover rounded-lg bg-muted shrink-0" />
              <span className="text-sm font-medium text-foreground">View receipt</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {myTotal && (
          <div className="rounded-2xl p-4 flex items-center justify-between gap-3 bg-primary/10 border border-primary/20">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-primary-text uppercase tracking-wide truncate">
                Your share{myName ? `, ${myName}` : ""}
              </div>
              <button
                onClick={scrollToPerPerson}
                className="text-3xl font-bold text-primary-text tabular-nums leading-tight text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                title="View your breakdown"
              >
                {fmt(myTotal.total)}
              </button>
            </div>
            <button
              onClick={() => setMeId(null)}
              className="text-xs text-muted-foreground underline shrink-0 min-h-[44px] px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Not you?
            </button>
          </div>
        )}

        <section>
          <SectionHeader
            title="PEOPLE"
            actionLabel="+ Add"
            onAction={() => setShowAddPerson(true)}
          />
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Add people to start splitting
            </p>
          ) : (
            <>
              {!meId && (
                <p className="text-xs text-muted-foreground mt-2">
                  👋 Tap your name to see what you owe.
                </p>
              )}
              <div className="flex gap-3 overflow-x-auto pb-2 mt-3">
                {users.map((u) => (
                  <PersonChip
                    key={u.id}
                    user={u}
                    isMe={u.id === meId}
                    onIdentify={() => setMeId(u.id === meId ? null : u.id)}
                    onEdit={() => openEditPerson(u)}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        <section>
          <SectionHeader
            title="ITEMS"
            actionLabel="+ Add item"
            onAction={() => setShowAddItem(true)}
          />

          {hasUnassigned && (
            <div className="mt-3 flex items-center gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200 rounded-xl px-4 py-3">
              <span className="text-lg leading-none">⚠️</span>
              <span className="text-sm font-semibold">
                Some items aren't assigned yet — totals will update as you assign them.
              </span>
            </div>
          )}

          {lines.length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-2xl py-10 px-6 text-center mt-3">
              <p className="text-sm text-muted-foreground">
                No items yet. Add the first one above.
              </p>
            </div>
          ) : (
            <div className="space-y-2 mt-3">
              {lines.map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
                  users={users}
                  currency={bill.currency ?? null}
                  onToggle={(billUserId) =>
                    toggleAssignment.mutate({
                      billId,
                      lineId: line.id,
                      data: { billUserId },
                    })
                  }
                  onDelete={() => deleteLine.mutate({ billId, lineId: line.id })}
                  onUpdate={(patch) => handleUpdateLine(line, patch)}
                  onSplit={() => {
                    setSplitLineId(line.id);
                    setSplitQtyInput("");
                    setSplitError("");
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {totals && totals.perPerson.length > 0 && (
          <section id="per-person" className="scroll-mt-16">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground mb-3">
              PER PERSON
            </h2>
            <div className="space-y-2">
              {totals.perPerson.map((p) => (
                <PersonTotalRow
                  key={p.billUserId}
                  person={p}
                  currency={bill.currency ?? null}
                  billId={billId}
                  isMe={p.billUserId === meId}
                  onChange={onChange}
                />
              ))}
            </div>
          </section>
        )}

        <section
          className="bg-card border border-border rounded-2xl p-5 space-y-2"
          style={{ boxShadow: "0 2px 8px 0 hsl(160 84% 39% / 0.08)" }}
        >
          {totals?.settled && (
            <div className="flex justify-end mb-1">
              <span
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/15 text-primary-text"
              >
                <span className="text-coral">✓</span>
                All settled
              </span>
            </div>
          )}
          <SummaryRow label="Subtotal" value={fmt(subtotal)} />
          {/* Tinted together so they read as controls, as on the app's bill. */}
          <div className="rounded-xl bg-muted/60 -mx-2 px-2 py-1">
            {lines.length > 0 && (
              <TappableRow
                label="Discount"
                value={discountTotal > 0 ? `\u2212${fmt(discountTotal)}` : fmt(0)}
                highlight={discountTotal > 0}
                onClick={() => setShowDiscount(true)}
              />
            )}
            <TappableRow
              label={taxPercent > 0 ? `Tax (${fmtPct(taxPercent)}%)` : "Tax"}
              value={taxPercent > 0 ? fmt(taxAmount) : "Add tax"}
              highlight={taxPercent === 0}
              onClick={() => setShowTaxTip(true)}
            />
            <TappableRow
              label={tipPercent > 0 ? `Tip (${fmtPct(tipPercent)}%)` : "Tip"}
              value={tipPercent > 0 ? fmt(tipAmount) : "Add tip"}
              highlight={tipPercent === 0}
              onClick={() => setShowTaxTip(true)}
            />
          </div>
          <div className="h-px bg-border my-1" />
          <div className="flex justify-between items-center">
            <span className="text-base font-bold text-foreground">Grand Total</span>
            <span className="text-xl font-bold text-primary-text tabular-nums">{fmt(grandTotal)}</span>
          </div>
        </section>
      </main>

      <footer className="max-w-2xl mx-auto px-4 py-10 mt-2 border-t border-border">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2">
            <img src={import.meta.env.BASE_URL + "favicon.svg"} alt="TallyBill" className="w-8 h-8 rounded-lg" />
            <span className="text-base font-bold text-foreground tracking-tight">TallyBill</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-xs">
            The easiest way to split bills with friends. Download the app to create and manage your bills.
          </p>
          <div className="flex gap-3 flex-wrap justify-center">
            <a
              href="https://apps.apple.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-foreground text-background text-xs font-semibold px-4 py-2.5 rounded-xl min-h-[44px] hover:opacity-80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.18 1.27-2.16 3.8.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              App Store
            </a>
            <a
              href="https://play.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-foreground text-background text-xs font-semibold px-4 py-2.5 rounded-xl min-h-[44px] hover:opacity-80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20.5v-17c0-.83.94-1.3 1.6-.8l14 8.5c.6.36.6 1.24 0 1.6l-14 8.5c-.66.5-1.6.03-1.6-.8z"/></svg>
              Google Play
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Bill join code:{" "}
            <span className="font-mono font-semibold text-foreground">{bill.joinCode}</span>
          </p>
        </div>
      </footer>

      {/* Sticky mobile bottom bar */}
      <div className="fixed bottom-0 inset-x-0 lg:hidden bg-card border-t border-border px-4 py-3 flex items-center justify-between gap-3 z-30">
        <div className="min-w-0">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            {myTotal ? "You owe" : "Grand Total"}
          </div>
          <div className="text-lg font-bold text-primary-text tabular-nums leading-tight">
            {fmt(myTotal ? myTotal.total : grandTotal)}
          </div>
        </div>
        {myTotal ? (
          <button
            onClick={scrollToPerPerson}
            className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-xl min-h-[44px] flex items-center gap-1.5 hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
          >
            View breakdown
          </button>
        ) : (
          <a
            href="https://apps.apple.com"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-primary text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-xl min-h-[44px] flex items-center gap-1.5 hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.18 1.27-2.16 3.8.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            Open in App
          </a>
        )}
      </div>

      <ToastContainer toasts={toasts} />

      {/* Add person modal */}
      {showAddPerson && (
        <Modal title="Add person" onClose={() => setShowAddPerson(false)}>
          <input
            autoFocus
            value={newPersonName}
            onChange={(e) => setNewPersonName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddPerson()}
            placeholder="Name"
            className="w-full border-2 border-border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
          />
          <ModalButtons
            onCancel={() => setShowAddPerson(false)}
            onConfirm={handleAddPerson}
            confirmLabel="Add"
          />
        </Modal>
      )}

      {/* Add item modal */}
      {showAddItem && (
        <Modal title="Add item" onClose={() => setShowAddItem(false)}>
          <input
            autoFocus
            value={newItemDesc}
            onChange={(e) => setNewItemDesc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
            placeholder="Item description"
            className="w-full border-2 border-border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Qty</label>
              <input
                value={newItemQty}
                onChange={(e) => setNewItemQty(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                placeholder="1"
                inputMode="decimal"
                className="w-16 border-2 border-border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-primary text-center focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-muted-foreground font-medium">Total amount</label>
              <input
                value={newItemTotal}
                onChange={(e) => setNewItemTotal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                placeholder="e.g. 12.50"
                inputMode="decimal"
                className="w-full border-2 border-border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <ModalButtons
            onCancel={() => setShowAddItem(false)}
            onConfirm={handleAddItem}
            confirmLabel="Add"
          />
        </Modal>
      )}

      {/* Split item modal */}
      {splitLineId !== null && (() => {
        const line = lines.find((l) => l.id === splitLineId);
        const currentQty = line ? parseFloat(String(line.quantity)) : 0;
        return (
          <Modal title="Split item" onClose={() => { setSplitLineId(null); setSplitError(""); }}>
            <p className="text-sm text-muted-foreground">
              How many units to split off?{" "}
              <span className="font-medium text-foreground">
                ({currentQty} total)
              </span>
            </p>
            <input
              autoFocus
              value={splitQtyInput}
              onChange={(e) => { setSplitQtyInput(e.target.value); setSplitError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleConfirmSplit()}
              inputMode="decimal"
              placeholder={`e.g. 1 (max ${currentQty - 0.01})`}
              className="w-full border-2 border-border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
            {splitError && (
              <p className="text-sm text-destructive font-medium -mt-1">{splitError}</p>
            )}
            <ModalButtons
              onCancel={() => { setSplitLineId(null); setSplitError(""); }}
              onConfirm={handleConfirmSplit}
              confirmLabel="Split"
            />
          </Modal>
        );
      })()}

      {/* Edit person modal: rename, or remove from the bill */}
      {editPerson && (
        <Modal title="Edit person" onClose={() => setEditPersonId(null)}>
          {confirmRemove ? (
            <>
              <p className="text-sm text-muted-foreground">
                Remove <span className="font-semibold text-foreground">{editPerson.name}</span> from this bill?
                Their item assignments will be cleared.
              </p>
              <ModalButtons
                onCancel={() => setConfirmRemove(false)}
                onConfirm={() => {
                  removePerson.mutate({ billId, userId: editPerson.id });
                  setEditPersonId(null);
                }}
                confirmLabel="Remove"
                destructive
              />
            </>
          ) : (
            <>
              <label className="block text-xs text-muted-foreground font-medium">
                Name
                <input
                  autoFocus
                  value={editPersonName}
                  onChange={(e) => setEditPersonName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const name = editPersonName.trim();
                    if (name && name !== editPerson.name) renamePerson.mutate({ billId, userId: editPerson.id, data: { name } });
                    setEditPersonId(null);
                  }}
                  className="mt-1 w-full border-2 border-border rounded-lg px-3 py-2.5 text-base text-foreground focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <ModalButtons
                onCancel={() => setEditPersonId(null)}
                onConfirm={() => {
                  const name = editPersonName.trim();
                  if (name && name !== editPerson.name) renamePerson.mutate({ billId, userId: editPerson.id, data: { name } });
                  setEditPersonId(null);
                }}
                confirmLabel="Save"
              />
              <button
                onClick={() => setConfirmRemove(true)}
                className="w-full text-sm font-semibold text-destructive border-2 border-destructive/40 rounded-lg py-2.5 min-h-[44px] hover:bg-destructive/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Remove from bill
              </button>
            </>
          )}
        </Modal>
      )}

      {showDiscount && (
        <DiscountModal
          lines={discountLines}
          defaultPercent={defaultDiscountPercent}
          currency={bill.currency ?? null}
          onSave={handleDiscountSave}
          onClose={() => setShowDiscount(false)}
        />
      )}

      {showTaxTip && (
        <TaxTipModal
          subtotal={chargedTotal}
          taxPercent={taxPercent}
          tipPercent={tipPercent}
          currency={bill.currency ?? null}
          onSave={(tax, tip) => {
            setShowTaxTip(false);
            const patch: UpdateBillRequest = {};
            if (tax !== taxPercent) patch.taxPercent = tax;
            if (tip !== tipPercent) patch.tipPercent = tip;
            if (Object.keys(patch).length > 0) saveBill(patch);
          }}
          onClose={() => setShowTaxTip(false)}
        />
      )}

      {showReceipt && receiptUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setShowReceipt(false)}
          role="dialog"
          aria-label="Receipt"
        >
          <img src={receiptUrl} alt="Receipt" className="max-h-full max-w-full object-contain rounded-lg" />
          <button
            onClick={() => setShowReceipt(false)}
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-black/60 text-white text-xl flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close receipt"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Header editable ───────────────────────────────────────────────── */

function HeaderEditable({
  bill,
  onSave,
  ownerName,
  peopleCount,
}: {
  bill: Bill;
  onSave: (patch: UpdateBillRequest) => void;
  ownerName: string;
  peopleCount: number;
}) {
  const [title, setTitle] = useState<string>(bill.title);
  const [date, setDate] = useState<string>(bill.date);
  const [currency, setCurrency] = useState<string>(bill.currency ?? "");

  useEffect(() => {
    setTitle(bill.title);
    setDate(bill.date);
    setCurrency(bill.currency ?? "");
  }, [bill.title, bill.date, bill.currency]);

  return (
    <div className="space-y-1.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (title.trim() && title !== bill.title) onSave({ title: title.trim() });
        }}
        className="w-full text-xl font-bold text-foreground bg-transparent focus:outline-none focus:bg-muted rounded px-1 -mx-1 focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex flex-wrap items-center gap-2 px-1 -mx-1">
        <span className="text-xs text-muted-foreground">By {ownerName}</span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          {peopleCount} {peopleCount === 1 ? "person" : "people"}
        </span>
        {bill.currency && (
          <span className="inline-flex items-center text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-mono">
            {bill.currency}
          </span>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <label className="flex-1 text-xs text-muted-foreground">
          <span className="block mb-0.5">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onBlur={() => {
              if (date && date !== bill.date) onSave({ date });
            }}
            className="w-full border border-border rounded-md px-2 py-1.5 text-sm text-foreground bg-card focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
          />
        </label>
        <label className="w-32 text-xs text-muted-foreground">
          <span className="block mb-0.5">Currency</span>
          <select
            value={currency}
            onChange={(e) => {
              const v = e.target.value;
              setCurrency(v);
              if (v !== (bill.currency ?? "")) onSave({ currency: v || null });
            }}
            className="w-full border border-border rounded-md px-2 py-1.5 text-sm text-foreground bg-card focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
          >
            <option value="">—</option>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

/* ─── Section header ────────────────────────────────────────────────── */

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-semibold tracking-wider text-muted-foreground">
        {title}
      </h2>
      <button
        onClick={onAction}
        className="text-sm font-semibold text-primary-text bg-muted px-3 py-1.5 rounded-lg hover:bg-secondary transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {actionLabel}
      </button>
    </div>
  );
}

/* ─── Person chip ───────────────────────────────────────────────────── */

function PersonChip({
  user,
  isMe,
  onIdentify,
  onEdit,
}: {
  user: BillMember;
  isMe: boolean;
  onIdentify: () => void;
  onEdit: () => void;
}) {
  const initials = getInitials(user.name);
  return (
    <div className="relative shrink-0">
      <button
        onClick={onIdentify}
        className="flex flex-col items-center gap-1 group min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg px-1"
        title={isMe ? "This is you — tap to clear" : "Tap if this is you"}
        aria-pressed={isMe}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-base shadow-sm group-hover:opacity-90 transition relative"
          style={{
            backgroundColor: user.color,
            boxShadow: isMe ? `0 0 0 3px hsl(var(--background)), 0 0 0 5px ${user.color}` : undefined,
          }}
        >
          {initials}
          {isMe && (
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary border-2 border-background flex items-center justify-center">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </span>
          )}
        </div>
        <span className={`text-xs max-w-[64px] truncate ${isMe ? "font-semibold text-primary-text" : "text-foreground"}`}>
          {isMe ? "You" : user.name}
        </span>
      </button>
      <button
        onClick={onEdit}
        aria-label={`Edit ${user.name}`}
        title={`Rename or remove ${user.name}`}
        className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground flex items-center justify-center shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </button>
    </div>
  );
}

/* ─── Line row ──────────────────────────────────────────────────────── */

function LineRow({
  line,
  users,
  currency,
  onToggle,
  onDelete,
  onUpdate,
  onSplit,
}: {
  line: BillLine;
  users: BillMember[];
  currency: string | null;
  onToggle: (billUserId: number) => void;
  onDelete: () => void;
  /** `total` is the FULL price; `discountAmount` is the money off it. */
  onUpdate: (patch: { description: string; quantity: number; total: number; discountAmount: number }) => void;
  onSplit: () => void;
}) {
  const assigned = new Set<number>(line.assignedUserIds ?? []);
  const originalTotal = line.originalTotal != null ? num(line.originalTotal) : null;
  const isDiscounted = originalTotal != null && originalTotal > num(line.total);
  const fullPrice = isDiscounted ? originalTotal : num(line.total);
  const shownRate = isDiscounted ? percentInput(discountRate(originalTotal, num(line.total))) : "";
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(line.description);
  const [qty, setQty] = useState(String(num(line.quantity) || 1));
  // Edited as the FULL price plus a rate off it, as in the app.
  const [total, setTotal] = useState(String(fullPrice));
  const [rate, setRate] = useState(shownRate);
  /**
   * What to say about the discount: always the rate, worked out from the two
   * prices. The same choice the app makes — a stored wording can go stale when
   * a price is edited, and a rate is the thing someone can check against the
   * paper in their hand.
   */
  const discountNote = isDiscounted
    ? `${percentLabel(discountRate(originalTotal, num(line.total)))}% off`
    : null;

  useEffect(() => {
    setDesc(line.description);
    setQty(String(num(line.quantity) || 1));
    setTotal(String(fullPrice));
    setRate(shownRate);
  }, [line.id, line.description, line.quantity, line.total, line.originalTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsedTotal = parseFloat(total.replace(",", ".")) || 0;
  const rateRaw = rate.trim() === "" ? 0 : Number(rate.replace(",", "."));
  const rateError = !Number.isFinite(rateRaw) || rateRaw < 0 || rateRaw > 100 ? "0 to 100" : null;
  /**
   * Money off. Kept to the cent the receipt printed while neither the price nor
   * the rate has been touched, so "25%" shown for 14.00 off 57.00 does not
   * quietly become 14.25 on save.
   */
  const untouched = parsedTotal === fullPrice && rate === shownRate;
  const discountMoney = rateError || rateRaw <= 0 || parsedTotal <= 0
    ? 0
    : untouched && isDiscounted
      ? Math.round((originalTotal - num(line.total)) * 100) / 100
      : Math.round(parsedTotal * (rateRaw / 100) * 100) / 100;
  const youPay = Math.round((parsedTotal - Math.min(discountMoney, parsedTotal)) * 100) / 100;

  const save = () => {
    if (rateError) return;
    const q = parseFloat(qty) || 1;
    const changed =
      desc.trim() !== line.description ||
      q !== num(line.quantity) ||
      !untouched;
    if (changed) {
      onUpdate({
        description: desc.trim() || line.description,
        quantity: q,
        total: parsedTotal,
        discountAmount: Math.min(discountMoney, parsedTotal),
      });
    }
    setEditing(false);
  };

  const lineQty = num(line.quantity);

  return (
    <div
      className="bg-card border border-border rounded-2xl p-3 space-y-2"
      style={{ boxShadow: "0 1px 4px 0 hsl(222 47% 11% / 0.06)" }}
    >
      <div className="flex items-start gap-2">
        {editing ? (
          <div className="flex-1 space-y-2">
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
            />
            <div className="flex gap-2">
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="decimal"
                placeholder="Qty"
                className="w-16 border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
              />
              <input
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                inputMode="decimal"
                placeholder="Price"
                aria-label="Full price"
                className="flex-1 min-w-0 border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
              />
              <button
                onClick={save}
                disabled={!!rateError}
                className="px-3 py-1.5 text-sm font-semibold bg-primary text-primary-foreground rounded-md min-h-[44px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Save
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor={`rate-${line.id}`} className="text-muted-foreground">Discount</label>
              <input
                id={`rate-${line.id}`}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                inputMode="decimal"
                placeholder="0"
                className={`w-16 border rounded-md px-2 py-1.5 text-sm text-center focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring min-h-[44px] ${rateError ? "border-destructive" : "border-border"}`}
              />
              <span className="text-muted-foreground">%</span>
              <span className={`ml-auto text-sm font-medium whitespace-nowrap ${rateError ? "text-destructive" : "text-primary-text"}`}>
                {rateError ?? (discountMoney > 0 ? `you pay ${formatMoney(youPay, currency)}` : "")}
              </span>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex-1 min-w-0 text-left min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <span className="font-medium text-foreground break-words">
              {line.description}
            </span>
            <div className="mt-0.5 flex items-baseline gap-x-1.5 flex-wrap">
              <span className="inline-flex items-center bg-muted text-muted-foreground text-[11px] font-semibold rounded px-1.5 py-0.5 shrink-0 self-center">
                ×{lineQty}
              </span>
              <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">
                {formatMoney(num(line.total), currency)}
              </span>
              {lineQty > 1 && (
                <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">
                  {formatMoney(num(line.unitPrice), currency)} each
                </span>
              )}
            </div>
            {/* The old price stays beside the new one, struck through: a number
                that dropped without saying why reads as a mistake. It sits on
                its own line rather than in front of the price, because on a
                phone the two prices together left the item name no room. */}
            {isDiscounted && (
              <div className="flex items-baseline gap-1.5 mt-0.5 text-xs">
                <span className="text-muted-foreground line-through tabular-nums">
                  {formatMoney(originalTotal, currency)}
                </span>
                <span className="font-medium text-primary-text">{discountNote}</span>
              </div>
            )}
          </button>
        )}
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            {lineQty > 1 && (
              <button
                onClick={onSplit}
                className="flex items-center gap-1 text-xs font-medium text-primary-text border border-primary/30 bg-primary/5 hover:bg-primary/15 px-2 py-1 rounded-md transition min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Split into two lines"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                Split
              </button>
            )}
            <button
              onClick={() => setEditing(true)}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded transition min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Edit item"
              aria-label="Edit item"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive p-1.5 rounded transition min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Delete"
              aria-label="Delete item"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        )}
      </div>

      {users.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            <button
              onClick={() => {
                users.forEach((u) => {
                  if (!assigned.has(u.id)) onToggle(u.id);
                });
              }}
              className="px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              All
            </button>
            <div className="w-px bg-border" />
            <button
              onClick={() => {
                users.forEach((u) => {
                  if (assigned.has(u.id)) onToggle(u.id);
                });
              }}
              className="px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              None
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {users.map((u) => {
              const on = assigned.has(u.id);
              const initials = getInitials(u.name) || "?";
              return (
                <button
                  key={u.id}
                  onClick={() => onToggle(u.id)}
                  className="relative w-8 h-8 rounded-full flex items-center justify-center text-[11px] leading-none font-bold tracking-tight border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                  style={{
                    backgroundColor: on ? u.color : "transparent",
                    borderColor: u.color,
                    color: on ? "#fff" : u.color,
                  }}
                  title={u.name}
                  aria-label={`${u.name} — ${on ? "assigned" : "not assigned"}`}
                >
                  {initials}
                  {on && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary border border-background flex items-center justify-center">
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Person total row ──────────────────────────────────────────────── */

function PersonTotalRow({
  person,
  currency,
  billId,
  isMe,
  onChange,
}: {
  person: PersonTotal;
  currency: string | null;
  billId: number;
  isMe: boolean;
  onChange: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tipModalOpen, setTipModalOpen] = useState(false);
  const [tipVal, setTipVal] = useState(String(person.tipPercent));

  const updateUser = useUpdateBillUser({
    mutation: {
      onSuccess: () => {
        setTipModalOpen(false);
        onChange();
      },
    },
  });

  const saveTip = () => {
    const pct = parseFloat(tipVal);
    if (isNaN(pct) || pct < 0) return;
    updateUser.mutate({
      billId,
      userId: person.billUserId,
      data: { tipPercentOverride: pct },
    });
  };

  const resetTip = () => {
    updateUser.mutate({
      billId,
      userId: person.billUserId,
      data: { tipPercentOverride: null },
    });
  };

  const openTipModal = () => {
    setTipVal(String(person.tipPercent));
    setTipModalOpen(true);
  };

  const initials = getInitials(person.name);
  const fmt = (n: number) => formatMoney(n, currency);
  const fmtPct = (n: number) => String(Math.round(n * 100) / 100);

  const hasItems = person.items.length > 0;

  return (
    <>
      <div
        className={`bg-card rounded-2xl overflow-hidden ${isMe ? "border-2 border-primary" : "border border-border"}`}
        style={{ boxShadow: "0 1px 4px 0 hsl(222 47% 11% / 0.06)" }}
      >
        <div className="p-3 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
            style={{ backgroundColor: person.color }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-foreground truncate">
                {person.name}
                {isMe && (
                  <span className="ml-1.5 text-[10px] font-bold text-primary-text uppercase tracking-wide align-middle">You</span>
                )}
              </span>
              <span className="text-base font-bold text-primary-text tabular-nums">
                {fmt(person.total)}
              </span>
            </div>
          </div>
          {hasItems && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground hover:text-foreground transition text-sm px-1 shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? "▲" : "▼"}
            </button>
          )}
        </div>

        {hasItems && expanded && (
          <div className="border-t border-border px-3 py-2 space-y-2">
            {person.items.map((item) => {
              const splitLabel =
                item.splitWithNames.length === 0
                  ? "not split"
                  : `split with ${item.splitWithNames.join(", ")}`;
              return (
                <div key={item.billLineId} className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground font-medium truncate">
                      {item.description}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fmt(item.lineTotal)} · {splitLabel}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                    {fmt(item.share)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-border px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Items</span>
            <span className="text-xs font-semibold text-foreground tabular-nums">{fmt(person.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Tax share</span>
            <span className="text-xs font-semibold text-foreground tabular-nums">{fmt(person.taxShare)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Tip ({fmtPct(person.tipPercent)}%)
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold tabular-nums ${person.tipIsCustom ? "text-primary-text" : "text-foreground"}`}>
                {fmt(person.tipAmount)}
              </span>
              <button
                onClick={openTipModal}
                className="text-muted-foreground hover:text-foreground transition p-0.5 rounded min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Set custom tip %"
                aria-label="Edit tip percentage"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              {person.tipIsCustom && (
                <button
                  onClick={resetTip}
                  className="text-muted-foreground hover:text-foreground transition p-0.5 rounded min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Reset to bill default tip"
                  aria-label="Reset tip to default"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.8"/></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {tipModalOpen && (
        <Modal title="Custom Tip %" onClose={() => setTipModalOpen(false)}>
          <p className="text-sm text-muted-foreground">
            Enter a tip percentage for {person.name} (e.g. 20 for 20%). Reset to restore the bill default.
          </p>
          <input
            autoFocus
            value={tipVal}
            onChange={(e) => setTipVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveTip()}
            inputMode="decimal"
            placeholder="15"
            className="w-full border-2 border-border rounded-lg px-3 py-2.5 text-base text-center focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
          />
          <ModalButtons
            onCancel={() => setTipModalOpen(false)}
            onConfirm={saveTip}
            confirmLabel="Set Tip %"
          />
        </Modal>
      )}
    </>
  );
}

/* ─── Summary rows ──────────────────────────────────────────────────── */

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

function TappableRow({
  label,
  value,
  highlight,
  onClick,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex justify-between items-center min-h-[44px] rounded-lg px-1 hover:bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <span className={`text-sm font-semibold tabular-nums ${highlight ? "text-primary-text" : "text-foreground"}`}>{value}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
      </span>
    </button>
  );
}

/* ─── Discount ──────────────────────────────────────────────────────── */

type DiscountLine = DiscountableLine & { description: string };
type DiscountResultRow = { id: number; originalTotal: number | null; total: number };

/**
 * Enter discounts and choose which items each one comes off. The web copy of
 * the app's DiscountSheet (artifacts/mobile/components/DiscountSheet.tsx), with
 * the same rules and the same shared maths:
 *
 * - It works in rounds: tick items, set a rate, apply; then tick others and
 *   apply a different rate. That is "30% off food, 20% off drinks".
 * - An item holds exactly ONE rate. Applying again replaces it, so a discount
 *   can never stack onto another.
 * - Every rate is measured against the undiscounted price.
 * - It opens on the EXACT rate each item already has, so opening it and
 *   pressing Done never moves a price by a rounding.
 */
function DiscountModal({
  lines,
  defaultPercent,
  currency,
  onSave,
  onClose,
}: {
  lines: DiscountLine[];
  defaultPercent: number;
  currency: string | null;
  onSave: (results: DiscountResultRow[], newDefaultPercent: number) => void;
  onClose: () => void;
}) {
  const [rateDraft, setRateDraft] = useState(
    String(defaultPercent > 0 ? Math.round(defaultPercent * 100) / 100 : 20),
  );
  const [rates, setRates] = useState<Map<number, number>>(() => {
    const existing = new Map<number, number>();
    for (const line of lines) {
      if (line.originalTotal != null && line.originalTotal > line.total) {
        const base = baseTotalOf(line);
        if (base > 0) existing.set(line.id, ((base - line.total) / base) * 100);
      }
    }
    return existing;
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const fmt = (n: number) => formatMoney(n, currency);

  const rate = parsePercent(rateDraft);
  const preview = useMemo(() => {
    let off = 0;
    let after = 0;
    for (const line of lines) {
      const result = applyPercent(line, rates.get(line.id) ?? 0);
      off += result.discountAmount;
      after += result.total;
    }
    return { off: Math.round(off * 100) / 100, after: Math.round(after * 100) / 100 };
  }, [lines, rates]);

  // Grouped by the rate as it reads, so two lines a receipt calls "25%" are one
  // group even when their exact rates differ by the rounding.
  const groups = useMemo(() => {
    const byRate = new Map<number, number>();
    for (const line of lines) {
      const value = rates.get(line.id);
      if (value === undefined) continue;
      const shown = discountRate(baseTotalOf(line), applyPercent(line, value).total);
      byRate.set(shown, (byRate.get(shown) ?? 0) + 1);
    }
    return [...byRate.entries()].sort((a, b) => b[0] - a[0]);
  }, [rates, lines]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = lines.length > 0 && selected.size === lines.length;

  const applyToSelected = () => {
    if (rate <= 0 || selected.size === 0) return;
    setRates((prev) => {
      const next = new Map(prev);
      for (const id of selected) next.set(id, rate);
      return next;
    });
    setSelected(new Set());
    setEditing(null);
  };

  /** Applied as it is typed, so what is shown is always what is in force. */
  const editRate = (id: number, text: string) => {
    const raw = Number(text.replace(",", "."));
    setEditDraft(Number.isFinite(raw) && raw > 100 ? "100" : text);
    const value = parsePercent(text);
    setRates((prev) => {
      const next = new Map(prev);
      if (value > 0) next.set(id, value);
      else next.delete(id);
      return next;
    });
  };

  const handleSave = () => {
    onSave(
      lines.map((line) => {
        const { id, originalTotal, total } = applyPercent(line, rates.get(line.id) ?? 0);
        return { id, originalTotal, total };
      }),
      rate > 0 ? rate : defaultPercent,
    );
  };

  return (
    <Modal title="Discount" onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="discount-rate" className="text-sm text-muted-foreground">Discount</label>
        <div className="flex items-center gap-1 border-2 border-border rounded-lg px-3 focus-within:border-primary">
          <input
            id="discount-rate"
            value={rateDraft}
            onChange={(e) => setRateDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            inputMode="decimal"
            className="w-14 py-2 text-base font-semibold text-right text-foreground bg-transparent focus:outline-none"
          />
          <span className="text-muted-foreground">%</span>
        </div>
      </div>

      <button
        onClick={applyToSelected}
        disabled={rate <= 0 || selected.size === 0}
        className="w-full rounded-lg py-2.5 text-sm font-semibold min-h-[44px] transition enabled:bg-primary enabled:text-primary-foreground disabled:bg-muted disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {selected.size === 0
          ? "Tick the items this comes off"
          : `Take ${Math.round(rate * 100) / 100}% off ${selected.size} item${selected.size === 1 ? "" : "s"}`}
      </button>

      <div className="flex justify-between text-sm">
        <button
          onClick={() => setSelected(allSelected ? new Set() : new Set(lines.map((l) => l.id)))}
          className="font-semibold text-primary-text min-h-[44px] px-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {allSelected ? "Untick all" : "Tick all"}
        </button>
        {rates.size > 0 && (
          <button
            onClick={() => { setRates(new Map()); setSelected(new Set()); }}
            className="text-muted-foreground min-h-[44px] px-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear discounts
          </button>
        )}
      </div>

      <div className="max-h-[40vh] overflow-y-auto -mx-1 px-1 divide-y divide-border">
        {lines.map((line) => {
          const linePercent = rates.get(line.id);
          const base = baseTotalOf(line);
          const result = applyPercent(line, linePercent ?? 0);
          const ticked = selected.has(line.id);
          const shown = linePercent === undefined ? 0 : percentLabel(discountRate(base, result.total));
          return (
            <div key={line.id} className="flex items-center gap-2 py-2">
              <label className="flex items-center gap-2 flex-1 min-w-0 min-h-[44px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={ticked}
                  onChange={() => toggle(line.id)}
                  className="w-5 h-5 accent-[hsl(var(--primary))] shrink-0"
                />
                <span className="text-sm text-foreground truncate">{line.description}</span>
              </label>
              {editing === line.id ? (
                <span className="flex items-center gap-0.5 border-2 border-primary rounded-md px-1.5">
                  <input
                    autoFocus
                    value={editDraft}
                    onChange={(e) => editRate(line.id, e.target.value)}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
                    inputMode="decimal"
                    aria-label={`Discount percent for ${line.description}`}
                    className="w-10 py-1.5 text-sm text-right bg-transparent focus:outline-none"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </span>
              ) : (
                <button
                  onClick={() => {
                    setEditing(line.id);
                    setEditDraft(linePercent === undefined ? "" : percentInput(discountRate(base, result.total)));
                  }}
                  aria-label={`${line.description}: ${shown}% off. Change`}
                  className={`text-xs font-semibold rounded-md border px-2 min-h-[36px] shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    linePercent === undefined
                      ? "border-border text-muted-foreground bg-muted"
                      : "border-primary/40 text-primary-text bg-primary/10"
                  }`}
                >
                  {shown}%
                </button>
              )}
              <span className="w-20 text-right shrink-0">
                {result.discountAmount > 0 && (
                  <span className="block text-[11px] text-muted-foreground line-through tabular-nums">{fmt(base)}</span>
                )}
                <span className="block text-sm font-semibold text-foreground tabular-nums">{fmt(result.total)}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center text-sm pt-1 border-t border-border">
        <span className="text-muted-foreground truncate">
          {groups.length === 0
            ? "No discount"
            : groups.slice(0, 2).map(([p, c]) => `${percentLabel(p)}% off ${c}`).join("  ·  ") +
              (groups.length > 2 ? `  +${groups.length - 2} more` : "")}
        </span>
        <span className="font-semibold text-foreground tabular-nums">{"\u2212"}{fmt(preview.off)}</span>
      </div>

      <button
        onClick={handleSave}
        className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-semibold min-h-[44px] hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Done · {fmt(preview.after)}
      </button>
    </Modal>
  );
}

/* ─── Tax and tip ───────────────────────────────────────────────────── */

/**
 * Tax and tip, each as a percent or as an amount — most receipts print the
 * amount. The bill stores a rate, so an amount is turned into one against what
 * is owed for the items (after discounts), exactly as the app does.
 */
function TaxTipModal({
  subtotal,
  taxPercent,
  tipPercent,
  currency,
  onSave,
  onClose,
}: {
  subtotal: number;
  taxPercent: number;
  tipPercent: number;
  currency: string | null;
  onSave: (tax: number, tip: number) => void;
  onClose: () => void;
}) {
  const [taxMode, setTaxMode] = useState<MoneyMode>("percent");
  const [tipMode, setTipMode] = useState<MoneyMode>("percent");
  const [taxInput, setTaxInput] = useState(taxPercent === 0 ? "" : String(taxPercent));
  const [tipInput, setTipInput] = useState(tipPercent === 0 ? "" : String(tipPercent));
  const fmt = (n: number) => formatMoney(n, currency);

  const tax = toPercent(taxMode, taxInput, subtotal);
  const tip = toPercent(tipMode, tipInput, subtotal);
  const taxAmount = amountFromPercent(tax, subtotal);
  const tipAmount = amountFromPercent(tip, subtotal);

  // Switching unit converts what is there rather than clearing it.
  const switchMode = (
    mode: MoneyMode,
    current: MoneyMode,
    percent: number,
    setMode: (m: MoneyMode) => void,
    setInput: (v: string) => void,
  ) => {
    if (mode === current) return;
    setMode(mode);
    if (percent <= 0) return setInput("");
    setInput(mode === "amount" ? amountFromPercent(percent, subtotal).toFixed(2) : fmtPct(percent));
  };

  const Field = ({
    label,
    mode,
    input,
    amount,
    onMode,
    onInput,
  }: {
    label: string;
    mode: MoneyMode;
    input: string;
    amount: number;
    onMode: (m: MoneyMode) => void;
    onInput: (v: string) => void;
  }) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-semibold" role="group" aria-label={`${label} as`}>
          {(["percent", "amount"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onMode(m)}
              aria-pressed={mode === m}
              className={`px-3 min-h-[36px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {m === "percent" ? "%" : "Amount"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          aria-label={`${label} ${mode === "percent" ? "percent" : "amount"}`}
          className="flex-1 min-w-0 border-2 border-border rounded-lg px-3 py-2 text-base focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-sm font-semibold text-foreground tabular-nums w-24 text-right">
          {mode === "percent" ? fmt(amount) : `${fmtPct(amount > 0 ? (amount / (subtotal || 1)) * 100 : 0)}%`}
        </span>
      </div>
    </div>
  );

  return (
    <Modal title="Tax and tip" onClose={onClose}>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-semibold text-foreground tabular-nums">{fmt(subtotal)}</span>
      </div>
      {Field({
        label: "Tax",
        mode: taxMode,
        input: taxInput,
        amount: taxAmount,
        onMode: (m) => switchMode(m, taxMode, tax, setTaxMode, setTaxInput),
        onInput: setTaxInput,
      })}
      {Field({
        label: "Tip",
        mode: tipMode,
        input: tipInput,
        amount: tipAmount,
        onMode: (m) => switchMode(m, tipMode, tip, setTipMode, setTipInput),
        onInput: setTipInput,
      })}
      <div className="flex justify-between items-center pt-1 border-t border-border">
        <span className="text-sm font-bold text-foreground">Total</span>
        <span className="text-lg font-bold text-primary-text tabular-nums">
          {fmt(Math.round((subtotal + taxAmount + tipAmount) * 100) / 100)}
        </span>
      </div>
      <ModalButtons onCancel={onClose} onConfirm={() => onSave(tax, tip)} confirmLabel="Save" />
    </Modal>
  );
}

/* ─── Modal + ModalButtons ──────────────────────────────────────────── */

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ModalButtons({
  onCancel,
  onConfirm,
  confirmLabel = "Add",
  destructive = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        onClick={onCancel}
        className="flex-1 border-2 border-border rounded-lg py-2.5 text-sm font-medium text-muted-foreground min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        className={`flex-1 rounded-lg py-2.5 text-sm font-semibold min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          destructive
            ? "bg-destructive text-destructive-foreground hover:opacity-90"
            : "bg-primary text-primary-foreground hover:opacity-90"
        } transition`}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
