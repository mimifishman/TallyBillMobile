import { useEffect, useMemo, useState } from "react";
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
  type Bill,
  type BillDetail,
  type BillLine,
  type BillMember,
  type PersonTotal,
  type UpdateBillRequest,
} from "@workspace/api-client-react";
import { CURRENCY_OPTIONS, formatMoney, PEOPLE_COLORS } from "@/lib/currency";

function num(v: unknown): number {
  return typeof v === "number" ? v : parseFloat(String(v ?? 0)) || 0;
}

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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading bill…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">🧾</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Bill not found</h1>
          <p className="text-sm text-muted-foreground">
            The link may be wrong or the bill was deleted.
          </p>
          <p className="mt-4 text-xs font-mono text-muted-foreground">Code: {code}</p>
        </div>
      </div>
    );
  }

  return <BillView data={data} onChange={invalidate} />;
}

function BillView({ data, onChange }: { data: BillDetail; onChange: () => void }) {
  const { bill, lines, users } = data;
  const billId = bill.id;

  const totalsQuery = useGetBillTotals(billId, {
    query: { queryKey: getGetBillTotalsQueryKey(billId) },
  });
  const totals = totalsQuery.data;

  const updateBill = useUpdateBill({ mutation: { onSuccess: onChange } });
  const addPerson = useCreateBillUser({ mutation: { onSuccess: onChange } });
  const removePerson = useDeleteBillUser({ mutation: { onSuccess: onChange } });
  const addLine = useCreateBillLine({ mutation: { onSuccess: onChange } });
  const updateLine = useUpdateBillLine({ mutation: { onSuccess: onChange } });
  const deleteLine = useDeleteBillLine({ mutation: { onSuccess: onChange } });
  const toggleAssignment = useToggleBillLineUser({ mutation: { onSuccess: onChange } });

  const saveBill = (patch: UpdateBillRequest) =>
    updateBill.mutate({ billId, data: patch });

  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemTotal, setNewItemTotal] = useState("");

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + num(l.total), 0),
    [lines],
  );
  const taxPercent = num(bill.taxPercent);
  const tipPercent = num(bill.tipPercent);
  const taxAmount = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
  const tipAmount = Math.round(subtotal * (tipPercent / 100) * 100) / 100;
  const grandTotal = subtotal + taxAmount + tipAmount;
  const fmt = (n: number) => formatMoney(n, bill.currency ?? null);

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
    addLine.mutate({
      billId,
      data: { description: desc, quantity: 1, unitPrice: total, total },
    });
    setNewItemDesc("");
    setNewItemTotal("");
    setShowAddItem(false);
  };

  return (
    <div className="min-h-screen pb-24">
      <header className="bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <HeaderEditable bill={bill} onSave={saveBill} />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
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
            <div className="flex gap-3 overflow-x-auto pb-2 mt-3">
              {users.map((u) => (
                <PersonChip
                  key={u.id}
                  user={u}
                  onRemove={() => {
                    if (confirm(`Remove ${u.name} from this bill?`)) {
                      removePerson.mutate({ billId, userId: u.id });
                    }
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeader
            title="ITEMS"
            actionLabel="+ Add item"
            onAction={() => setShowAddItem(true)}
          />
          {lines.length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-xl py-10 px-6 text-center mt-3">
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
                  onUpdate={(patch) =>
                    updateLine.mutate({
                      billId,
                      lineId: line.id,
                      data: {
                        description: patch.description,
                        quantity: patch.quantity,
                        unitPrice: patch.total / (patch.quantity || 1),
                        total: patch.total,
                      },
                    })
                  }
                />
              ))}
            </div>
          )}
        </section>

        {totals && totals.perPerson.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground mb-3">
              PER PERSON
            </h2>
            <div className="space-y-2">
              {totals.perPerson.map((p) => (
                <PersonTotalRow
                  key={p.billUserId}
                  person={p}
                  currency={bill.currency ?? null}
                />
              ))}
            </div>
            {!totals.settled && (
              <p className="mt-2 text-xs text-muted-foreground">
                Some items aren't assigned yet — totals will update as you assign them.
              </p>
            )}
          </section>
        )}

        <section className="bg-card border border-border rounded-xl p-4 space-y-2">
          <SummaryRow label="Subtotal" value={fmt(subtotal)} />
          <PercentRow
            label="Tax"
            percent={taxPercent}
            amount={taxAmount}
            currency={bill.currency ?? null}
            onChange={(v) => saveBill({ taxPercent: v })}
          />
          <PercentRow
            label="Tip"
            percent={tipPercent}
            amount={tipAmount}
            currency={bill.currency ?? null}
            onChange={(v) => saveBill({ tipPercent: v })}
          />
          <div className="h-px bg-border my-1" />
          <div className="flex justify-between items-center">
            <span className="font-semibold text-foreground">Total</span>
            <span className="text-lg font-bold text-primary">{fmt(grandTotal)}</span>
          </div>
        </section>

        <p className="text-center text-xs text-muted-foreground">
          Shared bill · code <span className="font-mono font-semibold">{bill.joinCode}</span>
        </p>
      </main>

      {showAddPerson && (
        <Modal title="Add person" onClose={() => setShowAddPerson(false)}>
          <input
            autoFocus
            value={newPersonName}
            onChange={(e) => setNewPersonName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddPerson()}
            placeholder="Name"
            className="w-full border-2 border-border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-primary"
          />
          <ModalButtons
            onCancel={() => setShowAddPerson(false)}
            onConfirm={handleAddPerson}
          />
        </Modal>
      )}

      {showAddItem && (
        <Modal title="Add item" onClose={() => setShowAddItem(false)}>
          <input
            autoFocus
            value={newItemDesc}
            onChange={(e) => setNewItemDesc(e.target.value)}
            placeholder="Item description"
            className="w-full border-2 border-border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-primary"
          />
          <input
            value={newItemTotal}
            onChange={(e) => setNewItemTotal(e.target.value)}
            placeholder="Amount (e.g. 12.50)"
            inputMode="decimal"
            className="w-full border-2 border-border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-primary"
          />
          <ModalButtons
            onCancel={() => setShowAddItem(false)}
            onConfirm={handleAddItem}
          />
        </Modal>
      )}
    </div>
  );
}

