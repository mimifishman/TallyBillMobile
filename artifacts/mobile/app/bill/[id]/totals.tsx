import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
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
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { getCurrencySymbol } from "@/utils/currency";
import { PersonBadge } from "@/components/PersonBadge";
import { Skeleton } from "@/components/Skeleton";
import { Confetti } from "@/components/Confetti";
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
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: getGetBillTotalsQueryKey(billId) });
    }, [billId, queryClient])
  );

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

  const handleEditTip = (userId: number, currentTipPercent: number) => {
    setEditingUserId(userId);
    setEditTipValue(String(currentTipPercent));
  };

  const handleSaveTip = () => {
    if (editingUserId === null) return;
    const pct = parseFloat(editTipValue);
    if (isNaN(pct) || pct < 0) {
      Alert.alert("Invalid value", "Please enter a valid tip percentage (e.g. 15 for 15%)");
      return;
    }
    updateUserMutation.mutate({
      billId,
      userId: editingUserId,
      data: { tipPercentOverride: pct },
    });
  };

  const handleResetTip = (userId: number) => {
    updateUserMutation.mutate({
      billId,
      userId,
      data: { tipPercentOverride: null },
    });
  };

  const currencySymbol = getCurrencySymbol(billData?.bill.currency);
  const fmt = (n: number) => `${currencySymbol ? `${currencySymbol} ` : ""}${n.toFixed(2)}`;
  const fmtPct = (n: number) => {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
  };

  const isSettled = totals?.settled === true;

  const checkScale = useSharedValue(0);
  const [confettiKey, setConfettiKey] = useState(0);

  useEffect(() => {
    if (isSettled) {
      checkScale.value = 0;
      checkScale.value = withSequence(
        withTiming(0, { duration: 100 }),
        withSpring(1.2, { damping: 6, stiffness: 140 }),
        withSpring(1, { damping: 10, stiffness: 160 }),
      );
      setConfettiKey((k) => k + 1);
    } else {
      checkScale.value = withTiming(0, { duration: 200 });
    }
  }, [isSettled, checkScale]);

  const checkAnim = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  if (isLoading || !totals) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Bill Totals</Text>
        </View>
        <View style={[styles.content, { gap: 16 }]}>
          <Skeleton height={140} borderRadius={16} />
          <Skeleton height={14} width={100} />
          <Skeleton height={90} borderRadius={14} />
          <Skeleton height={90} borderRadius={14} />
        </View>
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
        <View>
          <LinearGradient
            colors={colors.gradientPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.grandCard}
          >
            <Text style={styles.grandLabel}>Grand Total</Text>
            <Text style={styles.grandAmount}>{fmt(totals.grandTotal)}</Text>
            <View style={styles.grandBreakdown}>
              <Text style={styles.grandSub}>Subtotal: {fmt(totals.billSubtotal)}</Text>
              <Text style={styles.grandSub}>Tax ({fmtPct(totals.taxPercent)}%): {fmt(totals.taxAmount)}</Text>
              <Text style={styles.grandSub}>
                Tip (avg {fmtPct(totals.averageTipPercent)}%): {fmt(totals.tipAmount)}
              </Text>
            </View>
          </LinearGradient>
          {isSettled ? <Confetti trigger={confettiKey} count={36} /> : null}
        </View>

        {isSettled ? (
          <Animated.View style={[styles.settledBanner, { backgroundColor: colors.primarySoft }, checkAnim]}>
            <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
              <Feather name="check" size={16} color="#fff" />
            </View>
            <Text style={[styles.settledText, { color: colors.primary }]}>All settled — every item is split!</Text>
          </Animated.View>
        ) : null}

        {totals.unsplitLines.length > 0 ? (
          <>
            <View style={styles.warningBanner}>
              <Feather name="alert-circle" size={18} color="#B45309" />
              <Text style={styles.warningText}>
                {totals.unsplitLines.length === 1
                  ? "1 item hasn't been split yet"
                  : `${totals.unsplitLines.length} items haven't been split yet`}
              </Text>
            </View>

            <View style={[styles.unsplitCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.unsplitHeader, { color: colors.mutedForeground }]}>UNASSIGNED ITEMS</Text>
              {totals.unsplitLines.map((line, idx) => (
                <View
                  key={line.id}
                  style={[
                    styles.itemRow,
                    idx < totals.unsplitLines.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 8, marginBottom: 2 },
                  ]}
                >
                  <View style={styles.itemLeft}>
                    <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                      {line.description}
                    </Text>
                  </View>
                  <Text style={[styles.itemShare, { color: colors.foreground }]}>{fmt(line.total)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PER PERSON</Text>
          {totals.perPerson.some((p) => p.items.length > 0) && (
            <TouchableOpacity
              onPress={() => {
                const allIds = totals.perPerson.filter((p) => p.items.length > 0).map((p) => p.billUserId);
                const allExpanded = allIds.every((id) => expandedIds.has(id));
                setExpandedIds(allExpanded ? new Set() : new Set(allIds));
              }}
              style={[styles.expandAllBtn, { borderColor: colors.border }]}
            >
              <Feather
                name={totals.perPerson.filter((p) => p.items.length > 0).every((p) => expandedIds.has(p.billUserId)) ? "minimize-2" : "maximize-2"}
                size={12}
                color={colors.mutedForeground}
              />
              <Text style={[styles.expandAllText, { color: colors.mutedForeground }]}>
                {totals.perPerson.filter((p) => p.items.length > 0).every((p) => expandedIds.has(p.billUserId))
                  ? "Collapse all"
                  : "Expand all"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {totals.perPerson.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Add people and assign items to see per-person totals
            </Text>
          </View>
        ) : (
          totals.perPerson.map((person, idx) => (
            <Animated.View
              key={person.billUserId}
              entering={FadeInDown.delay(idx * 50).springify().damping(14)}
              style={[styles.personCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <TouchableOpacity
                style={styles.personHeader}
                onPress={() => person.items.length > 0 && toggleExpanded(person.billUserId)}
                activeOpacity={person.items.length > 0 ? 0.7 : 1}
              >
                <PersonBadge name={person.name} color={person.color} size="md" />
                <View style={styles.personInfo}>
                  <Text style={[styles.personName, { color: colors.foreground }]}>{person.name}</Text>
                  <Text style={[styles.personTotal, { color: colors.primary }]}>
                    {fmt(person.total)}
                  </Text>
                </View>
                {person.items.length > 0 && (
                  <View style={[styles.expandBtn, { backgroundColor: colors.primarySoft }]}>
                    <Feather
                      name={expandedIds.has(person.billUserId) ? "minus" : "plus"}
                      size={14}
                      color={colors.primary}
                    />
                  </View>
                )}
              </TouchableOpacity>

              {person.items.length > 0 && expandedIds.has(person.billUserId) ? (
                <View style={[styles.itemsList, { borderTopColor: colors.border }]}>
                  {person.items.map((item) => {
                    const splitLabel =
                      item.splitWithNames.length === 0
                        ? "not split"
                        : `split with ${item.splitWithNames.join(", ")}`;
                    return (
                      <View key={item.billLineId} style={styles.itemRow}>
                        <View style={styles.itemLeft}>
                          <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                            {item.description}
                          </Text>
                          <Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {fmt(item.lineTotal)} · {splitLabel}
                          </Text>
                        </View>
                        <Text style={[styles.itemShare, { color: colors.foreground }]}>
                          {fmt(item.share)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}

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
                    Tip ({fmtPct(person.tipPercent)}%)
                  </Text>
                  <View style={styles.tipRow}>
                    <Text style={[styles.breakdownValue, { color: person.tipIsCustom ? colors.primary : colors.foreground }]}>
                      {fmt(person.tipAmount)}
                    </Text>
                    <TouchableOpacity onPress={() => handleEditTip(person.billUserId, person.tipPercent)} style={styles.editTipBtn}>
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
            </Animated.View>
          ))
        )}
      </ScrollView>

      <Modal visible={editingUserId !== null} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setEditingUserId(null)}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Custom Tip %</Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Enter a tip percentage for this person (e.g. 20 for 20%). Reset to restore the bill default.
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              placeholder="15"
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
                <Text style={styles.modalConfirmText}>Set Tip %</Text>
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
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
    gap: 6,
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  settledBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  settledText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  grandLabel: { color: "rgba(255,255,255,0.95)", fontSize: 13, fontFamily: "Inter_500Medium" },
  grandAmount: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold" },
  grandBreakdown: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 4 },
  grandSub: { color: "rgba(255,255,255,0.95)", fontSize: 13, fontFamily: "Inter_500Medium" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  expandAllBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  expandAllText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  emptyContainer: { alignItems: "center", paddingVertical: 32 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  personCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  personHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  expandBtn: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  personInfo: { flex: 1 },
  personName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  personTotal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  itemsList: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  itemLeft: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  itemSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  itemShare: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  breakdown: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  breakdownLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  breakdownValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  editTipBtn: { padding: 4 },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#FEF3C7",
  },
  warningText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#B45309",
    flex: 1,
  },
  unsplitCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  unsplitHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
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
