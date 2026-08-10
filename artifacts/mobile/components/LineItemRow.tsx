import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
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
  assignedUserIds: number[];
  billUsers: BillMember[];
  currency?: string | null;
  onToggleUser: (lineId: number, billUserId: number) => void;
  onBulkToggleUsers: (lineId: number, billUserIds: number[]) => void;
  onDelete: (lineId: number) => void;
  onUpdate: (lineId: number, data: { description: string; quantity: number; total: number }) => void;
  onSplit: (lineId: number) => void;
}

export function LineItemRow({
  id,
  description,
  originalDescription,
  quantity,
  unitPrice,
  total,
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
  const [editTotal, setEditTotal] = useState(String(total));
  const [editQty, setEditQty] = useState(String(quantity));

  const isFullyAssigned = billUsers.length > 0 && billUsers.every((u) => assignedUserIds.includes(u.id));
  const hasAnyAssigned = assignedUserIds.length > 0;

  const handleEdit = () => {
    setEditDesc(description);
    setEditTotal(String(total));
    setEditQty(String(quantity));
    setEditing(true);
  };

  const handleSave = () => {
    const newTotal = parseFloat(editTotal) || 0;
    const newQty = Math.max(1, parseInt(editQty) || 1);
    onUpdate(id, { description: editDesc, quantity: newQty, total: newTotal });
    setEditing(false);
  };

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
                placeholder="1"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <TextInput
              style={[styles.editInputSmall, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={editTotal}
              onChangeText={setEditTotal}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
            />
            {quantity > 1 && (
              <TouchableOpacity onPress={() => onSplit(id)} style={[styles.splitBtn, { borderColor: colors.primary }]} accessibilityLabel="Split item quantity">
                <Feather name="scissors" size={13} color={colors.primaryText} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
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
              {currencySymbol ? `${currencySymbol} ` : ""}{Number(total).toFixed(2)}
              {quantity > 1 ? (
                <Text style={[styles.unitPrice, { color: colors.mutedForeground }]}>
                  {" "}({currencySymbol ? `${currencySymbol} ` : ""}{Number(unitPrice).toFixed(2)} each)
                </Text>
              ) : null}
            </Text>
          </View>
          {quantity > 1 && (
            <TouchableOpacity onPress={() => onSplit(id)} style={[styles.splitBtn, { borderColor: colors.primary }]} accessibilityLabel="Split item quantity">
              <Feather name="scissors" size={13} color={colors.primaryText} />
              <Text style={[styles.splitBtnText, { color: colors.primaryText }]}>Split</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleEdit} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="edit-2" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
  splitBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 5 },
  splitBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  iconBtn: { padding: 6 },
  peopleRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, paddingLeft: 2 },
  editBlock: { gap: SPACING.sm },
  editRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
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
