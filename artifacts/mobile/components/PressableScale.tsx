import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, type PressableProps } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: object | object[];
  disabled?: boolean;
  // Forwarded explicitly: this component does not spread the rest of its props,
  // so anything not named here is silently dropped. Without these, no
  // PressableScale in the app can carry a screen-reader label or a hit target.
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: PressableProps["accessibilityRole"];
  accessibilityState?: PressableProps["accessibilityState"];
  hitSlop?: PressableProps["hitSlop"];
}

export function PressableScale({
  children,
  onPress,
  style,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  accessibilityState,
  hitSlop,
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        scale.value = withSpring(0.97, { stiffness: 400, damping: 25 });
        opacity.value = withSpring(0.88, { stiffness: 400, damping: 25 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { stiffness: 400, damping: 25 });
        opacity.value = withSpring(1, { stiffness: 400, damping: 25 });
      }}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      hitSlop={hitSlop}
      style={[animStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
