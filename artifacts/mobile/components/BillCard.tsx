import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface BillCardProps {
  title: string;
  restaurantName?: string | null;
  date: string;
  currency?: string | null;
  joinCode: string;
  onPress: () => void;
}

export function BillCard({ title, restaurantName, date, currency, joinCode, onPress }: BillCardProps) {
  const colors = useColors();

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.iconWrap}>
        <Feather name="file-text" size={20} color={colors.primary} />
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
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{currency}</Text>
            </>
          ) : null}
        </View>
      </View>
      <View style={[styles.codeBadge, { backgroundColor: colors.muted }]}>
        <Text style={[styles.codeText, { color: colors.mutedForeground }]}>{joinCode}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(31,136,61,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  sub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  metaDot: {
    fontSize: 12,
  },
  codeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
});
