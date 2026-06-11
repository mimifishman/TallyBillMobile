import colors_data from "@/constants/colors";

const PEOPLE_COLORS = colors_data.light.people;

export function pickColor(usedColors: string[] = []): string {
  const usedLower = usedColors.map((c) => c.toLowerCase());
  const usedSet = new Set(usedLower);

  const available = PEOPLE_COLORS.filter((c) => !usedSet.has(c.toLowerCase()));
  if (available.length > 0) {
    return available[0]!;
  }

  const counts = new Map<string, number>();
  for (const c of PEOPLE_COLORS) {
    counts.set(c.toLowerCase(), 0);
  }
  for (const c of usedLower) {
    const key = c.toLowerCase();
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  let best = PEOPLE_COLORS[0]!;
  let bestCount = counts.get(best.toLowerCase()) ?? 0;
  for (const c of PEOPLE_COLORS) {
    const count = counts.get(c.toLowerCase()) ?? 0;
    if (count < bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}
