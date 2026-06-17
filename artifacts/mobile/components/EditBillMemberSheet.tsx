import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { BottomSheet } from "@/components/BottomSheet";
import { PressableScale } from "@/components/PressableScale";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { useColors } from "@/hooks/useColors";
import { customFetch, ApiError } from "@workspace/api-client-react";

interface BillMember {
  id: number;
  name: string;
  color: string;
  linkedUserId?: number | null;
  linkedUserEmail?: string | null;
}

interface EditBillMemberSheetProps {
  visible: boolean;
  member: BillMember | null;
  billId: number;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function EditBillMemberSheet({
  visible,
  member,
  billId,
  onClose,
  onSaved,
  onDeleted,
}: EditBillMemberSheetProps) {
  const colors = useColors();

  const [nameValue, setNameValue] = useState("");
  const [showEmailField, setShowEmailField] = useState(false);
  const [linkedEmail, setLinkedEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [unlinkPending, setUnlinkPending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible && member) {
      setNameValue(member.name);
      setShowEmailField(false);
      setLinkedEmail("");
      setEmailError(null);
      setUnlinkPending(false);
      setIsSaving(false);
    }
  }, [visible, member]);

  if (!member) return null;

  const hasLinkedAccount = !!member.linkedUserId && !unlinkPending;

  const handleSave = async () => {
    const trimmedName = nameValue.trim();
    if (!trimmedName) {
      Alert.alert("Name required", "Please enter a name.");
      return;
    }

    const payload: Record<string, unknown> = { name: trimmedName };

    if (unlinkPending) {
      payload.linkedEmail = null;
    } else if (showEmailField && linkedEmail.trim()) {
      payload.linkedEmail = linkedEmail.trim();
    }

    setIsSaving(true);
    try {
      await customFetch(`/api/bills/${billId}/users/${member.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      onSaved();
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError && err.data && typeof (err.data as { error?: string }).error === "string"
          ? (err.data as { error: string }).error
          : "Something went wrong. Please try again.";
      if (showEmailField && err instanceof ApiError && err.status === 422) {
        setEmailError(msg);
      } else {
        Alert.alert("Couldn't save", msg);
      }
      setIsSaving(false);
    }
  };

  const handleRemove = () => {
    Alert.alert(
      "Remove from bill",
      `Remove ${member.name} from this bill?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await customFetch(`/api/bills/${billId}/users/${member.id}`, { method: "DELETE" });
              onDeleted();
              onClose();
            } catch {
              Alert.alert("Couldn't remove", "Something went wrong. Please try again.");
            }
          },
        },
      ]
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Edit Person">
      <View style={styles.content}>
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>NAME</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
            placeholder="Name"
            placeholderTextColor={colors.mutedForeground}
            value={nameValue}
            onChangeText={setNameValue}
            autoCapitalize="words"
            returnKeyType="done"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ACCOUNT LINK</Text>

          {hasLinkedAccount && !showEmailField ? (
            <View style={[styles.linkedRow, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Feather name="link" size={13} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.linkedRowText, { color: colors.foreground }]} numberOfLines={1}>
                  {member.linkedUserEmail ?? "Linked to TallyBill account"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setLinkedEmail(member.linkedUserEmail ?? "");
                  setShowEmailField(true);
                  setUnlinkPending(false);
                }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={{ marginRight: 10 }}
              >
                <Text style={[styles.actionLink, { color: colors.primary }]}>Change</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setUnlinkPending(true)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={[styles.actionLink, { color: colors.destructive ?? "#EF4444" }]}>Unlink</Text>
              </TouchableOpacity>
            </View>
          ) : unlinkPending ? (
            <View style={[styles.linkedRow, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Feather name="link-2" size={13} color={colors.mutedForeground} />
              <Text style={[styles.linkedRowText, { color: colors.mutedForeground }]}>
                Link will be removed on save
              </Text>
              <TouchableOpacity
                onPress={() => setUnlinkPending(false)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={[styles.actionLink, { color: colors.primary }]}>Undo</Text>
              </TouchableOpacity>
            </View>
          ) : showEmailField ? (
            <View style={{ gap: 6 }}>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: emailError ? (colors.destructive ?? "#EF4444") : colors.border,
                    color: colors.foreground,
                    backgroundColor: colors.muted,
                  },
                ]}
                placeholder="TallyBill email address"
                placeholderTextColor={colors.mutedForeground}
                value={linkedEmail}
                onChangeText={(v) => {
                  setLinkedEmail(v);
                  setEmailError(null);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                autoFocus={false}
              />
              {emailError ? (
                <Text style={[styles.errorText, { color: colors.destructive ?? "#EF4444" }]}>
                  {emailError}
                </Text>
              ) : null}
              {member.linkedUserId ? (
                <TouchableOpacity
                  onPress={() => {
                    setShowEmailField(false);
                    setLinkedEmail("");
                    setEmailError(null);
                  }}
                >
                  <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
                    Cancel — keep existing link
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    setShowEmailField(false);
                    setLinkedEmail("");
                    setEmailError(null);
                  }}
                >
                  <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowEmailField(true)}
              style={styles.linkEmailBtn}
            >
              <Feather name="link" size={13} color={colors.primary} />
              <Text style={[styles.linkEmailText, { color: colors.primary }]}>
                Link to TallyBill account (optional)
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <PressableScale
          onPress={handleSave}
          disabled={isSaving || !nameValue.trim()}
          style={[
            styles.primaryBtn,
            { backgroundColor: colors.primary, opacity: isSaving || !nameValue.trim() ? 0.6 : 1 },
          ]}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Save Changes</Text>
          )}
        </PressableScale>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <TouchableOpacity
          onPress={handleRemove}
          activeOpacity={0.7}
          style={[styles.removeBtn, { borderColor: colors.destructive ?? "#EF4444" }]}
        >
          <Feather name="user-minus" size={15} color={colors.destructive ?? "#EF4444"} />
          <Text style={[styles.removeBtnText, { color: colors.destructive ?? "#EF4444" }]}>
            Remove from bill
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  fieldGroup: { gap: 6 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.0,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_400Regular",
  },
  linkedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  linkedRowText: {
    fontSize: FONT_SIZE.caption,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  actionLink: {
    fontSize: FONT_SIZE.caption,
    fontFamily: "Inter_600SemiBold",
  },
  linkEmailBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  linkEmailText: {
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_500Medium",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  primaryBtn: {
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.lg,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.lg,
  },
  removeBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
