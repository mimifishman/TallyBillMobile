import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { listGuestBills } from "@/utils/guestBillStore";
import { useGetBills, getGetBillsQueryKey } from "@workspace/api-client-react";

export default function WelcomeScreen() {
  const { user, isLoading, guestName, saveGuestName } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [hasGuestBills, setHasGuestBills] = useState(false);
  const [guestCheckDone, setGuestCheckDone] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const { data: authBills, isLoading: authBillsLoading } = useGetBills({
    query: { queryKey: getGetBillsQueryKey(), enabled: !!user },
  });

  useEffect(() => {
    listGuestBills().then((bills) => {
      setHasGuestBills(bills.length > 0);
      setGuestCheckDone(true);
    });
  }, []);

  const checksComplete = !isLoading && guestCheckDone && (!user || !authBillsLoading);

  useEffect(() => {
    if (checksComplete && !user && guestName === null) {
      setShowNamePrompt(true);
    }
  }, [checksComplete, user, guestName]);

  const handleNameSubmit = async () => {
    const trimmed = nameInput.trim();
    await saveGuestName(trimmed);
    setShowNamePrompt(false);
  };

  const handleSkip = async () => {
    await saveGuestName("");
    setShowNamePrompt(false);
  };

  if (!checksComplete) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const hasAuthBills = !!user && (authBills?.length ?? 0) > 0;
  const showMyBills = hasAuthBills || hasGuestBills;

  const displayName = user
    ? (user.firstName ?? user.displayName)
    : guestName || null;

  const greeting = displayName ? `Welcome, ${displayName}!` : null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 32,
        },
      ]}
    >
      <View style={styles.hero}>
        <View style={[styles.logoWrap, { backgroundColor: colors.primarySoft }]}>
          <Feather name="file-text" size={40} color={colors.primary} />
        </View>
        <Text style={[styles.appName, { color: colors.foreground }]}>TallyBill</Text>
        {greeting ? (
          <Text style={[styles.greeting, { color: colors.foreground }]}>{greeting}</Text>
        ) : null}
        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          Split bills with friends, effortlessly
        </Text>
      </View>

      <View style={styles.actions}>
        {showMyBills && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/(tabs)/bills")}
            activeOpacity={0.85}
          >
            <Feather name="list" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>See My Bills</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.secondaryBtn,
            {
              backgroundColor: showMyBills ? colors.card : colors.primary,
              borderColor: showMyBills ? colors.border : colors.primary,
            },
          ]}
          onPress={() => router.push("/bill/new")}
          activeOpacity={0.85}
        >
          <Feather
            name="plus-circle"
            size={18}
            color={showMyBills ? colors.primary : "#fff"}
          />
          <Text
            style={[
              styles.secondaryBtnText,
              { color: showMyBills ? colors.primary : "#fff" },
            ]}
          >
            Add Bill
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ghostBtn, { borderColor: colors.border }]}
          onPress={() => router.push("/(tabs)/join")}
          activeOpacity={0.85}
        >
          <Feather name="user-plus" size={18} color={colors.foreground} />
          <Text style={[styles.ghostBtnText, { color: colors.foreground }]}>
            Join Bill
          </Text>
        </TouchableOpacity>
      </View>

      {!user && (
        <View style={styles.footer}>
          <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
            <Text style={[styles.footerLink, { color: colors.mutedForeground }]}>
              Already have an account?{" "}
              <Text style={{ color: colors.primary }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={showNamePrompt} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.modalIconWrap, { backgroundColor: colors.primarySoft }]}>
              <Feather name="user" size={26} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              What's your name?
            </Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              We'll use this to identify you on bills you create or join.
            </Text>
            <TextInput
              ref={inputRef}
              style={[styles.modalInput, { borderColor: nameInput.trim() ? colors.primary : colors.border, color: colors.foreground }]}
              placeholder="First name"
              placeholderTextColor={colors.mutedForeground}
              value={nameInput}
              onChangeText={setNameInput}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleNameSubmit}
              autoFocus
            />
            <TouchableOpacity
              style={[
                styles.modalConfirmBtn,
                { backgroundColor: nameInput.trim() ? colors.primary : colors.muted },
              ]}
              onPress={handleNameSubmit}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.modalConfirmText,
                  { color: nameInput.trim() ? "#fff" : colors.mutedForeground },
                ]}
              >
                Continue
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
              <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
                Skip for now
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "space-between",
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  appName: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  greeting: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  tagline: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  actions: {
    gap: 12,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1.5,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1.5,
  },
  ghostBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  footer: {
    alignItems: "center",
    paddingTop: 24,
  },
  footerLink: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  modalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  modalSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  modalInput: {
    width: "100%",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  modalConfirmBtn: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  modalConfirmText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  skipBtn: {
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
