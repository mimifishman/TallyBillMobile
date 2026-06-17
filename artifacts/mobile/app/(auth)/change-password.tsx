import { Feather } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useChangePassword } from "@workspace/api-client-react";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";

export default function ChangePasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user: clerkUser, isLoaded } = useUser();

  const isOAuthUser = isLoaded && clerkUser != null && clerkUser.externalAccounts.length > 0;

  useEffect(() => {
    if (isOAuthUser) {
      router.replace("/(tabs)/settings");
    }
  }, [isOAuthUser]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const changePasswordMutation = useChangePassword({
    mutation: {
      onSuccess: () => {
        setSuccess(true);
        setError(null);
      },
      onError: (err: Error) => {
        setError(err.message || "Failed to change password");
      },
    },
  });

  if (!isLoaded || isOAuthUser) return null;

  const handleSubmit = () => {
    setError(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    changePasswordMutation.mutate({ data: { currentPassword, newPassword } });
  };

  if (success) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <View style={[styles.successContainer, { paddingTop: insets.top + 40 }]}>
          <View style={[styles.successIcon, { backgroundColor: colors.primarySoft }]}>
            <Feather name="check-circle" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>Password Updated</Text>
          <Text style={[styles.successSub, { color: colors.mutedForeground }]}>
            Your password has been changed successfully.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>Back to Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Change Password</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Current Password</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <Feather name="lock" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Enter current password"
              placeholderTextColor={colors.mutedForeground}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showCurrent}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowCurrent((v) => !v)}>
              <Feather name={showCurrent ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>New Password</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <Feather name="lock" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Min. 6 characters"
              placeholderTextColor={colors.mutedForeground}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNew}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowNew((v) => !v)}>
              <Feather name={showNew ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Confirm New Password</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border }]}>
            <Feather name="lock" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Repeat new password"
              placeholderTextColor={colors.mutedForeground}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowConfirm((v) => !v)}>
              <Feather name={showConfirm ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {error && (
            <View style={[styles.errorBox, { backgroundColor: colors.destructive + "14", borderColor: colors.destructive + "33" }]}>
              <Feather name="alert-circle" size={15} color={colors.destructive} />
              <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: changePasswordMutation.isPending ? 0.7 : 1 }]}
          onPress={handleSubmit}
          disabled={changePasswordMutation.isPending}
          activeOpacity={0.8}
        >
          {changePasswordMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Update Password</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: SPACING.xl, gap: SPACING.xl },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.xs,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" }, // TODO: one-off
  card: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.xl,
  },
  fieldLabel: {
    fontSize: 12, // TODO: one-off
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    textTransform: "uppercase",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_400Regular",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    padding: SPACING.md,
  },
  errorText: {
    flex: 1,
    fontSize: FONT_SIZE.caption,
    fontFamily: "Inter_400Regular",
  },
  primaryBtn: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16, // TODO: one-off
    fontFamily: "Inter_600SemiBold",
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xxxl,
    gap: SPACING.lg,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48, // TODO: one-off (circular: half of 96px)
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  successTitle: { fontSize: 24, fontFamily: "Inter_700Bold" }, // TODO: one-off
  successSub: {
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
});
