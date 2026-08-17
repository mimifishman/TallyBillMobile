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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl, setExtraHeadersGetter } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { billIdFromUrl, getBillCode } from "@/lib/billCodeStore";
import { getOrCreateGuestOwnerId, getCachedGuestOwnerId } from "@/utils/guestBillStore";

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

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

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
// Only use proxy for production keys — dev instances (pk_test_) don't support
// Frontend API proxying and will return host_invalid if a proxy URL is set.
const proxyUrl =
  publishableKey?.startsWith("pk_test_")
    ? undefined
    : process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 400 });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
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

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      tokenCache={tokenCache}
      proxyUrl={proxyUrl}
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
