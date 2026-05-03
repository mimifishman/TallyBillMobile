import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  useGetBillByCode,
  getGetBillByCodeQueryKey,
  useJoinBill,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { rememberBillCode } from "@/lib/billCodeStore";

export default function DeepLinkBillScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const colors = useColors();
  const { user, isLoading: authLoading } = useAuth();
  const joinCode = (code ?? "").toUpperCase();

  const { data, isLoading, error } = useGetBillByCode(joinCode, {
    query: { queryKey: getGetBillByCodeQueryKey(joinCode), enabled: !!joinCode },
  });

  const joinMutation = useJoinBill();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    if (authLoading || isLoading) return;
    if (error || !data) return;
    handledRef.current = true;

    const billId = data.bill.id;
    // Remember the join code so subsequent per-bill API calls (which only
    // know the billId) can attach the X-Join-Code capability header. This
    // is what lets signed-out users edit the shared bill in-app without
    // logging in.
    rememberBillCode(billId, joinCode);

    if (user) {
      // Signed-in users also get added as a member (idempotent on the
      // server) so the bill shows up in their list. Fire-and-forget;
      // navigation does not block on the join.
      joinMutation.mutate({ data: { joinCode } });
    }

    router.replace(`/bill/${billId}`);
  }, [authLoading, isLoading, error, data, user, joinCode, joinMutation]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {error ? (
        <>
          <Text style={[styles.title, { color: colors.foreground }]}>Bill not found</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            The link may be invalid or the bill was deleted.
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.sub, { color: colors.mutedForeground, marginTop: 16 }]}>
            Opening bill {joinCode}…
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 20, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
