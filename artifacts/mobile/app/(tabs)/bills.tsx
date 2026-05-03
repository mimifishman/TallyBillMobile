import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  FadeInDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { BillCard } from "@/components/BillCard";
import { BillCardSkeleton } from "@/components/Skeleton";
import { EmptyBillsIllustration } from "@/components/EmptyBillsIllustration";
import { useGetBills, useDeleteBill, getGetBillsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { confirmDeleteBill } from "@/utils/confirmDeleteBill";

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function PulsingFab({
  pulse,
  bottom,
  bg,
  onPress,
}: {
  pulse: boolean;
  bottom: number;
  bg: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (pulse) {
      scale.value = withRepeat(
        withTiming(1.12, { duration: 850, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [pulse, scale]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedTouchable
      style={[styles.fab, { backgroundColor: bg, bottom }, animStyle]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Feather name="plus" size={26} color="#fff" />
    </AnimatedTouchable>
  );
}

export default function BillsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: bills, isLoading, refetch, isRefetching } = useGetBills({
    query: { queryKey: getGetBillsQueryKey(), enabled: !!user },
  });

  const deleteBillMutation = useDeleteBill({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBillsQueryKey() });
      },
      onError: () => {
        Alert.alert("Couldn't delete", "We couldn't delete this bill. Please try again.");
      },
    },
  });

  const handleDeleteBill = useCallback((billId: number) => {
    confirmDeleteBill(() => deleteBillMutation.mutate({ billId }));
  }, [deleteBillMutation]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        refetch();
      }
    }, [user, refetch]),
  );

  if (!user) {
    return (
      <View style={[styles.gateContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.gateIconWrap, { backgroundColor: colors.primarySoft }]}>
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

  const isEmpty = !isLoading && (!bills || bills.length === 0);
  const fabBottom = Platform.OS === "web" ? 100 : insets.bottom + 65;

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
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(14)}>
            <BillCard
              title={item.title}
              restaurantName={item.restaurantName}
              date={item.date}
              currency={item.currency}
              joinCode={item.joinCode}
              participants={item.users}
              status={item.settled ? "settled" : "open"}
              isOwner={item.isOwner === true}
              onPress={() => router.push(`/bill/${item.id}`)}
              onDelete={() => handleDeleteBill(item.id)}
            />
          </Animated.View>
        )}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.skeletonWrap}>
              <BillCardSkeleton />
              <BillCardSkeleton />
              <BillCardSkeleton />
            </View>
          ) : (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.empty}>
              <EmptyBillsIllustration size={220} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No bills yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Tap the + button to start your first bill and split it with friends
              </Text>
            </Animated.View>
          )
        }
      />

      <PulsingFab
        pulse={isEmpty}
        bottom={fabBottom}
        bg={colors.primary}
        onPress={() => router.push("/bill/new")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  skeletonWrap: { paddingTop: 8 },
  empty: { alignItems: "center", paddingTop: 40, paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 8 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  fab: {
    position: "absolute",
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
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
