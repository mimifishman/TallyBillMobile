import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth as useClerkAuth } from "@clerk/expo";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
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
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Skeleton } from "@/components/Skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { PersonBadge } from "@/components/PersonBadge";
import { LineItemRow } from "@/components/LineItemRow";
import {
  useGetBill,
  useCreateBillUser,
  useDeleteBillUser,
  useCreateBillLine,
  useDeleteBillLine,
  useUpdateBillLine,
  useToggleBillLineUser,
  usePatchBill,
  useDeleteBill,
  getGetBillQueryKey,
  getGetBillsQueryKey,
  getGetBillTotalsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import colors_data from "@/constants/colors";
import { getCurrencySymbol } from "@/utils/currency";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { confirmDeleteBill } from "@/utils/confirmDeleteBill";
import { useAuth } from "@/context/AuthContext";
import { removeGuestBill, listGuestBills, getCachedGuestOwnerId } from "@/utils/guestBillStore";
import { getBillCode } from "@/lib/billCodeStore";

const PEOPLE_COLORS = colors_data.light.people;

export default function BillDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = parseInt(id!);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { getToken, isSignedIn } = useClerkAuth();
  const [guestHasBill, setGuestHasBill] = useState(false);

  useEffect(() => {
    if (!user) {
      listGuestBills().then((bills) => {
        setGuestHasBill(bills.some((b) => b.id === billId));
      });
    }
  }, [billId, user]);

  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemTotal, setNewItemTotal] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [showEditHeader, setShowEditHeader] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editRestaurant, setEditRestaurant] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editCurrency, setEditCurrency] = useState("");
  const [editTaxPercent, setEditTaxPercent] = useState("");
  const [editTipPercent, setEditTipPercent] = useState("");

  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitLineId, setSplitLineId] = useState<number | null>(null);
  const [splitQtyInput, setSplitQtyInput] = useState("");

  const { data, isLoading } = useGetBill(billId, {
    query: {
      queryKey: getGetBillQueryKey(billId),
      refetchOnWindowFocus: true,
    },
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetBillQueryKey(billId) });
    queryClient.invalidateQueries({ queryKey: getGetBillTotalsQueryKey(billId) });
  }, [billId, queryClient]);

  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";
  const sseRetryDelayRef = useRef(1000);
  const sseXhrRef = useRef<XMLHttpRequest | null>(null);
  const sseRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseMountedRef = useRef(true);
  const sseForegroundRef = useRef(true);
  const sseInvalidateRef = useRef(invalidate);
  useEffect(() => { sseInvalidateRef.current = invalidate; }, [invalidate]);

  const connectSSE = useCallback(async () => {
    if (!sseMountedRef.current) return;
    if (sseRetryTimerRef.current) {
      clearTimeout(sseRetryTimerRef.current);
      sseRetryTimerRef.current = null;
    }

    const url = `${baseUrl}/api/bills/${billId}/events`;

    const xhr = new XMLHttpRequest();
    sseXhrRef.current = xhr;
    xhr.open("GET", url, true);

    const joinCode = getBillCode(billId);
    if (joinCode) xhr.setRequestHeader("X-Join-Code", joinCode);

    if (isSignedIn) {
      try {
        const token = await getToken();
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      } catch {
      }
    }

    const guestOwnerId = getCachedGuestOwnerId();
    if (guestOwnerId) xhr.setRequestHeader("X-Guest-Owner-Id", guestOwnerId);

    let lastLength = 0;
    let connectedOnce = false;
    let sseBuffer = "";

    xhr.onprogress = () => {
      if (!sseMountedRef.current) return;
      if (!connectedOnce) {
        connectedOnce = true;
        sseInvalidateRef.current();
      }
      sseBuffer += xhr.responseText.slice(lastLength);
      lastLength = xhr.responseText.length;
      const parts = sseBuffer.split("\n\n");
      sseBuffer = parts.pop() ?? "";
      for (const block of parts) {
        if (block.includes('"bill_changed"')) {
          sseRetryDelayRef.current = 1000;
          sseInvalidateRef.current();
        }
      }
    };

    const scheduleReconnect = () => {
      if (!sseMountedRef.current || !sseForegroundRef.current) return;
      if (sseRetryTimerRef.current) clearTimeout(sseRetryTimerRef.current);
      const delay = sseRetryDelayRef.current;
      sseRetryDelayRef.current = Math.min(delay * 2, 30_000);
      sseRetryTimerRef.current = setTimeout(() => {
        if (sseMountedRef.current && sseForegroundRef.current) connectSSE();
      }, delay);
    };

    xhr.onload = scheduleReconnect;
    xhr.onerror = scheduleReconnect;
    xhr.ontimeout = scheduleReconnect;

    xhr.send();
  }, [billId, baseUrl, isSignedIn, getToken]);

  useEffect(() => {
    sseMountedRef.current = true;
    sseRetryDelayRef.current = 1000;

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        sseForegroundRef.current = true;
        if (sseXhrRef.current) {
          sseXhrRef.current.abort();
          sseXhrRef.current = null;
        }
        sseRetryDelayRef.current = 1000;
        connectSSE();
        sseInvalidateRef.current();
      } else {
        sseForegroundRef.current = false;
        if (sseRetryTimerRef.current) {
          clearTimeout(sseRetryTimerRef.current);
          sseRetryTimerRef.current = null;
        }
        if (sseXhrRef.current) {
          sseXhrRef.current.abort();
          sseXhrRef.current = null;
        }
      }
    });

    connectSSE();

    return () => {
      sseMountedRef.current = false;
      appStateSub.remove();
      if (sseRetryTimerRef.current) clearTimeout(sseRetryTimerRef.current);
      if (sseXhrRef.current) {
        sseXhrRef.current.abort();
        sseXhrRef.current = null;
      }
    };
  }, [connectSSE, invalidate]);

  const addPersonMutation = useCreateBillUser({
    mutation: { onSuccess: invalidate },
  });

  const deletePersonMutation = useDeleteBillUser({
    mutation: { onSuccess: invalidate },
  });

  const splitPendingUsersRef = useRef<number[] | null>(null);

  const addLineMutation = useCreateBillLine({
    mutation: {
      onSuccess: (result) => {
        if (splitPendingUsersRef.current !== null && result?.id) {
          const usersToAssign = splitPendingUsersRef.current;
          splitPendingUsersRef.current = null;
          if (usersToAssign.length > 0) {
            bulkPendingRef.current += usersToAssign.length;
            usersToAssign.forEach((billUserId) => {
              toggleLineMutation.mutate({ billId, lineId: result.id, data: { billUserId } });
            });
            return;
          }
        }
        invalidate();
      },
      onError: () => {
        splitPendingUsersRef.current = null;
        invalidate();
      },
    },
  });

  const deleteLineMutation = useDeleteBillLine({
    mutation: { onSuccess: invalidate },
  });

  const updateLineMutation = useUpdateBillLine({
    mutation: { onSuccess: invalidate },
  });

  const bulkPendingRef = useRef(0);
  const toggleLineMutation = useToggleBillLineUser({
    mutation: {
      onSuccess: () => {
        if (bulkPendingRef.current > 0) {
          bulkPendingRef.current -= 1;
          if (bulkPendingRef.current === 0) {
            invalidate();
          }
          return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        invalidate();
      },
      onError: () => {
        if (bulkPendingRef.current > 0) {
          bulkPendingRef.current -= 1;
          if (bulkPendingRef.current === 0) {
            invalidate();
          }
        }
      },
    },
  });

  const patchBillMutation = usePatchBill({
    mutation: {
      onSuccess: () => {
        invalidate();
        queryClient.invalidateQueries({ queryKey: getGetBillsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBillTotalsQueryKey(billId) });
        setShowEditHeader(false);
      },
      onError: () => {
        Alert.alert("Couldn't save", "We couldn't update the bill. Please try again.");
      },
    },
  });

  const deleteBillMutation = useDeleteBill({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBillsQueryKey() });
        router.replace("/(tabs)/bills");
      },
      onError: () => {
        Alert.alert("Couldn't delete", "We couldn't delete this bill. Please try again.");
      },
    },
  });

  const handleDeleteBill = () => {
    confirmDeleteBill(() => deleteBillMutation.mutate({ billId }));
  };

  const handleRemoveFromList = () => {
    Alert.alert(
      "Remove from your list",
      "This removes the bill from your view. The bill itself will not be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            if (user) {
              try {
                await customFetch(`/api/bills/${billId}/leave`, { method: "DELETE" });
                queryClient.invalidateQueries({ queryKey: getGetBillsQueryKey() });
              } catch {
                Alert.alert("Error", "Couldn't remove the bill. Please try again.");
                return;
              }
            } else {
              await removeGuestBill(billId);
              queryClient.invalidateQueries({ queryKey: getGetBillsQueryKey() });
            }
            router.replace("/(tabs)/bills");
          },
        },
      ]
    );
  };

  const openEditHeader = () => {
    if (!data) return;
    setEditTitle(data.bill.title ?? "");
    setEditRestaurant(data.bill.restaurantName ?? "");
    setEditDate(data.bill.date ?? "");
    setEditCurrency(data.bill.currency ?? "");
    setEditTaxPercent(String(parseFloat(String(data.bill.taxPercent ?? 0))));
    setEditTipPercent(String(parseFloat(String(data.bill.tipPercent ?? 0))));
    setShowEditHeader(true);
  };

  const handleSaveHeader = () => {
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      Alert.alert("Title required", "Please enter a bill title.");
      return;
    }
    patchBillMutation.mutate({
      billId,
      data: {
        title: trimmedTitle,
        restaurantName: editRestaurant.trim() ? editRestaurant.trim() : null,
        date: editDate.trim(),
        currency: editCurrency.trim() ? editCurrency.trim().toUpperCase() : null,
        taxPercent: parseFloat(editTaxPercent) || 0,
        tipPercent: parseFloat(editTipPercent) || 0,
      },
    });
  };

  const handleAddPerson = () => {
    if (!newPersonName.trim()) return;
    const existingCount = data?.users?.length ?? 0;
    const color = PEOPLE_COLORS[existingCount % PEOPLE_COLORS.length]!;
    addPersonMutation.mutate({
      billId,
      data: { name: newPersonName.trim(), color },
    });
    setNewPersonName("");
    setShowAddPerson(false);
  };

  const handleDeletePerson = (userId: number, name: string) => {
    Alert.alert("Remove Person", `Remove ${name} from this bill?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deletePersonMutation.mutate({ billId, userId }) },
    ]);
  };

  const handleAddItem = () => {
    if (!newItemDesc.trim()) return;
    const qty = Math.max(1, parseInt(newItemQty) || 1);
    const total = parseFloat(newItemTotal) || 0;
    const unitPrice = total / qty;
    addLineMutation.mutate({
      billId,
      data: { description: newItemDesc.trim(), quantity: qty, unitPrice, total },
    });
    setNewItemDesc("");
    setNewItemTotal("");
    setNewItemQty("1");
    setShowAddItem(false);
  };

  const handleToggleUser = (lineId: number, billUserId: number) => {
    toggleLineMutation.mutate({ billId, lineId, data: { billUserId } });
  };

  const handleBulkToggleUsers = (lineId: number, billUserIds: number[]) => {
    if (billUserIds.length === 0) return;
    bulkPendingRef.current += billUserIds.length;
    billUserIds.forEach((billUserId) => {
      toggleLineMutation.mutate({ billId, lineId, data: { billUserId } });
    });
  };

  const handleDeleteLine = (lineId: number) => {
    deleteLineMutation.mutate({ billId, lineId });
  };

  const handleUpdateLine = (lineId: number, lineData: { description: string; quantity: number; total: number }) => {
    updateLineMutation.mutate({
      billId,
      lineId,
      data: {
        description: lineData.description,
        quantity: lineData.quantity,
        unitPrice: lineData.total / (lineData.quantity || 1),
        total: lineData.total,
      },
    });
  };

  const openSplitModal = (lineId: number) => {
    setSplitLineId(lineId);
    setSplitQtyInput("");
    setShowSplitModal(true);
  };

  const handleConfirmSplit = () => {
    if (!data || splitLineId === null) return;
    const line = data.lines.find((l) => l.id === splitLineId);
    if (!line) return;

    const currentQty = parseFloat(String(line.quantity));
    const splitQty = parseInt(splitQtyInput);

    if (isNaN(splitQty) || splitQty < 1 || splitQty >= currentQty) {
      Alert.alert(
        "Invalid quantity",
        `Enter a number between 1 and ${Math.floor(currentQty) - 1}.`
      );
      return;
    }

    const lineTotal = parseFloat(String(line.total));
    const lineUnitPrice = parseFloat(String(line.unitPrice));

    const splitTotal = Math.round(splitQty * lineUnitPrice * 100) / 100;
    const remainderTotal = Math.round((lineTotal - splitTotal) * 100) / 100;
    const remainderQty = currentQty - splitQty;

    setShowSplitModal(false);
    setSplitLineId(null);

    splitPendingUsersRef.current = line.assignedUserIds ? [...line.assignedUserIds] : [];

    updateLineMutation.mutate({
      billId,
      lineId: splitLineId,
      data: {
        description: line.description,
        quantity: remainderQty,
        unitPrice: lineUnitPrice,
        total: remainderTotal,
      },
    });

    addLineMutation.mutate({
      billId,
      data: {
        description: line.description,
        quantity: splitQty,
        unitPrice: lineUnitPrice,
        total: splitTotal,
      },
    });
  };

  if (isLoading || !data) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Skeleton height={20} width={140} />
        </View>
        <View style={[styles.content, { gap: 20 }]}>
          <Skeleton height={14} width={70} />
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Skeleton height={44} width={44} borderRadius={22} />
            <Skeleton height={44} width={44} borderRadius={22} />
            <Skeleton height={44} width={44} borderRadius={22} />
          </View>
          <Skeleton height={14} width={70} />
          <Skeleton height={60} borderRadius={10} />
          <Skeleton height={60} borderRadius={10} />
          <Skeleton height={140} borderRadius={12} />
        </View>
      </View>
    );
  }

  const { bill: rawBill, lines, users, isOwner, isMember } = data as typeof data & { isMember?: boolean };
  const bill = rawBill as typeof rawBill & { isGuestBill?: boolean; guestOwnerId?: string | null };
  const cachedGuestOwnerId = getCachedGuestOwnerId();
  const isGuestOwner =
    !user &&
    !!bill.isGuestBill &&
    !!bill.guestOwnerId &&
    !!cachedGuestOwnerId &&
    bill.guestOwnerId === cachedGuestOwnerId;
  const canDelete = isOwner || isGuestOwner;
  const canEditHeader = isOwner || !!isMember || isGuestOwner || (!user && !!bill.isGuestBill && guestHasBill);
  const canRemoveFromList = !isOwner && !isGuestOwner && (!!isMember || guestHasBill);

  const fmt = (n: number) => {
    const symbol = getCurrencySymbol(bill.currency);
    return `${symbol ? `${symbol} ` : ""}${n.toFixed(2)}`;
  };

  const subtotal = lines.reduce((sum, l) => sum + parseFloat(String(l.total)), 0);
  const taxPercent = parseFloat(String(bill.taxPercent)) || 0;
  const tipPercent = parseFloat(String(bill.tipPercent)) || 0;
  const taxAmount = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
  const tipAmount = Math.round(subtotal * (tipPercent / 100) * 100) / 100;
  const grandTotal = subtotal + taxAmount + tipAmount;

  const splitLine = splitLineId !== null ? lines.find((l) => l.id === splitLineId) : null;
  const splitLineMaxQty = splitLine ? Math.floor(parseFloat(String(splitLine.quantity))) - 1 : 0;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)/bills")}
          style={styles.headerBtn}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{bill.title}</Text>
          {bill.restaurantName ? (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {bill.restaurantName}
            </Text>
          ) : null}
        </View>
        {canDelete && (
          <TouchableOpacity
            onPress={handleDeleteBill}
            style={styles.headerBtn}
            accessibilityLabel="Delete bill"
            disabled={deleteBillMutation.isPending}
          >
            <Feather name="trash-2" size={18} color={colors.destructive ?? "#EF4444"} />
          </TouchableOpacity>
        )}
        {canEditHeader && (
          <TouchableOpacity onPress={openEditHeader} style={styles.headerBtn} accessibilityLabel="Edit bill details">
            <Feather name="edit-2" size={18} color={colors.foreground} />
          </TouchableOpacity>
        )}
        {canRemoveFromList && (
          <TouchableOpacity
            onPress={handleRemoveFromList}
            style={styles.headerBtn}
            accessibilityLabel="Remove from my list"
          >
            <Feather name="log-out" size={18} color={colors.destructive ?? "#EF4444"} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => router.push(`/bill/${billId}/share`)} style={styles.headerBtn}>
          <Feather name="share-2" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push(`/bill/${billId}/totals`)} style={[styles.totalsBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.totalsBtnText}>Totals</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PEOPLE</Text>
            <TouchableOpacity onPress={() => setShowAddPerson(true)} style={[styles.addBtn, { backgroundColor: colors.muted }]}>
              <Feather name="plus" size={14} color={colors.primary} />
              <Text style={[styles.addBtnText, { color: colors.primary }]}>Add</Text>
            </TouchableOpacity>
          </View>

          {users.length === 0 ? (
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
              Add people to start splitting
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleScroll}>
              {users.map((u, i) => (
                <Animated.View
                  key={u.id}
                  entering={FadeInDown.delay(i * 40).springify().damping(14).mass(0.6)}
                >
                  <PersonBadge
                    name={u.name}
                    color={u.color}
                    size="lg"
                    showName
                    onPress={() => handleDeletePerson(u.id, u.name)}
                  />
                </Animated.View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ITEMS</Text>
            <View style={styles.itemActions}>
              <TouchableOpacity
                onPress={() => router.push(`/bill/${billId}/scan`)}
                style={[styles.addBtn, { backgroundColor: colors.muted }]}
              >
                <Feather name="camera" size={14} color={colors.primary} />
                <Text style={[styles.addBtnText, { color: colors.primary }]}>Scan</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAddItem(true)} style={[styles.addBtn, { backgroundColor: colors.muted }]}>
                <Feather name="plus" size={14} color={colors.primary} />
                <Text style={[styles.addBtnText, { color: colors.primary }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {lines.length === 0 ? (
            <View style={[styles.emptyItems, { borderColor: colors.border }]}>
              <Feather name="file-text" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                No items yet. Scan a receipt or add manually.
              </Text>
            </View>
          ) : (
            lines.map((line) => (
              <LineItemRow
                key={line.id}
                id={line.id}
                description={line.description}
                quantity={parseFloat(String(line.quantity))}
                unitPrice={parseFloat(String(line.unitPrice))}
                total={parseFloat(String(line.total))}
                assignedUserIds={line.assignedUserIds}
                billUsers={users}
                currency={bill.currency}
                onToggleUser={handleToggleUser}
                onBulkToggleUsers={handleBulkToggleUsers}
                onDelete={handleDeleteLine}
                onUpdate={handleUpdateLine}
                onSplit={openSplitModal}
              />
            ))
          )}
        </View>

        <View style={[styles.billSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{fmt(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Tax ({taxPercent}%)</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{fmt(taxAmount)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Tip ({tipPercent}%)</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{fmt(tipAmount)}</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, styles.summaryTotalLabel, { color: colors.foreground }]}>Total</Text>
            <Text style={[styles.summaryValue, styles.summaryTotalValue, { color: colors.primary }]}>{fmt(grandTotal)}</Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showAddPerson} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowAddPerson(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Person</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              placeholder="Name"
              placeholderTextColor={colors.mutedForeground}
              value={newPersonName}
              onChangeText={setNewPersonName}
              autoFocus
              onSubmitEditing={handleAddPerson}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowAddPerson(false)} style={[styles.modalCancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddPerson} style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.modalConfirmText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showEditHeader} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowEditHeader(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Bill Details</Text>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={{ flex: 1 }}
            >
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.editModalScroll}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Title</Text>
                <TextInput
                  style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Bill title"
                  placeholderTextColor={colors.mutedForeground}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  autoFocus
                />
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Restaurant (optional)</Text>
                <TextInput
                  style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Restaurant name"
                  placeholderTextColor={colors.mutedForeground}
                  value={editRestaurant}
                  onChangeText={setEditRestaurant}
                />
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Date</Text>
                <TextInput
                  style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  value={editDate}
                  onChangeText={setEditDate}
                  autoCapitalize="none"
                />
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Currency</Text>
                <CurrencyPicker value={editCurrency} onChange={setEditCurrency} />
                <View style={styles.taxTipRow}>
                  <View style={styles.taxTipField}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Tax %</Text>
                    <TextInput
                      style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
                      placeholder="0"
                      placeholderTextColor={colors.mutedForeground}
                      value={editTaxPercent}
                      onChangeText={setEditTaxPercent}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.taxTipField}>
                    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Tip %</Text>
                    <TextInput
                      style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
                      placeholder="0"
                      placeholderTextColor={colors.mutedForeground}
                      value={editTipPercent}
                      onChangeText={setEditTipPercent}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </ScrollView>
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => setShowEditHeader(false)} style={[styles.modalCancelBtn, { borderColor: colors.border }]}>
                  <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveHeader}
                  disabled={patchBillMutation.isPending}
                  style={[styles.modalConfirmBtn, { backgroundColor: colors.primary, opacity: patchBillMutation.isPending ? 0.6 : 1 }]}
                >
                  <Text style={styles.modalConfirmText}>{patchBillMutation.isPending ? "Saving..." : "Save"}</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showAddItem} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowAddItem(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Item</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              placeholder="Item description"
              placeholderTextColor={colors.mutedForeground}
              value={newItemDesc}
              onChangeText={setNewItemDesc}
              autoFocus
            />
            <View style={styles.addItemAmountRow}>
              <View style={styles.addItemQtyWrap}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Qty</Text>
                <TextInput
                  style={[styles.modalInput, styles.addItemQtyInput, { borderColor: colors.border, color: colors.foreground }]}
                  placeholder="1"
                  placeholderTextColor={colors.mutedForeground}
                  value={newItemQty}
                  onChangeText={setNewItemQty}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.addItemTotalWrap}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Total amount</Text>
                <TextInput
                  style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
                  value={newItemTotal}
                  onChangeText={setNewItemTotal}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowAddItem(false)} style={[styles.modalCancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddItem} style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.modalConfirmText}>Add</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showSplitModal} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowSplitModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Split Quantity</Text>
            {splitLine && (
              <Text style={[styles.splitHint, { color: colors.mutedForeground }]}>
                "{splitLine.description}" has ×{parseFloat(String(splitLine.quantity))} units. How many to split off into a new row?
              </Text>
            )}
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground }]}
              placeholder={splitLineMaxQty > 0 ? `1 – ${splitLineMaxQty}` : ""}
              placeholderTextColor={colors.mutedForeground}
              value={splitQtyInput}
              onChangeText={setSplitQtyInput}
              keyboardType="number-pad"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowSplitModal(false)} style={[styles.modalCancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirmSplit} style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.modalConfirmText}>Split</Text>
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
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerBtn: { padding: 6 },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  totalsBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  totalsBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 24 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  addBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  itemActions: { flexDirection: "row", gap: 8 },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyItems: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  peopleScroll: { gap: 20, paddingVertical: 4, paddingHorizontal: 4 },
  billSummary: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  summaryDivider: { height: 1, marginVertical: 4 },
  summaryTotalLabel: { fontFamily: "Inter_600SemiBold" },
  summaryTotalValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
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
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4, marginBottom: 4 },
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
  editModalScroll: { maxHeight: 400 },
  taxTipRow: { flexDirection: "row", gap: 12, marginTop: 2 },
  taxTipField: { flex: 1 },
  addItemAmountRow: { flexDirection: "row", gap: 12, alignItems: "flex-end" },
  addItemQtyWrap: { width: 72 },
  addItemQtyInput: { textAlign: "center" },
  addItemTotalWrap: { flex: 1 },
  splitHint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
