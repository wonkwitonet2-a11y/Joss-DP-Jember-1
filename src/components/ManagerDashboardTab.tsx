import React, { useState, useRef, useEffect } from "react";
import { X, Maximize2, Palette } from "lucide-react";
import { MenuTitleIcon } from "./AppSidebar";
import {
  RankingYLChart,
  KomposisiProdukChart,
  SektorTimChart,
  TrenHarianJocChart,
  DASHBOARD_THEMES,
  FIXED_PRODUCT_COLORS,
} from "./Charts";
import type { DashboardData } from "../types";
import { formatTruncated, formatPercentTruncated, bbColorClass, vsPctColorClass, rata2ColorClass } from "../utils/numberFormat";

// Berapa jenis tampilan (jenis grafik) yang tersedia per card. 1 = tidak ganti jenis, cuma warna.
const CARD_CHART_VARIANTS: Record<number, number> = {
  0: 1, // Ringkasan Utama Tim (tabel/kartu statistik, tanpa grafik)
  1: 2, // Komposisi Produk: donut <-> bar
  2: 2, // Potensi Sektor Tim: bar <-> donut
  3: 1, // Tren Harian: hanya gaya JOC
  4: 2, // Ranking YL: horizontal <-> vertikal (kolom), warna + podium ikut berubah
  5: 1, // Kinerja Akumulatif (tabel)
};

const ACCENT_THEMES = [
  {
    accentBar: "bg-blue-600", ring: "hover:ring-blue-500/40", headerDark: "bg-neutral-900 dark:bg-neutral-950", badgeDarkBg: "bg-blue-900/40", badgeDarkText: "text-blue-400", badgeLightText: "group-hover:text-blue-600", badgeLightBg: "group-hover:bg-blue-50",
    // Warna font untuk Card 0 (Ringkasan Utama Tim) - hitam saat terang, putih saat gelap
    totalPenjualan: "text-neutral-900 dark:text-white", rataRataTim: "text-neutral-900 dark:text-white", vsTarget: "text-indigo-600 dark:text-indigo-400", vsBulanLalu: "text-purple-600 dark:text-purple-400", vsTahunLalu: "text-teal-600 dark:text-teal-400", bbTim: "text-rose-600 dark:text-rose-400",
    // Warna font untuk Card 5 (Kinerja Akumulatif)
    akm: "text-sky-700 dark:text-sky-300", rata2Table: "text-emerald-700 dark:text-emerald-300", vsTgtTable: "text-indigo-600 dark:text-indigo-400", vsBlnTable: "text-purple-600 dark:text-purple-400", vsThnTable: "text-teal-600 dark:text-teal-400", bbTable: "text-rose-600 dark:text-rose-400",
  },
  {
    accentBar: "bg-emerald-600", ring: "hover:ring-emerald-500/40", headerDark: "bg-emerald-950", badgeDarkBg: "bg-emerald-900/40", badgeDarkText: "text-emerald-400", badgeLightText: "group-hover:text-emerald-600", badgeLightBg: "group-hover:bg-emerald-50",
    totalPenjualan: "text-neutral-900 dark:text-white", rataRataTim: "text-neutral-900 dark:text-white", vsTarget: "text-indigo-600 dark:text-indigo-400", vsBulanLalu: "text-fuchsia-600 dark:text-fuchsia-400", vsTahunLalu: "text-orange-600 dark:text-orange-400", bbTim: "text-red-600 dark:text-red-400",
    akm: "text-sky-700 dark:text-sky-300", rata2Table: "text-emerald-700 dark:text-emerald-300", vsTgtTable: "text-indigo-600 dark:text-indigo-400", vsBlnTable: "text-fuchsia-600 dark:text-fuchsia-400", vsThnTable: "text-orange-600 dark:text-orange-400", bbTable: "text-red-600 dark:text-red-400",
  },
  {
    accentBar: "bg-indigo-600", ring: "hover:ring-indigo-500/40", headerDark: "bg-indigo-950", badgeDarkBg: "bg-indigo-900/40", badgeDarkText: "text-indigo-400", badgeLightText: "group-hover:text-indigo-600", badgeLightBg: "group-hover:bg-indigo-50",
    totalPenjualan: "text-neutral-900 dark:text-white", rataRataTim: "text-neutral-900 dark:text-white", vsTarget: "text-cyan-600 dark:text-cyan-400", vsBulanLalu: "text-lime-600 dark:text-lime-400", vsTahunLalu: "text-pink-600 dark:text-pink-400", bbTim: "text-amber-600 dark:text-amber-400",
    akm: "text-sky-700 dark:text-sky-300", rata2Table: "text-emerald-700 dark:text-emerald-300", vsTgtTable: "text-cyan-600 dark:text-cyan-400", vsBlnTable: "text-lime-600 dark:text-lime-400", vsThnTable: "text-pink-600 dark:text-pink-400", bbTable: "text-amber-600 dark:text-amber-400",
  },
];

const CARD_STYLE_STORAGE_KEY = "dashboardCardStyles_v1";

function loadCardStyles(): number[] {
  try {
    const raw = localStorage.getItem(CARD_STYLE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Migrasikan preferensi lama: buang Target vs Actual, pertahankan gaya Kinerja Akumulatif.
        const migrated = parsed.length === 7 ? [...parsed.slice(0, 5), parsed[6]] : parsed;
        if (migrated.length === 6) {
          // Abaikan varian lama yang tersimpan agar Tren Harian selalu memakai tampilan JOC.
          migrated[3] = 0;
          return migrated;
        }
      }
    }
  } catch {
    // ignore
  }
  return [0, 0, 0, 0, 0, 0];
}

// Tombol kecil untuk mengganti tampilan (jenis grafik + tema warna) sebuah card
function StyleToggleButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      title="Ganti Tampilan Card"
      className="text-[9px] font-bold text-brand-700 dark:text-brand-300 hover:text-white bg-brand-50 dark:bg-brand-950/40 hover:bg-brand-600 px-1.5 py-0.5 rounded transition-all inline-flex items-center gap-1 cursor-pointer border border-brand-200 dark:border-brand-800 hover:border-brand-600 whitespace-nowrap"
    >
      <Palette className="w-2.5 h-2.5" /> <span className="hidden sm:inline">Ganti Tampilan</span>
    </button>
  );
}

