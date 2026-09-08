import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { formatMoney, getCurrencySymbol } from "@/utils/currency";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import type { MoneyMode } from "@/utils/taxTip";

/**
 * One "tax" or "tip" row: a percent-or-amount choice, a number, and what that
 * comes to.
 *
 * Both options stay on screen. A receipt prints tax as a sum far more often
 * than as a rate, so neither is the obvious default, and a switch that only
 * shows the mode you are not in reads as decoration rather than a choice.
 *
 * The options are labelled "%" and "Amount" rather than "%" and a currency
 * symbol: the symbol is blank on a bill with no currency set, and stale while
 * the currency is being edited. The symbol belongs in the field, where it
 * describes what is being typed.
 */
export function TaxTipField({
  label,
  mode,
  onModeChange,
  value,
  onValueChange,
  computed,
  currency,
  canUseAmount = true,
}: {
  label: string;
  mode: MoneyMode;
  onModeChange: (mode: MoneyMode) => void;
  value: string;
  onValueChange: (value: string) => void;
  computed: number;
  currency: string | null | undefined;
  /** False before there are any items — nothing to divide an amount by. */
  canUseAmount?: boolean;
}) {
  const colors = useColors();
  const symbol = getCurrencySymbol(currency);
  return (
    <View style={styles.field}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
        {canUseAmount && (
          <View style={[styles.modeSwitch, { borderColor: colors.border }]}>
            {(["percent", "amount"] as const).map((option) => {
              const selected = mode === option;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => onModeChange(option)}
                  hitSlop={{ top: 10, bottom: 10, left: 2, right: 2 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={
                    option === "percent"
                      ? `Enter the ${label.toLowerCase()} as a percent`
                      : `Enter the ${label.toLowerCase()} as an amount`
                  }
                  style={[styles.modeOption, selected && { backgroundColor: colors.primary }]}
                >
                  <Text
                    style={[
                      styles.modeOptionText,
                      { color: selected ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {option === "percent" ? "%" : "Amount"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
          ]}
          placeholder={mode === "percent" ? "0" : `${symbol}0.00`}
          placeholderTextColor={colors.mutedForeground}
          value={value}
          onChangeText={onValueChange}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
        />
        <Text style={[styles.computed, { color: colors.foreground }]}>
          {formatMoney(computed, currency)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: SPACING.xs },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold", letterSpacing: 1.0 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_400Regular",
  },
  computed: { fontSize: FONT_SIZE.body, fontFamily: "Inter_500Medium", minWidth: 88, textAlign: "right" },
  modeSwitch: { flexDirection: "row", borderWidth: 1, borderRadius: RADIUS.sm, overflow: "hidden" },
  modeOption: { paddingHorizontal: 12, paddingVertical: 5, alignItems: "center", justifyContent: "center" },
  modeOptionText: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold" },
});
