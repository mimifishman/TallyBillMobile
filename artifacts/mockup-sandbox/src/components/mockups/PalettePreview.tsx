const BEFORE_PEOPLE = [
  "#E84393",
  "#FF6B35",
  "#2D9CDB",
  "#9B59B6",
  "#0D9488",
  "#F39C12",
  "#E74C3C",
  "#1ABC9C",
  "#5C6BC0",
  "#FF7043",
  "#26C6DA",
  "#8D6E63",
  "#C0CA33",
  "#EC407A",
  "#78909C",
  "#FF8F00",
];

const AFTER_PEOPLE = [
  "#06B6D4",
  "#F97316",
  "#6366F1",
  "#EAB308",
  "#EC4899",
  "#84CC16",
  "#A855F7",
  "#3B82F6",
  "#C026D3",
  "#0EA5E9",
  "#7C3AED",
  "#D97706",
  "#4338CA",
  "#0369A1",
  "#65A30D",
  "#7E22CE",
];

const BILL_PEOPLE = [
  { name: "Alice", amount: "$12.50" },
  { name: "Bob", amount: "$18.75" },
  { name: "Carol", amount: "$9.00" },
  { name: "Dave", amount: "$22.40" },
  { name: "Eve", amount: "$15.20" },
  { name: "Finn", amount: "$11.80" },
];

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function textColor(hex: string) {
  return luminance(hex) > 0.35 ? "#1a1a1a" : "#ffffff";
}

function SwatchRow({ label, colors }: { label: string; colors: string[] }) {
  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-3">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {colors.map((hex, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-[9px] font-bold shadow-md"
              style={{ backgroundColor: hex, color: textColor(hex) }}
            >
              {i + 1}
            </div>
            <span className="text-[9px] text-slate-400 font-mono">
              {hex.toLowerCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BillPreview() {
  return (
    <div className="mb-2">
      <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-3">
        Bill preview — new palette (people[0–5])
      </p>
      <div className="flex flex-col gap-2 max-w-sm">
        {BILL_PEOPLE.map((person, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl px-4 py-3 shadow-sm"
            style={{ backgroundColor: AFTER_PEOPLE[i] + "22", borderLeft: `4px solid ${AFTER_PEOPLE[i]}` }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow"
                style={{ backgroundColor: AFTER_PEOPLE[i], color: textColor(AFTER_PEOPLE[i]) }}
              >
                {person.name[0]}
              </div>
              <span className="text-sm font-medium text-slate-700">{person.name}</span>
            </div>
            <span className="text-sm font-semibold" style={{ color: AFTER_PEOPLE[i] }}>
              {person.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PalettePreview() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">
          People[ ] Colour Palette
        </h1>
        <p className="text-slate-500 mb-8 text-sm">
          16 colours — before vs. after comparison
        </p>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-6">
          <SwatchRow label="Before (current)" colors={BEFORE_PEOPLE} />
          <SwatchRow label="After (new)" colors={AFTER_PEOPLE} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <BillPreview />
        </div>
      </div>
    </div>
  );
}
