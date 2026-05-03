import type { ExpoConfig } from "expo/config";

// Universal-link / app-link host. In dev `EXPO_PUBLIC_DOMAIN` is set to
// the Replit dev domain by the workflow; in prod it should be set to the
// deploy domain. If neither is provided we fall back to the placeholder
// `tallybill.app` so the manifest is still valid; tapping a link from
// that host won't open the app until the deploy domain is wired up and
// AASA / assetlinks files are served from it.
const linkHost = process.env.EXPO_PUBLIC_DOMAIN || "tallybill.app";

const config: ExpoConfig = {
  name: "TallyBill Mobile",
  slug: "mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "mobile",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash.png",
    resizeMode: "contain",
    backgroundColor: "#16A34A",
  },
  ios: {
    supportsTablet: false,
    associatedDomains: [`applinks:${linkHost}`],
  },
  android: {
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: linkHost, pathPrefix: "/b/" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    favicon: "./assets/images/icon.png",
  },
  plugins: [
    [
      "expo-router",
      {
        origin: "https://replit.com/",
      },
    ],
    "expo-font",
    "expo-web-browser",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
