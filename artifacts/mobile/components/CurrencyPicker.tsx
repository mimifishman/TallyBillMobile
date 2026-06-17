import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

const CURRENCIES: Currency[] = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "RUB", name: "Russian Ruble", symbol: "₽" },
  { code: "PLN", name: "Polish Zloty", symbol: "zł" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱" },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft" },
  { code: "RON", name: "Romanian Leu", symbol: "lei" },
  { code: "CLP", name: "Chilean Peso", symbol: "CL$" },
  { code: "COP", name: "Colombian Peso", symbol: "CO$" },
  { code: "ARS", name: "Argentine Peso", symbol: "AR$" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "TWD", name: "Taiwan Dollar", symbol: "NT$" },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨" },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳" },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫" },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴" },
  { code: "QAR", name: "Qatari Riyal", symbol: "﷼" },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD" },
  { code: "MAD", name: "Moroccan Dirham", symbol: "MAD" },
];

interface CurrencyPickerProps {
  value: string;
  onChange: (code: string) => void;
}

export function CurrencyPicker({ value, onChange }: CurrencyPickerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = CURRENCIES.find((c) => c.code === value);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q)
    );
  }, [search]);

  const handleSelect = (code: string) => {
    onChange(code);
    setOpen(false);
    setSearch("");
  };

  const handleClear = () => {
    onChange("");
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.trigger,
          {
            borderColor: value ? colors.primary : colors.border,
            backgroundColor: colors.background,
          },
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        {value ? (
          <>
            <Text style={[styles.triggerCode, { color: colors.foreground }]}>{value}</Text>
            {selected && (
              <Text style={[styles.triggerSymbol, { color: colors.mutedForeground }]}>
                {selected.symbol}
              </Text>
            )}
          </>
        ) : (
          <Text style={[styles.triggerPlaceholder, { color: colors.mutedForeground }]}>None</Text>
        )}
        <Feather name="chevron-down" size={14} color={colors.mutedForeground} style={styles.chevron} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Select Currency</Text>
            <TouchableOpacity onPress={() => { setOpen(false); setSearch(""); }} style={styles.closeBtn}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View style={[styles.searchWrap, { borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search by code or name..."
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Feather name="x-circle" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <TouchableOpacity
                style={[styles.noneRow, { borderBottomColor: colors.border }]}
                onPress={handleClear}
                activeOpacity={0.7}
              >
                <View style={[styles.noneIcon, { backgroundColor: colors.muted }]}>
                  <Feather name="slash" size={14} color={colors.mutedForeground} />
                </View>
                <View style={styles.currencyInfo}>
                  <Text style={[styles.currencyCode, { color: colors.foreground }]}>None</Text>
                  <Text style={[styles.currencyName, { color: colors.mutedForeground }]}>No currency</Text>
                </View>
                {!value && <Feather name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
            }
            renderItem={({ item }) => {
              const isSelected = item.code === value;
              return (
                <TouchableOpacity
                  style={[
                    styles.currencyRow,
                    { borderBottomColor: colors.border },
                    isSelected && { backgroundColor: colors.primarySoft },
                  ]}
                  onPress={() => handleSelect(item.code)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.symbolBadge, { backgroundColor: isSelected ? colors.primarySoft : colors.muted }]}>
                    <Text style={[styles.symbolText, { color: isSelected ? colors.primary : colors.mutedForeground }]}>
                      {item.symbol}
                    </Text>
                  </View>
                  <View style={styles.currencyInfo}>
                    <Text style={[styles.currencyCode, { color: colors.foreground }]}>{item.code}</Text>
                    <Text style={[styles.currencyName, { color: colors.mutedForeground }]}>{item.name}</Text>
                  </View>
                  {isSelected && <Feather name="check" size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No currencies found</Text>
              </View>
            }
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 13,
    gap: 6,
    minWidth: 90,
  },
  triggerCode: {
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_600SemiBold",
  },
  triggerSymbol: {
    fontSize: FONT_SIZE.caption,
    fontFamily: "Inter_400Regular",
  },
  triggerPlaceholder: {
    fontSize: 14, // TODO: one-off
    fontFamily: "Inter_400Regular",
  },
  chevron: {
    marginLeft: "auto",
  },
  sheet: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 18, // TODO: one-off
    fontFamily: "Inter_600SemiBold",
  },
  closeBtn: {
    padding: SPACING.xs,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: RADIUS.sm,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_400Regular",
  },
  noneRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 14,
  },
  noneIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  currencyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    paddingVertical: 13,
    borderBottomWidth: 1,
    gap: 14,
  },
  symbolBadge: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  symbolText: {
    fontSize: 14, // TODO: one-off
    fontFamily: "Inter_700Bold",
  },
  currencyInfo: {
    flex: 1,
  },
  currencyCode: {
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_600SemiBold",
  },
  currencyName: {
    fontSize: 12, // TODO: one-off
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  empty: {
    paddingTop: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14, // TODO: one-off
    fontFamily: "Inter_400Regular",
  },
});
