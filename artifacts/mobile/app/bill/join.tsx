import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  useGetBillByCode,
  getGetBillByCodeQueryKey,
  useJoinBill,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { rememberBillCode } from "@/lib/billCodeStore";

function JoinByCode({ initialCode }: { initialCode: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [inputCode, setInputCode] = useState(initialCode.toUpperCase());
  const [submittedCode, setSubmittedCode] = useState(
    initialCode ? initialCode.toUpperCase() : "",
  );
  const [codeError, setCodeError] = useState("");
  const handledRef = useRef(false);

  const joinCode = submittedCode.trim().toUpperCase();
  const enabled = joinCode.length > 0;

  const { data, isLoading, error } = useGetBillByCode(joinCode, {
    query: {
      queryKey: getGetBillByCodeQueryKey(joinCode),
      enabled,
      retry: false,
    },
  });

  const joinMutation = useJoinBill({
    mutation: {
      onSuccess: () => {},
      onError: () => {},
    },
  });

  useEffect(() => {
    if (!enabled) return;
    if (isLoading) return;
    if (handledRef.current) return;

    if (error || !data) {
      setCodeError("Bill not found. Check the code and try again.");
      setSubmittedCode("");
      return;
    }

    handledRef.current = true;
    const billId = data.bill.id;
    rememberBillCode(billId, joinCode);

    if (user) {
      joinMutation.mutate({ data: { joinCode } });
    }

    router.replace(`/bill/${billId}`);
  }, [enabled, isLoading, error, data, user, joinCode, joinMutation]);

  const handleJoin = () => {
    const code = inputCode.trim().toUpperCase();
    if (!code) {
      setCodeError("Please enter a join code.");
      return;
    }
    setCodeError("");
    handledRef.current = false;
    setSubmittedCode(code);
  };

  const isProcessing = isLoading && enabled;

  if (isProcessing) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: "rgba(31,136,61,0.1)" },
            ]}
          >
            <Feather name="link" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Join a Bill
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Enter the join code shared with you
          </Text>
        </View>

        <View style={styles.form}>
          <View
            style={[
              styles.inputWrap,
              {
                borderColor: codeError ? colors.destructive : colors.border,
              },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Join code"
              placeholderTextColor={colors.mutedForeground}
              value={inputCode}
              onChangeText={(t) => {
                setInputCode(t.toUpperCase());
                setCodeError("");
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleJoin}
              autoFocus={!initialCode}
            />
          </View>

          {!!codeError && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {codeError}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleJoin}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Join Bill</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function JoinBillScreen() {
  const colors = useColors();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user, isLoading: authLoading } = useAuth();

  const initialCode = (Array.isArray(code) ? code[0] : code) ?? "";

  const joinMutation = useJoinBill({
    mutation: {
      onSuccess: (bill) => {
        router.replace(`/bill/${bill.id}`);
      },
      onError: (err: Error) => {
        Alert.alert("Error", err.message || "Could not join bill", [
          { text: "OK", onPress: () => router.back() },
        ]);
      },
    },
  });

  const normalizedInitialCode = initialCode.toUpperCase();
  const hasCode = normalizedInitialCode.length > 0;

  useEffect(() => {
    if (authLoading) return;
    if (!hasCode) return;
    if (!user) return;
    joinMutation.mutate({ data: { joinCode: normalizedInitialCode } });
  }, [authLoading, hasCode, user, normalizedInitialCode]);

  if (!hasCode || !user) {
    return <JoinByCode initialCode={initialCode} />;
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 32,
  },
  backBtn: { padding: 4 },
  hero: {
    alignItems: "center",
    gap: 10,
    marginBottom: 40,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  form: { gap: 12 },
  inputWrap: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
    textAlign: "center",
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
});
