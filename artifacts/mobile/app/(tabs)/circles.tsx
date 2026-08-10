import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  useCreateCircle,
  getGetCirclesQueryKey,
} from "@workspace/api-client-react";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";

export default function CirclesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [showNewCircle, setShowNewCircle] = useState(false);
  const [newCircleName, setNewCircleName] = useState("");

  const { data: circles, isLoading } = useGetCircles({
    query: { queryKey: getGetCirclesQueryKey() },
  });

  const createMutation = useCreateCircle({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCirclesQueryKey() });
        setShowNewCircle(false);
        setNewCircleName("");
      },
      onError: () => {
        Alert.alert("Error", "Couldn't create the circle. Please try again.");
      },
    },
  });

  const handleCreate = () => {
    if (!newCircleName.trim()) return;
    createMutation.mutate({ data: { name: newCircleName.trim() } });
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 12,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>My Circles</Text>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowNewCircle(true)}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primaryText} />
        </View>
      ) : !circles || circles.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyContainer}>
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="users" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No circles yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              Create a circle to save a group of people you split bills with regularly.
            </Text>
            <TouchableOpacity
              style={[styles.emptyCreateBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowNewCircle(true)}
            >
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.emptyCreateBtnText}>Create a Circle</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
        >
          {circles.map((circle) => (
            <TouchableOpacity
              key={circle.id}
              style={[styles.circleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(`/circles/${circle.id}`)}
              activeOpacity={0.75}
            >
              <View style={[styles.circleIcon, { backgroundColor: colors.primary + "22" }]}>
                <Feather name="users" size={20} color={colors.primaryText} />
              </View>
              <View style={styles.circleInfo}>
                <Text style={[styles.circleName, { color: colors.foreground }]}>{circle.name}</Text>
                <Text style={[styles.circleMemberCount, { color: colors.mutedForeground }]}>
                  {circle.members.length === 0
                    ? "No members"
                    : circle.members.length === 1
                    ? "1 person"
                    : `${circle.members.length} people`}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Modal visible={showNewCircle} transparent animationType="fade">
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => {
            setShowNewCircle(false);
            setNewCircleName("");
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Circle</Text>
            <AutoFocusTextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              placeholder="e.g. Roommates"
              placeholderTextColor={colors.mutedForeground}
              value={newCircleName}
              onChangeText={setNewCircleName}
              autoFocus
              onSubmitEditing={handleCreate}
              returnKeyType="done"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setShowNewCircle(false);
                  setNewCircleName("");
                }}
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreate}
                disabled={createMutation.isPending || !newCircleName.trim()}
                style={[
                  styles.modalConfirmBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: createMutation.isPending || !newCircleName.trim() ? 0.6 : 1,
                  },
                ]}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.xl,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: FONT_SIZE.heading, fontFamily: "Inter_700Bold" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: SPACING.sm,
  },
  newBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xxl,
  },
  emptyCard: {
    width: "100%",
    alignItems: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.xxxl,
    gap: SPACING.md,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  emptySubtitle: {
    fontSize: 14, // TODO: one-off
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyCreateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: SPACING.sm,
  },
  emptyCreateBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  list: { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg, gap: 10 },
  circleCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: 14,
    gap: SPACING.md,
  },
  circleIcon: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  circleInfo: { flex: 1, gap: 2 },
  circleName: { fontSize: 16, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  circleMemberCount: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular" },
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
