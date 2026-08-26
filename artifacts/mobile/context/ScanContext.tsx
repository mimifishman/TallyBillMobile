import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useOcrReceipt, useOcrTranslate, customFetch } from "@workspace/api-client-react";
import type { OcrLineItemConfidence, OcrResultLegibility } from "@workspace/api-client-react";
import { uploadFileToStorage } from "../utils/objectStorageExpo";

export type ScanStatus = "idle" | "scanning" | "ready" | "error";

export interface ParsedItem {
  description: string;
  translatedDescription?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  selected: boolean;
  /** "low" when the model was unsure — surfaced in review so the user can check. */
  confidence?: OcrLineItemConfidence;
}

interface ScanState {
  status: ScanStatus;
  billId: number | null;
  capturedUri: string | null;
  items: ParsedItem[];
  errorMessage: string | null;
  receiptImagePath: string | null;
  translating: boolean;
  translateError: string | null;
  /** true = items match the printed total, false = they disagree, null = not checked. */
  reconciled: boolean | null;
  printedTotal: number | null;
  legibility: OcrResultLegibility | null;
  /** True while the user-initiated "Recheck receipt" pass is running. */
  rechecking: boolean;
}

interface ScanContextValue extends ScanState {
  startScan: (billId: number, uri: string, imageWidth: number, imageHeight: number) => void;
  reset: () => void;
  setItems: React.Dispatch<React.SetStateAction<ParsedItem[]>>;
  translateItems: (targetLanguage: string) => Promise<void>;
  recheck: () => void;
}

/**
 * The server re-processes the image anyway (contrast, cropping to bands,
 * resizing), so sending more than this buys upload time, not accuracy — and
 * upload is a big slice of the ~20s scan budget on a mobile connection.
 */
const MAX_LONG_SIDE = 2200;
const JPEG_QUALITY = 0.88;

/** Server accepts 20 MB of JSON; stay clear of it so a big photo never 413s. */
const MAX_BASE64_CHARS = 14 * 1024 * 1024;

/**
 * A scan should finish well inside this. It exists so a hung request cannot
 * strand the user on the scanning overlay forever, not as a target.
 */
const SCAN_TIMEOUT_MS = 35_000;

async function encode(uri: string, longSide: number, isPortrait: boolean, quality: number) {
  const context = ImageManipulator.manipulate(uri).resize(
    isPortrait ? { height: longSide } : { width: longSide },
  );
  const imageRef = await context.renderAsync();
  const result = await imageRef.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
  return result.base64 ?? "";
}

/**
 * Shrink and encode the capture for upload.
 *
 * Note this no longer double-compresses: capture happens at high quality and
 * this is the only lossy step. Orientation is deliberately not handled here —
 * the server applies the EXIF rotation, so iOS and Android go through
 * identical processing rather than diverging on the device.
 */
async function preprocessImage(uri: string, width: number, height: number): Promise<string> {
  const isPortrait = height >= width;
  let longSide = Math.min(Math.max(width, height) || MAX_LONG_SIDE, MAX_LONG_SIDE);

  let base64 = await encode(uri, longSide, isPortrait, JPEG_QUALITY);

  // A very detailed photo can still encode large. Step down rather than let
  // the user hit an opaque request-too-large error.
  while (base64.length > MAX_BASE64_CHARS && longSide > 900) {
    longSide = Math.round(longSide * 0.75);
    base64 = await encode(uri, longSide, isPortrait, 0.8);
  }

  return base64;
}

