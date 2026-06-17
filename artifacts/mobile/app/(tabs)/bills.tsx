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
  ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { BillCard } from "@/components/BillCard";
import { BillCardSkeleton } from "@/components/Skeleton";
import { EmptyBillsIllustration } from "@/components/EmptyBillsIllustration";
import {
  useGetBills,
  useDeleteBill,
  getGetBillsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { confirmDeleteBill } from "@/utils/confirmDeleteBill";
import {
  listGuestBills,
  removeGuestBill,
  getOrCreateGuestOwnerId,
  type GuestBillRef,
} from "@/utils/guestBillStore";
import { PressableScale } from "@/components/PressableScale";
import * as Haptics from "expo-haptics";
import { FONT_SIZE, RADIUS, SHADOWS, SPACING } from "@/constants/styles";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

interface GuestBillItem extends GuestBillRef {
  settled?: boolean;
  currency?: string | null;
  users?: { id: number; name: string; color: string }[];
  isOwner?: boolean;
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

function RemoveAction({ onRemove }: { onRemove: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.deleteAction, { backgroundColor: colors.mutedForeground ?? "#6B7280" }]}
      onPress={onRemove}
      activeOpacity={0.85}
    >
      <Feather name="log-out" size={22} color="#fff" />
      <Text style={styles.deleteActionText}>Remove</Text>
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
    <Animated.View entering={ZoomIn.springify().damping(15)} style={[styles.fabWrapper, { bottom }]}>
      <PressableScale
        style={[styles.fab, { backgroundColor: bg }, animStyle]}
        onPress={onPress}
      >
        <Feather name="plus" size={28} color="#fff" />
      </PressableScale>
    </Animated.View>
  );
}

