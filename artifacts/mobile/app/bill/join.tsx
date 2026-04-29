import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useJoinBill } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

export default function JoinBillScreen() {
  const colors = useColors();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user } = useAuth();

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

  useEffect(() => {
    if (!user) {
      Alert.alert("Sign in required", "You need to sign in to join a bill", [
        { text: "Cancel", onPress: () => router.back(), style: "cancel" },
        { text: "Sign In", onPress: () => router.replace("/(auth)/login") },
      ]);
      return;
    }
    if (code) {
      joinMutation.mutate({ data: { joinCode: code } });
    }
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
