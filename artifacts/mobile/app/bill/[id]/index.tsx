import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { PersonBadge } from "@/components/PersonBadge";
import { LineItemRow } from "@/components/LineItemRow";
import {
  useGetBill,
  useCreateBillUser,
  useDeleteBillUser,
  useCreateBillLine,
  useDeleteBillLine,
  useUpdateBillLine,
  useToggleBillLineUser,
  getGetBillQueryKey,
} from "@workspace/api-client-react";
import colors_data from "@/constants/colors";
import { getCurrencySymbol } from "@/utils/currency";

const PEOPLE_COLORS = colors_data.light.people;

export default function BillDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = parseInt(id!);
  const queryClient = useQueryClient();

  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemTotal, setNewItemTotal] = useState("");

  const { data, isLoading } = useGetBill(billId, {
    query: {
      queryKey: getGetBillQueryKey(billId),
      refetchOnWindowFocus: true,
    },
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetBillQueryKey(billId) });
  }, [billId, queryClient]);

  const addPersonMutation = useCreateBillUser({
    mutation: { onSuccess: invalidate },
  });

  const deletePersonMutation = useDeleteBillUser({
    mutation: { onSuccess: invalidate },
  });

  const addLineMutation = useCreateBillLine({
    mutation: { onSuccess: invalidate },
  });

  const deleteLineMutation = useDeleteBillLine({
    mutation: { onSuccess: invalidate },
  });

  const updateLineMutation = useUpdateBillLine({
    mutation: { onSuccess: invalidate },
  });

  const toggleLineMutation = useToggleBillLineUser({
    mutation: {
      onSuccess: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        invalidate();
      },
    },
  });

  const handleAddPerson = () => {
    if (!newPersonName.trim()) return;
    const existingCount = data?.users?.length ?? 0;
    const color = PEOPLE_COLORS[existingCount % PEOPLE_COLORS.length]!;
    addPersonMutation.mutate({
      billId,
      data: { name: newPersonName.trim(), color },
    });
    setNewPersonName("");
    setShowAddPerson(false);
  };

  const handleDeletePerson = (userId: number, name: string) => {
    Alert.alert("Remove Person", `Remove ${name} from this bill?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deletePersonMutation.mutate({ billId, userId }) },
    ]);
  };

  const handleAddItem = () => {
    if (!newItemDesc.trim()) return;
    const total = parseFloat(newItemTotal) || 0;
    addLineMutation.mutate({
      billId,
      data: { description: newItemDesc.trim(), quantity: 1, unitPrice: total, total },
    });
    setNewItemDesc("");
    setNewItemTotal("");
    setShowAddItem(false);
  };

  const handleToggleUser = (lineId: number, billUserId: number) => {
    toggleLineMutation.mutate({ billId, lineId, data: { billUserId } });
  };

  const handleDeleteLine = (lineId: number) => {
    deleteLineMutation.mutate({ billId, lineId });
  };

  const handleUpdateLine = (lineId: number, lineData: { description: string; quantity: number; total: number }) => {
    updateLineMutation.mutate({
      billId,
      lineId,
      data: {
        description: lineData.description,
        quantity: lineData.quantity,
        unitPrice: lineData.total / (lineData.quantity || 1),
        total: lineData.total,
      },
    });
  };

  if (isLoading || !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const { bill, lines, users } = data;

  const fmt = (n: number) => {
    const symbol = getCurrencySymbol(bill.currency);
    return `${symbol ? `${symbol} ` : ""}${n.toFixed(2)}`;
  };

  const subtotal = lines.reduce((sum, l) => sum + parseFloat(String(l.total)), 0);
  const taxAmount = parseFloat(String(bill.taxAmount));
  const tipAmount = parseFloat(String(bill.tipAmount));
  const grandTotal = subtotal + taxAmount + tipAmount;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{bill.title}</Text>
          {bill.restaurantName ? (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {bill.restaurantName}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={() => router.push(`/bill/${billId}/share`)} style={styles.headerBtn}>
          <Feather name="share-2" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push(`/bill/${billId}/totals`)} style={[styles.totalsBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.totalsBtnText}>Totals</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PEOPLE</Text>
            <TouchableOpacity onPress={() => setShowAddPerson(true)} style={[styles.addBtn, { backgroundColor: colors.muted }]}>
              <Feather name="plus" size={14} color={colors.primary} />
              <Text style={[styles.addBtnText, { color: colors.primary }]}>Add</Text>
            </TouchableOpacity>
          </View>

          {users.length === 0 ? (
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
              Add people to start splitting
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleScroll}>
              {users.map((u) => (
                <PersonBadge
                  key={u.id}
                  name={u.name}
                  color={u.color}
                  size="lg"
                  showName
                  onPress={() => handleDeletePerson(u.id, u.name)}
                />
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ITEMS</Text>
            <View style={styles.itemActions}>
              <TouchableOpacity
                onPress={() => router.push(`/bill/${billId}/scan`)}
                style={[styles.addBtn, { backgroundColor: colors.muted }]}
              >
                <Feather name="camera" size={14} color={colors.primary} />
                <Text style={[styles.addBtnText, { color: colors.primary }]}>Scan</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAddItem(true)} style={[styles.addBtn, { backgroundColor: colors.muted }]}>
                <Feather name="plus" size={14} color={colors.primary} />
                <Text style={[styles.addBtnText, { color: colors.primary }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {lines.length === 0 ? (
            <View style={[styles.emptyItems, { borderColor: colors.border }]}>
              <Feather name="file-text" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                No items yet. Scan a receipt or add manually.
              </Text>
            </View>
          ) : (
            lines.map((line) => (
              <LineItemRow
                key={line.id}
                id={line.id}
                description={line.description}
                quantity={parseFloat(String(line.quantity))}
                unitPrice={parseFloat(String(line.unitPrice))}
                total={parseFloat(String(line.total))}
                assignedUserIds={line.assignedUserIds}
                billUsers={users}
                currency={bill.currency}
                onToggleUser={handleToggleUser}
                onDelete={handleDeleteLine}
                onUpdate={handleUpdateLine}
              />
            ))
          )}
        </View>

        <View style={[styles.billSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{fmt(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Tax</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{fmt(taxAmount)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Tip</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{fmt(tipAmount)}</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, styles.summaryTotalLabel, { color: colors.foreground }]}>Total</Text>
            <Text style={[styles.summaryValue, styles.summaryTotalValue, { color: colors.primary }]}>{fmt(grandTotal)}</Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showAddPerson} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowAddPerson(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Person</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              placeholder="Name"
              placeholderTextColor={colors.mutedForeground}
              value={newPersonName}
              onChangeText={setNewPersonName}
              autoFocus
              onSubmitEditing={handleAddPerson}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowAddPerson(false)} style={[styles.modalCancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddPerson} style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.modalConfirmText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showAddItem} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowAddItem(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Item</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              placeholder="Item description"
              placeholderTextColor={colors.mutedForeground}
              value={newItemDesc}
              onChangeText={setNewItemDesc}
              autoFocus
            />
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              placeholder="Amount (e.g. 12.50)"
              placeholderTextColor={colors.mutedForeground}
              value={newItemTotal}
              onChangeText={setNewItemTotal}
              keyboardType="numeric"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowAddItem(false)} style={[styles.modalCancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddItem} style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.modalConfirmText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerBtn: { padding: 6 },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  totalsBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  totalsBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 24 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  addBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  itemActions: { flexDirection: "row", gap: 8 },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyItems: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  peopleScroll: { gap: 20, paddingVertical: 4, paddingHorizontal: 4 },
  billSummary: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  summaryDivider: { height: 1, marginVertical: 4 },
  summaryTotalLabel: { fontFamily: "Inter_600SemiBold" },
  summaryTotalValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalInput: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  modalConfirmBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  modalConfirmText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
