import { Feather } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import { customFetch } from "@workspace/api-client-react";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useAuth } from "@/context/AuthContext";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";

export default function NameScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoaded } = useUser();
  const { setDbProfile, setDisplayNameOverride } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      if (user.firstName) setFirstName(user.firstName);
      if (user.lastName) setLastName(user.lastName);
    }
  }, [user?.firstName, user?.lastName]);

  const handleSave = async () => {
    if (!firstName.trim()) {
      Alert.alert("Required", "Please enter your first name");
      return;
    }
    if (!user) return;
    setSaving(true);
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    try {
      await user.update({
        firstName: trimmedFirst,
        lastName: trimmedLast || "",
      });
    } catch (err) {
      if (__DEV__) {
        console.warn("[name.update Clerk error - ignored]", err);
      }
    }

    try {
      await customFetch("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName: trimmedFirst, lastName: trimmedLast || null }),
        headers: { "Content-Type": "application/json" },
      });
      setDbProfile(trimmedFirst, trimmedLast || null);
      const displayName = [trimmedFirst, trimmedLast].filter(Boolean).join(" ");
      if (displayName) setDisplayNameOverride(displayName);
    } catch (err) {
      if (__DEV__) {
        console.warn("[name.update API sync error]", err);
      }
      Alert.alert(
        "Couldn't save your name",
        "Please check your connection and try again.",
      );
      setSaving(false);
      return;
    }

    setSaving(false);
    router.replace("/");
  };

  if (!isLoaded) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.header}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primary + "18" }]}>
            <Feather name="user" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>What's your name?</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            This helps us personalise your experience
          </Text>
        </View>

        <View style={styles.form}>
          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <Feather name="user" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="First Name"
              placeholderTextColor={colors.mutedForeground}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoFocus
              returnKeyType="next"
            />
          </View>

          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, { color: colors.foreground, paddingLeft: 28 }]}
              placeholder="Last Name (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  container: { flex: 1, paddingHorizontal: SPACING.xl, justifyContent: "center" },
  header: { alignItems: "center", marginBottom: 40, gap: 10 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xs,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", textAlign: "center" }, // TODO: one-off
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" }, // TODO: one-off
  form: { gap: SPACING.md },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  input: { flex: 1, fontSize: FONT_SIZE.body, fontFamily: "Inter_400Regular" },
  primaryBtn: { borderRadius: RADIUS.sm, paddingVertical: SPACING.lg, alignItems: "center", marginTop: SPACING.sm },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
});
