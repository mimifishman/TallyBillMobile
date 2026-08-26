import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { AutoFocusTextInput } from "@/components/AutoFocusTextInput";
import { useColors } from "@/hooks/useColors";
import {
  useGetCircles,
  useUpdateCircle,
  useDeleteCircle,
  useAddCircleMember,
  useRemoveCircleMember,
  useRenameCircleMember,
  getGetCirclesQueryKey,
  type Circle,
} from "@workspace/api-client-react";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { getInitials } from "@workspace/utils";

export default function CircleDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const circleId = parseInt(id!);
  const queryClient = useQueryClient();

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showRenameMemberModal, setShowRenameMemberModal] = useState(false);
  const [renameMemberTarget, setRenameMemberTarget] = useState<{ id: number; name: string; linkedUserId?: number | null; linkedUserDisplayName?: string | null; linkedUserEmail?: string | null } | null>(null);
  const [renameMemberValue, setRenameMemberValue] = useState("");
  const [editMemberLinkedEmail, setEditMemberLinkedEmail] = useState("");
  const [editMemberShowEmailField, setEditMemberShowEmailField] = useState(false);
  const [editMemberUnlink, setEditMemberUnlink] = useState(false);
  const [editMemberEmailError, setEditMemberEmailError] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [showEmailField, setShowEmailField] = useState(false);

  const { data: circles, isLoading } = useGetCircles({
    query: { queryKey: getGetCirclesQueryKey() },
  });

  const circle: Circle | undefined = circles?.find((c) => c.id === circleId);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetCirclesQueryKey() });
  };

  const renameMutation = useUpdateCircle({
    mutation: {
      onSuccess: () => {
        invalidate();
        setShowRenameModal(false);
        setRenameValue("");
      },
      onError: () => {
        Alert.alert("Error", "Couldn't rename the circle. Please try again.");
      },
    },
  });

  const deleteMutation = useDeleteCircle({
    mutation: {
      onSuccess: () => {
        invalidate();
        router.replace("/(tabs)/circles");
      },
      onError: () => {
        Alert.alert("Error", "Couldn't delete the circle. Please try again.");
      },
    },
  });

  const addMemberMutation = useAddCircleMember({
    mutation: {
      onSuccess: () => {
        invalidate();
        setShowAddMember(false);
        setNewMemberName("");
        setNewMemberEmail("");
        setShowEmailField(false);
      },
      onError: () => {
        Alert.alert("Error", "Couldn't add the person. Please try again.");
      },
    },
  });

  const removeMemberMutation = useRemoveCircleMember({
    mutation: {
      onSuccess: () => {
        invalidate();
      },
      onError: () => {
        Alert.alert("Error", "Couldn't remove the person. Please try again.");
      },
    },
  });

  const renameMemberMutation = useRenameCircleMember({
    mutation: {
      onSuccess: () => {
        invalidate();
        setShowRenameMemberModal(false);
        setRenameMemberTarget(null);
        setRenameMemberValue("");
        setEditMemberLinkedEmail("");
        setEditMemberShowEmailField(false);
        setEditMemberUnlink(false);
        setEditMemberEmailError(null);
      },
      onError: (err: unknown) => {
        const apiErr = err as { status?: number };
        if (apiErr?.status === 422) {
          setEditMemberEmailError("No TallyBill account found with that email address.");
        } else {
          Alert.alert("Error", "Couldn't save changes. Please try again.");
        }
      },
    },
  });

  const handleRename = () => {
    if (!renameValue.trim()) return;
    renameMutation.mutate({ id: circleId, data: { name: renameValue.trim() } });
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Circle",
      `Delete "${circle?.name}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate({ id: circleId }),
        },
      ]
    );
  };

  const handleAddMember = () => {
    const trimmed = newMemberName.trim();
    if (!trimmed) return;
    const isDuplicate = circle?.members.some(
      (m) => m.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      Alert.alert("Name already in circle", `"${trimmed}" is already a member of this circle.`);
      return;
    }
    addMemberMutation.mutate({
      id: circleId,
      data: {
        name: trimmed,
        ...(newMemberEmail.trim() ? { email: newMemberEmail.trim() } : {}),
      },
    });
  };

  const handleOpenRenameMember = (memberId: number, memberName: string, linkedUserId?: number | null, linkedUserDisplayName?: string | null, linkedUserEmail?: string | null) => {
    setRenameMemberTarget({ id: memberId, name: memberName, linkedUserId, linkedUserDisplayName, linkedUserEmail });
    setRenameMemberValue(memberName);
    setEditMemberLinkedEmail("");
    setEditMemberShowEmailField(false);
    setEditMemberUnlink(false);
    setEditMemberEmailError(null);
    setShowRenameMemberModal(true);
  };

  const handleRenameMember = () => {
    if (!renameMemberTarget || !renameMemberValue.trim()) return;
    const trimmed = renameMemberValue.trim();
    const isDuplicate = circle?.members.some(
      (m) => m.id !== renameMemberTarget.id && m.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      Alert.alert("Name already in circle", `"${trimmed}" is already a member of this circle.`);
      return;
    }

    let linkedEmail: string | null | undefined = undefined;
    if (editMemberUnlink) {
      linkedEmail = null;
    } else if (editMemberShowEmailField && editMemberLinkedEmail.trim()) {
      linkedEmail = editMemberLinkedEmail.trim();
    }

    setEditMemberEmailError(null);
    renameMemberMutation.mutate({
      id: circleId,
      memberId: renameMemberTarget.id,
      data: { name: trimmed, ...(linkedEmail !== undefined ? { linkedEmail } : {}) },
    });
  };

  const handleRemoveMember = (memberId: number, memberName: string) => {
    Alert.alert(
      "Remove Person",
      `Remove ${memberName} from this circle?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            removeMemberMutation.mutate({ id: circleId, memberId }),
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back" hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primaryText} />
        </View>
      </View>
    );
  }

  if (!circle) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back" hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Circle not found</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back" hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerTitleWrap}
          onPress={() => {
            setRenameValue(circle.name);
            setShowRenameModal(true);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{circle.name}</Text>
          <Feather name="edit-2" size={14} color={colors.mutedForeground} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDelete}
          style={styles.backBtn}
          disabled={deleteMutation.isPending}
        
        accessibilityLabel="Delete circle"
        hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}>
          <Feather name="trash-2" size={18} color={colors.destructive ?? "#EF4444"} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PEOPLE</Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.muted }]}
              onPress={() => setShowAddMember(true)}
            >
              <Feather name="plus" size={14} color={colors.primaryText} />
              <Text style={[styles.addBtnText, { color: colors.primaryText }]}>Add person</Text>
            </TouchableOpacity>
          </View>

          {circle.members.length === 0 ? (
            <View style={[styles.emptyMembers, { borderColor: colors.border }]}>
              <Feather name="user-plus" size={24} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No people yet. Add someone to get started.
              </Text>
            </View>
          ) : (
            <View style={[styles.memberList, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {circle.members.map((member, index) => (
                <View
                  key={member.id}
                  style={[
                    styles.memberRow,
                    {
                      borderBottomColor: colors.border,
                      borderBottomWidth: index < circle.members.length - 1 ? 1 : 0,
                    },
                  ]}
                >
                  <View style={[styles.memberAvatar, { backgroundColor: colors.primary + "22" }]}>
                    <Text style={[styles.memberAvatarText, { color: colors.primaryText }]}>
                      {getInitials(member.name)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.memberInfo}
                    onPress={() => handleOpenRenameMember(member.id, member.name, member.linkedUserId, member.linkedUserDisplayName, member.linkedUserEmail)}
                    activeOpacity={0.6}
                  >
                    <View style={styles.memberNameRow}>
                      <Text style={[styles.memberName, { color: colors.foreground }]}>{member.name}</Text>
                      <Feather name="edit-2" size={12} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
                    </View>
                    {member.linkedUserId ? (
                      <Text style={[styles.memberLinked, { color: colors.primaryText }]}>
                        Linked to TallyBill account
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleRemoveMember(member.id, member.name)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.removeMemberBtn}
                  
                  accessibilityLabel={`Remove ${member.name}`}>
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={showRenameModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => {
            setShowRenameModal(false);
            setRenameValue("");
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rename Circle</Text>
            <AutoFocusTextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              placeholder="Circle name"
              placeholderTextColor={colors.mutedForeground}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              onSubmitEditing={handleRename}
              returnKeyType="done"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setShowRenameModal(false);
                  setRenameValue("");
                }}
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRename}
                disabled={renameMutation.isPending || !renameValue.trim()}
                style={[
                  styles.modalConfirmBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: renameMutation.isPending || !renameValue.trim() ? 0.6 : 1,
                  },
                ]}
              >
                {renameMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Rename</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showRenameMemberModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => {
              setShowRenameMemberModal(false);
              setRenameMemberTarget(null);
              setRenameMemberValue("");
              setEditMemberLinkedEmail("");
              setEditMemberShowEmailField(false);
              setEditMemberUnlink(false);
              setEditMemberEmailError(null);
            }}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {}}
              style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Person</Text>
              <AutoFocusTextInput
                style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
                placeholder="Name"
                placeholderTextColor={colors.mutedForeground}
                value={renameMemberValue}
                onChangeText={setRenameMemberValue}
                autoFocus
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleRenameMember}
              />

              {renameMemberTarget?.linkedUserId && !editMemberUnlink && !editMemberShowEmailField ? (
                <View style={[styles.linkedRow, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                  <Feather name="link" size={13} color={colors.primaryText} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.linkedRowText, { color: colors.foreground }]}>
                      {renameMemberTarget.linkedUserEmail
                        ? renameMemberTarget.linkedUserEmail
                        : "Linked to TallyBill account"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setEditMemberLinkedEmail(renameMemberTarget?.linkedUserEmail ?? "");
                      setEditMemberShowEmailField(true);
                      setEditMemberUnlink(false);
                    }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={{ marginRight: 8 }}
                  >
                    <Text style={[styles.unlinkText, { color: colors.primaryText }]}>Change</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setEditMemberUnlink(true)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={[styles.unlinkText, { color: colors.destructive ?? "#EF4444" }]}>Unlink</Text>
                  </TouchableOpacity>
                </View>
              ) : editMemberUnlink ? (
                <View style={[styles.linkedRow, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                  <Feather name="link-2" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.linkedRowText, { color: colors.mutedForeground }]}>
                    Link will be removed on save
                  </Text>
                  <TouchableOpacity
                    onPress={() => setEditMemberUnlink(false)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={[styles.unlinkText, { color: colors.primaryText }]}>Undo</Text>
                  </TouchableOpacity>
                </View>
              ) : editMemberShowEmailField ? (
                <View style={{ gap: 4 }}>
                  <TextInput
                    style={[
                      styles.modalInput,
                      {
                        borderColor: editMemberEmailError ? (colors.destructive ?? "#EF4444") : colors.border,
                        color: colors.foreground,
                      },
                    ]}
                    placeholder="TallyBill email address"
                    placeholderTextColor={colors.mutedForeground}
                    value={editMemberLinkedEmail}
                    onChangeText={(v) => {
                      setEditMemberLinkedEmail(v);
                      setEditMemberEmailError(null);
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleRenameMember}
                    autoFocus={false}
                  />
                  {editMemberEmailError ? (
                    <Text style={[styles.emailErrorText, { color: colors.destructive ?? "#EF4444" }]}>
                      {editMemberEmailError}
                    </Text>
                  ) : null}
                  {renameMemberTarget?.linkedUserId ? (
                    <TouchableOpacity
                      onPress={() => {
                        setEditMemberShowEmailField(false);
                        setEditMemberLinkedEmail("");
                        setEditMemberEmailError(null);
                      }}
                    >
                      <Text style={[styles.emailErrorText, { color: colors.mutedForeground }]}>
                        Cancel — keep existing link
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setEditMemberShowEmailField(true)}
                  style={styles.linkEmailBtn}
                >
                  <Feather name="link" size={13} color={colors.primaryText} />
                  <Text style={[styles.linkEmailText, { color: colors.primaryText }]}>
                    Link to TallyBill account (optional)
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  onPress={() => {
                    setShowRenameMemberModal(false);
                    setRenameMemberTarget(null);
                    setRenameMemberValue("");
                    setEditMemberLinkedEmail("");
                    setEditMemberShowEmailField(false);
                    setEditMemberUnlink(false);
                    setEditMemberEmailError(null);
                  }}
                  style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleRenameMember}
                  disabled={renameMemberMutation.isPending || !renameMemberValue.trim()}
                  style={[
                    styles.modalConfirmBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: renameMemberMutation.isPending || !renameMemberValue.trim() ? 0.6 : 1,
                    },
                  ]}
                >
                  {renameMemberMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showAddMember} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={() => {
              setShowAddMember(false);
              setNewMemberName("");
              setNewMemberEmail("");
              setShowEmailField(false);
            }}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {}}
              style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Person</Text>
              <AutoFocusTextInput
                style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
                placeholder="Name"
                placeholderTextColor={colors.mutedForeground}
                value={newMemberName}
                onChangeText={setNewMemberName}
                autoFocus
                autoCapitalize="words"
                returnKeyType={showEmailField ? "next" : "done"}
                onSubmitEditing={() => {
                  if (!showEmailField) handleAddMember();
                }}
              />
              {showEmailField ? (
                <TextInput
                  style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
                  placeholder="TallyBill email (optional)"
                  placeholderTextColor={colors.mutedForeground}
                  value={newMemberEmail}
                  onChangeText={setNewMemberEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleAddMember}
                />
              ) : (
                <TouchableOpacity
                  onPress={() => setShowEmailField(true)}
                  style={styles.linkEmailBtn}
                >
                  <Feather name="link" size={13} color={colors.primaryText} />
                  <Text style={[styles.linkEmailText, { color: colors.primaryText }]}>
                    Link to TallyBill account (optional)
                  </Text>
                </TouchableOpacity>
              )}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  onPress={() => {
                    setShowAddMember(false);
                    setNewMemberName("");
                    setNewMemberEmail("");
                    setShowEmailField(false);
                  }}
                  style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddMember}
                  disabled={addMemberMutation.isPending || !newMemberName.trim()}
                  style={[
                    styles.modalConfirmBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: addMemberMutation.isPending || !newMemberName.trim() ? 0.6 : 1,
                    },
                  ]}
                >
                  {addMemberMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    gap: SPACING.sm,
  },
  backBtn: { padding: 6 },
  headerTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xs,
  },
  headerTitle: { fontSize: FONT_SIZE.title, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, gap: SPACING.xxl },
  section: { gap: SPACING.md },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 }, // TODO: one-off
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addBtnText: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold" },
  emptyMembers: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.xxl,
  },
  emptyText: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular", textAlign: "center" },
  memberList: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold" },
  memberInfo: { flex: 1, gap: 1 },
  memberNameRow: { flexDirection: "row", alignItems: "center" },
  memberName: { fontSize: FONT_SIZE.body, fontFamily: "Inter_500Medium" },
  memberLinked: { fontSize: 12, fontFamily: "Inter_400Regular" }, // TODO: one-off
  removeMemberBtn: { padding: SPACING.xs },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xxl,
  },
  modalCard: {
    width: "100%",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  modalTitle: { fontSize: FONT_SIZE.title, fontFamily: "Inter_600SemiBold" },
  modalInput: {
    borderWidth: 1.5,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_400Regular",
  },
  linkEmailBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: SPACING.xs,
  },
  linkEmailText: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular" },
  linkedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: SPACING.sm,
  },
  linkedRowText: { flex: 1, fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular" },
  unlinkText: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold" },
  emailErrorText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: SPACING.xs },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  modalCancelText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_500Medium" },
  modalConfirmBtn: { flex: 1, borderRadius: RADIUS.sm, paddingVertical: SPACING.md, alignItems: "center" },
  modalConfirmText: { color: "#fff", fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold" },
});
