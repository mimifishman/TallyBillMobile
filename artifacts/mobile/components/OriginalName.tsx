import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/useColors";
import { originalNameToShow } from "@workspace/utils";

/**
 * The item's name as the receipt printed it, under its translated name.
 *
 * One look everywhere an item is listed — the review screen, the bill, the
 * discount sheet, each person's totals — so it reads as the same thing each
 * time: smaller, muted, with a globe to say "this is the other language".
 * Renders nothing when there is no original, or it says the same as the name.
 */
export function OriginalName({
  description,
  original,
  style,
  size = 12,
}: {
  description: string | null | undefined;
  original: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  size?: number;
}) {
  const colors = useColors();
  const shown = originalNameToShow(description, original);
  if (!shown) return null;
  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityLabel={`On the receipt: ${shown}`}
    >
      <Feather name="globe" size={size - 1} color={colors.mutedForeground} style={styles.icon} />
      <Text style={[styles.text, { color: colors.mutedForeground, fontSize: size, lineHeight: size + 4 }]} numberOfLines={1}>
        {shown}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  icon: { marginTop: 1 },
  text: { flexShrink: 1, fontFamily: "Inter_400Regular" },
});
