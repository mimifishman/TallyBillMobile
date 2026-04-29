import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function Index() {
  const { user, isLoading, isGuest } = useAuth();
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/bills" />;
  }

  if (isGuest) {
    return <Redirect href="/bill/new" />;
  }

  return <Redirect href="/(auth)/login" />;
}
