import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { DateField } from "@/components/DateField";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateBill,
  useDetectCurrency,
  getGetBillsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { appendGuestBill, registerJoinCode } from "@/utils/guestBillStore";
import { pickColor } from "@/utils/pickColor";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import * as Haptics from "expo-haptics";
import { PressableScale } from "@/components/PressableScale";

const today = new Date().toISOString().split("T")[0]!;

export default function NewBillScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, guestOwnerId, guestName } = useAuth();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [currency, setCurrency] = useState("");
  const [taxPercent, setTaxPercent] = useState("");
  const [tipPercent, setTipPercent] = useState("");

  const { data: currencyData } = useDetectCurrency();
  useEffect(() => {
    if (currencyData?.currency) setCurrency(currencyData.currency);
  }, [currencyData]);

  const queryClient = useQueryClient();

  const displayName = user
    ? (user.firstName || user.displayName)
    : guestName || null;

  const createMutation = useCreateBill({
    mutation: {
      onSuccess: async (bill) => {
        if (!user && guestOwnerId && bill.id && bill.joinCode) {
          registerJoinCode(bill.id, bill.joinCode);
          await appendGuestBill({
            id: bill.id,
            joinCode: bill.joinCode,
            title: bill.title,
            date: bill.date,
          });
        }
        if (!user && displayName && bill.id) {
          try {
            await customFetch(`/api/bills/${bill.id}/users`, {
              method: "POST",
              body: JSON.stringify({ name: displayName, color: pickColor() }),
              headers: { "Content-Type": "application/json" },
            });
          } catch {
          }
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: getGetBillsQueryKey() });
        router.replace(`/bill/${bill.id}`);
      },
      onError: (err: Error) => {
        Alert.alert("Hmm, something went wrong", err.message || "Couldn't create the bill. Give it another shot.");
      },
    },
  });

  const handleCreate = () => {
    if (!title.trim()) {
      Alert.alert("What are we splitting?", "Give the bill a name first.");
      return;
    }
    createMutation.mutate({
      data: {
        title: title.trim(),
        date,
        currency: currency || null,
        taxPercent: parseFloat(taxPercent) || 0,
        tipPercent: parseFloat(tipPercent) || 0,
        ...(!user && guestOwnerId ? { guestOwnerId } : {}),
      } as Parameters<typeof createMutation.mutate>[0]["data"],
    });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>New Bill</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionCardTitle, { color: colors.mutedForeground }]}>BILL DETAILS</Text>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>TITLE *</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. Sushi with the gang"
              placeholderTextColor={colors.mutedForeground}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, styles.flex]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>DATE</Text>
              <DateField value={date} onChange={setDate} />
            </View>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>CURRENCY</Text>
              <CurrencyPicker value={currency} onChange={setCurrency} />
            </View>
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionCardTitle, { color: colors.mutedForeground }]}>SPLIT SETTINGS</Text>

          <View style={styles.row}>
            <View style={[styles.formGroup, styles.flex]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>TAX %</Text>
              <View style={[styles.inputWithIcon, { borderColor: colors.border }]}>
                <Feather name="percent" size={14} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.inputInner, { color: colors.foreground }]}
                  placeholder="e.g. 8.5"
                  placeholderTextColor={colors.mutedForeground}
                  value={taxPercent}
                  onChangeText={setTaxPercent}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={[styles.formGroup, styles.flex]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>TIP %</Text>
              <View style={[styles.inputWithIcon, { borderColor: colors.border }]}>
                <Feather name="heart" size={14} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.inputInner, { color: colors.foreground }]}
                  placeholder="e.g. 18"
                  placeholderTextColor={colors.mutedForeground}
                  value={tipPercent}
                  onChangeText={setTipPercent}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>

          <View style={[styles.helperRow, { backgroundColor: colors.primarySoft }]}>
            <Feather name="info" size={13} color={colors.primary} />
            <Text style={[styles.helperText, { color: colors.primaryDark }]}>
              Shared proportionally across all items
            </Text>
          </View>
        </View>

        <PressableScale
          style={[styles.createBtn, { backgroundColor: colors.primary, opacity: createMutation.isPending ? 0.85 : 1 }]}
          onPress={handleCreate}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="file-text" size={20} color="#fff" />
              <Text style={styles.createBtnText}>Start the bill</Text>
            </>
          )}
        </PressableScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: SPACING.md,
  },
  backBtn: { padding: SPACING.xs, width: 40 },
  headerTitle: { flex: 1, fontSize: FONT_SIZE.title, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxl, gap: SPACING.lg },
  sectionCard: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACING.xl,
    gap: SPACING.lg,
  },
  sectionCardTitle: {
    fontSize: FONT_SIZE.caption,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
  },
  formGroup: { gap: 6 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 }, // TODO: one-off
  input: {
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_400Regular",
  },
  inputWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: SPACING.sm,
  },
  inputInner: { flex: 1, fontSize: FONT_SIZE.body, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", gap: SPACING.md, alignItems: "flex-end" },
  helperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.sm,
    padding: 10,
  },
  helperText: { flex: 1, fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular", lineHeight: 18 },
  createBtn: {
    borderRadius: RADIUS.full,
    paddingVertical: 17,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginTop: SPACING.sm,
  },
  createBtnText: { color: "#fff", fontSize: FONT_SIZE.title, fontFamily: "Inter_700Bold" },
});
