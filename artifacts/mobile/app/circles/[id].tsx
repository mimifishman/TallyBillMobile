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
import { useColors } from "@/hooks/useColors";
import {
  useGetCircles,
  useUpdateCircle,
  useDeleteCircle,
  useAddCircleMember,
  useRemoveCircleMember,
  getGetCirclesQueryKey,
  type Circle,
} from "@workspace/api-client-react";

export default function CircleDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const circleId = parseInt(id!);
  const queryClient = useQueryClient();

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState("");
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!circle) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
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
        >
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
              <Feather name="plus" size={14} color={colors.primary} />
              <Text style={[styles.addBtnText, { color: colors.primary }]}>Add person</Text>
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
                    <Text style={[styles.memberAvatarText, { color: colors.primary }]}>
                      {member.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: colors.foreground }]}>{member.name}</Text>
                    {member.linkedUserId ? (
                      <Text style={[styles.memberLinked, { color: colors.primary }]}>
                        Linked to TallyBill account
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemoveMember(member.id, member.name)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.removeMemberBtn}
                  >
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
            <TextInput
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
              <TextInput
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
                  <Feather name="link" size={13} color={colors.primary} />
                  <Text style={[styles.linkEmailText, { color: colors.primary }]}>
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
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  backBtn: { padding: 6 },
  headerTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 24 },
  section: { gap: 12 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyMembers: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  memberList: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  memberInfo: { flex: 1, gap: 1 },
  memberName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  memberLinked: { fontSize: 12, fontFamily: "Inter_400Regular" },
  removeMemberBtn: { padding: 4 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalInput: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  linkEmailBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  linkEmailText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  modalConfirmBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  modalConfirmText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
