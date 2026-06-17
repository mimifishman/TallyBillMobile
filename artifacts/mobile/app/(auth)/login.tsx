import { Feather } from "@expo/vector-icons";
import { useAuth as useClerkAuth, useSSO, useSignIn } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { useAuth } from "@/context/AuthContext";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { PressableScale } from "@/components/PressableScale";

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { continueAsGuest } = useAuth();
  const { isLoaded: clerkLoaded, isSignedIn } = useClerkAuth();
  const { signIn, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();

  useWarmUpBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [secondFactor, setSecondFactor] = useState<"totp" | "phone_code" | "email_code" | null>(null);

  const isPending = fetchStatus === "fetching";

  const pickSecondFactor = (): "totp" | "phone_code" | "email_code" | null => {
    const factors = signIn.supportedSecondFactors ?? [];
    const has = (s: string) => factors.some((f) => f.strategy === s);
    if (has("totp")) return "totp";
    if (has("phone_code")) return "phone_code";
    if (has("email_code")) return "email_code";
    return null;
  };

  const handleEmailLogin = async () => {
    setEmailError("");
    setPasswordError("");
    if (!email) { setEmailError("Please enter your email address"); return; }
    if (!password) { setPasswordError("Please enter your password"); return; }

    const normalizedEmail = email.trim().toLowerCase();

    const routeError = (e: { code?: string; message?: string } | undefined) => {
      const code = (e?.code ?? "").toLowerCase();
      const msg = (e?.message ?? "").toLowerCase();
      if (code.includes("not_found") || code.includes("identifier") || msg.includes("couldn't find") || msg.includes("not found") || msg.includes("no account")) {
        setEmailError("No account found with this email address.");
      } else if (code.includes("password") || code.includes("incorrect") || msg.includes("password") || msg.includes("incorrect")) {
        setPasswordError("Incorrect password. Please try again.");
      } else {
        setPasswordError("Could not sign in. Please try again.");
      }
    };

    try {
      const { error } = await signIn.password({ emailAddress: normalizedEmail, password });
      if (error) { routeError(error); return; }
    } catch (err: unknown) {
      const e = err as { errors?: Array<{ code?: string; message?: string }>; message?: string };
      routeError(e.errors?.[0] ?? { message: e.message });
      return;
    }

    if (signIn.status === "complete") {
      await signIn.finalize({ navigate: async () => {} });
      router.replace("/");
    } else if (signIn.status === "needs_client_trust") {
      await signIn.mfa.sendEmailCode();
    } else if (signIn.status === "needs_second_factor") {
      const strategy = pickSecondFactor();
      if (!strategy) { setPasswordError("Two-factor authentication is required, but no supported method was found."); return; }
      setSecondFactor(strategy);
      setVerificationCode("");
      setCodeError("");
      if (strategy === "phone_code") await signIn.mfa.sendPhoneCode();
      else if (strategy === "email_code") await signIn.mfa.sendEmailCode();
    } else {
      if (__DEV__) console.warn("[signIn unexpected status]", signIn.status);
      setPasswordError("Could not sign in. Please try again.");
    }
  };

  const handleVerify = async () => {
    setCodeError("");
    try {
      let result: { error: { message?: string } | null } | undefined;
      if (signIn.status === "needs_second_factor") {
        if (secondFactor === "totp") result = await signIn.mfa.verifyTOTP({ code: verificationCode });
        else if (secondFactor === "phone_code") result = await signIn.mfa.verifyPhoneCode({ code: verificationCode });
        else if (secondFactor === "email_code") result = await signIn.mfa.verifyEmailCode({ code: verificationCode });
        else { setCodeError("Two-factor authentication is required, but no supported method was found."); return; }
      } else {
        result = await signIn.mfa.verifyEmailCode({ code: verificationCode });
      }
      if (result?.error) { setCodeError("Incorrect code. Please try again."); return; }
      if (signIn.status === "complete") {
        await signIn.finalize({ navigate: () => {} });
        router.replace("/");
      } else {
        setCodeError("Incorrect code. Please try again.");
      }
    } catch {
      setCodeError("Incorrect code. Please try again.");
    }
  };

  const resendSecondFactorCode = async () => {
    if (signIn.status === "needs_second_factor") {
      if (secondFactor === "phone_code") await signIn.mfa.sendPhoneCode();
      else if (secondFactor === "email_code") await signIn.mfa.sendEmailCode();
    } else if (signIn.status === "needs_client_trust") {
      await signIn.mfa.sendEmailCode();
    }
  };

  const handleOAuth = useCallback(
    async (strategy: "oauth_google" | "oauth_apple") => {
      try {
        const { createdSessionId, setActive } = await startSSOFlow({
          strategy,
          redirectUrl: AuthSession.makeRedirectUri({ path: "sso-callback" }),
        });
        if (!createdSessionId || !setActive) return;
        await setActive({ session: createdSessionId, navigate: async () => {} });
        router.replace("/");
      } catch (err: unknown) {
        if (__DEV__) console.warn("[OAuth sign-in error]", err);
        const msg = (() => {
          if (err instanceof Error) return err.message.toLowerCase();
          if (typeof err === "object" && err !== null) {
            const e = err as Record<string, unknown>;
            if (typeof e["message"] === "string") return e["message"].toLowerCase();
          }
          return "";
        })();
        const cancelled = msg.includes("cancel") || msg.includes("dismiss") || msg === "";
        if (cancelled) return;
        const provider = strategy === "oauth_google" ? "Google" : "Apple";
        setPasswordError(`Could not sign in with ${provider}. Check your internet connection and try again.`);
      }
    },
    [startSSOFlow],
  );

  const handleGuest = () => {
    continueAsGuest();
    router.replace("/?prompt=1");
  };

  if (clerkLoaded && isSignedIn) return <Redirect href="/" />;

  const isVerifying = signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor";

  if (isVerifying) {
    const isTOTP = signIn.status === "needs_second_factor" && secondFactor === "totp";
    const isPhoneCode = signIn.status === "needs_second_factor" && secondFactor === "phone_code";
    const tagline = isTOTP ? "Enter the code from your authenticator app" : isPhoneCode ? "Enter the code sent to your phone" : "Enter the code sent to your email";
    const canResend = !isTOTP;
    return (
      <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[styles.formCard, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
            <Feather name="shield" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Verify your identity</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{tagline}</Text>
          <View style={styles.formContent}>
            <View style={[styles.inputWrap, { borderColor: codeError ? colors.destructive : colors.border }]}>
              <Feather name="key" size={18} color={colors.mutedForeground} />
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Verification code" placeholderTextColor={colors.mutedForeground} value={verificationCode} onChangeText={setVerificationCode} keyboardType="numeric" autoFocus />
            </View>
            {!!codeError && <Text style={[styles.errorText, { color: colors.destructive }]}>{codeError}</Text>}
            <PressableScale style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleVerify} disabled={isPending}>
              {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify</Text>}
            </PressableScale>
            {canResend && <TouchableOpacity onPress={() => { void resendSecondFactorCode(); }} style={styles.linkBtn}><Text style={[styles.linkText, { color: colors.mutedForeground }]}>Resend code</Text></TouchableOpacity>}
            <TouchableOpacity onPress={() => { setSecondFactor(null); signIn.reset(); }} style={styles.linkBtn}><Text style={[styles.linkText, { color: colors.mutedForeground }]}>Start over</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const canGoBack = router.canGoBack();

  return (
    <View style={styles.flex}>
      <LinearGradient colors={colors.gradientPrimary} style={styles.gradient}>
        <View style={{ height: insets.top + 16 }} />
        {canGoBack && (
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="arrow-left" size={22} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        )}
        <View style={styles.brandArea}>
          <Text style={styles.wordmark}>TallyBill</Text>
          <Text style={styles.tagline}>Split bills. Not friendships.</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={[styles.formSheet, { backgroundColor: colors.card }]}
          contentContainerStyle={[styles.formCard, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.formTitle, { color: colors.foreground }]}>Welcome back!</Text>
          <Text style={[styles.formSub, { color: colors.mutedForeground }]}>Your friends are waiting.</Text>

          <View style={styles.socialSection}>
            <TouchableOpacity style={[styles.socialBtn, { borderColor: colors.border, backgroundColor: "#fff" }]} onPress={() => { void handleOAuth("oauth_google"); }} activeOpacity={0.8}>
              <Text style={styles.googleG}>G</Text>
              <Text style={[styles.socialBtnText, { color: colors.foreground }]}>Continue with Google</Text>
            </TouchableOpacity>
            {Platform.OS === "ios" && (
              <TouchableOpacity style={[styles.socialBtn, { borderColor: colors.border, backgroundColor: "#000" }]} onPress={() => { void handleOAuth("oauth_apple"); }} activeOpacity={0.8}>
                <Feather name="smartphone" size={18} color="#fff" />
                <Text style={[styles.socialBtnText, { color: "#fff" }]}>Continue with Apple</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or sign in with email</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.formContent}>
            <View style={[styles.inputWrap, { borderColor: emailError ? colors.destructive : colors.border }]}>
              <Feather name="mail" size={18} color={colors.mutedForeground} />
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Email" placeholderTextColor={colors.mutedForeground} value={email} onChangeText={(t) => { setEmail(t); setEmailError(""); }} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            </View>
            {!!emailError && <Text style={[styles.errorText, { color: colors.destructive }]}>{emailError}</Text>}

            <View style={[styles.inputWrap, { borderColor: passwordError ? colors.destructive : colors.border }]}>
              <Feather name="lock" size={18} color={colors.mutedForeground} />
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Password" placeholderTextColor={colors.mutedForeground} value={password} onChangeText={(t) => { setPassword(t); setPasswordError(""); }} secureTextEntry={!showPassword} />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)}><Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            {!!passwordError && <Text style={[styles.errorText, { color: colors.destructive }]}>{passwordError}</Text>}

            <TouchableOpacity onPress={() => router.push("/(auth)/forgot-password")} style={styles.forgotBtn}>
              <Text style={[styles.forgotText, { color: colors.primary }]}>Forgot password?</Text>
            </TouchableOpacity>

            <PressableScale style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleEmailLogin} disabled={isPending}>
              {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign In</Text>}
            </PressableScale>

            <TouchableOpacity onPress={() => router.push("/(auth)/register")} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: colors.mutedForeground }]}>No account? <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Register</Text></Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.divider, { marginVertical: 20 }]}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity style={[styles.ghostBtn, { borderColor: colors.border }]} onPress={handleGuest} activeOpacity={0.7}>
            <Feather name="user" size={16} color={colors.mutedForeground} />
            <Text style={[styles.ghostBtnText, { color: colors.mutedForeground }]}>Continue without account</Text>
          </TouchableOpacity>
          <Text style={[styles.guestNote, { color: colors.mutedForeground }]}>Your bills stay here. Sign up to take them anywhere.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { paddingBottom: 40 },
  backBtn: { position: "absolute", top: SPACING.lg, left: SPACING.xl, zIndex: 10, padding: SPACING.xs },
  brandArea: { alignItems: "center", paddingTop: SPACING.xl, paddingBottom: SPACING.sm, gap: SPACING.sm },
  wordmark: { fontSize: FONT_SIZE.wordmark, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5 },
  tagline: { fontSize: 16, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.85)" }, // TODO: one-off
  formSheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    marginTop: -RADIUS.xl,
  },
  formCard: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxxl, gap: 0 },
  formTitle: { fontSize: FONT_SIZE.heading, fontFamily: "Inter_700Bold", marginBottom: SPACING.xs },
  formSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: SPACING.xxl }, // TODO: one-off
  iconCircle: { width: 64, height: 64, borderRadius: RADIUS.xl, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: SPACING.lg },
  cardTitle: { fontSize: FONT_SIZE.heading, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 6 },
  cardSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 28 }, // TODO: one-off
  socialSection: { gap: 10 },
  socialBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: RADIUS.full, paddingVertical: 15, gap: 10 },
  googleG: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#4285F4" }, // TODO: one-off
  socialBtnText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold" },
  divider: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginVertical: SPACING.xl },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontFamily: "Inter_400Regular" }, // TODO: one-off
  formContent: { gap: SPACING.md },
  inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  input: { flex: 1, fontSize: FONT_SIZE.body, fontFamily: "Inter_400Regular" },
  primaryBtn: { borderRadius: RADIUS.full, paddingVertical: 17, alignItems: "center", marginTop: SPACING.xs },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }, // TODO: one-off
  forgotBtn: { alignSelf: "flex-end", paddingVertical: 2 },
  forgotText: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold" },
  linkBtn: { alignItems: "center", paddingVertical: SPACING.sm },
  linkText: { fontSize: 14, fontFamily: "Inter_400Regular" }, // TODO: one-off
  ghostBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderRadius: RADIUS.full, paddingVertical: 15, gap: SPACING.sm },
  ghostBtnText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_500Medium" },
  guestNote: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: SPACING.md, paddingHorizontal: SPACING.xl, lineHeight: 18 }, // TODO: one-off
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -SPACING.xs }, // TODO: one-off
});
