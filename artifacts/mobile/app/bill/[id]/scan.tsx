import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import { AutoFocusTextInput } from "@/components/AutoFocusTextInput";
import { useColors } from "@/hooks/useColors";
import { useBulkCreateBillLines } from "@workspace/api-client-react";
import { FONT_SIZE, RADIUS, SPACING } from "@/constants/styles";
import { useScan } from "@/context/ScanContext";
import { LanguagePicker } from "@/components/LanguagePicker";

const THUMBNAIL_HEIGHT = 300;
const PREF_LANGUAGE_KEY = "@tallybill/receipt_language";

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

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<string | null>(null);
  const [showOriginals, setShowOriginals] = useState(true);

  const hasTranslations = scan.items.some((i) => i.translatedDescription != null);

  useEffect(() => {
    AsyncStorage.getItem(PREF_LANGUAGE_KEY).then((val) => {
      if (val) setPreferredLanguage(val);
    });
  }, []);

  const isScanning = scan.status === "scanning";
  const isReady = scan.status === "ready";
  const step: "pick" | "review" = isReady ? "review" : "pick";

  const bulkCreateMutation = useBulkCreateBillLines({
    mutation: {
      onSuccess: () => {
        scan.reset();
        router.back();
      },
      onError: () => {
        Alert.alert("Error", "Failed to save items. Please try again.");
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

  const handleConfirm = () => {
    const selected = scan.items.filter((i) => i.selected);
    if (selected.length === 0) {
      Alert.alert("Nothing selected", "Select at least one item to add");
      return;
    }
    bulkCreateMutation.mutate({
      billId,
      data: {
        lines: selected.map(({ description, translatedDescription, quantity, unitPrice, total }) => ({
          description: translatedDescription ?? description,
          originalDescription: translatedDescription ? description : null,
          quantity,
          unitPrice,
          total,
        })),
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
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {isScanning ? "Scanning…" : step === "pick" ? "Scan Receipt" : "Review Items"}
        </Text>
        {isScanning && (
          <TouchableOpacity onPress={handleMinimize} style={styles.minimizeBtn}>
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
              disabled={bulkCreateMutation.isPending}
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
            >
              {bulkCreateMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>Add {scan.items.filter(i => i.selected).length} Items</Text>
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
            <Feather name="camera" size={48} color={colors.primary} />
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
        <FlatList
          data={scan.items}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={[styles.reviewList, { paddingBottom: insets.bottom + 20 }]}
          ListHeaderComponent={
            <View style={styles.reviewHeader}>
              <Text style={[styles.reviewHint, { color: colors.mutedForeground }]}>
                Tap items to deselect. All selected items will be added to the bill.
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
          renderItem={({ item, index }) => {
            const isEditing = editingIndex === index;
            const displayName = item.translatedDescription ?? item.description;
            const originalName = item.translatedDescription ? item.description : null;
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
                  onPress={() => { if (isEditing) setEditingIndex(null); toggleItem(index); }}
                  activeOpacity={0.7}
                  style={styles.checkboxHitArea}
                >
                  <View style={[styles.checkbox, { borderColor: item.selected ? colors.primary : colors.border, backgroundColor: item.selected ? colors.primary : "transparent" }]}>
                    {item.selected && <Feather name="check" size={12} color="#fff" />}
                  </View>
                </TouchableOpacity>

                <View style={styles.reviewItemMiddle}>
                  {item.quantity > 1 && (
                    <Text style={[styles.quantityBadge, { color: colors.mutedForeground }]}>
                      ×{item.quantity}
                    </Text>
                  )}
                  {isEditing ? (
                    <AutoFocusTextInput
                      style={[styles.reviewItemInput, { color: colors.foreground, borderBottomColor: colors.primary }]}
                      value={item.description}
                      onChangeText={(text) =>
                        scan.setItems((prev) => prev.map((it, i) => i === index ? { ...it, description: text, translatedDescription: undefined } : it))
                      }
                      onBlur={() => setEditingIndex(null)}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => setEditingIndex(null)}
                      selectTextOnFocus
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setEditingIndex(index)}
                      activeOpacity={0.6}
                      style={styles.reviewItemNameBtn}
                    >
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
                      <Feather name="edit-2" size={11} color={colors.mutedForeground} style={styles.editIcon} />
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => { if (isEditing) setEditingIndex(null); toggleItem(index); }}
                  activeOpacity={0.7}
                  style={styles.priceHitArea}
                >
                  <Text style={[styles.reviewItemTotal, { color: item.selected ? colors.primary : colors.mutedForeground }]}>
                    {item.total.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      <LanguagePicker
        visible={showLanguagePicker}
        selectedLanguage={preferredLanguage}
        onConfirm={handleLanguageConfirm}
        onClose={() => setShowLanguagePicker(false)}
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
  reviewItemMiddle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36 },
  quantityBadge: { fontSize: 12, fontFamily: "Inter_600SemiBold", minWidth: 22 }, // TODO: one-off
  reviewItemNameBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  reviewItemNameCol: { flex: 1, gap: 2 },
  reviewItemName: { fontSize: 14, fontFamily: "Inter_500Medium" }, // TODO: one-off
  reviewItemOriginal: { fontSize: 11, fontFamily: "Inter_400Regular" }, // TODO: one-off
  editIcon: { marginTop: 1 },
  reviewItemInput: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", borderBottomWidth: 1.5, paddingVertical: 2, paddingHorizontal: 0 }, // TODO: one-off
  priceHitArea: { padding: SPACING.xs },
  reviewItemTotal: { fontSize: 14, fontFamily: "Inter_700Bold" }, // TODO: one-off

  failedScanContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36, gap: 16 },
  failedScanIconBox: { width: 96, height: 96, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  failedScanTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  failedScanSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  failedScanRetry: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 4 },
  failedScanRetryText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