function HeaderEditable({
  bill,
  onSave,
}: {
  bill: Bill;
  onSave: (patch: UpdateBillRequest) => void;
}) {
  const [title, setTitle] = useState<string>(bill.title);
  const [restaurant, setRestaurant] = useState<string>(bill.restaurantName ?? "");
  const [date, setDate] = useState<string>(bill.date);
  const [currency, setCurrency] = useState<string>(bill.currency ?? "");

  useEffect(() => {
    setTitle(bill.title);
    setRestaurant(bill.restaurantName ?? "");
    setDate(bill.date);
    setCurrency(bill.currency ?? "");
  }, [bill.title, bill.restaurantName, bill.date, bill.currency]);

  return (
    <div className="space-y-1.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (title.trim() && title !== bill.title) onSave({ title: title.trim() });
        }}
        className="w-full text-xl font-bold text-foreground bg-transparent focus:outline-none focus:bg-muted rounded px-1 -mx-1"
      />
      <input
        value={restaurant}
        onChange={(e) => setRestaurant(e.target.value)}
        onBlur={() => {
          const v = restaurant.trim();
          const cur = bill.restaurantName ?? "";
          if (v !== cur) onSave({ restaurantName: v || null });
        }}
        placeholder="Restaurant or place"
        className="w-full text-sm text-muted-foreground bg-transparent focus:outline-none focus:bg-muted rounded px-1 -mx-1"
      />
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
            className="w-full border border-border rounded-md px-2 py-1.5 text-sm text-foreground bg-card focus:outline-none focus:border-primary"
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
            className="w-full border border-border rounded-md px-2 py-1.5 text-sm text-foreground bg-card focus:outline-none focus:border-primary"
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
        className="text-sm font-semibold text-primary bg-muted px-3 py-1.5 rounded-lg hover:bg-secondary transition"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function PersonChip({ user, onRemove }: { user: BillMember; onRemove: () => void }) {
  const initials = user.name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <button
      onClick={onRemove}
      className="flex flex-col items-center gap-1 shrink-0 group"
      title="Tap to remove"
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-base shadow-sm group-hover:opacity-80 transition"
        style={{ backgroundColor: user.color }}
      >
        {initials}
      </div>
      <span className="text-xs text-foreground max-w-[64px] truncate">{user.name}</span>
    </button>
  );
}

