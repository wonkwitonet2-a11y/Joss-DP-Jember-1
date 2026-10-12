import { memo, useEffect, useMemo, useRef, useState } from "react";
import { makeNiceAxis, makeUnitAxis, formatAxisLabel } from "../lib/chartAxis";
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
  LabelList,
  ReferenceArea,
  ReferenceLine
} from "recharts";

const SafeReferenceArea = ReferenceArea as any;

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
    name: "Corporate Navy",
    product: ["#dc2626", "#eab308", "#ec4899", "#2563eb"], // YO merah, OM kuning-oren, OS pink, YT biru (tetap di semua varian)
    sektor: ["#1d4ed8", "#0284c7", "#059669", "#d97706", "#7c3aed", "#ec4899"],
    tren: { penjualan: "#2563eb", target: "#059669", bulanLalu: "#d97706", tahunLalu: "#7c3aed", balikBotol: "#0284c7" },
    rankingBase: "#93c5fd",
    rankingPodium: ["#eab308", "#2563eb", "#60a5fa"],
    tva: { target: "#93c5fd", actual: "#1d4ed8", bulanLalu: "#d97706", tahunLalu: "#7c3aed" },
  },
  {
    name: "Segar Emerald",
    product: ["#dc2626", "#eab308", "#ec4899", "#2563eb"], // YO merah, OM kuning-oren, OS pink, YT biru (tetap di semua varian)
    sektor: ["#10b981", "#0ea5e9", "#f59e0b", "#a855f7", "#f43f5e", "#84cc16"],
    tren: { penjualan: "#059669", target: "#f59e0b", bulanLalu: "#0ea5e9", tahunLalu: "#f43f5e", balikBotol: "#84cc16" },
    rankingBase: "#6ee7b7",
    rankingPodium: ["#d97706", "#059669", "#6ee7b7"],
    tva: { target: "#a7f3d0", actual: "#059669", bulanLalu: "#0ea5e9", tahunLalu: "#f43f5e" },
  },
  {
    name: "Modern Indigo",
    product: ["#dc2626", "#eab308", "#ec4899", "#2563eb"], // YO merah, OM kuning-oren, OS pink, YT biru (tetap di semua varian)
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

    let badgeBg = "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200";
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
      <div className="bg-white dark:bg-neutral-900 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs shadow-lg min-w-[180px] z-50 space-y-2">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 dark:border-neutral-700 pb-1.5">
          <span className="font-black text-neutral-900 dark:text-white text-sm">{item.nama}</span>
          {badgeText && (
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider ${badgeBg}`}>
              {badgeText}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 text-xs pt-0.5">
          <span className="text-neutral-600 dark:text-neutral-300 font-medium">Akumulasi Penjualan:</span>
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
  const pieRadiusOuter = Math.min(110, Math.max(58, Math.floor(containerHeight * 0.27)));
  const pieRadiusInner = Math.floor(pieRadiusOuter * 0.7);
  // Teks tengah donut harus muat di lubang donut (diameter = 2 x radius dalam)
  const totalText = total.toLocaleString("id-ID");
  const centerFont = Math.max(10, Math.min(16, Math.floor((pieRadiusInner * 2 - 10) / (totalText.length * 0.62))));

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
                contentStyle={{ backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e5e5e5", color: "#171717", boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}
                labelStyle={{ color: "#1d4f91", fontWeight: 700 }}
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
                contentStyle={{ backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e5e5e5", color: "#171717", boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}
                labelStyle={{ color: "#1d4f91", fontWeight: 700 }}
              />
            </PieChart>
          )}
        </ResponsiveContainer>
        {chartType === "donut" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[9px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-wider leading-none">Total</span>
            <span className="font-black text-neutral-900 dark:text-white font-mono tabular-nums leading-tight whitespace-nowrap" style={{ fontSize: centerFont }}>{totalText}</span>
            <span className="text-[9px] text-neutral-500 dark:text-neutral-400 font-bold leading-none">btl</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full text-[10px] sm:text-xs pt-2 pb-1 px-4 border-t border-[var(--line)] bg-[var(--bg-inset)] rounded-xl">
        {data.map((entry, index) => {
          const percentage = total > 0 ? Math.round((entry.value / total) * 100) : 0;
          return (
            <div key={index} className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-neutral-700 dark:text-neutral-200 truncate font-semibold">{entry.name}</span>
              <span className="text-neutral-500 dark:text-neutral-400 ml-auto font-bold font-mono tabular-nums">{percentage}%</span>
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
        <span className={`font-mono ${bold ? "font-black text-red-600 dark:text-red-400" : "font-bold text-neutral-900 dark:text-neutral-100"}`}>{val.toLocaleString("id-ID")} btl</span>
      </div>
    );

    return (
      <div className="bg-white dark:bg-neutral-900 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs shadow-lg min-w-[170px] z-50 space-y-2">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 dark:border-neutral-700 pb-1.5">
          <span className="font-black text-neutral-900 dark:text-white text-sm">{label}</span>
          <span className="text-[10px] bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 font-black px-2 py-0.5 rounded">
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
      <div className="bg-white dark:bg-neutral-900 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs shadow-lg min-w-[150px] z-50">
        <p className="font-bold text-brand-700 dark:text-brand-300 mb-1.5 pb-1 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-2">
          <span>Potensi:</span>
          <span className="text-neutral-800 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded font-semibold">{item.name}</span>
        </p>
        <div className="flex flex-col gap-1 text-[11px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-neutral-600 dark:text-neutral-300 font-medium">Penjualan:</span>
            <span className="font-bold text-neutral-900 dark:text-neutral-100 font-mono">
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
      <div className="bg-white dark:bg-neutral-900 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs shadow-lg min-w-[170px] z-50">
        <p className="font-bold text-brand-700 dark:text-brand-300 mb-1.5 pb-1 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
          <span>Tanggal:</span>
          <span className="text-neutral-800 dark:text-neutral-100 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">{label}</span>
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
                  <span className="text-neutral-600 dark:text-neutral-300 font-medium">{item.name}:</span>
                </div>
                <span className={`font-bold font-mono ${item.dataKey === "penjualan" ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-neutral-100"}`}>
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


// ============================================================================
// GRAFIK TREN GAYA "JOC": garis penjualan + area, garis putus-putus Target / Bulan Lalu /
// Tahun Lalu, panel Balik Botol di bawah, blok abu-abu untuk hari Minggu, dan kartu rincian
// per tanggal (ketuk / geser di grafik untuk memilih tanggal).
// ============================================================================
const HARI_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN_ID_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const JOC = {
  penjualan: "#ff1744",
  bulanLalu: "#eab308",
  tahunLalu: "#8b5cf6",
  balikBotol: "#3b82f6",
  hijau: "#10b981",
  grid: "rgba(148,163,184,0.28)",
  axis: "#94a3b8",
  libur: "rgba(148,163,184,0.22)",
};

const fmtBtl = (n: number) => `${Math.trunc(Number(n) || 0).toLocaleString("id-ID")} btl`;
const fmtK = (v: number) => {
  const n = Number(v) || 0;
  if (Math.abs(n) < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
};
const niceMax = (m: number) => {
  if (!Number.isFinite(m) || m <= 0) return 1000;
  const raw = m * 1.12;
  const step = Math.pow(10, Math.floor(Math.log10(raw)));
  return Math.ceil(raw / step) * step;
};

interface JocRow {
  day: number;
  hasData: boolean;
  sunday: boolean;
  penjualan: number | null;
  target: number | null;
  bulanLalu: number | null;
  tahunLalu: number | null;
  balikBotol: number | null;
}

interface TrenJocProps {
  data: TrenDataPoint[];
  /** Format "YYYY-MM" — dipakai untuk menandai hari Minggu & nama hari. */
  month?: string;
}

// Port persis dari grafik Tren Penjualan JOC (SVG kustom, lebar mengikuti kartu sehingga
// tulisan selalu berukuran asli). Hanya hari bertransaksi yang digambar & disambung.
const JC = { sales: "#ff1744", ok: "#10b981", lm: "#eab308", ly: "#8b5cf6", bb: "#2563eb" };
const fmtNum = (n: number) => Math.trunc(Number(n) || 0).toLocaleString("id-ID");

interface JocDay { day: number; sold: number; target: number; lm: number; ly: number; bb: number; isSun: boolean; mult: number; }

const JocCell = ({ label, value, sub, valueClass, subClass }: { label: string; value: string; sub?: string; valueClass?: string; subClass?: string }) => (
  <div className="min-w-0 p-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-700/60">
    <span className="block font-sans text-[10px] text-neutral-500 leading-tight">{label}</span>
    <span className={`block text-sm font-bold leading-tight break-words ${valueClass || ""}`}>{value}</span>
    {sub && <span className={`block text-[11px] leading-tight ${subClass || ""}`}>{sub}</span>}
  </div>
);

export const TrenHarianJocChart = memo(function TrenHarianJocChart({ data, month }: TrenJocProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [sel, setSel] = useState<number>(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.floor(el.clientWidth)));
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { days, today, year, monthIndex } = useMemo(() => {
    const now = new Date();
    const [y0, m0] = (month || "").split("-").map((x) => parseInt(x, 10));
    const ok = Number.isFinite(y0) && Number.isFinite(m0) && m0 >= 1 && m0 <= 12;
    const yy = ok ? y0 : now.getFullYear();
    const mi = ok ? m0 - 1 : now.getMonth();
    const dim = new Date(yy, mi + 1, 0).getDate();
    const isCurrent = yy === now.getFullYear() && mi === now.getMonth();
    const byDay = new Map<number, TrenDataPoint>();
    let maxData = 0;
    (data || []).forEach((p) => {
      const d = parseInt(String(p.tanggal), 10);
      if (Number.isFinite(d) && d > 0) { byDay.set(d, p); if (d > maxData) maxData = d; }
    });
    let td = isCurrent ? now.getDate() : dim;
    td = Math.min(dim, Math.max(td, maxData, 1));
    const list: JocDay[] = [];
    let prevTx = 0;
    for (let d = 1; d <= td; d++) {
      const p = byDay.get(d);
      const sold = p ? Number(p.penjualan) || 0 : 0;
      const isSun = new Date(yy, mi, d).getDay() === 0;
      let mult = 1;
      if (sold > 0) { mult = Math.max(1, d - prevTx); prevTx = d; }
      list.push({
        day: d,
        sold,
        target: p ? Number(p.target) || 0 : 0,
        lm: p ? Number(p.bulanLalu) || 0 : 0,
        ly: p ? Number(p.tahunLalu) || 0 : 0,
        bb: p ? Number(p.balikBotol) || 0 : 0,
        isSun,
        mult,
      });
    }
    return { days: list, today: td, year: yy, monthIndex: mi };
  }, [data, month]);

  const n = days.length;
  const compact = width < 520;

  const g = useMemo(() => {
    const padL = compact ? 38 : 46;
    const padR = compact ? 10 : 16;
    const padT = 8;
    const salesH = compact ? 190 : 230;
    const gap = 30;
    const bbH = compact ? 70 : 84;
    const salesTop = padT;
    const salesBottom = salesTop + salesH;
    const bbTop = salesBottom + gap;
    const bbBottom = bbTop + bbH;
    const H = bbBottom + 26;
    const inset = compact ? 8 : 12;
    const plotW = width - padL - padR;
    const step = n > 1 ? (plotW - 2 * inset) / (n - 1) : 40;
    return { padL, padR, padT, salesH, gap, bbH, salesTop, salesBottom, bbTop, bbBottom, H, inset, plotW, step };
  }, [width, compact, n]);

  const maxSales = Math.max(1, ...days.filter((d) => d.sold > 0).map((d) => Math.max(d.sold, d.target, d.lm, d.ly))) * 1.1;
  const maxBb = Math.max(0, ...days.map((d) => d.bb));
  const salesUnit = maxSales > 30000 ? 5000 : 1000;
  const salesAxis = useMemo(() => makeUnitAxis(maxSales, g.salesH, salesUnit), [maxSales, g.salesH, salesUnit]);
  const bbPx = g.bbH - 6;
  const bbAxis = useMemo(() => makeNiceAxis(maxBb, bbPx), [maxBb, bbPx]);

  const getX = (i: number) => (n > 1 ? g.padL + g.inset + (i / (n - 1)) * (g.plotW - 2 * g.inset) : g.padL + g.plotW / 2);
  const getY = (v: number) => g.salesBottom - salesAxis.scale(v) * g.salesH;

  const labelEvery = g.step >= 20 ? 1 : g.step >= 11 ? 2 : 5;
  const lastRem = n % labelEvery;
  const showLast = labelEvery === 1 || lastRem === 0 || lastRem >= 2;
  const showDayLabel = (d: number) => d === 1 || d === today || (d === n && showLast) || d % labelEvery === 0;

  const txDays = days.map((d, i) => ({ d, i })).filter(({ d }) => d.day <= today && d.sold > 0);
  const lastTx = txDays.length ? txDays[txDays.length - 1].d.day : 0;
  const linePts = (pick: (d: JocDay) => number) => txDays.map(({ d, i }) => ({ x: getX(i), y: getY(pick(d)) }));
  const toPoints = (seg: { x: number; y: number }[]) => seg.map((p) => `${p.x},${p.y}`).join(" ");
  const halfDash = Math.max(8, Math.min(18, g.step * 0.45));
  const asLine = (pts: { x: number; y: number }[]) =>
    pts.length === 1 ? [{ x: pts[0].x - halfDash, y: pts[0].y }, { x: pts[0].x + halfDash, y: pts[0].y }] : pts;

  const salesPts = linePts((d) => d.sold);
  const hasLm = txDays.some(({ d }) => d.lm > 0);
  const hasLy = txDays.some(({ d }) => d.ly > 0);
  const hasTarget = txDays.some(({ d }) => d.target > 0);
  const targetPts = hasTarget ? linePts((d) => d.target) : [];
  const lmPts = hasLm ? linePts((d) => d.lm) : [];
  const lyPts = hasLy ? linePts((d) => d.ly) : [];

  const selected = days.find((d) => d.day === (sel || lastTx || today)) ?? days[days.length - 1];
  const selIdx = selected ? days.findIndex((d) => d.day === selected.day) : -1;
  const barW = Math.max(4, Math.min(14, g.step * 0.55));
  const hitW = Math.max(g.step, 12);
  const fmtDay = (d: number) => `${HARI_ID[new Date(year, monthIndex, d).getDay()]}, ${d} ${BULAN_ID_SHORT[monthIndex]}`;

  return (
    <div className="space-y-3 min-w-0 text-neutral-900 dark:text-neutral-100">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden="true"><line x1="0" y1="4" x2="18" y2="4" stroke={JC.sales} strokeWidth="2.5" strokeLinecap="round" /></svg>
          Penjualan
        </span>
        {hasTarget && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true"><line x1="0" y1="4" x2="18" y2="4" stroke="currentColor" className="text-neutral-900 dark:text-white" strokeWidth="2" strokeDasharray="4 3" /></svg>
            Target
          </span>
        )}
        {hasLm && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true"><line x1="0" y1="4" x2="18" y2="4" stroke={JC.lm} strokeWidth="2" strokeDasharray="4 3" /></svg>
            Bulan lalu (LM)
          </span>
        )}
        {hasLy && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true"><line x1="0" y1="4" x2="18" y2="4" stroke={JC.ly} strokeWidth="2" strokeDasharray="4 3" /></svg>
            Tahun lalu (LY)
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-3 rounded-sm opacity-70" style={{ background: JC.bb }} />
          Balik botol (BB)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-neutral-200 dark:bg-neutral-700" />
          Libur (Minggu)
        </span>
      </div>

      {/* Grafik */}
      <div ref={wrapRef} className="w-full min-w-0">
        <svg
          width={width}
          height={g.H}
          viewBox={`0 0 ${width} ${g.H}`}
          className="block max-w-full rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 select-none"
          role="img"
          aria-label="Grafik tren penjualan harian dan balik botol"
        >
          <defs>
            <linearGradient id="trendSalesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={JC.sales} stopOpacity="0.22" />
              <stop offset="100%" stopColor={JC.sales} stopOpacity="0" />
            </linearGradient>
          </defs>

          <text x={g.padL} y={g.salesTop + 11} fontSize="11" fontWeight="600" className="fill-neutral-500 dark:fill-neutral-400">Penjualan (btl)</text>
          <text x={g.padL} y={g.salesBottom + 20} fontSize="11" fontWeight="600" fill={JC.bb}>Balik Botol (btl)</text>

          {days.map((d, i) =>
            d.isSun ? (
              <rect
                key={`sun-${d.day}`}
                x={getX(i) - Math.max(g.step * 0.45, 5)}
                y={g.salesTop}
                width={Math.max(g.step * 0.9, 10)}
                height={g.bbBottom - g.salesTop}
                className="fill-neutral-200/60 dark:fill-neutral-700/40 pointer-events-none"
                rx={3}
              />
            ) : null
          )}

          {salesAxis.ticks.map((tv) => (
            <g key={`sy-${tv}`}>
              <line x1={g.padL} x2={width - g.padR} y1={getY(tv)} y2={getY(tv)} stroke="currentColor" className="text-neutral-200 dark:text-neutral-700/70" strokeDasharray="3 4" />
              <text x={g.padL - 6} y={getY(tv) + 4} fontSize="11" textAnchor="end" className="fill-neutral-500 dark:fill-neutral-400 font-mono">
                {salesAxis.showLabel(tv) ? formatAxisLabel(tv) : ""}
              </text>
            </g>
          ))}

          {bbAxis.ticks.map((tv) => {
            const y = g.bbBottom - bbAxis.scale(tv) * bbPx;
            return (
              <g key={`by-${tv}`}>
                <line x1={g.padL} x2={width - g.padR} y1={y} y2={y} stroke="currentColor" className="text-neutral-200 dark:text-neutral-700/70" strokeDasharray="3 4" />
                <text x={g.padL - 6} y={y + 4} fontSize="11" textAnchor="end" fill={JC.bb} className="font-mono">
                  {bbAxis.showLabel(tv) ? formatAxisLabel(tv) : ""}
                </text>
              </g>
            );
          })}

          <line x1={g.padL} x2={width - g.padR} y1={g.salesBottom} y2={g.salesBottom} stroke="currentColor" className="text-neutral-400 dark:text-neutral-500" />
          <line x1={g.padL} x2={width - g.padR} y1={g.bbBottom} y2={g.bbBottom} stroke="currentColor" className="text-neutral-400 dark:text-neutral-500" />
          <line x1={g.padL} x2={g.padL} y1={g.salesTop} y2={g.bbBottom} stroke="currentColor" className="text-neutral-400 dark:text-neutral-500" />
          <text x={g.padL - 6} y={g.salesBottom + 4} fontSize="11" textAnchor="end" className="fill-neutral-500 dark:fill-neutral-400 font-mono">0</text>
          <text x={g.padL - 6} y={g.bbBottom + 4} fontSize="11" textAnchor="end" fill={JC.bb} className="font-mono">0</text>

          {targetPts.length > 0 && (
            <polyline points={toPoints(asLine(targetPts))} fill="none" stroke="currentColor" className="text-neutral-900 dark:text-white" strokeWidth="2" strokeDasharray="5 3" strokeLinejoin="round" />
          )}
          {lmPts.length > 0 && (
            <polyline points={toPoints(asLine(lmPts))} fill="none" stroke={JC.lm} strokeWidth="1.75" strokeDasharray="4 4" strokeLinejoin="round" />
          )}
          {lyPts.length > 0 && (
            <polyline points={toPoints(asLine(lyPts))} fill="none" stroke={JC.ly} strokeWidth="1.75" strokeDasharray="3 3" strokeLinejoin="round" />
          )}

          {days.map((d, i) => {
            if (d.bb <= 0) return null;
            const h = Math.max(2, bbAxis.scale(d.bb) * bbPx);
            return (
              <rect key={`bb-${d.day}`} x={getX(i) - barW / 2} y={g.bbBottom - h} width={barW} height={h} rx={2} fill={JC.bb} opacity={d.day === selected?.day ? 0.95 : 0.6} />
            );
          })}

          {salesPts.length > 1 && (
            <path
              d={`M ${salesPts[0].x} ${g.salesBottom} ` + salesPts.map((p) => `L ${p.x} ${p.y}`).join(" ") + ` L ${salesPts[salesPts.length - 1].x} ${g.salesBottom} Z`}
              fill="url(#trendSalesGradient)"
            />
          )}
          {salesPts.length > 1 && (
            <polyline points={toPoints(salesPts)} fill="none" stroke={JC.sales} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {selected && selIdx >= 0 && (
            <line x1={getX(selIdx)} x2={getX(selIdx)} y1={g.salesTop} y2={g.bbBottom} stroke={JC.sales} strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="2 3" />
          )}

          {days.map((d, i) => {
            if (d.day > today || d.sold <= 0) return null;
            const met = d.target > 0 && d.sold >= d.target;
            const isSel = d.day === selected?.day;
            const r = isSel ? 5.5 : g.step < 12 ? 2.5 : 3.5;
            return (
              <circle key={`pt-${d.day}`} cx={getX(i)} cy={getY(d.sold)} r={r} fill={met ? JC.ok : JC.sales} stroke="#fff" strokeWidth={isSel ? 2 : 1.25} className="dark:stroke-neutral-900" />
            );
          })}

          {selected && selIdx >= 0 && selected.sold > 0 && (() => {
            const x = getX(selIdx);
            const y = getY(selected.sold);
            const txt = fmtNum(selected.sold);
            const half = txt.length * 3.6 + 4;
            const tx = Math.min(Math.max(x, g.padL + half), width - g.padR - half);
            const ty = y - 12 < g.salesTop + 16 ? y + 20 : y - 10;
            return (
              <text x={tx} y={ty} fontSize="12" fontWeight="700" textAnchor="middle" fill={JC.sales} stroke="#fff" strokeWidth="3" paintOrder="stroke" className="font-mono dark:[stroke:#171717]">
                {txt}
              </text>
            );
          })()}

          {days.map((d, i) => {
            if (!showDayLabel(d.day)) return null;
            const isSel = d.day === selected?.day;
            const isToday = d.day === today;
            return (
              <g key={`xl-${d.day}`}>
                {(isSel || isToday) && <circle cx={getX(i)} cy={g.bbBottom + 14} r={9} fill={JC.sales} opacity={isSel ? 0.18 : 0.1} />}
                <text
                  x={getX(i)}
                  y={g.bbBottom + 18}
                  fontSize="11"
                  textAnchor="middle"
                  className={`font-mono ${isSel || isToday ? "fill-brand-600 font-bold" : d.isSun ? "fill-red-500 font-semibold" : "fill-neutral-600 dark:fill-neutral-400"}`}
                >
                  {d.day}
                </text>
              </g>
            );
          })}

          {days.map((d, i) => (
            <rect
              key={`hit-${d.day}`}
              x={getX(i) - hitW / 2}
              y={g.salesTop}
              width={hitW}
              height={g.bbBottom - g.salesTop + 24}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setSel(d.day)}
              onClick={() => setSel(d.day)}
              onTouchStart={() => setSel(d.day)}
            />
          ))}
        </svg>
      </div>

      {/* Rincian tanggal terpilih */}
      {selected && (
        <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 text-xs">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded-lg bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300 font-bold">
              {fmtDay(selected.day)}
            </span>
            {selected.isSun && selected.sold <= 0 && <span className="text-neutral-500">Libur — tidak ada transaksi &amp; target</span>}
            {selected.sold > 0 && selected.mult > 1 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 font-mono font-semibold">
                Pengali ×{selected.mult}
              </span>
            )}
            {!selected.isSun && selected.day > lastTx && <span className="text-neutral-400">Belum ada transaksi</span>}
            {!selected.isSun && selected.day < lastTx && selected.sold <= 0 && (
              <span className="text-neutral-500">Tidak ada transaksi — dilewati, masuk ke pengali hari berikutnya</span>
            )}
          </div>
          {selected.sold > 0 && selected.day <= today && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 font-mono">
              <JocCell label="Penjualan" value={`${fmtNum(selected.sold)} btl`} valueClass="text-[#ff1744] dark:text-[#ff3366]" />
              {selected.target > 0 && (
                <JocCell
                  label="Target"
                  value={`${fmtNum(Math.round(selected.target))} btl`}
                  sub={`${selected.sold - selected.target >= 0 ? "+" : "−"}${fmtNum(Math.abs(Math.round(selected.sold - selected.target)))} btl`}
                  subClass={selected.sold - selected.target >= 0 ? "text-green-600 dark:text-green-400" : "text-[#e60000] dark:text-[#ff2a2a]"}
                  valueClass="text-neutral-900 dark:text-white"
                />
              )}
              {selected.lm > 0 && (
                <JocCell
                  label="Bulan lalu (LM)"
                  value={`${fmtNum(Math.round(selected.lm))} btl`}
                  sub={`${selected.sold - selected.lm >= 0 ? "+" : "−"}${fmtNum(Math.abs(Math.round(selected.sold - selected.lm)))} btl`}
                  subClass={selected.sold - selected.lm >= 0 ? "text-green-600 dark:text-green-400" : "text-[#e60000] dark:text-[#ff2a2a]"}
                  valueClass="text-yellow-600 dark:text-yellow-400"
                />
              )}
              {selected.ly > 0 && (
                <JocCell
                  label="Tahun lalu (LY)"
                  value={`${fmtNum(Math.round(selected.ly))} btl`}
                  sub={`${selected.sold - selected.ly >= 0 ? "+" : "−"}${fmtNum(Math.abs(Math.round(selected.sold - selected.ly)))} btl`}
                  subClass={selected.sold - selected.ly >= 0 ? "text-green-600 dark:text-green-400" : "text-[#e60000] dark:text-[#ff2a2a]"}
                  valueClass="text-violet-600 dark:text-violet-400"
                />
              )}
              <JocCell label="Balik botol (BB)" value={`${fmtNum(selected.bb)} btl`} valueClass="text-blue-600 dark:text-blue-400" />
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-neutral-400">Ketuk / arahkan ke tanggal pada grafik untuk melihat rinciannya.</p>
    </div>
  );
});
