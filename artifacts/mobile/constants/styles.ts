import { StyleSheet } from "react-native";

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
};

export const RADIUS = {
  sm: 8,
  md: 16,
  lg: 20,
  xl: 28,
  full: 999,
};

export const FONT_SIZE = {
  caption: 13,
  body: 15,
  title: 17,
  heading: 22,
  wordmark: 34,
};

export const FONT_WEIGHT = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

export const SHADOWS = StyleSheet.create({
  card: {
    shadowColor: "#1C1917",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  raised: {
    shadowColor: "#1C1917",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: RADIUS.md,
    elevation: 4,
  },
});
