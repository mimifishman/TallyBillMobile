/**
 * Initials shown in person avatars / chips.
 *
 * "Alice"            -> "A"
 * "John Smith"       -> "JS"
 * "Mary Jane Watson" -> "MW"  (first + last word)
 */
export function getInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0]!.charAt(0);
  if (words.length === 1) return first.toUpperCase();
  const last = words[words.length - 1]!.charAt(0);
  return (first + last).toUpperCase();
}
