import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkLoaded, ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl, setExtraHeadersGetter } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { billIdFromUrl, getBillCode } from "@/lib/billCodeStore";
import { getOrCreateGuestOwnerId, getCachedGuestOwnerId } from "@/utils/guestBillStore";

// EXPO_PUBLIC_* values are inlined at BUILD time. A release build made
// without them ships with these undefined, which previously surfaced as an
// instant launch crash (ClerkProvider with no key) or requests to
// "https://undefined". Capture them here and fail loudly instead.
const apiDomain = process.env.EXPO_PUBLIC_DOMAIN;
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

const missingEnv = [
  !apiDomain && "EXPO_PUBLIC_DOMAIN",
  !publishableKey && "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
].filter(Boolean) as string[];

if (apiDomain) {
  setBaseUrl(`https://${apiDomain}`);
}

// Warm the guest owner ID cache immediately so the header getter below
// can read it synchronously on the first bill request.
void getOrCreateGuestOwnerId();

// When a request targets a specific bill (`/api/bills/<id>/...`), attach
// the join-code capability header and the guest owner ID so the server
// can determine ownership for guest-created bills.
setExtraHeadersGetter(({ url }) => {
  const billId = billIdFromUrl(url);
  if (!billId) return null;
  const code = getBillCode(billId);
  const guestOwnerId = getCachedGuestOwnerId();
  const headers: Record<string, string> = {};
  if (code) headers["X-Join-Code"] = code;
  if (guestOwnerId) headers["X-Guest-Owner-Id"] = guestOwnerId;
  return Object.keys(headers).length > 0 ? headers : null;
});


SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 400 });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

/**
 * Shown when the build is missing required EXPO_PUBLIC_* configuration.
 * These are inlined at build time, so this is a build/CI problem, not
 * something the user can fix — say so plainly rather than crashing.
 */
function MissingEnvScreen({ missing }: { missing: string[] }) {
  return (
    <SafeAreaProvider>
      <View style={envStyles.container}>
        <Text style={envStyles.title}>This build is misconfigured</Text>
        <Text style={envStyles.body}>
          TallyBill was built without the settings it needs to start. This is a
          problem with the build itself, not with your device or account.
        </Text>
        <Text style={envStyles.label}>Missing at build time</Text>
        {missing.map((name) => (
          <Text key={name} style={envStyles.code}>
            {name}
          </Text>
        ))}
        <Text style={envStyles.footer}>
          If you are testing this build, please report it to support@tallybill.app.
        </Text>
      </View>
    </SafeAreaProvider>
  );
}

const envStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA", padding: 28, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: "#0F172A", marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 22, color: "#5B6779", marginBottom: 24 },
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#5B6779",
    marginBottom: 8,
  },
  code: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    color: "#BE123C",
    marginBottom: 4,
  },
  footer: { fontSize: 13, lineHeight: 20, color: "#5B6779", marginTop: 24 },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  if (missingEnv.length > 0) {
    return <MissingEnvScreen missing={missingEnv} />;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      tokenCache={tokenCache}
    >
      <ClerkLoaded>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <GestureHandlerRootView>
                  <KeyboardProvider>
                    <RootLayoutNav />
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </AuthProvider>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
