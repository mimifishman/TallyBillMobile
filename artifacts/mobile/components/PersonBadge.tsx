import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface PersonBadgeProps {
  name: string;
  color: string;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
  onPress?: () => void;
  showName?: boolean;
}

export function PersonBadge({
  name,
  color,
  size = "md",
  selected,
  onPress,
  showName = false,
}: PersonBadgeProps) {
  const dim = size === "sm" ? 28 : size === "lg" ? 44 : 36;
  const fontSize = size === "sm" ? 11 : size === "lg" ? 16 : 14;
  const initial = name.charAt(0).toUpperCase();

  const badge = (
    <View
      style={[
        styles.badge,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: selected === false ? "transparent" : color,
          borderWidth: selected === false ? 2 : 0,
          borderColor: color,
          opacity: selected === false ? 0.4 : 1,
        },
      ]}
    >
      <Text style={[styles.initial, { fontSize, color: selected === false ? color : "#fff" }]}>
        {initial}
      </Text>
    </View>
  );

  if (showName) {
    return (
      <TouchableOpacity style={styles.withName} onPress={onPress} activeOpacity={0.7}>
        {badge}
        <Text style={[styles.name, { color: "#1F2328" }]} numberOfLines={1}>{name}</Text>
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
  initial: {
    fontFamily: "Inter_700Bold",
    lineHeight: undefined,
  },
  withName: {
    alignItems: "center",
    gap: 4,
  },
  name: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    maxWidth: 52,
    textAlign: "center",
  },
});
