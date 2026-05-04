import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<string | null>(null);

  const handleSendCode = async () => {
    setEmailError("");
    setOauthProvider(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setEmailError("Please enter your email address");
      return;
    }

    setIsPending(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "OAUTH_ACCOUNT") {
          const match = (data.error as string).match(/(Google|Apple)/);
          setOauthProvider(match ? match[1] : "Google");
        } else {
          setEmailError(data.error || "Something went wrong. Please try again.");
        }
        return;
      }
      router.push({ pathname: "/(auth)/reset-password", params: { email: normalizedEmail } });
    } catch {
      setEmailError("Network error. Please check your connection and try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Forgot Password</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
          <Feather name="mail" size={32} color={colors.primary} />
        </View>

        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Enter your email address and we'll send you a 6-digit code to reset your password.
        </Text>

        {oauthProvider ? (
          <View style={[styles.oauthCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.oauthIconWrap, { backgroundColor: "rgba(31,136,61,0.1)" }]}>
              <Feather name="shield" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.oauthTitle, { color: colors.foreground }]}>
              No password needed
            </Text>
            <Text style={[styles.oauthSub, { color: colors.mutedForeground }]}>
              This account signs in with {oauthProvider}. Tap below to go back and use the{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>
                Continue with {oauthProvider}
              </Text>{" "}
              button.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.replace("/(auth)/login")}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Back to Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setOauthProvider(null); setEmail(""); }}
              style={styles.linkBtn}
            >
              <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
                Try a different email
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Email Address</Text>
            <View style={[styles.inputWrap, { borderColor: emailError ? colors.destructive : colors.border }]}>
              <Feather name="mail" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={(v) => { setEmail(v); setEmailError(""); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="send"
                onSubmitEditing={handleSendCode}
              />
            </View>
            {!!emailError && (
              <View style={[styles.errorBox, { backgroundColor: "rgba(220,38,38,0.08)", borderColor: "rgba(220,38,38,0.2)" }]}>
                <Feather name="alert-circle" size={15} color="#dc2626" />
                <Text style={styles.errorText}>{emailError}</Text>
              </View>
            )}
          </View>
        )}

        {!oauthProvider && (
          <>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: isPending ? 0.7 : 1 }]}
              onPress={handleSendCode}
              disabled={isPending}
              activeOpacity={0.8}
            >
              {isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Send Reset Code</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
                Remembered it?{" "}
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  sub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  card: { borderRadius: 16, borderWidth: 1, padding: 20 },
  oauthCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  oauthIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  oauthTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  oauthSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#dc2626" },
  primaryBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", width: "100%" },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  linkBtn: { alignItems: "center", paddingVertical: 4 },
  linkText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
