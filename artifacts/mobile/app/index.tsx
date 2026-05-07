import { Feather } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

export default function WelcomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoading, continueAsGuest } = useAuth();

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/bills" />;
  }

  const handleAddBill = () => {
    continueAsGuest();
    router.navigate("/bill/new");
  };

  const handleJoinBill = () => {
    continueAsGuest();
    router.navigate("/bill/join");
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 48,
          paddingBottom: insets.bottom + 32,
        },
      ]}
    >
      <View style={styles.hero}>
        <View style={[styles.logoWrap, { backgroundColor: "rgba(31,136,61,0.1)" }]}>
          <Feather name="file-text" size={40} color={colors.primary} />
        </View>
        <Text style={[styles.appName, { color: colors.foreground }]}>TallyBill</Text>
        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          Split bills, not friendships
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={handleAddBill}
          activeOpacity={0.85}
        >
          <Feather name="plus-circle" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>Add Bill</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: colors.primary }]}
          onPress={handleJoinBill}
          activeOpacity={0.85}
        >
          <Feather name="link" size={20} color={colors.primary} />
          <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
            Join Bill
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ghostBtn, { borderColor: colors.border }]}
          onPress={() => router.navigate("/(auth)/login")}
          activeOpacity={0.8}
        >
          <Feather name="log-in" size={20} color={colors.foreground} />
          <Text style={[styles.ghostBtnText, { color: colors.foreground }]}>
            Sign In
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
          Sign in to save and view your bill history
        </Text>
      </View>
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
    alignItems: "center",
    gap: 10,
  },
  logoWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  appName: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  actions: {
    gap: 14,
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
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 2,
  },
  secondaryBtnText: {
    fontSize: 17,
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
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  footer: {
    alignItems: "center",
  },
  footerNote: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
