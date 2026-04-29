import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { PersonBadge } from "./PersonBadge";

interface BillUser {
  id: number;
  name: string;
  color: string;
}

interface LineItemRowProps {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  assignedUserIds: number[];
  billUsers: BillUser[];
  currency: string;
  onToggleUser: (lineId: number, billUserId: number) => void;
  onDelete: (lineId: number) => void;
  onUpdate: (lineId: number, data: { description: string; quantity: number; total: number }) => void;
}

export function LineItemRow({
  id,
  description,
  quantity,
  total,
  assignedUserIds,
  billUsers,
  currency,
  onToggleUser,
  onDelete,
  onUpdate,
}: LineItemRowProps) {
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  const [editDesc, setEditDesc] = useState(description);
  const [editTotal, setEditTotal] = useState(String(total));

  const handleSave = () => {
    const newTotal = parseFloat(editTotal) || 0;
    onUpdate(id, { description: editDesc, quantity, total: newTotal });
    setEditing(false);
  };

  const handleDelete = () => {
    Alert.alert("Delete Item", `Remove "${description}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(id) },
    ]);
  };

  return (
    <View style={[styles.container, { borderColor: colors.border }]}>
      {editing ? (
        <View style={styles.editRow}>
          <TextInput
            style={[styles.editInput, { color: colors.foreground, borderColor: colors.border }]}
            value={editDesc}
            onChangeText={setEditDesc}
            placeholder="Item name"
            placeholderTextColor={colors.mutedForeground}
            autoFocus
          />
          <TextInput
            style={[styles.editInputSmall, { color: colors.foreground, borderColor: colors.border }]}
            value={editTotal}
            onChangeText={setEditTotal}
            keyboardType="numeric"
            placeholder="0.00"
            placeholderTextColor={colors.mutedForeground}
          />
          <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mainRow}>
          <View style={styles.desc}>
            <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={2}>
              {description}
            </Text>
            <Text style={[styles.itemTotal, { color: colors.mutedForeground }]}>
              {currency} {Number(total).toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setEditing(true)} style={styles.iconBtn}>
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
        </View>
      )}
    </View>
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
  desc: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
  },
  itemTotal: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
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
  editInputSmall: {
    width: 70,
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
});
