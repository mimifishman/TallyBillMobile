import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useGetBill, useJoinBill, getGetBillQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "expo-router";
import { rememberBillCode } from "@/lib/billCodeStore";

export default function ShareScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = parseInt(id!);
  const { user } = useAuth();
  const nav = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const { data } = useGetBill(billId, { query: { queryKey: getGetBillQueryKey(billId) } });
  const bill = data?.bill;

  // Remember the join code so per-bill requests automatically attach the
  // X-Join-Code capability header from this point on (covers the case
  // where a signed-in user opens the share screen and we want subsequent
  // background calls to carry the capability too).
  useEffect(() => {
    if (bill?.id && bill?.joinCode) rememberBillCode(bill.id, bill.joinCode);
  }, [bill?.id, bill?.joinCode]);

  // Always use the production domain for share links — this URL is for
  // recipients, not the app itself, so it must always point to tallybill.app
  // regardless of whether the app is running in dev or prod.
  const shareUrl = bill?.joinCode ? `https://tallybill.app/b/${bill.joinCode}` : null;

  const joinMutation = useJoinBill({
    mutation: {
      onSuccess: (joinedBill) => {
        nav.push(`/bill/${joinedBill.id}`);
      },
      onError: (err: Error) => {
        Alert.alert("Error", err.message || "Could not join bill. Check the code and try again.");
      },
    },
  });

  const handleCopy = async () => {
    if (!bill?.joinCode) return;
    await Clipboard.setStringAsync(bill.joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    await Clipboard.setStringAsync(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleShareLink = async () => {
    if (!shareUrl || !bill) return;
    try {
      await Share.share({
        message: `Join me on "${bill.title}" — split the bill: ${shareUrl}`,
        url: shareUrl,
        title: bill.title,
      });
    } catch {
      // user cancelled
    }
  };

  const handleJoin = () => {
    if (!joinCode.trim()) {
      Alert.alert("Error", "Please enter a join code");
      return;
    }
    if (!user) {
      Alert.alert("Sign in required", "You need to sign in to join a bill", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/(auth)/login") },
      ]);
      return;
    }
    joinMutation.mutate({ data: { joinCode: joinCode.toUpperCase() } });
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Share & Join</Text>
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        {bill && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SHARE THIS BILL</Text>
            <View style={[styles.codeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>Join code</Text>
              <Text style={[styles.code, { color: colors.foreground }]}>{bill.joinCode}</Text>
              <Text style={[styles.codeSub, { color: colors.mutedForeground }]}>
                Share this code with others so they can join and collaborate on "{bill.title}"
              </Text>
              <TouchableOpacity
                style={[styles.copyBtn, { backgroundColor: copied ? colors.primary : colors.muted }]}
                onPress={handleCopy}
              >
                <Feather name={copied ? "check" : "copy"} size={16} color={copied ? "#fff" : colors.foreground} />
                <Text style={[styles.copyBtnText, { color: copied ? "#fff" : colors.foreground }]}>
                  {copied ? "Copied!" : "Copy Code"}
                </Text>
              </TouchableOpacity>
            </View>

            {shareUrl && (
              <View style={[styles.linkCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.linkLabel, { color: colors.mutedForeground }]}>Share link</Text>
                <Text style={[styles.linkUrl, { color: colors.foreground }]}>
                  {shareUrl}
                </Text>
                <Text style={[styles.linkSub, { color: colors.mutedForeground }]}>
                  Opens in a browser — no app or sign-in needed.
                </Text>
                <View style={styles.linkBtnRow}>
                  <TouchableOpacity
                    style={[styles.linkBtn, { backgroundColor: colors.primary }]}
                    onPress={handleShareLink}
                  >
                    <Feather name="share-2" size={16} color="#fff" />
                    <Text style={[styles.linkBtnText, { color: "#fff" }]}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.linkBtn, { backgroundColor: linkCopied ? colors.primary : colors.muted }]}
                    onPress={handleCopyLink}
                  >
                    <Feather
                      name={linkCopied ? "check" : "link"}
                      size={16}
                      color={linkCopied ? "#fff" : colors.foreground}
                    />
                    <Text style={[styles.linkBtnText, { color: linkCopied ? "#fff" : colors.foreground }]}>
                      {linkCopied ? "Copied!" : "Copy Link"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={[styles.divider, { borderTopColor: colors.border }]} />

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>JOIN ANOTHER BILL</Text>
          <View style={[styles.joinCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.joinLabel, { color: colors.foreground }]}>Enter join code</Text>
            <Text style={[styles.joinSub, { color: colors.mutedForeground }]}>
              {user ? "Enter the 6-character code from the bill owner" : "You need to sign in to join a bill"}
            </Text>
            <View style={styles.joinRow}>
              <TextInput
                style={[styles.joinInput, { borderColor: colors.border, color: colors.foreground }]}
                placeholder="ABC123"
                placeholderTextColor={colors.mutedForeground}
                value={joinCode}
                onChangeText={setJoinCode}
                autoCapitalize="characters"
                maxLength={6}
              />
              <TouchableOpacity
                style={[styles.joinBtn, { backgroundColor: colors.primary }]}
                onPress={handleJoin}
                disabled={joinMutation.isPending}
              >
                {joinMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.joinBtnText}>Join</Text>
                )}
              </TouchableOpacity>
            </View>
            {!user && (
              <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
                <Text style={[styles.signInLink, { color: colors.primary }]}>Sign in to join bills</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 20, gap: 24 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, paddingHorizontal: 4 },
  codeCard: { borderRadius: 14, borderWidth: 1, padding: 20, alignItems: "center", gap: 8 },
  codeLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  code: { fontSize: 36, fontFamily: "Inter_700Bold", letterSpacing: 6 },
  codeSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  copyBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  linkCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 6, marginTop: 12 },
  linkLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  linkUrl: { fontSize: 13, fontFamily: "Inter_500Medium" },
  linkSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16, marginTop: 2 },
  linkBtnRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  linkBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 11,
  },
  linkBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  divider: { borderTopWidth: 1 },
  joinCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  joinLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  joinSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  joinRow: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 4 },
  joinInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 4,
    textAlign: "center",
  },
  joinBtn: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  joinBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  signInLink: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
});
