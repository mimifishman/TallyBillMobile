export async function shortenUrl(url: string): Promise<string> {
  try {
    const response = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!response.ok) return url;
    const shortened = await response.text();
    const trimmed = shortened.trim();
    if (!trimmed.startsWith("http")) return url;
    return trimmed;
  } catch {
    return url;
  }
}
