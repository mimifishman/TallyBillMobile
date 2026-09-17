import React, { useEffect, useMemo, useState } from "react";
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
 * Enter a discount rate and choose which items it comes off.
 *
 * A receipt's discount almost never covers the whole bill. On the fixtures this
 * was built against, one restaurant took 20% off five of seven lines, and
 * another gave happy hour on the food while the drinks paid full price — so
 * picking items is the main job here, not an advanced option.
 *
 * The rate at the top is the default for anything ticked. A line can then be
 * given its own rate, which is what "20% off, but drinks are 50%" needs. Every
 * rate is measured against the undiscounted price, so changing the default
 * never compounds onto a discount already taken.
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
  /** Per-line rate. A line missing from this map is not discounted. */
  const [rates, setRates] = useState<Map<number, number>>(new Map());
  /** Which line is having its own rate typed, if any. */
  const [overriding, setOverriding] = useState<number | null>(null);
  const [overrideDraft, setOverrideDraft] = useState("");

  useEffect(() => {
    if (!visible) return;
    // Open showing what the bill already has: anything discounted stays ticked
    // at its own rate, so opening the sheet to check something cannot quietly
    // change it.
    const existing = new Map<number, number>();
    for (const line of lines) {
      if (line.originalTotal != null && line.originalTotal > line.total) {
        const base = baseTotalOf(line);
        if (base > 0) existing.set(line.id, Math.round(((base - line.total) / base) * 1000) / 10);
      }
    }
    setRates(existing);
    const opening = existing.size > 0
      ? [...existing.values()][0]!
      : defaultPercent > 0 ? defaultPercent : 20;
    setRateDraft(String(Math.round(opening * 100) / 100));
    setOverriding(null);
    setOverrideDraft("");
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

  const allOn = lines.length > 0 && rates.size === lines.length;

  const toggle = (id: number) => {
    setRates((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, rate > 0 ? rate : 20);
      return next;
    });
  };

  const toggleAll = () => {
    setRates((prev) => {
      if (prev.size === lines.length) return new Map();
      const next = new Map<number, number>();
      for (const line of lines) next.set(line.id, rate > 0 ? rate : 20);
      return next;
    });
  };

  /** Retyping the top rate moves every line that is still on the old default. */
  const handleRateChange = (text: string) => {
    const previous = parsePercent(rateDraft);
    setRateDraft(text);
    const next = parsePercent(text);
    setRates((prev) => {
      const updated = new Map(prev);
      for (const [id, value] of prev) if (value === previous) updated.set(id, next);
      return updated;
    });
  };

  const commitOverride = () => {
    if (overriding === null) return;
    const value = parsePercent(overrideDraft);
    setRates((prev) => {
      const next = new Map(prev);
      if (value > 0) next.set(overriding, value);
      else next.delete(overriding);
      return next;
    });
    setOverriding(null);
    setOverrideDraft("");
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

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Discount">
      <View style={styles.rateRow}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Discount</Text>
        <View style={[styles.rateBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <TextInput
            value={rateDraft}
            onChangeText={handleRateChange}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={[styles.rateInput, { color: colors.foreground }]}
            accessibilityLabel="Discount percent"
          />
          <Text style={[styles.rateSuffix, { color: colors.mutedForeground }]}>%</Text>
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Applies to</Text>
        <TouchableOpacity onPress={toggleAll} accessibilityRole="button">
          <Text style={[styles.selectAll, { color: colors.primaryText }]}>
            {allOn ? "Clear all" : "Select all"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {lines.map((line) => {
          const linePercent = rates.get(line.id);
          const on = linePercent !== undefined;
          const base = baseTotalOf(line);
          const result = applyPercent(line, linePercent ?? 0);
          const isOverridden = on && linePercent !== rate;
          return (
            <View key={line.id} style={[styles.item, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => toggle(line.id)}
                style={styles.itemMain}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={line.description}
              >
                <View
                  style={[
                    styles.check,
                    { borderColor: on ? colors.primaryText : colors.border, backgroundColor: on ? colors.primaryText : "transparent" },
                  ]}
                >
                  {on ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
                <Text numberOfLines={1} style={[styles.itemName, { color: colors.foreground }]}>
                  {line.description}
                </Text>
              </TouchableOpacity>

              <View style={styles.itemRight}>
                {on ? (
                  overriding === line.id ? (
                    <View style={[styles.overrideBox, { borderColor: colors.primaryText, backgroundColor: colors.card }]}>
                      <TextInput
                        value={overrideDraft}
                        onChangeText={setOverrideDraft}
                        onBlur={commitOverride}
                        onSubmitEditing={commitOverride}
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
                        setOverriding(line.id);
                        setOverrideDraft(String(linePercent ?? rate));
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Change discount for ${line.description}, currently ${linePercent}%`}
                    >
                      <Text
                        style={[
                          styles.chip,
                          {
                            color: isOverridden ? colors.primaryText : colors.mutedForeground,
                            borderColor: isOverridden ? colors.primaryText : colors.border,
                          },
                        ]}
                      >
                        {Math.round((linePercent ?? 0) * 100) / 100}%
                      </Text>
                    </TouchableOpacity>
                  )
                ) : null}
                <View style={styles.prices}>
                  {on ? (
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
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
          {rates.size === 0 ? "No discount" : `Off ${rates.size} of ${lines.length}`}
        </Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>
          −{formatMoney(preview.off, currency)}
        </Text>
      </View>

      <PressableScale onPress={handleSave} style={[styles.save, { backgroundColor: colors.primary }]}>
        <Text style={[styles.saveText, { color: colors.primaryForeground }]}>
          {rates.size === 0 ? "Remove discount" : `Apply · ${formatMoney(preview.after, currency)}`}
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
  list: { maxHeight: 320 },
  item: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  itemMain: { flexDirection: "row", alignItems: "center", flex: 1, gap: SPACING.md },
  check: { width: 22, height: 22, borderRadius: RADIUS.sm, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkMark: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  itemName: { flex: 1, fontSize: FONT_SIZE.body, fontFamily: "Inter_400Regular" },
  itemRight: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  chip: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold", borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  overrideBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, width: 72 },
  overrideInput: { flex: 1, paddingVertical: 2, fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  prices: { alignItems: "flex-end", minWidth: 92 },
  was: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular", textDecorationLine: "line-through" },
  now: { fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold" },
  summary: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: SPACING.md, marginTop: SPACING.sm, borderTopWidth: StyleSheet.hairlineWidth },
  summaryLabel: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: FONT_SIZE.title, fontFamily: "Inter_600SemiBold" },
  save: { marginTop: SPACING.lg, borderRadius: RADIUS.lg, paddingVertical: SPACING.md, alignItems: "center" },
  saveText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold" },
});
