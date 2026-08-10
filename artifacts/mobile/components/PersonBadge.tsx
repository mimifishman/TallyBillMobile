import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import colors_data from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { FONT_SIZE } from "@/constants/styles";
import { getInitials } from "@workspace/utils";

interface PersonBadgeProps {
  name: string;
  color: string;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  onPress?: () => void;
  showName?: boolean;
}

const PEOPLE = colors_data.light.people;
const GRADIENTS = colors_data.light.peopleGradients;

function gradientFor(color: string): [string, string] {
  const idx = PEOPLE.findIndex((c) => c.toLowerCase() === color.toLowerCase());
  if (idx >= 0 && GRADIENTS[idx]) return GRADIENTS[idx];
  return [color, color];
}

export function PersonBadge({
  name,
  color,
  size = "md",
  selected,
  onPress,
  showName = false,
}: PersonBadgeProps) {
  const themeColors = useColors();
  const dim = size === "sm" ? 28 : size === "lg" ? 44 : 36;
  const initial = getInitials(name);
  // Two-letter pairs need a slightly smaller size to fit the small/medium circles.
  const twoLetters = initial.length > 1;
  const fontSize =
    size === "sm"
      ? twoLetters
        ? 10
        : 11
      : size === "lg"
        ? 16
        : twoLetters
          ? 13
          : 14;
  const [start, end] = gradientFor(color);
  const isUnselected = selected === false;

  const badge = isUnselected ? (
    <View
      style={[
        styles.badge,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: "transparent",
          borderWidth: 2,
          borderColor: color,
          opacity: 0.55,
        },
      ]}
    >
      <Text
        style={[styles.initial, { fontSize, color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.2}
      >
        {initial}
      </Text>
    </View>
  ) : (
    <LinearGradient
      colors={[start, end]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.badge,
        styles.shadow,
        { width: dim, height: dim, borderRadius: dim / 2 },
      ]}
    >
      <Text
        style={[styles.initial, { fontSize, color: "#fff" }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.2}
      >
        {initial}
      </Text>
    </LinearGradient>
  );

  if (showName) {
    return (
      <TouchableOpacity style={styles.withName} onPress={onPress} activeOpacity={0.7}>
        {badge}
        <Text style={[styles.name, { color: themeColors.text }]} numberOfLines={1}>{name}</Text>
      </TouchableOpacity>
    );
  }

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {badge}
      </TouchableOpacity>
    );
  }

  return badge;
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    justifyContent: "center",
  },
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  initial: {
    fontFamily: "Inter_700Bold",
    lineHeight: undefined,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  withName: {
    alignItems: "center",
    gap: 4,
  },
  name: {
    fontSize: 11, // TODO: one-off
    fontFamily: "Inter_500Medium",
    maxWidth: 52,
    textAlign: "center",
  },
});
