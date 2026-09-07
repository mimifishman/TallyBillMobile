import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { RADIUS, SPACING } from "@/constants/styles";

export type LoadErrorViewProps = {
  /** Headline. Say what failed to load, not that the list is empty. */
  title?: string;
  message?: string;
  onRetry: () => void;
  /** True while the retry request is in flight. */
  isRetrying?: boolean;
  /** Extra style for the outer view, e.g. `flex: 1` to centre on a full screen. */
  style?: StyleProp<ViewStyle>;
};

/**
 * Shown when a list request fails.
 *
 * This is deliberately distinct from the empty state: an empty state tells the
 * user they have no data, which reads as data loss when the real problem is a
 * dropped connection or a server error.
 */
export function LoadErrorView({
  title = "Couldn't load your stuff",
  message = "Check your connection and try again. Nothing has been lost.",
  onRetry,
  isRetrying = false,
  style,
}: LoadErrorViewProps) {
  const colors = useColors();

  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="wifi-off" size={36} color={colors.mutedForeground} />
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: colors.primary, opacity: isRetrying ? 0.6 : 1 }]}
          onPress={onRetry}
          disabled={isRetrying}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          {isRetrying ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <>
              <Feather name="refresh-cw" size={16} color={colors.primaryForeground} />
              <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Try Again</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xxl,
  },
  card: {
    width: "100%",
    alignItems: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.xxxl,
    gap: SPACING.md,
  },
  title: {
    fontSize: 18, // TODO: one-off
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  message: {
    fontSize: 14, // TODO: one-off
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: SPACING.sm,
    minWidth: 140,
    minHeight: 42,
  },
  retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
});
