import { Feather } from "@expo/vector-icons";
import React, { useState, useMemo } from "react";
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

export const COMMON_LANGUAGES = [
  "Afrikaans",
  "Arabic",
  "Bengali",
  "Bulgarian",
  "Catalan",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Croatian",
  "Czech",
  "Danish",
  "Dutch",
  "English",
  "Estonian",
  "Finnish",
  "French",
  "German",
  "Greek",
  "Gujarati",
  "Hebrew",
  "Hindi",
  "Hungarian",
  "Indonesian",
  "Italian",
  "Japanese",
  "Kannada",
  "Korean",
  "Latvian",
  "Lithuanian",
  "Malay",
  "Marathi",
  "Norwegian",
  "Persian",
  "Polish",
  "Portuguese",
  "Romanian",
  "Russian",
  "Serbian",
  "Slovak",
  "Slovenian",
  "Spanish",
  "Swahili",
  "Swedish",
  "Tamil",
  "Telugu",
  "Thai",
  "Turkish",
  "Ukrainian",
  "Urdu",
  "Vietnamese",
];

interface LanguagePickerProps {
  visible: boolean;
  selectedLanguage: string | null;
  onConfirm: (language: string) => void;
  onClose: () => void;
}

export function LanguagePicker({ visible, selectedLanguage, onConfirm, onClose }: LanguagePickerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(selectedLanguage);

  React.useEffect(() => {
    if (visible) {
      setPending(selectedLanguage);
      setSearch("");
    }
  }, [visible, selectedLanguage]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? COMMON_LANGUAGES.filter((l) => l.toLowerCase().includes(q)) : COMMON_LANGUAGES;
    if (!q && pending && COMMON_LANGUAGES.includes(pending)) {
      return [pending, ...list.filter((l) => l !== pending)];
    }
    return list;
  }, [search, pending]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Choose Language</Text>
          <TouchableOpacity
            onPress={() => { if (pending) onConfirm(pending); }}
            style={styles.doneBtn}
            disabled={!pending}
          >
            <Text style={[styles.doneText, { color: pending ? colors.primary : colors.mutedForeground }]}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search languages…"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          renderItem={({ item }) => {
            const selected = item === pending;
            return (
              <TouchableOpacity
                style={[
                  styles.row,
                  { borderBottomColor: colors.border },
                  selected && { backgroundColor: colors.card },
                ]}
                onPress={() => setPending(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.rowText, { color: selected ? colors.primary : colors.foreground }]}>
                  {item}
                </Text>
                {selected && <Feather name="check" size={16} color={colors.primary} />}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>No languages found</Text>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  cancelBtn: { padding: SPACING.xs, minWidth: 64 },
  cancelText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_400Regular" },
  title: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  doneBtn: { padding: SPACING.xs, minWidth: 64, alignItems: "flex-end" },
  doneText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 }, // TODO: one-off
  list: { paddingHorizontal: SPACING.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
  },
  rowText: { flex: 1, fontSize: FONT_SIZE.body, fontFamily: "Inter_400Regular" },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14, fontFamily: "Inter_400Regular" }, // TODO: one-off
});
