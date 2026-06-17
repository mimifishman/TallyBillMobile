import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth as useClerkAuth } from "@clerk/expo";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
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
import { BottomSheet } from "@/components/BottomSheet";
import { PressableScale } from "@/components/PressableScale";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Skeleton } from "@/components/Skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { PersonBadge } from "@/components/PersonBadge";
import { EditBillMemberSheet } from "@/components/EditBillMemberSheet";
import { LineItemRow } from "@/components/LineItemRow";
import { EmptyNoPeopleIllustration } from "@/components/EmptyNoPeopleIllustration";
import { EmptyNoItemsIllustration } from "@/components/EmptyNoItemsIllustration";
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
  useGetCircles,
  getGetBillQueryKey,
  getGetBillsQueryKey,
  getGetBillTotalsQueryKey,
  getGetCirclesQueryKey,
  customFetch,
  ApiError,
} from "@workspace/api-client-react";
import { pickColor } from "@/utils/pickColor";
import { getCurrencySymbol } from "@/utils/currency";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { confirmDeleteBill } from "@/utils/confirmDeleteBill";
import { useAuth } from "@/context/AuthContext";
import { removeGuestBill, listGuestBills, getCachedGuestOwnerId } from "@/utils/guestBillStore";
import { getBillCode } from "@/lib/billCodeStore";
import { useScan } from "@/context/ScanContext";

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

  const scan = useScan();

  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [showAddPersonLinkEmail, setShowAddPersonLinkEmail] = useState(false);
  const [newPersonLinkEmail, setNewPersonLinkEmail] = useState("");
  const [newPersonLinkEmailError, setNewPersonLinkEmailError] = useState<string | null>(null);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [showCirclePicker, setShowCirclePicker] = useState(false);
  const [addingFromCircleId, setAddingFromCircleId] = useState<number | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemTotal, setNewItemTotal] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [showEditHeader, setShowEditHeader] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editCurrency, setEditCurrency] = useState("");
  const [editTaxPercent, setEditTaxPercent] = useState("");
  const [editTipPercent, setEditTipPercent] = useState("");

  const [editMember, setEditMember] = useState<{
    id: number;
    name: string;
    color: string;
    linkedUserId?: number | null;
    linkedUserEmail?: string | null;
  } | null>(null);

  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitLineId, setSplitLineId] = useState<number | null>(null);
  const [splitQtyInput, setSplitQtyInput] = useState("");

  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const { data, isLoading } = useGetBill(billId, {
    query: {
      queryKey: getGetBillQueryKey(billId),
      refetchOnWindowFocus: true,
    },
  });

  const { data: circles } = useGetCircles({
    query: {
      queryKey: getGetCirclesQueryKey(),
      enabled: !!user,
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

  // Keep a stable ref to getToken so connectSSE doesn't need it as a dep.
  // Clerk returns a new getToken function reference on every render, which
  // would cause connectSSE (and the SSE useEffect) to re-run on every render,
  // creating a rapid reconnection loop that exhausts TCP connection slots.
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  const connectSSE = useCallback(async () => {
    if (!sseMountedRef.current) return;
    if (sseRetryTimerRef.current) {
      clearTimeout(sseRetryTimerRef.current);
      sseRetryTimerRef.current = null;
    }

    // Abort any existing connection before opening a new one.
    if (sseXhrRef.current) {
      sseXhrRef.current.abort();
      sseXhrRef.current = null;
    }

    const url = `${baseUrl}/api/bills/${billId}/events`;

    const xhr = new XMLHttpRequest();
    sseXhrRef.current = xhr;
    xhr.open("GET", url, true);

    const joinCode = getBillCode(billId);
    if (joinCode) xhr.setRequestHeader("X-Join-Code", joinCode);

    if (isSignedIn) {
      try {
        const token = await getTokenRef.current();
        // If the XHR was replaced while we were awaiting the token, bail out.
        if (sseXhrRef.current !== xhr) return;
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      } catch {
      }
    }

    // Bail if the XHR was replaced (e.g. effect re-ran) before we could send.
    if (sseXhrRef.current !== xhr) return;

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
  // getToken is intentionally excluded — it's accessed via getTokenRef so
  // connectSSE stays stable and doesn't cause the SSE effect to re-run on
  // every render (which would create a rapid reconnection loop).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId, baseUrl, isSignedIn]);

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

  const receiptImagePath =
    (scan.billId === billId ? scan.receiptImagePath : null) ??
    (data?.bill as { receiptImagePath?: string | null } | undefined)?.receiptImagePath ??
    null;

  const receiptJoinCode =
    (data?.bill as { joinCode?: string } | undefined)?.joinCode ??
    getBillCode(billId) ??
    "";

  const receiptObjectId = receiptImagePath ? receiptImagePath.split("/").pop() ?? null : null;
  const receiptImageUri =
    receiptObjectId && receiptJoinCode
      ? `${baseUrl}/api/bills/${billId}/storage/objects/uploads/${receiptObjectId}?joinCode=${encodeURIComponent(receiptJoinCode)}`
      : null;

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
        Alert.alert("Couldn't add item", "Something went wrong. Please try again.");
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
        date: editDate.trim(),
        currency: editCurrency.trim() ? editCurrency.trim().toUpperCase() : null,
        taxPercent: parseFloat(editTaxPercent) || 0,
        tipPercent: parseFloat(editTipPercent) || 0,
      },
    });
  };

  const handleAddPerson = async () => {
    const trimmed = newPersonName.trim();
    if (!trimmed) return;
    const isDuplicate = (data?.users ?? []).some(
      (u: { name: string }) => u.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      Alert.alert("Name already on bill", `"${trimmed}" is already on this bill.`);
      return;
    }
    const existingColors = (data?.users ?? []).map((u: { color: string }) => u.color);
    const color = pickColor(existingColors);
    const emailToLink = showAddPersonLinkEmail ? newPersonLinkEmail.trim() : "";

    if (emailToLink) {
      setIsAddingPerson(true);
      try {
        await customFetch(`/api/bills/${billId}/users`, {
          method: "POST",
          body: JSON.stringify({ name: trimmed, color, linkedEmail: emailToLink }),
        });
        invalidate();
        setNewPersonName("");
        setNewPersonLinkEmail("");
        setShowAddPersonLinkEmail(false);
        setNewPersonLinkEmailError(null);
        setShowAddPerson(false);
      } catch (err) {
        const msg =
          err instanceof ApiError && err.data && typeof (err.data as { error?: string }).error === "string"
            ? (err.data as { error: string }).error
            : "Something went wrong. Please try again.";
        if (err instanceof ApiError && err.status === 422) {
          setNewPersonLinkEmailError(msg);
        } else {
          Alert.alert("Couldn't add person", msg);
        }
      } finally {
        setIsAddingPerson(false);
      }
    } else {
      addPersonMutation.mutate({ billId, data: { name: trimmed, color } });
      setNewPersonName("");
      setNewPersonLinkEmail("");
      setShowAddPersonLinkEmail(false);
      setNewPersonLinkEmailError(null);
      setShowAddPerson(false);
    }
  };

  const handleAddFromCircle = (circleId: number) => {
    const circle = circles?.find((c) => c.id === circleId);
    if (!circle) return;
    setShowCirclePicker(false);
    setAddingFromCircleId(null);

    const existingNames = new Set(
      (data?.users ?? []).map((u: { name: string }) => u.name.toLowerCase().trim())
    );
    const toAdd = circle.members.filter(
      (m) => !existingNames.has(m.name.toLowerCase().trim())
    );
    if (toAdd.length === 0) {
      Alert.alert("Already added", "All members of this circle are already on the bill.");
      return;
    }
    const usedColors = (data?.users ?? []).map((u: { color: string }) => u.color);
    toAdd.forEach((member) => {
      const color = pickColor(usedColors);
      usedColors.push(color);
      addPersonMutation.mutate({
        billId,
        data: {
          name: member.name,
          color,
          ...(member.linkedUserId != null && { linkedUserId: member.linkedUserId }),
        },
      });
    });
  };

  const handleDeletePerson = (userId: number, name: string) => {
    Alert.alert("Remove Person", `Remove ${name} from this bill?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deletePersonMutation.mutate({ billId, userId }) },
    ]);
  };

  const handleBadgePress = (u: { id: number; name: string; color: string; linkedUserId?: number | null; linkedUserEmail?: string | null }, ownerView: boolean) => {
    if (ownerView) {
      setEditMember(u);
    }
  };

  const handleAddItem = () => {
    if (!newItemDesc.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        originalDescription: line.originalDescription ?? null,
        quantity: splitQty,
        unitPrice: lineUnitPrice,
        total: splitTotal,
        afterLineId: splitLineId,
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

  const { bill: rawBill, lines, users, isOwner, isMember, ownerName } = data as typeof data & { isMember?: boolean; ownerName?: string };
  const bill = rawBill as typeof rawBill & { isGuestBill?: boolean; guestOwnerId?: string | null; receiptImagePath?: string | null };
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
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{bill.title}</Text>
          {ownerName ? (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              Created by {ownerName}
            </Text>
          ) : null}
        </View>
        {canDelete && (
          <TouchableOpacity
            onPress={handleDeleteBill}
            style={styles.headerBtn}
            accessibilityLabel="Delete bill"
            disabled={deleteBillMutation.isPending}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="trash-2" size={18} color={colors.destructive ?? "#EF4444"} />
          </TouchableOpacity>
        )}
        {canEditHeader && (
          <TouchableOpacity onPress={openEditHeader} style={styles.headerBtn} accessibilityLabel="Edit bill details" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="edit-2" size={18} color={colors.foreground} />
          </TouchableOpacity>
        )}
        {canRemoveFromList && (
          <TouchableOpacity
            onPress={handleRemoveFromList}
            style={styles.headerBtn}
            accessibilityLabel="Remove from my list"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="log-out" size={18} color={colors.destructive ?? "#EF4444"} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => router.push(`/bill/${billId}/share`)} style={styles.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="share-2" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push(`/bill/${billId}/totals`)} style={[styles.totalsBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.totalsBtnText}>Totals</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
        {receiptImageUri ? (
          <TouchableOpacity
            onPress={() => setShowReceiptModal(true)}
            style={[styles.receiptThumb, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.8}
          >
            <Image
              source={{ uri: receiptImageUri }}
              style={styles.receiptThumbImage}
              resizeMode="cover"
            />
            <View style={styles.receiptThumbLabel}>
              <Feather name="file-text" size={14} color={colors.mutedForeground} />
              <Text style={[styles.receiptThumbText, { color: colors.mutedForeground }]}>View receipt</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PEOPLE</Text>
            <View style={styles.itemActions}>
              {user && circles && circles.length > 0 && (
                <TouchableOpacity
                  onPress={() => setShowCirclePicker(true)}
                  style={[styles.addBtn, { backgroundColor: colors.muted }]}
                >
                  <Feather name="users" size={14} color={colors.primary} />
                  <Text style={[styles.addBtnText, { color: colors.primary }]}>Circle</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowAddPerson(true)} style={[styles.addBtn, { backgroundColor: colors.muted }]}>
                <Feather name="plus" size={14} color={colors.primary} />
                <Text style={[styles.addBtnText, { color: colors.primary }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {users.length === 0 ? (
            <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyPeople}>
              <EmptyNoPeopleIllustration size={120} />
              <Text style={[styles.emptyStateTitle, { color: colors.foreground }]}>No one here yet</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Add people to start splitting the bill</Text>
            </Animated.View>
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
                    onPress={isOwner || isGuestOwner ? () => handleBadgePress(u as { id: number; name: string; color: string; linkedUserId?: number | null; linkedUserEmail?: string | null }, true) : undefined}
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
            <Animated.View entering={FadeInDown.duration(400)} style={[styles.emptyItems, { borderColor: colors.border }]}>
              <EmptyNoItemsIllustration size={120} />
              <Text style={[styles.emptyStateTitle, { color: colors.foreground }]}>No items yet</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>Scan a receipt or add items manually</Text>
            </Animated.View>
          ) : (
            lines.map((line) => (
              <LineItemRow
                key={line.id}
                id={line.id}
                description={line.description}
                originalDescription={(line as typeof line & { originalDescription?: string | null }).originalDescription}
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

      <BottomSheet
        visible={showAddPerson}
        onClose={() => {
          setShowAddPerson(false);
          setNewPersonName("");
          setNewPersonLinkEmail("");
          setShowAddPersonLinkEmail(false);
          setNewPersonLinkEmailError(null);
        }}
        title="Add someone"
      >
        <View style={styles.sheetContent}>
          <TextInput
            style={[styles.sheetInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
            placeholder="e.g. Jordan, Mom, The birthday person"
            placeholderTextColor={colors.mutedForeground}
            value={newPersonName}
            onChangeText={setNewPersonName}
            autoFocus
            autoCapitalize="words"
            returnKeyType={showAddPersonLinkEmail ? "next" : "done"}
            onSubmitEditing={() => { if (!showAddPersonLinkEmail) handleAddPerson(); }}
          />
          {showAddPersonLinkEmail ? (
            <View style={{ gap: 6 }}>
              <TextInput
                style={[styles.sheetInput, {
                  borderColor: newPersonLinkEmailError ? (colors.destructive ?? "#EF4444") : colors.border,
                  color: colors.foreground,
                  backgroundColor: colors.muted,
                }]}
                placeholder="TallyBill email address"
                placeholderTextColor={colors.mutedForeground}
                value={newPersonLinkEmail}
                onChangeText={(v) => { setNewPersonLinkEmail(v); setNewPersonLinkEmailError(null); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleAddPerson}
                autoFocus={false}
              />
              {newPersonLinkEmailError ? (
                <Text style={[styles.linkEmailError, { color: colors.destructive ?? "#EF4444" }]}>
                  {newPersonLinkEmailError}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={() => { setShowAddPersonLinkEmail(false); setNewPersonLinkEmail(""); setNewPersonLinkEmailError(null); }}
              >
                <Text style={[styles.linkEmailError, { color: colors.mutedForeground }]}>Cancel link</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowAddPersonLinkEmail(true)}
              style={styles.addPersonLinkBtn}
            >
              <Feather name="link" size={13} color={colors.primary} />
              <Text style={[styles.addPersonLinkText, { color: colors.primary }]}>
                Link to TallyBill account (optional)
              </Text>
            </TouchableOpacity>
          )}
          <PressableScale
            onPress={handleAddPerson}
            disabled={isAddingPerson || !newPersonName.trim()}
            style={[styles.sheetPrimaryBtn, { backgroundColor: colors.primary, opacity: isAddingPerson || !newPersonName.trim() ? 0.6 : 1 }]}
          >
            {isAddingPerson
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.sheetPrimaryBtnText}>Add to Bill</Text>
            }
          </PressableScale>
          <TouchableOpacity
            onPress={() => {
              setShowAddPerson(false);
              setNewPersonName("");
              setNewPersonLinkEmail("");
              setShowAddPersonLinkEmail(false);
              setNewPersonLinkEmailError(null);
            }}
            style={styles.sheetCancelBtn}
          >
            <Text style={[styles.sheetCancelBtnText, { color: colors.mutedForeground }]}>Nevermind</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={showEditHeader} onClose={() => setShowEditHeader(false)} title="Edit Bill Details">
        <View style={styles.sheetContent}>
              <View style={styles.sheetFieldGroup}>
                <Text style={[styles.sheetFieldLabel, { color: colors.mutedForeground }]}>TITLE</Text>
                <TextInput
                  style={[styles.sheetInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                  placeholder="e.g. Sushi with the gang"
                  placeholderTextColor={colors.mutedForeground}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  autoFocus
                />
              </View>
              <View style={styles.sheetFieldGroup}>
                <Text style={[styles.sheetFieldLabel, { color: colors.mutedForeground }]}>DATE</Text>
                <TextInput
                  style={[styles.sheetInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  value={editDate}
                  onChangeText={setEditDate}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.sheetFieldGroup}>
                <Text style={[styles.sheetFieldLabel, { color: colors.mutedForeground }]}>CURRENCY</Text>
                <CurrencyPicker value={editCurrency} onChange={setEditCurrency} />
              </View>
              <View style={styles.taxTipRow}>
                <View style={styles.taxTipField}>
                  <Text style={[styles.sheetFieldLabel, { color: colors.mutedForeground }]}>TAX %</Text>
                  <TextInput
                    style={[styles.sheetInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, textAlign: "center" }]}
                    placeholder="e.g. 8.5"
                    placeholderTextColor={colors.mutedForeground}
                    value={editTaxPercent}
                    onChangeText={setEditTaxPercent}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.taxTipField}>
                  <Text style={[styles.sheetFieldLabel, { color: colors.mutedForeground }]}>TIP %</Text>
                  <TextInput
                    style={[styles.sheetInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, textAlign: "center" }]}
                    placeholder="Leave 'em smiling"
                    placeholderTextColor={colors.mutedForeground}
                    value={editTipPercent}
                    onChangeText={setEditTipPercent}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <PressableScale
                onPress={handleSaveHeader}
                disabled={patchBillMutation.isPending}
                style={[styles.sheetPrimaryBtn, { backgroundColor: colors.primary, opacity: patchBillMutation.isPending ? 0.6 : 1 }]}
              >
                <Text style={styles.sheetPrimaryBtnText}>{patchBillMutation.isPending ? "Saving…" : "Save Changes"}</Text>
              </PressableScale>
              <TouchableOpacity onPress={() => setShowEditHeader(false)} style={styles.sheetCancelBtn}>
                <Text style={[styles.sheetCancelBtnText, { color: colors.mutedForeground }]}>Discard</Text>
              </TouchableOpacity>
            </View>
      </BottomSheet>

      <BottomSheet visible={showAddItem} onClose={() => setShowAddItem(false)} title="Add Item">
        <View style={styles.sheetContent}>
            <TextInput
              style={[styles.sheetInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
              placeholder="e.g. Spicy tuna roll, dessert, drinks"
              placeholderTextColor={colors.mutedForeground}
              value={newItemDesc}
              onChangeText={setNewItemDesc}
              autoFocus
              returnKeyType="next"
            />
            <View style={styles.addItemAmountRow}>
              <View style={styles.addItemQtyWrap}>
                <Text style={[styles.sheetFieldLabel, { color: colors.mutedForeground }]}>QTY</Text>
                <TextInput
                  style={[styles.sheetInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, textAlign: "center" }]}
                  placeholder="1"
                  placeholderTextColor={colors.mutedForeground}
                  value={newItemQty}
                  onChangeText={setNewItemQty}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.addItemTotalWrap}>
                <Text style={[styles.sheetFieldLabel, { color: colors.mutedForeground }]}>TOTAL AMOUNT</Text>
                <TextInput
                  style={[styles.sheetInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
                  value={newItemTotal}
                  onChangeText={setNewItemTotal}
                  keyboardType="numeric"
                  returnKeyType="done"
                  onSubmitEditing={handleAddItem}
                />
              </View>
            </View>
            <PressableScale onPress={handleAddItem} style={[styles.sheetPrimaryBtn, { backgroundColor: colors.primary }]}>
              <Text style={styles.sheetPrimaryBtnText}>Add Item</Text>
            </PressableScale>
            <TouchableOpacity onPress={() => setShowAddItem(false)} style={styles.sheetCancelBtn}>
              <Text style={[styles.sheetCancelBtnText, { color: colors.mutedForeground }]}>Nevermind</Text>
            </TouchableOpacity>
          </View>
      </BottomSheet>

      {(scan.status === "scanning" || scan.status === "ready" || scan.status === "error") && scan.billId === billId && (
        <TouchableOpacity
          activeOpacity={scan.status === "ready" ? 0.7 : 1}
          onPress={() => {
            if (scan.status === "ready") {
              router.push(`/bill/${billId}/scan`);
            }
          }}
          style={[
            styles.scanBanner,
            {
              bottom: insets.bottom + 12,
              backgroundColor:
                scan.status === "error"
                  ? colors.destructive
                  : scan.status === "ready"
                  ? colors.primary
                  : colors.foreground,
            },
          ]}
        >
          {scan.status === "scanning" && (
            <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
          )}
          {scan.status === "ready" && (
            <Feather name="check-circle" size={16} color="#fff" style={{ marginRight: 8 }} />
          )}
          {scan.status === "error" && (
            <Feather name="alert-circle" size={16} color="#fff" style={{ marginRight: 8 }} />
          )}
          <Text style={styles.scanBannerText}>
            {scan.status === "scanning"
              ? "Scanning receipt…"
              : scan.status === "ready"
              ? "Scan ready — tap to review"
              : scan.errorMessage || "Scan failed"}
          </Text>
          {scan.status === "error" && (
            <TouchableOpacity
              onPress={scan.reset}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 8 }}
            >
              <Feather name="x" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      )}

      <BottomSheet visible={showSplitModal} onClose={() => setShowSplitModal(false)} title="Split Quantity">
        <View style={styles.sheetContent}>
          {splitLine && (
            <Text style={[styles.splitHint, { color: colors.mutedForeground }]}>
              "{splitLine.description}"{splitLine.originalDescription ? ` (${splitLine.originalDescription})` : ""}{" "}
              has ×{parseFloat(String(splitLine.quantity))} units. How many to split off into a new row?
            </Text>
          )}
          <TextInput
            style={[styles.sheetInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.muted, textAlign: "center", fontSize: 22, fontFamily: "Inter_700Bold" }]}
            placeholder={splitLineMaxQty > 0 ? `1 – ${splitLineMaxQty}` : ""}
            placeholderTextColor={colors.mutedForeground}
            value={splitQtyInput}
            onChangeText={setSplitQtyInput}
            keyboardType="number-pad"
            autoFocus
          />
          <PressableScale onPress={handleConfirmSplit} style={[styles.sheetPrimaryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.sheetPrimaryBtnText}>Split it</Text>
          </PressableScale>
          <TouchableOpacity onPress={() => setShowSplitModal(false)} style={styles.sheetCancelBtn}>
            <Text style={[styles.sheetCancelBtnText, { color: colors.mutedForeground }]}>Nevermind</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet visible={showCirclePicker} onClose={() => setShowCirclePicker(false)} title="Add from Circle">
        <View style={styles.sheetContent}>
          {circles && circles.length > 0 ? (
            circles.map((circle, index) => (
              <TouchableOpacity
                key={circle.id}
                style={[
                  styles.circlePickerRow,
                  { borderColor: colors.border, borderTopWidth: index === 0 ? 0 : 1 },
                ]}
                onPress={() => { setAddingFromCircleId(circle.id); handleAddFromCircle(circle.id); }}
                disabled={addingFromCircleId === circle.id}
                activeOpacity={0.7}
              >
                <View style={[styles.circlePickerIcon, { backgroundColor: colors.primarySoft }]}>
                  <Feather name="users" size={16} color={colors.primary} />
                </View>
                <View style={styles.circlePickerInfo}>
                  <Text style={[styles.circlePickerName, { color: colors.foreground }]}>{circle.name}</Text>
                  <Text style={[styles.circlePickerCount, { color: colors.mutedForeground }]}>
                    {circle.members.length === 1 ? "1 person" : `${circle.members.length} people`}
                  </Text>
                </View>
                {addingFromCircleId === circle.id ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                )}
              </TouchableOpacity>
            ))
          ) : null}
        </View>
      </BottomSheet>

      <EditBillMemberSheet
        visible={!!editMember}
        member={editMember}
        billId={billId}
        onClose={() => setEditMember(null)}
        onSaved={invalidate}
        onDeleted={invalidate}
      />

      <Modal visible={showReceiptModal} transparent animationType="fade" onRequestClose={() => setShowReceiptModal(false)}>
        <View style={styles.receiptModalOverlay}>
          <TouchableOpacity
            style={styles.receiptModalClose}
            onPress={() => setShowReceiptModal(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
          {receiptImageUri ? (
            <Image
              source={{ uri: receiptImageUri }}
              style={styles.receiptModalImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
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
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    gap: SPACING.sm,
  },
  headerBtn: { padding: 6 },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" }, // TODO: one-off
  totalsBtn: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  totalsBtnText: { color: "#fff", fontSize: FONT_SIZE.caption, fontFamily: "Inter_700Bold" },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, gap: SPACING.xxl },
  section: { gap: SPACING.md },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.0 }, // TODO: one-off
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  itemActions: { flexDirection: "row", gap: 8 },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyStateTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyPeople: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  emptyItems: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: RADIUS.lg,
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  peopleScroll: { gap: SPACING.xl, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.xs },
  billSummary: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 14, fontFamily: "Inter_400Regular" }, // TODO: one-off
  summaryValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  summaryDivider: { height: 1, marginVertical: SPACING.xs },
  summaryTotalLabel: { fontFamily: "Inter_700Bold", fontSize: FONT_SIZE.body },
  summaryTotalValue: { fontSize: 18, fontFamily: "Inter_700Bold" }, // TODO: one-off
  sheetContent: { gap: 14 },
  sheetInput: {
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    fontSize: FONT_SIZE.body,
    fontFamily: "Inter_400Regular",
  },
  sheetFieldGroup: { gap: 6 },
  sheetFieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.0 }, // TODO: one-off
  sheetPrimaryBtn: { borderRadius: RADIUS.full, paddingVertical: SPACING.lg, alignItems: "center" },
  sheetPrimaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }, // TODO: one-off
  sheetCancelBtn: { alignItems: "center", paddingVertical: SPACING.sm },
  sheetCancelBtnText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_500Medium" },
  addPersonLinkBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  addPersonLinkText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_500Medium" },
  linkEmailError: { fontSize: 12, fontFamily: "Inter_400Regular" },
  taxTipRow: { flexDirection: "row", gap: SPACING.md },
  taxTipField: { flex: 1 },
  addItemAmountRow: { flexDirection: "row", gap: SPACING.md, alignItems: "flex-end" },
  addItemQtyWrap: { width: 80 },
  addItemTotalWrap: { flex: 1 },
  splitHint: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 }, // TODO: one-off
  scanBanner: {
    position: "absolute",
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  scanBannerText: { flex: 1, color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  receiptThumb: { flexDirection: "row", alignItems: "center", borderRadius: RADIUS.lg, borderWidth: 1, overflow: "hidden", gap: SPACING.md },
  receiptThumbImage: { width: 72, height: 72 },
  receiptThumbLabel: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  receiptThumbText: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_500Medium" },
  receiptModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center" },
  receiptModalClose: { position: "absolute", top: 52, right: SPACING.xl, zIndex: 10, padding: SPACING.sm },
  receiptModalImage: { width: "100%", height: "80%" },
  circlePickerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 },
  circlePickerIcon: { width: 40, height: 40, borderRadius: RADIUS.lg, alignItems: "center", justifyContent: "center" },
  circlePickerInfo: { flex: 1, gap: 2 },
  circlePickerName: { fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold" },
  circlePickerCount: { fontSize: 12, fontFamily: "Inter_400Regular" }, // TODO: one-off
});
