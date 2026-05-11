import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function JoinScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [joinCode, setJoinCode] = useState("");

  const handleJoinBill = () => {
    if (!joinCode.trim()) {
      Alert.alert("Error", "Please enter a join code");
      return;
    }
    router.push({ pathname: "/bill/join", params: { code: joinCode.toUpperCase() } });
    setJoinCode("");
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
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 24,
            paddingBottom: insets.bottom + 40,
          },
        ]}
      >
        <View style={styles.hero}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
            <Feather name="user-plus" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Join a Bill</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Enter the 6-character code shared by the bill owner
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>JOIN CODE</Text>
          <TextInput
            style={[
              styles.codeInput,
              {
                borderColor: joinCode.length > 0 ? colors.primary : colors.border,
                color: colors.foreground,
                backgroundColor: colors.background,
              },
            ]}
            placeholder="ABC123"
            placeholderTextColor={colors.mutedForeground}
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="characters"
            maxLength={6}
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleJoinBill}
          />
          <TouchableOpacity
            style={[
              styles.joinBtn,
              {
                backgroundColor:
                  joinCode.length === 6 ? colors.primary : colors.muted,
              },
            ]}
            onPress={handleJoinBill}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.joinBtnText,
                { color: joinCode.length === 6 ? "#fff" : colors.mutedForeground },
              ]}
            >
              Join Bill
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 24,
  },
  hero: {
    alignItems: "center",
    gap: 10,
    paddingTop: 16,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  codeInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    letterSpacing: 6,
    textAlign: "center",
  },
  joinBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  joinBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
