/**
 * The receipt's own wording for an item, when it is worth showing beside the
 * translated name.
 *
 * A translation can be wrong — a dish name read as something else, a brand
 * turned into a word — and the person at the table can only catch that by
 * seeing what the paper actually says. So wherever an item is listed, the
 * original goes under it. It is left out when there is no original, or when it
 * says the same as the name shown (a translation into the receipt's own
 * language, or a name someone typed over), because repeating it is noise.
 */
export function originalNameToShow(
  description: string | null | undefined,
  original: string | null | undefined,
): string | null {
  const shown = (original ?? "").trim();
  if (!shown) return null;
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return norm(shown) === norm(description ?? "") ? null : shown;
}
