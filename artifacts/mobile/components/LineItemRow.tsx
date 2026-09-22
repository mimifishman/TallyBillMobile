import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { AutoFocusTextInput } from "./AutoFocusTextInput";
import { getCurrencySymbol } from "@/utils/currency";
import { PersonBadge } from "./PersonBadge";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";

interface BillMember {
  id: number;
  name: string;
  color: string;
}

interface AnimatedPersonBadgeProps {
  user: BillMember;
  isSelected: boolean;
  onPress: () => void;
}

function AnimatedPersonBadge({ user, isSelected, onPress }: AnimatedPersonBadgeProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPressIn={() => {
        scale.value = withSequence(
          withSpring(1.15, { stiffness: 500, damping: 10 }),
          withSpring(1, { stiffness: 300, damping: 18 }),
        );
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPress={onPress}
    >
      <Animated.View style={animStyle}>
        <PersonBadge name={user.name} color={user.color} size="sm" selected={isSelected} />
      </Animated.View>
    </Pressable>
  );
}

interface LineItemRowProps {
  id: number;
  description: string;
  originalDescription?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  /** Price before this line's discount. Null when it was not discounted. */
  originalTotal?: number | null;
  assignedUserIds: number[];
  billUsers: BillMember[];
  currency?: string | null;
  onToggleUser: (lineId: number, billUserId: number) => void;
  onBulkToggleUsers: (lineId: number, billUserIds: number[]) => void;
  onDelete: (lineId: number) => void;
  onUpdate: (lineId: number, data: {
    description: string;
    quantity: number;
    /** The full price, before any discount on this line. */
    total: number;
    /** Money off this line. Zero clears the discount. */
    discountAmount: number;
  }) => void;
  onSplit: (lineId: number) => void;
}

export function LineItemRow({
  id,
  description,
  originalDescription,
  quantity,
  unitPrice,
  total,
  originalTotal,
  assignedUserIds,
  billUsers,
  currency,
  onToggleUser,
  onBulkToggleUsers,
  onDelete,
  onUpdate,
  onSplit,
}: LineItemRowProps) {
  const colors = useColors();
  const currencySymbol = getCurrencySymbol(currency);
  const [editing, setEditing] = useState(false);
  const [editDesc, setEditDesc] = useState(description);
  const isDiscounted = originalTotal != null && Number(originalTotal) > Number(total);
  /**
   * What to say about the discount: always the rate, worked out from the two
   * prices.
   *
   * Deliberately not the stored label. A label can go stale when a price is
   * edited, can be lost by a write that forgets it, and differs between items
   * depending on where the discount came from — a bill showing "20% off" on one
   * line and "Discount on the receipt" on the next reads as two different
   * things when it is one. The rate is derived, so it is always right and
   * always the same shape, and it is the thing someone can check against the
   * paper in their hand.
   */
  const discountNote = isDiscounted
    ? `${Math.round(((Number(originalTotal) - Number(total)) / Number(originalTotal)) * 1000) / 10}% off`
    : null;
  // Edited as the FULL price plus what comes off it, so a discount survives an
  // edit rather than being silently dropped by it.
  const [editTotal, setEditTotal] = useState(String(isDiscounted ? originalTotal : total));
  const [editQty, setEditQty] = useState(String(quantity));
  const [editDiscount, setEditDiscount] = useState(
    isDiscounted && Number(originalTotal) > 0
      ? String(Math.round(((Number(originalTotal) - Number(total)) / Number(originalTotal)) * 1000) / 10)
      : "",
  );
  /** Untouched, the amount read off the receipt is kept to the agora. */
  const [discountEdited, setDiscountEdited] = useState(false);
  const [priceEdited, setPriceEdited] = useState(false);

  /**
   * The latest typed values, mirrored into refs.
   *
   * A save reads these rather than the state its render closed over. Tapping
   * Save in the same breath as the last keystroke could otherwise commit the
   * value from before that keystroke — on money, for a saving, that is not a
   * risk worth carrying for the sake of one line.
   */
  const draftRef = useRef({ desc: description, qty: String(quantity), total: "", discount: "" });
  draftRef.current = { desc: editDesc, qty: editQty, total: editTotal, discount: editDiscount };

  const isFullyAssigned = billUsers.length > 0 && billUsers.every((u) => assignedUserIds.includes(u.id));
  const hasAnyAssigned = assignedUserIds.length > 0;

  const handleEdit = () => {
    setEditDesc(description);
    setEditTotal(String(isDiscounted ? originalTotal : total));
    setEditQty(String(quantity));
    setEditDiscount(
      isDiscounted && Number(originalTotal) > 0
        ? String(Math.round(((Number(originalTotal) - Number(total)) / Number(originalTotal)) * 1000) / 10)
        : "",
    );
    setDiscountEdited(false);
    setPriceEdited(false);
    setEditing(true);
  };

  const handleSave = () => {
    // A rate outside 0-100 is refused rather than quietly capped. Capping it
    // turned a mistyped 150 into a free item and showed "100% off" — a figure
    // nobody entered — leaving the bill short with nothing on screen to say so.
    if (discountPercentError) return;

    const draft = draftRef.current;
    const newTotal = parseFloat(draft.total) || 0;
    const newQty = Math.max(1, parseInt(draft.qty) || 1);
    const percent = parseFloat(draft.discount) || 0;
    // Recomputed here from the latest draft rather than taken from the render,
    // for the same reason the drafts are held in a ref.
    const money = percent > 0 && newTotal > 0
      ? (!discountEdited && !priceEdited && isDiscounted
          ? Math.round((Number(originalTotal) - Number(total)) * 100) / 100
          : Math.round(newTotal * (percent / 100) * 100) / 100)
      : 0;
    const newDiscount = Math.max(0, Math.min(money, newTotal));
    onUpdate(id, { description: draft.desc, quantity: newQty, total: newTotal, discountAmount: newDiscount });
    setEditing(false);
  };

  /** Set while the typed rate is not a discount anything could mean. */
  const discountPercentError = (() => {
    const raw = editDiscount.trim();
    if (raw === "") return null;
    const percent = Number(raw.replace(",", "."));
    if (!Number.isFinite(percent) || percent < 0) return "0 to 100";
    if (percent > 100) return "0 to 100";
    return null;
  })();

  /**
   * Money off, worked out from the rate typed. Left exactly as it was when the
   * rate has not been touched, so a discount read off a receipt keeps the
   * amount the receipt printed rather than drifting by a rounding.
   */
  const editDiscountMoney = (() => {
    const price = parseFloat(editTotal) || 0;
    const percent = parseFloat(editDiscount) || 0;
    if (percent <= 0 || price <= 0) return 0;
    // The stored amount is kept only while nothing it depends on has moved. Once
    // the price changes, the rate is what the person meant — someone who sets
    // 20% and then corrects 124.00 to 155.00 expects 20% of the new price, not
    // the old money. Untouched, a discount read off a receipt keeps the exact
    // figure the receipt printed.
    if (!discountEdited && !priceEdited && isDiscounted) {
      return Math.round((Number(originalTotal) - Number(total)) * 100) / 100;
    }
    return Math.round(price * (percent / 100) * 100) / 100;
  })();

  const editCharged = (() => {
    const price = parseFloat(editTotal) || 0;
    if (editDiscountMoney <= 0 || editDiscountMoney > price) return null;
    return Math.round((price - editDiscountMoney) * 100) / 100;
  })();

  const handleDelete = () => {
    Alert.alert("Remove item?", `"${description}" will be removed from the bill.`, [
      { text: "Actually, keep it", style: "cancel" },
      { text: "Yeah, remove", style: "destructive", onPress: () => onDelete(id) },
    ]);
  };

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16).mass(0.6)}
      style={[
        styles.container,
        { borderColor: colors.border },
        hasAnyAssigned && { backgroundColor: colors.primarySoft },
      ]}
    >
      {isFullyAssigned && (
        <View style={[styles.fullyAssignedBadge, { backgroundColor: colors.success }]}>
          <Feather name="check" size={10} color="#fff" />
        </View>
      )}

      {editing ? (
        <View style={styles.editBlock}>
          <View style={styles.editRow}>
            <AutoFocusTextInput
              style={[styles.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder="Item name"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
            />
          </View>
          <View style={styles.editRow}>
            <View style={styles.editQtyWrap}>
              <Text style={[styles.editQtyLabel, { color: colors.mutedForeground }]}>Qty</Text>
              <TextInput
                style={[styles.editInputQty, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={editQty}
                onChangeText={setEditQty}
                keyboardType="number-pad"
                selectTextOnFocus
                placeholder="1"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <TextInput
              style={[styles.editInputSmall, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={editTotal}
              onChangeText={(v) => { setEditTotal(v); setPriceEdited(true); }}
              keyboardType="numeric"
              selectTextOnFocus
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
            />

            {quantity > 1 && (
              <TouchableOpacity onPress={() => onSplit(id)} style={[styles.splitBtn, { borderColor: colors.primaryText }]} accessibilityLabel="Split item quantity">
                <Feather name="scissors" size={13} color={colors.primaryText} />
              </TouchableOpacity>
            )}
            {/* Dimmed and inert while the rate is out of range, so the button
                does not look like it works and then do nothing. */}
            <TouchableOpacity
              onPress={handleSave}
              disabled={discountPercentError !== null}
              style={[
                styles.saveBtn,
                { backgroundColor: colors.primary, opacity: discountPercentError ? 0.5 : 1 },
              ]}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
          {/* On its own row rather than crowded in beside the price: a person
              paying wants the price fixed in one tap, and a discount is the
              rarer job. Typed as a percentage because that is what a receipt
              says and what a person can check in their head. */}
          <View style={styles.editRow}>
            <Text style={[styles.editQtyLabel, { color: colors.mutedForeground }]}>Discount</Text>
            <TextInput
              style={[
                styles.editInputQty,
                {
                  color: colors.foreground,
                  borderColor: discountPercentError ? colors.destructive : colors.border,
                  backgroundColor: colors.card,
                },
              ]}
              value={editDiscount}
              onChangeText={(v) => { setEditDiscount(v); setDiscountEdited(true); }}
              keyboardType="decimal-pad"
              selectTextOnFocus
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel={`Discount percent on ${description}`}
            />
            <Text style={[styles.editQtyLabel, { color: colors.mutedForeground }]}>%</Text>
            {discountPercentError ? (
              <Text style={[styles.editCharged, { color: colors.destructive }]} numberOfLines={1}>
                {discountPercentError}
              </Text>
            ) : editCharged !== null ? (
              <Text style={[styles.editCharged, { color: colors.primaryText }]} numberOfLines={1}>
                you pay {editCharged.toFixed(2)}
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.mainRow}>
          <View style={styles.desc}>
            <View style={styles.nameRow}>
              <View style={[styles.qtyBadge, { backgroundColor: colors.muted }]}>
                <Text style={[styles.qtyBadgeText, { color: colors.mutedForeground }]}>×{quantity}</Text>
              </View>
              <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={2}>
                {description}
              </Text>
            </View>
            {!!originalDescription && (
              <Text style={[styles.originalDescription, { color: colors.mutedForeground }]} numberOfLines={1}>
                {originalDescription}
              </Text>
            )}
            <Text style={[styles.itemTotal, { color: colors.mutedForeground }]}>
              {/* The old price stays beside the new one, struck through: a
                  number that dropped without saying why reads as a mistake. */}
              {isDiscounted ? (
                <Text style={[styles.wasPrice, { color: colors.mutedForeground }]}>
                  {currencySymbol ? `${currencySymbol} ` : ""}{Number(originalTotal).toFixed(2)}{" "}
                </Text>
              ) : null}
              {currencySymbol ? `${currencySymbol} ` : ""}{Number(total).toFixed(2)}
              {quantity > 1 ? (
                <Text style={[styles.unitPrice, { color: colors.mutedForeground }]}>
                  {" "}({currencySymbol ? `${currencySymbol} ` : ""}{Number(unitPrice).toFixed(2)} each)
                </Text>
              ) : null}
            </Text>
            {discountNote ? (
              <Text style={[styles.discountLabel, { color: colors.primaryText }]} numberOfLines={1}>
                {discountNote}
              </Text>
            ) : null}
          </View>
          {quantity > 1 && (
            <TouchableOpacity onPress={() => onSplit(id)} style={[styles.splitBtn, { borderColor: colors.primaryText }]} accessibilityLabel="Split item quantity">
              <Feather name="scissors" size={13} color={colors.primaryText} />
              <Text style={[styles.splitBtnText, { color: colors.primaryText }]}>Split</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleEdit} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={`Edit ${description}`}>
            <Feather name="edit-2" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={`Delete ${description}`}>
            <Feather name="trash-2" size={15} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      )}

      {billUsers.length > 0 && (
        <View style={styles.peopleRow}>
          {billUsers.map((user) => (
            <AnimatedPersonBadge
              key={user.id}
              user={user}
              isSelected={assignedUserIds.includes(user.id)}
              onPress={() => onToggleUser(id, user.id)}
            />
          ))}
          {(() => {
            const allSelected = billUsers.every((u) => assignedUserIds.includes(u.id));
            const idsToToggle = allSelected
              ? billUsers.filter((u) => assignedUserIds.includes(u.id)).map((u) => u.id)
              : billUsers.filter((u) => !assignedUserIds.includes(u.id)).map((u) => u.id);
            return (
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onBulkToggleUsers(id, idsToToggle); }}
                style={[styles.bulkBtn, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={allSelected ? "Deselect all people" : "Select all people"}
              >
                <Text style={[styles.bulkBtnText, { color: colors.mutedForeground }]}>
                  {allSelected ? "Deselect all" : "Select all"}
                </Text>
              </TouchableOpacity>
            );
          })()}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    gap: 10,
    borderRadius: RADIUS.sm,
    position: "relative",
  },
  fullyAssignedBadge: {
    position: "absolute",
    top: 10,
    right: SPACING.xs,
    width: 18,
    height: 18,
    borderRadius: 9, // TODO: one-off (circular: half of 18px)
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  mainRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  qtyBadge: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }, // TODO: one-off
  qtyBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  desc: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20, flexShrink: 1 }, // TODO: one-off
  originalDescription: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15, paddingLeft: 28 }, // TODO: one-off
  itemTotal: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular" },
  unitPrice: { fontSize: 12, fontFamily: "Inter_400Regular" }, // TODO: one-off
  wasPrice: { fontSize: 12, fontFamily: "Inter_400Regular", textDecorationLine: "line-through" }, // TODO: one-off
  discountLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 1 }, // TODO: one-off
  splitBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 5 },
  splitBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  iconBtn: { padding: 6 },
  peopleRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, paddingLeft: 2 },
  editBlock: { gap: SPACING.sm },
  editRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  editCharged: { flex: 1, fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  editInput: { flex: 1, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, fontFamily: "Inter_400Regular" }, // TODO: one-off
  editQtyWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  editQtyLabel: { fontSize: 12, fontFamily: "Inter_500Medium" }, // TODO: one-off
  editInputQty: { width: 48, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 6, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" }, // TODO: one-off
  editInputSmall: { flex: 1, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 6, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "right" }, // TODO: one-off
  saveBtn: { paddingHorizontal: SPACING.md, paddingVertical: 7, borderRadius: RADIUS.sm },
  saveBtnText: { color: "#fff", fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold" },
  bulkBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADIUS.full, borderWidth: 1, borderStyle: "dashed", justifyContent: "center" },
  bulkBtnText: { fontSize: 11, fontFamily: "Inter_500Medium" }, // TODO: one-off
});
