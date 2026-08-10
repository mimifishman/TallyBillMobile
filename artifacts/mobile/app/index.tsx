import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { AutoFocusTextInput } from "@/components/AutoFocusTextInput";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";

export default function IndexScreen() {
  const { user, isLoading, isGuest, guestName, saveGuestName } = useAuth();
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [nameInput, setNameInput] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user && !isGuest) {
      router.replace("/(auth)/login");
      return;
    }
    if (prompt === "1" && guestName === null) {
      setShowNamePrompt(true);
    }
  }, [isLoading, user, isGuest, prompt, guestName]);

  const handleNameSubmit = async () => {
    await saveGuestName(nameInput.trim());
    setShowNamePrompt(false);
  };

  const handleSkip = async () => {
    await saveGuestName("");
    setShowNamePrompt(false);
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const displayName = user
    ? (user.firstName ?? user.displayName ?? null)
    : (guestName || null);
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
        <View style={[styles.logoWrap, { backgroundColor: colors.primary }]}>
          <Image
            source={require("@/assets/images/splash-icon.png")}
            style={{ width: 60, height: 60 }}
            resizeMode="contain"
          />
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
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.replace("/(tabs)/bills")}
          activeOpacity={0.85}
        >
          <Feather name="list" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>See My Bills</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/bill/new")}
          activeOpacity={0.85}
        >
          <Feather name="plus-circle" size={18} color={colors.primary} />
          <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Add Bill</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ghostBtn, { borderColor: colors.border }]}
          onPress={() => router.push("/(tabs)/join")}
          activeOpacity={0.85}
        >
          <Feather name="user-plus" size={18} color={colors.foreground} />
          <Text style={[styles.ghostBtnText, { color: colors.foreground }]}>Join Bill</Text>
        </TouchableOpacity>

        {user && (
          <TouchableOpacity
            style={[styles.ghostBtn, { borderColor: colors.border }]}
            onPress={() => router.push("/(tabs)/circles")}
            activeOpacity={0.85}
          >
            <Feather name="plus-circle" size={18} color={colors.foreground} />
            <Text style={[styles.ghostBtnText, { color: colors.foreground }]}>Add Circle</Text>
          </TouchableOpacity>
        )}
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

      <TouchableOpacity
        style={[styles.settingsBtn, { top: insets.top + 12, backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push("/(tabs)/settings")}
        activeOpacity={0.8}
      >
        <Feather name="settings" size={20} color={colors.mutedForeground} />
      </TouchableOpacity>

      <Modal visible={showNamePrompt} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <View style={[styles.modalIconWrap, { backgroundColor: colors.primarySoft }]}>
              <Feather name="user" size={26} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              What's your name?
            </Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              We'll use this to identify you on bills you create or join.
            </Text>
            <AutoFocusTextInput
              ref={inputRef}
              style={[
                styles.modalInput,
                {
                  borderColor: nameInput.trim() ? colors.primary : colors.border,
                  color: colors.foreground,
                },
              ]}
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
    paddingHorizontal: SPACING.xl,
    justifyContent: "space-between",
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  appName: {
    fontSize: FONT_SIZE.wordmark,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  greeting: {
    fontSize: FONT_SIZE.title,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  tagline: {
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  actions: { gap: SPACING.md },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16, // TODO: one-off
    fontFamily: "Inter_600SemiBold",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    borderWidth: 1.5,
  },
  secondaryBtnText: {
    fontSize: 16, // TODO: one-off
    fontFamily: "Inter_600SemiBold",
  },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    borderWidth: 1.5,
  },
  ghostBtnText: {
    fontSize: 16, // TODO: one-off
    fontFamily: "Inter_600SemiBold",
  },
  footer: {
    alignItems: "center",
    paddingTop: SPACING.xxl,
  },
  footerLink: {
    fontSize: 14, // TODO: one-off
    fontFamily: "Inter_400Regular",
  },
  settingsBtn: {
    position: "absolute",
    right: SPACING.xl,
    width: 44,
    height: 44,
    borderRadius: 22, // TODO: one-off (circular: half of 44px)
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xxl,
  },
  modalCard: {
    width: "100%",
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACING.xxl,
    alignItems: "center",
    gap: SPACING.md,
  },
  modalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xs,
  },
  modalTitle: {
    fontSize: 20, // TODO: one-off
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  modalSub: {
    fontSize: 14, // TODO: one-off
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  modalInput: {
    width: "100%",
    borderWidth: 1.5,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    fontSize: 16, // TODO: one-off
    fontFamily: "Inter_400Regular",
    marginTop: SPACING.xs,
  },
  modalConfirmBtn: {
    width: "100%",
    borderRadius: RADIUS.sm,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: SPACING.xs,
  },
  modalConfirmText: {
    fontSize: 16, // TODO: one-off
    fontFamily: "Inter_600SemiBold",
  },
  skipBtn: { paddingVertical: SPACING.sm },
  skipText: {
    fontSize: 14, // TODO: one-off
    fontFamily: "Inter_400Regular",
  },
});
