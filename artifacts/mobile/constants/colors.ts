const colors = {
  light: {
    text: "#0F172A",
    tint: "#10B981",

    background: "#FAFAFA",
    foreground: "#0F172A",

    card: "#FFFFFF",
    cardForeground: "#0F172A",

    surface: "#FFFFFF",
    surfaceRaised: "#F8FAFC",

    primary: "#10B981",
    primaryForeground: "#FFFFFF",
    primaryDark: "#059669",
    primaryLight: "#6EE7B7",
    primarySoft: "#D1FAE5",

    secondary: "#F1F5F9",
    secondaryForeground: "#0F172A",

    pop: "#FB7185",
    popDark: "#F43F5E",
    popSoft: "#FFE4E6",
    popForeground: "#FFFFFF",

    muted: "#F1F5F9",
    mutedForeground: "#64748B",

    accent: "#10B981",
    accentForeground: "#FFFFFF",
    accentSoft: "#D1FAE5",

    destructive: "#EF4444",
    destructiveForeground: "#FFFFFF",

    danger: "#EF4444",
    success: "#16A34A",
    warning: "#F59E0B",

    textPrimary: "#0F172A",
    textSecondary: "#64748B",

    border: "#E2E8F0",
    borderStrong: "#CBD5E1",
    input: "#E2E8F0",

    settled: "#9CA3AF",
    settledActive: "#16A34A",

    settledBackground: "#D1FAE5",
    settledForeground: "#065F46",

    warningBackground: "#FEF3C7",
    warningForeground: "#B45309",

    gradientPrimary: ["#10B981", "#059669"] as [string, string],
    gradientAccent: ["#10B981", "#059669"] as [string, string],
    gradientHeader: ["#FAFAFA", "#F1F5F9"] as [string, string],
    gradientAmber: ["#10B981", "#059669"] as [string, string],

    people: [
      "#E84393",
      "#FF6B35",
      "#2D9CDB",
      "#9B59B6",
      "#0D9488",
      "#F39C12",
      "#E74C3C",
      "#1ABC9C",
      "#5C6BC0",
      "#FF7043",
      "#26C6DA",
      "#8D6E63",
      "#C0CA33",
      "#EC407A",
      "#78909C",
      "#FF8F00",
    ],

    peopleGradients: [
      ["#EC4899", "#F472B6"],
      ["#F97316", "#FBBF24"],
      ["#3B82F6", "#6366F1"],
      ["#8B5CF6", "#C084FC"],
      ["#0D9488", "#2DD4BF"],
      ["#F59E0B", "#FCD34D"],
      ["#EF4444", "#F87171"],
      ["#06B6D4", "#22D3EE"],
      ["#5C6BC0", "#7986CB"],
      ["#FF7043", "#FF8A65"],
      ["#26C6DA", "#4DD0E1"],
      ["#8D6E63", "#A1887F"],
      ["#C0CA33", "#DCE775"],
      ["#EC407A", "#F48FB1"],
      ["#78909C", "#90A4AE"],
      ["#FF8F00", "#FFA000"],
    ] as [string, string][],
  },

  dark: {
    text: "#E6EDF3",
    tint: "#34D399",

    background: "#0B0F14",
    foreground: "#E6EDF3",

    card: "#161B22",
    cardForeground: "#E6EDF3",

    surface: "#161B22",
    surfaceRaised: "#1C2128",

    primary: "#34D399",
    primaryForeground: "#FFFFFF",
    primaryDark: "#10B981",
    primaryLight: "#6EE7B7",
    primarySoft: "#064E3B",

    secondary: "#1C2128",
    secondaryForeground: "#E6EDF3",

    pop: "#FB7185",
    popDark: "#F43F5E",
    popSoft: "#4C0D1A",
    popForeground: "#FFFFFF",

    muted: "#1C2128",
    mutedForeground: "#8B949E",

    accent: "#34D399",
    accentForeground: "#FFFFFF",
    accentSoft: "#064E3B",

    destructive: "#F87171",
    destructiveForeground: "#FFFFFF",

    danger: "#F87171",
    success: "#34D399",
    warning: "#FBBF24",

    textPrimary: "#E6EDF3",
    textSecondary: "#8B949E",

    border: "#2D333B",
    borderStrong: "#444C56",
    input: "#2D333B",

    settled: "#6B7280",
    settledActive: "#34D399",

    settledBackground: "#052E16",
    settledForeground: "#34D399",

    warningBackground: "#1C1200",
    warningForeground: "#FCD34D",

    gradientPrimary: ["#34D399", "#10B981"] as [string, string],
    gradientAccent: ["#34D399", "#10B981"] as [string, string],
    gradientHeader: ["#0B0F14", "#161B22"] as [string, string],
    gradientAmber: ["#FBBF24", "#F59E0B"] as [string, string],

    people: [
      "#E84393",
      "#FF6B35",
      "#2D9CDB",
      "#9B59B6",
      "#14B8A6",
      "#F39C12",
      "#E74C3C",
      "#1ABC9C",
      "#7986CB",
      "#FF7043",
      "#26C6DA",
      "#A07858",
      "#C0CA33",
      "#EC407A",
      "#94A3B8",
      "#FF8F00",
    ],

    peopleGradients: [
      ["#EC4899", "#F472B6"],
      ["#F97316", "#FBBF24"],
      ["#3B82F6", "#6366F1"],
      ["#8B5CF6", "#C084FC"],
      ["#0D9488", "#2DD4BF"],
      ["#F59E0B", "#FCD34D"],
      ["#EF4444", "#F87171"],
      ["#06B6D4", "#22D3EE"],
      ["#5C6BC0", "#7986CB"],
      ["#FF7043", "#FF8A65"],
      ["#26C6DA", "#4DD0E1"],
      ["#8D6E63", "#A1887F"],
      ["#C0CA33", "#DCE775"],
      ["#EC407A", "#F48FB1"],
      ["#78909C", "#90A4AE"],
      ["#FF8F00", "#FFA000"],
    ] as [string, string][],
  },

  radius: 20,
  radiusSm: 8,
  radiusMd: 16,
  radiusLg: 20,
  radiusXl: 28,
  radiusFull: 999,
};

export default colors;
