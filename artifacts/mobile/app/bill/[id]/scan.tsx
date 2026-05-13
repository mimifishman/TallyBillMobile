import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useOcrReceipt, useBulkCreateBillLines } from "@workspace/api-client-react";

interface ParsedItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  selected: boolean;
}

const MAX_WIDTH = 1800;
const CONTRAST_LEVEL = 60; // -255 to 255; 60 gives a noticeable boost without clipping fine detail

function applyGrayscaleAndContrast(data: Uint8Array, contrastLevel: number): void {
  const factor = (259 * (contrastLevel + 255)) / (255 * (259 - contrastLevel));
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const enhanced = Math.max(0, Math.min(255, Math.round(factor * (lum - 128) + 128)));
    data[i] = enhanced;
    data[i + 1] = enhanced;
    data[i + 2] = enhanced;
  }
}

async function preprocessImage(uri: string, width: number): Promise<string> {
  let context = ImageManipulator.manipulate(uri);
  if (width > MAX_WIDTH) {
    context = context.resize({ width: MAX_WIDTH });
  }
  const imageRef = await context.renderAsync();
  const resized = await imageRef.saveAsync({ format: SaveFormat.JPEG, compress: 1 });

  const response = await fetch(resized.uri);
  const arrayBuffer = await response.arrayBuffer();
  const rawData = new Uint8Array(arrayBuffer);

  const decoded = jpeg.decode(rawData, { useTArray: true });
  applyGrayscaleAndContrast(decoded.data as Uint8Array, CONTRAST_LEVEL);

  const encoded = jpeg.encode(
    { data: decoded.data, width: decoded.width, height: decoded.height },
    90,
  );

  let binary = "";
  const bytes = new Uint8Array(encoded.data);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const billId = parseInt(id!);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [step, setStep] = useState<"pick" | "review">("pick");

  const ocrMutation = useOcrReceipt({
    mutation: {
      onSuccess: (data) => {
        setItems(data.items.map((item) => ({ ...item, selected: true })));
        setStep("review");
      },
      onError: (err: Error) => {
        Alert.alert("OCR Failed", err.message || "Could not read the receipt. Try again with better lighting.");
      },
    },
  });

  const bulkCreateMutation = useBulkCreateBillLines({
    mutation: {
      onSuccess: () => {
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
      try {
        const base64 = await preprocessImage(asset.uri, asset.width ?? MAX_WIDTH);
        if (!base64) {
          Alert.alert("Error", "Could not process image");
          return;
        }
        ocrMutation.mutate({ data: { imageBase64: base64, fileName: "receipt.jpg" } });
      } catch {
        Alert.alert("Error", "Could not process image");
      }
    }
  };

  const toggleItem = (index: number) => {
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, selected: !item.selected } : item));
  };

  const handleConfirm = () => {
    const selected = items.filter((i) => i.selected);
    if (selected.length === 0) {
      Alert.alert("Nothing selected", "Select at least one item to add");
      return;
    }
    bulkCreateMutation.mutate({
      billId,
      data: { lines: selected.map(({ description, quantity, unitPrice, total }) => ({ description, quantity, unitPrice, total })) },
    });
  };

  const isLoading = ocrMutation.isPending;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {step === "pick" ? "Scan Receipt" : "Review Items"}
        </Text>
        {step === "review" && (
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={bulkCreateMutation.isPending}
            style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
          >
            {bulkCreateMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.confirmBtnText}>Add {items.filter(i => i.selected).length} Items</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Reading receipt...</Text>
        </View>
      ) : step === "pick" ? (
        <View style={styles.pickContainer}>
          <View style={[styles.iconBox, { backgroundColor: "rgba(31,136,61,0.1)" }]}>
            <Feather name="camera" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.pickTitle, { color: colors.foreground }]}>Scan a Receipt</Text>
          <Text style={[styles.pickSub, { color: colors.mutedForeground }]}>
            Take a photo or choose from your library. Works with English and Hebrew receipts.
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
      ) : (
        <FlatList
          data={items}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={[styles.reviewList, { paddingBottom: insets.bottom + 20 }]}
          ListHeaderComponent={
            <Text style={[styles.reviewHint, { color: colors.mutedForeground }]}>
              Tap items to deselect. All selected items will be added to the bill.
            </Text>
          }
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[
                styles.reviewItem,
                {
                  backgroundColor: item.selected ? colors.card : colors.background,
                  borderColor: item.selected ? colors.primary : colors.border,
                  opacity: item.selected ? 1 : 0.5,
                },
              ]}
              onPress={() => toggleItem(index)}
              activeOpacity={0.7}
            >
              <View style={styles.reviewItemLeft}>
                <View style={[styles.checkbox, { borderColor: item.selected ? colors.primary : colors.border, backgroundColor: item.selected ? colors.primary : "transparent" }]}>
                  {item.selected && <Feather name="check" size={12} color="#fff" />}
                </View>
                <Text style={[styles.reviewItemName, { color: colors.foreground }]} numberOfLines={2}>
                  {item.description}
                </Text>
              </View>
              <Text style={[styles.reviewItemTotal, { color: item.selected ? colors.primary : colors.mutedForeground }]}>
                {item.total.toFixed(2)}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  closeBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_600SemiBold" },
  confirmBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  confirmBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  pickContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 },
  iconBox: { width: 100, height: 100, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  pickTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  pickSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  pickBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, width: "100%", justifyContent: "center" },
  pickBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  pickBtnGhost: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: 32, width: "100%", justifyContent: "center" },
  pickBtnGhostText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  reviewList: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  reviewHint: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 12, textAlign: "center" },
  reviewItem: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1.5, padding: 14, gap: 10 },
  reviewItemLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  reviewItemName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  reviewItemTotal: { fontSize: 14, fontFamily: "Inter_700Bold" },
});
