import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Image,
  ImageSourcePropType,
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

// Real app screens, cropped from the Play Store captures (made-up receipts).
// `aspect` is the image's height / width.
const SLIDES: {
  image: ImageSourcePropType;
  aspect: number;
  title: string;
  body: string;
}[] = [
  {
    image: require("@/assets/images/welcome-scan.jpg"),
    aspect: 553 / 720,
    title: "Scan the receipt",
    body: "Snap a photo of any receipt, in any language. TallyBill reads the items and prices for you.",
  },
  {
    image: require("@/assets/images/welcome-assign.jpg"),
    aspect: 880 / 720,
    title: "Tap who had what",
    body: "Add the people at the table and tap each item to assign it. Shared plates split evenly.",
  },
  {
    image: require("@/assets/images/welcome-totals.jpg"),
    aspect: 1000 / 720,
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
  const { width, height } = useWindowDimensions();
  // The screenshot gets what the text and buttons leave free, so a small
  // phone still shows the whole slide without scrolling.
  const shotWidth = Math.min(width - SPACING.huge * 2, 300);
  const shotMaxHeight = height * 0.42;
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
            {/* Two layers: on iOS, overflow:hidden would also clip the shadow. */}
            <View style={[styles.shotShadow, { backgroundColor: colors.card }]}>
              <View
                style={[
                  styles.shot,
                  {
                    width: shotWidth,
                    height: Math.min(shotWidth * slide.aspect, shotMaxHeight),
                    borderColor: colors.border,
                  },
                ]}
              >
                {/* Full width and top-aligned: a tall screen is cut at the bottom, never squashed. */}
                <Image
                  source={slide.image}
                  style={{ width: shotWidth, height: shotWidth * slide.aspect }}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              </View>
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
  shotShadow: {
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    shadowColor: "#1C1917",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  shot: { borderRadius: RADIUS.lg, borderWidth: 1, overflow: "hidden" },
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