export default function BillsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, guestName } = useAuth();
  const queryClient = useQueryClient();

  const [guestBills, setGuestBills] = useState<GuestBillItem[]>([]);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestRefreshing, setGuestRefreshing] = useState(false);

  const { data: authBills, isLoading: authLoading, refetch, isRefetching } = useGetBills({
    query: { queryKey: getGetBillsQueryKey(), enabled: !!user },
  });

  const deleteBillMutation = useDeleteBill({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBillsQueryKey() });
      },
      onError: () => {
        Alert.alert("Hmm, something went wrong", "We couldn't delete this bill. Give it another shot.");
      },
    },
  });

  const handleDeleteAuthBill = useCallback(
    (billId: number) => {
      Alert.alert("Delete Bill?", "Are you sure you want to delete this bill?", [
        { text: "Actually, keep it", style: "cancel" },
        { 
          text: "Yeah, remove", 
          style: "destructive", 
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            deleteBillMutation.mutate({ billId });
          }
        },
      ]);
    },
    [deleteBillMutation],
  );

  const loadGuestBills = useCallback(async (isRefresh = false) => {
    if (isRefresh) setGuestRefreshing(true);
    else setGuestLoading(true);
    const refs = await listGuestBills();
    if (refs.length === 0) {
      setGuestBills([]);
      setGuestLoading(false);
      setGuestRefreshing(false);
      return;
    }
    try {
      const ids = refs.map((r) => r.id).join(",");
      const guestOwnerId = await getOrCreateGuestOwnerId();
      const fresh = await customFetch<GuestBillItem[]>(`/api/bills/guest?ids=${ids}&guestOwnerId=${guestOwnerId}`);
      setGuestBills(
        fresh.map((b) => ({
          ...b,
          joinCode: refs.find((r) => r.id === b.id)?.joinCode ?? b.joinCode ?? "",
        })),
      );
    } catch {
      setGuestBills(refs.map((r) => ({ ...r, users: [], settled: false, isOwner: true })));
    }
    setGuestLoading(false);
    setGuestRefreshing(false);
  }, []);

  const handleDeleteGuestBill = useCallback((billId: number, _title: string) => {
    Alert.alert(
      "Remove from your list",
      "This removes the bill from your view. The bill itself will not be deleted.",
      [
        { text: "Actually, keep it", style: "cancel" },
        {
          text: "Yeah, remove",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await removeGuestBill(billId);
            setGuestBills((prev) => prev.filter((b) => b.id !== billId));
          },
        },
      ]
    );
  }, []);

  const handleLeaveAuthBill = useCallback((billId: number, _title: string) => {
    Alert.alert(
      "Remove from your list",
      "This removes the bill from your view. The bill itself will not be deleted.",
      [
        { text: "Actually, keep it", style: "cancel" },
        {
          text: "Yeah, remove",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              await customFetch(`/api/bills/${billId}/leave`, { method: "DELETE" });
              queryClient.invalidateQueries({ queryKey: getGetBillsQueryKey() });
            } catch {
              Alert.alert("Hmm, something went wrong", "Couldn't remove the bill. Give it another shot.");
            }
          },
        },
      ]
    );
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      if (user) refetch();
      else void loadGuestBills();
    }, [user, refetch, loadGuestBills]),
  );

  const fabBottom = Platform.OS === "web" ? 100 : insets.bottom + 85;
  const listPadding = {
    paddingBottom: insets.bottom + 120,
  };

  const isGuest_ = !user;
  const bills = isGuest_ ? guestBills : (authBills ?? []);
  const isLoading = isGuest_ ? guestLoading : authLoading;
  const isRefreshing = isGuest_ ? guestRefreshing : isRefetching;
  const isEmpty = !isLoading && bills.length === 0;
  
  const displayName = user ? (user.firstName || user.displayName) : guestName || "Guest";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 20 }]}>
        <Text style={[styles.greeting, { color: colors.foreground }]}>{getGreeting()}, {displayName} 👋</Text>
        {!isLoading && !isEmpty && (
          <Text style={[styles.subline, { color: colors.mutedForeground }]}>
            {bills.length} open {bills.length === 1 ? 'bill' : 'bills'}
          </Text>
        )}
      </View>

      <FlatList
        data={bills}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, listPadding]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              if (isGuest_) void loadGuestBills(true);
              else refetch();
            }}
            tintColor={colors.primary}
          />
        }
        scrollEnabled={bills.length > 0}
        renderItem={({ item, index }) => {
          const isOwner = item.isOwner !== false;
          const card = (
            <BillCard
              title={item.title}
              date={item.date}
              currency={item.currency ?? null}
              joinCode={item.joinCode}
              participants={item.users ?? []}
              status={item.settled ? "settled" : "open"}
              isOwner={isOwner}
              onPress={() => router.push(`/bill/${item.id}`)}
            />
          );
          return (
            <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(14)}>
              <Swipeable
                renderRightActions={() =>
                  isOwner ? (
                    <DeleteAction
                      onDelete={() =>
                        isGuest_
                          ? handleDeleteGuestBill(item.id, item.title)
                          : handleDeleteAuthBill(item.id)
                      }
                    />
                  ) : (
                    <RemoveAction
                      onRemove={() =>
                        isGuest_
                          ? handleDeleteGuestBill(item.id, item.title)
                          : handleLeaveAuthBill(item.id, item.title)
                      }
                    />
                  )
                }
                overshootRight={false}
                rightThreshold={72}
                friction={2}
              >
                {card}
              </Swipeable>
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
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No bills yet — someone's gotta start the tab.</Text>
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
  header: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  greeting: {
    fontSize: FONT_SIZE.heading,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  subline: {
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_500Medium",
    marginTop: SPACING.xs,
  },
  list: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm },
  deleteAction: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  deleteActionText: {
    color: "#fff",
    fontSize: 12, // TODO: one-off
    fontFamily: "Inter_600SemiBold",
  },
  skeletonWrap: { paddingTop: SPACING.sm, gap: SPACING.md },
  empty: { alignItems: "center", paddingTop: 40, paddingHorizontal: SPACING.xxxl, gap: SPACING.lg },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginTop: SPACING.sm, textAlign: "center", lineHeight: 26 }, // TODO: one-off
  fabWrapper: {
    position: "absolute",
    right: SPACING.xxl,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.raised,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
