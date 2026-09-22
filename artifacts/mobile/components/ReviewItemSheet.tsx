import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AutoFocusTextInput } from "@/components/AutoFocusTextInput";
import { BottomSheet } from "@/components/BottomSheet";
import { PressableScale } from "@/components/PressableScale";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { useColors } from "@/hooks/useColors";

export interface ReviewItemValues {
  name: string;
  quantity: number;
  /** The full price, before any discount on this item. */
  total: number;
  /**
   * Money off this item. Zero when it is not discounted.
   *
   * Typed as a percentage but stored as money, because a receipt rounds its own
   * discounts its own way — "25% Happy Hour" prints as -14.00 on a 57.00 salad
   * where the arithmetic says 14.25. The amount is only recomputed when the
   * percentage is actually edited, so a figure read off a receipt keeps it.
   */
  discountAmount: number;
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
  /** The rate shown in the field. Money off is derived from it when it changes. */
  const [discountDraft, setDiscountDraft] = useState("");
  /** Untouched, the discount read off the receipt is kept to the agora. */
  const [discountEdited, setDiscountEdited] = useState(false);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      if (mode === "edit" && initial) {
        setName(initial.name);
        setQuantityDraft(String(initial.quantity));
        setPriceDraft(initial.total.toFixed(2));
        setDiscountDraft(
          initial.discountAmount > 0 && initial.total > 0
            ? String(Math.round((initial.discountAmount / initial.total) * 1000) / 10)
            : "",
        );
      } else {
        setName("");
        setQuantityDraft("1");
        setPriceDraft("");
        setDiscountDraft("");
      }
      setQuantityError(null);
      setPriceError(null);
      setDiscountError(null);
      setDiscountEdited(false);
    }
  }, [visible, mode, initial]);

  /** Money off, from the rate typed — or the original amount if it was not. */
  const discountMoney = (() => {
    const price = Number(priceDraft.trim().replace(",", "."));
    const percent = Number(discountDraft.trim().replace(",", ".") || "0");
    if (!Number.isFinite(price) || !Number.isFinite(percent) || percent <= 0) return 0;
    if (!discountEdited && initial && initial.discountAmount > 0) return initial.discountAmount;
    return Math.round(price * (percent / 100) * 100) / 100;
  })();

  /** What the item comes to once the discount is off, for showing back. */
  const charged = (() => {
    const price = Number(priceDraft.trim().replace(",", "."));
    if (!Number.isFinite(price) || discountMoney <= 0 || discountMoney > price) return null;
    return Math.round((price - discountMoney) * 100) / 100;
  })();

  const canSave = name.trim().length > 0;

  const handleSave = () => {
    const trimmedQuantity = quantityDraft.trim();
    const quantity = /^\d+$/.test(trimmedQuantity) ? Number(trimmedQuantity) : NaN;
    // Empty price counts as 0 (matches the old blank "Add item" row default).
    const normalizedPrice = priceDraft.trim().replace(",", ".") || "0";
    const price = /^\d+(\.\d*)?$|^\.\d+$/.test(normalizedPrice) ? Number(normalizedPrice) : NaN;

    // An empty discount is no discount.
    const normalizedDiscount = discountDraft.trim().replace(",", ".") || "0";
    const percent = /^\d+(\.\d*)?$|^\.\d+$/.test(normalizedDiscount) ? Number(normalizedDiscount) : NaN;
    const discount = Number.isFinite(percent) ? discountMoney : NaN;

    let hasError = false;
    if (!Number.isInteger(quantity) || quantity < 1) {
      setQuantityError("Whole number, 1 or more");
      hasError = true;
    }
    if (!Number.isFinite(price) || price < 0) {
      setPriceError("Enter an amount like 12.50");
      hasError = true;
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setDiscountError("A number from 0 to 100");
      hasError = true;
    } else if (discount > price) {
      // Taking off more than the item costs would leave a negative line, which
      // nothing downstream — the split, the tax, the tip — can do anything with.
      setDiscountError("More than the price");
      hasError = true;
    }
    if (hasError || !canSave) return;

    onSave({
      name: name.trim(),
      quantity,
      total: Math.round(price * 100) / 100,
      discountAmount: Math.round(discount * 100) / 100,
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

        {/* Always offered, so a discount can be corrected or added by hand and
            is never lost by editing the item it belongs to. */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DISCOUNT</Text>
          <View style={styles.percentWrap}>
          <TextInput
            style={[
              styles.input,
              styles.flex,
              {
                borderColor: discountError ? colors.destructive : colors.border,
                color: colors.foreground,
                backgroundColor: colors.muted,
              },
            ]}
            placeholder="0"
            placeholderTextColor={colors.mutedForeground}
            value={discountDraft}
            onChangeText={(v) => {
              setDiscountDraft(v);
              setDiscountEdited(true);
              setDiscountError(null);
            }}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
          />
          <Text style={[styles.percentSign, { color: colors.mutedForeground }]}>%</Text>
          </View>
          {discountError ? (
            <Text style={[styles.errorText, { color: colors.destructive }]}>{discountError}</Text>
          ) : charged !== null ? (
            <Text style={[styles.chargedHint, { color: colors.mutedForeground }]}>
              You pay {charged.toFixed(2)}
            </Text>
          ) : null}
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
  percentWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  percentSign: { fontSize: FONT_SIZE.title, fontFamily: "Inter_600SemiBold" },
  chargedHint: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular", marginTop: SPACING.xs },
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
