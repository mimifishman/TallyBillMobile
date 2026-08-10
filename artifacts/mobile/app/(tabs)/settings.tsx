import { Feather } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { LanguagePicker } from "@/components/LanguagePicker";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { getInitials } from "@/utils/initials";

const PREF_LANGUAGE_KEY = "@tallybill/receipt_language";

function IconBox({ name, color }: { name: React.ComponentProps<typeof Feather>["name"]; color: string }) {
  const colors = useColors();
  return (
    <View style={[styles.iconBox, { backgroundColor: colors.primarySoft }]}>
      <Feather name={name} size={16} color={color} />
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, isGuest, guestName, saveGuestName, setDisplayNameOverride, setDbProfile } = useAuth();
  const { user: clerkUser } = useUser();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameChanged, setNameChanged] = useState(false);

  const [guestNameInput, setGuestNameInput] = useState(guestName ?? "");
  const [guestNameChanged, setGuestNameChanged] = useState(false);
  const [savingGuestName, setSavingGuestName] = useState(false);

  const [preferredLanguage, setPreferredLanguage] = useState<string | null>(null);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PREF_LANGUAGE_KEY).then((val) => {
      if (val) setPreferredLanguage(val);
    });
  }, []);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
    }
  }, [user?.firstName, user?.lastName]);

  useEffect(() => {
    setGuestNameInput(guestName ?? "");
  }, [guestName]);

  const handleSaveName = async () => {
    if (!firstName.trim()) {
      Alert.alert("Required", "First name cannot be empty");
      return;
    }
    setSavingName(true);
    try {
      const res = await customFetch("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() || null }),
        headers: { "Content-Type": "application/json" },
      });
      const data = res as { displayName?: string };
      if (data?.displayName) {
        setDisplayNameOverride(data.displayName);
      }
      const trimmedFirst = firstName.trim();
      const trimmedLast = lastName.trim();
      setFirstName(trimmedFirst);
      setLastName(trimmedLast);
      setDbProfile(trimmedFirst || null, trimmedLast || null);
      setNameChanged(false);
      Alert.alert("Saved", "Looking good! Your name has been updated.");
    } catch {
      Alert.alert("Hmm, something went wrong", "Could not update your name. Give it another shot.");
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveGuestName = async () => {
    setSavingGuestName(true);
    await saveGuestName(guestNameInput.trim());
    setGuestNameChanged(false);
    setSavingGuestName(false);
  };

  const handleLanguageSelect = async (language: string) => {
    setPreferredLanguage(language);
    setShowLanguagePicker(false);
    await AsyncStorage.setItem(PREF_LANGUAGE_KEY, language);
  };

  const handleLogout = () => {
    Alert.alert("Sign out?", "You can always sign back in.", [
      { text: "Actually, stay", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
          } catch (e) {
            if (__DEV__) console.warn("[logout error]", e);
          }
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const guestDisplayName = guestName || "Guest";
  const guestInitial = getInitials(guestDisplayName);

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
            <Text style={styles.avatarText}>{getInitials(user.displayName)}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{user.displayName}</Text>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
            {guestName ? (
              <Text style={[styles.avatarText, { color: colors.mutedForeground }]}>{guestInitial}</Text>
            ) : (
              <Feather name="user" size={22} color={colors.mutedForeground} />
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{guestDisplayName}</Text>
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

      {!user && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>YOUR NAME</Text>
          <View style={[styles.nameCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.nameCardLabel, { color: colors.foreground }]}>Display name</Text>
            <Text style={[styles.nameCardSub, { color: colors.mutedForeground }]}>
              Shown on bills you create or join as a guest
            </Text>
            <View style={[styles.nameInputWrap, { borderColor: guestNameChanged ? colors.primary : colors.border }]}>
              <TextInput
                style={[styles.nameInput, { color: colors.foreground }]}
                placeholder="Your first name"
                placeholderTextColor={colors.mutedForeground}
                value={guestNameInput}
                onChangeText={(v) => { setGuestNameInput(v); setGuestNameChanged(true); }}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            {guestNameChanged && (
              <TouchableOpacity
                style={[styles.saveNameBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveGuestName}
                disabled={savingGuestName}
                activeOpacity={0.8}
              >
                {savingGuestName ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveNameBtnText}>Save Name</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {user && !isGuest && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PROFILE</Text>
          <View style={[styles.nameCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.nameCardLabel, { color: colors.foreground }]}>Your name</Text>
            <View style={styles.nameRow}>
              <View style={[styles.nameInputWrap, { flex: 1, borderColor: nameChanged ? colors.primary : colors.border }]}>
                <TextInput
                  style={[styles.nameInput, { color: colors.foreground }]}
                  placeholder="First Name"
                  placeholderTextColor={colors.mutedForeground}
                  value={firstName}
                  onChangeText={(v) => { setFirstName(v); setNameChanged(true); }}
                  autoCapitalize="words"
                />
              </View>
              <View style={[styles.nameInputWrap, { flex: 1, borderColor: nameChanged ? colors.primary : colors.border }]}>
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
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>RECEIPT SCANNER</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => setShowLanguagePicker(true)}
            activeOpacity={0.75}
          >
            <IconBox name="globe" color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuItemText, { color: colors.foreground }]}>Preferred receipt language</Text>
              {preferredLanguage && (
                <Text style={[styles.menuItemSub, { color: colors.mutedForeground }]}>{preferredLanguage}</Text>
              )}
            </View>
            <Text style={[styles.menuItemValue, { color: preferredLanguage ? colors.primary : colors.mutedForeground }]}>
              {preferredLanguage ?? "Not set"}
            </Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
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
                activeOpacity={0.75}
              >
                <IconBox name="lock" color={colors.primary} />
                <Text style={[styles.menuItemText, { color: colors.foreground }]}>Change Password</Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : clerkUser ? (
              <View style={[styles.menuItem, { borderBottomColor: colors.border }]}>
                <IconBox name="shield" color={colors.mutedForeground} />
                <Text style={[styles.menuItemText, { color: colors.mutedForeground }]}>
                  {clerkUser.externalAccounts.some((a) => a.provider === "oauth_apple")
                    ? "Signed in with Apple"
                    : "Signed in with Google"}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {__DEV__ && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>DEV TOOLS</Text>
          <TouchableOpacity
            style={[styles.devBtn, { backgroundColor: colors.card, borderColor: colors.destructive }]}
            onPress={() => {
              Alert.alert("Clear Storage", "This will wipe all local data and restart to login.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear", style: "destructive", onPress: async () => {
                    await AsyncStorage.clear();
                    router.replace("/(auth)/login");
                  },
                },
              ]);
            }}
          >
            <Feather name="trash-2" size={16} color={colors.destructive} />
            <Text style={[styles.devBtnText, { color: colors.destructive }]}>Clear Local Storage</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={[styles.version, { color: colors.mutedForeground }]}>TallyBill v1.0</Text>

      {user && (
        <TouchableOpacity
          style={[styles.signOutBtn, { borderColor: colors.destructive }]}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Feather name="log-out" size={18} color={colors.destructive} />
          <Text style={[styles.signOutBtnText, { color: colors.destructive }]}>Sign out</Text>
        </TouchableOpacity>
      )}

      <LanguagePicker
        visible={showLanguagePicker}
        selectedLanguage={preferredLanguage}
        onConfirm={handleLanguageSelect}
        onClose={() => setShowLanguagePicker(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, gap: SPACING.xl },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACING.xl,
    gap: SPACING.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28, // TODO: one-off (circular: half of 56px)
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: FONT_SIZE.heading, fontFamily: "Inter_700Bold" },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontFamily: "Inter_700Bold" }, // TODO: one-off
  profileEmail: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 }, // TODO: one-off
  signInBtn: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.lg, paddingVertical: 9 },
  signInBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  section: { gap: SPACING.sm },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2, paddingHorizontal: SPACING.xs }, // TODO: one-off
  nameCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.xl, gap: SPACING.md },
  nameCardLabel: { fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold" },
  nameCardSub: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: -SPACING.xs },
  nameRow: { flexDirection: "row", gap: 10 },
  nameInputWrap: {
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: SPACING.md,
  },
  nameInput: { fontSize: FONT_SIZE.body, fontFamily: "Inter_400Regular" },
  saveNameBtn: {
    borderRadius: RADIUS.full,
    paddingVertical: 13,
    alignItems: "center",
  },
  saveNameBtnText: { color: "#fff", fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold" },
  menuCard: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: "hidden" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: 1,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemText: { flex: 1, fontSize: FONT_SIZE.body, fontFamily: "Inter_500Medium" },
  menuItemSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 }, // TODO: one-off
  menuItemValue: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular" },
  version: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular", paddingVertical: SPACING.xs }, // TODO: one-off
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.lg,
    marginTop: SPACING.xs,
  },
  signOutBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  devBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
  },
  devBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" }, // TODO: one-off
});
