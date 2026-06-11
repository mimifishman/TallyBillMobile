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
import { useColors } from "@/hooks/useColors";
import {
  useGetCircles,
  useCreateCircle,
  getGetCirclesQueryKey,
} from "@workspace/api-client-react";

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
          <ActivityIndicator color={colors.primary} />
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
                <Feather name="users" size={20} color={colors.primary} />
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
            <TextInput
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
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyCard: {
    width: "100%",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyCreateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 8,
  },
  emptyCreateBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  list: { padding: 16, gap: 10 },
  circleCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  circleIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  circleInfo: { flex: 1, gap: 2 },
  circleName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  circleMemberCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
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
