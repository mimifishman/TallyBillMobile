import React, { useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { PressableScale } from "@/components/PressableScale";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { useColors } from "@/hooks/useColors";
import { formatMoney } from "@/utils/currency";
import { applyPercent, baseTotalOf, parsePercent, type DiscountableLine } from "@/utils/discount";

export interface DiscountLineInput extends DiscountableLine {
  description: string;
}

/** What one line should become once the sheet is saved. */
export interface DiscountResult {
  id: number;
  originalTotal: number | null;
  discountAmount: number;
  total: number;
  discountLabel: string | null;
}

/**
 * Enter discounts and choose which items each one comes off.
 *
 * A receipt discount rarely covers the whole bill. On the fixtures this was
 * built against, one restaurant took 20% off five of seven lines, and another
 * gave happy hour to the food while the drinks paid full price. So choosing
 * items is the main job here, not an advanced option.
 *
 * It works in rounds: tick some items, set a rate, apply. Then tick a different
 * set, set a different rate, apply again. That is what "30% off food, 20% off
 * drinks" is — two rounds — and it is why the rate at the top does not reach
 * back and change items that were already given one.
 *
 * An item holds exactly ONE rate. Applying a rate to an item that already had
 * one replaces it rather than adding to it, which makes stacking impossible by
 * construction — there is no order-of-application question to answer, and no
 * way to double-discount someone's dish. This is where other systems come
 * unstuck: Shopify POS allows a single cart discount and no stacking at all,
 * and Square users report that ringing up two groups and tapping two discount
 * buttons does the wrong thing. Toast arrives at the same place from the other
 * side, with an "applies to everything except" list.
 *
 * Every rate is measured against the undiscounted price, so re-applying never
 * compounds onto a discount already taken.
 */
export function DiscountSheet({
  visible,
  lines,
  defaultPercent,
  currency,
  onSave,
  onClose,
}: {
  visible: boolean;
  lines: DiscountLineInput[];
  /** The bill's remembered rate, offered for anything newly ticked. */
  defaultPercent: number;
  currency: string | null | undefined;
  onSave: (results: DiscountResult[], newDefaultPercent: number) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [rateDraft, setRateDraft] = useState("");
  /** The rate applied to each item. An item missing here has no discount. */
  const [rates, setRates] = useState<Map<number, number>>(new Map());
  /** Ticked for the NEXT round. Separate from which items already have a rate. */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  /** Which item is having its own rate typed, if any. */
  const [editing, setEditing] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  /** Whether the bill already had a discount when this was opened. */
  const [hadDiscountOnOpen, setHadDiscountOnOpen] = useState(false);

  /**
   * Seeded once per opening, not whenever `lines` changes.
   *
   * The parent rebuilds that array on every render, so it is a new object every
   * time. Depending on it meant this effect re-ran mid-edit and reset the rates
   * to whatever was already saved — typing in the rate box was enough to wipe a
   * discount just applied.
   */
  const seededFor = useRef(false);
  useEffect(() => {
    if (!visible) {
      seededFor.current = false;
      return;
    }
    if (seededFor.current) return;
    seededFor.current = true;
    // Open showing what the bill already has, so opening the sheet to check
    // something cannot quietly change it.
    const existing = new Map<number, number>();
    for (const line of lines) {
      if (line.originalTotal != null && line.originalTotal > line.total) {
        const base = baseTotalOf(line);
        if (base > 0) existing.set(line.id, Math.round(((base - line.total) / base) * 1000) / 10);
      }
    }
    setRates(existing);
    setHadDiscountOnOpen(existing.size > 0);
    setSelected(new Set());
    setRateDraft(String(defaultPercent > 0 ? Math.round(defaultPercent * 100) / 100 : 20));
    setEditing(null);
    setEditDraft("");
  }, [visible, lines, defaultPercent]);

  const rate = parsePercent(rateDraft);

  const preview = useMemo(() => {
    let off = 0;
    let after = 0;
    for (const line of lines) {
      const linePercent = rates.get(line.id) ?? 0;
      const result = applyPercent(line, linePercent);
      off += result.discountAmount;
      after += result.total;
    }
    return { off: Math.round(off * 100) / 100, after: Math.round(after * 100) / 100 };
  }, [lines, rates]);

  const allSelected = lines.length > 0 && selected.size === lines.length;

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === lines.length ? new Set() : new Set(lines.map((l) => l.id))));
  };

  /**
   * Stamps the rate onto the ticked items and clears the ticks, ready for the
   * next round. An item that already had a rate takes the new one instead —
   * never both.
   */
  const applyToSelected = () => {
    if (rate <= 0 || selected.size === 0) return;
    setRates((prev) => {
      const next = new Map(prev);
      for (const id of selected) next.set(id, rate);
      return next;
    });
    setSelected(new Set());
    closeEdit();
  };

  /** Puts an item back to full price. */
  const clearOne = (id: number) => {
    setRates((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const clearAll = () => {
    setRates(new Map());
    setSelected(new Set());
  };

  /**
   * Applies what is typed as it is typed, for the one item being edited.
   *
   * There is no commit step because a commit step can be missed: tapping
   * another row does not reliably blur a text field, so a rate could be typed,
   * left on screen, and never take effect. Applying live means what is shown is
   * always what is in force.
   */
  const editRate = (id: number, text: string) => {
    const value = parsePercent(text);
    // Over 100 the field snaps to 100 rather than keeping what was typed. A box
    // reading "5050" beside a row reading 100% leaves the two disagreeing, and
    // the one that counts is not the one being looked at.
    const raw = Number(text.replace(",", "."));
    setEditDraft(Number.isFinite(raw) && raw > 100 ? "100" : text);
    setRates((prev) => {
      const next = new Map(prev);
      if (value > 0) next.set(id, value);
      else next.delete(id);
      return next;
    });
  };

  /** Closes the field. Whatever was typed has already been applied. */
  const closeEdit = () => {
    setEditing(null);
    setEditDraft("");
  };

  const handleSave = () => {
    onSave(
      lines.map((line) => {
        const { id, originalTotal, discountAmount, total, discountLabel } = applyPercent(line, rates.get(line.id) ?? 0);
        return { id, originalTotal, discountAmount, total, discountLabel };
      }),
      rate > 0 ? rate : defaultPercent,
    );
  };

  /** Rates in use, so the footer can say what was applied and to how many. */
  const groups = useMemo(() => {
    const byRate = new Map<number, number>();
    for (const value of rates.values()) byRate.set(value, (byRate.get(value) ?? 0) + 1);
    return [...byRate.entries()].sort((a, b) => b[0] - a[0]);
  }, [rates]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Discount">
      <View style={styles.rateRow}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Discount</Text>
        <View style={[styles.rateBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <TextInput
            value={rateDraft}
            onChangeText={setRateDraft}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={[styles.rateInput, { color: colors.foreground }]}
            accessibilityLabel="Discount percent"
          />
          <Text style={[styles.rateSuffix, { color: colors.mutedForeground }]}>%</Text>
        </View>
      </View>

      {/* Applying in rounds is what lets one bill hold several discounts: tick a
          group, set a rate, apply; then do it again for the next group. */}
      <PressableScale
        onPress={applyToSelected}
        disabled={rate <= 0 || selected.size === 0}
        style={[
          styles.apply,
          {
            backgroundColor: rate > 0 && selected.size > 0 ? colors.primary : colors.muted,
          },
        ]}
      >
        <Text
          style={[
            styles.applyText,
            { color: rate > 0 && selected.size > 0 ? colors.primaryForeground : colors.mutedForeground },
          ]}
        >
          {selected.size === 0
            ? "Tick the items this comes off"
            : `Take ${Math.round(rate * 100) / 100}% off ${selected.size} item${selected.size === 1 ? "" : "s"}`}
        </Text>
      </PressableScale>

      <View style={styles.listHeader}>
        <TouchableOpacity onPress={toggleAll} accessibilityRole="button">
          <Text style={[styles.selectAll, { color: colors.primaryText }]}>
            {allSelected ? "Untick all" : "Tick all"}
          </Text>
        </TouchableOpacity>
        {rates.size > 0 ? (
          <TouchableOpacity onPress={clearAll} accessibilityRole="button">
            <Text style={[styles.selectAll, { color: colors.mutedForeground }]}>Clear discounts</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {lines.map((line) => {
          const linePercent = rates.get(line.id);
          const ticked = selected.has(line.id);
          const base = baseTotalOf(line);
          const result = applyPercent(line, linePercent ?? 0);
          return (
            <View key={line.id} style={[styles.item, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => toggle(line.id)}
                style={styles.itemMain}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ticked }}
                accessibilityLabel={line.description}
              >
                <View
                  style={[
                    styles.check,
                    { borderColor: ticked ? colors.primaryText : colors.border, backgroundColor: ticked ? colors.primaryText : "transparent" },
                  ]}
                >
                  {ticked ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
                <Text numberOfLines={1} style={[styles.itemName, { color: colors.foreground }]}>
                  {line.description}
                </Text>
              </TouchableOpacity>

              <View style={styles.itemRight}>
                {/* Always shown, reading 0% when nothing is off. An empty
                    space says nothing can be done here; a chip that looks like
                    a control invites the tap that changes just this item. */}
                {editing === line.id ? (
                  <View style={[styles.overrideBox, { borderColor: colors.primaryText, backgroundColor: colors.card }]}>
                    <TextInput
                      value={editDraft}
                      onChangeText={(text) => editRate(line.id, text)}
                      onBlur={closeEdit}
                      onSubmitEditing={closeEdit}
                      keyboardType="decimal-pad"
                      autoFocus
                      selectTextOnFocus
                      style={[styles.overrideInput, { color: colors.foreground }]}
                      accessibilityLabel={`Discount percent for ${line.description}`}
                    />
                    <Text style={[styles.rateSuffix, { color: colors.mutedForeground }]}>%</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      setEditing(line.id);
                      setEditDraft(linePercent === undefined ? "" : String(linePercent));
                    }}
                    onLongPress={linePercent === undefined ? undefined : () => clearOne(line.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      linePercent === undefined
                        ? `${line.description} has no discount. Tap to set one`
                        : `${line.description} has ${linePercent}% off. Tap to change, hold to remove`
                    }
                    style={[
                      styles.chip,
                      linePercent === undefined
                        ? { borderColor: colors.border, backgroundColor: colors.muted }
                        : { borderColor: colors.primaryText, backgroundColor: colors.primarySoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: linePercent === undefined ? colors.mutedForeground : colors.primaryText },
                      ]}
                    >
                      {linePercent === undefined ? 0 : Math.round(linePercent * 100) / 100}%
                    </Text>
                    <Feather
                      name="edit-2"
                      size={10}
                      color={linePercent === undefined ? colors.mutedForeground : colors.primaryText}
                    />
                  </TouchableOpacity>
                )}
                <View style={styles.prices}>
                  {linePercent !== undefined ? (
                    <Text style={[styles.was, { color: colors.mutedForeground }]}>{formatMoney(base, currency)}</Text>
                  ) : null}
                  <Text style={[styles.now, { color: colors.foreground }]}>{formatMoney(result.total, currency)}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.summary, { borderTopColor: colors.border }]}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
          {/* Capped, because the list grows with every round and the amount
              beside it must not be pushed off the screen — the figure is the
              part that matters. */}
          {groups.length === 0
            ? "No discount"
            : groups
                .slice(0, 2)
                .map(([percent, count]) => `${Math.round(percent * 100) / 100}% off ${count}`)
                .join("  ·  ") + (groups.length > 2 ? `  +${groups.length - 2} more` : "")}
        </Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>
          −{formatMoney(preview.off, currency)}
        </Text>
      </View>

      <PressableScale onPress={handleSave} style={[styles.save, { backgroundColor: colors.primary }]}>
        <Text style={[styles.saveText, { color: colors.primaryForeground }]}>
          {/* "Remove discount" only when there is one to remove. On a bill with
              none it read as an odd thing to offer as the main action. */}
          {rates.size === 0
            ? hadDiscountOnOpen ? "Remove discount" : "Done"
            : `Done · ${formatMoney(preview.after, currency)}`}
        </Text>
      </PressableScale>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  rateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.lg },
  label: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold" },
  rateBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, minWidth: 110 },
  rateInput: { flex: 1, paddingVertical: SPACING.md, fontSize: FONT_SIZE.title, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  rateSuffix: { fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold", marginLeft: SPACING.xs },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.sm },
  selectAll: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold" },
  apply: { borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: "center", marginBottom: SPACING.lg },
  applyText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold" },
  list: { maxHeight: 320 },
  item: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  itemMain: { flexDirection: "row", alignItems: "center", flex: 1, gap: SPACING.md },
  check: { width: 22, height: 22, borderRadius: RADIUS.sm, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkMark: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  itemName: { flex: 1, fontSize: FONT_SIZE.body, fontFamily: "Inter_400Regular" },
  itemRight: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 5 },
  chipText: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold" },
  overrideBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2, width: 76 },
  overrideInput: { flex: 1, paddingVertical: 2, fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  prices: { alignItems: "flex-end", minWidth: 92 },
  was: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular", textDecorationLine: "line-through" },
  now: { fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold" },
  summary: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: SPACING.md, marginTop: SPACING.sm, borderTopWidth: StyleSheet.hairlineWidth },
  summaryLabel: { flexShrink: 1, fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: FONT_SIZE.title, fontFamily: "Inter_600SemiBold", marginLeft: SPACING.sm },
  save: { marginTop: SPACING.lg, borderRadius: RADIUS.lg, paddingVertical: SPACING.md, alignItems: "center" },
  saveText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold" },
});
