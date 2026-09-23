import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import {
  useBulkCreateBillLines,
  useGetBill,
  usePatchBill,
  getGetBillQueryKey,
} from "@workspace/api-client-react";
import { formatMoney } from "@/utils/currency";
import { apiErrorMessage } from "@/utils/apiErrors";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { useScan } from "@/context/ScanContext";
import { LanguagePicker } from "@/components/LanguagePicker";
import { ReviewItemSheet, type ReviewItemValues } from "@/components/ReviewItemSheet";
import { TaxTipField } from "@/components/TaxTipField";
import { amountFromPercent, toPercent, type MoneyMode } from "@/utils/taxTip";
import { applyAmount, applyPercent, inferDiscountSelection } from "@/utils/discount";
import { DiscountSheet } from "@/components/DiscountSheet";

const THUMBNAIL_HEIGHT = 300;
const PREF_LANGUAGE_KEY = "@tallybill/receipt_language";

// Selected items with a non-empty name — the only ones counted in the summary
// and submitted on confirm. Blank "Add item" rows are ignored everywhere.
function isCountedItem(item: { selected: boolean; description: string; translatedDescription?: string }) {
  return item.selected && (item.translatedDescription ?? item.description).trim().length > 0;
}

const SCAN_MESSAGES = [
  "Preparing image…",
  "Reading receipt…",
  "Identifying items…",
  "Calculating totals…",
];

