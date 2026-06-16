import React, { useEffect } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const COLORS = ["#10B981", "#FB7185", "#3B82F6", "#A855F7", "#EAB308"];

interface ParticleProps {
  index: number;
  width: number;
}

function Particle({ index, width }: ParticleProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rot = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const startX = width / 2;
    const targetX = (Math.random() - 0.5) * width * 0.9;
    const targetY = 80 + Math.random() * 220;
    const delay = Math.floor(Math.random() * 200);

    tx.value = startX;
    ty.value = 0;
    opacity.value = 0;
    rot.value = 0;

    opacity.value = withDelay(delay, withTiming(1, { duration: 120 }));
    tx.value = withDelay(delay, withTiming(startX + targetX, { duration: 1100, easing: Easing.out(Easing.quad) }));
    ty.value = withDelay(delay, withTiming(targetY, { duration: 1100, easing: Easing.out(Easing.quad) }));
    rot.value = withDelay(delay, withTiming(360 + Math.random() * 360, { duration: 1100 }));

    const fadeId = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 500 });
    }, 900 + delay);
    return () => clearTimeout(fadeId);
  }, [index, width, tx, ty, rot, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rot.value}deg` },
    ],
    opacity: opacity.value,
  }));

  const color = COLORS[index % COLORS.length];
  const isCircle = index % 3 === 0;
  const size = 6 + (index % 4) * 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          width: size,
          height: size,
          borderRadius: isCircle ? size / 2 : 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function Confetti({ count = 30, trigger }: { count?: number; trigger: number }) {
  const { width } = Dimensions.get("window");
  return (
    <View pointerEvents="none" style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <Particle key={`${trigger}-${i}`} index={i} width={width} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  particle: {
    position: "absolute",
    top: 0,
    left: 0,
  },
});
