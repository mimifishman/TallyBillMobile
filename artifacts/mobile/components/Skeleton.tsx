import React, { useEffect, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";

interface SkeletonProps {
  height?: number;
  width?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export function Skeleton({ height = 14, width = "100%", borderRadius = 6, style }: SkeletonProps) {
  const colors = useColors();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [progress]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w && w !== measuredWidth) setMeasuredWidth(w);
  };

  const sweepStyle = useAnimatedStyle(() => {
    const w = measuredWidth || 200;
    return {
      transform: [{ translateX: -w + progress.value * (w * 2) }],
    };
  });

  return (
    <View
      onLayout={onLayout}
      style={[
        {
          height,
          width: width as ViewStyle["width"],
          borderRadius,
          backgroundColor: colors.muted,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {measuredWidth > 0 && (
        <AnimatedLinearGradient
          colors={["transparent", colors.surfaceRaised + "CC", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[
            StyleSheet.absoluteFillObject,
            { width: measuredWidth },
            sweepStyle,
          ]}
        />
      )}
    </View>
  );
}

export function BillCardSkeleton() {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statusBar, { backgroundColor: colors.muted }]} />
      <View style={styles.body}>
        <View style={styles.row}>
          <Skeleton height={40} width={40} borderRadius={12} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={14} width={"60%"} />
            <Skeleton height={11} width={"40%"} />
          </View>
        </View>
        <View style={[styles.row, { paddingLeft: 52 }]}>
          <Skeleton height={20} width={20} borderRadius={10} />
          <Skeleton height={20} width={20} borderRadius={10} style={{ marginLeft: -8 }} />
          <Skeleton height={20} width={20} borderRadius={10} style={{ marginLeft: -8 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  statusBar: { width: 4 },
  body: { flex: 1, padding: 14, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
