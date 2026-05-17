import { File } from "expo-file-system";
import { fetch } from "expo/fetch";

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

export async function uploadReceiptImage(
  localUri: string,
  billId: number,
  authHeader?: string,
): Promise<string> {
  const endpoint = `${API_BASE}/api/bills/${billId}/storage/uploads/request-url`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader) headers["Authorization"] = authHeader;

  const presignedRes = await fetch(endpoint, {
    method: "POST",
    headers,
    credentials: "include",
  });

  if (!presignedRes.ok) {
    throw new Error(`Failed to get presigned URL: ${presignedRes.status}`);
  }

  const { uploadURL, objectPath } = await presignedRes.json();
  if (!uploadURL || !objectPath) {
    throw new Error("Invalid presigned URL response");
  }

  const file = new File(localUri, "receipt.jpg", { type: "image/jpeg" });

  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": "image/jpeg" },
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.status}`);
  }

  return objectPath as string;
}
