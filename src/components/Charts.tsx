import { memo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ComposedChart,
  AreaChart,
  Area,
  LabelList
} from "recharts";

// Palet warna tema untuk variasi tampilan dashboard (dipakai lintas chart)
export interface DashboardTheme {
  name: string;
  product: string[]; // 4 warna: YO, OM, OS, YT
  sektor: string[]; // warna rotasi untuk sektor
  tren: { penjualan: string; target: string; bulanLalu: string; tahunLalu: string; balikBotol: string };
  rankingBase: string; // warna dasar bar non-podium (rank 4+), dipakai sbg basis gradasi
  rankingPodium: [string, string, string]; // warna Juara 1, 2, 3 (ikut berubah per tema)
  tva: { target: string; actual: string; bulanLalu: string; tahunLalu: string };
}

export const DASHBOARD_THEMES: DashboardTheme[] = [
  {
    name: "Klasik Merah",
    product: ["#ef4444", "#f59e0b", "#ec4899", "#3b82f6"],
    sektor: ["#dc2626", "#f97316", "#eab308", "#84cc16", "#06b6d4", "#6366f1"],
    tren: { penjualan: "#dc2626", target: "#10b981", bulanLalu: "#f59e0b", tahunLalu: "#9333ea", balikBotol: "#3b82f6" },
    rankingBase: "#fca5a5",
    rankingPodium: ["#eab308", "#dc2626", "#f87171"],
    tva: { target: "#fca5a5", actual: "#dc2626", bulanLalu: "#f59e0b", tahunLalu: "#9333ea" },
  },
  {
    name: "Segar Emerald",
    product: ["#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"],
    sektor: ["#10b981", "#0ea5e9", "#f59e0b", "#a855f7", "#f43f5e", "#84cc16"],
    tren: { penjualan: "#059669", target: "#f59e0b", bulanLalu: "#0ea5e9", tahunLalu: "#f43f5e", balikBotol: "#84cc16" },
    rankingBase: "#6ee7b7",
    rankingPodium: ["#d97706", "#059669", "#6ee7b7"],
    tva: { target: "#a7f3d0", actual: "#059669", bulanLalu: "#0ea5e9", tahunLalu: "#f43f5e" },
  },
  {
    name: "Modern Indigo",
    product: ["#6366f1", "#f43f5e", "#14b8a6", "#eab308"],
    sektor: ["#6366f1", "#f43f5e", "#14b8a6", "#eab308", "#ec4899", "#22c55e"],
    tren: { penjualan: "#4f46e5", target: "#22c55e", bulanLalu: "#eab308", tahunLalu: "#ec4899", balikBotol: "#14b8a6" },
    rankingBase: "#a5b4fc",
    rankingPodium: ["#ca8a04", "#4f46e5", "#a5b4fc"],
    tva: { target: "#c7d2fe", actual: "#4f46e5", bulanLalu: "#eab308", tahunLalu: "#ec4899" },
  },
];

// Palet warna PATEN untuk produk (tidak ikut berubah saat ganti tema/tampilan)
// YO = Merah, OM = Kuning, OS = Pink, YT = Biru
export const FIXED_PRODUCT_COLORS = ["#dc2626", "#eab308", "#ec4899", "#2563eb"];

// Mencampur warna hex dengan putih sebesar `ratio` (0 = warna asli, 1 = putih penuh)
// Dipakai untuk membuat efek gradasi warna pada bar ranking (rank 4 ke bawah)
function mixWithWhite(hex: string, ratio: number): string {
  const clean = (hex || "#fca5a5").replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  const clampRatio = Math.min(1, Math.max(0, ratio));
  const nr = Math.round(r + (255 - r) * clampRatio);
  const ng = Math.round(g + (255 - g) * clampRatio);
  const nb = Math.round(b + (255 - b) * clampRatio);
  return `rgb(${nr}, ${ng}, ${nb})`;
}

