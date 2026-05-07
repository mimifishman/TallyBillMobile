import { Feather } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from "@/context/AuthContext";
import { customFetch } from "@workspace/api-client-react";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, isGuest } = useAuth();
  const { user: clerkUser } = useUser();

  const [joinCode, setJoinCode] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameChanged, setNameChanged] = useState(false);

  useEffect(() => {
    if (clerkUser) {
      setFirstName(clerkUser.firstName ?? "");
      setLastName(clerkUser.lastName ?? "");
    }
  }, [clerkUser?.firstName, clerkUser?.lastName]);

  const handleSaveName = async () => {
    if (!firstName.trim()) {
      Alert.alert("Required", "First name cannot be empty");
      return;
    }
    setSavingName(true);
    try {
      await clerkUser?.update({
        firstName: firstName.trim(),
        lastName: lastName.trim() || "",
      });
    } catch (err) {
      if (__DEV__) console.warn("[settings.update Clerk error - ignored]", err);
    }
    try {
      await customFetch("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() || null }),
        headers: { "Content-Type": "application/json" },
      });
      setNameChanged(false);
      Alert.alert("Saved", "Your name has been updated");
    } catch {
      Alert.alert("Error", "Could not update your name. Please try again.");
    } finally {
      setSavingName(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => {
        logout().then(() => router.replace("/"));
      }},
    ]);
  };

  const handleJoinBill = () => {
    if (!joinCode.trim()) {
      Alert.alert("Error", "Please enter a join code");
      return;
    }
    if (!user) {
      Alert.alert("Sign in required", "Please sign in to join a bill", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/(auth)/login") },
      ]);
      return;
    }
    router.push({ pathname: "/bill/join", params: { code: joinCode.toUpperCase() } });
    setJoinCode("");
  };

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: insets.bottom + 40,
          paddingTop: Platform.OS === "web" ? 67 : insets.top + 12,
        },
      ]}
    >
      {user ? (
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{user.displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{user.displayName}</Text>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.guestCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
            <Feather name="user" size={20} color={colors.mutedForeground} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>Guest</Text>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>Not signed in</Text>
          </View>
          <TouchableOpacity
            style={[styles.signInBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={styles.signInBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      )}

      {user && !isGuest && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PROFILE</Text>
          <View style={[styles.nameCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.nameCardLabel, { color: colors.foreground }]}>Your name</Text>
            <View style={styles.nameRow}>
              <View style={[styles.nameInputWrap, { borderColor: nameChanged ? colors.primary : colors.border }]}>
                <TextInput
                  style={[styles.nameInput, { color: colors.foreground }]}
                  placeholder="First Name"
                  placeholderTextColor={colors.mutedForeground}
                  value={firstName}
                  onChangeText={(v) => { setFirstName(v); setNameChanged(true); }}
                  autoCapitalize="words"
                />
              </View>
              <View style={[styles.nameInputWrap, { borderColor: nameChanged ? colors.primary : colors.border }]}>
                <TextInput
                  style={[styles.nameInput, { color: colors.foreground }]}
                  placeholder="Last Name"
                  placeholderTextColor={colors.mutedForeground}
                  value={lastName}
                  onChangeText={(v) => { setLastName(v); setNameChanged(true); }}
                  autoCapitalize="words"
                />
              </View>
            </View>
            {nameChanged && (
              <TouchableOpacity
                style={[styles.saveNameBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveName}
                disabled={savingName}
                activeOpacity={0.8}
              >
                {savingName ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveNameBtnText}>Save Name</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>JOIN A BILL</Text>
        <View style={[styles.joinCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.joinLabel, { color: colors.foreground }]}>Enter join code</Text>
          <Text style={[styles.joinSub, { color: colors.mutedForeground }]}>
            Get the 6-character code from the bill owner
          </Text>
          <View style={styles.joinRow}>
            <TextInput
              style={[styles.joinInput, { borderColor: colors.border, color: colors.foreground }]}
              placeholder="ABC123"
              placeholderTextColor={colors.mutedForeground}
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.joinBtn, { backgroundColor: colors.primary }]}
              onPress={handleJoinBill}
            >
              <Text style={styles.joinBtnText}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {user && !isGuest && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ACCOUNT</Text>
          <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {clerkUser?.externalAccounts && clerkUser.externalAccounts.length === 0 ? (
              <TouchableOpacity
                style={[styles.menuItem, { borderBottomColor: colors.border }]}
                onPress={() => router.push("/(auth)/change-password")}
              >
                <Feather name="lock" size={18} color={colors.foreground} />
                <Text style={[styles.menuItemText, { color: colors.foreground }]}>Change Password</Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : clerkUser ? (
              <View style={[styles.menuItem, { borderBottomColor: colors.border }]}>
                <Feather name="shield" size={18} color={colors.mutedForeground} />
                <Text style={[styles.menuItemText, { color: colors.mutedForeground }]}>
                  {clerkUser.externalAccounts.some((a) => a.provider === "oauth_apple")
                    ? "Signed in with Apple"
                    : "Signed in with Google"}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              onPress={handleLogout}
            >
              <Feather name="log-out" size={18} color={colors.destructive} />
              <Text style={[styles.menuItemText, { color: colors.destructive }]}>Sign Out</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={[styles.version, { color: colors.mutedForeground }]}>TallyBill v1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 20 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  guestCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  profileEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  signInBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  signInBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  section: { gap: 8 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, paddingHorizontal: 4 },
  nameCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  nameCardLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  nameRow: { flexDirection: "row", gap: 10 },
  nameInputWrap: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  nameInput: { fontSize: 14, fontFamily: "Inter_400Regular" },
  saveNameBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveNameBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  joinCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 6 },
  joinLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  joinSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 6 },
  joinRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  joinInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
    textAlign: "center",
  },
  joinBtn: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  joinBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  menuCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  menuItemText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  version: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular", paddingVertical: 8 },
});
