import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useRef } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { PressableScale } from "@/components/PressableScale";
import * as Haptics from "expo-haptics";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";

export default function JoinScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  const handleCodeChange = (text: string, index: number) => {
    const val = text.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const newCode = [...code];
    newCode[index] = val;
    setCode(newCode);

    if (val && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleJoinBill = () => {
    const joinCode = code.join("");
    if (joinCode.length < 6) {
      Alert.alert("Hold up", "Please enter the full 6-character code");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push({ pathname: "/bill/join", params: { code: joinCode } });
    setCode(["", "", "", "", "", ""]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 40,
            paddingBottom: insets.bottom + 40,
          },
        ]}
      >
        <View style={styles.hero}>
          <Text style={[styles.wordmark, { color: colors.primary }]}>TallyBill</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Enter your join code</Text>
        </View>

        <View style={styles.inputContainer}>
          {code.map((char, index) => (
            <TextInput
              key={index}
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              style={[
                styles.cell,
                {
                  backgroundColor: colors.card,
                  borderColor: char ? colors.primary : colors.border,
                  color: colors.foreground,
                },
              ]}
              value={char}
              onChangeText={(text) => handleCodeChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              maxLength={1}
              autoCapitalize="characters"
              autoCorrect={false}
              keyboardType="default"
              selectTextOnFocus
            />
          ))}
        </View>

        <PressableScale
          style={[
            styles.joinBtn,
            {
              backgroundColor: code.join("").length === 6 ? colors.primary : colors.muted,
            },
          ]}
          onPress={handleJoinBill}
          disabled={code.join("").length !== 6}
        >
          <Text
            style={[
              styles.joinBtnText,
              { color: code.join("").length === 6 ? "#fff" : colors.mutedForeground },
            ]}
          >
            I'm in!
          </Text>
        </PressableScale>

        <Text style={[styles.subline, { color: colors.mutedForeground }]}>
          Got a link? Just tap it — no code needed.
        </Text>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.xxxl,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    alignItems: "center",
    gap: SPACING.lg,
  },
  wordmark: {
    fontSize: 28, // TODO: one-off
    fontFamily: "Inter_700Bold",
  },
  title: {
    fontSize: FONT_SIZE.heading,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  inputContainer: {
    flexDirection: "row",
    gap: SPACING.sm,
    justifyContent: "center",
  },
  cell: {
    width: 52,
    height: 60,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderBottomWidth: 3,
    fontSize: 24, // TODO: one-off
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  joinBtn: {
    borderRadius: RADIUS.full,
    paddingVertical: 18,
    paddingHorizontal: SPACING.xxxl,
    alignItems: "center",
    width: "100%",
  },
  joinBtnText: {
    fontSize: 18, // TODO: one-off
    fontFamily: "Inter_700Bold",
  },
  subline: {
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
