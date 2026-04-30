import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { getCurrencySymbol } from "@/utils/currency";
import { PersonBadge } from "@/components/PersonBadge";
import {
  useGetBillTotals,
  useGetBill,
  useUpdateBillUser,
  getGetBillTotalsQueryKey,
  getGetBillQueryKey,
} from "@workspace/api-client-react";

export default function TotalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = parseInt(id!);
  const queryClient = useQueryClient();
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editTipValue, setEditTipValue] = useState("");

  const { data: billData } = useGetBill(billId, { query: { queryKey: getGetBillQueryKey(billId) } });
  const { data: totals, isLoading } = useGetBillTotals(billId, { query: { queryKey: getGetBillTotalsQueryKey(billId) } });

  const updateUserMutation = useUpdateBillUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBillTotalsQueryKey(billId) });
        queryClient.invalidateQueries({ queryKey: getGetBillQueryKey(billId) });
        setEditingUserId(null);
      },
    },
  });

  const handleEditTip = (userId: number, currentTip: number) => {
    setEditingUserId(userId);
    setEditTipValue(String(currentTip));
  };

  const handleSaveTip = () => {
    if (editingUserId === null) return;
    const tip = parseFloat(editTipValue);
    if (isNaN(tip) || tip < 0) {
      Alert.alert("Invalid amount", "Please enter a valid tip amount");
      return;
    }
    updateUserMutation.mutate({
      billId,
      userId: editingUserId,
      data: { tipOverride: tip },
    });
  };

  const handleResetTip = (userId: number) => {
    updateUserMutation.mutate({
      billId,
      userId,
      data: { tipOverride: null },
    });
  };

  const currencySymbol = getCurrencySymbol(billData?.bill.currency);
  const fmt = (n: number) => `${currencySymbol ? `${currencySymbol} ` : ""}${n.toFixed(2)}`;

  if (isLoading || !totals) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Bill Totals</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <View style={[styles.grandCard, { backgroundColor: colors.primary }]}>
          <Text style={styles.grandLabel}>Grand Total</Text>
          <Text style={styles.grandAmount}>{fmt(totals.grandTotal)}</Text>
          <View style={styles.grandBreakdown}>
            <Text style={styles.grandSub}>Subtotal: {fmt(totals.billSubtotal)}</Text>
            <Text style={styles.grandSub}>Tax ({totals.taxPercent}%): {fmt(totals.taxAmount)}</Text>
            <Text style={styles.grandSub}>Tip ({totals.tipPercent}%): {fmt(totals.tipAmount)}</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PER PERSON</Text>

        {totals.perPerson.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Add people and assign items to see per-person totals
            </Text>
          </View>
        ) : (
          totals.perPerson.map((person) => (
            <View key={person.billUserId} style={[styles.personCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.personHeader}>
                <PersonBadge name={person.name} color={person.color} size="md" />
                <View style={styles.personInfo}>
                  <Text style={[styles.personName, { color: colors.foreground }]}>{person.name}</Text>
                  <Text style={[styles.personTotal, { color: colors.primary }]}>
                    {fmt(person.total)}
                  </Text>
                </View>
              </View>

              <View style={[styles.breakdown, { borderTopColor: colors.border }]}>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.mutedForeground }]}>Items</Text>
                  <Text style={[styles.breakdownValue, { color: colors.foreground }]}>
                    {fmt(person.subtotal)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.mutedForeground }]}>Tax share</Text>
                  <Text style={[styles.breakdownValue, { color: colors.foreground }]}>
                    {fmt(person.taxShare)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.mutedForeground }]}>
                    Tip {person.tipIsCustom ? "(custom)" : "(proportional)"}
                  </Text>
                  <View style={styles.tipRow}>
                    <Text style={[styles.breakdownValue, { color: person.tipIsCustom ? colors.primary : colors.foreground }]}>
                      {fmt(person.tipAmount)}
                    </Text>
                    <TouchableOpacity onPress={() => handleEditTip(person.billUserId, person.tipAmount)} style={styles.editTipBtn}>
                      <Feather name="edit-2" size={13} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    {person.tipIsCustom && (
                      <TouchableOpacity onPress={() => handleResetTip(person.billUserId)} style={styles.editTipBtn}>
                        <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={editingUserId !== null} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setEditingUserId(null)}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Custom Tip</Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Enter a custom tip amount for this person. Reset to restore proportional split.
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              value={editTipValue}
              onChangeText={setEditTipValue}
              keyboardType="numeric"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setEditingUserId(null)} style={[styles.modalCancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveTip} style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.modalConfirmText}>Set Tip</Text>
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  grandCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  grandLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: "Inter_500Medium" },
  grandAmount: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold" },
  grandBreakdown: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 4 },
  grandSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, paddingHorizontal: 4 },
  emptyContainer: { alignItems: "center", paddingVertical: 32 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  personCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  personHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  personInfo: { flex: 1 },
  personName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  personTotal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  breakdown: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  breakdownLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  breakdownValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  editTipBtn: { padding: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", borderRadius: 16, borderWidth: 1, padding: 20, gap: 12 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  modalInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center" },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  modalCancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  modalConfirmBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  modalConfirmText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
