import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useGetBill, getGetBillQueryKey } from "@workspace/api-client-react";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { rememberBillCode } from "@/lib/billCodeStore";

export default function ShareScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = parseInt(id!);
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
        message: Platform.OS === 'ios'
          ? `Join me on "${bill.title}" — split the bill:`
          : `Join me on "${bill.title}" — split the bill: ${shareUrl}`,
        url: shareUrl,
        title: bill.title,
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace(`/bill/${billId}`))}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Share Bill</Text>
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        {bill && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SHARE THIS BILL</Text>
            <View style={[styles.codeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>Join code</Text>
              <Text style={[styles.code, { color: colors.foreground }]}>{bill.joinCode}</Text>
              <Text style={[styles.codeSub, { color: colors.mutedForeground }]}>
                Share this code so others can join and collaborate on "{bill.title}"
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

            <View style={[styles.tipRow, { backgroundColor: colors.primarySoft }]}>
              <Feather name="info" size={14} color={colors.primaryText} />
              <Text style={[styles.tipText, { color: colors.primaryDark }]}>
                To join a different bill, use the Join tab.
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    gap: SPACING.md,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: { fontSize: FONT_SIZE.title, fontFamily: "Inter_600SemiBold" },
  content: { flex: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, gap: SPACING.xxl },
  section: { gap: 10 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, paddingHorizontal: SPACING.xs }, // TODO: one-off
  codeCard: { borderRadius: RADIUS.md, borderWidth: 1, padding: SPACING.xl, alignItems: "center", gap: SPACING.sm },
  codeLabel: { fontSize: 12, fontFamily: "Inter_500Medium" }, // TODO: one-off
  code: { fontSize: 36, fontFamily: "Inter_700Bold", letterSpacing: 6 }, // TODO: one-off
  codeSub: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.xl, paddingVertical: 10, marginTop: SPACING.xs },
  copyBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  linkCard: { borderRadius: RADIUS.md, borderWidth: 1, padding: SPACING.lg, gap: 6, marginTop: SPACING.md },
  linkLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 }, // TODO: one-off
  linkUrl: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_500Medium" },
  linkSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16, marginTop: 2 }, // TODO: one-off
  linkBtnRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  linkBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.sm,
    paddingVertical: 11,
  },
  linkBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginTop: SPACING.md,
  },
  tipText: { flex: 1, fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
