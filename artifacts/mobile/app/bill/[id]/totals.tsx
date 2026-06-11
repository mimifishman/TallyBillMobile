import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
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
import { BottomSheet } from "@/components/BottomSheet";
import { Skeleton } from "@/components/Skeleton";
import { Confetti } from "@/components/Confetti";
import { RADIUS, SHADOWS } from "@/constants/styles";
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

  const toggleExpanded = (uid: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
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
      Alert.alert("Invalid value", "Enter a number like 15 for 15%");
      return;
    }
    updateUserMutation.mutate({ billId, userId: editingUserId, data: { tipPercentOverride: pct } });
  };

  const handleResetTip = (userId: number) => {
    updateUserMutation.mutate({ billId, userId, data: { tipPercentOverride: null } });
  };

  const currencySymbol = getCurrencySymbol(billData?.bill.currency);
  const fmt = (n: number) => `${currencySymbol ? `${currencySymbol} ` : ""}${n.toFixed(2)}`;
  const fmtPct = (n: number) => {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
  };

  const isSettled = totals?.settled === true;
  const totalLines = totals ? totals.perPerson.reduce((sum, p) => sum + p.items.length, 0) : 0;
  const totalPeople = totals?.perPerson.length ?? 0;

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
          <Skeleton height={160} borderRadius={20} />
          <Skeleton height={14} width={100} />
          <Skeleton height={96} borderRadius={20} />
          <Skeleton height={96} borderRadius={20} />
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
            colors={["#F59E0B", "#D97706"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.grandCard}
          >
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandAmount}>{fmt(totals.grandTotal)}</Text>
            {totalLines > 0 && totalPeople > 0 && (
              <Text style={styles.grandSubline}>{totalLines} {totalLines === 1 ? "item" : "items"} · {totalPeople} {totalPeople === 1 ? "person" : "people"}</Text>
            )}
            <View style={styles.grandBreakdown}>
              <Text style={styles.grandSub}>Subtotal: {fmt(totals.billSubtotal)}</Text>
              <Text style={styles.grandSub}>Tax ({fmtPct(totals.taxPercent)}%): {fmt(totals.taxAmount)}</Text>
              <Text style={styles.grandSub}>Tip (avg {fmtPct(totals.averageTipPercent)}%): {fmt(totals.tipAmount)}</Text>
            </View>
          </LinearGradient>
          {isSettled ? <Confetti trigger={confettiKey} count={36} /> : null}
        </View>

        {isSettled ? (
          <Animated.View style={[styles.settledBanner, { backgroundColor: "#D1FAE5" }, checkAnim]}>
            <View style={[styles.checkCircle, { backgroundColor: colors.success }]}>
              <Feather name="check" size={16} color="#fff" />
            </View>
            <Text style={[styles.settledText, { color: "#065F46" }]}>All squared away! 🎉</Text>
          </Animated.View>
        ) : null}

        {totals.unsplitLines.length > 0 ? (
          <>
            <View style={[styles.warningBanner, { backgroundColor: "#FEF3C7" }]}>
              <Feather name="alert-circle" size={18} color="#B45309" />
              <Text style={styles.warningText}>
                {totals.unsplitLines.length === 1 ? "1 item hasn't been split yet" : `${totals.unsplitLines.length} items haven't been split yet`}
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
                    <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>{line.description}</Text>
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
                const allExpanded = allIds.every((uid) => expandedIds.has(uid));
                setExpandedIds(allExpanded ? new Set() : new Set(allIds));
              }}
              style={[styles.expandAllBtn, { borderColor: colors.border }]}
            >
              <Feather name={totals.perPerson.filter((p) => p.items.length > 0).every((p) => expandedIds.has(p.billUserId)) ? "minimize-2" : "maximize-2"} size={12} color={colors.mutedForeground} />
              <Text style={[styles.expandAllText, { color: colors.mutedForeground }]}>
                {totals.perPerson.filter((p) => p.items.length > 0).every((p) => expandedIds.has(p.billUserId)) ? "Collapse all" : "Expand all"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {totals.perPerson.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Add people and assign items to see per-person totals</Text>
          </View>
        ) : (
          totals.perPerson.map((person, idx) => (
            <Animated.View
              key={person.billUserId}
              entering={FadeInDown.delay(idx * 60).springify().damping(14)}
              style={[styles.personCard, { backgroundColor: colors.card, borderColor: colors.border }, SHADOWS.card]}
            >
              <TouchableOpacity
                style={styles.personHeader}
                onPress={() => person.items.length > 0 && toggleExpanded(person.billUserId)}
                activeOpacity={person.items.length > 0 ? 0.75 : 1}
              >
                <PersonBadge name={person.name} color={person.color} size="md" />
                <View style={styles.personInfo}>
                  <Text style={[styles.personName, { color: colors.foreground }]}>{person.name}</Text>
                  <Text style={[styles.personTotal, { color: colors.primary }]}>{fmt(person.total)}</Text>
                </View>
                {person.items.length > 0 && (
                  <View style={[styles.expandBtn, { backgroundColor: colors.primarySoft }]}>
                    <Feather name={expandedIds.has(person.billUserId) ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
                  </View>
                )}
              </TouchableOpacity>

              {person.items.length > 0 && expandedIds.has(person.billUserId) ? (
                <View style={[styles.itemsList, { borderTopColor: colors.border }]}>
                  {person.items.map((item) => {
                    const splitLabel = item.splitWithNames.length === 0 ? "not split" : `split with ${item.splitWithNames.join(", ")}`;
                    return (
                      <View key={item.billLineId} style={styles.itemRow}>
                        <View style={styles.itemLeft}>
                          <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>{item.description}</Text>
                          <Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>{fmt(item.lineTotal)} · {splitLabel}</Text>
                        </View>
                        <Text style={[styles.itemShare, { color: colors.foreground }]}>{fmt(item.share)}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <View style={[styles.breakdown, { borderTopColor: colors.border }]}>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.mutedForeground }]}>Items</Text>
                  <Text style={[styles.breakdownValue, { color: colors.foreground }]}>{fmt(person.subtotal)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.mutedForeground }]}>Tax share</Text>
                  <Text style={[styles.breakdownValue, { color: colors.foreground }]}>{fmt(person.taxShare)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.mutedForeground }]}>Tip ({fmtPct(person.tipPercent)}%)</Text>
                  <View style={styles.tipRow}>
                    <Text style={[styles.breakdownValue, { color: person.tipIsCustom ? colors.primary : colors.foreground }]}>{fmt(person.tipAmount)}</Text>
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

      <BottomSheet
        visible={editingUserId !== null}
        onClose={() => setEditingUserId(null)}
        title="Custom Tip %"
      >
        <View style={styles.tipSheetContent}>
          <Text style={[styles.tipSheetSub, { color: colors.mutedForeground }]}>
            Enter a percentage like 20 for 20%. Reset to restore the bill default.
          </Text>
          <TextInput
            style={[styles.tipInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
            placeholder="e.g. 15"
            placeholderTextColor={colors.mutedForeground}
            value={editTipValue}
            onChangeText={setEditTipValue}
            keyboardType="numeric"
            autoFocus
          />
          <TouchableOpacity onPress={handleSaveTip} style={[styles.tipSaveBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.tipSaveBtnText}>Set Tip %</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditingUserId(null)} style={styles.tipCancelBtn}>
            <Text style={[styles.tipCancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
    borderRadius: RADIUS.xl,
    padding: 24,
    alignItems: "center",
    gap: 6,
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  grandLabel: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontFamily: "Inter_500Medium" },
  grandAmount: { color: "#fff", fontSize: 40, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  grandSubline: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 2 },
  grandBreakdown: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 6 },
  grandSub: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "Inter_500Medium" },
  settledBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: RADIUS.lg,
  },
  checkCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  settledText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2 },
  expandAllBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6 },
  expandAllText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  emptyContainer: { alignItems: "center", paddingVertical: 32 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  personCard: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: "hidden" },
  personHeader: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  expandBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  personInfo: { flex: 1 },
  personName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  personTotal: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 1 },
  itemsList: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  itemLeft: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  itemSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  itemShare: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  breakdown: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  breakdownLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  breakdownValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  editTipBtn: { padding: 4 },
  warningBanner: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderRadius: RADIUS.lg },
  warningText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#B45309", flex: 1 },
  unsplitCard: { borderRadius: RADIUS.xl, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  unsplitHeader: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2, marginBottom: 2 },
  tipSheetContent: { gap: 16 },
  tipSheetSub: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  tipInput: { borderWidth: 1.5, borderRadius: RADIUS.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  tipSaveBtn: { borderRadius: RADIUS.full, paddingVertical: 15, alignItems: "center" },
  tipSaveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  tipCancelBtn: { alignItems: "center", paddingVertical: 8 },
  tipCancelBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
