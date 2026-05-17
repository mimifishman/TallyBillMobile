import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { useOcrReceipt, customFetch } from "@workspace/api-client-react";

export type ScanStatus = "idle" | "scanning" | "ready" | "error";

export interface ParsedItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  selected: boolean;
}

interface ScanState {
  status: ScanStatus;
  billId: number | null;
  capturedUri: string | null;
  items: ParsedItem[];
  errorMessage: string | null;
}

interface ScanContextValue extends ScanState {
  startScan: (billId: number, uri: string, imageWidth: number) => void;
  reset: () => void;
  setItems: React.Dispatch<React.SetStateAction<ParsedItem[]>>;
}

const MAX_WIDTH = 1800;

async function preprocessImage(uri: string, width: number): Promise<string> {
  let context = ImageManipulator.manipulate(uri);
  if (width > MAX_WIDTH) {
    context = context.resize({ width: MAX_WIDTH });
  }
  const imageRef = await context.renderAsync();
  const result = await imageRef.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  return result.base64 ?? "";
}

async function saveReceiptImage(localUri: string, billId: number): Promise<void> {
  try {
    const presignedRes = await customFetch(`/api/bills/${billId}/storage/uploads/request-url`, {
      method: "POST",
    }) as { uploadURL: string; objectPath: string };

    const { uploadURL, objectPath } = presignedRes;
    if (!uploadURL || !objectPath) return;

    const file = new File(localUri, "receipt.jpg", { type: "image/jpeg" });

    const uploadRes = await expoFetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": "image/jpeg" },
    });

    if (!uploadRes.ok) {
      console.warn("Receipt upload to GCS failed:", uploadRes.status);
      return;
    }

    await customFetch(`/api/bills/${billId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptImagePath: objectPath }),
    });
  } catch (err) {
    console.warn("saveReceiptImage failed (non-critical):", err);
  }
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ScanState>({
    status: "idle",
    billId: null,
    capturedUri: null,
    items: [],
    errorMessage: null,
  });

  const generationRef = useRef(0);
  const ocrMutation = useOcrReceipt();

  const startScan = useCallback(
    (billId: number, uri: string, imageWidth: number) => {
      generationRef.current += 1;
      const myGeneration = generationRef.current;

      setState({
        status: "scanning",
        billId,
        capturedUri: uri,
        items: [],
        errorMessage: null,
      });

      preprocessImage(uri, imageWidth)
        .then((base64) => {
          if (myGeneration !== generationRef.current) return;
          if (!base64) {
            setState((prev) => ({
              ...prev,
              status: "error",
              errorMessage: "Could not process image",
            }));
            return;
          }
          ocrMutation.mutate(
            { data: { imageBase64: base64, fileName: "receipt.jpg" } },
            {
              onSuccess: (data) => {
                if (myGeneration !== generationRef.current) return;
                setState((prev) => ({
                  ...prev,
                  status: "ready",
                  items: data.items.map((item) => ({ ...item, selected: true })),
                }));
                saveReceiptImage(uri, billId);
              },
              onError: (err: Error) => {
                if (myGeneration !== generationRef.current) return;
                setState((prev) => ({
                  ...prev,
                  status: "error",
                  errorMessage: err.message || "Could not read the receipt. Try again.",
                }));
              },
            },
          );
        })
        .catch((err) => {
          if (myGeneration !== generationRef.current) return;
          console.warn("preprocessImage failed:", err);
          setState((prev) => ({
            ...prev,
            status: "error",
            errorMessage: "Could not process image",
          }));
        });
    },
    [ocrMutation],
  );

  const reset = useCallback(() => {
    generationRef.current += 1;
    setState({ status: "idle", billId: null, capturedUri: null, items: [], errorMessage: null });
  }, []);

  const setItems: React.Dispatch<React.SetStateAction<ParsedItem[]>> = useCallback(
    (action) => {
      setState((prev) => ({
        ...prev,
        items: typeof action === "function" ? action(prev.items) : action,
      }));
    },
    [],
  );

  return (
    <ScanContext.Provider value={{ ...state, startScan, reset, setItems }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScan(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScan must be used within a ScanProvider");
  return ctx;
}
