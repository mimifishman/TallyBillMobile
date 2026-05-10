import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { Swipeable } from "react-native-gesture-handler";
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
import { useGetBills, useDeleteBill, getGetBillsQueryKey, customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { confirmDeleteBill } from "@/utils/confirmDeleteBill";
import {
  listGuestBills,
  removeGuestBill,
  type GuestBillRef,
} from "@/utils/guestBillStore";

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

interface GuestBillItem extends GuestBillRef {
  settled?: boolean;
  currency?: string | null;
  restaurantName?: string | null;
}

function DeleteAction({ onDelete }: { onDelete: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.deleteAction, { backgroundColor: colors.destructive }]}
      onPress={onDelete}
      activeOpacity={0.85}
    >
      <Feather name="trash-2" size={22} color="#fff" />
      <Text style={styles.deleteActionText}>Delete</Text>
    </TouchableOpacity>
  );
}

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

function GuestBillsSection({
  onNewBill,
}: {
  onNewBill: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [guestBills, setGuestBills] = useState<GuestBillItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const refs = await listGuestBills();
    if (refs.length === 0) {
      setGuestBills([]);
      setLoading(false);
      return;
    }
    try {
      const ids = refs.map((r) => r.id).join(",");
      const fresh = await customFetch<GuestBillItem[]>(`/api/bills/guest?ids=${ids}`);
      const enriched = fresh.map((b) => ({
        ...b,
        joinCode: refs.find((r) => r.id === b.id)?.joinCode ?? b.joinCode ?? "",
      }));
      setGuestBills(enriched);
    } catch {
      setGuestBills(refs.map((r) => ({ ...r, settled: false })));
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = (billId: number, title: string) => {
    Alert.alert("Remove Bill", `Remove "${title}" from your guest bills?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: async () => {
          await removeGuestBill(billId);
          setGuestBills((prev) => prev.filter((b) => b.id !== billId));
        }
      },
    ]);
  };

  const fabBottom = Platform.OS === "web" ? 100 : insets.bottom + 65;
  const isEmpty = !loading && guestBills.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={guestBills}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[
          styles.list,
          {
            paddingBottom: insets.bottom + 100,
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 12,
          },
        ]}
        ListHeaderComponent={
          <View style={[styles.guestBanner, { backgroundColor: colors.primarySoft, borderColor: colors.primary + "30" }]}>
            <Feather name="user" size={14} color={colors.primary} />
            <Text style={[styles.guestBannerText, { color: colors.primary }]}>
              Guest bills — sign in to save permanently
            </Text>
            <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
              <Text style={[styles.guestBannerLink, { color: colors.primary }]}>Sign in</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(14)}>
            <Swipeable
              renderRightActions={() => (
                <DeleteAction onDelete={() => handleDelete(item.id, item.title)} />
              )}
              overshootRight={false}
              rightThreshold={72}
              friction={2}
            >
              <BillCard
                title={item.title}
                restaurantName={item.restaurantName ?? null}
                date={item.date}
                currency={item.currency ?? null}
                joinCode={item.joinCode}
                participants={[]}
                status={item.settled ? "settled" : "open"}
                onPress={() => router.push(`/bill/${item.id}`)}
              />
            </Swipeable>
          </Animated.View>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletonWrap}>
              <BillCardSkeleton />
              <BillCardSkeleton />
            </View>
          ) : (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.empty}>
              <EmptyBillsIllustration size={180} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No bills yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Tap the + button to start your first bill
              </Text>
            </Animated.View>
          )
        }
      />

      <PulsingFab
        pulse={isEmpty}
        bottom={fabBottom}
        bg={colors.primary}
        onPress={onNewBill}
      />
    </View>
  );
}

export default function BillsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isGuest } = useAuth();
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
    if (isGuest) {
      return (
        <GuestBillsSection onNewBill={() => router.push("/bill/new")} />
      );
    }

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
        renderItem={({ item, index }) => {
          const isOwner = item.isOwner === true;
          const card = (
            <BillCard
              title={item.title}
              restaurantName={item.restaurantName}
              date={item.date}
              currency={item.currency}
              joinCode={item.joinCode}
              participants={item.users}
              status={item.settled ? "settled" : "open"}
              onPress={() => router.push(`/bill/${item.id}`)}
            />
          );
          return (
            <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(14)}>
              {isOwner ? (
                <Swipeable
                  renderRightActions={() => (
                    <DeleteAction onDelete={() => handleDeleteBill(item.id)} />
                  )}
                  overshootRight={false}
                  rightThreshold={72}
                  friction={2}
                >
                  {card}
                </Swipeable>
              ) : card}
            </Animated.View>
          );
        }}
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
  deleteAction: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 14,
    marginBottom: 12,
    gap: 4,
  },
  deleteActionText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
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
  guestBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  guestBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  guestBannerLink: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
