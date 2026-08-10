import { Feather } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useColorScheme,
} from "react-native";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { useColors } from "@/hooks/useColors";

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(s: string): Date {
  const parts = (s ?? "").split("-").map((n) => parseInt(n, 10));
  const [y, m, d] = parts;
  if (y && m && d) return new Date(y, m - 1, d);
  return new Date();
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Cross-platform date field backed by the native OS date picker.
 *
 * - Android: taps open the standard Material date dialog.
 * - iOS: taps open an inline calendar in a dismissible sheet.
 *
 * `value`/`onChange` use ISO "YYYY-MM-DD" strings so the field is a
 * drop-in replacement for the previous free-text date inputs.
 */
export function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  const scheme = useColorScheme();
  const [show, setShow] = useState(false);
  const date = parseYMD(value);

  const handleAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShow(false);
    if (event.type === "set" && selected) onChange(toYMD(selected));
  };

  const handleIOSChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (selected) onChange(toYMD(selected));
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setShow(true)}
        style={[styles.field, { borderColor: colors.border }]}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Date: ${formatDisplay(date)}. Tap to change.`}
      >
        <Text style={[styles.value, { color: colors.foreground }]}>{formatDisplay(date)}</Text>
        <Feather name="calendar" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>

      {Platform.OS === "ios" ? (
        <Modal
          visible={show}
          transparent
          animationType="fade"
          onRequestClose={() => setShow(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShow(false)}>
            <View style={styles.overlay}>
              <TouchableWithoutFeedback>
                <View style={[styles.sheet, { backgroundColor: colors.card }]}>
                  <DateTimePicker
                    value={date}
                    mode="date"
                    display="inline"
                    themeVariant={scheme === "dark" ? "dark" : "light"}
                    accentColor={colors.primary}
                    onChange={handleIOSChange}
                  />
                  <TouchableOpacity
                    onPress={() => setShow(false)}
                    style={[styles.doneBtn, { backgroundColor: colors.primary }]}
                  >
                    <Text style={styles.doneText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      ) : (
        show && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={handleAndroidChange}
          />
        )
      )}
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: SPACING.sm,
  },
  value: { fontSize: FONT_SIZE.body, fontFamily: "Inter_400Regular" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
  },
  sheet: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  doneBtn: {
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  doneText: { color: "#fff", fontSize: FONT_SIZE.body, fontFamily: "Inter_700Bold" },
});
