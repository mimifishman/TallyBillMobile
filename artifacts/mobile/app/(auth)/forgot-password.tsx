import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";

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
    if (!normalizedEmail) { setEmailError("Please enter your email address"); return; }

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
    <View style={styles.flex}>
      <LinearGradient colors={colors.gradientPrimary} style={styles.gradient}>
        <View style={{ height: insets.top + 16 }} />
        <TouchableOpacity style={styles.backBtnGradient} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={22} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        <View style={styles.brandArea}>
          <Text style={styles.wordmark}>TallyBill</Text>
          <Text style={styles.tagline}>Forgot something? No worries.</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={[styles.formSheet, { backgroundColor: colors.card }]}
          contentContainerStyle={[styles.formCard, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
            <Feather name="mail" size={28} color={colors.primaryText} />
          </View>

          <Text style={[styles.formTitle, { color: colors.foreground }]}>Reset your password</Text>
          <Text style={[styles.formSub, { color: colors.mutedForeground }]}>
            Enter your email and we'll send you a 6-digit code.
          </Text>

          {oauthProvider ? (
            <View style={[styles.oauthCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
                <Feather name="shield" size={28} color={colors.primaryText} />
              </View>
              <Text style={[styles.oauthTitle, { color: colors.foreground }]}>No password needed</Text>
              <Text style={[styles.oauthSub, { color: colors.mutedForeground }]}>
                This account signs in with {oauthProvider}. Tap below to use the{" "}
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>Continue with {oauthProvider}</Text> button.
              </Text>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.replace("/(auth)/login")} activeOpacity={0.8}>
                <Text style={styles.primaryBtnText}>Back to Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setOauthProvider(null); setEmail(""); }} style={styles.linkBtn}>
                <Text style={[styles.linkText, { color: colors.mutedForeground }]}>Try a different email</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.formContent]}>
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
                  <Feather name="alert-circle" size={15} color={colors.destructive} />
                  <Text style={[styles.errorText, { color: colors.destructive }]}>{emailError}</Text>
                </View>
              )}

              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: isPending ? 0.7 : 1 }]} onPress={handleSendCode} disabled={isPending} activeOpacity={0.8}>
                {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send Reset Code</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.back()} style={styles.linkBtn}>
                <Text style={[styles.linkText, { color: colors.mutedForeground }]}>Remembered it? <Text style={{ color: colors.primaryText, fontFamily: "Inter_600SemiBold" }}>Sign In</Text></Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { paddingBottom: 40 },
  backBtnGradient: { position: "absolute", top: SPACING.lg, left: SPACING.xl, zIndex: 10, padding: SPACING.xs },
  brandArea: { alignItems: "center", paddingTop: SPACING.xl, paddingBottom: SPACING.sm, gap: SPACING.sm },
  wordmark: { fontSize: FONT_SIZE.wordmark, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5 },
  tagline: { fontSize: 16, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.92)" }, // TODO: one-off
  formSheet: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, marginTop: -RADIUS.xl },
  formCard: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxxl, gap: SPACING.xxl },
  iconCircle: { width: 64, height: 64, borderRadius: RADIUS.xl, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  formTitle: { fontSize: FONT_SIZE.heading, fontFamily: "Inter_700Bold", textAlign: "center" },
  formSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21, marginTop: -SPACING.md }, // TODO: one-off
  formContent: { gap: SPACING.md },
  oauthCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.xxl, alignItems: "center", gap: SPACING.md },
  oauthTitle: { fontSize: 18, fontFamily: "Inter_700Bold" }, // TODO: one-off
  oauthSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 }, // TODO: one-off
  inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  input: { flex: 1, fontSize: FONT_SIZE.body, fontFamily: "Inter_400Regular" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.sm, borderWidth: 1, padding: SPACING.md },
  errorText: { flex: 1, fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular" },
  primaryBtn: { borderRadius: RADIUS.full, paddingVertical: 17, alignItems: "center", width: "100%" },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }, // TODO: one-off
  linkBtn: { alignItems: "center", paddingVertical: SPACING.xs },
  linkText: { fontSize: 14, fontFamily: "Inter_400Regular" }, // TODO: one-off
});
