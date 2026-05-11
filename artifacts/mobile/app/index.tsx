import { router } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

export default function IndexRedirect() {
  const { user, isLoading, isGuest } = useAuth();
  const colors = useColors();

  useEffect(() => {
    if (isLoading) return;
    if (user || isGuest) {
      router.replace("/(tabs)/bills");
    } else {
      router.replace("/(auth)/login");
    }
  }, [isLoading, user, isGuest]);

  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
