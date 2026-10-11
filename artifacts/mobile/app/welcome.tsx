import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { WELCOME_SEEN_KEY } from "@/lib/welcome";

const SLIDES: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  body: string;
}[] = [
  {
    icon: "camera",
    title: "Scan the receipt",
    body: "Snap a photo of any receipt, in any language. TallyBill reads the items and prices for you.",
  },
  {
    icon: "users",
    title: "Tap who had what",
    body: "Add the people at the table and tap each item to assign it. Shared plates split evenly.",
  },
  {
    icon: "share-2",
    title: "Share and settle",
    body: "See what everyone owes, tax and tip included, then share the bill with a link. Friends don't need the app.",
  },
];

/**
 * The first-run guide: three slides shown once, before the first sign-in
 * screen. Settings → "How TallyBill works" opens it again with ?replay=1,
 * and then finishing it just goes back.
 */
export default function WelcomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const isLast = page === SLIDES.length - 1;

  const finish = async () => {
    try {
      await AsyncStorage.setItem(WELCOME_SEEN_KEY, "1");
    } catch {
      // Worst case the guide shows once more; never block the user on it.
    }
    if (replay === "1" && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/login");
    }
  };

  const goTo = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setPage(index);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.topBar}>
        {!isLast ? (
          <TouchableOpacity onPress={finish} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.skip, { color: colors.mutedForeground }]}>Skip</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.flex}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
              <Feather name={slide.icon} size={56} color={colors.primaryText} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>{slide.title}</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((slide, i) => (
          <View
            key={slide.title}
            style={[
              styles.dot,
              { backgroundColor: i === page ? colors.primary : colors.border },
              i === page && styles.dotActive,
            ]}
          />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        onPress={isLast ? finish : () => goTo(page + 1)}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>{isLast ? (replay === "1" ? "Done" : "Get started") : "Next"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  topBar: { height: 32, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: SPACING.xl },
  skip: { fontSize: FONT_SIZE.body, fontFamily: "Inter_500Medium" },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xxxl,
    gap: SPACING.lg,
  },
  iconCircle: {
    width: 128,
    height: 128,
    borderRadius: 64, // TODO: one-off (circular: half of 128px)
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.lg,
  },
  title: { fontSize: FONT_SIZE.heading, fontFamily: "Inter_700Bold", textAlign: "center" },
  body: { fontSize: FONT_SIZE.body, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  dots: { flexDirection: "row", justifyContent: "center", gap: SPACING.sm, marginVertical: SPACING.xxl },
  dot: { width: 8, height: 8, borderRadius: RADIUS.full },
  dotActive: { width: 24 },
  primaryBtn: {
    marginHorizontal: SPACING.xl,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
});