function LineRow({
  line,
  users,
  currency,
  onToggle,
  onDelete,
  onUpdate,
}: {
  line: BillLine;
  users: BillMember[];
  currency: string | null;
  onToggle: (billUserId: number) => void;
  onDelete: () => void;
  onUpdate: (patch: { description: string; quantity: number; total: number }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(line.description);
  const [qty, setQty] = useState(String(num(line.quantity) || 1));
  const [total, setTotal] = useState(String(num(line.total)));
  const assigned = new Set<number>(line.assignedUserIds ?? []);

  useEffect(() => {
    setDesc(line.description);
    setQty(String(num(line.quantity) || 1));
    setTotal(String(num(line.total)));
  }, [line.id, line.description, line.quantity, line.total]);

  const save = () => {
    const q = parseFloat(qty) || 1;
    const t = parseFloat(total) || 0;
    if (
      desc.trim() !== line.description ||
      q !== num(line.quantity) ||
      t !== num(line.total)
    ) {
      onUpdate({ description: desc.trim() || line.description, quantity: q, total: t });
    }
    setEditing(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-start gap-2">
        {editing ? (
          <div className="flex-1 space-y-2">
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="numeric"
                placeholder="Qty"
                className="w-16 border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
              <input
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                inputMode="decimal"
                placeholder="Total"
                className="flex-1 border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
              <button
                onClick={save}
                className="px-3 py-1.5 text-sm font-semibold bg-primary text-primary-foreground rounded-md"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex-1 text-left"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-foreground">{line.description}</span>
              <span className="font-semibold text-foreground tabular-nums">
                {formatMoney(num(line.total), currency)}
              </span>
            </div>
            {num(line.quantity) > 1 && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {num(line.quantity)} × {formatMoney(num(line.unitPrice), currency)}
              </div>
            )}
          </button>
        )}
        {!editing && (
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive p-1 -m-1 text-sm"
            title="Delete"
            aria-label="Delete item"
          >
            ✕
          </button>
        )}
      </div>

      {users.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {users.map((u) => {
            const on = assigned.has(u.id);
            return (
              <button
                key={u.id}
                onClick={() => onToggle(u.id)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition"
                style={{
                  backgroundColor: on ? u.color : "transparent",
                  borderColor: u.color,
                  color: on ? "#fff" : u.color,
                }}
              >
                <span>{u.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PersonTotalRow({
  person,
  currency,
}: {
  person: PersonTotal;
  currency: string | null;
}) {
  const initials = person.name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const fmt = (n: number) => formatMoney(n, currency);
  return (
    <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
        style={{ backgroundColor: person.color }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-foreground truncate">{person.name}</span>
          <span className="text-base font-bold text-primary tabular-nums">
            {fmt(person.total)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
          {fmt(person.subtotal)} items
          {person.taxShare > 0 && <> · {fmt(person.taxShare)} tax</>}
          {person.tipAmount > 0 && (
            <> · {fmt(person.tipAmount)} tip{person.tipIsCustom ? " (custom)" : ""}</>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

function PercentRow({
  label,
  percent,
  amount,
  currency,
  onChange,
}: {
  label: string;
  percent: number;
  amount: number;
  currency: string | null;
  onChange: (value: number) => void;
}) {
  const [val, setVal] = useState(String(percent));
  useEffect(() => setVal(String(percent)), [percent]);
  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <span>{label}</span>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            const n = parseFloat(val);
            if (!isNaN(n) && n !== percent) onChange(n);
            else setVal(String(percent));
          }}
          inputMode="decimal"
          className="w-12 text-center border border-border rounded px-1 py-0.5 text-sm focus:outline-none focus:border-primary"
        />
        <span>%</span>
      </div>
      <span className="text-sm font-semibold text-foreground tabular-nums">
        {formatMoney(amount, currency)}
      </span>
    </div>
  );
}

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
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        onClick={onCancel}
        className="flex-1 border-2 border-border rounded-lg py-2.5 text-sm font-medium text-muted-foreground"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        className="flex-1 bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-semibold"
      >
        Add
      </button>
    </div>
  );
}