interface ManagerDashboardTabProps {
  dashboardData: DashboardData | null;
  targetTKU: any;
  cleanYlName?: (nama: string) => string;
  currentMonthTotal: (perYL: Record<string, any>, key: "yo" | "om" | "os" | "yt") => number;
  calculateSektorTotals?: (dashboard: DashboardData | null) => any;
  /** Bulan aktif (YYYY-MM) — dipakai grafik tren untuk menandai hari Minggu. */
  month?: string;
}

function ManagerDashboardTabInner({
  dashboardData,
  targetTKU,
  cleanYlName,
  currentMonthTotal,
  calculateSektorTotals,
  month,
}: ManagerDashboardTabProps) {
  const safeClean = (name: string) => typeof cleanYlName === "function" ? cleanYlName(name) : (name || "");
  const [fullscreenCardIndex, setFullscreenCardIndex] = useState<number | null>(null);
  const [cardStyleIdx, setCardStyleIdx] = useState<number[]>(loadCardStyles);
  const lastTapRef = useRef<{ time: number; index: number }>({ time: 0, index: -1 });

  useEffect(() => {
    try {
      localStorage.setItem(CARD_STYLE_STORAGE_KEY, JSON.stringify(cardStyleIdx));
    } catch {
      // ignore
    }
  }, [cardStyleIdx]);

  const cycleCardStyle = (index: number) => {
    const numVariants = CARD_CHART_VARIANTS[index] || 1;
    const totalCombos = numVariants * ACCENT_THEMES.length;
    setCardStyleIdx(prev => {
      const next = [...prev];
      next[index] = (next[index] + 1) % totalCombos;
      return next;
    });
  };

  // Mengurai index gabungan menjadi { variantIdx (jenis grafik), theme (warna) }
  const getCardStyle = (index: number) => {
    const numVariants = CARD_CHART_VARIANTS[index] || 1;
    const combo = cardStyleIdx[index] || 0;
    const variantIdx = combo % numVariants;
    const themeIdx = Math.floor(combo / numVariants) % ACCENT_THEMES.length;
    return {
      variantIdx,
      accent: ACCENT_THEMES[themeIdx],
      chartTheme: DASHBOARD_THEMES[themeIdx % DASHBOARD_THEMES.length],
    };
  };

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Ketuk 2x untuk layar penuh — dibuat TIDAK terlalu sensitif:
  // - hanya ketukan "bersih" (jari tidak bergeser, singkat); scroll/usap tidak dihitung
  // - kedua ketukan harus di titik yang berdekatan dan cepat berurutan
  // - ketukan pada tombol, pilihan, input, atau grafik (memilih tanggal) diabaikan
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isInteractiveTarget = (target: EventTarget | null) =>
    !!(target as HTMLElement | null)?.closest?.(
      'button, a, input, select, textarea, label, svg[role="img"], .recharts-wrapper, [data-no-fullscreen]'
    );

  const handleCardTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = t ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
  };

  const handleCardTouchEnd = (index: number, e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const t = e.changedTouches[0];
    const now = Date.now();
    const resetTap = () => { lastTapRef.current = { time: 0, index: -1 }; };
    if (!start || !t || isInteractiveTarget(e.target)) { resetTap(); return; }
    const moved = Math.hypot(t.clientX - start.x, t.clientY - start.y);
    if (moved > 10 || now - start.t > 250) { resetTap(); return; }
    const last = lastTapRef.current;
    const near = Math.hypot(t.clientX - lastTapPosRef.current.x, t.clientY - lastTapPosRef.current.y) < 40;
    if (last.index === index && now - last.time < 300 && near) {
      setFullscreenCardIndex(index);
      resetTap();
    } else {
      lastTapRef.current = { time: now, index };
      lastTapPosRef.current = { x: t.clientX, y: t.clientY };
    }
  };

  const handleCardDoubleClick = (index: number, e: React.MouseEvent) => {
    if (isInteractiveTarget(e.target)) return;
    setFullscreenCardIndex(index);
  };

  const cardsCount = 6;

  const handleNextCard = () => {
    setFullscreenCardIndex(prev => (prev === null ? null : (prev + 1) % cardsCount));
  };

  const handlePrevCard = () => {
    setFullscreenCardIndex(prev => (prev === null ? null : (prev - 1 + cardsCount) % cardsCount));
  };

  // Keyboard navigation for Fullscreen Modal
  useEffect(() => {
    if (fullscreenCardIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenCardIndex(null);
      if (e.key === "ArrowRight") handleNextCard();
      if (e.key === "ArrowLeft") handlePrevCard();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreenCardIndex]);

  // Touch swipe handling for Fullscreen Modal
  const handleModalTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleModalTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        handleNextCard();
      } else {
        handlePrevCard();
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // ---- Layar penuh landscape: skalakan isi agar MUAT SATU LAYAR (tanpa scroll) ----
  // Skala dicari lewat pengukuran langsung (binary search) sehingga tinggi akhir pas dengan area
  // yang tersedia, lebar dikompensasi agar tetap memenuhi layar. Style diterapkan langsung ke DOM
  // (bukan lewat state) supaya tidak terjadi osilasi. Portrait tetap normal & bisa di-scroll.
  const fitOuterRef = useRef<HTMLDivElement>(null);
  const fitSizerRef = useRef<HTMLDivElement>(null);
  const fitInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = fitOuterRef.current;
    const sizer = fitSizerRef.current;
    const inner = fitInnerRef.current;
    if (fullscreenCardIndex === null || !outer || !sizer || !inner) return;

    const MIN_SCALE = 0.45;

    const reset = () => {
      inner.style.width = "";
      inner.style.transform = "";
      inner.style.transformOrigin = "";
      inner.style.flex = "";
      sizer.style.height = "";
      sizer.style.flex = "";
      sizer.style.overflow = "";
    };

    const compute = () => {
      reset();
      if (!(window.innerWidth > window.innerHeight)) return; // hanya landscape

      const cs = getComputedStyle(outer);
      const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const padH = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const sz = getComputedStyle(sizer);
      const marV = (parseFloat(sz.marginTop) || 0) + (parseFloat(sz.marginBottom) || 0);
      const availH = outer.clientHeight - padV - marV - 2;
      const availW = outer.clientWidth - padH;
      if (availH <= 0 || availW <= 0) return;

      // Ukur tinggi isi pada skala s (lebar dikompensasi = availW / s)
      const visibleHeightAt = (scale: number) => {
        inner.style.flex = "none";
        inner.style.width = `${availW / scale}px`;
        return inner.offsetHeight * scale;
      };

      let scale = 1;
      if (visibleHeightAt(1) > availH) {
        let lo = MIN_SCALE;
        let hi = 1;
        if (visibleHeightAt(MIN_SCALE) <= availH) {
          for (let i = 0; i < 9; i++) {
            const mid = (lo + hi) / 2;
            if (visibleHeightAt(mid) <= availH) lo = mid;
            else hi = mid;
          }
        }
        scale = lo;
      }

      if (scale >= 0.999) {
        reset();
        return;
      }
      const h = visibleHeightAt(scale);
      inner.style.transform = `scale(${scale})`;
      inner.style.transformOrigin = "top left";
      sizer.style.flex = "none";
      sizer.style.height = `${Math.ceil(h)}px`;
      sizer.style.overflow = "hidden";
    };

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    schedule();
    const t1 = window.setTimeout(schedule, 300); // setelah grafik/font selesai
    const t2 = window.setTimeout(schedule, 1000);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      ro.observe(outer);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      ro?.disconnect();
      reset();
    };
  }, [fullscreenCardIndex, dashboardData]);

  if (!dashboardData) {
    return (
      <div className="p-12 text-center text-neutral-500 dark:text-neutral-400 font-bold bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col items-center justify-center gap-3 my-4">
        <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin" />
        <span>Memuat Data Dashboard...</span>
      </div>
    );
  }

  // Define details for each of the 6 dashboard cards
  const cardTitles = [
    "Ringkasan Utama Tim",
    "Komposisi & Performa Produk",
    "Potensi Tim",
    "Tren Penjualan",
    "Ranking Penjualan Antar YL",
    "Kinerja Akumulatif & Rata-Rata YL",
  ];

  // Card Content Renderers
  const renderCardContent = (index: number, isFullscreen: boolean = false) => {
    const style = getCardStyle(index);
    switch (index) {
      case 0: { // 1. Gabungan: Total Penjualan, Rata2 Tim, Capaian vs Perbandingan, Ringkasan Operasional
        const bbTimPct = ((dashboardData?.bbTimRaw || 0) / ((dashboardData?.totalPenjualan || 0) + (dashboardData?.bbTimRaw || 0) || 1)) * 100;
        const akmDays = dashboardData?.hariAktif || 0;
        const akmVsTarget = (dashboardData?.totalPenjualan || 0) - ((dashboardData?.targetTim?.target || 0) * akmDays);
        const akmVsBulanLalu = (dashboardData?.totalPenjualan || 0) - ((dashboardData?.targetTim?.bulanLalu || 0) * akmDays);
        const akmVsTahunLalu = (dashboardData?.totalPenjualan || 0) - ((dashboardData?.targetTim?.tahunLalu || 0) * akmDays);
        const formatAkmDifference = (value: number) => `${value > 0 ? "+" : ""}${formatTruncated(value)} btl`;
        return (
          <div className={`bd-card relative text-neutral-900 dark:text-neutral-100 ${isFullscreen ? "w-full p-2 sm:p-4 border-0 shadow-none flex flex-col justify-start gap-3 sm:gap-5 my-0" : "p-3 sm:p-5 space-y-3 sm:space-y-4 overflow-hidden"}`}>
            {!isFullscreen && (
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-2 sm:pb-3">
                <div className="flex items-center gap-2">
                  <h2 className="bd-title uppercase flex items-center gap-1.5">
                    <MenuTitleIcon id="dashboard" className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    Ringkasan Utama Tim
                  </h2>
                </div>
                <div className="flex items-center gap-1.5">
                  <StyleToggleButton onClick={() => cycleCardStyle(0)} />
                  <span className="text-[9px] font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 px-1.5 py-0.5 rounded hidden sm:inline-flex items-center gap-1">
                    <Maximize2 className="w-2.5 h-2.5" /> 2x Layar Penuh
                  </span>
                </div>
              </div>
            )}

            {/* Total Penjualan & Rata-Rata Tim */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <div className={`bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-200/60 dark:border-blue-900/40 relative overflow-hidden ${isFullscreen ? "p-1 sm:p-2" : "p-2 sm:p-3"}`}>
                <span className="bd-label text-blue-900 dark:text-blue-300 block">Total Penjualan Tim</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className={`${isFullscreen ? "text-lg sm:text-2xl" : "text-xl sm:text-2xl"} font-black ${style.accent.totalPenjualan} font-mono tabular-nums`}>
                    {Math.trunc(dashboardData?.totalPenjualan || 0).toLocaleString("id-ID")}
                  </span>
                  <span className="text-[10px] sm:text-xs font-bold text-neutral-500 dark:text-neutral-400">btl</span>
                </div>
                <span className="inline-block mt-0.5 text-[9px] sm:text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                  Bulan Berjalan
                </span>
              </div>

              <div className={`bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/60 dark:border-amber-900/40 relative overflow-hidden ${isFullscreen ? "p-1 sm:p-2" : "p-2 sm:p-3"}`}>
                <span className="bd-label text-amber-900 dark:text-amber-300 block">Rata-Rata Tim</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className={`${isFullscreen ? "text-lg sm:text-2xl" : "text-xl sm:text-2xl"} font-black ${rata2ColorClass(dashboardData?.rataHarian || 0)} font-mono tabular-nums`}>
                    {Math.trunc(dashboardData?.rataHarian || 0).toLocaleString("id-ID")}
                  </span>
                  <span className="text-[10px] sm:text-xs font-bold text-neutral-500 dark:text-neutral-400">btl/hr</span>
                </div>
                <span className="block mt-0.5 text-[9px] sm:text-[9px] text-neutral-500 dark:text-neutral-400 font-bold truncate">
                  Divisor {dashboardData?.hariAktif || 0} hari aktif
                </span>
              </div>
            </div>

            {/* Capaian vs Perbandingan */}
            <div>
              <span className="bd-label block mb-1">
                Capaian vs Perbandingan
              </span>
              <div className="grid grid-cols-3 gap-1 sm:gap-2">
                <div className={`bd-subcard text-center ${isFullscreen ? "p-1 sm:p-1.5" : "p-1.5 sm:p-3"}`}>
                  <span className="bd-label block">vs Target</span>
                  <div className="mt-0.5">
                    <span className={`${isFullscreen ? "text-xs sm:text-base" : "text-base sm:text-xl"} font-black ${vsPctColorClass(dashboardData?.vsTarget || 0)} font-mono tabular-nums block`}>
                      {Math.trunc(dashboardData?.vsTarget || 0)}%
                    </span>
                    <span className={`${isFullscreen ? "text-[9px] sm:text-[10px]" : "text-[10px] sm:text-xs"} font-bold ${vsPctColorClass(dashboardData?.vsTarget || 0)} font-mono tabular-nums block whitespace-nowrap`}>
                      {formatAkmDifference(akmVsTarget)}
                    </span>
                  </div>
                </div>
                <div className={`bd-subcard text-center ${isFullscreen ? "p-1 sm:p-1.5" : "p-1.5 sm:p-3"}`}>
                  <span className="bd-label block">vs Bulan Lalu</span>
                  <div className="mt-0.5">
                    <span className={`${isFullscreen ? "text-xs sm:text-base" : "text-base sm:text-xl"} font-black ${vsPctColorClass(dashboardData?.vsBulanLalu || 0)} font-mono tabular-nums block`}>
                      {Math.trunc(dashboardData?.vsBulanLalu || 0)}%
                    </span>
                    <span className={`${isFullscreen ? "text-[9px] sm:text-[10px]" : "text-[10px] sm:text-xs"} font-bold ${vsPctColorClass(dashboardData?.vsBulanLalu || 0)} font-mono tabular-nums block whitespace-nowrap`}>
                      {formatAkmDifference(akmVsBulanLalu)}
                    </span>
                  </div>
                </div>
                <div className={`bd-subcard text-center ${isFullscreen ? "p-1 sm:p-1.5" : "p-1.5 sm:p-3"}`}>
                  <span className="bd-label block">vs Tahun Lalu</span>
                  <div className="mt-0.5">
                    <span className={`${isFullscreen ? "text-xs sm:text-base" : "text-base sm:text-xl"} font-black ${vsPctColorClass(dashboardData?.vsTahunLalu || 0)} font-mono tabular-nums block`}>
                      {Math.trunc(dashboardData?.vsTahunLalu || 0)}%
                    </span>
                    <span className={`${isFullscreen ? "text-[9px] sm:text-[10px]" : "text-[10px] sm:text-xs"} font-bold ${vsPctColorClass(dashboardData?.vsTahunLalu || 0)} font-mono tabular-nums block whitespace-nowrap`}>
                      {formatAkmDifference(akmVsTahunLalu)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ringkasan Operasional */}
            <div>
              <span className="bd-label block mb-1">
                Ringkasan Operasional
              </span>
              <div className="grid grid-cols-3 gap-1 sm:gap-2">
                <div className={`bd-subcard text-center ${isFullscreen ? "p-1 sm:p-1.5" : "p-1.5 sm:p-3"}`}>
                  <span className="bd-label block truncate">Sales/YL/Hari</span>
                  <span className={`${isFullscreen ? "text-xs sm:text-sm" : "text-sm sm:text-base"} font-black text-neutral-900 dark:text-white font-mono tabular-nums mt-0.5 block`}>
                    {Math.trunc(dashboardData?.salesPerYl || 0)} btl
                  </span>
                </div>
                <div className={`bd-subcard text-center ${isFullscreen ? "p-1 sm:p-1.5" : "p-1.5 sm:p-3"}`}>
                  <span className="bd-label block">JWP</span>
                  <span className={`${isFullscreen ? "text-xs sm:text-sm" : "text-sm sm:text-base"} font-black text-neutral-900 dark:text-white font-mono tabular-nums mt-0.5 block`}>
                    {dashboardData?.jwp || 0}
                  </span>
                  {(() => {
                    // EWP = (JWP - frekuensi absen) / JWP x 100%
                    const jwpVal = Number(dashboardData?.jwp) || 0;
                    const frekVal = Number(dashboardData?.frekuensiAbsen) || 0;
                    const ewp = jwpVal > 0 ? Math.max(0, ((jwpVal - frekVal) / jwpVal) * 100) : 0;
                    return (
                      <span className={`${isFullscreen ? "text-[9px] sm:text-[10px]" : "text-[10px] sm:text-xs"} font-bold text-neutral-600 dark:text-neutral-300 font-mono tabular-nums block whitespace-nowrap mt-0.5`}>
                        EWP {ewp.toFixed(1).replace(".", ",")}%
                      </span>
                    );
                  })()}
                </div>
                <div className={`bd-subcard text-center ${isFullscreen ? "p-1 sm:p-1.5" : "p-1.5 sm:p-3"}`}>
                  <span className="bd-label block">AKM BB (btl) / BB %</span>
                  <div className={`${isFullscreen ? "text-[10px] sm:text-xs" : "text-xs sm:text-sm"} flex items-baseline justify-center gap-1 font-black font-mono tabular-nums mt-0.5 whitespace-nowrap`}>
                    <span className={bbColorClass(bbTimPct)}>
                      {formatTruncated(dashboardData?.bbTimRaw || 0)}
                    </span>
                    <span className="text-neutral-400 dark:text-neutral-500">/</span>
                    <span className={bbColorClass(bbTimPct)}>
                      {formatPercentTruncated(bbTimPct, 1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Data Absensi */}
            <div>
              <span className="text-[9px] sm:text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-0.5 mt-2">
                Data Absensi (0 Sales)
              </span>
              <div className="grid grid-cols-2 gap-1 sm:gap-2">
                <div className={`bg-rose-50/70 dark:bg-rose-950/30 rounded-xl text-center border border-rose-200/60 dark:border-rose-900/40 ${isFullscreen ? "p-1 sm:p-1.5" : "p-1.5 sm:p-3"}`}>
                  <span className="text-[9px] sm:text-[10px] font-bold text-rose-500 dark:text-rose-400 uppercase block">Total YL Absen</span>
                  <span className={`${isFullscreen ? "text-xs sm:text-sm" : "text-sm sm:text-base"} font-black text-neutral-900 dark:text-white font-mono tabular-nums mt-0.5 block`}>
                    {dashboardData?.ylAbsen || 0} YL
                  </span>
                </div>
                <div className={`bg-rose-50/70 dark:bg-rose-950/30 rounded-xl text-center border border-rose-200/60 dark:border-rose-900/40 ${isFullscreen ? "p-1 sm:p-1.5" : "p-1.5 sm:p-3"}`}>
                  <span className="text-[9px] sm:text-[10px] font-bold text-rose-500 dark:text-rose-400 uppercase block">Frekuensi</span>
                  <span className={`${isFullscreen ? "text-xs sm:text-sm" : "text-sm sm:text-base"} font-black text-neutral-900 dark:text-white font-mono tabular-nums mt-0.5 block`}>
                    {dashboardData?.frekuensiAbsen || 0} Kali
                  </span>
                </div>
              </div>
            </div>

            {/* Distribusi Rata-Rata Harian YL */}
            {(() => {
              const yls = Object.values(dashboardData?.perYL || {});
              let cUnder250 = 0;
              let c250 = 0;
              let c280 = 0;
              let c300 = 0;
              let c330 = 0;
              let c350 = 0;

              yls.forEach((y: any) => {
                const r = Math.trunc(Number(y?.rata2) || 0);
                if (r < 250) cUnder250++;
                else if (r < 280) c250++;
                else if (r < 300) c280++;
                else if (r < 330) c300++;
                else if (r < 350) c330++;
                else c350++;
              });

              return (
                <div>
                  <div className="flex items-center justify-between mb-1 mt-2">
                    <span className="text-[9px] sm:text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                      Distribusi Rata-Rata Harian YL
                    </span>
                    <span className="text-[9px] sm:text-[10px] font-bold text-neutral-400">
                      Total {yls.length} YL
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 sm:gap-1.5">
                    {/* < 250 */}
                    <div className={`p-1 sm:p-2 text-center rounded-xl transition-colors ${cUnder250 > 0 ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 shadow-xs" : "bd-subcard"}`}>
                      <span className="text-[9px] sm:text-[9px] font-bold uppercase block text-red-600 dark:text-red-400">
                        &lt; 250
                      </span>
                      <span className={`text-xs sm:text-sm font-bold block mt-0.5 ${cUnder250 > 0 ? "text-red-700 dark:text-red-300" : "text-neutral-400 dark:text-neutral-500"}`}>
                        {cUnder250} <span className="text-[9px] font-bold">YL</span>
                      </span>
                    </div>

                    {/* > 250 (250-279) */}
                    <div className={`p-1 sm:p-2 text-center rounded-xl transition-colors ${c250 > 0 ? "bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900/50 shadow-xs" : "bd-subcard"}`}>
                      <span className="text-[9px] sm:text-[9px] font-bold uppercase block text-yellow-700 dark:text-yellow-300">
                        &gt; 250
                      </span>
                      <span className={`text-xs sm:text-sm font-bold block mt-0.5 ${c250 > 0 ? "text-yellow-800 dark:text-yellow-300" : "text-neutral-400 dark:text-neutral-500"}`}>
                        {c250} <span className="text-[9px] font-bold">YL</span>
                      </span>
                    </div>

                    {/* > 280 (280-299) */}
                    <div className={`p-1 sm:p-2 text-center rounded-xl transition-colors ${c280 > 0 ? "bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 shadow-xs" : "bd-subcard"}`}>
                      <span className="text-[9px] sm:text-[9px] font-bold uppercase block text-orange-700 dark:text-orange-300">
                        &gt; 280
                      </span>
                      <span className={`text-xs sm:text-sm font-bold block mt-0.5 ${c280 > 0 ? "text-orange-800 dark:text-orange-300" : "text-neutral-400 dark:text-neutral-500"}`}>
                        {c280} <span className="text-[9px] font-bold">YL</span>
                      </span>
                    </div>

                    {/* > 300 (300-329) */}
                    <div className={`p-1 sm:p-2 text-center rounded-xl transition-colors ${c300 > 0 ? "bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 shadow-xs" : "bd-subcard"}`}>
                      <span className="text-[9px] sm:text-[9px] font-bold uppercase block text-purple-700 dark:text-purple-300">
                        &gt; 300
                      </span>
                      <span className={`text-xs sm:text-sm font-bold block mt-0.5 ${c300 > 0 ? "text-purple-800 dark:text-purple-300" : "text-neutral-400 dark:text-neutral-500"}`}>
                        {c300} <span className="text-[9px] font-bold">YL</span>
                      </span>
                    </div>

                    {/* > 330 (330-349) */}
                    <div className={`p-1 sm:p-2 text-center rounded-xl transition-colors ${c330 > 0 ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 shadow-xs" : "bd-subcard"}`}>
                      <span className="text-[9px] sm:text-[9px] font-bold uppercase block text-green-700 dark:text-green-300">
                        &gt; 330
                      </span>
                      <span className={`text-xs sm:text-sm font-bold block mt-0.5 ${c330 > 0 ? "text-green-800 dark:text-green-300" : "text-neutral-400 dark:text-neutral-500"}`}>
                        {c330} <span className="text-[9px] font-bold">YL</span>
                      </span>
                    </div>

                    {/* > 350 (>=350) */}
                    <div className={`p-1 sm:p-2 text-center rounded-xl transition-colors ${c350 > 0 ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 shadow-xs" : "bd-subcard"}`}>
                      <span className="text-[9px] sm:text-[9px] font-bold uppercase block text-blue-700 dark:text-blue-300">
                        &gt; 350
                      </span>
                      <span className={`text-xs sm:text-sm font-bold block mt-0.5 ${c350 > 0 ? "text-blue-800 dark:text-blue-300" : "text-neutral-400 dark:text-neutral-500"}`}>
                        {c350} <span className="text-[9px] font-bold">YL</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      }

      case 1: // 2. Gabungan: Komposisi Terjual & Performa Rata-Rata Produk
        return (
          <div className={`bd-card p-3 sm:p-5 text-neutral-900 dark:text-neutral-100 ${isFullscreen ? "w-full min-h-full p-2 sm:p-3 border-0 shadow-none overflow-y-auto flex flex-col justify-center my-auto" : ""}`}>
            {!isFullscreen && (
              <div className="flex items-center justify-between mb-3 border-b border-[var(--line)] pb-2 sm:pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="bd-title uppercase">
                    Komposisi & Performa Rata-Rata Produk
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <StyleToggleButton onClick={() => cycleCardStyle(1)} />
                  <span className="text-[9px] font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 px-1.5 py-0.5 rounded hidden sm:inline-flex items-center gap-1">
                    <Maximize2 className="w-2.5 h-2.5" /> 2x Layar Penuh
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              {/* Komposisi Produk Chart */}
              <div>
                <h4 className="bd-label mb-1 text-center sm:text-left block">
                  Komposisi Produk Terjual
                </h4>
                <KomposisiProdukChart
                  yo={currentMonthTotal(dashboardData?.perYL || {}, "yo")}
                  om={currentMonthTotal(dashboardData?.perYL || {}, "om")}
                  os={currentMonthTotal(dashboardData?.perYL || {}, "os")}
                  yt={currentMonthTotal(dashboardData?.perYL || {}, "yt")}
                  height={isFullscreen ? 170 : 220}
                  chartType={style.variantIdx === 1 ? "bar" : "donut"}
                  colors={FIXED_PRODUCT_COLORS}
                />
              </div>

              {/* Performa Rata-Rata Produk Table */}
              <div className="bd-subcard overflow-hidden">
                <div className="p-2.5 bg-[var(--bg-header)] text-[var(--ink)] flex items-center justify-between border-b border-[var(--line)]">
                  <h4 className="bd-label text-[var(--ink)] font-bold">Performa Rata-Rata Produk</h4>
                  <span className="text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded border border-red-200 dark:border-red-900/50">Jember 1</span>
                </div>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg-inset)] border-b border-[var(--line)] text-[var(--ink-2)] font-semibold uppercase text-[10px]">
                      <th className="p-2">Produk</th>
                      <th className="p-2 text-right">Rata-Rata Penjualan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--divider)] font-bold">
                    <tr className="hover:bg-[var(--bg-hover)]">
                      <td className="p-2 text-red-600 dark:text-red-400 font-bold">YO Original</td>
                      <td className="p-2 text-right text-neutral-900 dark:text-white font-mono tabular-nums font-bold">{Math.trunc(dashboardData?.rataItem?.YO || 0)} btl</td>
                    </tr>
                    <tr className="hover:bg-[var(--bg-hover)]">
                      <td className="p-2 text-amber-500 font-bold">OM Mango</td>
                      <td className="p-2 text-right text-neutral-900 dark:text-white font-mono tabular-nums font-bold">{Math.trunc(dashboardData?.rataItem?.OM || 0)} btl</td>
                    </tr>
                    <tr className="hover:bg-[var(--bg-hover)]">
                      <td className="p-2 text-pink-500 font-bold">OS Stroberi</td>
                      <td className="p-2 text-right text-neutral-900 dark:text-white font-mono tabular-nums font-bold">{Math.trunc(dashboardData?.rataItem?.OS || 0)} btl</td>
                    </tr>
                    <tr className="hover:bg-[var(--bg-hover)]">
                      <td className="p-2 text-blue-600 dark:text-blue-400 font-bold">YT Light</td>
                      <td className="p-2 text-right text-neutral-900 dark:text-white font-mono tabular-nums font-bold">{Math.trunc(dashboardData?.rataItem?.YT || 0)} btl</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 2: // 3. Potensi Tim
        return (
          <div className={`bd-card p-3 sm:p-5 text-neutral-900 dark:text-neutral-100 ${isFullscreen ? "w-full min-h-full p-2 sm:p-3 border-0 shadow-none flex flex-col justify-center my-auto" : ""}`}>
            {!isFullscreen && (
              <div className="flex items-center justify-between mb-2 sm:mb-3 border-b border-[var(--line)] pb-2">
                <h3 className="bd-title uppercase">
                  Potensi Tim
                </h3>
                <div className="flex items-center gap-1.5">
                  <StyleToggleButton onClick={() => cycleCardStyle(2)} />
                  <span className="text-[9px] font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 px-1.5 py-0.5 rounded hidden sm:inline-flex items-center gap-1">
                    <Maximize2 className="w-2.5 h-2.5" /> 2x Layar Penuh
                  </span>
                </div>
              </div>
            )}
            <div className={isFullscreen ? "w-full h-[220px] sm:h-[280px]" : "w-full h-[220px] sm:h-[260px]"}>
              <SektorTimChart
                data={typeof calculateSektorTotals === "function" ? calculateSektorTotals(dashboardData) : []}
                chartType={style.variantIdx === 1 ? "donut" : "bar"}
                colors={style.chartTheme.sektor}
              />
            </div>
          </div>
        );

      case 3: // 4. Tren Penjualan Harian
        return (
          <div className={`bd-card p-3 sm:p-5 text-neutral-900 dark:text-neutral-100 ${isFullscreen ? "w-full min-h-full p-2 sm:p-3 border-0 shadow-none flex flex-col justify-center my-auto" : ""}`}>
            {!isFullscreen && (
              <div className="flex items-center justify-between mb-2 sm:mb-3 border-b border-[var(--line)] pb-2">
                <h3 className="bd-title uppercase">
                  Tren Penjualan
                </h3>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 px-1.5 py-0.5 rounded hidden sm:inline-flex items-center gap-1">
                    <Maximize2 className="w-2.5 h-2.5" /> 2x Layar Penuh
                  </span>
                </div>
              </div>
            )}
            {(() => {
              const trenData = (dashboardData?.grafikHarian?.tanggal || []).map((t, idx, arr) => {
                const currentDay = parseInt(t, 10) || 0;
                const prevDay = idx > 0 ? (parseInt(arr[idx - 1], 10) || 0) : 0;
                const gap = idx > 0 ? Math.max(1, currentDay - prevDay) : Math.max(1, currentDay);

                const baseTarget = dashboardData?.targetTim?.target || targetTKU?.target || 0;
                const baseBulanLalu = dashboardData?.targetTim?.bulanLalu || targetTKU?.bln_lalu || 0;
                const baseTahunLalu = dashboardData?.targetTim?.tahunLalu || targetTKU?.thn_lalu || 0;

                return {
                  tanggal: t,
                  penjualan: dashboardData?.grafikHarian?.penjualan?.[idx] || 0,
                  balikBotol: dashboardData?.grafikHarian?.balikBotol?.[idx] || 0,
                  target: Math.round(baseTarget) * gap,
                  bulanLalu: Math.round(baseBulanLalu) * gap,
                  tahunLalu: Math.round(baseTahunLalu) * gap
                };
              });
              return <TrenHarianJocChart data={trenData} month={month} />;
            })()}
          </div>
        );

      case 4: // 5. Ranking Penjualan Antar YL
        return (
          <div className={`bd-card p-3 sm:p-5 text-neutral-900 dark:text-neutral-100 ${isFullscreen ? "w-full min-h-full p-2 sm:p-3 border-0 shadow-none flex flex-col justify-center my-auto" : ""}`}>
            {!isFullscreen && (
              <div className="flex items-center justify-between mb-2 sm:mb-3 border-b border-[var(--line)] pb-2">
                <h3 className="bd-title uppercase">
                  Ranking Penjualan Antar YL
                </h3>
                <div className="flex items-center gap-1.5">
                  <StyleToggleButton onClick={() => cycleCardStyle(4)} />
                  <span className="text-[9px] font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 px-1.5 py-0.5 rounded hidden sm:inline-flex items-center gap-1">
                    <Maximize2 className="w-2.5 h-2.5" /> 2x Layar Penuh
                  </span>
                </div>
              </div>
            )}
            <div className={isFullscreen ? "w-full min-h-[280px] sm:min-h-[320px]" : "w-full min-h-[280px] sm:min-h-[320px]"}>
              <RankingYLChart
                data={Object.values(dashboardData?.perYL || {}).map(y => ({ nama: safeClean(y.nama), akumulasi: y.akumulasi }))}
                isCompact={isFullscreen}
                rankingBaseColor={style.chartTheme.rankingBase}
                podiumColors={style.chartTheme.rankingPodium}
                chartType={style.variantIdx === 1 ? "vertical" : "horizontal"}
              />
            </div>
          </div>
        );

      case 5: // 6. Kinerja Akumulatif & Rata-Rata YL
        return (
          <div className={`bd-card overflow-hidden text-neutral-900 dark:text-neutral-100 ${isFullscreen ? "w-full min-h-full border-0 shadow-none flex flex-col justify-start my-auto bg-white dark:bg-neutral-900" : ""}`}>
            {!isFullscreen && (
              <div className="p-2.5 sm:p-3.5 bg-[var(--bg-header)] text-[var(--ink)] border-b border-[var(--line)] flex items-center justify-between shrink-0">
                <h3 className="bd-title uppercase">Kinerja Akumulatif & Rata-Rata YL</h3>
                <div className="flex items-center gap-2">
                  <StyleToggleButton onClick={() => cycleCardStyle(5)} />
                  <span className={`text-[9px] font-bold ${style.accent.badgeDarkText} ${style.accent.badgeDarkBg} px-1.5 py-0.5 rounded transition-all hidden sm:inline-flex items-center gap-1`}>
                    <Maximize2 className="w-2.5 h-2.5" /> 2x Layar Penuh
                  </span>
                  <span className="text-[10px] font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 px-2 py-0.5 rounded border border-brand-200 dark:border-brand-800 whitespace-nowrap">Jember 1</span>
                </div>
              </div>
            )}
            <div className={`overflow-x-auto overflow-y-auto ${isFullscreen ? "flex-1 min-h-0" : ""}`}>
              <table className="w-full text-left text-xs border-collapse min-w-[460px] sm:min-w-full">
                <thead className="sticky top-0 bg-[var(--bg-inset)] z-10 border-b border-[var(--line)]">
                  <tr className="text-[var(--ink-2)] font-semibold uppercase text-[10px]">
                    <th className={`bg-[var(--bg-inset)] whitespace-nowrap ${isFullscreen ? "p-1 sm:p-1.5 text-[9px] sm:text-[9px]" : "p-2 sm:p-3"}`}>Nama YL</th>
                    <th className={`text-right bg-[var(--bg-inset)] whitespace-nowrap ${isFullscreen ? "p-1 sm:p-1.5 text-[9px] sm:text-[9px]" : "p-2 sm:p-3"}`}>Akm</th>
                    <th className={`text-right bg-[var(--bg-inset)] whitespace-nowrap ${isFullscreen ? "p-1 sm:p-1.5 text-[9px] sm:text-[9px]" : "p-2 sm:p-3"}`}>Rata2/hr</th>
                    <th className={`text-right bg-[var(--bg-inset)] whitespace-nowrap ${isFullscreen ? "p-1 sm:p-1.5 text-[9px] sm:text-[9px]" : "p-2 sm:p-3"}`}>vs Tgt</th>
                    <th className={`text-right bg-[var(--bg-inset)] whitespace-nowrap ${isFullscreen ? "p-1 sm:p-1.5 text-[9px] sm:text-[9px]" : "p-2 sm:p-3"}`}>vs Bln</th>
                    <th className={`text-right bg-[var(--bg-inset)] whitespace-nowrap ${isFullscreen ? "p-1 sm:p-1.5 text-[9px] sm:text-[9px]" : "p-2 sm:p-3"}`}>vs Thn</th>
                    <th className={`text-right bg-[var(--bg-inset)] whitespace-nowrap ${isFullscreen ? "p-1 sm:p-1.5 text-[9px] sm:text-[9px]" : "p-2 sm:p-3"}`}>BB %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--divider)] font-bold">
                  {Object.values(dashboardData?.perYL || {}).map((y: any) => {
                    const vsTgt = y.targetYL > 0 ? Math.trunc((y.rata2 / y.targetYL) * 100) : 0;
                    const vsBln = y.bulanLaluYL > 0 ? Math.trunc((y.rata2 / y.bulanLaluYL) * 100) : 0;
                    const vsThn = y.tahunLaluYL > 0 ? Math.trunc((y.rata2 / y.tahunLaluYL) * 100) : 0;
                    const bbPctNum = (y.akumulasi + y.bbYL) > 0 ? (y.bbYL / (y.akumulasi + y.bbYL)) * 100 : 0;
                    const bbPct = formatTruncated(bbPctNum, 1, false);
                    return (
                      <tr key={y.nama} className="odd:bg-transparent even:bg-neutral-50/70 dark:even:bg-white/[0.03] text-neutral-900 dark:text-white transition-colors">
                        <td className={`truncate font-bold max-w-[100px] sm:max-w-[140px] ${isFullscreen ? "px-1 py-0.5 sm:px-1.5 sm:py-1 text-[10px] sm:text-xs" : "p-2 sm:p-3"}`}>{y.nama}</td>
                        <td className={`text-right ${style.accent.akm} font-bold font-mono tabular-nums whitespace-nowrap ${isFullscreen ? "px-1 py-0.5 sm:px-1.5 sm:py-1 text-[10px] sm:text-xs" : "p-2 sm:p-3"}`}>{y.akumulasi}</td>
                        <td className={`text-right ${rata2ColorClass(y.rata2)} font-bold font-mono tabular-nums whitespace-nowrap ${isFullscreen ? "px-1 py-0.5 sm:px-1.5 sm:py-1 text-[10px] sm:text-xs" : "p-2 sm:p-3"}`}>{Math.trunc(y.rata2)}</td>
                        <td className={`text-right ${vsPctColorClass(vsTgt)} font-mono tabular-nums whitespace-nowrap ${isFullscreen ? "px-1 py-0.5 sm:px-1.5 sm:py-1 text-[10px] sm:text-xs" : "p-2 sm:p-3"}`}>{vsTgt}%</td>
                        <td className={`text-right ${vsPctColorClass(vsBln)} font-mono tabular-nums whitespace-nowrap ${isFullscreen ? "px-1 py-0.5 sm:px-1.5 sm:py-1 text-[10px] sm:text-xs" : "p-2 sm:p-3"}`}>{vsBln}%</td>
                        <td className={`text-right ${vsPctColorClass(vsThn)} font-mono tabular-nums whitespace-nowrap ${isFullscreen ? "px-1 py-0.5 sm:px-1.5 sm:py-1 text-[10px] sm:text-xs" : "p-2 sm:p-3"}`}>{vsThn}%</td>
                        <td className={`text-right ${bbColorClass(bbPctNum)} font-mono tabular-nums whitespace-nowrap ${isFullscreen ? "px-1 py-0.5 sm:px-1.5 sm:py-1 text-[10px] sm:text-xs" : "p-2 sm:p-3"}`}>{bbPct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* FULLSCREEN MODAL SLIDER */}
      {fullscreenCardIndex !== null && (
        <div
          className="fixed inset-0 z-[9999] bg-neutral-950 p-1 sm:p-2 flex items-center justify-center select-none animate-in fade-in duration-200 overflow-hidden"
          onTouchStart={handleModalTouchStart}
          onTouchEnd={handleModalTouchEnd}
        >
          <div className="w-full h-full max-w-7xl mx-auto bg-white dark:bg-neutral-900 rounded-xl sm:rounded-2xl shadow-2xl p-1.5 sm:p-2.5 flex flex-col justify-between relative overflow-hidden text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-800">
            {/* Header INSIDE Card */}
            <div className="flex items-center justify-between pb-1 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="bg-red-600 text-white text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded shadow shrink-0">
                  {fullscreenCardIndex + 1} / {cardsCount}
                </span>
                <h3 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate">
                  {cardTitles[fullscreenCardIndex]}
                </h3>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="hidden lg:inline text-[10px] text-neutral-500 dark:text-neutral-400 font-bold bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800">
                  💡 Usap Layar (Swipe) ke Kiri / Kanan
                </span>
                <button
                  onClick={() => setFullscreenCardIndex(null)}
                  className="bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:scale-95 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 px-2 py-0.5 rounded font-bold text-xs flex items-center gap-1 transition-all cursor-pointer border border-neutral-300 dark:border-neutral-700"
                  title="Tutup Layar Penuh"
                >
                  <X className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                  <span className="hidden sm:inline">Tutup</span>
                </button>
              </div>
            </div>

            {/* Content Area INSIDE Card */}
            <div
              ref={fitOuterRef}
              className="flex-1 min-h-0 overflow-y-auto relative py-0.5 px-0.5 sm:px-2 flex flex-col"
            >
              {/* Active Card Content */}
              <div ref={fitSizerRef} className="w-full flex-1 flex flex-col justify-start my-1">
                <div ref={fitInnerRef} className="w-full flex-1 flex flex-col justify-start">
                  {renderCardContent(fullscreenCardIndex, true)}
                </div>
              </div>
            </div>

            {/* Footer Navigation INSIDE Card */}
            <div className="flex items-center justify-center pt-1 border-t border-neutral-100 dark:border-neutral-800 shrink-0">
              {/* Slide dots indicator */}
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-[200px] sm:max-w-none px-2 py-0.5">
                {Array.from({ length: cardsCount }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setFullscreenCardIndex(i)}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      i === fullscreenCardIndex ? "w-5 bg-red-600" : "w-1.5 bg-neutral-300 dark:bg-neutral-600 hover:bg-neutral-400"
                    }`}
                    title={cardTitles[i]}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD NORMAL VIEW */}
      {/* 1. Ringkasan Utama Tim (Card 0) */}
      <div
        onDoubleClick={(e) => handleCardDoubleClick(0, e)}
        onTouchStart={handleCardTouchStart}
        onTouchEnd={(e) => handleCardTouchEnd(0, e)}
        className={`cursor-pointer transition-all hover:ring-2 ${getCardStyle(0).accent.ring} rounded-2xl group select-none`}
        title="Ketuk 2x untuk Layar Penuh"
      >
        {renderCardContent(0)}
      </div>

      {/* 2. Komposisi & Performa Produk (Card 1) */}
      <div
        onDoubleClick={(e) => handleCardDoubleClick(1, e)}
        onTouchStart={handleCardTouchStart}
        onTouchEnd={(e) => handleCardTouchEnd(1, e)}
        className={`cursor-pointer transition-all hover:ring-2 ${getCardStyle(1).accent.ring} rounded-2xl group select-none`}
        title="Ketuk 2x untuk Layar Penuh"
      >
        {renderCardContent(1)}
      </div>

      {/* 3. Potensi Sektor Tim (Card 2) */}
      <div
        onDoubleClick={(e) => handleCardDoubleClick(2, e)}
        onTouchStart={handleCardTouchStart}
        onTouchEnd={(e) => handleCardTouchEnd(2, e)}
        className={`cursor-pointer transition-all hover:ring-2 ${getCardStyle(2).accent.ring} rounded-2xl group select-none`}
        title="Ketuk 2x untuk Layar Penuh"
      >
        {renderCardContent(2)}
      </div>

      {/* 4. Tren Penjualan Harian (Card 3) */}
      <div
        onDoubleClick={(e) => handleCardDoubleClick(3, e)}
        onTouchStart={handleCardTouchStart}
        onTouchEnd={(e) => handleCardTouchEnd(3, e)}
        className={`cursor-pointer transition-all hover:ring-2 ${getCardStyle(3).accent.ring} rounded-2xl group select-none`}
        title="Ketuk 2x untuk Layar Penuh"
      >
        {renderCardContent(3)}
      </div>

      {/* 5. Ranking Penjualan Antar YL (Card 4) */}
      <div
        onDoubleClick={(e) => handleCardDoubleClick(4, e)}
        onTouchStart={handleCardTouchStart}
        onTouchEnd={(e) => handleCardTouchEnd(4, e)}
        className={`cursor-pointer transition-all hover:ring-2 ${getCardStyle(4).accent.ring} rounded-2xl group select-none`}
        title="Ketuk 2x untuk Layar Penuh"
      >
        {renderCardContent(4)}
      </div>

      {/* 6. Kinerja Akumulatif & Rata-Rata YL (Card 5) */}
      <div
        onDoubleClick={(e) => handleCardDoubleClick(5, e)}
        onTouchStart={handleCardTouchStart}
        onTouchEnd={(e) => handleCardTouchEnd(5, e)}
        className={`cursor-pointer transition-all hover:ring-2 ${getCardStyle(5).accent.ring} rounded-2xl group select-none`}
        title="Ketuk 2x untuk Layar Penuh"
      >
        {renderCardContent(5)}
      </div>
    </div>
  );
}

export const ManagerDashboardTab = React.memo(ManagerDashboardTabInner);
