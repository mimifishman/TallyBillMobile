import { Feather } from "@expo/vector-icons";
import { useSSO, useSignIn } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
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
  const { signIn, fetchStatus, errors } = useSignIn();
  const { startSSOFlow } = useSSO();

  useWarmUpBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  const isPending = fetchStatus === "fetching";

  const handleEmailLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter your email and password");
      return;
    }
    const { error } = await signIn.password({
      emailAddress: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      Alert.alert("Login Failed", error.message || "Invalid email or password");
      return;
    }
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) return;
          const url = decorateUrl("/");
          router.replace(url.startsWith("http") ? "/(tabs)/bills" : (url as any));
        },
      });
      router.replace("/(tabs)/bills");
    } else if (signIn.status === "needs_client_trust") {
      await signIn.mfa.sendEmailCode();
    }
  };

  const handleVerify = async () => {
    await signIn.mfa.verifyEmailCode({ code: verificationCode });
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: () => {},
      });
      router.replace("/(tabs)/bills");
    }
  };

  const handleOAuth = useCallback(
    async (strategy: "oauth_google" | "oauth_apple") => {
      try {
        const { createdSessionId, setActive } = await startSSOFlow({
          strategy,
          redirectUrl: AuthSession.makeRedirectUri(),
        });
        if (createdSessionId) {
          await setActive!({
            session: createdSessionId,
            navigate: async ({ session }) => {
              if (session?.currentTask) return;
              router.replace("/(tabs)/bills");
            },
          });
        }
      } catch (err) {
        Alert.alert("Error", "Sign-in failed. Please try again.");
        console.error(err);
      }
    },
    [startSSOFlow],
  );

  const handleGuest = () => {
    continueAsGuest();
    router.replace("/bill/new");
  };

  if (signIn.status === "needs_client_trust") {
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
              Enter the code sent to your email
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
            {errors?.fields?.code && (
              <Text style={[styles.errorText, { color: colors.destructive }]}>
                {errors.fields.code.message}
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
            <TouchableOpacity
              onPress={() => signIn.mfa.sendEmailCode()}
              style={styles.linkBtn}
            >
              <Text style={[styles.linkText, { color: colors.mutedForeground }]}>
                Resend code
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => signIn.reset()} style={styles.linkBtn}>
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
            onPress={() => handleOAuth("oauth_google")}
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
              onPress={() => handleOAuth("oauth_apple")}
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
          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <Feather name="mail" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Email"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {errors?.fields?.identifier && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {errors.fields.identifier.message}
            </Text>
          )}

          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <Feather name="lock" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Password"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
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
          {errors?.fields?.password && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {errors.fields.password.message}
            </Text>
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
