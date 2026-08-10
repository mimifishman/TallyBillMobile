import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { getCurrencySymbol } from "@/utils/currency";
import { PersonBadge } from "./PersonBadge";
import { PressableScale } from "./PressableScale";
import { FONT_SIZE, RADIUS, SHADOWS, SPACING } from "@/constants/styles";

interface BillCardParticipant {
  name: string;
  color: string;
}

interface BillCardProps {
  title: string;
  date: string;
  currency?: string | null;
  joinCode: string;
  participants?: BillCardParticipant[] | null;
  status?: "open" | "settled";
  isOwner?: boolean;
  onPress: () => void;
}

export function BillCard({
  title,
  date,
  currency,
  joinCode,
  participants,
  status = "open",
  isOwner = false,
  onPress,
}: BillCardProps) {
  const colors = useColors();
  const firstColor = participants && participants.length > 0 ? participants[0].color : colors.primary;
  const accentColor = status === "settled" ? colors.settled : firstColor;

  return (
    <PressableScale
      style={[styles.card, SHADOWS.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
    >
      <View style={[styles.statusBar, { backgroundColor: accentColor }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.info}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
            <View style={styles.meta}>
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{date}</Text>
              {currency ? (
                <>
                  <Text style={[styles.metaDot, { color: colors.mutedForeground }]}>·</Text>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{getCurrencySymbol(currency)}</Text>
                </>
              ) : null}
              <Text style={[styles.metaDot, { color: colors.mutedForeground }]}>·</Text>
              <Text style={[styles.codeText, { color: colors.mutedForeground }]}>{joinCode}</Text>
            </View>
          </View>
          <View style={[styles.pillBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.pillBadgeText, { color: colors.mutedForeground }]}>
              {participants?.length || 0} {(participants?.length || 0) === 1 ? 'person' : 'people'}
            </Text>
          </View>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.avatarGroup}>
            {participants && participants.slice(0, 5).map((p, i) => (
              <View key={i} style={i > 0 ? styles.overlapBadge : undefined}>
                <PersonBadge name={p.name} color={p.color} size="sm" />
              </View>
            ))}
            {participants && participants.length > 5 ? (
              <View style={[styles.moreBadge, { backgroundColor: colors.muted, borderColor: colors.card }]}>
                <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
                  +{participants.length - 5}
                </Text>
              </View>
            ) : null}
            {(!participants || participants.length === 0) && (
              <View style={[styles.emptyBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Feather name="user" size={12} color={colors.mutedForeground} />
              </View>
            )}
          </View>
          
          {isOwner ? (
            <View style={[styles.ownerBadge, { backgroundColor: colors.primarySoft }]}>
              <Feather name="star" size={10} color={colors.primaryText} />
              <Text style={[styles.ownerText, { color: colors.primaryText }]}>Owner</Text>
            </View>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.md,
    overflow: "hidden",
  },
  statusBar: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: SPACING.xl,
    gap: SPACING.lg,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  info: { flex: 1, gap: SPACING.xs },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" }, // TODO: one-off
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_500Medium" },
  metaDot: { fontSize: FONT_SIZE.caption },
  codeText: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  pillBadge: { paddingHorizontal: 10, paddingVertical: SPACING.xs, borderRadius: RADIUS.full },
  pillBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  avatarGroup: { flexDirection: "row", alignItems: "center" },
  overlapBadge: { marginLeft: -SPACING.sm },
  emptyBadge: {
    width: 28,
    height: 28,
    borderRadius: 14, // TODO: one-off (circular: half of 28px)
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ownerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: 10,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  ownerText: { fontSize: 11, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  moreBadge: {
    marginLeft: -SPACING.sm,
    width: 28,
    height: 28,
    borderRadius: 14, // TODO: one-off (circular: half of 28px)
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { fontSize: 11, fontFamily: "Inter_700Bold" }, // TODO: one-off
});
