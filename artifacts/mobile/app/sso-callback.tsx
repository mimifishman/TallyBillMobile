import { useAuth } from "@clerk/expo";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";

WebBrowser.maybeCompleteAuthSession();

/**
 * Landing screen for the OAuth redirect deep link.
 *
 * The screen that started the SSO flow (login/register) normally completes
 * the flow and navigates away itself. Everything here is a fallback so the
 * user can never be left stranded on a blank screen:
 * - signed in: go home after a short beat (giving the originating screen a
 *   chance to do its own navigation first, e.g. register routing new users
 *   to the name screen — if it does, this screen loses focus and the timer
 *   is cleared)
 * - not signed in: wait for any in-flight session activation to finish,
 *   then return to the login screen (going back preserves its state, so an
 *   inline error message set by the OAuth handler stays visible)
 */
export default function SSOCallback() {
  const colors = useColors();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isLoaded) return undefined;
      // The originating login/register screen owns the post-auth
      // destination (home vs. the new-user name screen) — this screen must
      // never pick one itself while that screen exists beneath us. Timers
      // are only bounded fallbacks so the user is never stranded here.
      let timer: ReturnType<typeof setTimeout>;
      if (isSignedIn && !router.canGoBack()) {
        // Cold start straight into the deep link with a persisted session:
        // no originating screen exists, so going home is ours to do.
        timer = setTimeout(() => router.replace("/"), 400);
      } else if (isSignedIn) {
        // Signed in mid-flow: the handler beneath will navigate any moment.
        // If it somehow never does, return to that screen (it decides where
        // to go) instead of overriding its route.
        timer = setTimeout(() => router.back(), 8000);
      } else {
        timer = setTimeout(() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(auth)/login");
        }, 5000);
      }
      return () => clearTimeout(timer);
    }, [isLoaded, isSignedIn]),
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});