async function saveReceiptImage(
  localUri: string,
  billId: number,
): Promise<string | null> {
  try {
    const objectPath = await uploadFileToStorage(
      localUri,
      `/api/bills/${billId}/storage/uploads/request-url`,
    );
    if (!objectPath) return null;

    await customFetch(`/api/bills/${billId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptImagePath: objectPath }),
    });

    return objectPath;
  } catch (err) {
    console.warn("saveReceiptImage failed (non-critical):", err);
    return null;
  }
}

const INITIAL_STATE: ScanState = {
  status: "idle",
  billId: null,
  capturedUri: null,
  items: [],
  errorMessage: null,
  receiptImagePath: null,
  translating: false,
  translateError: null,
  reconciled: null,
  printedTotal: null,
  legibility: null,
  rechecking: false,
};

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ScanState>(INITIAL_STATE);

  const generationRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Kept so the user-initiated re-check can resend the same photo. */
  const lastCaptureRef = useRef<{ uri: string; width: number; height: number } | null>(null);
  const ocrMutation = useOcrReceipt();
  const translateMutation = useOcrTranslate();

  const clearWatchdog = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearWatchdog, [clearWatchdog]);

  const run = useCallback(
    (billId: number, uri: string, width: number, height: number, forceRecheck: boolean) => {
      generationRef.current += 1;
      const myGeneration = generationRef.current;
      const isCurrent = () => myGeneration === generationRef.current;

      // A re-check is an optional extra on top of a scan the user already has
      // in front of them. If it fails, keep them in the review list with their
      // edits intact and just say so — dropping to "error" would send them back
      // to the picker and throw the whole scan away.
      const fail = (message: string) => {
        clearWatchdog();
        setState((prev) => ({
          ...prev,
          status: forceRecheck ? prev.status : "error",
          rechecking: false,
          errorMessage: message,
        }));
      };

      clearWatchdog();
      timeoutRef.current = setTimeout(() => {
        if (!isCurrent()) return;
        generationRef.current += 1; // abandon the in-flight result
        fail("Taking too long — try again.");
      }, SCAN_TIMEOUT_MS);

      preprocessImage(uri, width, height)
        .then((base64) => {
          if (!isCurrent()) return;
          if (!base64) {
            fail("Could not process image");
            return;
          }
          ocrMutation.mutate(
            {
              data: {
                imageBase64: base64,
                fileName: "receipt.jpg",
                // Logged server-side so the iOS/Android gap can be measured
                // instead of guessed at.
                platform: Platform.OS,
                width,
                height,
                ...(forceRecheck ? { forceRecheck: true } : {}),
              },
            },
            {
              onSuccess: (data) => {
                if (!isCurrent()) return;
                clearWatchdog();
                setState((prev) => ({
                  ...prev,
                  status: "ready",
                  rechecking: false,
                  items: data.items.map((item) => ({ ...item, selected: true })),
                  reconciled: data.reconciled ?? null,
                  printedTotal: data.printedTotal ?? null,
                  legibility: data.legibility ?? null,
                }));
                saveReceiptImage(uri, billId).then((objectPath) => {
                  if (!isCurrent()) return;
                  if (objectPath) {
                    setState((prev) => ({ ...prev, receiptImagePath: objectPath }));
                  }
                });
              },
              onError: (err: Error) => {
                if (!isCurrent()) return;
                fail(err.message || "Could not read the receipt. Try again.");
              },
            },
          );
        })
        .catch((err) => {
          if (!isCurrent()) return;
          console.warn("preprocessImage failed:", err);
          fail("Could not process image");
        });
    },
    [clearWatchdog, ocrMutation],
  );

  const startScan = useCallback(
    (billId: number, uri: string, imageWidth: number, imageHeight: number) => {
      lastCaptureRef.current = { uri, width: imageWidth, height: imageHeight };
      setState({ ...INITIAL_STATE, status: "scanning", billId, capturedUri: uri });
      run(billId, uri, imageWidth, imageHeight, false);
    },
    [run],
  );

  /**
   * Re-read the receipt, telling the server to spend the extra pass it skipped
   * to stay inside the scan budget. Only offered once the user has seen that
   * the items disagree with the printed total.
   */
  const recheck = useCallback(() => {
    const capture = lastCaptureRef.current;
    if (!capture || state.billId == null) return;
    setState((prev) => ({ ...prev, rechecking: true, errorMessage: null }));
    run(state.billId, capture.uri, capture.width, capture.height, true);
  }, [run, state.billId]);

  const reset = useCallback(() => {
    generationRef.current += 1;
    clearWatchdog();
    lastCaptureRef.current = null;
    setState(INITIAL_STATE);
  }, [clearWatchdog]);

  const setItems: React.Dispatch<React.SetStateAction<ParsedItem[]>> = useCallback(
    (action) => {
      setState((prev) => ({
        ...prev,
        items: typeof action === "function" ? action(prev.items) : action,
      }));
    },
    [],
  );

  const translateItems = useCallback(
    async (targetLanguage: string) => {
      setState((prev) => ({ ...prev, translating: true, translateError: null }));
      try {
        const descriptions = state.items.map((item) => item.description);
        await new Promise<void>((resolve, reject) => {
          translateMutation.mutate(
            { data: { descriptions, targetLanguage } },
            {
              onSuccess: (data) => {
                setState((prev) => ({
                  ...prev,
                  translating: false,
                  translateError: null,
                  items: prev.items.map((item, i) => ({
                    ...item,
                    translatedDescription: data.translations[i] ?? item.description,
                  })),
                }));
                resolve();
              },
              onError: (err: Error) => {
                setState((prev) => ({
                  ...prev,
                  translating: false,
                  translateError: err.message || "Translation failed. Original names kept.",
                }));
                reject(err);
              },
            },
          );
        });
      } catch {
      }
    },
    [state.items, translateMutation],
  );

  return (
    <ScanContext.Provider
      value={{ ...state, startScan, reset, setItems, translateItems, recheck }}
    >
      {children}
    </ScanContext.Provider>
  );
}

export function useScan(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScan must be used within a ScanProvider");
  return ctx;
}
