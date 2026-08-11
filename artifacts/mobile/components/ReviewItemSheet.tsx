import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AutoFocusTextInput } from "@/components/AutoFocusTextInput";
import { BottomSheet } from "@/components/BottomSheet";
import { PressableScale } from "@/components/PressableScale";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { useColors } from "@/hooks/useColors";

export interface ReviewItemValues {
  name: string;
  quantity: number;
  total: number;
}

interface ReviewItemSheetProps {
  visible: boolean;
  mode: "add" | "edit";
  /** Prefilled values when editing; ignored in add mode. */
  initial: ReviewItemValues | null;
  onSave: (values: ReviewItemValues) => void;
  onClose: () => void;
}

/**
 * Unified editor for a scanned receipt item — name, quantity, and price in
 * one sheet. Also used by "Add item" to enter a new item in one step.
 */
export function ReviewItemSheet({ visible, mode, initial, onSave, onClose }: ReviewItemSheetProps) {
  const colors = useColors();

  const [name, setName] = useState("");
  const [quantityDraft, setQuantityDraft] = useState("1");
  const [priceDraft, setPriceDraft] = useState("");
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      if (mode === "edit" && initial) {
        setName(initial.name);
        setQuantityDraft(String(initial.quantity));
        setPriceDraft(initial.total.toFixed(2));
      } else {
        setName("");
        setQuantityDraft("1");
        setPriceDraft("");
      }
      setQuantityError(null);
      setPriceError(null);
    }
  }, [visible, mode, initial]);

  const canSave = name.trim().length > 0;

  const handleSave = () => {
    const trimmedQuantity = quantityDraft.trim();
    const quantity = /^\d+$/.test(trimmedQuantity) ? Number(trimmedQuantity) : NaN;
    // Empty price counts as 0 (matches the old blank "Add item" row default).
    const normalizedPrice = priceDraft.trim().replace(",", ".") || "0";
    const price = /^\d+(\.\d*)?$|^\.\d+$/.test(normalizedPrice) ? Number(normalizedPrice) : NaN;

    let hasError = false;
    if (!Number.isInteger(quantity) || quantity < 1) {
      setQuantityError("Whole number, 1 or more");
      hasError = true;
    }
    if (!Number.isFinite(price) || price < 0) {
      setPriceError("Enter an amount like 12.50");
      hasError = true;
    }
    if (hasError || !canSave) return;

    onSave({
      name: name.trim(),
      quantity,
      total: Math.round(price * 100) / 100,
    });
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={mode === "add" ? "Add Item" : "Edit Item"}>
      <View style={styles.content}>
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>NAME</Text>
          <AutoFocusTextInput
            style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
            placeholder="Item name"
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
            autoFocus={mode === "add"}
            returnKeyType="done"
          />
        </View>

        <View style={styles.fieldsRow}>
          <View style={[styles.fieldGroup, styles.flex]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>QUANTITY</Text>
            <AutoFocusTextInput
              style={[
                styles.input,
                {
                  borderColor: quantityError ? colors.destructive : colors.border,
                  color: colors.foreground,
                  backgroundColor: colors.muted,
                },
              ]}
              placeholder="1"
              placeholderTextColor={colors.mutedForeground}
              value={quantityDraft}
              onChangeText={(v) => {
                setQuantityDraft(v);
                setQuantityError(null);
              }}
              keyboardType="number-pad"
              returnKeyType="done"
              selectTextOnFocus
            />
            {quantityError ? (
              <Text style={[styles.errorText, { color: colors.destructive }]}>{quantityError}</Text>
            ) : null}
          </View>

          <View style={[styles.fieldGroup, styles.flex]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>PRICE</Text>
            <AutoFocusTextInput
              style={[
                styles.input,
                {
                  borderColor: priceError ? colors.destructive : colors.border,
                  color: colors.foreground,
                  backgroundColor: colors.muted,
                },
              ]}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              value={priceDraft}
              onChangeText={(v) => {
                setPriceDraft(v);
                setPriceError(null);
              }}
              keyboardType="decimal-pad"
              returnKeyType="done"
              selectTextOnFocus
            />
            {priceError ? (
              <Text style={[styles.errorText, { color: colors.destructive }]}>{priceError}</Text>
            ) : null}
          </View>
        </View>

        <PressableScale
          onPress={handleSave}
          disabled={!canSave}
          style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: canSave ? 1 : 0.6 }]}
        >
          <Text style={styles.primaryBtnText}>{mode === "add" ? "Add Item" : "Save"}</Text>
        </PressableScale>

        <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.cancelBtn}>
          <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: SPACING.lg },
  flex: { flex: 1 },
  fieldsRow: { flexDirection: "row", gap: SPACING.md },
  fieldGroup: { gap: 6 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.0,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_400Regular",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  primaryBtn: {
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.lg,
    alignItems: "center",
    marginTop: SPACING.xs,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  cancelBtn: { alignItems: "center", paddingVertical: SPACING.xs },
  cancelBtnText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_500Medium" },
});
