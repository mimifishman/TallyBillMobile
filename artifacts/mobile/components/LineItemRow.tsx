import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import { getCurrencySymbol } from "@/utils/currency";
import { PersonBadge } from "./PersonBadge";

interface BillMember {
  id: number;
  name: string;
  color: string;
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
    Alert.alert("Delete Item", `Remove "${description}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(id) },
    ]);
  };

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16).mass(0.6)}
      style={[styles.container, { borderColor: colors.border }]}
    >
      {editing ? (
        <View style={styles.editBlock}>
          <View style={styles.editRow}>
            <TextInput
              style={[styles.editInput, { color: colors.foreground, borderColor: colors.border }]}
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
                style={[styles.editInputQty, { color: colors.foreground, borderColor: colors.border }]}
                value={editQty}
                onChangeText={setEditQty}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <TextInput
              style={[styles.editInputSmall, { color: colors.foreground, borderColor: colors.border }]}
              value={editTotal}
              onChangeText={setEditTotal}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
            />
            {quantity > 1 && (
              <TouchableOpacity
                onPress={() => onSplit(id)}
                style={[styles.splitBtn, { borderColor: colors.primary }]}
                accessibilityLabel="Split item quantity"
              >
                <Feather name="scissors" size={13} color={colors.primary} />
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
            <TouchableOpacity
              onPress={() => onSplit(id)}
              style={[styles.splitBtn, { borderColor: colors.primary }]}
              accessibilityLabel="Split item quantity"
            >
              <Feather name="scissors" size={13} color={colors.primary} />
              <Text style={[styles.splitBtnText, { color: colors.primary }]}>Split</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleEdit} style={styles.iconBtn}>
            <Feather name="edit-2" size={15} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.iconBtn}>
            <Feather name="trash-2" size={15} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      )}

      {billUsers.length > 0 && (
        <View style={styles.peopleRow}>
          {billUsers.map((user) => (
            <PersonBadge
              key={user.id}
              name={user.name}
              color={user.color}
              size="sm"
              selected={assignedUserIds.includes(user.id)}
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
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onBulkToggleUsers(id, idsToToggle);
                }}
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
    paddingVertical: 10,
    paddingHorizontal: 2,
    gap: 8,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  qtyBadge: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  qtyBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  desc: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
    flexShrink: 1,
  },
  originalDescription: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
    paddingLeft: 28,
  },
  itemTotal: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  unitPrice: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  splitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  splitBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  iconBtn: {
    padding: 6,
  },
  peopleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingLeft: 2,
  },
  editBlock: {
    gap: 8,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  editQtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  editQtyLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  editInputQty: {
    width: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  editInputSmall: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  saveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  bulkBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    justifyContent: "center",
  },
  bulkBtnText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