function ScanningOverlay({ colors }: { colors: ReturnType<typeof useColors> }) {
  const scanLineY = useRef(new Animated.Value(0)).current;
  const messageOpacity = useRef(new Animated.Value(1)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineY, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanLineY, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ]),
    );
    scanLoop.start();

    const makeDotPulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
          Animated.delay(800),
        ]),
      );
    const d1 = makeDotPulse(dot1, 0);
    const d2 = makeDotPulse(dot2, 200);
    const d3 = makeDotPulse(dot3, 400);
    d1.start();
    d2.start();
    d3.start();

    let idx = 0;
    const msgInterval = setInterval(() => {
      if (idx < SCAN_MESSAGES.length - 1) {
        Animated.sequence([
          Animated.timing(messageOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.timing(messageOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
        idx += 1;
        setMessageIndex(idx);
      }
    }, 3500);

    return () => {
      scanLoop.stop();
      d1.stop();
      d2.stop();
      d3.stop();
      clearInterval(msgInterval);
    };
  }, []);

  const scanLineTranslate = scanLineY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, THUMBNAIL_HEIGHT - 2],
  });

  return (
    <View style={styles.overlayContainer}>
      <Animated.View
        style={[
          styles.scanLine,
          { backgroundColor: colors.primary, transform: [{ translateY: scanLineTranslate }] },
        ]}
      />
      <View style={[styles.scanCorner, styles.scanCornerTL, { borderColor: colors.primary }]} />
      <View style={[styles.scanCorner, styles.scanCornerTR, { borderColor: colors.primary }]} />
      <View style={[styles.scanCorner, styles.scanCornerBL, { borderColor: colors.primary }]} />
      <View style={[styles.scanCorner, styles.scanCornerBR, { borderColor: colors.primary }]} />
      <View style={styles.messageRow}>
        <Animated.Text style={[styles.scanMessage, { color: "#fff", opacity: messageOpacity }]}>
          {SCAN_MESSAGES[messageIndex]}
        </Animated.Text>
        <View style={styles.dotsRow}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View key={i} style={[styles.dot, { backgroundColor: "#fff", opacity: dot }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = parseInt(id!);
  const scan = useScan();

  const [editor, setEditor] = useState<{ mode: "add" } | { mode: "edit"; index: number } | null>(null);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<string | null>(null);
  const [showOriginals, setShowOriginals] = useState(true);
  const [taxMode, setTaxMode] = useState<MoneyMode>("percent");
  const [taxInput, setTaxInput] = useState("");
  const [tipMode, setTipMode] = useState<MoneyMode>("percent");
  const [tipInput, setTipInput] = useState("");
  const [showDiscount, setShowDiscount] = useState(false);
  /**
   * Money off each item, keyed by its position in the scanned list.
   *
   * Held per item rather than as one bill-wide figure because that is what
   * receipts actually do: the fixture that prompted this takes 20% off five of
   * its seven lines and leaves the other two alone. One rate per item also means
   * two discounts can never land on the same item, so there is no
   * order-of-application question to get wrong.
   */
  const [itemDiscounts, setItemDiscounts] = useState<Map<number, { amount: number; originalTotal: number }>>(new Map());
  const taxTipSeeded = useRef(false);
  const keyboardHeight = useKeyboardHeight();

  const hasTranslations = scan.items.some((i) => i.translatedDescription != null);

  const { data: billData } = useGetBill(billId, { query: { queryKey: getGetBillQueryKey(billId) } });

  const { selectedCount, selectedTotal } = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const item of scan.items) {
      if (!isCountedItem(item)) continue;
      count += 1;
      total += Number.isFinite(item.total) ? item.total : 0;
    }
    return { selectedCount: count, selectedTotal: total };
  }, [scan.items]);

  /**
   * What a row should show: the amount that will actually be charged for it,
   * and the price it was before, when a discount took something off.
   *
   * Held here rather than in the row so the rows and the totals cannot drift —
   * a row showing 124.00 above a subtotal that had already taken 20% off it was
   * the bug this fixes.
   */
  const pricedItem = (index: number, total: number) => {
    const discount = itemDiscounts.get(index);
    if (!discount) return { charged: total, was: null as number | null, percent: null as number | null };
    const charged = Math.round((discount.originalTotal - discount.amount) * 100) / 100;
    const percent = discount.originalTotal > 0
      ? Math.round((discount.amount / discount.originalTotal) * 1000) / 10
      : null;
    return { charged, was: discount.originalTotal, percent };
  };

  useEffect(() => {
    AsyncStorage.getItem(PREF_LANGUAGE_KEY).then((val) => {
      if (val) setPreferredLanguage(val);
    });
  }, []);

  // Show what the bill already carries, so a second scan does not silently
  // offer to overwrite a rate the user set earlier. Seeded once: after that
  // the fields belong to whoever is typing in them.
  useEffect(() => {
    if (taxTipSeeded.current || !billData) return;
    taxTipSeeded.current = true;
    const tax = parseFloat(String(billData.bill.taxPercent ?? 0)) || 0;
    const tip = parseFloat(String(billData.bill.tipPercent ?? 0)) || 0;
    if (tax > 0) setTaxInput(String(tax));
    if (tip > 0) setTipInput(String(tip));
  }, [billData]);

  /**
   * Seeds the discount from the receipt, once.
   *
   * A bill-level discount is not carried by any item, so if it is not offered
   * here it is lost. The receipt says how much came off but not what it came
   * off, so the selection is worked out: on the Back Yard fixture, 94.00 is
   * uniquely 20% off five of its seven lines. Where more than one set of items
   * would fit, nothing is pre-selected and the choice stays with the person
   * holding the receipt — guessing wrong would discount someone else's dish.
   *
   * Guarded by a ref so a later scan result cannot overwrite what was chosen.
   */
  const seededDiscountRef = useRef(false);
  useEffect(() => {
    if (seededDiscountRef.current) return;
    if (scan.billDiscount == null || scan.billDiscount <= 0 || scan.items.length === 0) return;
    seededDiscountRef.current = true;

    const lines = scan.items.map((item, index) => ({ id: index, total: item.total, originalTotal: null }));
    const inferred = inferDiscountSelection(lines, scan.billDiscount);

    const next = new Map<number, { amount: number; originalTotal: number }>();
    if (inferred) {
      for (const id of inferred.lineIds) {
        const applied = applyPercent(lines[id]!, inferred.percent);
        next.set(id, { amount: applied.discountAmount, originalTotal: applied.originalTotal! });
      }
    } else {
      // Which items the discount came off could not be worked out, so it is
      // spread over everything — that lands the bill on the right figure and
      // leaves something obvious to correct.
      for (const share of applyAmount(scan.billDiscount, lines)) {
        if (share.discountAmount > 0) {
          next.set(share.id, {
            amount: share.discountAmount,
            originalTotal: share.originalTotal!,
          });
        }
      }
    }
    setItemDiscounts(next);
  }, [scan.billDiscount, scan.items]);

  /**
   * How far the selected items sit from the receipt's own total.
   *
   * Only shown when the receipt actually printed a total AND the scan says they
   * disagree. A scan with nothing to check against stays quiet rather than
   * claiming either way, and unticking an item is a deliberate act — so the gap
   * is measured against everything that was read, not against the selection.
   */
  const receiptGap = useMemo(() => {
    if (scan.reconciled !== false || scan.printedTotal == null) return null;
    const readTotal = scan.items.reduce((sum, i) => sum + (Number.isFinite(i.total) ? i.total : 0), 0);
    const difference = Math.round((readTotal - scan.printedTotal) * 100) / 100;
    if (difference === 0) return null;
    return { difference, printedTotal: scan.printedTotal };
  }, [scan.reconciled, scan.printedTotal, scan.items]);

  const discountedCount = useMemo(
    () => scan.items.filter((item, index) => isCountedItem(item) && (itemDiscounts.get(index)?.amount ?? 0) > 0).length,
    [scan.items, itemDiscounts],
  );

  // Only discounts on items still ticked count towards the bill.
  const chargedTotal = useMemo(() => {
    let sum = 0;
    scan.items.forEach((item, index) => {
      if (!isCountedItem(item)) return;
      sum += pricedItem(index, Number.isFinite(item.total) ? item.total : 0).charged;
    });
    return Math.round(sum * 100) / 100;
  }, [scan.items, itemDiscounts]);

  const discountAmount = useMemo(() => {
    let off = 0;
    scan.items.forEach((item, index) => {
      if (!isCountedItem(item)) return;
      off += itemDiscounts.get(index)?.amount ?? 0;
    });
    return Math.round(off * 100) / 100;
  }, [scan.items, itemDiscounts]);
  // Tax and tip follow the discounted figure — the receipt charges tax on what
  // is actually owed, and a tip on a discounted bill is the smaller tip.
  const discountedTotal = chargedTotal;
  const taxPercent = toPercent(taxMode, taxInput, discountedTotal);
  const tipPercent = toPercent(tipMode, tipInput, discountedTotal);
  const taxAmount = amountFromPercent(taxPercent, discountedTotal);
  const tipAmount = amountFromPercent(tipPercent, discountedTotal);
  const grandTotal = discountedTotal + taxAmount + tipAmount;

  // Switching unit converts what is already there, rather than clearing it —
  // "8.5%" becomes the sum it works out to, and back again.
  const changeTaxMode = (mode: MoneyMode) => {
    if (mode === taxMode) return;
    const asAmount = amountFromPercent(taxPercent, discountedTotal);
    if (mode === "amount") setTaxInput(taxPercent > 0 ? String(asAmount) : "");
    else setTaxInput(taxPercent > 0 ? String(taxPercent) : "");
    setTaxMode(mode);
  };

  const changeTipMode = (mode: MoneyMode) => {
    if (mode === tipMode) return;
    const asAmount = amountFromPercent(tipPercent, discountedTotal);
    if (mode === "amount") setTipInput(tipPercent > 0 ? String(asAmount) : "");
    else setTipInput(tipPercent > 0 ? String(tipPercent) : "");
    setTipMode(mode);
  };

  const isScanning = scan.status === "scanning";
  const isReady = scan.status === "ready";
  const step: "pick" | "review" = isReady ? "review" : "pick";

  const leaveScan = () => {
    scan.reset();
    router.back();
  };

  // Runs after the items land, so the rate is never stored against a bill
  // whose items failed to save. A failure here is worth saying out loud —
  // the items did go in, so silently dropping the tax would leave a bill
  // that looks finished and is short.
  const patchBillMutation = usePatchBill({
    mutation: {
      onError: (err) => {
        Alert.alert(
          "Items added, but not the tax and tip",
          apiErrorMessage(err, "You can set them from the bill instead."),
        );
      },
      onSettled: leaveScan,
    },
  });

  const bulkCreateMutation = useBulkCreateBillLines({
    mutation: {
      onSuccess: () => {
        const billTax = parseFloat(String(billData?.bill.taxPercent ?? 0)) || 0;
        const billTip = parseFloat(String(billData?.bill.tipPercent ?? 0)) || 0;
        if (taxPercent !== billTax || tipPercent !== billTip) {
          patchBillMutation.mutate({ billId, data: { taxPercent, tipPercent } });
          return;
        }
        leaveScan();
      },
      onError: (err) => {
        Alert.alert("Error", apiErrorMessage(err, "Failed to save items. Please try again."));
      },
    },
  });

  const pickImage = async (fromCamera: boolean) => {
    let result;
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Camera access is needed to scan receipts");
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        base64: false,
        quality: 1,
        allowsEditing: false,
      });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        base64: false,
        quality: 1,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
    }
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      scan.startScan(billId, asset.uri, asset.width ?? 1800);
    }
  };

  const toggleItem = (index: number) => {
    scan.setItems((prev) => prev.map((item, i) => i === index ? { ...item, selected: !item.selected } : item));
  };

  // Values shown in the edit sheet for the item being edited (null in add mode).
  const editorInitial: ReviewItemValues | null = useMemo(() => {
    if (editor?.mode !== "edit") return null;
    const item = scan.items[editor.index];
    if (!item) return null;
    const discount = itemDiscounts.get(editor.index);
    return {
      name: item.translatedDescription ?? item.description,
      quantity: item.quantity,
      total: discount ? discount.originalTotal : item.total,
      discountAmount: discount ? discount.amount : 0,
    };
  }, [editor, scan.items, itemDiscounts]);

  const handleEditorSave = (values: ReviewItemValues) => {
    // `values.total` is the full price. The item keeps that as its total and the
    // discount is held beside it, so editing a price never quietly throws away
    // the saving that was on it.
    const unitPrice = values.quantity > 0
      ? Math.round((values.total / values.quantity) * 100) / 100
      : values.total;
    const applyDiscount = (index: number) => {
      setItemDiscounts((prev) => {
        const next = new Map(prev);
        if (values.discountAmount > 0) {
          next.set(index, {
            amount: values.discountAmount,
            originalTotal: values.total,
          });
        } else {
          next.delete(index);
        }
        return next;
      });
    };
    if (editor?.mode === "edit") {
      const index = editor.index;
      applyDiscount(index);
      scan.setItems((prev) =>
        prev.map((item, i) => {
          if (i !== index) return item;
          const displayName = item.translatedDescription ?? item.description;
          const nameChanged = values.name !== displayName;
          return {
            ...item,
            // Renaming replaces the translated name, so drop the original.
            description: nameChanged ? values.name : item.description,
            translatedDescription: nameChanged ? undefined : item.translatedDescription,
            quantity: values.quantity,
            total: values.total,
            unitPrice,
          };
        }),
      );
    } else {
      applyDiscount(scan.items.length);
      scan.setItems((prev) => [
        ...prev,
        {
          description: values.name,
          quantity: values.quantity,
          unitPrice,
          total: values.total,
          selected: true,
        },
      ]);
    }
    setEditor(null);
  };

  const handleAddItem = () => {
    setEditor({ mode: "add" });
  };

  const handleConfirm = () => {
    // Each item carries its own discount already, so nothing has to be
    // apportioned here — the line total is simply what will be charged, and
    // everything downstream (each person's share, tax, tip) follows from it.
    const selectedIndexes = scan.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => isCountedItem(item));
    if (selectedIndexes.length === 0) {
      Alert.alert("Nothing selected", "Select at least one item to add");
      return;
    }

    bulkCreateMutation.mutate({
      billId,
      data: {
        lines: selectedIndexes.map(({ item, index }) => {
          const { description, translatedDescription, quantity, total } = item;
          const discount = itemDiscounts.get(index);
          const charged = discount
            ? Math.round((discount.originalTotal - discount.amount) * 100) / 100
            : total;
          return {
            description: translatedDescription ?? description,
            originalDescription: translatedDescription ? description : null,
            quantity,
            unitPrice: quantity > 0 ? Math.round((charged / quantity) * 100) / 100 : charged,
            total: charged,
            originalTotal: discount ? discount.originalTotal : null,
          };
        }),
      },
    });
  };

  const handleClose = () => {
    scan.reset();
    router.back();
  };

  const handleMinimize = () => {
    router.back();
  };

  const handleTranslatePress = () => {
    setShowLanguagePicker(true);
  };

  const handleLanguageConfirm = async (language: string) => {
    setShowLanguagePicker(false);
    setPreferredLanguage(language);
    await AsyncStorage.setItem(PREF_LANGUAGE_KEY, language);
    try {
      await scan.translateItems(language);
      setShowOriginals(true);
    } catch {
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close" hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {isScanning ? "Scanning…" : step === "pick" ? "Scan Receipt" : "Review Items"}
        </Text>
        {isScanning && (
          <TouchableOpacity onPress={handleMinimize} style={styles.minimizeBtn} accessibilityLabel="Minimize" hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}>
            <Feather name="chevron-down" size={22} color={colors.foreground} />
          </TouchableOpacity>
        )}
        {step === "review" && !isScanning && (
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleTranslatePress}
              disabled={scan.translating}
              style={[styles.translateBtn, { borderColor: colors.border }]}
            >
              {scan.translating ? (
                <ActivityIndicator color={colors.foreground} size="small" />
              ) : (
                <>
                  <Feather name="globe" size={14} color={colors.foreground} />
                  <Text style={[styles.translateBtnText, { color: colors.foreground }]}>Translate</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={bulkCreateMutation.isPending || patchBillMutation.isPending}
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
            >
              {bulkCreateMutation.isPending || patchBillMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>Add {scan.items.filter(isCountedItem).length} Items</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {scan.translateError ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.destructive + "18", borderColor: colors.destructive + "40" }]}>
          <Feather name="alert-circle" size={14} color={colors.destructive} />
          <Text style={[styles.errorBannerText, { color: colors.destructive }]}>{scan.translateError}</Text>
        </View>
      ) : null}

      {isScanning && scan.capturedUri ? (
        <View style={styles.scanContainer}>
          <View style={styles.thumbnailWrapper}>
            <Image source={{ uri: scan.capturedUri }} style={styles.thumbnail} resizeMode="cover" />
            <View style={styles.thumbnailDim} />
            <ScanningOverlay colors={colors} />
          </View>
          <Text style={[styles.scanHint, { color: colors.mutedForeground }]}>
            This usually takes 10–20 seconds
          </Text>
        </View>
      ) : step === "pick" ? (
        <View style={styles.pickContainer}>
          <View style={[styles.iconBox, { backgroundColor: colors.primarySoft }]}>
            <Feather name="camera" size={48} color={colors.primaryText} />
          </View>
          <Text style={[styles.pickTitle, { color: colors.foreground }]}>Scan a Receipt</Text>
          <Text style={[styles.pickSub, { color: colors.mutedForeground }]}>
            Point your camera at the line items section of your receipt. Works with all language receipts.
          </Text>
          <TouchableOpacity
            style={[styles.pickBtn, { backgroundColor: colors.primary }]}
            onPress={() => Platform.OS !== "web" ? pickImage(true) : pickImage(false)}
          >
            <Feather name="camera" size={20} color="#fff" />
            <Text style={styles.pickBtnText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pickBtnGhost, { borderColor: colors.border }]}
            onPress={() => pickImage(false)}
          >
            <Feather name="image" size={20} color={colors.foreground} />
            <Text style={[styles.pickBtnGhostText, { color: colors.foreground }]}>Choose from Library</Text>
          </TouchableOpacity>
        </View>
      ) : scan.items.length === 0 ? (
        <View style={styles.failedScanContainer}>
          <View style={[styles.failedScanIconBox, { backgroundColor: colors.destructive + "15" }]}>
            <Feather name="alert-circle" size={48} color={colors.destructive} />
          </View>
          <Text style={[styles.failedScanTitle, { color: colors.foreground }]}>No items found</Text>
          <Text style={[styles.failedScanSub, { color: colors.mutedForeground }]}>
            {scan.translateError ?? "We couldn't read any line items from the receipt. Try a clearer photo."}
          </Text>
          <TouchableOpacity
            style={[styles.failedScanRetry, { backgroundColor: colors.primary }]}
            onPress={() => scan.reset()}
          >
            <Feather name="refresh-cw" size={16} color="#fff" />
            <Text style={styles.failedScanRetryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // The tax and tip fields at the end of the list are the only inputs
        // here (item editing happens in ReviewItemSheet, which handles its own
        // keyboard). The running total below is lifted by the keyboard's own
        // height rather than by a KeyboardAvoidingView, which measures against
        // the window and so mis-sized this screen — it sits under a header and
        // is presented as a sheet. Lifting the total also shortens the list by
        // the same amount, which is what lets the fields scroll into view.
        <View style={styles.flex}>
        <FlatList
          data={scan.items}
          keyExtractor={(_, i) => String(i)}
          style={styles.flex}
          contentContainerStyle={[styles.reviewList, { paddingBottom: SPACING.xl }]}
          ListHeaderComponent={
            <View style={styles.reviewHeader}>
              <Text style={[styles.reviewHint, { color: colors.mutedForeground }]}>
                Tap an item to edit it, or uncheck it to leave it out. All checked items will be added to the bill.
              </Text>
              {hasTranslations && (
                <TouchableOpacity
                  onPress={() => setShowOriginals((v) => !v)}
                  style={[styles.toggleOriginals, { borderColor: colors.border }]}
                >
                  <Feather name={showOriginals ? "eye-off" : "eye"} size={13} color={colors.mutedForeground} />
                  <Text style={[styles.toggleOriginalsText, { color: colors.mutedForeground }]}>
                    {showOriginals ? "Hide originals" : "Show originals"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListFooterComponent={
            <View style={styles.reviewFooter}>
              <TouchableOpacity
                onPress={handleAddItem}
                activeOpacity={0.7}
                style={[styles.addItemRow, { borderColor: colors.border }]}
              >
                <Feather name="plus" size={16} color={colors.primaryText} />
                <Text style={[styles.addItemText, { color: colors.primaryText }]}>Add item</Text>
              </TouchableOpacity>

              {receiptGap ? (
                <View style={[styles.receiptGap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                  <Feather name="alert-triangle" size={16} color={colors.mutedForeground} style={styles.receiptGapIcon} />
                  <Text style={[styles.receiptGapText, { color: colors.foreground }]}>
                    {receiptGap.difference < 0 ? "Something may be missing. " : "This may be too high. "}
                    <Text style={{ color: colors.mutedForeground }}>
                      The receipt says {formatMoney(receiptGap.printedTotal, billData?.bill.currency)}, but these items come to{" "}
                      {formatMoney(receiptGap.printedTotal + receiptGap.difference, billData?.bill.currency)}. Check before adding.
                    </Text>
                  </Text>
                </View>
              ) : null}

              <View style={[styles.taxTipCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.taxTipSubtotalRow}>
                  <Text style={[styles.taxTipLabel, { color: colors.mutedForeground }]}>SUBTOTAL</Text>
                  <Text style={[styles.taxTipComputed, { color: colors.foreground }]}>
                    {formatMoney(selectedTotal, billData?.bill.currency)}
                  </Text>
                </View>
                {/* Always offered, not only when the scan found one: a
                    discount the scan missed is exactly the case that needs a
                    way in, and an empty row says the option exists. */}
                <TouchableOpacity
                  onPress={() => setShowDiscount(true)}
                  disabled={selectedCount === 0}
                  style={styles.discountRow}
                  accessibilityRole="button"
                  accessibilityLabel={
                    discountAmount > 0
                      ? `Discount, ${formatMoney(discountAmount, billData?.bill.currency)} off ${discountedCount} items. Edit`
                      : "Add a discount"
                  }
                >
                  <Text style={[styles.taxTipLabel, { color: colors.mutedForeground }]}>DISCOUNT</Text>
                  <View style={styles.discountValue}>
                    <Text style={[styles.taxTipComputed, { color: discountAmount > 0 ? colors.primaryText : colors.mutedForeground }]}>
                      {discountAmount > 0
                        ? `−${formatMoney(discountAmount, billData?.bill.currency)}`
                        : "Add"}
                    </Text>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </View>
                </TouchableOpacity>
                {discountAmount > 0 ? (
                  <Text style={[styles.discountHint, { color: colors.mutedForeground }]}>
                    off {discountedCount} of {selectedCount} items
                  </Text>
                ) : null}
                <TaxTipField
                  label="Tax"
                  mode={taxMode}
                  onModeChange={changeTaxMode}
                  value={taxInput}
                  onValueChange={setTaxInput}
                  computed={taxAmount}
                  currency={billData?.bill.currency}
                />
                <TaxTipField
                  label="Tip"
                  mode={tipMode}
                  onModeChange={changeTipMode}
                  value={tipInput}
                  onValueChange={setTipInput}
                  computed={tipAmount}
                  currency={billData?.bill.currency}
                />
                <Text style={[styles.taxTipHint, { color: colors.mutedForeground }]}>
                  Saved with the items. You can change them on the bill later.
                </Text>
              </View>
            </View>
          }
          renderItem={({ item, index }) => {
            const displayName = item.translatedDescription ?? item.description;
            const originalName = item.translatedDescription ? item.description : null;
            const priced = pricedItem(index, Number.isFinite(item.total) ? item.total : 0);
            return (
              <View
                style={[
                  styles.reviewItem,
                  {
                    backgroundColor: item.selected ? colors.card : colors.background,
                    borderColor: item.selected ? colors.primary : colors.border,
                    opacity: item.selected ? 1 : 0.5,
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => toggleItem(index)}
                  activeOpacity={0.7}
                  style={styles.checkboxHitArea}
                
                accessibilityLabel={displayName}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.selected }}>
                  <View style={[styles.checkbox, { borderColor: item.selected ? colors.primary : colors.border, backgroundColor: item.selected ? colors.primary : "transparent" }]}>
                    {item.selected && <Feather name="check" size={12} color="#fff" />}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setEditor({ mode: "edit", index })}
                  activeOpacity={0.6}
                  style={styles.reviewItemBody}
                >
                  <Text style={[styles.quantityBadge, { color: colors.mutedForeground }]}>
                    ×{item.quantity}
                  </Text>
                  <View style={styles.reviewItemNameCol}>
                    <Text style={[styles.reviewItemName, { color: colors.foreground }]} numberOfLines={2}>
                      {displayName}
                    </Text>
                    {originalName && showOriginals && (
                      <Text style={[styles.reviewItemOriginal, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {originalName}
                      </Text>
                    )}
                  </View>
                  <View style={styles.reviewItemPrices}>
                    {priced.was !== null ? (
                      <Text style={[styles.reviewItemWas, { color: colors.mutedForeground }]}>
                        {priced.was.toFixed(2)}
                      </Text>
                    ) : null}
                    <Text style={[styles.reviewItemTotal, { color: item.selected ? colors.primary : colors.mutedForeground }]}>
                      {priced.charged.toFixed(2)}
                    </Text>
                    {/* Worked out from the two prices, so it cannot go stale
                        when one is edited or vanish if a write forgets it. */}
                    {priced.percent !== null ? (
                      <Text style={[styles.reviewItemOff, { color: colors.primaryText }]}>
                        {priced.percent}% off
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.editIconBtn, { backgroundColor: colors.muted }]}>
                    <Feather name="edit-2" size={13} color={colors.primaryText} />
                  </View>
                </TouchableOpacity>
              </View>
            );
          }}
        />

        <View
          style={[
            styles.summaryBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              marginBottom: keyboardHeight,
              paddingBottom: keyboardHeight > 0 ? SPACING.md : insets.bottom + SPACING.md,
            },
          ]}
        >
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
            {selectedCount === 0
              ? "No items selected"
              : `${selectedCount} ${selectedCount === 1 ? "item" : "items"} selected`}
          </Text>
          <Text
            style={[
              styles.summaryTotal,
              { color: selectedCount === 0 ? colors.mutedForeground : colors.foreground },
            ]}
          >
            {formatMoney(grandTotal, billData?.bill.currency)}
          </Text>
        </View>
        </View>
      )}

      <LanguagePicker
        visible={showLanguagePicker}
        selectedLanguage={preferredLanguage}
        onConfirm={handleLanguageConfirm}
        onClose={() => setShowLanguagePicker(false)}
      />

      <DiscountSheet
        visible={showDiscount}
        lines={scan.items.map((item, index) => ({
          id: index,
          description: item.translatedDescription ?? item.description,
          total: itemDiscounts.get(index)
            ? Math.round((itemDiscounts.get(index)!.originalTotal - itemDiscounts.get(index)!.amount) * 100) / 100
            : item.total,
          originalTotal: itemDiscounts.get(index)?.originalTotal ?? null,
        }))}
        defaultPercent={20}
        currency={billData?.bill.currency}
        onClose={() => setShowDiscount(false)}
        onSave={(results) => {
          setShowDiscount(false);
          const next = new Map<number, { amount: number; originalTotal: number }>();
          for (const result of results) {
            if (result.originalTotal == null || result.discountAmount <= 0) continue;
            next.set(result.id, {
              amount: result.discountAmount,
              originalTotal: result.originalTotal,
            });
          }
          setItemDiscounts(next);
        }}
      />

      <ReviewItemSheet
        visible={editor !== null}
        mode={editor?.mode ?? "edit"}
        initial={editorInitial}
        onSave={handleEditorSave}
        onClose={() => setEditor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: SPACING.md,
  },
  closeBtn: { padding: SPACING.xs },
  minimizeBtn: { padding: SPACING.xs },
  headerTitle: { flex: 1, fontSize: FONT_SIZE.title, fontFamily: "Inter_600SemiBold" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  translateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 42,
    justifyContent: "center",
  },
  translateBtnText: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_500Medium" },
  confirmBtn: { borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: SPACING.sm },
  confirmBtnText: { color: "#fff", fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold" },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginTop: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  errorBannerText: { flex: 1, fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular" },

  scanContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACING.xl, gap: SPACING.xl },
  thumbnailWrapper: { width: "100%", height: THUMBNAIL_HEIGHT, borderRadius: RADIUS.md, overflow: "hidden" },
  thumbnail: { width: "100%", height: "100%" },
  thumbnailDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  overlayContainer: { ...StyleSheet.absoluteFillObject },
  scanLine: { position: "absolute", left: 0, right: 0, height: 2, opacity: 0.85 },
  scanCorner: { position: "absolute", width: 22, height: 22, borderWidth: 3 },
  scanCornerTL: { top: 12, left: 12, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  scanCornerTR: { top: 12, right: 12, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  scanCornerBL: { bottom: 12, left: 12, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  scanCornerBR: { bottom: 12, right: 12, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  messageRow: { position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: SPACING.lg, paddingHorizontal: SPACING.lg, alignItems: "center", gap: SPACING.sm },
  scanMessage: { fontSize: FONT_SIZE.body, fontFamily: "Inter_600SemiBold", textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  dotsRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  scanHint: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular", textAlign: "center" },

  pickContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACING.xxxl, gap: SPACING.lg },
  iconBox: { width: 100, height: 100, borderRadius: RADIUS.lg, alignItems: "center", justifyContent: "center", marginBottom: SPACING.sm },
  pickTitle: { fontSize: 20, fontFamily: "Inter_700Bold" }, // TODO: one-off
  pickSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 }, // TODO: one-off
  pickBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: RADIUS.md, paddingVertical: SPACING.lg, paddingHorizontal: SPACING.xxxl, width: "100%", justifyContent: "center" },
  pickBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  pickBtnGhost: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: RADIUS.md, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: SPACING.xxxl, width: "100%", justifyContent: "center" },
  pickBtnGhostText: { fontSize: FONT_SIZE.body, fontFamily: "Inter_500Medium" },
  reviewList: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, gap: SPACING.sm },
  reviewHeader: { gap: 10, marginBottom: SPACING.xs },
  reviewHint: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular", textAlign: "center" },
  toggleOriginals: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
  },
  toggleOriginalsText: { fontSize: 12, fontFamily: "Inter_500Medium" }, // TODO: one-off
  reviewItem: { flexDirection: "row", alignItems: "center", borderRadius: RADIUS.sm, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: SPACING.md, gap: SPACING.sm },
  checkboxHitArea: { padding: SPACING.xs },
  checkbox: { width: 22, height: 22, borderRadius: RADIUS.sm, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  reviewItemBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: SPACING.sm, minHeight: 36 },
  quantityBadge: { fontSize: 12, fontFamily: "Inter_600SemiBold", minWidth: 22 }, // TODO: one-off
  reviewItemPrices: { alignItems: "flex-end" },
  reviewItemWas: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular", textDecorationLine: "line-through" },
  reviewItemOff: { fontSize: 11, fontFamily: "Inter_500Medium" }, // TODO: one-off
  discountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.sm },
  discountValue: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  discountHint: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular", marginTop: -SPACING.xs, marginBottom: SPACING.sm },
  receiptGap: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: SPACING.md },
  receiptGapIcon: { marginTop: 1 }, // TODO: one-off
  receiptGapText: { flex: 1, fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold", lineHeight: 18 }, // TODO: one-off
  reviewItemNameCol: { flex: 1, gap: 2 },
  reviewItemName: { fontSize: 14, fontFamily: "Inter_500Medium" }, // TODO: one-off
  reviewItemOriginal: { fontSize: 11, fontFamily: "Inter_400Regular" }, // TODO: one-off
  editIconBtn: { width: 28, height: 28, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  reviewItemTotal: { fontSize: 14, fontFamily: "Inter_700Bold" }, // TODO: one-off
  addItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderStyle: "dashed",
    paddingVertical: 12,
    marginTop: SPACING.xs,
  },
  addItemText: { fontSize: 14, fontFamily: "Inter_600SemiBold" }, // TODO: one-off
  reviewFooter: { gap: SPACING.md },
  taxTipCard: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.md },
  taxTipSubtotalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  taxTipLabel: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_600SemiBold", letterSpacing: 1.0 },
  taxTipComputed: { fontSize: FONT_SIZE.body, fontFamily: "Inter_500Medium", minWidth: 88, textAlign: "right" },
  taxTipHint: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_400Regular" },

  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
  },
  summaryLabel: { fontSize: FONT_SIZE.caption, fontFamily: "Inter_500Medium" },
  summaryTotal: { fontSize: FONT_SIZE.title, fontFamily: "Inter_700Bold" },

  failedScanContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36, gap: 16 },
  failedScanIconBox: { width: 96, height: 96, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  failedScanTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  failedScanSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  failedScanRetry: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 4 },
  failedScanRetryText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
