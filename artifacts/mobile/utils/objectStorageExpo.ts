import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { customFetch } from "@workspace/api-client-react";

/**
 * Upload a local file to object storage via a presigned URL.
 *
 * @param localUri             - Local file URI (e.g. from camera or image picker).
 * @param getUploadUrlEndpoint - API endpoint that returns `{ uploadURL, objectPath }`.
 * @returns The `objectPath` of the stored object, or `null` on failure.
 */
export async function uploadFileToStorage(
  localUri: string,
  getUploadUrlEndpoint: string,
): Promise<string | null> {
  const presignedRes = await customFetch(getUploadUrlEndpoint, {
    method: "POST",
  }) as { uploadURL: string; objectPath: string };

  const { uploadURL, objectPath } = presignedRes;
  if (!uploadURL || !objectPath) return null;

  const file = new File(localUri, "receipt.jpg", { type: "image/jpeg" });
  const uploadRes = await expoFetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": "image/jpeg" },
  });

  if (!uploadRes.ok) {
    console.warn("Receipt upload to storage failed:", uploadRes.status);
    return null;
  }

  return objectPath;
}
