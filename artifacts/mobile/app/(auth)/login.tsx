import { Feather } from "@expo/vector-icons";
import { useAuth as useClerkAuth, useSSO, useSignIn } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
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

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
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
  const [secondFactor, setSecondFactor] = useState<
    "totp" | "phone_code" | "email_code" | null
  >(null);

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
      if (
        code.includes("not_found") ||
        code.includes("identifier") ||
        msg.includes("couldn't find") ||
        msg.includes("not found") ||
        msg.includes("no account")
      ) {
        setEmailError("No account found with this email address.");
      } else if (
        code.includes("password") ||
        code.includes("incorrect") ||
        msg.includes("password") ||
        msg.includes("incorrect")
      ) {
        setPasswordError("Incorrect password. Please try again.");
      } else {
        setPasswordError("Could not sign in. Please try again.");
      }
    };

    try {
      const { error } = await signIn.password({
        emailAddress: normalizedEmail,
        password,
      });
      if (error) {
        routeError(error);
        return;
      }
    } catch (err: unknown) {
      const e = err as { errors?: Array<{ code?: string; message?: string }>; message?: string };
      routeError(e.errors?.[0] ?? { message: e.message });
      return;
    }

    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ session }) => {
          if (session?.currentTask) return;
          router.replace("/(tabs)/bills");
        },
      });
    } else if (signIn.status === "needs_client_trust") {
      await signIn.mfa.sendEmailCode();
    } else if (signIn.status === "needs_second_factor") {
      const strategy = pickSecondFactor();
      if (!strategy) {
        setPasswordError(
          "Two-factor authentication is required, but no supported method was found.",
        );
        return;
      }
      setSecondFactor(strategy);
      setVerificationCode("");
      setCodeError("");
      if (strategy === "phone_code") {
        await signIn.mfa.sendPhoneCode();
      } else if (strategy === "email_code") {
        await signIn.mfa.sendEmailCode();
      }
    } else {
      if (__DEV__) {
        console.warn("[signIn unexpected status]", signIn.status);
      }
      setPasswordError("Could not sign in. Please try again.");
    }
  };

  const handleVerify = async () => {
    setCodeError("");
    try {
      let result: { error: { message?: string } | null } | undefined;
      if (signIn.status === "needs_second_factor") {
        if (secondFactor === "totp") {
          result = await signIn.mfa.verifyTOTP({ code: verificationCode });
        } else if (secondFactor === "phone_code") {
          result = await signIn.mfa.verifyPhoneCode({ code: verificationCode });
        } else if (secondFactor === "email_code") {
          result = await signIn.mfa.verifyEmailCode({ code: verificationCode });
        } else {
          setCodeError(
            "Two-factor authentication is required, but no supported method was found.",
          );
          return;
        }
      } else {
        result = await signIn.mfa.verifyEmailCode({ code: verificationCode });
      }
      if (result?.error) {
        setCodeError("Incorrect code. Please try again.");
        return;
      }
      if (signIn.status === "complete") {
        await signIn.finalize({
          navigate: () => {},
        });
        router.replace("/(tabs)/bills");
      } else {
        setCodeError("Incorrect code. Please try again.");
      }
    } catch {
      setCodeError("Incorrect code. Please try again.");
    }
  };

  const resendSecondFactorCode = async () => {
    if (signIn.status === "needs_second_factor") {
      if (secondFactor === "phone_code") {
        await signIn.mfa.sendPhoneCode();
      } else if (secondFactor === "email_code") {
        await signIn.mfa.sendEmailCode();
      }
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
        await setActive({
          session: createdSessionId,
          navigate: async ({ session }) => {
            if (session?.currentTask) return;
            router.replace("/(tabs)/bills");
          },
        });
      } catch (err: unknown) {
        if (__DEV__) {
          console.warn("[OAuth sign-in error]", err);
        }
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
        setPasswordError(
          `Could not sign in with ${provider}. Check your internet connection and try again.`,
        );
      }
    },
    [startSSOFlow],
  );

  const handleGuest = () => {
    continueAsGuest();
    router.replace("/bill/new");
  };

  if (clerkLoaded && isSignedIn) {
    return <Redirect href="/(tabs)/bills" />;
  }

  const isVerifying =
    signIn.status === "needs_client_trust" ||
    signIn.status === "needs_second_factor";

  if (isVerifying) {
    const isTOTP =
      signIn.status === "needs_second_factor" && secondFactor === "totp";
    const isPhoneCode =
      signIn.status === "needs_second_factor" && secondFactor === "phone_code";
    const tagline = isTOTP
      ? "Enter the code from your authenticator app"
      : isPhoneCode
        ? "Enter the code sent to your phone"
        : "Enter the code sent to your email";
    const canResend = !isTOTP;
    return (
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.container,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 },
          ]}
        >
          <View style={styles.header}>
            <View style={[styles.logoWrap, { backgroundColor: "rgba(31,136,61,0.1)" }]}>
              <Feather name="shield" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.appName, { color: colors.foreground }]}>Verify your identity</Text>
            <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
              {tagline}
            </Text>
          </View>
          <View style={styles.form}>
            <View style={[styles.inputWrap, { borderColor: colors.border }]}>
              <Feather name="key" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Verification code"
                placeholderTextColor={colors.mutedForeground}
                value={verificationCode}
                onChangeText={setVerificationCode}
                keyboardType="numeric"
                autoFocus
              />
            </View>
            {!!codeError && (
              <Text style={[styles.errorText, { color: colors.destructive }]}>
                {codeError}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleVerify}
              disabled={isPending}
              activeOpacity={0.8}
            >
              {isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify</Text>
              )}
            </TouchableOpacity>
            {canResend && (
              <TouchableOpacity
                onPress={() => { void resendSecondFactorCode(); }}
                style={styles.linkBtn}
              >
                <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
                  Resend code
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => { setSecondFactor(null); signIn.reset(); }}
              style={styles.linkBtn}
            >
              <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
                Start over
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={[styles.logoWrap, { backgroundColor: "rgba(31,136,61,0.1)" }]}>
            <Feather name="file-text" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.appName, { color: colors.foreground }]}>TallyBill</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Split bills, not friendships
          </Text>
        </View>

        <View style={styles.socialSection}>
          <TouchableOpacity
            style={[styles.socialBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => { void handleOAuth("oauth_google"); }}
            activeOpacity={0.8}
          >
            <Text style={styles.googleG}>G</Text>
            <Text style={[styles.socialBtnText, { color: colors.foreground }]}>
              Continue with Google
            </Text>
          </TouchableOpacity>

          {Platform.OS === "ios" && (
            <TouchableOpacity
              style={[styles.socialBtn, { borderColor: colors.border, backgroundColor: "#000" }]}
              onPress={() => { void handleOAuth("oauth_apple"); }}
              activeOpacity={0.8}
            >
              <Feather name="smartphone" size={18} color="#fff" />
              <Text style={[styles.socialBtnText, { color: "#fff" }]}>
                Continue with Apple
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>
            or sign in with email
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <View style={styles.form}>
          <View style={[styles.inputWrap, { borderColor: emailError ? colors.destructive : colors.border }]}>
            <Feather name="mail" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Email"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={(t) => { setEmail(t); setEmailError(""); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {!!emailError && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>{emailError}</Text>
          )}

          <View style={[styles.inputWrap, { borderColor: passwordError ? colors.destructive : colors.border }]}>
            <Feather name="lock" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Password"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={(t) => { setPassword(t); setPasswordError(""); }}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
              <Feather
                name={showPassword ? "eye-off" : "eye"}
                size={18}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
          {!!passwordError && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>{passwordError}</Text>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleEmailLogin}
            disabled={isPending}
            activeOpacity={0.8}
          >
            {isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/(auth)/register")}
            style={styles.linkBtn}
          >
            <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
              No account?{" "}
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                Register
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.divider, { marginVertical: 20 }]}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <TouchableOpacity
          style={[styles.ghostBtn, { borderColor: colors.border }]}
          onPress={handleGuest}
          activeOpacity={0.7}
        >
          <Feather name="user" size={16} color={colors.mutedForeground} />
          <Text style={[styles.ghostBtnText, { color: colors.mutedForeground }]}>
            Continue without account
          </Text>
        </TouchableOpacity>

        <Text style={[styles.guestNote, { color: colors.mutedForeground }]}>
          Without an account you won't be able to see your bill history
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
    gap: 8,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  appName: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  socialSection: {
    gap: 10,
  },
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 10,
  },
  googleG: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#4285F4",
  },
  socialBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  form: {
    gap: 12,
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
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  linkBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  ghostBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  guestNote: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 12,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: -4,
  },
  destructive: {},
});
