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

const today = new Date().toISOString().split("T")[0]!;

export default function NewBillScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, guestOwnerId, guestName } = useAuth();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [currency, setCurrency] = useState("");
  const [taxPercent, setTaxPercent] = useState("0");
  const [tipPercent, setTipPercent] = useState("0");

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
        queryClient.invalidateQueries({ queryKey: getGetBillsQueryKey() });
        router.replace(`/bill/${bill.id}`);
      },
      onError: (err: Error) => {
        Alert.alert("Error", err.message || "Failed to create bill");
      },
    },
  });

  const handleCreate = () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a bill title");
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
        <TouchableOpacity
          onPress={handleCreate}
          disabled={createMutation.isPending}
          style={[styles.createBtn, { backgroundColor: colors.primary }]}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createBtnText}>Create</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formGroup}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>TITLE *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
            placeholder="e.g. Dinner at Mario's"
            placeholderTextColor={colors.mutedForeground}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, styles.flex]}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>DATE</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              value={date}
              onChangeText={setDate}
            />
          </View>
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>CURRENCY (OPTIONAL)</Text>
            <CurrencyPicker value={currency} onChange={setCurrency} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, styles.flex]}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>TAX %</Text>
            <View style={[styles.inputWithIcon, { borderColor: colors.border }]}>
              <Feather name="percent" size={14} color={colors.mutedForeground} />
              <TextInput
                style={[styles.inputInner, { color: colors.foreground }]}
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
                value={taxPercent}
                onChangeText={setTaxPercent}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={[styles.formGroup, styles.flex]}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>TIP %</Text>
            <View style={[styles.inputWithIcon, { borderColor: colors.border }]}>
              <Feather name="heart" size={14} color={colors.mutedForeground} />
              <TextInput
                style={[styles.inputInner, { color: colors.foreground }]}
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
                value={tipPercent}
                onChangeText={setTipPercent}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        <View style={[styles.hintCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="info" size={14} color={colors.mutedForeground} />
          <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
            Enter tax and tip as percentages (e.g. 8 for 8%). Amounts are calculated from the subtotal. You can adjust each person's tip on the totals screen.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold" },
  createBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  createBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },
  formGroup: { gap: 6 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  inputWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  inputInner: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-end" },
  hintCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  hintText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
