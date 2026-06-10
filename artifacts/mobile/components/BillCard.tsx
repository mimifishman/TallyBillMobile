import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { getCurrencySymbol } from "@/utils/currency";
import { PersonBadge } from "./PersonBadge";

interface BillCardParticipant {
  name: string;
  color: string;
}

interface BillCardProps {
  title: string;
  restaurantName?: string | null;
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
  restaurantName,
  date,
  currency,
  joinCode,
  participants,
  status = "open",
  isOwner = false,
  onPress,
}: BillCardProps) {
  const colors = useColors();
  const accentColor = status === "settled" ? colors.settled : colors.accent;
  const headerColors: [string, string] =
    status === "settled"
      ? [colors.card, colors.muted]
      : [colors.card, colors.accentSoft];

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.statusBar, { backgroundColor: accentColor }]} />
      <LinearGradient
        colors={headerColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.body}
      >
        <View style={styles.topRow}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
            <Feather name="file-text" size={18} color={colors.primary} />
          </View>
          <View style={styles.info}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
            {restaurantName ? (
              <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={1}>{restaurantName}</Text>
            ) : null}
            <View style={styles.meta}>
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{date}</Text>
              {currency ? (
                <>
                  <Text style={[styles.metaDot, { color: colors.mutedForeground }]}>·</Text>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{getCurrencySymbol(currency)}</Text>
                </>
              ) : null}
            </View>
          </View>
          <View style={[styles.codeBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.codeText, { color: colors.mutedForeground }]}>{joinCode}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </View>

        {(participants && participants.length > 0) || isOwner ? (
          <View style={styles.peopleRow}>
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
            </View>
            {isOwner ? (
              <View style={[styles.ownerBadge, { backgroundColor: colors.primarySoft }]}>
                <Feather name="star" size={10} color={colors.primary} />
                <Text style={[styles.ownerText, { color: colors.primary }]}>Owner</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  statusBar: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaDot: { fontSize: 12 },
  codeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  codeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  peopleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 52 },
  avatarGroup: { flexDirection: "row", alignItems: "center" },
  overlapBadge: { marginLeft: -10 },
  ownerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  ownerText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  moreBadge: {
    marginLeft: -10,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { fontSize: 11, fontFamily: "Inter_700Bold" },
});
