import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { BillCard } from "@/components/BillCard";
import { useGetBills, getGetBillsQueryKey } from "@workspace/api-client-react";

export default function BillsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: bills, isLoading, refetch, isRefetching } = useGetBills({
    query: { queryKey: getGetBillsQueryKey(), enabled: !!user },
  });

  if (!user) {
    return (
      <View style={[styles.gateContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.gateIconWrap, { backgroundColor: "rgba(31,136,61,0.1)" }]}>
          <Feather name="lock" size={32} color={colors.primary} />
        </View>
        <Text style={[styles.gateTitle, { color: colors.foreground }]}>Sign in to see history</Text>
        <Text style={[styles.gateSub, { color: colors.mutedForeground }]}>
          Create an account or sign in to save and view your bill history across sessions
        </Text>
        <TouchableOpacity
          style={[styles.gateBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/(auth)/login")}
        >
          <Text style={styles.gateBtnText}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
          <Text style={[styles.gateLink, { color: colors.mutedForeground }]}>
            Create account
          </Text>
        </TouchableOpacity>
        <View style={[styles.divider, { borderTopColor: colors.border }]} />
        <TouchableOpacity
          style={[styles.newBillGhostBtn, { borderColor: colors.border }]}
          onPress={() => router.push("/bill/new")}
        >
          <Feather name="plus" size={18} color={colors.primary} />
          <Text style={[styles.newBillGhostText, { color: colors.primary }]}>New Bill (Guest)</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={bills ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          styles.list,
          {
            paddingBottom: insets.bottom + 100,
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 12,
          },
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
        scrollEnabled={!!(bills && bills.length > 0)}
        renderItem={({ item }) => (
          <BillCard
            title={item.title}
            restaurantName={item.restaurantName}
            date={item.date}
            currency={item.currency}
            joinCode={item.joinCode}
            onPress={() => router.push(`/bill/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Feather name="file-text" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No bills yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Create your first bill to get started
              </Text>
            </View>
          )
        }
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: Platform.OS === "web" ? 100 : insets.bottom + 65 }]}
        onPress={() => router.push("/bill/new")}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  empty: { alignItems: "center", paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  gateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  gateIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  gateTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  gateSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  gateBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    marginTop: 8,
    alignItems: "center",
  },
  gateBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  gateLink: { fontSize: 14, fontFamily: "Inter_400Regular" },
  divider: { borderTopWidth: 1, width: "100%", marginVertical: 16 },
  newBillGhostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  newBillGhostText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