// 1. Ranking Penjualan Antar YL (Bulan Ini) - Bar Chart (horizontal atau vertikal)
interface RankingYLProps {
  data: { nama: string; akumulasi: number }[];
  isCompact?: boolean;
  height?: string | number;
  rankingBaseColor?: string;
  podiumColors?: [string, string, string];
  chartType?: "horizontal" | "vertical";
}

const CustomRankingTooltip = ({ active, payload, sortedData }: any) => {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    const value = Number(item.akumulasi || 0);
    const rankIndex = (sortedData || []).findIndex((d: any) => d.nama === item.nama);
    const rankNumber = rankIndex >= 0 ? rankIndex + 1 : null;

    let badgeBg = "bg-slate-800 text-slate-300";
    let badgeText = rankNumber ? `#${rankNumber}` : "";
    if (rankNumber === 1) {
      badgeBg = "bg-amber-400 text-slate-950 font-black";
      badgeText = "🥇 Juara 1";
    } else if (rankNumber === 2) {
      badgeBg = "bg-red-500 text-white font-bold";
      badgeText = "🥈 Juara 2";
    } else if (rankNumber === 3) {
      badgeBg = "bg-rose-400 text-slate-950 font-bold";
      badgeText = "🥉 Juara 3";
    }

    return (
      <div className="bg-slate-900/95 backdrop-blur-md p-3 rounded-xl border border-slate-700/80 text-xs shadow-2xl min-w-[180px] z-50 space-y-2">
        <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-1.5">
          <span className="font-black text-white text-sm">{item.nama}</span>
          {badgeText && (
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider ${badgeBg}`}>
              {badgeText}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 text-xs pt-0.5">
          <span className="text-slate-300 font-medium">Akumulasi Penjualan:</span>
          <span className="font-black text-amber-400 font-mono text-sm">
            {value.toLocaleString("id-ID")} btl
          </span>
        </div>
      </div>
    );
  }
  return null;
};

// Menghitung warna tiap bar: podium (rank 1-3) pakai warna tema, rank 4+ pakai gradasi dari rankingBaseColor
function getRankColor(index: number, total: number, rankingBaseColor?: string, podiumColors?: [string, string, string]) {
  if (index === 0) return podiumColors?.[0] || "#eab308";
  if (index === 1) return podiumColors?.[1] || "#dc2626";
  if (index === 2) return podiumColors?.[2] || "#f87171";
  const gradientPoolSize = Math.max(1, total - 3);
  const posInGradient = index - 3;
  const ratio = (posInGradient / gradientPoolSize) * 0.7; // maks 70% memudar ke putih
  return mixWithWhite(rankingBaseColor || "#fca5a5", ratio);
}

export const RankingYLChart = memo(function RankingYLChart({ data = [], isCompact = false, height, rankingBaseColor, podiumColors, chartType = "horizontal" }: RankingYLProps) {
  const sortedData = [...(data || [])].sort((a, b) => b.akumulasi - a.akumulasi);

  if (chartType === "vertical") {
    // Variasi tampilan: bar tegak (kolom), nama YL di sumbu X, diurutkan tetap sesuai ranking
    const containerStyle = height ? { height } : { height: isCompact ? "100%" : 300, minHeight: isCompact ? 260 : undefined };
    return (
      <div className="w-full h-full" style={containerStyle}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sortedData} margin={{ top: 20, right: 10, left: -15, bottom: 55 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="nama"
              stroke="#475569"
              fontSize={isCompact ? 8 : 9}
              fontWeight={600}
              tickLine={false}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={70}
            />
            <YAxis type="number" stroke="#94a3b8" fontSize={9} />
            <Tooltip content={(props) => <CustomRankingTooltip {...props} sortedData={sortedData} />} />
            <Bar dataKey="akumulasi" radius={[4, 4, 0, 0]} maxBarSize={38}>
              <LabelList dataKey="akumulasi" position="top" fontSize={9} fill="#64748b" fontWeight="bold" />
              {sortedData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={getRankColor(index, sortedData.length, rankingBaseColor, podiumColors)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const calculatedHeight = Math.max(260, sortedData.length * 28);
  const containerStyle = height
    ? { height }
    : isCompact
    ? { height: "100%", minHeight: calculatedHeight }
    : { height: calculatedHeight };

  return (
    <div className="w-full h-full" style={containerStyle}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 2, right: 35, left: 5, bottom: 2 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis type="number" stroke="#94a3b8" fontSize={9} />
          <YAxis
            dataKey="nama"
            type="category"
            stroke="#475569"
            fontSize={isCompact ? 9 : 10}
            fontWeight={600}
            width={isCompact ? 105 : 120}
            tickLine={false}
            interval={0}
          />
          <Tooltip content={(props) => <CustomRankingTooltip {...props} sortedData={sortedData} />} />
          <Bar dataKey="akumulasi" radius={[0, 4, 4, 0]}>
            <LabelList dataKey="akumulasi" position="right" fontSize={9} fill="#64748b" fontWeight="bold" />
            {sortedData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={getRankColor(index, sortedData.length, rankingBaseColor, podiumColors)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

// 2. Komposisi Produk - Donut Chart
interface KomposisiProps {
  yo: number;
  om: number;
  os: number;
  yt: number;
  height?: number;
  chartType?: "donut" | "bar";
  colors?: string[];
}

export const KomposisiProdukChart = memo(function KomposisiProdukChart({ yo, om, os, yt, height, chartType = "donut", colors }: KomposisiProps) {
  const total = yo + om + os + yt;
  const palette = colors && colors.length >= 4 ? colors : ["#ef4444", "#f59e0b", "#ec4899", "#3b82f6"];
  const data = [
    { name: "YO Original", value: yo, color: palette[0] },
    { name: "OM Mango", value: om, color: palette[1] },
    { name: "OS Stroberi", value: os, color: palette[2] },
    { name: "YT Light", value: yt, color: palette[3] }
  ].filter(d => d.value > 0);

  const containerHeight = height || 220;
  const pieRadiusOuter = Math.min(110, Math.max(55, Math.floor(containerHeight * 0.22)));
  const pieRadiusInner = Math.floor(pieRadiusOuter * 0.62);

  return (
    <div
      className="flex flex-col items-center justify-between w-full"
      style={{ height: containerHeight }}
    >
      <div className="w-full relative flex-1 min-h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart data={data} margin={{ top: 20, right: 15, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} interval={0} />
              <YAxis stroke="#94a3b8" fontSize={9} domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.2)]} tickFormatter={(v) => Number(v).toLocaleString("id-ID")} />
              <Tooltip
                formatter={(value: any) => [`${value} btl`, "Jumlah"]}
                contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "none", color: "#fff" }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
                <LabelList dataKey="value" position="top" fontSize={9} fill="#64748b" fontWeight="bold" />
              </Bar>
            </BarChart>
          ) : (
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={pieRadiusInner}
                outerRadius={pieRadiusOuter}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any) => [`${value} btl`, "Jumlah"]}
                contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "none", color: "#fff" }}
              />
            </PieChart>
          )}
        </ResponsiveContainer>
        {chartType === "donut" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider">Total</span>
            <span className="text-sm sm:text-base font-black text-slate-800">{total.toLocaleString("id-ID")} btl</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full text-[10px] sm:text-xs pt-2 pb-1 px-4 border-t border-slate-100/80 bg-slate-50/50 rounded-xl">
        {data.map((entry, index) => {
          const percentage = total > 0 ? Math.round((entry.value / total) * 100) : 0;
          return (
            <div key={index} className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-slate-700 truncate font-semibold">{entry.name}</span>
              <span className="text-slate-500 ml-auto font-bold">{percentage}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// 3. Target vs Actual per YL - Grouped Bar Chart
interface TargetVsActualProps {
  data: { nama: string; target: number; actual: number; bulanLalu?: number; tahunLalu?: number }[];
  chartType?: "groupedBar" | "line";
  colors?: { target: string; actual: string; bulanLalu?: string; tahunLalu?: string };
}

const CustomTargetVsActualTooltip = ({ active, payload, label, colors }: any) => {
  if (active && payload && payload.length) {
    const targetItem = payload.find((p: any) => p.dataKey === "target");
    const actualItem = payload.find((p: any) => p.dataKey === "actual");
    const bulanLaluItem = payload.find((p: any) => p.dataKey === "bulanLalu");
    const tahunLaluItem = payload.find((p: any) => p.dataKey === "tahunLalu");
    const targetVal = Number(targetItem?.value || 0);
    const actualVal = Number(actualItem?.value || 0);
    const pct = targetVal > 0 ? Math.round((actualVal / targetVal) * 100) : 0;

    const row = (label_: string, val: number, color: string, bold = false) => (
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-300 font-medium flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }}></span> {label_}:
        </span>
        <span className={`font-mono ${bold ? "font-black text-emerald-400" : "font-bold text-white"}`}>{val.toLocaleString("id-ID")} btl</span>
      </div>
    );

    return (
      <div className="bg-slate-900/95 backdrop-blur-md p-3 rounded-xl border border-slate-700/80 text-xs shadow-2xl min-w-[170px] z-50 space-y-2">
        <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-1.5">
          <span className="font-black text-white text-sm">{label}</span>
          <span className="text-[10px] bg-slate-800 text-amber-400 font-black px-2 py-0.5 rounded">
            {pct}% Capaian
          </span>
        </div>
        <div className="space-y-1 text-xs">
          {row("Target", targetVal, colors?.target || "#fca5a5")}
          {row("Realisasi", actualVal, colors?.actual || "#dc2626", true)}
          {bulanLaluItem && row("Bulan Lalu", Number(bulanLaluItem.value || 0), colors?.bulanLalu || "#f59e0b")}
          {tahunLaluItem && row("Tahun Lalu", Number(tahunLaluItem.value || 0), colors?.tahunLalu || "#9333ea")}
        </div>
      </div>
    );
  }
  return null;
};

export const TargetVsActualChart = memo(function TargetVsActualChart({ data = [], chartType = "groupedBar", colors }: TargetVsActualProps) {
  const sortedData = [...(data || [])].sort((a, b) => a.nama.localeCompare(b.nama));
  const chartData = sortedData.map((item) => {
    const maxVal = Math.max(
      Number(item.target) || 0,
      Number(item.actual) || 0,
      Number(item.bulanLalu) || 0,
      Number(item.tahunLalu) || 0
    );
    return { ...item, maxVal };
  });

  const targetColor = colors?.target || "#fca5a5";
  const actualColor = colors?.actual || "#dc2626";
  const bulanLaluColor = colors?.bulanLalu || "#f59e0b";
  const tahunLaluColor = colors?.tahunLalu || "#9333ea";

  return (
    <div className="w-full h-[220px] sm:h-[260px] min-h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === "line" ? (
          <LineChart data={sortedData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="nama"
              stroke="#94a3b8"
              fontSize={8}
              tickLine={false}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={70}
            />
            <YAxis stroke="#94a3b8" fontSize={9} />
            <Tooltip content={(props) => <CustomTargetVsActualTooltip {...props} colors={{ target: targetColor, actual: actualColor, bulanLalu: bulanLaluColor, tahunLalu: tahunLaluColor }} />} />
            <Legend wrapperStyle={{ fontSize: 9, paddingTop: 5 }} />
            <Line type="monotone" dataKey="target" name="Target" stroke={targetColor} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
            <Line type="monotone" dataKey="actual" name="Actual" stroke={actualColor} strokeWidth={2.5} dot={{ r: 3.5 }} />
            <Line type="monotone" dataKey="bulanLalu" name="Bulan Lalu" stroke={bulanLaluColor} strokeWidth={1.6} strokeDasharray="2 3" dot={{ r: 2.5 }} />
            <Line type="monotone" dataKey="tahunLalu" name="Tahun Lalu" stroke={tahunLaluColor} strokeWidth={1.6} strokeDasharray="1 3" dot={{ r: 2.5 }} />
          </LineChart>
        ) : (
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              xAxisId="main"
              dataKey="nama"
              stroke="#94a3b8"
              fontSize={8}
              tickLine={false}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={70}
            />
            <XAxis
              xAxisId="bg"
              dataKey="nama"
              hide
            />
            <YAxis stroke="#94a3b8" fontSize={9} />
            <Tooltip content={(props) => <CustomTargetVsActualTooltip {...props} colors={{ target: targetColor, actual: actualColor, bulanLalu: bulanLaluColor, tahunLalu: tahunLaluColor }} />} />
            <Legend wrapperStyle={{ fontSize: 9, paddingTop: 5 }} />
            <Bar
              xAxisId="bg"
              dataKey="maxVal"
              name="Pembungkus"
              fill="rgba(203, 213, 225, 0.25)"
              stroke="rgba(148, 163, 184, 0.45)"
              strokeWidth={1}
              strokeDasharray="3 3"
              radius={[6, 6, 0, 0]}
              maxBarSize={64}
              legendType="none"
              tooltipType="none"
            />
            <Bar xAxisId="main" dataKey="target" name="Target" fill={targetColor} radius={[3, 3, 0, 0]} maxBarSize={14} />
            <Bar xAxisId="main" dataKey="actual" name="Actual" fill={actualColor} radius={[3, 3, 0, 0]} maxBarSize={14} />
            <Bar xAxisId="main" dataKey="bulanLalu" name="Bulan Lalu" fill={bulanLaluColor} radius={[3, 3, 0, 0]} maxBarSize={14} fillOpacity={0.75} />
            <Bar xAxisId="main" dataKey="tahunLalu" name="Tahun Lalu" fill={tahunLaluColor} radius={[3, 3, 0, 0]} maxBarSize={14} fillOpacity={0.75} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
});

// 4. Potensi Sektor Tim - Sektor Bar Chart
interface SektorProps {
  data: { name: string; value: number; color: string }[];
  chartType?: "bar" | "donut";
  colors?: string[];
}

const CustomSektorTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-slate-900/95 backdrop-blur-md p-2.5 rounded-lg border border-slate-700 text-xs shadow-xl min-w-[150px] z-50">
        <p className="font-bold text-amber-400 mb-1.5 pb-1 border-b border-slate-700/80 flex items-center justify-between gap-2">
          <span>Potensi:</span>
          <span className="text-white bg-slate-800 px-1.5 py-0.5 rounded font-semibold">{item.name}</span>
        </p>
        <div className="flex flex-col gap-1 text-[11px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-300 font-medium">Penjualan:</span>
            <span className="font-bold text-white font-mono">
              {Number(item.value || 0).toLocaleString("id-ID")} btl
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export const SektorTimChart = memo(function SektorTimChart({ data = [], chartType = "bar", colors }: SektorProps) {
  const coloredData = (data || []).map((d, i) => ({
    ...d,
    color: colors && colors.length ? colors[i % colors.length] : d.color
  }));

  const totalValue = coloredData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="w-full h-[220px] sm:h-[260px] min-h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === "donut" ? (
          <PieChart>
            <Pie 
              data={coloredData} 
              cx="50%" 
              cy="50%" 
              innerRadius={45} 
              outerRadius={75} 
              paddingAngle={2} 
              dataKey="value"
              labelLine={false}
              label={(props: any) => {
                const { cx, cy, midAngle, outerRadius, fill, percent, value } = props;
                if (percent < 0.03) return null; // Sembunyikan label jika terlalu kecil (<3%)
                const RADIAN = Math.PI / 180;
                const radius = outerRadius * 1.15;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                return (
                  <text x={x} y={y} fill={fill} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={9} fontWeight={700}>
                    {`${value.toLocaleString("id-ID")} (${(percent * 100).toFixed(1)}%)`}
                  </text>
                );
              }}
            >
              {coloredData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomSektorTooltip />} />
            <Legend wrapperStyle={{ fontSize: 9, paddingTop: 5 }} />
          </PieChart>
        ) : (
          <BarChart
            data={coloredData}
            layout="vertical"
            margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              type="number"
              stroke="#64748b"
              fontSize={10}
              tickFormatter={(v) => Number(v).toLocaleString("id-ID")}
            />
            <YAxis
              dataKey="name"
              type="category"
              stroke="#475569"
              fontSize={10}
              fontWeight={600}
              tickLine={false}
              width={55}
            />
            <Tooltip content={<CustomSektorTooltip />} />
            <Bar dataKey="value" name="Volume" radius={[0, 4, 4, 0]} maxBarSize={38}>
              <LabelList 
                dataKey="value" 
                position="right" 
                fontSize={9} 
                fill="#64748b" 
                fontWeight="bold" 
                formatter={(val: number) => {
                  const pct = totalValue > 0 ? ((val / totalValue) * 100).toFixed(1) : "0.0";
                  return `${val.toLocaleString("id-ID")} (${pct}%)`;
                }}
              />
              {coloredData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
});

// 5. Tren Harian: Penjualan - Combo Chart (Dual Y-Axis)
interface TrenDataPoint {
  tanggal: string;
  penjualan: number;
  balikBotol: number;
  target?: number;
  bulanLalu?: number;
  tahunLalu?: number;
}

interface TrenProps {
  data: TrenDataPoint[];
  chartType?: "combo" | "area";
  colors?: { penjualan: string; target: string; bulanLalu: string; tahunLalu: string; balikBotol: string };
}

const CustomTrenTooltip = ({ active, payload, label, colors }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 backdrop-blur-md p-2.5 rounded-lg border border-slate-700 text-xs shadow-xl min-w-[170px] z-50">
        <p className="font-bold text-amber-400 mb-1.5 pb-1 border-b border-slate-700/80 flex items-center justify-between">
          <span>Tanggal:</span>
          <span className="text-white bg-slate-800 px-1.5 py-0.5 rounded">{label}</span>
        </p>
        <div className="flex flex-col gap-1.5">
          {payload.map((item: any, idx: number) => {
            let dotColor = item.color || item.fill || item.stroke;
            if (item.dataKey === "penjualan") dotColor = colors?.penjualan || "#ef4444";
            else if (item.dataKey === "balikBotol") dotColor = colors?.balikBotol || "#38bdf8";
            else if (item.dataKey === "target") dotColor = colors?.target || "#34d399";
            else if (item.dataKey === "bulanLalu") dotColor = colors?.bulanLalu || "#fbbf24";
            else if (item.dataKey === "tahunLalu") dotColor = colors?.tahunLalu || "#c084fc";

            return (
              <div key={idx} className="flex items-center justify-between gap-3 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: dotColor }}></span>
                  <span className="text-slate-300 font-medium">{item.name}:</span>
                </div>
                <span className="font-bold text-white font-mono">
                  {Number(item.value ?? 0).toLocaleString("id-ID")} btl
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

export const TrenHarianChart = memo(function TrenHarianChart({ data, chartType = "combo", colors }: TrenProps) {
  // Calculated flexible Y max: max value + 20%, rounded to nearest thousands (e.g., 14,138 -> 14,000)
  const calcFlexibleYMax = (dataMax: number) => {
    if (!Number.isFinite(dataMax) || dataMax <= 0) return 1000;
    const targetVal = dataMax * 1.2;
    if (targetVal >= 10000) {
      return Math.round(targetVal / 1000) * 1000;
    }
    if (targetVal >= 1000) {
      return Math.round(targetVal / 100) * 100;
    }
    return Math.ceil(targetVal);
  };

  const c = {
    penjualan: colors?.penjualan || "#dc2626",
    target: colors?.target || "#10b981",
    bulanLalu: colors?.bulanLalu || "#f59e0b",
    tahunLalu: colors?.tahunLalu || "#9333ea",
    balikBotol: colors?.balikBotol || "#3b82f6",
  };

  return (
    <div className="flex flex-col gap-2 w-full h-[220px] sm:h-[260px] min-h-[200px]">
      <div className="w-full h-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "area" ? (
            <AreaChart data={data} margin={{ top: 15, right: 10, left: 15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="tanggal" stroke="#64748b" fontSize={10} fontWeight={600} />
              <YAxis
                stroke="#64748b"
                fontSize={10}
                fontWeight={600}
                width={48}
                domain={[0, calcFlexibleYMax]}
                padding={{ top: 20, bottom: 10 }}
                tickFormatter={(v) => Number(v).toLocaleString("id-ID")}
              />
              <Tooltip content={(props) => <CustomTrenTooltip {...props} colors={c} />} />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 6 }}
                formatter={(value) => {
                  const textColor = value === "Balik Botol (BB)" ? c.balikBotol : "#475569";
                  return <span style={{ color: textColor, fontWeight: 600 }}>{value}</span>;
                }}
              />
              <Area type="monotone" dataKey="penjualan" name="Penjualan" stroke={c.penjualan} fill={c.penjualan} fillOpacity={0.25} strokeWidth={2.5} />
              <Area type="monotone" dataKey="balikBotol" name="Balik Botol (BB)" stroke={c.balikBotol} fill={c.balikBotol} fillOpacity={0.2} strokeWidth={1.8} />
              <Area type="monotone" dataKey="target" name="Target Bulan Ini" stroke={c.target} fill={c.target} fillOpacity={0.12} strokeWidth={1.8} strokeDasharray="6 4" />
              <Area type="monotone" dataKey="bulanLalu" name="Bulan Lalu" stroke={c.bulanLalu} fill={c.bulanLalu} fillOpacity={0.08} strokeWidth={1.5} />
              <Area type="monotone" dataKey="tahunLalu" name="Tahun Lalu" stroke={c.tahunLalu} fill={c.tahunLalu} fillOpacity={0.08} strokeWidth={1.5} strokeDasharray="2 3" />
            </AreaChart>
          ) : (
            <ComposedChart
              data={data}
              margin={{ top: 15, right: 10, left: 15, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="tanggal" stroke="#64748b" fontSize={10} fontWeight={600} />

              {/* Sumbu Y Tunggal (Flexible + 20% Rounded) */}
              <YAxis
                stroke="#64748b"
                fontSize={10}
                fontWeight={600}
                width={48}
                domain={[0, calcFlexibleYMax]}
                padding={{ top: 20, bottom: 10 }}
                tickFormatter={(v) => Number(v).toLocaleString("id-ID")}
              />

              <Tooltip content={(props) => <CustomTrenTooltip {...props} colors={c} />} />
              <Legend 
                wrapperStyle={{ fontSize: 10, paddingTop: 6 }}
                formatter={(value) => {
                  const textColor = value === "Balik Botol (BB)" ? c.balikBotol : "#475569";
                  return <span style={{ color: textColor, fontWeight: 600 }}>{value}</span>;
                }}
              />

              {/* 1. Balik Botol (BB): Bar Chart Transparan */}
              <Bar
                dataKey="balikBotol"
                name="Balik Botol (BB)"
                fill={c.balikBotol}
                fillOpacity={0.25}
                stroke={c.balikBotol}
                strokeWidth={1}
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
              />

              {/* 2. Penjualan: Garis Tebal Solid */}
              <Line
                type="monotone"
                dataKey="penjualan"
                name="Penjualan"
                stroke={c.penjualan}
                strokeWidth={3}
                dot={{ r: 3.5, fill: c.penjualan, strokeWidth: 1.5, stroke: "#ffffff" }}
                activeDot={{ r: 5 }}
              />

              {/* 3. Target: Garis Putus-Putus (Dashed) */}
              <Line
                type="monotone"
                dataKey="target"
                name="Target Bulan Ini"
                stroke={c.target}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4 }}
              />

              {/* 4. Bulan Lalu: Garis Tipis Solid */}
              <Line
                type="monotone"
                dataKey="bulanLalu"
                name="Bulan Lalu"
                stroke={c.bulanLalu}
                strokeWidth={1.8}
                dot={false}
                activeDot={{ r: 4 }}
              />

              {/* 5. Tahun Lalu: Garis Bintik-Bintik (Dotted) */}
              <Line
                type="monotone"
                dataKey="tahunLalu"
                name="Tahun Lalu"
                stroke={c.tahunLalu}
                strokeWidth={1.8}
                strokeDasharray="2 3"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
});
