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
    // Emerald dark enough to carry small text at WCAG AA. `primary` itself is
    // a fill colour — at 2.5:1 on white it must never be used for text.
    primaryText: "#047857",
    primaryDark: "#047857",
    primaryLight: "#6EE7B7",
    primarySoft: "#D1FAE5",

    secondary: "#F1F5F9",
    secondaryForeground: "#0F172A",

    pop: "#FB7185",
    popDark: "#BE123C",
    popSoft: "#FFE4E6",
    popForeground: "#FFFFFF",

    muted: "#F1F5F9",
    mutedForeground: "#5B6779",

    accent: "#10B981",
    accentForeground: "#FFFFFF",
    accentSoft: "#D1FAE5",

    destructive: "#DC2626",
    destructiveForeground: "#FFFFFF",

    danger: "#DC2626",
    success: "#16A34A",
    warning: "#F59E0B",

    textPrimary: "#0F172A",
    textSecondary: "#5B6779",

    border: "#E2E8F0",
    borderStrong: "#CBD5E1",
    input: "#E2E8F0",

    settled: "#9CA3AF",
    settledActive: "#16A34A",

    settledBackground: "#D1FAE5",
    settledForeground: "#065F46",

    warningBackground: "#FEF3C7",
    warningForeground: "#92400E",

    gradientPrimary: ["#10B981", "#059669"] as [string, string],
    gradientAccent: ["#10B981", "#059669"] as [string, string],
    gradientHeader: ["#FAFAFA", "#F1F5F9"] as [string, string],
    gradientAmber: ["#10B981", "#059669"] as [string, string],

    people: [
      "#06B6D4",
      "#F97316",
      "#6366F1",
      "#EAB308",
      "#EC4899",
      "#84CC16",
      "#A855F7",
      "#3B82F6",
      "#C026D3",
      "#0EA5E9",
      "#7C3AED",
      "#D97706",
      "#4338CA",
      "#0369A1",
      "#65A30D",
      "#7E22CE",
    ],

    peopleGradients: [
      ["#06B6D4", "#22D3EE"],
      ["#F97316", "#FB923C"],
      ["#6366F1", "#818CF8"],
      ["#EAB308", "#FDE047"],
      ["#EC4899", "#F472B6"],
      ["#84CC16", "#A3E635"],
      ["#A855F7", "#C084FC"],
      ["#3B82F6", "#60A5FA"],
      ["#C026D3", "#D946EF"],
      ["#0EA5E9", "#38BDF8"],
      ["#7C3AED", "#8B5CF6"],
      ["#D97706", "#F59E0B"],
      ["#4338CA", "#6366F1"],
      ["#0369A1", "#0284C7"],
      ["#65A30D", "#84CC16"],
      ["#7E22CE", "#A855F7"],
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
    // On dark surfaces the mint primary already clears AA as text, so
    // `primaryText` mirrors it — the split exists for the light palette.
    primaryText: "#34D399",
    primaryDark: "#34D399",
    primaryLight: "#6EE7B7",
    primarySoft: "#064E3B",

    secondary: "#1C2128",
    secondaryForeground: "#E6EDF3",

    pop: "#FB7185",
    popDark: "#FB7185",
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
      "#06B6D4",
      "#F97316",
      "#6366F1",
      "#EAB308",
      "#EC4899",
      "#84CC16",
      "#A855F7",
      "#3B82F6",
      "#C026D3",
      "#0EA5E9",
      "#7C3AED",
      "#D97706",
      "#4338CA",
      "#0369A1",
      "#65A30D",
      "#7E22CE",
    ],

    peopleGradients: [
      ["#06B6D4", "#22D3EE"],
      ["#F97316", "#FB923C"],
      ["#6366F1", "#818CF8"],
      ["#EAB308", "#FDE047"],
      ["#EC4899", "#F472B6"],
      ["#84CC16", "#A3E635"],
      ["#A855F7", "#C084FC"],
      ["#3B82F6", "#60A5FA"],
      ["#C026D3", "#D946EF"],
      ["#0EA5E9", "#38BDF8"],
      ["#7C3AED", "#8B5CF6"],
      ["#D97706", "#F59E0B"],
      ["#4338CA", "#6366F1"],
      ["#0369A1", "#0284C7"],
      ["#65A30D", "#84CC16"],
      ["#7E22CE", "#A855F7"],
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
