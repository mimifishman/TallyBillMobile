import { Feather } from "@expo/vector-icons";
import { useAuth as useClerkAuth, useSSO, useSignUp } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { useAuth } from "@/context/AuthContext";
import { RADIUS } from "@/constants/styles";

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e["message"] === "string") return e["message"];
    const errs = e["errors"];
    if (Array.isArray(errs) && errs.length > 0) {
      const first = errs[0] as Record<string, unknown>;
      return typeof first["longMessage"] === "string" ? first["longMessage"] : typeof first["message"] === "string" ? first["message"] : "";
    }
  }
  return "";
}

function extractErrorCode(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const errs = e["errors"];
    if (Array.isArray(errs) && errs.length > 0) {
      const first = errs[0] as Record<string, unknown>;
      return typeof first["code"] === "string" ? first["code"] : "";
    }
  }
  return "";
}

function isDuplicateEmail(err: unknown): boolean {
  const msg = extractErrorMessage(err).toLowerCase();
  const code = extractErrorCode(err).toLowerCase();
  return msg.includes("already") || msg.includes("in use") || msg.includes("taken") || msg.includes("exists") || code.includes("exists") || code.includes("taken") || code.includes("duplicate");
}

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { continueAsGuest } = useAuth();
  const { isLoaded: clerkLoaded, isSignedIn } = useClerkAuth();
  const { signUp, fetchStatus } = useSignUp();
  const { startSSOFlow } = useSSO();

  useWarmUpBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [showVerification, setShowVerification] = useState(false);

  const isPending = fetchStatus === "fetching";

  const routeSignUpError = (error: { code?: string; message?: string }) => {
    const msg = (error.message ?? "").toLowerCase();
    const code = (error.code ?? "").toLowerCase();
    const isConflict = msg.includes("already") || msg.includes("in use") || msg.includes("taken") || msg.includes("exists") || code.includes("exists") || code.includes("taken");
    if (isConflict) { showDuplicateAlert(); return; }
    if (code.includes("password") || msg.includes("password") || msg.includes("pwned")) {
      setPasswordError(passwordErrorText(code, msg));
      return;
    }
    if (code.includes("identifier") || code.includes("email") || msg.includes("email") || msg.includes("identifier")) {
      setEmailError(emailErrorText(code, msg));
      return;
    }
    Alert.alert("Registration Failed", "Could not create account. Please try again.");
  };

  const passwordErrorText = (code: string, msg: string): string => {
    if (code.includes("pwned") || msg.includes("pwned") || msg.includes("data breach")) return "This password has appeared in a data breach. Please choose a different one.";
    if (code.includes("too_short") || msg.includes("too short") || msg.includes("at least")) return "Password must be at least 8 characters.";
    if (code.includes("not_strong") || msg.includes("not strong") || msg.includes("weak") || msg.includes("common")) return "Please choose a stronger password.";
    if (code.includes("too_long") || msg.includes("too long")) return "Password is too long. Please choose a shorter one.";
    return "That password isn't allowed. Please choose a different one.";
  };

  const emailErrorText = (code: string, msg: string): string => {
    if (code.includes("format_invalid") || msg.includes("invalid") || msg.includes("not a valid")) return "Please enter a valid email address.";
    if (code.includes("not_allowed") || msg.includes("not allowed")) return "This email address isn't allowed.";
    return "Please check your email address and try again.";
  };

  const handleRegister = async () => {
    setEmailError("");
    setPasswordError("");
    setConfirmPasswordError("");
    if (!email) { setEmailError("Please enter your email address"); return; }
    if (!password) { setPasswordError("Please enter a password"); return; }
    if (password.length < 8) { setPasswordError("Password must be at least 8 characters"); return; }
    if (!confirmPassword) { setConfirmPasswordError("Please confirm your password"); return; }
    if (password !== confirmPassword) { setConfirmPasswordError("Passwords do not match"); return; }
    try {
      const { error } = await signUp.password({ emailAddress: email.trim().toLowerCase(), password });
      if (error) { routeSignUpError(error); return; }
      await signUp.verifications.sendEmailCode();
      setShowVerification(true);
    } catch (err: unknown) {
      if (isDuplicateEmail(err)) {
        showDuplicateAlert();
      } else {
        const errors = (err as { errors?: Array<{ code?: string; message?: string }> })?.errors;
        if (errors && errors.length > 0 && errors[0]) routeSignUpError(errors[0]);
        else Alert.alert("Registration Failed", "Could not create account. Please try again.");
      }
    }
  };

  const handleVerify = async () => {
    setCodeError("");
    try {
      await signUp.verifications.verifyEmailCode({ code: verificationCode });
      if (signUp.status === "complete") {
        await signUp.finalize({ navigate: ({ session }) => { if (session?.currentTask) return; router.replace("/(auth)/name"); } });
      } else {
        setCodeError("Incorrect code. Please try again.");
      }
    } catch {
      setCodeError("Incorrect code. Please try again.");
    }
  };

  const handleOAuth = useCallback(
    async (strategy: "oauth_google" | "oauth_apple") => {
      try {
        const { createdSessionId, setActive, signUp: ssoSignUp } = await startSSOFlow({ strategy, redirectUrl: AuthSession.makeRedirectUri({ path: "sso-callback" }) });
        if (!createdSessionId || !setActive) return;
        const isNewUser = ssoSignUp != null && ssoSignUp.status === "complete";
        await setActive({ session: createdSessionId, navigate: async ({ session }) => { if (session?.currentTask) return; if (isNewUser) router.replace("/(auth)/name"); else router.replace("/"); } });
      } catch (err: unknown) {
        if (__DEV__) console.warn("[OAuth sign-up error]", err);
        const msg = extractErrorMessage(err).toLowerCase();
        const cancelled = msg.includes("cancel") || msg.includes("dismiss") || msg.includes("user closed") || msg === "";
        if (cancelled) return;
        if (isDuplicateEmail(err)) showDuplicateAlert();
        else { const provider = strategy === "oauth_google" ? "Google" : "Apple"; setEmailError(`Could not sign up with ${provider}. Check your internet connection and try again.`); }
      }
    },
    [startSSOFlow],
  );

  const showDuplicateAlert = () => {
    Alert.alert("Account already exists", "An account with this email already exists. Try signing in instead.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign In", onPress: () => router.replace("/(auth)/login") },
    ]);
  };

  const handleGuest = () => {
    continueAsGuest();
    router.replace("/?prompt=1");
  };

  const isPostSignupVerification = showVerification && signUp.status === "missing_requirements" && signUp.unverifiedFields.includes("email_address") && signUp.missingFields.length === 0;

  if (clerkLoaded && isSignedIn && !isPostSignupVerification) return <Redirect href="/" />;

  const abandonSignUp = () => { setShowVerification(false); setVerificationCode(""); setCodeError(""); };

  if (isPostSignupVerification) {
    return (
      <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[styles.verifyCard, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={abandonSignUp} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
            <Feather name="mail" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Check your email</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>We sent a verification code to {email}</Text>
          <View style={styles.formContent}>
            <View style={[styles.inputWrap, { borderColor: codeError ? colors.destructive : colors.border }]}>
              <Feather name="key" size={18} color={colors.mutedForeground} />
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Enter verification code" placeholderTextColor={colors.mutedForeground} value={verificationCode} onChangeText={(t) => { setVerificationCode(t); setCodeError(""); }} keyboardType="numeric" autoFocus />
            </View>
            {!!codeError && <Text style={[styles.errorText, { color: colors.destructive }]}>{codeError}</Text>}
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleVerify} disabled={isPending} activeOpacity={0.8}>
              {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify Email</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => signUp.verifications.sendEmailCode()} style={styles.linkBtn}><Text style={[styles.linkText, { color: colors.mutedForeground }]}>Resend code</Text></TouchableOpacity>
            <TouchableOpacity onPress={abandonSignUp} style={styles.linkBtn}><Text style={[styles.linkText, { color: colors.mutedForeground }]}>Wrong email? <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Use a different email</Text></Text></TouchableOpacity>
          </View>
          <View nativeID="clerk-captcha" />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.flex}>
      <LinearGradient colors={["#F59E0B", "#D97706"]} style={styles.gradient}>
        <View style={{ height: insets.top + 16 }} />
        <TouchableOpacity style={styles.backBtnGradient} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={22} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
        <View style={styles.brandArea}>
          <Text style={styles.wordmark}>TallyBill</Text>
          <Text style={styles.tagline}>Takes 30 seconds. We timed it.</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={[styles.formSheet, { backgroundColor: colors.card }]} contentContainerStyle={[styles.formCard, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <Text style={[styles.formTitle, { color: colors.foreground }]}>Create Account</Text>
          <Text style={[styles.formSub, { color: colors.mutedForeground }]}>Start splitting bills with friends.</Text>

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
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or sign up with email</Text>
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
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Password (min. 8 characters)" placeholderTextColor={colors.mutedForeground} value={password} onChangeText={(t) => { setPassword(t); setPasswordError(""); setConfirmPasswordError(""); }} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)}><Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            {!!passwordError && <Text style={[styles.errorText, { color: colors.destructive }]}>{passwordError}</Text>}

            <View style={[styles.inputWrap, { borderColor: confirmPasswordError ? colors.destructive : colors.border }]}>
              <Feather name="lock" size={18} color={colors.mutedForeground} />
              <TextInput style={[styles.input, { color: colors.foreground }]} placeholder="Confirm password" placeholderTextColor={colors.mutedForeground} value={confirmPassword} onChangeText={(t) => { setConfirmPassword(t); setConfirmPasswordError(""); }} secureTextEntry={!showConfirmPassword} autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity onPress={() => setShowConfirmPassword((v) => !v)}><Feather name={showConfirmPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
            {!!confirmPasswordError && <Text style={[styles.errorText, { color: colors.destructive }]}>{confirmPasswordError}</Text>}

            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleRegister} disabled={isPending} activeOpacity={0.8}>
              {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create Account</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: colors.mutedForeground }]}>Already have an account? <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Sign in</Text></Text>
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

          <View nativeID="clerk-captcha" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { paddingBottom: 40 },
  backBtnGradient: { position: "absolute", top: 16, left: 20, zIndex: 10, padding: 4 },
  backBtn: { marginBottom: 24, alignSelf: "flex-start", padding: 4 },
  brandArea: { alignItems: "center", paddingTop: 20, paddingBottom: 8, gap: 8 },
  wordmark: { fontSize: 34, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.5 },
  tagline: { fontSize: 16, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.85)" },
  formSheet: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, marginTop: -RADIUS.xl },
  formCard: { paddingHorizontal: 24, paddingTop: 32, gap: 0 },
  formTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 4 },
  formSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 24 },
  verifyCard: { paddingHorizontal: 24, flexGrow: 1 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  cardTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 6 },
  cardSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 28 },
  socialSection: { gap: 10 },
  socialBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: RADIUS.full, paddingVertical: 15, gap: 10 },
  googleG: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#4285F4" },
  socialBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  divider: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  formContent: { gap: 12 },
  inputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  primaryBtn: { borderRadius: RADIUS.full, paddingVertical: 17, alignItems: "center", marginTop: 4 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  linkBtn: { alignItems: "center", paddingVertical: 8 },
  linkText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  ghostBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderRadius: RADIUS.full, paddingVertical: 15, gap: 8 },
  ghostBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: -4 },
});
