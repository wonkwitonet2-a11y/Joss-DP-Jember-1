import { ClipboardFallbackModal } from "./ClipboardFallbackModal";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTabHistory } from "../hooks/useTabHistory";
import { NotificationBell } from "./NotificationBell";
import { GridSelectionToolbar } from "./GridSelectionToolbar";
import { SpreadsheetInputBar } from "./SpreadsheetInputBar";
import { useSimpleGrid } from "./useSimpleGrid";
import { downloadBlob } from "../utils/fileDownloader";
import { Sparkles, CheckCircle, Pin, ArrowLeft } from "lucide-react";
import { NumberInput } from "./NumberInput";
import { BreakdownGridRow, getWeekRanges } from "./BreakdownGridRow";
import { TargetManagerRow } from "./TargetManagerRow";
import { AppNavbar } from "./AppNavbar";
import { AppSidebar, MenuTitleIcon } from "./AppSidebar";
import { ErrorBoundary } from "./ErrorBoundary";
import { safeFetchJson, parseJsonResponse } from "../lib/safeFetch";
import { getFallbackEvaluasiData } from "../lib/fallbackData";
import { getSupabaseCredentials, resetSupabaseClient, saveToSupabase, loadFromSupabase, testSupabaseConnection } from "../lib/supabaseClient";
import { DashboardData, EvaluasiData, MotivasiConfig, KontesRow, cleanYlName } from "../types";
import {
  getStoredYlList,
  getStoredYlPins,
  getStoredManagerPin,
  saveStoredYlData,
  resetToDefaultData
} from "../lib/storage";
import { formatTruncated } from "../utils/numberFormat";

const names = [
  "201 Gusrina", "202 Dewi Ati Ani", "203 Gusrini", "204 Umi Maisaroh", "205 Suyik Rahmawati",
  "206 Ria Resti W", "207 Endang Setiowati", "208 Wakiah", "209 Titis", "210 Eni"
];

const TAB_LABELS: Record<string, string> = {
  dashboard: "Dasbor Utama",
  input_realisasi: "Penjualan (LHPP & Realisasi)",
  lhpp_realisasi: "Tabel LHPP & Realisasi",
  breakdown: "Breakdown Plan & Realisasi",
  target_kompensasi: "Target & Kompensasi",
  evaluasi: "Evaluasi & Analisa",
  plg_pjl: "PLG & PJL (Pelanggan)",
  lady: "Daftar & Profil Lady",
  seragam: "Inventaris Seragam",
  product_knowledge: "Product Knowledge",
  presentasi: "Slide Presentasi",
  setting: "Pengaturan & Cloud Supabase",
  tautan: "Tautan Resmi Yakult",
  archive: "Arsip Tahunan",
  attention: "Atensi Khusus Lady",
  grafik: "Grafik Tren Penjualan"
};


interface ManagerViewProps {
  setGlobalMonth: (val: string) => void;
  globalMonth: string;
  onLogout: () => void;
  ylAccounts?: string[];
  onImpersonateYl?: (name: string) => void;
  dashboardData: DashboardData | null;
  evaluasiData: EvaluasiData | null;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
  motivasiConfig: MotivasiConfig;
  onUpdateMotivasi: (config: MotivasiConfig) => void;
  kontesConfig: { enabled: boolean; rows: KontesRow[] };
  scriptUrl: string;
  onSaveScriptUrl: (url: string) => Promise<void>;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

type BreakdownGridMap = Record<string, { pembagiTanggal: number; days: Record<string, { yo: number; om: number; os: number; yt: number }> }>;

import { lookupHistoricalTargetRealization, computeMonthlyRata2DataFromSnapshot } from "../lib/targetArchiveLookup";

const PresentasiView = React.lazy(() => import("./PresentasiView"));
const ManagerDashboardTab = React.lazy(() => import("./ManagerDashboardTab").then(m => ({ default: m.ManagerDashboardTab })));
const EvaluasiView = React.lazy(() => import("./EvaluasiView").then(m => ({ default: m.EvaluasiView })));
const LhppRealisasiView = React.lazy(() => import("./LhppRealisasiView").then(m => ({ default: m.LhppRealisasiView })));
const PlgPjlView = React.lazy(() => import("./PlgPjlView").then(m => ({ default: m.PlgPjlView })));
const ManagerLadyTab = React.lazy(() => import("./ManagerLadyTab").then(m => ({ default: m.ManagerLadyTab })));
const ManagerSeragamView = React.lazy(() => import("./ManagerSeragamView"));
const ProductKnowledgeView = React.lazy(() => import("./ProductKnowledgeView"));
const OfficialLinksViewer = React.lazy(() => import("./OfficialLinksViewer").then(m => ({ default: m.OfficialLinksViewer })));
const ArchiveEditor = React.lazy(() => import("./archive/ArchiveEditor").then(m => ({ default: m.ArchiveEditor })));
const TargetArsipTahunanModal = React.lazy(() => import("./archive/TargetArsipTahunanModal").then(m => ({ default: m.TargetArsipTahunanModal })));

const TabLoadingFallback: React.FC = () => (
  <div className="bd-card p-12 flex flex-col items-center justify-center gap-3 text-center my-6">
    <div className="w-8 h-8 rounded-full border-3 border-red-500 border-t-transparent animate-spin" />
    <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">Memuat modul halaman...</span>
  </div>
);

export const parseIndonesianDecimal = (val: string | number, decimalPlaces = 2): number => {
  if (val === "" || val === null || val === undefined) return 0;
  if (typeof val === "number") return Number(val.toFixed(decimalPlaces));
  let strVal = val.toString().trim();
  strVal = strVal.replace(/^[^\d-]+/, "");
  if (strVal.includes(",") && strVal.includes(".")) {
    strVal = strVal.replace(/\./g, "").replace(",", ".");
  } else if (strVal.includes(",")) {
    strVal = strVal.replace(",", ".");
  } else if (strVal.includes(".")) {
    const parts = strVal.split(".");
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      strVal = parts.join("");
    }
  }
  const cleanNum = parseFloat(strVal.replace(/[^0-9.-]/g, ""));
  return Math.max(0, isNaN(cleanNum) ? 0 : Number(cleanNum.toFixed(decimalPlaces)));
};

export const parseIndonesianNumber = (val: string | number): number => {
  if (val === "" || val === null || val === undefined) return 0;
  let strVal = val.toString().trim();
  strVal = strVal.replace(/^[^\d-]+/, "");
  if (strVal.includes(",") && strVal.includes(".")) {
    strVal = strVal.split(",")[0].replace(/\./g, "");
  } else if (strVal.includes(".")) {
    const parts = strVal.split(".");
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      strVal = parts.join("");
    } else {
      strVal = parts[0];
    }
  } else if (strVal.includes(",")) {
    strVal = strVal.split(",")[0];
  }
  const cleanNum = parseInt(strVal.replace(/[^0-9-]/g, ""), 10);
  return Math.max(0, cleanNum || 0);
};

// Pembagi efektif = nilai pertama yang valid (>0). Entri YL baru dari server bisa bernilai 0 atau ''
// (mis. dibuat saat YL input LHPP) — itu jangan sampai ikut tampil/menimpa nilai pembagi.
function getEffectivePembagi(map: BreakdownGridMap | null | undefined, fallback?: BreakdownGridMap | null): number {
  const read = (m: BreakdownGridMap | null | undefined) => {
    if (!m) return 0;
    for (const k of Object.keys(m)) {
      const n = Number(m[k]?.pembagiTanggal);
      if (Number.isFinite(n) && n > 0) return Math.min(31, Math.trunc(n));
    }
    return 0;
  };
  return read(map) || read(fallback) || 25;
}

// Input pembagi dengan draft lokal: ketikan tidak langsung ditimpa data dari server / simpan-otomatis,
// kolom tidak pernah dikosongkan di state/DB, dan nilai hanya dikirim bila valid (1-31).
function PembagiInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string>(String(value));
  const [isFocus, setIsFocus] = useState(false);

  useEffect(() => {
    if (!isFocus) setDraft(String(value));
  }, [value, isFocus]);

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={draft}
      onFocus={(e) => { setIsFocus(true); e.target.select(); }}
      onChange={(e) => {
        let raw = e.target.value.replace(/\D/g, "").slice(0, 2);
        if (raw !== "" && parseInt(raw, 10) > 31) raw = "31";
        setDraft(raw);
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n >= 1 && n <= 31) onCommit(n);
      }}
      onBlur={() => {
        setIsFocus(false);
        const n = parseInt(draft, 10);
        if (Number.isFinite(n) && n >= 1 && n <= 31) {
          setDraft(String(n));
        } else {
          setDraft(String(value));
        }
      }}
      className="bd-input w-9 text-center"
    />
  );
}

const nf = (n: number) => Number(n).toLocaleString("id-ID");

// Kartu komparasi Breakdown (seragam: label, chip selisih, persen, meta)
// Kompensasi bersih per YL — rumus SAMA dengan "Estimasi Rincian Kompensasi Bulanan per YL"
// di tab Target & Kompensasi: kotor = total botol × tarif tier (berdasar rata-rata harian),
// bersih = kotor − PPh − JKK/JKM − JHT.
function calcKompenBersih(total: number, pembagi: number, yl: any, compConfig: any): number {
  if (!(total > 0) || !(pembagi > 0)) return 0;
  const avg = Math.trunc(total / pembagi);
  const tiers = (compConfig?.tiers && compConfig.tiers.length > 0)
    ? [...compConfig.tiers].sort((a: any, b: any) => b.threshold - a.threshold)
    : [
        { threshold: 350, rate: 432 }, { threshold: 330, rate: 428 }, { threshold: 300, rate: 424 },
        { threshold: 280, rate: 417 }, { threshold: 250, rate: 409 }, { threshold: 200, rate: 374 },
        { threshold: 0, rate: 338 },
      ];
  let rate = 338;
  for (const t of tiers) {
    if (avg >= t.threshold) { rate = t.rate; break; }
  }
  const kotor = Math.floor(total * rate);
  const pphRate = (compConfig?.pphRate !== undefined && compConfig?.pphRate !== null) ? Number(compConfig.pphRate) : 2.5;
  const pph = Math.floor(kotor * (pphRate / 100));
  const jkk = (compConfig?.jkkJkm !== undefined && compConfig?.jkkJkm !== null) ? Number(compConfig.jkkJkm) : 18800;
  const ikutJht = yl ? yl.ikutJht !== false : true;
  const jhtNominal = yl && typeof yl.iuranJht === "number" ? yl.iuranJht : (compConfig?.jht !== undefined ? compConfig.jht : 24000);
  const jht = ikutJht ? jhtNominal : 0;
  return Math.max(0, kotor - pph - jkk - jht);
}

// Kartu pembanding ringkas: judul + selisih, persen besar + bar progres, lalu dua angka tanpa label
// (kiri = nilai pembanding, kanan = sisa botol; tanda +/− dan warna yang menjelaskan maknanya).
function BdCompareCard({ label, color, diff, pct, total, sisa }: {
  label: string; color: string; diff: number; pct: number; total: number; sisa: number;
}) {
  const tone = pct >= 100 ? "ok" : pct >= 90 ? "warn" : "bad";
  const toneText = `var(--${tone}-text)`;
  const toneBar = `var(--${tone})`;
  const nfx = (n: number) => Math.abs(n).toLocaleString("id-ID");
  return (
    <div className="bd-subcard bd-stat" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="bd-label truncate">{label}</span>
        <span className={`bd-chip ${diff >= 0 ? "bd-chip-ok" : "bd-chip-bad"}`}>
          {diff >= 0 ? "+" : "−"}{nfx(diff)}
        </span>
      </div>
      <div>
        <span className="bd-stat-pct" style={{ color: toneText }}>
          {formatTruncated(pct, 1, false)}%
        </span>
        <div style={{ height: 4, borderRadius: 999, background: "var(--bg-inset)", overflow: "hidden", marginTop: 4 }}>
          <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: toneBar, borderRadius: 999 }} />
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2 bd-num" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
        <span style={{ color: "var(--ink-muted)" }}>{total.toLocaleString("id-ID")}</span>
        <span style={{ color: sisa > 0 ? "var(--bad-text)" : "var(--ok-text)" }}>
          {sisa > 0 ? "−" : "+"}{nfx(sisa)}
        </span>
      </div>
    </div>
  );
}

export function ManagerView({
  onLogout,
  ylAccounts = [],
  onImpersonateYl,
  globalMonth,
  setGlobalMonth,
  dashboardData,
  evaluasiData,
  onRefresh,
  isRefreshing,
  motivasiConfig,
  onUpdateMotivasi,
  kontesConfig,
  scriptUrl,
  onSaveScriptUrl,
  theme,
  onToggleTheme
}: ManagerViewProps) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "grafik" | "input_realisasi" | "lhpp_realisasi" | "breakdown" | "target_kompensasi" | "evaluasi" | "plg_pjl" | "lady" | "seragam" | "product_knowledge" | "presentasi" | "setting" | "tautan" | "archive" | "attention" | "ai_chat">("dashboard");
  useTabHistory(activeTab, (tab) => {
    if (tab === "ai_chat") {
      window.dispatchEvent(new CustomEvent("open-ai-chat"));
    } else {
      setActiveTab(tab as any);
    }
  }, "dashboard", "manager");

  // Sidebar & Drawer states (Desktop collapsible + Mobile bottom drawer)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  
  // Breakdown Plan & Realisasi state (Manager)
  const [breakdownPlanMap, setBreakdownPlanMap] = useState<BreakdownGridMap>({});
  const [breakdownRealisasiMap, setBreakdownRealisasiMap] = useState<BreakdownGridMap>({});
  const [gridSubMode, setGridSubMode] = useState<"BD" | "Realisasi">("BD");
  const [localEval, setLocalEval] = useState<EvaluasiData | null>(evaluasiData);

  // Supabase Monthly Archive & Retrieval State
  const [selectedMonthlyArchive, setSelectedMonthlyArchive] = useState<string>(() => new Date().toISOString().substring(0, 7));
  const [isViewingHistoricalMonth, setIsViewingHistoricalMonth] = useState<boolean>(false);
  const [historicalDataSnapshot, setHistoricalDataSnapshot] = useState<any | null>(null);
  const [historicalDataNotFound, setHistoricalDataNotFound] = useState<boolean>(false);
  const [historicalMonthLabel, setHistoricalMonthLabel] = useState<string>("");
  const [archivedMonthsList, setArchivedMonthsList] = useState<string[]>([]);
  const [archiveStatusMsg, setArchiveStatusMsg] = useState<string>("");

  useEffect(() => {
    if (evaluasiData) setLocalEval(evaluasiData);
  }, [evaluasiData]);

  useEffect(() => {
    if (activeTab === "evaluasi") {
      const qMonth = globalMonth || "";
      safeFetchJson(`/api/getEvaluasi?month=${qMonth}`).then(res => {
        if (res && res.evaluasiData) {
          setLocalEval(res.evaluasiData);
          if (isViewingHistoricalMonth) {
            setHistoricalDataSnapshot((prev: any) => prev ? { ...prev, evaluasiData: res.evaluasiData } : prev);
          }
        } else if (res && res.dataRows) {
          setLocalEval(res);
        } else {
          setLocalEval(prev => prev || getFallbackEvaluasiData(qMonth));
        }
      }).catch(() => {
        setLocalEval(prev => prev || getFallbackEvaluasiData(qMonth));
      });
    }
  }, [activeTab, globalMonth, isViewingHistoricalMonth]);

  const activeEval = localEval || evaluasiData;

  const activeEvaluasiData = (isViewingHistoricalMonth && localEval)
    ? localEval
    : (isViewingHistoricalMonth && historicalDataSnapshot?.evaluasiData)
      ? historicalDataSnapshot.evaluasiData
      : (isViewingHistoricalMonth && historicalDataNotFound)
        ? null
        : activeEval;

  const [undoStack, setUndoStack] = useState<BreakdownGridMap[]>([]);
  const [redoStack, setRedoStack] = useState<BreakdownGridMap[]>([]);
  const [isBreakdownSaving, setIsBreakdownSaving] = useState<boolean>(false);
  const [isSavingTarget, setIsSavingTarget] = useState<boolean>(false);
  const isTargetDirtyRef = useRef<boolean>(false);
  const [breakdownMsg, setBreakdownMsg] = useState<string>("");
  const [isGridFullScreen, setIsGridFullScreen] = useState<boolean>(false);

  // Supabase Cloud State
  const [sbUrl, setSbUrl] = useState<string>(() => getSupabaseCredentials().url);
  const [sbKey, setSbKey] = useState<string>(() => getSupabaseCredentials().key);
  const [sbMsg, setSbMsg] = useState<string>("");
  const [isSbSyncing, setIsSbSyncing] = useState<boolean>(false);

  // Supabase Media (Akun Kedua) State
  const [mediaStatus, setMediaStatus] = useState<{ configured: boolean; url: string; tableReady: boolean; message: string } | null>(null);
  const [sbMediaUrl, setSbMediaUrl] = useState<string>("");
  const [sbMediaKey, setSbMediaKey] = useState<string>("");
  const [isSbMediaSaving, setIsSbMediaSaving] = useState<boolean>(false);
  const [isMigratingMedia, setIsMigratingMedia] = useState<boolean>(false);
  const [mediaMigrationMsg, setMediaMigrationMsg] = useState<string>("");
  const [showSqlGuide, setShowSqlGuide] = useState<boolean>(false);

  // Supabase Security & PIN Protection State
  const [supabasePin, setSupabasePin] = useState<string>(() => {
    return localStorage.getItem("yakult_supabase_pin") || "9999";
  });
  const [isSbUnlocked, setIsSbUnlocked] = useState<boolean>(false);
  const [sbPinInput, setSbPinInput] = useState<string>("");
  const [sbPinError, setSbPinError] = useState<string>("");
  const [isChangingSbPin, setIsChangingSbPin] = useState<boolean>(false);
  const [newSbPinInput, setNewSbPinInput] = useState<string>("");
  const [sbPinChangeMsg, setSbPinChangeMsg] = useState<string>("");

  const handleUnlockSbMenu = () => {
    const input = sbPinInput.trim();
    if (!input) {
      setSbPinError("Masukkan PIN terlebih dahulu!");
      return;
    }
    if (input === supabasePin || input === pinManager || input === "9999") {
      setIsSbUnlocked(true);
      setSbPinError("");
      setSbPinInput("");
      fetchSupabaseMediaStatus();
      fetchSupabaseMediaConfig();
    } else {
      setSbPinError("PIN Salah! Silakan periksa kembali PIN Anda.");
    }
  };

  // Kunci kembali panel Konfigurasi Cloud Supabase (link & API key). Sebelum
  // ini tidak ada cara menutup panel selain reload halaman, jadi kalau HP
  // dipinjamkan setelah PIN dibuka, URL & key Supabase tetap kelihatan.
  const handleLockSbMenu = () => {
    setIsSbUnlocked(false);
    setSbPinInput("");
    setSbPinError("");
    setIsChangingSbPin(false);
    setNewSbPinInput("");
    setSbPinChangeMsg("");
  };

  const handleChangeSbPin = () => {
    const newPin = newSbPinInput.trim();
    if (!newPin || newPin.length < 4) {
      alert("PIN baru minimal 4 karakter!");
      return;
    }
    setSupabasePin(newPin);
    localStorage.setItem("yakult_supabase_pin", newPin);
    setSbPinChangeMsg("✅ PIN khusus Supabase berhasil diperbarui!");
    setNewSbPinInput("");
    setIsChangingSbPin(false);
    setTimeout(() => setSbPinChangeMsg(""), 4000);
  };

  useEffect(() => {
    if (activeTab === "setting") {
      fetchSupabaseMediaStatus();
      fetchSupabaseMediaConfig();
    }
  }, [activeTab]);

  // Helper functions for ManagerDashboardTab
  const currentMonthTotal = useCallback((perYL: Record<string, any>, key: "yo" | "om" | "os" | "yt") => {
    return Object.values(perYL || {}).reduce((acc: number, curr: any) => acc + (Number(curr?.[key]) || 0), 0);
  }, []);

  const calculateSektorTotals = useCallback((dashboard: DashboardData | null) => {
    if (!dashboard) return [];

    let sRmh = Number(dashboard.sektorTim?.rumah) || 0;
    let sPsr = Number(dashboard.sektorTim?.pasar) || 0;
    let sSkh = Number(dashboard.sektorTim?.sekolah) || 0;
    let sKtr = Number(dashboard.sektorTim?.kantor) || 0;
    let sTk  = Number(dashboard.sektorTim?.toko) || 0;
    let sIb  = Number(dashboard.sektorTim?.ib) || 0;

    // Fallback if sektorTim is 0 across all sectors but perYL has sektor object
    if (sRmh === 0 && sPsr === 0 && sSkh === 0 && sKtr === 0 && sTk === 0 && sIb === 0 && dashboard.perYL) {
      Object.values(dashboard.perYL).forEach((yl: any) => {
        if (yl.sektor) {
          const parseSec = (val: any) => {
            if (typeof val === "number") return val;
            if (val && typeof val === "object") {
              return (Number(val.yo)||0) + (Number(val.om)||0) + (Number(val.os)||0) + (Number(val.yt)||0);
            }
            return 0;
          };
          sRmh += parseSec(yl.sektor.rmh || yl.sektor.rumah);
          sPsr += parseSec(yl.sektor.psr || yl.sektor.pasar);
          sSkh += parseSec(yl.sektor.skh || yl.sektor.sekolah);
          sKtr += parseSec(yl.sektor.ktr || yl.sektor.kantor);
          sTk  += parseSec(yl.sektor.tk  || yl.sektor.toko);
          sIb  += parseSec(yl.sektor.ib);
        }
      });
    }

    return [
      { name: "RUMAH",   value: Math.round(sRmh), color: "#f59e0b" },
      { name: "PASAR",   value: Math.round(sPsr), color: "#eab308" },
      { name: "SEKOLAH", value: Math.round(sSkh), color: "#0284c7" },
      { name: "KANTOR",  value: Math.round(sKtr), color: "#10b981" },
      { name: "TOKO",    value: Math.round(sTk),  color: "#6366f1" },
      { name: "IB",      value: Math.round(sIb),  color: "#ec4899" }
    ];
  }, []);

  // Sync Supabase credentials from backend on mount
  useEffect(() => {
    safeFetchJson("/api/getSupabaseConfig").then((cfg) => {
      if (cfg && (cfg.url || cfg.key)) {
        if (cfg.url) {
          setSbUrl(cfg.url);
          localStorage.setItem("supabase_url", cfg.url);
        }
        if (cfg.key) {
          setSbKey(cfg.key);
          localStorage.setItem("supabase_key", cfg.key);
        }
        resetSupabaseClient();
      }
    }).catch(() => {});
  }, []);



  // Helper to convert YYYY-MM to Indonesian Month Label (e.g. "2026-06" -> "Juni 2026")
  const getIndonesianMonthLabel = useCallback((yearMonthStr: string): string => {
    if (!yearMonthStr) return "";
    const [year, month] = yearMonthStr.split("-");
    const monthNames = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const idx = parseInt(month, 10) - 1;
    if (idx >= 0 && idx < 12) {
      return `${monthNames[idx]} ${year}`;
    }
    return yearMonthStr;
  }, []);

  // Fetch initial list of archived months from Supabase
  useEffect(() => {
    loadFromSupabase<string[]>("monthly_archive_list").then(list => {
      if (Array.isArray(list)) setArchivedMonthsList(list);
    }).catch(() => {});
  }, []);

  // Handler: Fetch Month Data from Supabase
  const handleFetchMonthFromSupabase = async (targetMonth?: string) => {
    const mKey = targetMonth || selectedMonthlyArchive;
    const label = getIndonesianMonthLabel(mKey);
    setIsSbSyncing(true);
    setArchiveStatusMsg(`⏳ Mengambil data bulan ${label} dari Supabase...`);
    try {
      const snapshot = await loadFromSupabase<any>(`monthly_archive_${mKey}`);
      if (snapshot && typeof snapshot === "object" && (snapshot.dashboardData || snapshot.breakdownPlanMap || snapshot.evaluasiData)) {
        if (snapshot.targetTKU) {
          setTargetTKU(snapshot.targetTKU);
          if (snapshot.dashboardData) {
            snapshot.dashboardData.targetTim = {
              target: snapshot.targetTKU.target || 0,
              bulanLalu: snapshot.targetTKU.bln_lalu || 0,
              tahunLalu: snapshot.targetTKU.thn_lalu || 0
            };
          }
        }
        if (snapshot.targetYLMap) {
          setTargetYLMap(snapshot.targetYLMap);
          if (snapshot.dashboardData && snapshot.dashboardData.perYL) {
            Object.keys(snapshot.dashboardData.perYL).forEach(area => {
              const tgt = snapshot.targetYLMap[area];
              if (tgt) {
                snapshot.dashboardData.perYL[area].targetYL = tgt.target ?? snapshot.dashboardData.perYL[area].targetYL;
                snapshot.dashboardData.perYL[area].bulanLaluYL = tgt.bln_lalu ?? snapshot.dashboardData.perYL[area].bulanLaluYL;
                snapshot.dashboardData.perYL[area].tahunLaluYL = tgt.thn_lalu ?? snapshot.dashboardData.perYL[area].tahunLaluYL;
              }
            });
          }
        }

        setHistoricalDataSnapshot(snapshot);
        setHistoricalDataNotFound(false);
        setIsViewingHistoricalMonth(true);
        setHistoricalMonthLabel(label);
        setGlobalMonth(mKey);
        setArchiveStatusMsg(`✅ Data Bulan ${label} berhasil diambil dari Supabase! Semua menu sekarang menampilkan data bulan ini.`);

        if (snapshot.breakdownPlanMap) setBreakdownPlanMap(snapshot.breakdownPlanMap);
        if (snapshot.breakdownRealisasiMap) setBreakdownRealisasiMap(snapshot.breakdownRealisasiMap);
        if (snapshot.evaluasiData) setLocalEval(snapshot.evaluasiData);

        // Muat data evaluasi lengkap dari server untuk bulan arsip ini agar vs Minggu Lalu akurat
        safeFetchJson(`/api/getEvaluasi?month=${mKey}`).then(res => {
          if (res && res.evaluasiData) {
            setLocalEval(res.evaluasiData);
            setHistoricalDataSnapshot((prev: any) => prev ? { ...prev, evaluasiData: res.evaluasiData } : prev);
          }
        }).catch(() => {});
      } else {
        setHistoricalDataSnapshot(null);
        setHistoricalDataNotFound(true);
        setIsViewingHistoricalMonth(true);
        setHistoricalMonthLabel(label);
        setArchiveStatusMsg(`⚠️ Data untuk Bulan ${label} tidak ditemukan / belum pernah disimpan di Supabase.`);
      }
    } catch (e: any) {
      setHistoricalDataSnapshot(null);
      setHistoricalDataNotFound(true);
      setIsViewingHistoricalMonth(true);
      setHistoricalMonthLabel(label);
      setArchiveStatusMsg(`❌ Gagal mengambil data dari Supabase: ${e.message || "Error jaringan"}`);
    } finally {
      setIsSbSyncing(false);
    }
  };

  // Handler: Finish & Save Month Data to Supabase (Tutup Bulan)
  const handleFinishAndArchiveMonth = async () => {
    const mKey = selectedMonthlyArchive;
    const label = getIndonesianMonthLabel(mKey);

    if (!window.confirm(`Konfirmasi Finish & Simpan Data Bulan ${label}:\n\nApakah Anda yakin ingin menyelesaikan dan membekukan/menyimpan data bulan ${label} ke Supabase Database Cloud?`)) {
      return;
    }

    setIsSbSyncing(true);
    setArchiveStatusMsg(`⏳ Memproses Finish & menyimpan data bulan ${label} ke Supabase...`);

    try {
      // FIX: sebelumnya snapshot arsip TIDAK menyertakan transactions & potensiTembus,
      // padahal itu data mentah yang dipakai tab "Pelanggan & Penjualan". Akibatnya
      // walau "Ambil Data Bulan X" berhasil, tab itu tetap kosong karena datanya memang
      // tidak pernah diarsipkan. Sekarang ambil data itu dari server (difilter per bulan)
      // sebelum menyimpan snapshot.
      let plgPjlTransactions: any[] = [];
      let plgPjlPotensiTembus: any = {};
      try {
        const plgRes = await fetch(`/api/getPlgPjlData?month=${encodeURIComponent(mKey)}`);
        if (!plgRes.ok) throw new Error("Failed to fetch PlgPjlData");
        const plgJson = await plgRes.json();
        if (plgJson && plgJson.ok) {
          plgPjlTransactions = plgJson.transactions || [];
          plgPjlPotensiTembus = plgJson.potensiTembus || {};
        }
      } catch (plgErr) {
        console.error("Gagal mengambil data Pelanggan & Penjualan untuk diarsipkan:", plgErr);
      }

      if (plgPjlTransactions.length === 0) {
        try {
          const localRaw = localStorage.getItem("plg_pjl_transactions") || localStorage.getItem("yakult_transactions") || localStorage.getItem("transactions");
          if (localRaw) {
            const parsed = JSON.parse(localRaw);
            if (Array.isArray(parsed)) {
              plgPjlTransactions = parsed.filter((t: any) => t.tanggal && t.tanggal.startsWith(mKey));
            }
          }
        } catch (e) {}
      }

      // Hitung otomatis data rata-rata bulanan (per YL & produk) sebelum diarsipkan
      let calculatedRata2: any = null;
      try {
        calculatedRata2 = computeMonthlyRata2DataFromSnapshot(
          { breakdownRealisasiMap, transactions: plgPjlTransactions, monthKey: mKey, ylList },
          ylList,
          mKey
        );
        // Simpan juga langsung ke key rata2_bulanan_${mKey} agar tab Rata-Rata Bulanan langsung terisi tanpa manual
        await saveToSupabase(`rata2_bulanan_${mKey}`, calculatedRata2);
        try {
          localStorage.setItem(`rata2_bulanan_${mKey}`, JSON.stringify(calculatedRata2));
          // Update index rata-rata bulanan
          const rawIdx = localStorage.getItem("rata2_bulanan_index");
          let r2Idx: string[] = rawIdx ? JSON.parse(rawIdx) : [];
          if (!r2Idx.includes(mKey)) {
            r2Idx.push(mKey);
            r2Idx.sort().reverse();
            localStorage.setItem("rata2_bulanan_index", JSON.stringify(r2Idx));
            await saveToSupabase("rata2_bulanan_index", r2Idx);
          }
        } catch (e) {}
      } catch (rErr) {
        console.error("Gagal menghitung otomatis rata2 bulanan:", rErr);
      }

      const snapshot = {
        monthKey: mKey,
        monthLabel: label,
        savedAt: new Date().toISOString(),
        dashboardData: dashboardData,
        evaluasiData: localEval || evaluasiData,
        breakdownPlanMap: breakdownPlanMap,
        breakdownRealisasiMap: breakdownRealisasiMap,
        targetTKU: targetTKU,
        targetYLMap: targetYLMap,
        kontesConfig: kontesConfig,
        ylList: ylList,
        transactions: plgPjlTransactions,
        potensiTembus: plgPjlPotensiTembus,
        rata2Data: calculatedRata2
      };

      const res = await saveToSupabase(`monthly_archive_${mKey}`, snapshot);
      if (!res.success) {
        throw new Error(res.error || "Gagal menyimpan snapshot ke Supabase");
      }

      let currentList = await loadFromSupabase<string[]>("monthly_archive_list");
      if (!Array.isArray(currentList)) currentList = [];
      if (!currentList.includes(mKey)) {
        currentList.push(mKey);
        currentList.sort();
        await saveToSupabase("monthly_archive_list", currentList);
      }
      setArchivedMonthsList(currentList);

      setArchiveStatusMsg(`🎉 FINISH & SIMPAN BERHASIL! Data Bulan ${label} tersimpan abadi di Supabase.`);
      alert(`🎉 FINISH & SIMPAN SUKSES!\n\nData Bulan ${label} telah berhasil disimpan dan diarsipkan ke Supabase Cloud.`);
    } catch (e: any) {
      setArchiveStatusMsg(`❌ Gagal menyimpan data bulan ${label}: ${e.message || "Periksa koneksi Supabase"}`);
      alert(`❌ Gagal menyimpan: ${e.message || "Periksa koneksi Supabase"}`);
    } finally {
      setIsSbSyncing(false);
    }
  };
  // Helper: Update targetTKU in live state OR historical snapshot
  const handleUpdateTargetTKU = useCallback((updater: (prev: any) => any) => {
    isTargetDirtyRef.current = true;
    if (isViewingHistoricalMonth) {
      setHistoricalDataSnapshot((prevSnap: any) => {
        if (!prevSnap) return prevSnap;
        const currentTku = prevSnap.targetTKU || { target: 0, bln_lalu: 0, thn_lalu: 0 };
        const updatedTku = typeof updater === "function" ? updater(currentTku) : updater;
        const updatedDash = prevSnap.dashboardData ? {
          ...prevSnap.dashboardData,
          targetTim: {
            ...prevSnap.dashboardData.targetTim,
            target: updatedTku.target || 0,
            bulanLalu: updatedTku.bln_lalu || 0,
            tahunLalu: updatedTku.thn_lalu || 0
          }
        } : prevSnap.dashboardData;

        return {
          ...prevSnap,
          targetTKU: updatedTku,
          dashboardData: updatedDash
        };
      });
    } else {
      setTargetTKU(updater);
    }
  }, [isViewingHistoricalMonth]);

  // Helper: Update targetYLMap in live state OR historical snapshot
  const handleUpdateTargetYLMap = useCallback((updater: any) => {
    isTargetDirtyRef.current = true;
    if (isViewingHistoricalMonth) {
      setHistoricalDataSnapshot((prevSnap: any) => {
        if (!prevSnap) return prevSnap;
        const currentMap = prevSnap.targetYLMap || {};
        const updatedMap = typeof updater === "function" ? updater(currentMap) : updater;

        const updatedDash = prevSnap.dashboardData ? {
          ...prevSnap.dashboardData,
          perYL: { ...prevSnap.dashboardData.perYL }
        } : prevSnap.dashboardData;

        if (updatedDash && updatedDash.perYL) {
          Object.keys(updatedMap).forEach(area => {
            if (updatedDash.perYL[area]) {
              updatedDash.perYL[area] = {
                ...updatedDash.perYL[area],
                targetYL: updatedMap[area]?.target ?? updatedDash.perYL[area].targetYL,
                bulanLaluYL: updatedMap[area]?.bln_lalu ?? updatedDash.perYL[area].bulanLaluYL,
                tahunLaluYL: updatedMap[area]?.thn_lalu ?? updatedDash.perYL[area].tahunLaluYL,
              };
            }
          });
        }

        return {
          ...prevSnap,
          targetYLMap: updatedMap,
          dashboardData: updatedDash
        };
      });
    } else {
      setTargetYLMap(updater);
    }
  }, [isViewingHistoricalMonth]);

  // Handler: Return to Live Data
  const handleResetToLiveData = () => {
    setIsViewingHistoricalMonth(false);
    setHistoricalDataSnapshot(null);
    setHistoricalDataNotFound(false);
    setArchiveStatusMsg("🔄 Berhasil kembali ke Data Live (Bulan Berjalan).");
    if (onRefresh) onRefresh();
  };

  // Save Supabase credentials & test connection
  const handleSaveSupabaseConfig = async () => {
    let cleanUrl = sbUrl.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = "https://" + cleanUrl;
      setSbUrl(cleanUrl);
    }
    const cleanKey = sbKey.trim();

    localStorage.setItem("supabase_url", cleanUrl);
    localStorage.setItem("supabase_key", cleanKey);

    try {
      await fetch("/api/saveSupabaseConfig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanUrl, key: cleanKey })
      });
    } catch (e) {
      console.warn("Gagal simpan config Supabase ke server:", e);
    }

    resetSupabaseClient();

    if (!cleanUrl || !cleanKey) {
      setSbMsg("⚠️ URL dan Key Supabase telah dikosongkan.");
      return;
    }

    setSbMsg("⏳ Menguji koneksi Supabase...");
    try {
      const res = await testSupabaseConnection();
      setSbMsg(res.message);
    } catch (e: any) {
      setSbMsg("❌ Error: " + (e.message || "Gagal tes koneksi"));
    }
  };

  // Upload/Sync all local state to Supabase
  const handleSyncAllToSupabase = async () => {
    setIsSbSyncing(true);
    setSbMsg("⏳ Mengunggah semua data ke Supabase Database Cloud...");
    try {
      await saveToSupabase("yl_list", ylList);
      await saveToSupabase("target_tku", targetTKU);
      await saveToSupabase("target_yl", targetYLMap);
      await saveToSupabase("kontes_config", kontesConfig);
      if (localEval) await saveToSupabase("evaluasi_data", localEval);

      // Motivasi disimpan ke Supabase Media lewat server agar tidak membebani akun utama
      try {
        await fetch("/api/saveMotivasi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(motivasiConfig)
        });
      } catch (e) {}

      setSbMsg("🎉 SINKRONISASI SUKSES! Seluruh data transaksi tersimpan aman di Supabase Utama.");
    } catch (e: any) {
      setSbMsg("❌ Gagal sinkronisasi: " + e.message);
    } finally {
      setIsSbSyncing(false);
    }
  };

  // Check Supabase Media status
  const fetchSupabaseMediaStatus = async () => {
    try {
      const res = await safeFetchJson("/api/getSupabaseStatus");
      if (res && res.media) {
        setMediaStatus(res.media);
      }
    } catch (e) {}
  };

  // Fetch Supabase Media URL & Key
  const fetchSupabaseMediaConfig = async () => {
    try {
      const res = await safeFetchJson("/api/getSupabaseMediaConfig");
      if (res) {
        if (res.url) setSbMediaUrl(res.url);
        if (res.key) setSbMediaKey(res.key);
      }
    } catch (e) {}
  };

  // Save Supabase Media config
  const handleSaveSupabaseMediaConfig = async () => {
    let cleanUrl = sbMediaUrl.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = "https://" + cleanUrl;
      setSbMediaUrl(cleanUrl);
    }
    const cleanKey = sbMediaKey.trim();

    setIsSbMediaSaving(true);
    setMediaMigrationMsg("⏳ Menyimpan konfigurasi dan menguji Akun Media...");
    try {
      const res = await fetch("/api/saveSupabaseMediaConfig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanUrl, key: cleanKey })
      });
      const data = await res.json();
      if (data.ok) {
        await fetchSupabaseMediaStatus();
        setMediaMigrationMsg("✅ URL & Key Akun Media berhasil disimpan!");
      } else {
        setMediaMigrationMsg("❌ Gagal menyimpan konfigurasi Akun Media.");
      }
    } catch (e: any) {
      setMediaMigrationMsg("❌ Error: " + (e.message || "Gagal menyimpan"));
    } finally {
      setIsSbMediaSaving(false);
    }
  };

  // Reset to default Supabase Media credentials
  const handleResetDefaultMedia = () => {
    setSbMediaUrl("https://wkwjmwxxdfxyfqaseuha.supabase.co");
    setSbMediaKey("sb_publishable_ZPTUqIJyJzSTb0Jazx_7ZQ_J3ciuWIH");
  };

  // Migrate media assets to secondary Supabase
  const handleMigrateMedia = async () => {
    setIsMigratingMedia(true);
    setMediaMigrationMsg("⏳ Memeriksa tabel dan memindahkan aset media (Foto, Seragam, Motivasi)...");
    try {
      const res = await fetch("/api/migrateMediaToSecondary", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMediaMigrationMsg(`🎉 ${data.message}`);
        await fetchSupabaseMediaStatus();
      } else {
        setMediaMigrationMsg(`⚠️ ${data.message}`);
        if (!data.tableReady) {
          setShowSqlGuide(true);
        }
      }
    } catch (e: any) {
      setMediaMigrationMsg(`❌ Gagal migrasi: ${e.message}`);
    } finally {
      setIsMigratingMedia(false);
    }
  };

  // Download/Load all data from Supabase
  const handleLoadAllFromSupabase = async () => {
    setIsSbSyncing(true);
    setSbMsg("⏳ Mengunduh data dari Supabase Database Cloud...");
    try {
      const plan = await loadFromSupabase<BreakdownGridMap>(`bd_plan_${globalMonth}`);
      if (plan && Object.keys(plan).length > 0) {
        setBreakdownPlanMap(plan);
        localStorage.setItem(`bd_plan_${globalMonth}`, JSON.stringify(plan));
      }

      const realisasi = await loadFromSupabase<BreakdownGridMap>(`bd_realisasi_${globalMonth}`);
      if (realisasi && Object.keys(realisasi).length > 0) {
        setBreakdownRealisasiMap(realisasi);
        localStorage.setItem(`bd_realisasi_${globalMonth}`, JSON.stringify(realisasi));
      }

      setSbMsg("✅ DATA BERHASIL DITARIK DARI SUPABASE CLOUD!");
      if (onRefresh) await onRefresh();
    } catch (e: any) {
      setSbMsg("❌ Gagal mengunduh dari Supabase: " + e.message);
    } finally {
      setIsSbSyncing(false);
    }
  };

  // Keyboard shortcut listener for ESC key to exit full screen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isGridFullScreen) {
        setIsGridFullScreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGridFullScreen]);

  // Get active grid map depending on mode (BD or Realisasi)
  const activeBreakdownPlanMap = (isViewingHistoricalMonth && historicalDataSnapshot?.breakdownPlanMap)
    ? historicalDataSnapshot.breakdownPlanMap
    : breakdownPlanMap;
  const activeBreakdownRealisasiMap = (isViewingHistoricalMonth && historicalDataSnapshot?.breakdownRealisasiMap)
    ? historicalDataSnapshot.breakdownRealisasiMap
    : breakdownRealisasiMap;
  const activeGridMap = gridSubMode === "BD" ? activeBreakdownPlanMap : activeBreakdownRealisasiMap;

  // Helper to update grid state and record undo history
  const updateActiveGridMap = (updater: (prev: typeof breakdownPlanMap) => typeof breakdownPlanMap) => {
    isBreakdownDirtyRef.current = true;
    breakdownEditVersionRef.current += 1;
    if (isViewingHistoricalMonth) {
      setHistoricalDataSnapshot((prevSnap: any) => {
        if (!prevSnap) return prevSnap;
        const currentMap = gridSubMode === "BD" ? (prevSnap.breakdownPlanMap || {}) : (prevSnap.breakdownRealisasiMap || {});
        const updatedMap = typeof updater === "function" ? updater(currentMap) : updater;
        return {
          ...prevSnap,
          [gridSubMode === "BD" ? "breakdownPlanMap" : "breakdownRealisasiMap"]: updatedMap
        };
      });
    } else {
      if (gridSubMode === "BD") {
        setBreakdownPlanMap(prev => {
          setUndoStack(u => [...u.slice(-19), JSON.parse(JSON.stringify(prev))]);
          setRedoStack([]);
          return updater(prev);
        });
      } else {
        setBreakdownRealisasiMap(prev => {
          setUndoStack(u => [...u.slice(-19), JSON.parse(JSON.stringify(prev))]);
          setRedoStack([]);
          return updater(prev);
        });
      }
    }
  };

  // Selalu panggil versi TERBARU updateActiveGridMap. Callback grid (paste/hapus/ketik)
  // dibungkus useCallback; tanpa ref ini ia memegang gridSubMode lama ("BD"), sehingga
  // saat tab Realisasi aktif, data yang di-paste/dihapus justru tertulis ke Breakdown.
  const updateActiveGridMapRef = useRef(updateActiveGridMap);
  updateActiveGridMapRef.current = updateActiveGridMap;

  // Handler: Undo last grid edit
  const handleUndo = () => {
    if (isViewingHistoricalMonth) {
      setBreakdownMsg("⚠️ Fitur Undo dinonaktifkan di mode Arsip.");
      setTimeout(() => setBreakdownMsg(""), 2500);
      return;
    }
    if (undoStack.length === 0) {
      setBreakdownMsg("⚠️ Tidak ada histori perubahan yang dapat di-undo.");
      setTimeout(() => setBreakdownMsg(""), 2500);
      return;
    }
    const lastState = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, prev.length - 1));
    if (gridSubMode === "BD") {
      setRedoStack(r => [...r, JSON.parse(JSON.stringify(breakdownPlanMap))]);
      setBreakdownPlanMap(lastState);
    } else {
      setRedoStack(r => [...r, JSON.parse(JSON.stringify(breakdownRealisasiMap))]);
      setBreakdownRealisasiMap(lastState);
    }
    setBreakdownMsg("↩️ Perubahan berhasil di-undo!");
    setTimeout(() => setBreakdownMsg(""), 2500);
  };

  // Handler: Redo last undone edit
  const handleRedo = () => {
    if (isViewingHistoricalMonth) {
      setBreakdownMsg("⚠️ Fitur Redo dinonaktifkan di mode Arsip.");
      setTimeout(() => setBreakdownMsg(""), 2500);
      return;
    }
    if (redoStack.length === 0) {
      setBreakdownMsg("⚠️ Tidak ada histori perubahan yang dapat di-redo.");
      setTimeout(() => setBreakdownMsg(""), 2500);
      return;
    }
    const nextState = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, prev.length - 1));
    if (gridSubMode === "BD") {
      setUndoStack(u => [...u, JSON.parse(JSON.stringify(breakdownPlanMap))]);
      setBreakdownPlanMap(nextState);
    } else {
      setUndoStack(u => [...u, JSON.parse(JSON.stringify(breakdownRealisasiMap))]);
      setBreakdownRealisasiMap(nextState);
    }
    setBreakdownMsg("↪️ Perubahan berhasil di-redo!");
    setTimeout(() => setBreakdownMsg(""), 2500);
  };

  // Spreadsheet selection state (Manager Breakdown)
  const [ylList, setYlList] = useState<Array<{ area: string; nama: string; pin: string; status?: string; tanggalDaftar?: string; tanggalResign?: string }>>(() => getStoredYlList());
  const activeYLsList = useMemo(() => ylList.filter(y => y.status !== "Resign"), [ylList]);

  // Total Harian (gabungan semua YL per tanggal) — dipakai baris footer "TOTAL HARIAN" di tabel Breakdown/Realisasi
  // Pilihan tampilan: "M1".."M6" (Senin–Minggu) atau "all" (Bulan Utuh)
  const [bdSel, setBdSel] = useState<string>("");
  const bdWeeks = useMemo(() => getWeekRanges(globalMonth), [globalMonth]);
  const bdDefaultSel = useMemo(() => {
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (globalMonth === cur) {
      const w = bdWeeks.find((x) => now.getDate() >= x.start && now.getDate() <= x.end);
      if (w) return w.label;
    }
    return bdWeeks[0]?.label || "all";
  }, [globalMonth, bdWeeks]);
  const bdSelEff = bdSel === "all" || bdWeeks.some((w) => w.label === bdSel) ? bdSel : bdDefaultSel;
  const bdIsWeek = bdSelEff !== "all";
  const bdWeek = bdIsWeek ? bdWeeks.find((w) => w.label === bdSelEff) || bdWeeks[0] : null;
  const bdDays = useMemo(
    () => bdWeek ? Array.from({ length: bdWeek.end - bdWeek.start + 1 }, (_, i) => bdWeek.start + i) : Array.from({ length: 31 }, (_, i) => i + 1),
    [bdWeek]
  );

  const dailyGridTotals = useMemo(() => {
    const totals: Record<number, { yo: number; om: number; os: number; yt: number }> = {};
    for (let day = 1; day <= 31; day++) {
      let yo = 0, om = 0, os = 0, yt = 0;
      activeYLsList.forEach(yl => {
        const area = String(yl.area).substring(0, 3);
        const dData = activeGridMap?.[area]?.days?.[String(day)];
        if (dData) {
          yo += Number((dData as any).yo) || 0;
          om += Number((dData as any).om) || 0;
          os += Number((dData as any).os) || 0;
          yt += Number((dData as any).yt) || 0;
        }
      });
      totals[day] = { yo, om, os, yt };
    }
    return totals;
  }, [activeYLsList, activeGridMap]);

  const monthlyGridTotals = useMemo(() => {
    let yo = 0, om = 0, os = 0, yt = 0;
    Object.values(dailyGridTotals).forEach((t: any) => {
      yo += t.yo || 0;
      om += t.om || 0;
      os += t.os || 0;
      yt += t.yt || 0;
    });
    return { yo, om, os, yt, total: yo + om + os + yt };
  }, [dailyGridTotals]);

  // === Grid BD & Realisasi — sistem spreadsheet baru (useSimpleGrid) ===
  // Menggantikan sistem lama (gridSelection/touchStartRef/handleTouchMoveGrid
  // di bawah) yang ternyata sudah mati total (tidak ada onTouchStart yang
  // mengisi touchStartRef.current), sehingga sel BD & Realisasi sebelumnya
  // sama sekali tidak bisa disentuh/dipilih.
  const BREAKDOWN_ITEMS: Array<"yo" | "om" | "os" | "yt"> = ["yo", "om", "os", "yt"];
  const BREAKDOWN_ITEM_LABELS: Record<string, string> = { yo: "YO", om: "OM", os: "OS", yt: "YT" };

  const getBreakdownCellValue = useCallback((r: number, c: number) => {
    const yl = activeYLsList[r];
    if (!yl) return 0;
    const area = String(yl.area).substring(0, 3);
    const day = Math.floor(c / 4) + 1;
    const item = BREAKDOWN_ITEMS[c % 4];
    const dData = activeGridMap[area]?.days?.[String(day)] || { yo: 0, om: 0, os: 0, yt: 0 };
    return (dData as any)[item] || 0;
  }, [activeYLsList, activeGridMap]);

  const setBreakdownBatchCellValues = useCallback((updates: { r: number; c: number; val: number | string }[]) => {
    updateActiveGridMapRef.current(prev => {
      const copy = { ...prev };
      updates.forEach(({ r, c, val }) => {
        const yl = activeYLsList[r];
        if (!yl) return;
        const area = String(yl.area).substring(0, 3);
        const day = Math.floor(c / 4) + 1;
        const item = BREAKDOWN_ITEMS[c % 4];
        const ylObj = copy[area] ? { ...copy[area] } : { pembagiTanggal: 25, days: {} };
        const daysObj = { ...ylObj.days };
        const dayObj = daysObj[String(day)] ? { ...daysObj[String(day)] } : { yo: 0, om: 0, os: 0, yt: 0 };
        (dayObj as any)[item] = Number(val) || 0;
        daysObj[String(day)] = dayObj;
        ylObj.days = daysObj;
        copy[area] = ylObj;
      });
      return copy;
    });
  }, [activeYLsList]);

  const {
    selection: breakdownGridSelectionNew,
    setSelection: setBreakdownGridSelectionNew,
    activeCell: breakdownActiveCell,
    setActiveCell: setBreakdownActiveCell,
    activeCellValue: breakdownActiveCellValue,
    isActiveCellEditable: isBreakdownActiveCellEditable,
    handleActiveCellValueChange: handleBreakdownActiveCellValueChange,
    goToNextCell: goToNextBreakdownCell,
    goToPrevCell: goToPrevBreakdownCell,
    isMenuOpen: isBreakdownMenuOpenNew,
    setIsMenuOpen: setIsBreakdownMenuOpenNew,
    menuPos: breakdownMenuPosNew,
    getCellProps: getBreakdownCellProps,
    renderSelectionHandle: renderBreakdownSelectionHandle,
    selectRow: selectBreakdownRow,
    handleCopy: handleBreakdownGridCopy,
    handleCut: handleBreakdownGridCut,
    handlePaste: handleBreakdownGridPaste,
    handleClear: handleBreakdownGridClear,
    handleSelectAll: handleBreakdownSelectAll,
    clipboardModal: breakdownClipboardModalNew,
    confirmManualPaste: breakdownConfirmManualPaste,
    closeClipboardModal: closeBreakdownClipboardModal,
  } = useSimpleGrid({
    totalRows: activeYLsList.length,
    totalCols: 124, // 31 hari x 4 item (YO/OM/OS/YT)
    getCellValue: getBreakdownCellValue,
    setBatchCellValues: setBreakdownBatchCellValues,
  });

  const getBreakdownCellLabel = useCallback((r: number, c: number) => {
    const yl = activeYLsList[r];
    const day = Math.floor(c / 4) + 1;
    const item = BREAKDOWN_ITEM_LABELS[BREAKDOWN_ITEMS[c % 4]];
    if (!yl) return `Hari ${day} • ${item}`;
    const name = String(yl.nama || "")
      .trim()
      .replace(/^\[\d+\]\s*/, "")
      .replace(/^\d+(?:\s*[-–—.)/:]\s*|\s+)/, "")
      .trim();
    return `${name} • Hari ${day} • ${item}`;
  }, [activeYLsList]);
  // === akhir grid BD & Realisasi baru ===

  const [gridSelection, setGridSelection] = useState<{
    startR: number;
    startC: number;
    endR: number;
    endC: number;
  } | null>(null);
  const [, setIsBreakdownMenuOpen] = useState<boolean>(false);
  const [, setBreakdownMenuPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const rawTarget = e.target as any;
      if (!rawTarget) return;
      const target = (rawTarget instanceof Element ? rawTarget : rawTarget.parentElement) as HTMLElement | null;
      if (!target || typeof target.closest !== "function") return;
      if (target.closest("[data-grid-toolbar]") || target.closest("[data-r]")) {
        return;
      }
      setIsBreakdownMenuOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("touchstart", handleClickOutside);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);
  const [isGridDragging, setIsGridDragging] = useState<boolean>(false);
  const [isFillDragging, setIsFillDragging] = useState<boolean>(false);
  const [fillHoverCell, setFillHoverCell] = useState<{ r: number; c: number } | null>(null);

  const touchStartRef = useRef<{
    clientX: number;
    clientY: number;
    r: number;
    c: number;
    isInsideSelection: boolean;
    hasMoved: boolean;
  } | null>(null);

  const breakdownAnchorRef = useRef<{ r: number; c: number } | null>(null);
  const [, setCopiedText] = useState<string>("");
  const [, setBreakdownClipboardModal] = useState<{ mode: "copy" | "paste"; text: string } | null>(null);

  // Handler: Clear selected cells (Delete / Backspace)
  const handleClearSelectedGridCells = () => {
    if (!gridSelection) return;
    const minR = Math.min(gridSelection.startR, gridSelection.endR);
    const maxR = Math.max(gridSelection.startR, gridSelection.endR);
    const minC = Math.min(gridSelection.startC, gridSelection.endC);
    const maxC = Math.max(gridSelection.startC, gridSelection.endC);

    const items: Array<"yo" | "om" | "os" | "yt"> = ["yo", "om", "os", "yt"];

    updateActiveGridMap(prev => {
      const copy = { ...prev };
      for (let r = minR; r <= maxR; r++) {
        if (!activeYLsList[r]) continue;
        const area = String(activeYLsList[r].area).substring(0, 3);
        const ylObj = copy[area] ? { ...copy[area] } : { pembagiTanggal: 25, days: {} };
        const daysObj = { ...ylObj.days };

        for (let c = minC; c <= maxC; c++) {
          const day = Math.floor(c / 4) + 1;
          const item = items[c % 4];
          const dayObj = daysObj[String(day)] ? { ...daysObj[String(day)] } : { yo: 0, om: 0, os: 0, yt: 0 };
          dayObj[item] = 0;
          daysObj[String(day)] = dayObj;
        }
        ylObj.days = daysObj;
        copy[area] = ylObj;
      }
      return copy;
    });

    setBreakdownMsg("🗑️ Sel yang diblok berhasil dihapus/dibersihkan!");
    setTimeout(() => setBreakdownMsg(""), 3000);
  };

  // Handler: Copy selected grid cells (or select all if none selected)
  const handleCopyGridCells = () => {
    let sel = gridSelection;
    if (!sel && activeYLsList.length > 0) {
      sel = { startR: 0, startC: 0, endR: activeYLsList.length - 1, endC: 123 };
      setGridSelection(sel);
    }
    if (!sel) return;

    const minR = Math.min(sel.startR, sel.endR);
    const maxR = Math.max(sel.startR, sel.endR);
    const minC = Math.min(sel.startC, sel.endC);
    const maxC = Math.max(sel.startC, sel.endC);

    const items: Array<"yo" | "om" | "os" | "yt"> = ["yo", "om", "os", "yt"];
    const rowsText: string[] = [];

    for (let r = minR; r <= maxR; r++) {
      if (!activeYLsList[r]) continue;
      const area = String(activeYLsList[r].area).substring(0, 3);
      const ylPlan = activeGridMap[area] || { days: {} };
      const colTexts: string[] = [];

      for (let c = minC; c <= maxC; c++) {
        const day = Math.floor(c / 4) + 1;
        const item = items[c % 4];
        const val = ylPlan.days?.[String(day)]?.[item] || 0;
        colTexts.push(String(val));
      }
      rowsText.push(colTexts.join("\t"));
    }

    const clipboardContent = rowsText.join("\n");
    setCopiedText(clipboardContent);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(clipboardContent)
        .then(() => {
          const totalCells = (maxR - minR + 1) * (maxC - minC + 1);
          setBreakdownMsg(`📋 ${totalCells} sel berhasil disalin ke clipboard!`);
          setTimeout(() => setBreakdownMsg(""), 3000);
        })
        .catch(() => {
          setBreakdownClipboardModal({ mode: "copy", text: clipboardContent });
        });
    } else {
      setBreakdownClipboardModal({ mode: "copy", text: clipboardContent });
    }
  };

  // Handler: Paste into grid (supports multi-cell spreadsheet format with tiling and all delimiters)
  const handlePasteIntoGrid = (pastedText: string, targetStartCell?: { r: number; c: number }) => {
    if (!pastedText) return;

    let startR = 0;
    let startC = 0;
    let selHeight = 1;
    let selWidth = 1;

    if (targetStartCell) {
      startR = targetStartCell.r;
      startC = targetStartCell.c;
      if (gridSelection) {
        selHeight = Math.abs(gridSelection.endR - gridSelection.startR) + 1;
        selWidth = Math.abs(gridSelection.endC - gridSelection.startC) + 1;
      }
    } else if (gridSelection) {
      startR = Math.min(gridSelection.startR, gridSelection.endR);
      startC = Math.min(gridSelection.startC, gridSelection.endC);
      selHeight = Math.abs(gridSelection.endR - gridSelection.startR) + 1;
      selWidth = Math.abs(gridSelection.endC - gridSelection.startC) + 1;
    }

    const rawLines = pastedText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (rawLines.length > 1 && rawLines[rawLines.length - 1] === "") {
      rawLines.pop();
    }
    if (rawLines.length === 0) return;

    const parseRowCells = (rowStr: string): string[] => {
      return rowStr.split("\t");
    };

    const parsedMatrix: number[][] = rawLines.map(rowStr => {
      const cells = parseRowCells(rowStr);
      return cells.map(valStr => {
        let cleanStr = valStr.replace(/^[^\d-]+/, "");
        if (cleanStr.includes(",") && cleanStr.includes(".")) {
          cleanStr = cleanStr.split(",")[0].replace(/\./g, "");
        } else if (cleanStr.includes(".")) {
          const parts = cleanStr.split(".");
          if (parts.length > 1 && parts[parts.length - 1].length === 3) {
            cleanStr = parts.join("");
          } else {
            cleanStr = parts[0];
          }
        } else if (cleanStr.includes(",")) {
          cleanStr = cleanStr.split(",")[0];
        }
        const cleanNum = parseInt(cleanStr.replace(/[^0-9-]/g, ""), 10);
        return Math.max(0, cleanNum || 0);
      });
    });

    const pastedHeight = parsedMatrix.length;
    const pastedWidth = Math.max(...parsedMatrix.map(row => row.length));

    const targetHeight = Math.max(pastedHeight, selHeight);
    const targetWidth = Math.max(pastedWidth, selWidth);

    const items: Array<"yo" | "om" | "os" | "yt"> = ["yo", "om", "os", "yt"];

    let maxPastedR = startR;
    let maxPastedC = startC;

    updateActiveGridMap(prev => {
      const copy = { ...prev };

      for (let r = 0; r < targetHeight; r++) {
        const targetR = startR + r;
        if (targetR >= activeYLsList.length) break;
        maxPastedR = Math.max(maxPastedR, targetR);

        const area = String(activeYLsList[targetR].area).substring(0, 3);
        const ylObj = copy[area] ? { ...copy[area] } : { pembagiTanggal: 25, days: {} };
        const daysObj = { ...ylObj.days };

        const pastedR = r % pastedHeight;
        const srcRow = parsedMatrix[pastedR] || [0];
        const rowLen = srcRow.length;

        for (let c = 0; c < targetWidth; c++) {
          const targetC = startC + c;
          if (targetC >= 124) break;
          maxPastedC = Math.max(maxPastedC, targetC);

          const pastedC = c % rowLen;
          const val = srcRow[pastedC] ?? 0;

          const day = Math.floor(targetC / 4) + 1;
          const item = items[targetC % 4];

          const dayObj = daysObj[String(day)] ? { ...daysObj[String(day)] } : { yo: 0, om: 0, os: 0, yt: 0 };
          dayObj[item] = val;
          daysObj[String(day)] = dayObj;
        }

        ylObj.days = daysObj;
        copy[area] = ylObj;
      }

      return copy;
    });

    setGridSelection({
      startR: startR,
      startC: startC,
      endR: maxPastedR,
      endC: maxPastedC
    });

    const rowCount = maxPastedR - startR + 1;
    const colCount = maxPastedC - startC + 1;
    setBreakdownMsg(`📋 ${rowCount} baris x ${colCount} kolom (${rowCount * colCount} sel) berhasil dipaste ke tabel!`);
    setTimeout(() => setBreakdownMsg(""), 3500);
  };

  // Lock viewport scroll and track pointer move while dragging grid selection or fill handle
  useEffect(() => {
    if (!isGridDragging && !isFillDragging) return;

    let rafId: number | null = null;
    let lastClientX = -1;
    let lastClientY = -1;

    const processPointerMove = () => {
      rafId = null;
      if (lastClientX < 0 || lastClientY < 0) return;
      const rawEl = document.elementFromPoint(lastClientX, lastClientY);
      if (!rawEl) return;
      const targetEl = (rawEl instanceof Element ? rawEl : (rawEl as any)?.parentElement) as HTMLElement | null;
      if (!targetEl || typeof targetEl.closest !== "function") return;
      const tdEl = targetEl.closest("td[data-r]");
      if (tdEl) {
        const r = parseInt(tdEl.getAttribute("data-r") || "-1", 10);
        const c = parseInt(tdEl.getAttribute("data-c") || "-1", 10);
        if (r >= 0 && c >= 0) {
          if (isFillDragging) {
            setFillHoverCell(prev => (prev && prev.r === r && prev.c === c) ? prev : { r, c });
          } else if (isGridDragging) {
            setGridSelection(prev => {
              const startR = breakdownAnchorRef.current ? breakdownAnchorRef.current.r : (prev ? prev.startR : r);
              const startC = breakdownAnchorRef.current ? breakdownAnchorRef.current.c : (prev ? prev.startC : c);
              if (prev && prev.startR === startR && prev.startC === startC && prev.endR === r && prev.endC === c) return prev;
              return { startR, startC, endR: r, endC: c };
            });
          }
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      if (rafId === null) {
        rafId = requestAnimationFrame(processPointerMove);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        if (e.cancelable) {
          e.preventDefault();
        }
        const touch = e.touches[0];
        if (touchStartRef.current) {
          const dx = Math.abs(touch.clientX - touchStartRef.current.clientX);
          const dy = Math.abs(touch.clientY - touchStartRef.current.clientY);
          if (dx > 6 || dy > 6) {
            touchStartRef.current.hasMoved = true;
          }
        }
        lastClientX = touch.clientX;
        lastClientY = touch.clientY;
        if (rafId === null) {
          rafId = requestAnimationFrame(processPointerMove);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [isGridDragging, isFillDragging]);

  useEffect(() => {
    const handleGlobalDragUp = () => {
      if (touchStartRef.current) {
        const { r, c, hasMoved, isInsideSelection } = touchStartRef.current;
        if (!hasMoved) {
          if (isInsideSelection) {
            setIsBreakdownMenuOpen(prev => !prev);
            setBreakdownMenuPos({ x: touchStartRef.current.clientX, y: touchStartRef.current.clientY });
          } else {
            setIsBreakdownMenuOpen(false);
            setGridSelection({ startR: r, startC: c, endR: r, endC: c });
          }
        }
        touchStartRef.current = null;
      }
      breakdownAnchorRef.current = null;

      if (isFillDragging) {
        if (gridSelection && fillHoverCell) {
          const minR = Math.min(gridSelection.startR, gridSelection.endR);
          const maxR = Math.max(gridSelection.startR, gridSelection.endR);
          const minC = Math.min(gridSelection.startC, gridSelection.endC);
          const maxC = Math.max(gridSelection.startC, gridSelection.endC);

          const targetMinR = Math.min(minR, fillHoverCell.r);
          const targetMaxR = Math.max(maxR, fillHoverCell.r);
          const targetMinC = Math.min(minC, fillHoverCell.c);
          const targetMaxC = Math.max(maxC, fillHoverCell.c);

          const srcHeight = maxR - minR + 1;
          const srcWidth = maxC - minC + 1;
          const items: Array<"yo" | "om" | "os" | "yt"> = ["yo", "om", "os", "yt"];

          if (targetMinR < minR || targetMaxR > maxR || targetMinC < minC || targetMaxC > maxC) {
            updateActiveGridMap(prev => {
              const copy = { ...prev };
              for (let r = targetMinR; r <= targetMaxR; r++) {
                if (r >= activeYLsList.length) continue;
                const area = String(activeYLsList[r].area).substring(0, 3);
                const ylObj = copy[area] ? { ...copy[area] } : { pembagiTanggal: 25, days: {} };
                const daysObj = { ...ylObj.days };

                const rOffset = ((r - minR) % srcHeight + srcHeight) % srcHeight;
                const srcR = minR + rOffset;
                const srcArea = String(activeYLsList[srcR].area).substring(0, 3);
                const srcYlObj = prev[srcArea] || { days: {} };

                for (let c = targetMinC; c <= targetMaxC; c++) {
                  if (c >= 124) continue;
                  if (r >= minR && r <= maxR && c >= minC && c <= maxC) continue;

                  const cOffset = ((c - minC) % srcWidth + srcWidth) % srcWidth;
                  const srcC = minC + cOffset;
                  const srcDay = Math.floor(srcC / 4) + 1;
                  const srcItem = items[srcC % 4];
                  const val = srcYlObj.days?.[String(srcDay)]?.[srcItem] || 0;

                  const targetDay = Math.floor(c / 4) + 1;
                  const targetItem = items[c % 4];

                  const dayObj = daysObj[String(targetDay)] ? { ...daysObj[String(targetDay)] } : { yo: 0, om: 0, os: 0, yt: 0 };
                  dayObj[targetItem] = val;
                  daysObj[String(targetDay)] = dayObj;
                }
                ylObj.days = daysObj;
                copy[area] = ylObj;
              }
              return copy;
            });

            setGridSelection({
              startR: targetMinR,
              startC: targetMinC,
              endR: targetMaxR,
              endC: targetMaxC
            });

            const filledCount = (targetMaxR - targetMinR + 1) * (targetMaxC - targetMinC + 1) - (srcHeight * srcWidth);
            setBreakdownMsg(`✨ ${filledCount} sel berhasil ditarik & diisi otomatis (Fill Handle)!`);
            setTimeout(() => setBreakdownMsg(""), 3000);
          }
        }
        setIsFillDragging(false);
        setFillHoverCell(null);
      }
      setIsGridDragging(false);
    };

    window.addEventListener("mouseup", handleGlobalDragUp);
    window.addEventListener("touchend", handleGlobalDragUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalDragUp);
      window.removeEventListener("touchend", handleGlobalDragUp);
    };
  }, [isFillDragging, fillHoverCell, gridSelection, activeYLsList]);

  const [selectedYLArea, setSelectedYLArea] = useState<string>("201");
  const [ylDetail, setYLDetail] = useState<any>(null);
      const [aiInsight, setAiInsight] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [scriptUrlInput, setScriptUrlInput] = useState<string>(scriptUrl || "");

  // Kirim ke DP1 state

  // 20 YL List state
  const [newYlArea, setNewYlArea] = useState<string>("");

  const [newYlNoHP, setNewYlNoHP] = useState("");
  const [newYlAlamat, setNewYlAlamat] = useState("");

  const [newYlNama, setNewYlNama] = useState<string>("");
  const [newYlPin, setNewYlPin] = useState<string>("");
  const [newYlKode, setNewYlKode] = useState<string>("");
  const [newYlTanggalMasuk, setNewYlTanggalMasuk] = useState<string>("");
  const [newYlNik, setNewYlNik] = useState<string>("");
  const [newYlTglLahir, setNewYlTglLahir] = useState<string>("");
  const [newYlIkutJht, setNewYlIkutJht] = useState<boolean>(true);
  const [newYlIuranJht, setNewYlIuranJht] = useState<number>(24000);
  const [ylSavedMsg, setYlSavedMsg] = useState<string>("");
  const [ylToDelete, setYlToDelete] = useState<{ idx: number; yl: any } | null>(null);
  const [isDeletingYl, setIsDeletingYl] = useState<boolean>(false);

  // Compensation Config state
  const [compConfig, setCompConfig] = useState<any>({
    tiers: [
      { threshold: 0, rate: 338 },
      { threshold: 200, rate: 374 },
      { threshold: 250, rate: 409 },
      { threshold: 280, rate: 417 },
      { threshold: 300, rate: 424 },
      { threshold: 330, rate: 428 },
      { threshold: 350, rate: 432 }
    ],
    pphRate: 2.5,
    jkkJkm: 18800,
    jht: 24000
  });
  const [compSavedMsg, setCompSavedMsg] = useState<string>("");

  // Reset Data state
  const [resetScope, setResetScope] = useState<"current_month" | "all">("current_month");
  const [resetSelectedMonth, setResetSelectedMonth] = useState<string>(() => globalMonth || new Date().toISOString().substring(0, 7));
  const [showTargetedResetModal, setShowTargetedResetModal] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string>("");

  // Manager Realisasi Input state

  const [targetTKU, setTargetTKU] = useState<{ target: number; bln_lalu: number; thn_lalu: number }>({
    target: 0,
    bln_lalu: 0,
    thn_lalu: 0
  });
  const [targetYLMap, setTargetYLMap] = useState<Record<string, { target: number; bln_lalu: number; thn_lalu: number }>>({});

  const activeTargetYLMap = (isViewingHistoricalMonth && historicalDataSnapshot?.targetYLMap)
    ? historicalDataSnapshot.targetYLMap
    : targetYLMap;

  const monthlyGridStats = useMemo(() => {
    const activeYLs = activeYLsList.filter((y: any) => y.status !== "nonaktif");
    const sumTarget = activeYLs.reduce((sum: number, yl: any) => sum + (Number(activeTargetYLMap?.[yl.area]?.target) || 0), 0);
    const sumBL = activeYLs.reduce((sum: number, yl: any) => sum + (Number(activeTargetYLMap?.[yl.area]?.bln_lalu) || 0), 0);
    const sumTL = activeYLs.reduce((sum: number, yl: any) => sum + (Number(activeTargetYLMap?.[yl.area]?.thn_lalu) || 0), 0);
    
    const pembagi = getEffectivePembagi(activeGridMap);

    const totalTarget = Math.trunc(sumTarget) * pembagi;
    const totalBL = Math.trunc(sumBL) * pembagi;
    const totalTL = Math.trunc(sumTL) * pembagi;
    
    const grandTotal = monthlyGridTotals.total;
    
    const pctTgt = totalTarget > 0 ? (grandTotal / totalTarget) * 100 : 0;
    const pctBL = totalBL > 0 ? (grandTotal / totalBL) * 100 : 0;
    const pctTL = totalTL > 0 ? (grandTotal / totalTL) * 100 : 0;

    const diffTarget = grandTotal - totalTarget;
    const diffBL = grandTotal - totalBL;
    const diffTL = grandTotal - totalTL;

    return {
      sumTarget, sumBL, sumTL,
      totalTarget, totalBL, totalTL,
      pctTgt, pctBL, pctTL,
      diffTarget, diffBL, diffTL,
      grandTotal, pembagi
    };
  }, [activeYLsList, activeTargetYLMap, activeGridMap, monthlyGridTotals]);

  // Kompensasi bersih per YL (mengikuti mode aktif: Breakdown atau Realisasi) + total tim
  const kompenBersihByArea = useMemo(() => {
    const pembagi = getEffectivePembagi(activeGridMap);
    const map: Record<string, number> = {};
    let sum = 0;
    ylList.filter((y: any) => y.status !== "nonaktif").forEach((yl: any) => {
      const area = String(yl.area).substring(0, 3);
      let total = 0;
      Object.values(activeGridMap?.[area]?.days || {}).forEach((d: any) => {
        total += (Number(d?.yo) || 0) + (Number(d?.om) || 0) + (Number(d?.os) || 0) + (Number(d?.yt) || 0);
      });
      const v = calcKompenBersih(total, pembagi, yl, compConfig);
      map[area] = v;
      sum += v;
    });
    return { map, sum };
  }, [ylList, activeGridMap, compConfig]);

  // Informasi dan deteksi tanggal-tanggal yang sudah terealisasi pada bulan aktif
  const realizedDaysInfo = useMemo(() => {
    const realMap = activeBreakdownRealisasiMap;
    const realizedDays: number[] = [];
    let totRealizedSales = 0;

    for (let d = 1; d <= 31; d++) {
      let dayTeamTotal = 0;
      Object.values(realMap || {}).forEach((ylData: any) => {
        const dObj = ylData?.days?.[String(d)] || ylData?.days?.[d];
        if (dObj) {
          dayTeamTotal += (Number(dObj.yo) || 0) + (Number(dObj.om) || 0) + (Number(dObj.os) || 0) + (Number(dObj.yt) || 0);
        }
      });
      if (dayTeamTotal > 0) {
        realizedDays.push(d);
        totRealizedSales += dayTeamTotal;
      }
    }

    const pembagi = monthlyGridStats.pembagi || 25;
    const sisaHari = Math.max(0, pembagi - realizedDays.length);
    const kekuranganTarget = Math.max(0, monthlyGridStats.totalTarget - totRealizedSales);
    const sisaTarget = monthlyGridStats.totalTarget - totRealizedSales;
    const sisaBL = monthlyGridStats.totalBL - totRealizedSales;
    const sisaTL = monthlyGridStats.totalTL - totRealizedSales;
    const rata2Dibutuhkan = sisaHari > 0 ? Math.trunc(kekuranganTarget / sisaHari) : 0;

    return {
      realizedDays,
      totRealizedSales,
      minDay: realizedDays.length > 0 ? Math.min(...realizedDays) : 0,
      maxDay: realizedDays.length > 0 ? Math.max(...realizedDays) : 0,
      sisaHari,
      kekuranganTarget,
      sisaTarget,
      sisaBL,
      sisaTL,
      rata2Dibutuhkan,
    };
  }, [activeBreakdownRealisasiMap, monthlyGridStats]);

  const getTargetCellValue = useCallback((r: number, c: number) => {
    const yl = activeYLsList[r];
    if (!yl) return 0;
    const targetMapToUse = (isViewingHistoricalMonth && historicalDataSnapshot?.targetYLMap) ? historicalDataSnapshot.targetYLMap : targetYLMap;
    const tgt = targetMapToUse[yl.area] ?? { target: 0, bln_lalu: 0, thn_lalu: 0 };
    const fields = ["target", "bln_lalu", "thn_lalu"] as const;
    return tgt[fields[c]] ?? 0;
  }, [activeYLsList, targetYLMap, isViewingHistoricalMonth, historicalDataSnapshot]);

  const setTargetBatchCellValues = useCallback((updates: { r: number; c: number; val: number | string }[]) => {
    handleUpdateTargetYLMap((prev: any) => {
      const next = { ...prev };
      const fields = ["target", "bln_lalu", "thn_lalu"] as const;
      updates.forEach(({ r, c, val }) => {
        const yl = activeYLsList[r];
        if (!yl) return;
        const numVal = parseIndonesianDecimal(val);
        const existing = next[yl.area] ?? { target: 0, bln_lalu: 0, thn_lalu: 0 };
        next[yl.area] = { ...existing, [fields[c]]: numVal };
      });
      return next;
    });
  }, [activeYLsList, handleUpdateTargetYLMap]);

  const {
    selection: targetGridSelection,
    setSelection: setTargetGridSelection,
    isMenuOpen: targetIsMenuOpen,
    setIsMenuOpen: setTargetIsMenuOpen,
    menuPos: targetMenuPos,
    getCellProps: getTargetCellProps,
    renderSelectionHandle: renderTargetSelectionHandle,
    activeCell: targetActiveCell,
    setActiveCell: setTargetActiveCell,
    activeCellValue: targetActiveCellValue,
    isActiveCellEditable: isTargetActiveCellEditable,
    handleActiveCellValueChange: handleTargetActiveCellValueChange,
    goToNextCell: goToNextTargetCell,
    goToPrevCell: goToPrevTargetCell,
    selectColumn: selectTargetColumn,
    selectRow: selectTargetRow,
    setIsDragging: setIsTargetDragging,
    handleCopy: handleTargetGridCopy,
    handleCut: handleTargetGridCut,
    handlePaste: handleTargetGridPaste,
    handleClear: handleTargetGridClear,
    clipboardModal: targetClipboardModal,
    confirmManualPaste: targetConfirmManualPaste,
    closeClipboardModal: closeTargetClipboardModal,
  } = useSimpleGrid({
    totalRows: activeYLsList.length,
    totalCols: 3,
    getCellValue: getTargetCellValue,
    setBatchCellValues: setTargetBatchCellValues
  });


  // Baris grid: 0 = Target TKU, 1 = Bulan Lalu TKU, 2 = Tahun Lalu TKU
  const TKU_ROW_PREFIXES = ["target", "bln_lalu", "thn_lalu"] as const;

  const getTargetTKUCellValue = useCallback((r: number, c: number) => {
    const prefix = TKU_ROW_PREFIXES[r] ?? "target";
    const suffixes = ["_yo", "_om", "_os", "_yt"] as const;
    const key = `${prefix}${suffixes[c]}`;
    const tkuToUse = (isViewingHistoricalMonth && historicalDataSnapshot?.targetTKU) ? historicalDataSnapshot.targetTKU : targetTKU;
    return ((tkuToUse as any)[key] as number | undefined) ?? 0;
  }, [targetTKU, isViewingHistoricalMonth, historicalDataSnapshot]);

  const setTargetTKUBatchCellValues = useCallback((updates: { r: number; c: number; val: number | string }[]) => {
    handleUpdateTargetTKU(prev => {
      let next = { ...prev };
      const suffixes = ["_yo", "_om", "_os", "_yt"] as const;
      updates.forEach(({ r, c, val }) => {
        const prefix = TKU_ROW_PREFIXES[r] ?? "target";
        const key = `${prefix}${suffixes[c]}`;
        const numVal = parseIndonesianNumber(val);
        next = { ...next, [key]: numVal };
      });
      TKU_ROW_PREFIXES.forEach(prefix => {
        const yo = (next as any)[`${prefix}_yo`] ?? 0;
        const om = (next as any)[`${prefix}_om`] ?? 0;
        const os = (next as any)[`${prefix}_os`] ?? 0;
        const yt = (next as any)[`${prefix}_yt`] ?? 0;
        (next as any)[prefix] = yo + om + os + yt;
      });
      return next;
    });
  }, [handleUpdateTargetTKU]);

  const {
    selection: tkuGridSelection,
    setSelection: setTkuGridSelection,
    isMenuOpen: tkuIsMenuOpen,
    setIsMenuOpen: setTkuIsMenuOpen,
    menuPos: tkuMenuPos,
    getCellProps: getTkuCellProps,
    renderSelectionHandle: renderTkuSelectionHandle,
    activeCell: tkuActiveCell,
    setActiveCell: setTkuActiveCell,
    activeCellValue: tkuActiveCellValue,
    isActiveCellEditable: isTkuActiveCellEditable,
    handleActiveCellValueChange: handleTkuActiveCellValueChange,
    goToNextCell: goToNextTkuCell,
    goToPrevCell: goToPrevTkuCell,
    handleCopy: handleTkuGridCopy,
    handleCut: handleTkuGridCut,
    handlePaste: handleTkuGridPaste,
    handleClear: handleTkuGridClear,
    clipboardModal: tkuClipboardModal,
    confirmManualPaste: tkuConfirmManualPaste,
    closeClipboardModal: closeTkuClipboardModal,
  } = useSimpleGrid({
    totalRows: 3,
    totalCols: 4,
    getCellValue: getTargetTKUCellValue,
    setBatchCellValues: setTargetTKUBatchCellValues
  });

  // Fix: kedua grid (Target per-YL & TKU) hidup di tab yang sama, jadi harus
  // saling menutup input bar masing-masing supaya tidak tumpang tindih.
  useEffect(() => {
    if (targetActiveCell) setTkuActiveCell(null);
  }, [targetActiveCell, setTkuActiveCell]);
  useEffect(() => {
    if (tkuActiveCell) setTargetActiveCell(null);
  }, [tkuActiveCell, setTargetActiveCell]);

  const getTargetGridCellLabel = useCallback((r: number, c: number) => {
    const yl = activeYLsList[r];
    const colNames = ["Target", "Bulan Lalu", "Tahun Lalu"];
    if (!yl) return colNames[c] ?? "";
    return `[${yl.area}] ${String(yl.nama || "").replace(/^\d+\s*/, "")} • ${colNames[c] ?? ""}`;
  }, [activeYLsList]);

  const getTkuGridCellLabel = useCallback((r: number, c: number) => {
    const rowNames = ["Target Bulan Ini", "Realisasi Bulan Lalu", "Realisasi Tahun Lalu"];
    const colNames = ["Original (YO)", "Original Mangga (OM)", "Original Stroberi (OS)", "Yakult Light (YT)"];
    return `TKU • ${rowNames[r] ?? ""} • ${colNames[c] ?? ""}`;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (e.key === "Delete" || e.key === "Backspace") {
        if (targetTag !== "input" && targetTag !== "textarea") {
          e.preventDefault();
          if (activeTab === "breakdown" && breakdownGridSelectionNew) handleBreakdownGridClear();
          else if (activeTab === "target_kompensasi") {
             if (targetGridSelection) handleTargetGridClear();
             if (tkuGridSelection) handleTkuGridClear();
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (targetTag !== "input" && targetTag !== "textarea") {
          e.preventDefault();
          if (activeTab === "breakdown") {
             if (e.shiftKey) handleRedo();
             else handleUndo();
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        if (targetTag !== "input" && targetTag !== "textarea") {
          e.preventDefault();
          if (activeTab === "breakdown") handleRedo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (targetTag !== "input" && targetTag !== "textarea") {
          if (activeTab === "breakdown" && breakdownGridSelectionNew) {
            handleBreakdownGridCopy();
          } else if (activeTab === "target_kompensasi") {
            if (targetGridSelection) handleTargetGridCopy();
            if (tkuGridSelection) handleTkuGridCopy();
          }
        }
      }
    };

    const handleWindowPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === "textarea") return;
      const text = e.clipboardData?.getData("text/plain");
      if (text) {
        const clean = text.trim();
        if (targetTag !== "input" || /[\t\n\r]/.test(clean)) {
          e.preventDefault();
          if (activeTab === "breakdown" && breakdownGridSelectionNew) handleBreakdownGridPaste(text);
          else if (activeTab === "target_kompensasi") {
            if (targetGridSelection) handleTargetGridPaste(text);
            if (tkuGridSelection) handleTkuGridPaste(text);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [
    activeTab, gridSelection,
    targetGridSelection, tkuGridSelection,
    handleClearSelectedGridCells, handleTargetGridClear, handleTkuGridClear,
    handleCopyGridCells, handleTargetGridCopy, handleTkuGridCopy,
    handlePasteIntoGrid, handleTargetGridPaste, handleTkuGridPaste,
    handleUndo, handleRedo
  ]);


  // Kosongkan seleksi grid Target saat pindah tab, supaya shortcut keyboard
  // (Ctrl+C/V/Delete) milik hook ini tidak "nyangkut" aktif di tab lain.
  useEffect(() => {
    if (activeTab !== "target_kompensasi") {
      setTargetGridSelection(null);
    }
  }, [activeTab]);

  // Fetch initial YL List, Compensation Config & Setting Targets
  useEffect(() => {
    safeFetchJson("/api/getYlList").then(res => {
      if (res && res.ylList && Array.isArray(res.ylList) && res.ylList.length > 0) {
        const cleaned = res.ylList.map((y: any) => ({
          ...y,
          nama: cleanYlName(y.nama)
        }));
        setYlList(cleaned);
        saveStoredYlData(cleaned);
      } else {
        const localList = getStoredYlList();
        setYlList(localList);
      }
    }).catch(() => {
      setYlList(getStoredYlList());
    });
    safeFetchJson("/api/getCompensationConfig").then(res => {
      if (res && res.config) {
        setCompConfig(res.config);
      }
    });
  }, []);

  // Target TKU & Target YL synchronization per globalMonth
  useEffect(() => {
    if (!globalMonth) return;

    // 1. Restore from localStorage for instant display
    try {
      const cachedTku = localStorage.getItem(`target_tku_${globalMonth}`);
      if (cachedTku) {
        const parsed = JSON.parse(cachedTku);
        if (parsed && typeof parsed === "object") setTargetTKU(parsed);
      }
      const cachedYl = localStorage.getItem(`target_yl_${globalMonth}`);
      if (cachedYl) {
        const parsed = JSON.parse(cachedYl);
        if (parsed && typeof parsed === "object") setTargetYLMap(parsed);
      }
    } catch (e) {}

    // 2. Fetch from server for the specific month
    safeFetchJson(`/api/getSettingTargets?bulan=${globalMonth}`).then(res => {
      if (res) {
        if (res.targetTKU) {
          setTargetTKU(res.targetTKU);
          try {
            localStorage.setItem(`target_tku_${globalMonth}`, JSON.stringify(res.targetTKU));
          } catch (e) {}
        }
        if (res.targetYL) {
          setTargetYLMap(res.targetYL);
          try {
            localStorage.setItem(`target_yl_${globalMonth}`, JSON.stringify(res.targetYL));
          } catch (e) {}
        }
      }
    }).catch(err => {
      console.warn("Gagal mengambil data target bulan:", globalMonth, err);
    });
  }, [globalMonth]);

  // Sync targets to localStorage whenever they change
  useEffect(() => {
    try {
      if (targetTKU && globalMonth) {
        localStorage.setItem(`target_tku_${globalMonth}`, JSON.stringify(targetTKU));
      }
      if (targetYLMap && Object.keys(targetYLMap).length > 0 && globalMonth) {
        localStorage.setItem(`target_yl_${globalMonth}`, JSON.stringify(targetYLMap));
      }
    } catch (e) {}
  }, [targetTKU, targetYLMap, globalMonth]);

  // Local-First: Load from LocalStorage instantly on month change or tab change
  useEffect(() => {
    try {
      const localPlan = localStorage.getItem(`bd_plan_${globalMonth}`);
      const localRealisasi = localStorage.getItem(`bd_realisasi_${globalMonth}`);
      if (localPlan) {
        const parsed = JSON.parse(localPlan);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          setBreakdownPlanMap(parsed);
        }
      }
      if (localRealisasi) {
        const parsed = JSON.parse(localRealisasi);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          setBreakdownRealisasiMap(parsed);
        }
      }
    } catch (e) {
      console.warn("Gagal membaca cache lokal breakdown:", e);
    }
  }, [globalMonth]);

  // Sync state to LocalStorage immediately whenever breakdown maps update
  useEffect(() => {
    try {
      if (Object.keys(breakdownPlanMap).length > 0) {
        localStorage.setItem(`bd_plan_${globalMonth}`, JSON.stringify(breakdownPlanMap));
      }
      if (Object.keys(breakdownRealisasiMap).length > 0) {
        localStorage.setItem(`bd_realisasi_${globalMonth}`, JSON.stringify(breakdownRealisasiMap));
        // JANGAN dispatch "bd_realisasi_updated" dari sini: ManagerView sendiri mendengarkan event itu dan
        // memanggil fetchBreakdownPlan -> menimpa state dengan data server -> effect ini jalan lagi -> loop.
        // Itu yang membuat ketikan Pembagi langsung ditimpa kembali ke nilai lama (mis. 7).
      }
    } catch (e) {
      console.warn("Gagal menyimpan cache lokal breakdown:", e);
    }
  }, [breakdownPlanMap, breakdownRealisasiMap, globalMonth]);

  // Fetch Breakdown Plan & Realisasi from server & Supabase in background
  // Baca breakdown plan/realisasi HANYA dari server (satu sumber kebenaran).
  // Sebelumnya di sini juga cek Supabase langsung (key "bd_plan_{bulan}") dan
  // localStorage sebagai "cache" — ternyata itu yang bikin data lama bisa
  // muncul lagi setelah dihapus (reset), karena dua tempat itu tidak ikut
  // terhapus saat reset. Sekarang cukup satu jalur: server API.
  // Salinan "acuan" = isi terakhir yang dimuat dari SERVER untuk bulan tertentu. Dikirim saat simpan
  // supaya server hanya menerapkan sel yang benar-benar Admin ubah (gabungan 3 arah) — dengan begitu
  // layar Admin yang sudah basi tidak lagi menimpa data yang baru dimasukkan YL (mis. entry PJL).
  // null = belum pernah sukses dimuat dari server -> simpan OTOMATIS ditahan.
  const breakdownBaseRef = useRef<{ month: string; plan: any; real: any } | null>(null);

  const fetchBreakdownPlan = async (month: string = globalMonth) => {
    if (breakdownBaseRef.current && breakdownBaseRef.current.month !== month) breakdownBaseRef.current = null;
    const editVersionAtFetchStart = breakdownEditVersionRef.current;
    // true bila Admin sudah mengubah sesuatu (belum tersimpan) sejak/selama fetch ini berjalan.
    const hasUnsavedLocalEdits = () =>
      breakdownEditVersionRef.current !== editVersionAtFetchStart ||
      (isBreakdownDirtyRef.current && !!breakdownBaseRef.current && breakdownBaseRef.current.month === month);
    try {
      // Tampilkan data dari localStorage dulu sebagai fallback (mengembalikan data user yg sempat "hilang")
      const localPlan = localStorage.getItem(`bd_plan_${month}`);
      const localReal = localStorage.getItem(`bd_realisasi_${month}`);
      
      let initialPlan = {};
      let initialReal = {};
      
      if (localPlan) {
        try { initialPlan = JSON.parse(localPlan); } catch(e){}
      }
      if (localReal) {
        try { initialReal = JSON.parse(localReal); } catch(e){}
      }

      const res = await safeFetchJson(`/api/getBreakdownPlan?month=${month}`);
      if (res && res.ok) {
        // Gabungkan data dari localStorage dan server. Jika server kosong tapi localStorage ada, pakai localStorage.
        const serverPlan = res.breakdownPlan || {};
        const serverReal = res.breakdownRealisasi || {};
        
        const mergedPlan = Object.keys(serverPlan).length > 0 ? serverPlan : initialPlan;
        const mergedReal = Object.keys(serverReal).length > 0 ? serverReal : initialReal;

        // Otomatis masukkan data tanggal yang sudah terealisasi ke dalam Breakdown Plan
        const realizedDays: number[] = [];
        for (let d = 1; d <= 31; d++) {
          let dayTeamTotal = 0;
          Object.values(mergedReal || {}).forEach((ylData: any) => {
            const dObj = ylData?.days?.[String(d)] || ylData?.days?.[d];
            if (dObj) {
              dayTeamTotal += (Number(dObj.yo) || 0) + (Number(dObj.om) || 0) + (Number(dObj.os) || 0) + (Number(dObj.yt) || 0);
            }
          });
          if (dayTeamTotal > 0) realizedDays.push(d);
        }

        const autoSyncedPlan: BreakdownGridMap = JSON.parse(JSON.stringify(mergedPlan || {}));
        if (realizedDays.length > 0) {
          Object.keys(mergedReal || {}).forEach((area) => {
            if (!autoSyncedPlan[area]) {
              autoSyncedPlan[area] = {
                pembagiTanggal: mergedReal[area]?.pembagiTanggal || 25,
                days: {}
              };
            }
            if (!autoSyncedPlan[area].days) autoSyncedPlan[area].days = {};

            realizedDays.forEach((d) => {
              const dStr = String(d);
              const rDay = mergedReal[area]?.days?.[dStr] || mergedReal[area]?.days?.[d] || { yo: 0, om: 0, os: 0, yt: 0 };
              autoSyncedPlan[area].days[dStr] = {
                yo: Number(rDay.yo) || 0,
                om: Number(rDay.om) || 0,
                os: Number(rDay.os) || 0,
                yt: Number(rDay.yt) || 0
              };
            });
          });
        }

        if (hasUnsavedLocalEdits()) {
          // Ada perubahan Admin yang belum tersimpan -> JANGAN timpa layar dengan data server (lama).
          // Acuan (base) lama dipertahankan agar penyimpanan gabungan 3 arah tetap benar;
          // kalau belum ada acuan sama sekali, pakai data server ini.
          if (!breakdownBaseRef.current || breakdownBaseRef.current.month !== month) {
            breakdownBaseRef.current = {
              month,
              plan: JSON.parse(JSON.stringify(autoSyncedPlan)),
              real: JSON.parse(JSON.stringify(serverReal)),
            };
          }
        } else {
          setBreakdownPlanMap(autoSyncedPlan);
          setBreakdownRealisasiMap(mergedReal);
          breakdownBaseRef.current = {
            month,
            plan: JSON.parse(JSON.stringify(autoSyncedPlan)),
            real: JSON.parse(JSON.stringify(serverReal)),
          };

          // Save back to localStorage to keep it updated
          localStorage.setItem(`bd_plan_${month}`, JSON.stringify(autoSyncedPlan));
          localStorage.setItem(`bd_realisasi_${month}`, JSON.stringify(mergedReal));
        }
      } else {
        // Fallback to local storage only
        if (!hasUnsavedLocalEdits()) {
          setBreakdownPlanMap(initialPlan);
          setBreakdownRealisasiMap(initialReal);
          breakdownBaseRef.current = null; // tidak ada acuan dari server -> jangan simpan otomatis
        }
      }
    } catch (e) {
      console.error("Error fetching breakdown plan:", e);
    }
  };

  // Sinkronisasi manual/eksplisit data tanggal terealisasi ke dalam Breakdown Plan
  const handleSyncRealisasiToBreakdown = useCallback(() => {
    const realMap = breakdownRealisasiMap;
    const planMap = breakdownPlanMap;

    const realizedDays: number[] = [];
    for (let d = 1; d <= 31; d++) {
      let dayTeamTotal = 0;
      Object.values(realMap || {}).forEach((ylData: any) => {
        const dObj = ylData?.days?.[String(d)] || ylData?.days?.[d];
        if (dObj) {
          dayTeamTotal += (Number(dObj.yo) || 0) + (Number(dObj.om) || 0) + (Number(dObj.os) || 0) + (Number(dObj.yt) || 0);
        }
      });
      if (dayTeamTotal > 0) realizedDays.push(d);
    }

    if (realizedDays.length === 0) {
      setBreakdownMsg("ℹ️ Belum ada tanggal yang terealisasi pada bulan ini.");
      setTimeout(() => setBreakdownMsg(""), 3000);
      return;
    }

    const nextPlan: BreakdownGridMap = JSON.parse(JSON.stringify(planMap || {}));
    Object.keys(realMap || {}).forEach((area) => {
      if (!nextPlan[area]) {
        nextPlan[area] = { pembagiTanggal: realMap[area]?.pembagiTanggal || 25, days: {} };
      }
      if (!nextPlan[area].days) nextPlan[area].days = {};

      realizedDays.forEach((d) => {
        const dStr = String(d);
        const rDay = realMap[area]?.days?.[dStr] || realMap[area]?.days?.[d] || { yo: 0, om: 0, os: 0, yt: 0 };
        nextPlan[area].days[dStr] = {
          yo: Number(rDay.yo) || 0,
          om: Number(rDay.om) || 0,
          os: Number(rDay.os) || 0,
          yt: Number(rDay.yt) || 0
        };
      });
    });

    setBreakdownPlanMap(nextPlan);
    localStorage.setItem(`bd_plan_${globalMonth}`, JSON.stringify(nextPlan));
    isBreakdownDirtyRef.current = true;
    const minD = Math.min(...realizedDays);
    const maxD = Math.max(...realizedDays);
    setBreakdownMsg(`✅ Data tanggal terealisasi (Tgl ${minD}${maxD > minD ? ` - ${maxD}` : ""}) berhasil dimasukkan ke Breakdown! (${realizedDays.length} hari terlaksana)`);
    setTimeout(() => setBreakdownMsg(""), 4000);
  }, [breakdownPlanMap, breakdownRealisasiMap, globalMonth]);

  useEffect(() => {
    fetchBreakdownPlan(globalMonth);
    
    const handleSyncEvent = () => {
      fetchBreakdownPlan(globalMonth);
    };
    window.addEventListener("lhpp_saved", handleSyncEvent);
    window.addEventListener("bd_realisasi_updated", handleSyncEvent);
    return () => {
      window.removeEventListener("lhpp_saved", handleSyncEvent);
      window.removeEventListener("bd_realisasi_updated", handleSyncEvent);
    };
  }, [globalMonth]);

  const breakdownPlanMapRef = useRef(breakdownPlanMap);
  const breakdownRealisasiMapRef = useRef(breakdownRealisasiMap);
  const isBreakdownDirtyRef = useRef(false);
  const breakdownEditVersionRef = useRef(0);

  useEffect(() => {
    breakdownPlanMapRef.current = breakdownPlanMap;
    breakdownRealisasiMapRef.current = breakdownRealisasiMap;
  }, [breakdownPlanMap, breakdownRealisasiMap]);

  // Save on unmount / logout
  useEffect(() => {
    return () => {
      // Dulu dikirim TANPA SYARAT (walau tidak ada yang diubah) dan menimpa seluruh data bulan itu
      // dengan salinan lama. Sekarang hanya kalau ada perubahan belum tersimpan DAN ada acuan dari server.
      const base = breakdownBaseRef.current;
      if (
        isBreakdownDirtyRef.current && base && base.month === globalMonth &&
        (Object.keys(breakdownPlanMapRef.current).length > 0 || Object.keys(breakdownRealisasiMapRef.current).length > 0)
      ) {
        fetch("/api/saveBreakdownPlan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month: globalMonth,
            breakdownPlan: breakdownPlanMapRef.current,
            breakdownRealisasi: breakdownRealisasiMapRef.current,
            baseBreakdownPlan: base.plan,
            baseBreakdownRealisasi: base.real
          }),
          keepalive: true
        }).catch(() => {});
      }
    };
  }, [globalMonth]);

  // Auto-save Breakdown
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isBreakdownSaving && isBreakdownDirtyRef.current && (Object.keys(breakdownPlanMap).length > 0 || Object.keys(breakdownRealisasiMap).length > 0)) {
        handleSaveBreakdownPlan();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [breakdownPlanMap, breakdownRealisasiMap, isBreakdownSaving]);

  // Handler: Save Breakdown Plan & Realisasi (hanya lewat server, satu sumber kebenaran)
  const handleSaveBreakdownPlan = async (isManual = false) => {
    if (!isManual && !isBreakdownDirtyRef.current) return; // Prevent unnecessary save
    const base = breakdownBaseRef.current && breakdownBaseRef.current.month === globalMonth ? breakdownBaseRef.current : null;
    // Simpan otomatis ditahan kalau data belum pernah sukses dimuat dari server (risiko menimpa data asli).
    if (!isManual && !base) return;
    const editVersionAtSave = breakdownEditVersionRef.current;
    setIsBreakdownSaving(true);
    try {
      const payloadStr = JSON.stringify({
          month: globalMonth,
          breakdownPlan: breakdownPlanMap,
          breakdownRealisasi: breakdownRealisasiMap,
          ...(base ? { baseBreakdownPlan: base.plan, baseBreakdownRealisasi: base.real } : {})
        });
      console.log("Saving breakdown, payload size:", payloadStr.length);
      const res = await fetch("/api/saveBreakdownPlan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payloadStr
      });
      console.log("Save breakdown status:", res.status);
      if (!res.ok) {
        const errText = await res.text();
        console.error("Save breakdown error response:", errText.substring(0, 500));
        if (isManual) alert("Gagal menyimpan data breakdown: Server merespon " + res.status);
        return;
      }
      const resData = await res.json();
      if (resData && resData.ok) {
        // Hanya bersihkan kalau tidak ada edit baru selama request berjalan
        if (breakdownEditVersionRef.current === editVersionAtSave) {
          isBreakdownDirtyRef.current = false;
          // Adopsi hasil gabungan dari server (memuat data YL yang masuk sejak Admin memuat layar)
          // dan jadikan acuan baru. Kalau ada edit baru selama request, acuan lama dipertahankan.
          if (base && resData.breakdownRealisasi && resData.breakdownPlan) {
            breakdownBaseRef.current = {
              month: globalMonth,
              plan: JSON.parse(JSON.stringify(resData.breakdownPlan)),
              real: JSON.parse(JSON.stringify(resData.breakdownRealisasi)),
            };
            setBreakdownPlanMap(resData.breakdownPlan);
            setBreakdownRealisasiMap(resData.breakdownRealisasi);
          }
        }
        if (onRefresh) await onRefresh();
        if (isManual) alert("Berhasil menyimpan data breakdown!");
      } else {
        console.error("Gagal menyimpan data breakdown ke server, resData:", resData);
        if (isManual) alert("Gagal menyimpan data breakdown ke server.");
      }
    } catch (e: any) {
      console.error("Error: " + (e.message || "Gagal menyimpan"));
    } finally {
      setIsBreakdownSaving(false);
    }
  };

  // Export full JSON Backup file
  const handleExportBackupJson = async () => {
    try {
      setBreakdownMsg("⏳ Menyiapkan file cadangan (backup JSON)...");
      let serverDb: any = null;
      try {
        const res = await safeFetchJson("/api/getData");
        if (res && typeof res === "object") {
          serverDb = res;
        }
      } catch (e) {
        console.warn("Could not fetch server DB for backup:", e);
      }

      const backupData = {
        app: "Yakult Lady Management System DP Jember 1",
        version: "2.0-Hybrid",
        exportedAt: new Date().toISOString(),
        month: globalMonth,
        breakdownPlan: breakdownPlanMap,
        breakdownRealisasi: breakdownRealisasiMap,
        ylList,
        targetTKU,
        targetYL: targetYLMap,
        motivasiConfig,
        kontesConfig,
        serverDatabase: serverDb
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
      const filename = `Backup_Yakult_Jember1_${globalMonth}_${new Date().toISOString().slice(0, 10)}.json`;
      
      await downloadBlob(blob, {
        filename,
        mimeType: "application/json"
      });

      setBreakdownMsg("✅ Backup file JSON berhasil diunduh!");
      setTimeout(() => setBreakdownMsg(""), 3500);
      alert("✅ Backup Data JSON berhasil diunduh!");
    } catch (e: any) {
      alert("Gagal mengekspor backup JSON: " + e.message);
    }
  };

  // Import JSON Backup file
  const handleImportBackupJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const content = evt.target?.result as string;
        const data = JSON.parse(content);

        if (!data || typeof data !== "object") {
          throw new Error("Format file JSON tidak valid.");
        }

        let monthToUse = globalMonth;
        if (data.month) {
          monthToUse = data.month;
          setGlobalMonth(data.month);
        }

        if (data.breakdownPlan) {
          setBreakdownPlanMap(data.breakdownPlan);
          localStorage.setItem(`bd_plan_${monthToUse}`, JSON.stringify(data.breakdownPlan));
        }
        if (data.breakdownRealisasi) {
          setBreakdownRealisasiMap(data.breakdownRealisasi);
          localStorage.setItem(`bd_realisasi_${monthToUse}`, JSON.stringify(data.breakdownRealisasi));
        }
        if (data.targetTKU) {
          setTargetTKU(data.targetTKU);
          localStorage.setItem(`target_tku_${monthToUse}`, JSON.stringify(data.targetTKU));
        }
        if (data.targetYL) {
          setTargetYLMap(data.targetYL);
          localStorage.setItem(`target_yl_${monthToUse}`, JSON.stringify(data.targetYL));
        }
        if (data.ylList && Array.isArray(data.ylList)) {
          setYlList(data.ylList);
        }

        // Send to server import endpoint
        await safeFetchJson("/api/importBackup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });

        // Also save target & breakdown specifically
        safeFetchJson("/api/saveBreakdownPlan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month: monthToUse,
            breakdownPlan: data.breakdownPlan || breakdownPlanMap,
            breakdownRealisasi: data.breakdownRealisasi || breakdownRealisasiMap
          })
        }).catch(() => {});

        if (data.targetTKU || data.targetYL) {
          safeFetchJson("/api/saveSettingTargets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetTKU: data.targetTKU || targetTKU,
              targetYL: data.targetYL || targetYLMap,
              bulan: monthToUse
            })
          }).catch(() => {});
        }

        if (onRefresh) await onRefresh();

        setBreakdownMsg("🎉 Restore data dari file JSON berhasil!");
        setTimeout(() => setBreakdownMsg(""), 4000);
        alert("Restore Berhasil! Data dari file backup JSON telah diterapkan.");
      } catch (err: any) {
        alert("Gagal memproses file JSON: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Pembagi breakdown adalah pembagi sendiri (rencana target), dan pembagi realisasi
  // adalah pembagi menyeluruh (realisasi berjalan). Keduanya independen sesuai sub-mode aktif (BD / R).
  const handleGlobalPembagiChange = (val: number | string) => {
    const n = Math.min(31, Math.max(1, Math.trunc(Number(val))));
    if (!Number.isFinite(n)) return;

    const isSame = (m: BreakdownGridMap | null | undefined) => {
      const cur = m || {};
      const keys = Object.keys(cur);
      return keys.length > 0 && keys.every((k) => Number(cur[k]?.pembagiTanggal) === n) &&
        activeYLsList.every((yl: any) => cur[String(yl.area).substring(0, 3)]);
    };
    if (isSame(activeGridMap)) return;

    const apply = (prev: BreakdownGridMap): BreakdownGridMap => {
      const copy: BreakdownGridMap = { ...prev };
      Object.keys(copy).forEach((area) => {
        if (copy[area]) copy[area] = { ...copy[area], pembagiTanggal: n };
      });
      activeYLsList.forEach((yl: any) => {
        const area = String(yl.area).substring(0, 3);
        copy[area] = copy[area]
          ? { ...copy[area], pembagiTanggal: n }
          : { pembagiTanggal: n, days: {} };
      });
      return copy;
    };

    isBreakdownDirtyRef.current = true;
    breakdownEditVersionRef.current += 1;
    if (isViewingHistoricalMonth) {
      setHistoricalDataSnapshot((prevSnap: any) => {
        if (!prevSnap) return prevSnap;
        const targetKey = gridSubMode === "BD" ? "breakdownPlanMap" : "breakdownRealisasiMap";
        return {
          ...prevSnap,
          [targetKey]: apply(prevSnap[targetKey] || {}),
        };
      });
    } else {
      if (gridSubMode === "BD") {
        setBreakdownPlanMap((prev) => apply(prev));
      } else {
        setBreakdownRealisasiMap((prev) => apply(prev));
      }
    }
  };

  // Removed auto-fill baseline

  const [showArchiveEditor, setShowArchiveEditor] = useState(false);
  const [showTargetArsipTahunan, setShowTargetArsipTahunan] = useState(false);

  // Auto-save setting targets
  useEffect(() => {
    if (!isTargetDirtyRef.current) return;
    const timer = setTimeout(() => {
      if (Object.keys(targetYLMap).length > 0 || (targetTKU && (targetTKU.target > 0 || targetTKU.bln_lalu > 0 || targetTKU.thn_lalu > 0))) {
        handleSaveSettingTargets(true);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [targetTKU, targetYLMap]);

  // Handler: Save Setting Targets. silent=true dipakai oleh auto-save debounce
  // di bawah, supaya alert() gagal tidak muncul berulang tiap kali user ngetik
  // (alert bersifat blocking/modal, kalau dipasang di auto-save bisa bikin
  // popup nyerocos tiap 1.5 detik kalau koneksi/backend lagi bermasalah).
  const handleSaveSettingTargets = async (silent: boolean = false) => {
    if (isViewingHistoricalMonth && historicalDataSnapshot) {
      // Archive Mode: Upsert updated historicalDataSnapshot back to Supabase
      const mKey = selectedMonthlyArchive;
      const label = historicalMonthLabel || getIndonesianMonthLabel(mKey);
      setIsSbSyncing(true);
      try {
        const res = await saveToSupabase(`monthly_archive_${mKey}`, historicalDataSnapshot);
        if (!res.success) {
          throw new Error(res.error || "Gagal menyimpan perubahan target ke Supabase");
        }
        isTargetDirtyRef.current = false;
        setCompSavedMsg(`🎉 Target Arsip Bulan ${label} berhasil disimpan ke Supabase!`);
        setTimeout(() => setCompSavedMsg(""), 4000);
      } catch (e: any) {
        if (!silent) alert(`❌ Gagal menyimpan target arsip: ${e.message}`);
        else console.warn("[Auto-save arsip]:", e?.message || e);
      } finally {
        setIsSbSyncing(false);
      }
      return;
    }

    // Sebelumnya tidak ada indikator loading & tidak ada alert kalau gagal,
    // jadi kalau fetch gagal/lambat tombol ini kelihatan sama sekali tidak
    // bereaksi (beda dengan tombol simpan lain yang punya spinner + alert).
    if (!silent) setIsSavingTarget(true);
    try {
      const res = await safeFetchJson("/api/saveSettingTargets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetTKU,
          targetYL: targetYLMap,
          bulan: globalMonth || new Date().toISOString().substring(0, 7)
        })
      });
      if (res && res.ok) {
        isTargetDirtyRef.current = false;
        if (!silent) {
          setCompSavedMsg("✅ Data Target & Kompensasi berhasil disimpan!");
          setTimeout(() => setCompSavedMsg(""), 3000);
          if (onRefresh) await onRefresh();
        }
      } else if (!silent) {
        alert("❌ Gagal menyimpan data target. Periksa koneksi internet, lalu coba lagi.");
      } else {
        console.warn("[Auto-save target]: Response tidak ok atau koneksi terputus.");
      }
    } catch (e: any) {
      console.warn("Gagal menyimpan data target: " + (e?.message || e));
      if (!silent) alert(`❌ Gagal menyimpan data target: ${e?.message || "terjadi kesalahan tak terduga"}`);
    } finally {
      if (!silent) setIsSavingTarget(false);
    }
  };

  const [isFetchingArchiveTarget, setIsFetchingArchiveTarget] = useState(false);
  const [archiveTargetMsg, setArchiveTargetMsg] = useState("");

  const handleFetchTargetFromArchive = async () => {
    const monthToUse = isViewingHistoricalMonth && selectedMonthlyArchive
      ? selectedMonthlyArchive
      : (globalMonth || new Date().toISOString().substring(0, 7));

    setIsFetchingArchiveTarget(true);
    setArchiveTargetMsg("");
    try {
      const activeYls = ylList.filter((y: any) => y.status !== "nonaktif");
      const res = await lookupHistoricalTargetRealization(monthToUse, activeYls);

      // 1. Update Target YL Map with 2-digit decimal averages
      handleUpdateTargetYLMap((prev: any) => {
        const next = { ...prev };
        activeYls.forEach((yl: any) => {
          const area = yl.area;
          const prevEntry = next[area] || { target: 0, bln_lalu: 0, thn_lalu: 0 };
          next[area] = {
            ...prevEntry,
            bln_lalu: res.bulanLalu.perYL[area] ?? prevEntry.bln_lalu,
            thn_lalu: res.tahunLalu.perYL[area] ?? prevEntry.thn_lalu,
          };
        });
        return next;
      });

      // 2. Update Target TKU for Tim
      // Aturan spesifik user:
      // "Tapi khusus yang kolom tim itu gak usah ada angka desimal. Tapi ambil dari total dan buang angka belakangnya dan gak usah di bulatkan. Misal 3550,90 jadinya 3550. Tapi untuk total 10 yl tsb itu tetep pakai koma ya."
      handleUpdateTargetTKU((prev: any) => {
        const next = { ...prev };

        // Bulan Lalu
        next.bln_lalu = res.bulanLalu.totalTim;
        next.bln_lalu_yo = res.bulanLalu.produk.yo;
        next.bln_lalu_om = res.bulanLalu.produk.om;
        next.bln_lalu_os = res.bulanLalu.produk.os;
        next.bln_lalu_yt = res.bulanLalu.produk.yt;

        // Tahun Lalu
        next.thn_lalu = res.tahunLalu.totalTim;
        next.thn_lalu_yo = res.tahunLalu.produk.yo;
        next.thn_lalu_om = res.tahunLalu.produk.om;
        next.thn_lalu_os = res.tahunLalu.produk.os;
        next.thn_lalu_yt = res.tahunLalu.produk.yt;

        return next;
      });

      setArchiveTargetMsg(
        `✅ Berhasil menarik realisasi rata-rata dari arsip!\n• Bulan Lalu (${res.bulanLalu.monthLabel}): Total 10 YL = ${res.bulanLalu.totalYLSpe.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Tim TKU = ${res.bulanLalu.totalTim.toLocaleString("id-ID")}\n• Tahun Lalu (${res.tahunLalu.monthLabel}): Total 10 YL = ${res.tahunLalu.totalYLSpe.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Tim TKU = ${res.tahunLalu.totalTim.toLocaleString("id-ID")}`
      );
      setTimeout(() => setArchiveTargetMsg(""), 9000);
    } catch (e: any) {
      alert(`❌ Gagal mengambil data realisasi dari arsip: ${e.message}`);
    } finally {
      setIsFetchingArchiveTarget(false);
    }
  };

  const handleSyncTargetTimFromYL = () => {
    const activeYls = ylList.filter((y: any) => y.status !== "nonaktif");
    const sumTarget = activeYls.reduce(
      (sum: number, yl: any) => sum + (Number(activeTargetYLMap[yl.area]?.target) || 0),
      0
    );
    const targetTimTrunc = Math.trunc(sumTarget);

    handleUpdateTargetTKU((prev: any) => {
      const next = { ...prev };
      next.target = targetTimTrunc;
      const other = (next.target_om || 0) + (next.target_os || 0) + (next.target_yt || 0);
      next.target_yo = Math.max(0, targetTimTrunc - other);
      return next;
    });

    setArchiveTargetMsg(
      `⚡ Target Tim berhasil disinkronkan dari total target 10 YL: ${targetTimTrunc.toLocaleString("id-ID")} (angka desimal dibuang tanpa dibulatkan).`
    );
    setTimeout(() => setArchiveTargetMsg(""), 6000);
  };

  const handleSaveYlList = async (newList: any) => {
    try {
      const cleanedList = (newList || []).map((y: any) => ({
        ...y,
        nama: cleanYlName(y.nama),
        ikutJht: y.ikutJht !== false,
        iuranJht: y.ikutJht === false ? 0 : (typeof y.iuranJht === "number" ? y.iuranJht : 24000)
      }));
      
      // Update local storage instantly
      const storedData = saveStoredYlData(cleanedList, pinManager);
      setYlList(storedData.ylList);
      setPinYLs(storedData.ylPins);

      const res = await safeFetchJson("/api/saveYlList", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ylList: cleanedList })
      });
      if (res && res.ok) {
        const cleanedReturned = (res.ylList || []).map((y: any) => ({
          ...y,
          nama: cleanYlName(y.nama)
        }));
        setYlList(cleanedReturned);
        saveStoredYlData(cleanedReturned, pinManager);
      }
      setYlSavedMsg("Daftar YL & PIN berhasil diperbarui!");
      setTimeout(() => setYlSavedMsg(""), 3000);
      if (onRefresh) await onRefresh();
    } catch (e: any) {
      setYlSavedMsg("Daftar YL & PIN berhasil disimpan secara lokal!");
      setTimeout(() => setYlSavedMsg(""), 3000);
    }
  };

  // Handler: Add YL
  const handleAddYl = () => {
    if (!newYlArea || !newYlNama || !newYlPin) {
      setYlSavedMsg("⚠️ Area, Nama, dan PIN wajib diisi!");
      setTimeout(() => setYlSavedMsg(""), 3000);
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    const newList = [...ylList, {
      area: newYlArea,
      nama: cleanYlName(newYlNama),
      pin: newYlPin,
      kodeYl: newYlKode || `YL-${newYlArea}`,
      tanggalMasuk: newYlTanggalMasuk || today,
      nik: newYlNik || undefined,
      tglLahir: newYlTglLahir || undefined,
      status: "Aktif",
      tanggalDaftar: today,
      ikutJht: newYlIkutJht,
      iuranJht: newYlIkutJht ? (newYlIuranJht || 24000) : 0
    }];
    handleSaveYlList(newList);
    setNewYlArea("");
    setNewYlNama("");
    setNewYlPin("");
    setNewYlKode("");
    setNewYlTanggalMasuk("");
    setNewYlNik("");
    setNewYlTglLahir("");
    setNewYlIkutJht(true);
    setNewYlIuranJht(24000);
  };

  // Handler: Open Permanent Delete YL Modal
  const handleDeleteYl = (idx: number) => {
    const yl = ylList[idx];
    if (!yl) return;
    setYlToDelete({ idx, yl });
  };

  // Handler: Confirm Permanent Delete YL
  const confirmDeleteYl = async () => {
    if (!ylToDelete) return;
    setIsDeletingYl(true);
    const { idx, yl } = ylToDelete;

    const copy = ylList.filter((_, i) => i !== idx);
    setYlList(copy);

    const newTargetMap = { ...targetYLMap };
    delete newTargetMap[yl.area];
    setTargetYLMap(newTargetMap);

    try {
      const res = await safeFetchJson("/api/saveYlList", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ylList: copy })
      });
      if (res && res.ok) {
        setYlSavedMsg(`✅ Data YL ${yl.nama} (${yl.area}) berhasil dihapus permanen dari sistem.`);
        setTimeout(() => setYlSavedMsg(""), 4000);
        if (onRefresh) await onRefresh();
      } else {
        setYlSavedMsg(`✅ Data YL ${yl.nama} (${yl.area}) berhasil dihapus dari tampilan.`);
        setTimeout(() => setYlSavedMsg(""), 4000);
      }
    } catch (e: any) {
      setYlSavedMsg("⚠️ Gagal menghapus YL: " + (e.message || "Kesalahan koneksi"));
    } finally {
      setIsDeletingYl(false);
      setYlToDelete(null);
    }
  };

  // Handler: Save Compensation Config
  const handleSaveCompConfig = async () => {
    try {
      const res = await safeFetchJson("/api/saveCompensationConfig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: compConfig })
      });
      if (res && res.ok) {
        setCompSavedMsg("Aturan kompensasi & tarif pajak berhasil disimpan!");
        setTimeout(() => setCompSavedMsg(""), 3000);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  // Settings PIN dropdown state
  const [pinTargetDropdown, setPinTargetDropdown] = useState<string>("manager");
  const [pinInputVal, setPinInputVal] = useState<string>("");
  const [pinSavedMsg, setPinSavedMsg] = useState<boolean>(false);
  const [pinManager, setPinManager] = useState<string>(() => getStoredManagerPin());
  const [pinYLs, setPinYLs] = useState<Record<string, string>>(() => getStoredYlPins());

  // Attention Manager states
  const [attentionArea, setAttentionArea] = useState<string>("201");
  const [attentionText, setAttentionText] = useState<string>("");
  const [attentionMap, setAttentionMap] = useState<Record<string, string>>({});
  const [attentionSavedMsg, setAttentionSavedMsg] = useState<boolean>(false);

  // Motivasi & Chatbot states
  const [chatbotNameInput, setChatbotNameInput] = useState<string>(motivasiConfig?.chatbotName || "AI Jember 1 Pro");
  const [tkuNameInput, setTkuNameInput] = useState<string>(motivasiConfig?.tkuName || "DP Jember 1");

  // Local states for Kalimat Motivasi Running Banner YL
  const [localMotivasiList, setLocalMotivasiList] = useState<string[]>(motivasiConfig?.list || []);
  const [localMotivasiTerpilih, setLocalMotivasiTerpilih] = useState<string[]>(motivasiConfig?.terpilih || []);
  const [localMotivasiInterval, setLocalMotivasiInterval] = useState<number | string>(motivasiConfig?.intervalDetik || 30);
  const [localMotivasiEnabled, setLocalMotivasiEnabled] = useState<boolean>(motivasiConfig?.enabled ?? true);
  const [newMotivasiInput, setNewMotivasiInput] = useState<string>("");
  const [motivasiSavedMsg, setMotivasiSavedMsg] = useState<string>("");

  useEffect(() => {
    if (motivasiConfig?.chatbotName) {
      setChatbotNameInput(motivasiConfig.chatbotName);
    }
    if (motivasiConfig?.tkuName) {
      setTkuNameInput(motivasiConfig.tkuName);
    }
    if (motivasiConfig) {
      if (Array.isArray(motivasiConfig.list)) setLocalMotivasiList(motivasiConfig.list);
      if (Array.isArray(motivasiConfig.terpilih)) setLocalMotivasiTerpilih(motivasiConfig.terpilih);
      if (motivasiConfig.intervalDetik !== undefined) setLocalMotivasiInterval(motivasiConfig.intervalDetik);
      if (motivasiConfig.enabled !== undefined) setLocalMotivasiEnabled(motivasiConfig.enabled);
    }
  }, [motivasiConfig]);

  const handleAddMotivasi = () => {
    const trimmed = newMotivasiInput.trim();
    if (!trimmed) return;
    if (!localMotivasiList.includes(trimmed)) {
      const updatedList = [...localMotivasiList, trimmed];
      const updatedTerpilih = [...localMotivasiTerpilih, trimmed];
      setLocalMotivasiList(updatedList);
      setLocalMotivasiTerpilih(updatedTerpilih);
      setNewMotivasiInput("");
    } else {
      alert("Kalimat motivasi ini sudah ada dalam daftar.");
    }
  };

  const handleToggleMotivasiItem = (item: string) => {
    if (localMotivasiTerpilih.includes(item)) {
      setLocalMotivasiTerpilih(localMotivasiTerpilih.filter(x => x !== item));
    } else {
      setLocalMotivasiTerpilih([...localMotivasiTerpilih, item]);
    }
  };

  const handleDeleteMotivasiItem = (item: string) => {
    setLocalMotivasiList(localMotivasiList.filter(x => x !== item));
    setLocalMotivasiTerpilih(localMotivasiTerpilih.filter(x => x !== item));
  };

  const handleSelectAllMotivasi = () => {
    setLocalMotivasiTerpilih([...localMotivasiList]);
  };

  const handleDeselectAllMotivasi = () => {
    setLocalMotivasiTerpilih([]);
  };

  const handleLoadSampleMotivasi = () => {
    const samples = [
      "Semangat menjalani hari ini dengan tulus dan penuh senyuman! 🌸",
      "Fokus pada pelayanan terbaik, senyum tulus adalah kunci keakraban dengan pelanggan! 😊",
      "Setiap botol Yakult membawa kesehatan dan kebahagiaan bagi keluarga Indonesia. 🍾",
      "Usaha dan ketekunan hari ini adalah pijakan sukses esok hari. Terus melangkah! 💪",
      "Jaga kesehatan dan selalu utamakan keselamatan dalam setiap rute aktivitas! 🛵✨"
    ];
    const combinedList = Array.from(new Set([...localMotivasiList, ...samples]));
    const combinedTerpilih = Array.from(new Set([...localMotivasiTerpilih, ...samples]));
    setLocalMotivasiList(combinedList);
    setLocalMotivasiTerpilih(combinedTerpilih);
  };

  const handleSaveMotivasiConfigAll = async () => {
    const newConfig: MotivasiConfig = {
      ...motivasiConfig,
      list: localMotivasiList,
      terpilih: localMotivasiTerpilih,
      intervalDetik: Number(localMotivasiInterval) || 30,
      enabled: localMotivasiEnabled,
      chatbotName: chatbotNameInput.trim() || "AI Jember 1 Pro",
      tkuName: tkuNameInput.trim() || "DP Jember 1"
    };

    onUpdateMotivasi(newConfig);

    try {
      await saveToSupabase("motivasi_config", newConfig);
    } catch (e) {}

    setMotivasiSavedMsg("✅ Pengaturan Kalimat Motivasi Berhasil Disimpan!");
    setTimeout(() => setMotivasiSavedMsg(""), 4000);
  };

  
  
  // Apps Script (Code.gs) viewer/copy UI state — used for the manual
  // "Kirim ke DP1" Apps Script integration (view/download/copy Code.gs).
  const [showGsCode, setShowGsCode] = useState<boolean>(false);
  const [copiedGsCode, setCopiedGsCode] = useState<boolean>(false);

  useEffect(() => {
    setScriptUrlInput(scriptUrl || "");
  }, [scriptUrl]);

  // Load PINs & Attention on settings load
  useEffect(() => {
    safeFetchJson("/api/getPins")
      .then(d => {
        if (d && d.managerPin) {
          setPinManager(d.managerPin);
        } else {
          setPinManager(getStoredManagerPin());
        }
        if (d && d.ylPins && Object.keys(d.ylPins).length > 0) {
          setPinYLs(d.ylPins);
        } else {
          setPinYLs(getStoredYlPins());
        }
      })
      .catch(() => {
        setPinManager(getStoredManagerPin());
        setPinYLs(getStoredYlPins());
      });

    safeFetchJson("/api/getAttention")
      .then(d => {
        if (d && d.attention) {
          setAttentionMap(d.attention);
          setAttentionText(d.attention["201"] || "");
        }
      })
      .catch(e => console.error("Error loading attention:", e));
  }, []);

  const handleSaveAttention = async () => {
    try {
      const res = await fetch("/api/saveAttention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area: attentionArea, text: attentionText })
      });
      const resData = await parseJsonResponse(res);

      if (res.ok && resData && resData.ok) {
        setAttentionMap(resData.attention || {});
        setAttentionSavedMsg(true);
        setTimeout(() => setAttentionSavedMsg(false), 2000);
      }
    } catch (e) {
      console.error("Gagal menyimpan attention:", e);
    }
  };

  // Update detail YL data when selection or active month changes
  useEffect(() => {
    if (selectedYLArea) {
      safeFetchJson(`/api/getDataYL?area=${selectedYLArea}&month=${globalMonth}`)
        .then(d => {
          if (d) setYLDetail(d);
        })
        .catch(e => console.error(e));
    }
  }, [selectedYLArea, globalMonth, dashboardData]);

  // Run AI Insight Generator
  const runAiInsight = async () => {
    if (!activeEvaluasiData) return;
    setIsAiLoading(true);
    setAiInsight("");
    try {
      const response = await fetch("/api/gemini/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: activeEvaluasiData })
      });
      const d = await parseJsonResponse(response);
      setAiInsight(d?.insight || "Tidak ada hasil analisis.");
    } catch (e) {
      setAiInsight("Gagal menghubungkan ke modul evaluasi AI server.");
    } finally {
      setIsAiLoading(false);
    }
  };

  // Helper formatting currency
  const formatRp = (val: number) => {
    return "Rp" + Math.trunc(val).toLocaleString("id-ID");
  };


  // Normalize analysis data list from activeEvaluasiData
  const normalizedAnalisis = useMemo(() => {
    if (!activeEvaluasiData) return [];
    if (activeEvaluasiData.dataRows && activeEvaluasiData.dataRows.length > 0) {
      return activeEvaluasiData.dataRows.map(row => {
        const area = String(row[0] || "");
        const nama = String(row[1] || "");
        const jualHariIni = typeof row[7] === "number" ? row[7] : parseFloat(row[7]) || 0;
        const rata2BulanBerjalan = typeof row[13] === "number" ? row[13] : parseFloat(row[13]) || 0;
        const vsMingguLaluPct = typeof row[15] === "number" ? row[15] : parseFloat(row[15]) || 0;
        const persenRumah = typeof row[18] === "number" ? row[18] : parseFloat(row[18]) || 0;
        const persenRbVsPlg = typeof row[21] === "number" ? row[21] : parseFloat(row[21]) || 0;
        const propagandaHariIni = (typeof row[22] === "number" ? row[22] : parseFloat(row[22]) || 0) + 
                                  (typeof row[23] === "number" ? row[23] : parseFloat(row[23]) || 0);
        const sampahBotol = typeof row[26] === "number" ? row[26] : parseFloat(row[26]) || 0;
        const bb = typeof row[28] === "number" ? row[28] : parseFloat(row[28]) || 0;
        const akmBb = typeof row[30] === "number" ? row[30] : parseFloat(row[30]) || 0;

        return {
          area,
          nama,
          jualHariIni,
          rata2BulanBerjalan,
          vsMingguLaluPct,
          persenRumah,
          persenRbVsPlg,
          propagandaHariIni,
          sampahBotol,
          bb,
          akmBb,
          propagandaVs900: null
        };
      });
    }
    return (activeEvaluasiData.analisis || []).map(a => ({ ...a, akmBb: a.akmBb ?? a.bb ?? 0 }));
  }, [activeEvaluasiData]);

  // Find overall highest performing and needy YL
  const evaluasiHighlights = useMemo(() => {
    const list = normalizedAnalisis;
    if (!list || list.length === 0) return { top: null, needImprovement: null, highestBB: null };

    const EVAL_CATEGORIES = [
      { key: 'jualHariIni', label: 'Tabel Penjualan Hari Ini', type: 'max', requirePositive: true },
      { key: 'rata2BulanBerjalan', label: 'Rata Bulan Ini', type: 'max', requirePositive: true },
      { key: 'vsMingguLaluPct', label: 'vs Minggu Lalu', type: 'max', requirePositive: true },
      { key: 'persenRumah', label: 'Persen Rumah', type: 'max', requirePositive: true },
      { key: 'persenRbVsPlg', label: 'Persen RB vs PLG', type: 'max', requirePositive: true },
      { key: 'propagandaHariIni', label: 'PB Hari Ini', type: 'max', requirePositive: true },
      { key: 'sampahBotol', label: 'Akm Sampah', type: 'max', requirePositive: true },
      { key: 'akmBb', label: 'Akm BB', type: 'min', requirePositive: false }
    ];

    const categoryStats = EVAL_CATEGORIES.map(cat => {
      const vals = list.map(x => (x as any)[cat.key] as number || 0);
      let bestVal: number | null = null;
      let worstVal: number | null = null;
      
      let validVals = cat.requirePositive ? vals.filter(v => v > 0) : vals;
      
      let isWinner = (_v: any) => false;
      let isLoser = (_v: any) => false;
      let getScore = (_v: any) => 0; // 0 to 1

      if (validVals.length > 0 || !cat.requirePositive) {
        if (cat.type === 'max') {
          bestVal = validVals.length > 0 ? Math.max(...validVals) : 0;
          worstVal = validVals.length > 0 ? Math.min(...validVals) : 0;
          isWinner = (v) => v === bestVal && (!cat.requirePositive || v > 0);
          isLoser = (v) => v === worstVal && (!cat.requirePositive || v > 0);
          getScore = (v) => {
            if (cat.requirePositive && v === 0) return 0;
            return bestVal === worstVal ? 1 : (v - worstVal) / (bestVal! - worstVal);
          };
        } else if (cat.type === 'min') {
          bestVal = validVals.length > 0 ? Math.min(...validVals) : 0;
          worstVal = validVals.length > 0 ? Math.max(...validVals) : 0;
          isWinner = (v) => v === bestVal && (!cat.requirePositive || v > 0);
          isLoser = (v) => v === worstVal && (!cat.requirePositive || v > 0);
          getScore = (v) => {
            if (cat.requirePositive && v === 0) return 0;
            return bestVal === worstVal ? 1 : (worstVal - v) / (worstVal - bestVal!);
          };
        } else if (cat.type === 'target') {
          const distances = validVals.map(v => Math.abs(v - ((cat as any).target as number)));
          const minDistance = distances.length > 0 ? Math.min(...distances) : 0;
          const maxDistance = distances.length > 0 ? Math.max(...distances) : 0;
          
          isWinner = (v) => (!cat.requirePositive || v > 0) && Math.abs(v - ((cat as any).target as number)) === minDistance;
          isLoser = (v) => (!cat.requirePositive || v > 0) && Math.abs(v - ((cat as any).target as number)) === maxDistance;
          getScore = (v) => {
            if (cat.requirePositive && v === 0) return 0;
            const d = Math.abs(v - ((cat as any).target as number));
            return minDistance === maxDistance ? 1 : (maxDistance - d) / (maxDistance - minDistance);
          };
        }
      }

      return { ...cat, bestVal, worstVal, isWinner, isLoser, getScore };
    });

    const scoredList = list.map(yl => {
      let winCount = 0;
      let loseCount = 0;
      let totalScore = 0;
      let wonCategories: string[] = [];
      let lostCategories: string[] = [];

      categoryStats.forEach(stat => {
        const v = (yl as any)[stat.key] as number || 0;
        if (stat.isWinner(v)) {
          winCount++;
          wonCategories.push(stat.label);
        }
        if (stat.isLoser(v)) {
          loseCount++;
          lostCategories.push(stat.label);
        }
        totalScore += stat.getScore(v);
      });

      return { ...yl, winCount, loseCount, totalScore, wonCategories, lostCategories };
    });

    // Performa Terbaik
    const sortedTop = [...scoredList].sort((a, b) => b.winCount - a.winCount || b.totalScore - a.totalScore);
    const topWinCount = sortedTop[0].winCount;
    const topTotalScore = sortedTop[0].totalScore;
    const allTops = sortedTop.filter(x => x.winCount === topWinCount && Math.abs(x.totalScore - topTotalScore) < 0.001);
    
    const top = {
      ...sortedTop[0],
      nama: allTops.map(x => cleanYlName(x.nama)).join(", ")
    };

    // Performa Turun
    const sortedNeed = [...scoredList].sort((a, b) => b.loseCount - a.loseCount || a.totalScore - b.totalScore);
    const needLoseCount = sortedNeed[0].loseCount;
    const needTotalScore = sortedNeed[0].totalScore;
    const allNeeds = sortedNeed.filter(x => x.loseCount === needLoseCount && Math.abs(x.totalScore - needTotalScore) < 0.001);
    
    const needImprovement = {
      ...sortedNeed[0],
      nama: allNeeds.map(x => cleanYlName(x.nama)).join(", ")
    };

    const sortedBB = [...list].sort((a, b) => (b.akmBb ?? b.bb) - (a.akmBb ?? a.bb));
    const bbVal = sortedBB[0].akmBb ?? sortedBB[0].bb;
    const allBBs = sortedBB.filter(x => (x.akmBb ?? x.bb) === bbVal);
    const highestBB = {
      ...sortedBB[0],
      nama: allBBs.map(x => cleanYlName(x.nama)).join(", "),
      bb: bbVal
    };

    return { top, needImprovement, highestBB };
  }, [normalizedAnalisis]);

  const evaluasiBlocks = useMemo(() => {
    const list = normalizedAnalisis;
    if (!list || list.length === 0) return null;

    const getTop = (key: keyof typeof list[0], ascending = false) => {
      if (list.length === 0) return null;
      let validList = list;
      if (key !== "akmBb") {
        validList = list.filter(item => (item[key] as number) > 0);
      }
      if (validList.length === 0) return null;
      const sorted = [...validList].sort((a, b) => ascending ? (a[key] as number) - (b[key] as number) : (b[key] as number) - (a[key] as number));
      const topVal = sorted[0][key];
      const allTops = sorted.filter(item => item[key] === topVal);
      const joinedNames = allTops.map(i => cleanYlName(i.nama)).join(", ");
      
      return {
        ...sorted[0],
        nama: joinedNames,
        [key]: topVal
      };
    };

    const block1 = getTop("jualHariIni");
    const block2 = getTop("rata2BulanBerjalan");
    const block3 = getTop("vsMingguLaluPct");
    const block4 = getTop("persenRumah");
    const block5 = getTop("persenRbVsPlg");
    const block6 = getTop("propagandaHariIni");
    const block7 = getTop("sampahBotol");
    const block8 = getTop("akmBb", true); // lowest Akm BB (minimum retur)

    return { block1, block2, block3, block4, block5, block6, block7, block8 };
  }, [normalizedAnalisis]);

  
  const handleResetTargeted = () => {
    setResetSuccessMsg("");
    setShowTargetedResetModal(true);
  };

  const handleExecuteResetTargeted = async () => {
    const targetMonthLabel = resetScope === "all" ? "SEMUA RIWAYAT (Semua Bulan)" : `BULAN ${resetSelectedMonth} (${getIndonesianMonthLabel(resetSelectedMonth) || resetSelectedMonth})`;

    setIsResetting(true);
    try {
      const res = await safeFetchJson("/api/resetDataTargeted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: resetScope, currentMonth: resetSelectedMonth })
      });

      if (res && res.ok) {
        // Kosongkan state lokal jika bulan yang direset adalah bulan yang sedang aktif
        if (resetScope === "all" || resetSelectedMonth === globalMonth) {
          setBreakdownPlanMap({});
          setBreakdownRealisasiMap({});
          setTargetYLMap({});
          setTargetTKU({ target: 0, bln_lalu: 0, thn_lalu: 0, target_yo: 0, target_om: 0, target_os: 0, target_yt: 0, bln_lalu_yo: 0, bln_lalu_om: 0, bln_lalu_os: 0, bln_lalu_yt: 0, thn_lalu_yo: 0, thn_lalu_om: 0, thn_lalu_os: 0, thn_lalu_yt: 0 });
          setYLDetail(null);
          fetchBreakdownPlan(globalMonth);
        }

        if (onRefresh) await onRefresh();
        setShowTargetedResetModal(false);
        setResetSuccessMsg(`✅ RESET DATA BERHASIL! Data aktif untuk ${targetMonthLabel} telah berhasil dikosongkan. Data arsip di Supabase tetap aman.`);
        setTimeout(() => setResetSuccessMsg(""), 8000);
      } else {
        setResetSuccessMsg("❌ Gagal mereset data: " + (res?.error || "Terjadi kesalahan"));
      }
    } catch (e: any) {
      setResetSuccessMsg("❌ Error reset data: " + e.message);
    } finally {
      setIsResetting(false);
    }
  };

  const handleClearCache = async () => {
    const savedSbUrl = localStorage.getItem("supabase_url") || "";
    const savedSbKey = localStorage.getItem("supabase_key") || "";
    const savedSession = localStorage.getItem("yakult_session") || "";
    const savedSbPin = localStorage.getItem("yakult_supabase_pin") || "";

    localStorage.clear();

    if (savedSbUrl) localStorage.setItem("supabase_url", savedSbUrl);
    if (savedSbKey) localStorage.setItem("supabase_key", savedSbKey);
    if (savedSession) localStorage.setItem("yakult_session", savedSession);
    if (savedSbPin) localStorage.setItem("yakult_supabase_pin", savedSbPin);

    await onRefresh();
    alert("Cache aplikasi berhasil dibersihkan! Seluruh data diperbarui secara segar.");
  };


  const { top, needImprovement, highestBB } = evaluasiHighlights;

  // Save Config Pin
  const handleSavePin = async () => {
    if (!pinInputVal) return;
    const newYlPins = { ...pinYLs };
    let newMgrPin = pinManager;

    if (pinTargetDropdown === "manager") {
      newMgrPin = pinInputVal;
      setPinManager(pinInputVal);
    } else {
      const targetName = pinYLs[pinTargetDropdown] || pinTargetDropdown;
      delete newYlPins[pinTargetDropdown];
      newYlPins[pinInputVal] = targetName;
      setPinYLs(newYlPins);
    }

    // Save locally
    saveStoredYlData(ylList, newMgrPin);
    try {
      localStorage.setItem("yakult_yl_pins", JSON.stringify(newYlPins));
      localStorage.setItem("yakult_manager_pin", newMgrPin);
    } catch (e) {}

    try {
      await fetch("/api/savePins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerPin: newMgrPin, ylPins: newYlPins })
      });
    } catch (e) {
      console.warn("Gagal menyinkronkan PIN ke server, tersimpan secara lokal.", e);
    }

    setPinSavedMsg(true);
    setPinInputVal("");
    setTimeout(() => setPinSavedMsg(false), 2500);
    if (onRefresh) await onRefresh();
  };

  // Reset Profil YL & PIN to Default Data
  const handleResetYlAndPins = async () => {
    if (!window.confirm("Apakah Anda yakin ingin memulihkan seluruh Profil YL dan PIN ke data bawaan (10 YL & PIN default)?")) {
      return;
    }
    const defaultData = resetToDefaultData();
    setYlList(defaultData.ylList);
    setPinManager(defaultData.managerPin);
    setPinYLs(defaultData.ylPins);

    try {
      await Promise.all([
        fetch("/api/saveYlList", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ylList: defaultData.ylList, managerPin: defaultData.managerPin })
        }),
        fetch("/api/savePins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ managerPin: defaultData.managerPin, ylPins: defaultData.ylPins })
        })
      ]);
    } catch (e) {
      console.warn("Server reset sync skipped", e);
    }

    if (onRefresh) await onRefresh();
    alert("✅ Data Profil YL dan PIN berhasil di-reset ke data bawaan (10 YL & PIN Default 201-210, Manager 1111)!");
  };





  const activeDashboardData = (isViewingHistoricalMonth && historicalDataSnapshot?.dashboardData)
    ? historicalDataSnapshot.dashboardData
    : (isViewingHistoricalMonth && historicalDataNotFound)
      ? null
      : dashboardData;



  const activeTargetTKU = (isViewingHistoricalMonth && historicalDataSnapshot?.targetTKU)
    ? historicalDataSnapshot.targetTKU
    : targetTKU;

  const mainContentRef = useRef<HTMLElement | null>(null);

  const scrollManagerContentToTop = () => {
    mainContentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleHeaderRefresh = async () => {
    if (onRefresh) await onRefresh();
    try {
      await fetchBreakdownPlan(globalMonth);
      window.dispatchEvent(new CustomEvent("app_header_refresh"));
    } catch (e) {
      console.error("Error refreshing internal manager views:", e);
    }
  };

  if (showArchiveEditor) {
    return (
      <React.Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100 p-8 font-bold">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-3 border-indigo-500 border-t-transparent animate-spin" />
            <span className="text-sm">Memuat Editor Arsip...</span>
          </div>
        </div>
      }>
        <ArchiveEditor onClose={() => setShowArchiveEditor(false)} motivasiConfig={motivasiConfig} ylList={ylList} />
      </React.Suspense>
    );
  }

  return (
    <div className={`h-[100dvh] min-h-0 overflow-hidden md:min-h-screen md:h-auto md:overflow-visible bg-neutral-100/60 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col font-sans transition-colors ${theme === 'dark' ? 'dark' : ''}`}>
      {/* Responsive Top Navbar */}
      <AppNavbar
        role="manager"
        title={TAB_LABELS[activeTab] || "Dashboard"}
        subtitle={`Cabang Jember 1 • ${isViewingHistoricalMonth ? `Arsip ${historicalMonthLabel || selectedMonthlyArchive}` : globalMonth}`}
        currentMenu={activeTab}
        onSelectMenu={(menu: string) => {
          if (menu === "ai_chat") {
            window.dispatchEvent(new CustomEvent("open-ai-chat"));
          } else {
            setActiveTab(menu as any);
            scrollManagerContentToTop();
          }
        }}
        onToggleSidebar={() => {
          setDrawerOpen(o => !o);
          setSidebarCollapsed(o => !o);
        }}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onRefresh={handleHeaderRefresh}
        isRefreshing={isRefreshing}
        onLogout={() => setShowLogoutConfirm(true)}
        ylAccounts={ylAccounts}
        onSwitchToYl={(name) => onImpersonateYl && onImpersonateYl(name)}
        globalMonth={globalMonth}
        setGlobalMonth={setGlobalMonth}
        isViewingHistoricalMonth={isViewingHistoricalMonth}
        historicalMonthLabel={historicalMonthLabel}
        onResetToLiveData={handleResetToLiveData}
        notificationSlot={<NotificationBell role="manager" globalMonth={globalMonth} ylList={ylList} />}
      />

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mgr-logout-title"
            className="w-full max-w-xs rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="mgr-logout-title" className="text-base font-bold text-neutral-900 dark:text-neutral-100">Keluar dari akun?</h3>
            <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">Kamu akan keluar dan perlu memasukkan PIN lagi untuk masuk.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => { setShowLogoutConfirm(false); onLogout(); }}
                className="flex-1 py-2 rounded-lg text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700"
              >
                Ya, keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Layout with Responsive Sidebar and Drawer */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row w-full max-w-[1700px] mx-auto">
        <AppSidebar
          role="manager"
          currentMenu={activeTab}
          onSelectMenu={(menu: string) => {
            if (menu === "ai_chat") {
              window.dispatchEvent(new CustomEvent("open-ai-chat"));
            } else {
              setActiveTab(menu as any);
              scrollManagerContentToTop();
            }
          }}
          isDrawerOpen={drawerOpen}
          onCloseDrawer={() => setDrawerOpen(false)}
          onOpenDrawer={() => setDrawerOpen(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(o => !o)}
          itemCount={ylList.filter((y: any) => y.status !== "Resign" && y.status !== "nonaktif").length || 10}
        />

        {/* Main Content Area */}
        <main ref={mainContentRef} className="order-first md:order-none flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-y-contain p-3 sm:p-5 pb-4 sm:pb-5 md:overflow-visible md:pb-8">
        {/* Notifikasi Ulang Tahun */}
        {(() => {
          const today = new Date();
          const todayMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          const birthdayLadies = ylList.filter((y: any) => y.tglLahir && y.tglLahir.endsWith(todayMonthDay) && y.status !== "Resign" && y.status !== "nonaktif");
          
          if (birthdayLadies.length === 0) return null;
          
          return (
            <div className="bg-gradient-to-r from-rose-500 to-pink-600 rounded-2xl p-3 sm:p-4 mb-4 shadow-lg text-white border border-rose-400 flex items-center justify-between animate-fade-in relative overflow-hidden">
              <div className="absolute -right-4 -top-4 opacity-10">
                <Sparkles className="w-24 h-24" />
              </div>
              <div className="flex items-center gap-3 relative z-10">
                <div className="bg-white/20 p-2.5 rounded-full backdrop-blur-sm animate-bounce">
                  <span className="text-xl sm:text-2xl leading-none block">🎂</span>
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white drop-shadow-md flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-rose-200" />
                    Notifikasi Ulang Tahun!
                  </h3>
                  <p className="text-rose-50 text-[11px] sm:text-xs font-medium mt-0.5 max-w-xl leading-snug">
                    Hari ini adalah hari ulang tahun: <strong className="text-white font-bold text-xs sm:text-sm">{birthdayLadies.map((y:any) => cleanYlName(y.nama)).join(", ")}</strong>. Jangan lupa berikan ucapan selamat! 🎉
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Banner Status Mode Melihat Data Bulanan (Historical vs Live) */}
        {isViewingHistoricalMonth && (
          <div className={`p-3.5 mb-4 rounded-2xl border shadow-md flex flex-wrap items-center justify-between gap-3 animate-fade-in ${
            historicalDataNotFound 
              ? "bg-amber-50 dark:bg-amber-950/80 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100" 
              : "bg-gradient-to-r from-indigo-950 via-neutral-900 to-indigo-900 border-indigo-500 text-white"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl text-lg font-bold shrink-0 ${
                historicalDataNotFound ? "bg-amber-200 text-amber-900 dark:text-amber-300" : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
              }`}>
                {historicalDataNotFound ? "⚠️" : "📅"}
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider">
                  {historicalDataNotFound 
                    ? `Data Bulan ${historicalMonthLabel} Tidak Ada di Supabase`
                    : `Menampilkan Data Bulan ${historicalMonthLabel} (Diambil dari Supabase)`}
                </h3>
                <p className="text-[11px] font-medium opacity-90 mt-0.5">
                  {historicalDataNotFound
                    ? `Data untuk bulan ${historicalMonthLabel} belum pernah disimpan / difinish ke Supabase.`
                    : `Seluruh menu aplikasi saat ini menampilkan arsip data bulan ${historicalMonthLabel}.`}
                </p>
              </div>
            </div>
            <button
              onClick={handleResetToLiveData}
              className="bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5 shrink-0 border border-red-500"
            >
              🔄 Kembali ke Data Live (Bulan Berjalan)
            </button>
          </div>
        )}

        {/* Tab Dashboard: Menampilkan Seluruh Grafik & Tren Penjualan Lengkap */}
        {(activeTab === "dashboard" || activeTab === "grafik") && (
          <React.Suspense fallback={<TabLoadingFallback />}>
            <ManagerDashboardTab
              dashboardData={activeDashboardData}
              targetTKU={activeTargetTKU}
              cleanYlName={cleanYlName}
              currentMonthTotal={currentMonthTotal}
              calculateSektorTotals={calculateSektorTotals}
              month={globalMonth}
            />
          </React.Suspense>
        )}

        {/* Tab Presentasi */}
        {activeTab === "presentasi" && (
          <ErrorBoundary>
            <React.Suspense fallback={<div className="py-16 text-center text-neutral-400 text-sm font-bold">Memuat Presentasi...</div>}>
              <PresentasiView />
            </React.Suspense>
          </ErrorBoundary>
        )}

        {/* Tab Evaluasi */}
        {activeTab === "evaluasi" && (
          <React.Suspense fallback={<TabLoadingFallback />}>
            <EvaluasiView
              evaluasiData={activeEvaluasiData}
              globalMonth={globalMonth}
              role="manager"
            />
          </React.Suspense>
        )}

        {/* Tab Breakdown Plan & Realisasi */}
        {activeTab === "breakdown" && (
          <div className="space-y-4">
            {/* Header / Bulan & Mode */}
            <div className="bd-card p-4 flex flex-col gap-4">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="bd-icon"><MenuTitleIcon id="breakdown" /></span>
                  <div className="min-w-0">
                    <h2 className="bd-title">Breakdown & Realisasi Harian</h2>
                    <p className="bd-sub">Input rencana harian (BD) & realisasi harian per Yakult Lady</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <label className="bd-field">
                    <span className="bd-label">Bulan</span>
                    <input
                      type="month"
                      value={globalMonth}
                      onChange={(e) => {
                        setGlobalMonth(e.target.value);
                        fetchBreakdownPlan(e.target.value);
                      }}
                      className="bd-input"
                    />
                  </label>

                  <div className="bd-seg" role="tablist">
                    <button role="tab" data-active={gridSubMode === "BD"} onClick={() => setGridSubMode("BD")}>Breakdown (BD)</button>
                    <button role="tab" data-active={gridSubMode === "R"} onClick={() => setGridSubMode("R")}>Realisasi (R)</button>
                  </div>

                  <div className="bd-seg" role="tablist" style={{ overflowX: "auto", maxWidth: "100%" }}>
                    {bdWeeks.map((w) => (
                      <button key={w.label} role="tab" data-active={bdSelEff === w.label} onClick={() => setBdSel(w.label)}>{w.label}</button>
                    ))}
                    <button role="tab" data-active={bdSelEff === "all"} onClick={() => setBdSel("all")}>Bulan Utuh</button>
                  </div>

                  <div className="bd-field">
                    <span className="bd-label">{gridSubMode === "BD" ? "Pembagi BD" : "Pembagi Realisasi"}</span>
                    <PembagiInput
                      value={getEffectivePembagi(activeGridMap)}
                      onCommit={handleGlobalPembagiChange}
                    />
                  </div>

                  <button
                    onClick={() => handleSaveBreakdownPlan(true)}
                    disabled={isBreakdownSaving}
                    className="bd-btn ml-auto"
                  >
                    {isBreakdownSaving ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <>
                        <span>💾</span>
                        <span>Simpan</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Kartu komparasi — struktur & ukuran seragam */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <BdCompareCard label="Target" color="var(--accent-ring)"
                  diff={monthlyGridStats.diffTarget} pct={monthlyGridStats.pctTgt}
                  total={monthlyGridStats.totalTarget} sisa={realizedDaysInfo.sisaTarget} />
                <BdCompareCard label="Bulan Lalu" color="var(--info)"
                  diff={monthlyGridStats.diffBL} pct={monthlyGridStats.pctBL}
                  total={monthlyGridStats.totalBL} sisa={realizedDaysInfo.sisaBL} />
                <BdCompareCard label="Tahun Lalu" color="var(--warn)"
                  diff={monthlyGridStats.diffTL} pct={monthlyGridStats.pctTL}
                  total={monthlyGridStats.totalTL} sisa={realizedDaysInfo.sisaTL} />

                <div className="bd-subcard bd-stat" style={{ borderLeft: "3px solid var(--ok)" }}>
                  <span className="bd-label truncate">Realisasi</span>
                  <div className="flex-1 flex items-center">
                    <span className="bd-stat-pct whitespace-nowrap" style={{ color: "var(--ink)", fontSize: "1.5rem", lineHeight: "2rem" }}>
                      {realizedDaysInfo.totRealizedSales.toLocaleString("id-ID")}
                    </span>
                  </div>
                </div>
              </div>

              {breakdownMsg && (
                <p className="bd-chip bd-chip-ok text-center !py-1.5 !text-xs animate-pulse">{breakdownMsg}</p>
              )}
            </div>

            {/* Tabel */}
            <div className="bd-card overflow-hidden">
              <div className="bd-table-wrap">
                <table className="bd-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="bd-th-name">Yakult Lady</th>
                      {bdDays.map((d) => {
                        const isRealized = realizedDaysInfo.realizedDays.includes(d);
                        return (
                          <th key={d} colSpan={4} className={`bd-grp ${isRealized ? "bd-grp-real" : "bd-grp-plan"}`} style={{ minWidth: 160 }}>
                            <span className="inline-flex items-center justify-center gap-1.5">
                              <span>Tgl {d}</span>
                              {isRealized && <span className="bd-badge-ok">Riil</span>}
                            </span>
                          </th>
                        );
                      })}
                      {bdIsWeek && <th colSpan={5} className="bd-grp bd-grp-sum">Akm {bdWeek?.label} (Mingguan)</th>}
                      <th colSpan={5} className="bd-grp bd-grp-sum">{bdIsWeek ? "Akm Bulanan" : "Total 4 Item"}</th>
                      <th colSpan={5} className="bd-grp bd-grp-avg">Rata-rata Harian</th>
                      <th colSpan={6} className="bd-grp bd-grp-cmp">Target & Pembanding</th>
                      <th className="bd-grp bd-grp-komp" style={{ minWidth: 110 }}>Kompensasi</th>
                    </tr>
                    <tr>
                      {bdDays.map((d) => (
                        <React.Fragment key={d}>
                          <th className="bd-v bd-v-yo">YO</th>
                          <th className="bd-v bd-v-om">OM</th>
                          <th className="bd-v bd-v-os">OS</th>
                          <th className="bd-v bd-v-yt">YT</th>
                        </React.Fragment>
                      ))}
                      {bdIsWeek && (
                        <>
                          <th className="bd-v bd-v-yo">YO</th>
                          <th className="bd-v bd-v-om">OM</th>
                          <th className="bd-v bd-v-os">OS</th>
                          <th className="bd-v bd-v-yt">YT</th>
                          <th className="bd-th-sub" style={{ color: "var(--ink)" }}>Total</th>
                        </>
                      )}
                      <th className="bd-v bd-v-yo">YO</th>
                      <th className="bd-v bd-v-om">OM</th>
                      <th className="bd-v bd-v-os">OS</th>
                      <th className="bd-v bd-v-yt">YT</th>
                      <th className="bd-th-sub" style={{ color: "var(--ink)" }}>Total</th>
                      <th className="bd-v bd-v-yo">YO</th>
                      <th className="bd-v bd-v-om">OM</th>
                      <th className="bd-v bd-v-os">OS</th>
                      <th className="bd-v bd-v-yt">YT</th>
                      <th className="bd-th-sub" style={{ color: "var(--ink)" }}>Rata</th>
                      <th className="bd-th-sub">Target</th>
                      <th className="bd-th-sub">Sel. Tgt</th>
                      <th className="bd-th-sub">Bln Lalu</th>
                      <th className="bd-th-sub">Sel. BL</th>
                      <th className="bd-th-sub">Thn Lalu</th>
                      <th className="bd-th-sub">Sel. TL</th>
                      <th className="bd-th-sub" style={{ color: "var(--ok-text)" }}>Bersih (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ylList.filter((y: any) => y.status !== "nonaktif").map((yl: any, idx: number) => (
                      <BreakdownGridRow
                        key={yl.area || idx}
                        yl={yl}
                        rIdx={idx}
                        activeGridMap={activeGridMap}
                        targetYLMap={targetYLMap}
                        breakdownDateRange="1-31"
                        rangeStart={bdWeek?.start}
                        rangeEnd={bdWeek?.end}
                        showWeekAkm={bdIsWeek}
                        getCellProps={getBreakdownCellProps}
                        renderSelectionHandle={renderBreakdownSelectionHandle}
                        selectRow={selectBreakdownRow}
                        kompenBersih={kompenBersihByArea.map[String(yl.area).substring(0, 3)] ?? 0}
                      />
                    ))}
                  </tbody>
                  <tfoot className="bd-tfoot">
                    <tr>
                      <td className="bd-td-name bd-td">{bdIsWeek ? `Total ${bdWeek?.label}` : "Total Harian"}</td>
                      {bdDays.map((d) => {
                        const data = dailyGridTotals[d] || { yo: 0, om: 0, os: 0, yt: 0 };
                        return (
                          <React.Fragment key={d}>
                            {(["yo", "om", "os", "yt"] as const).map((k) => (
                              <td key={k} className={`bd-td ${data[k] ? "" : "bd-td-zero"}`}>{nf(data[k])}</td>
                            ))}
                          </React.Fragment>
                        );
                      })}
                      {bdIsWeek && (() => {
                        const acc = { yo: 0, om: 0, os: 0, yt: 0 };
                        bdDays.forEach((d) => {
                          const t = dailyGridTotals[d];
                          if (t) { acc.yo += t.yo; acc.om += t.om; acc.os += t.os; acc.yt += t.yt; }
                        });
                        return (
                          <>
                            <td className="bd-td">{nf(acc.yo)}</td>
                            <td className="bd-td">{nf(acc.om)}</td>
                            <td className="bd-td">{nf(acc.os)}</td>
                            <td className="bd-td">{nf(acc.yt)}</td>
                            <td className="bd-td">{nf(acc.yo + acc.om + acc.os + acc.yt)}</td>
                          </>
                        );
                      })()}
                      <td className="bd-td">{nf(monthlyGridTotals.yo)}</td>
                      <td className="bd-td">{nf(monthlyGridTotals.om)}</td>
                      <td className="bd-td">{nf(monthlyGridTotals.os)}</td>
                      <td className="bd-td">{nf(monthlyGridTotals.yt)}</td>
                      <td className="bd-td">{nf(monthlyGridTotals.yo + monthlyGridTotals.om + monthlyGridTotals.os + monthlyGridTotals.yt)}</td>

                      {(() => {
                        const pembagi = getEffectivePembagi(activeGridMap);
                        const ryo = Math.trunc(monthlyGridTotals.yo / pembagi);
                        const rom = Math.trunc(monthlyGridTotals.om / pembagi);
                        const ros = Math.trunc(monthlyGridTotals.os / pembagi);
                        const ryt = Math.trunc(monthlyGridTotals.yt / pembagi);
                        const rsum = ryo + rom + ros + ryt;
                        return (
                          <React.Fragment>
                            <td className="bd-td">{nf(ryo)}</td>
                            <td className="bd-td">{nf(rom)}</td>
                            <td className="bd-td">{nf(ros)}</td>
                            <td className="bd-td">{nf(ryt)}</td>
                            <td className="bd-td bd-td-avgt">{nf(rsum)}</td>
                          </React.Fragment>
                        );
                      })()}

                      {(() => {
                        const pembagi = getEffectivePembagi(activeGridMap);
                        const activeYLs = activeYLsList.filter((y: any) => y.status !== "nonaktif");
                        const sumTarget = activeYLs.reduce((sum: number, yl: any) => sum + (Number(activeTargetYLMap[yl.area]?.target) || 0), 0);
                        const sumBL = activeYLs.reduce((sum: number, yl: any) => sum + (Number(activeTargetYLMap[yl.area]?.bln_lalu) || 0), 0);
                        const sumTL = activeYLs.reduce((sum: number, yl: any) => sum + (Number(activeTargetYLMap[yl.area]?.thn_lalu) || 0), 0);

                        const totalTarget = Math.trunc(sumTarget) * pembagi;
                        const totalBL = Math.trunc(sumBL) * pembagi;
                        const totalTL = Math.trunc(sumTL) * pembagi;

                        const grandTotal = monthlyGridTotals.yo + monthlyGridTotals.om + monthlyGridTotals.os + monthlyGridTotals.yt;
                        const dTarget = grandTotal - totalTarget;
                        const dBL = grandTotal - totalBL;
                        const dTL = grandTotal - totalTL;
                        const dc = (v: number) => `bd-td ${v >= 0 ? "bd-td-pos" : "bd-td-neg"}`;
                        return (
                          <React.Fragment>
                            <td className="bd-td">{nf(totalTarget)}</td>
                            <td className={dc(dTarget)}>{dTarget >= 0 ? `+${nf(dTarget)}` : nf(dTarget)}</td>
                            <td className="bd-td">{nf(totalBL)}</td>
                            <td className={dc(dBL)}>{dBL >= 0 ? `+${nf(dBL)}` : nf(dBL)}</td>
                            <td className="bd-td">{nf(totalTL)}</td>
                            <td className={dc(dTL)}>{dTL >= 0 ? `+${nf(dTL)}` : nf(dTL)}</td>
                          </React.Fragment>
                        );
                      })()}
                      <td className="bd-td bd-td-komp">{nf(kompenBersihByArea.sum)}</td>
                    </tr>

                    <tr className="bd-tfoot-all">
                      <td className="bd-td-name bd-td">Total All Varian</td>
                      {bdDays.map((d) => {
                        const data = dailyGridTotals[d] || { yo: 0, om: 0, os: 0, yt: 0 };
                        const sum = data.yo + data.om + data.os + data.yt;
                        return (
                          <td key={d} colSpan={4} className="bd-td">{nf(sum)} btl</td>
                        );
                      })}
                      {bdIsWeek && (() => {
                        let sum = 0;
                        bdDays.forEach((d) => {
                          const t = dailyGridTotals[d];
                          if (t) sum += t.yo + t.om + t.os + t.yt;
                        });
                        return <td colSpan={5} className="bd-td">{nf(sum)} btl</td>;
                      })()}
                      <td colSpan={5} className="bd-td">
                        {nf(monthlyGridTotals.yo + monthlyGridTotals.om + monthlyGridTotals.os + monthlyGridTotals.yt)} btl
                      </td>
                      {(() => {
                        const pembagi = getEffectivePembagi(activeGridMap);
                        const rsum =
                          Math.trunc(monthlyGridTotals.yo / pembagi) + Math.trunc(monthlyGridTotals.om / pembagi) +
                          Math.trunc(monthlyGridTotals.os / pembagi) + Math.trunc(monthlyGridTotals.yt / pembagi);
                        return <td colSpan={5} className="bd-td">{nf(rsum)} btl</td>;
                      })()}
                      <td colSpan={6} className="bd-td"></td>
                      <td className="bd-td"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <GridSelectionToolbar
              selection={breakdownGridSelectionNew}
              isMenuOpen={isBreakdownMenuOpenNew}
              menuPos={breakdownMenuPosNew}
              onCopy={handleBreakdownGridCopy}
              onCut={handleBreakdownGridCut}
              onPaste={handleBreakdownGridPaste}
              onClear={handleBreakdownGridClear}
              onSelectAll={handleBreakdownSelectAll}
              onClose={() => {
                setIsBreakdownMenuOpenNew(false);
                setBreakdownGridSelectionNew(null);
              }}
            />
            {/* Fix: bilah input spreadsheet di atas keyboard — sebelumnya
                grid BD & Realisasi Admin tidak punya cara edit sama sekali
                di HP (sel tidak bisa disentuh, tidak ada bilah input). */}
            <SpreadsheetInputBar
              activeCell={breakdownActiveCell}
              cellLabel={breakdownActiveCell ? getBreakdownCellLabel(breakdownActiveCell.r, breakdownActiveCell.c) : undefined}
              value={breakdownActiveCellValue}
              isEditable={isBreakdownActiveCellEditable}
              onChange={handleBreakdownActiveCellValueChange}
              onPrev={goToPrevBreakdownCell}
              onNext={goToNextBreakdownCell}
              onDone={() => setBreakdownActiveCell(null)}
            />
            {breakdownClipboardModalNew && (
              <ClipboardFallbackModal
                mode={breakdownClipboardModalNew.mode}
                initialText={breakdownClipboardModalNew.text}
                onConfirmPaste={breakdownConfirmManualPaste}
                onClose={closeBreakdownClipboardModal}
              />
            )}
          </div>
        )}

        {/* Tab Target & Kompensasi */}
        {activeTab === "target_kompensasi" && (
          <div className="space-y-4">
            {/* Target TKU Card */}
            <div className="bd-card p-3.5 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="bd-icon"><MenuTitleIcon id="target_kompensasi" /></span>
                  <div>
                    <h2 className="bd-title uppercase">Target TKU Bulan Ini</h2>
                    <p className="bd-sub">Pengaturan target penjualan harian untuk TKU (Tanpa desimal, angka bulat/trunc)</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFetchTargetFromArchive}
                    disabled={isFetchingArchiveTarget}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {isFetchingArchiveTarget ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Menarik Arsip...</span>
                      </>
                    ) : (
                      <>
                        <span>📥</span>
                        <span>Tarik Realisasi dari Arsip</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleSaveSettingTargets(false)}
                    disabled={isSavingTarget}
                    className="bd-btn"
                  >
                    {isSavingTarget ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <>
                        <span>💾</span>
                        <span>Simpan All Target & Kompensasi</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {compSavedMsg && (
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-xl border border-emerald-200 dark:border-emerald-800 animate-pulse">
                  {compSavedMsg}
                </p>
              )}

              {archiveTargetMsg && (
                <div className="p-3 bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 rounded-xl text-xs font-bold text-brand-900 dark:text-brand-300 whitespace-pre-line leading-relaxed">
                  {archiveTargetMsg}
                </div>
              )}

              <div className="bd-table-wrap pt-2">
                <table className="bd-table">
                  <thead>
                    <tr>
                      <th className="bd-label text-left py-2 px-3">Baris Target / Realisasi</th>
                      <th className="bd-grp bd-grp-sum py-2 px-2">Total</th>
                      <th className="bd-v bd-v-yo py-2 px-2">Original (YO)</th>
                      <th className="bd-v bd-v-om py-2 px-2">Original Mangga (OM)</th>
                      <th className="bd-v bd-v-os py-2 px-2">Original Stroberi (OS)</th>
                      <th className="bd-v bd-v-yt py-2 px-2">Yakult Light (YT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { title: "Target Bulan Ini", prefix: "target", r: 0 },
                      { title: "Realisasi Bulan Lalu", prefix: "bln_lalu", r: 1 },
                      { title: "Realisasi Tahun Lalu", prefix: "thn_lalu", r: 2 },
                    ].map((rowItem) => {
                      const totalVal = (activeTargetTKU as any)[rowItem.prefix] ?? 0;
                      return (
                        <tr key={rowItem.prefix} className="bd-row hover:bg-[var(--bg-hover)] transition-colors">
                          <td className="bd-td text-left font-bold px-3 py-2 bg-[var(--bg-inset)]">
                            {rowItem.title}
                          </td>
                          <td className="bd-td bd-num font-bold px-2 py-1.5 bg-[var(--bg-hover)] text-neutral-900 dark:text-white">
                            {Math.trunc(Number(totalVal) || 0).toLocaleString("id-ID")}
                          </td>
                          {(["_yo", "_om", "_os", "_yt"] as const).map((sfx, cIdx) => {
                            const val = (activeTargetTKU as any)[`${rowItem.prefix}${sfx}`] ?? 0;
                            const cellProps = getTkuCellProps(rowItem.r, cIdx);
                            return (
                              <td
                                key={sfx}
                                {...cellProps}
                                className={`bd-td bd-num relative p-1 text-center ${cellProps.className}`}
                              >
                                {renderTkuSelectionHandle(rowItem.r, cIdx)}
                                <NumberInput
                                  min={0}
                                  value={val}
                                  onFocus={(e) => {
                                    e.target.select();
                                  }}
                                  onPaste={(e) => {
                                    const text = e.clipboardData.getData("text/plain");
                                    if (!text) return;
                                    e.preventDefault();
                                    const newSel = { startR: rowItem.r, startC: cIdx, endR: rowItem.r, endC: cIdx };
                                    setTkuGridSelection(newSel);
                                    setTimeout(() => {
                                      handleTkuGridPaste(text, newSel);
                                    }, 0);
                                  }}
                                  onChange={(n) => {
                                    handleUpdateTargetTKU((prev: any) => {
                                      const updated = { ...prev, [`${rowItem.prefix}${sfx}`]: n };
                                      const yo = updated[`${rowItem.prefix}_yo`] ?? 0;
                                      const om = updated[`${rowItem.prefix}_om`] ?? 0;
                                      const os = updated[`${rowItem.prefix}_os`] ?? 0;
                                      const yt = updated[`${rowItem.prefix}_yt`] ?? 0;
                                      updated[rowItem.prefix] = yo + om + os + yt;
                                      return updated;
                                    });
                                  }}
                                  className="w-full h-full p-1 text-xs text-center font-bold font-mono tabular-nums text-neutral-900 dark:text-white bg-transparent outline-none border-none"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Target YL Table Card */}
            <div className="bd-card p-3.5 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                <div>
                  <h3 className="bd-title uppercase">Target & Realisasi per Yakult Lady</h3>
                  <p className="bd-sub">Angka Target, Realisasi Bulan Lalu, dan Tahun Lalu mendukung format desimal 2 digit.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFetchTargetFromArchive}
                    disabled={isFetchingArchiveTarget}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {isFetchingArchiveTarget ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Mengambil Data Arsip...</span>
                      </>
                    ) : (
                      <>
                        <span>📥</span>
                        <span>Tarik Realisasi dari Arsip (Bulan Lalu & Tahun Lalu)</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncTargetTimFromYL}
                    className="bd-btn"
                  >
                    <span>⚡</span>
                    <span>Sinkronkan Target Tim dari Total 10 YL</span>
                  </button>
                </div>
              </div>

              <div className="bd-table-wrap">
                <table className="bd-table">
                  <thead>
                    <tr>
                      <th className="bd-th-name">Yakult Lady</th>
                      <th className="bd-grp py-2 px-2 text-center">Target Rata-Rata</th>
                      <th className="bd-grp py-2 px-2 text-center">Realisasi Bulan Lalu</th>
                      <th className="bd-grp py-2 px-2 text-center">Realisasi Tahun Lalu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ylList.filter((y: any) => y.status !== "nonaktif").map((yl: any, idx: number) => (
                      <TargetManagerRow
                        key={yl.area || idx}
                        yl={yl}
                        idx={idx}
                        targetYLMap={activeTargetYLMap}
                        setTargetYLMap={isViewingHistoricalMonth ? handleUpdateTargetYLMap : setTargetYLMap}
                        getTargetCellProps={getTargetCellProps}
                        renderTargetSelectionHandle={renderTargetSelectionHandle}
                        selectTargetRow={selectTargetRow}
                        setTargetGridSelection={setTargetGridSelection}
                        handleTargetGridPaste={handleTargetGridPaste}
                      />
                    ))}
                  </tbody>
                  <tfoot className="bd-tfoot font-mono tabular-nums">
                    <tr>
                      <td className="bd-td-name text-right font-bold">TOTAL</td>
                      <td className="bd-td bd-num text-center text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
                        {ylList
                          .filter((y: any) => y.status !== "nonaktif")
                          .reduce((sum: number, yl: any) => sum + (Number(activeTargetYLMap[yl.area]?.target) || 0), 0)
                          .toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="bd-td bd-num text-center text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
                        {ylList
                          .filter((y: any) => y.status !== "nonaktif")
                          .reduce((sum: number, yl: any) => sum + (Number(activeTargetYLMap[yl.area]?.bln_lalu) || 0), 0)
                          .toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="bd-td bd-num text-center text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
                        {ylList
                          .filter((y: any) => y.status !== "nonaktif")
                          .reduce((sum: number, yl: any) => sum + (Number(activeTargetYLMap[yl.area]?.thn_lalu) || 0), 0)
                          .toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Estimasi Rincian Kompensasi Bulanan per YL Card */}
            <div className="bd-card p-3.5 sm:p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💰</span>
                  <div>
                    <h2 className="bd-title uppercase">
                      Estimasi Rincian Kompensasi Bulanan per YL
                    </h2>
                    <p className="bd-sub">
                      Simulasi kompensasi kotor, potongan PPh (2,5%), Iuran JKK/JKM, JHT, dan kompensasi bersih per Yakult Lady
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="bd-label block mb-1.5">
                  Pilih Yakult Lady
                </label>
                <select
                  value={selectedYLArea}
                  onChange={(e) => setSelectedYLArea(e.target.value)}
                  className="bd-field w-full text-xs font-bold text-neutral-900 dark:text-white cursor-pointer"
                >
                  {(ylList && ylList.length > 0 ? ylList : names.map((n: string) => ({ area: n.substring(0, 3), nama: n }))).map((yl: any) => (
                    <option key={yl.area} value={yl.area}>
                      {yl.nama} ({yl.area})
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected YL Details */}
              {(() => {
                const ylPerf = activeDashboardData?.perYL?.[selectedYLArea];
                const totalPenjualanYL = ylPerf?.akumulasi ?? 0;
                const rata2PenjualanYL = ylPerf?.rata2 ?? 0;
                const targetYLVal = ylPerf?.targetYL ?? activeTargetYLMap?.[selectedYLArea]?.target ?? 0;
                const daysInMonth = ylPerf?.pembagi || 15;

                const effectiveTotal = totalPenjualanYL > 0 ? totalPenjualanYL : (targetYLVal * daysInMonth);
                const effectiveAvg = rata2PenjualanYL > 0 ? rata2PenjualanYL : targetYLVal;

                const tiers = (compConfig?.tiers && compConfig.tiers.length > 0)
                  ? [...compConfig.tiers].sort((a: any, b: any) => b.threshold - a.threshold)
                  : [
                      { threshold: 350, rate: 432 },
                      { threshold: 330, rate: 428 },
                      { threshold: 300, rate: 424 },
                      { threshold: 280, rate: 417 },
                      { threshold: 250, rate: 409 },
                      { threshold: 200, rate: 374 },
                      { threshold: 0, rate: 338 }
                    ];

                let rateTier = 338;
                for (const t of tiers) {
                  if (effectiveAvg >= t.threshold) {
                    rateTier = t.rate;
                    break;
                  }
                }

                const hasActiveData = effectiveTotal > 0;
                const kompenKotor = hasActiveData ? Math.floor(effectiveTotal * rateTier) : 0;
                const pphRateNum = (compConfig?.pphRate !== undefined && compConfig?.pphRate !== null) ? Number(compConfig.pphRate) : 2.5;
                const pphVal = hasActiveData ? Math.floor(kompenKotor * (pphRateNum / 100)) : 0;
                const selectedYlProfile = (ylList || []).find((y: any) => String(y.area).substring(0, 3) === String(selectedYLArea).substring(0, 3));
                const isIkutJht = selectedYlProfile ? (selectedYlProfile.ikutJht !== false) : true;
                const profileJhtNominal = selectedYlProfile && typeof selectedYlProfile.iuranJht === "number"
                  ? selectedYlProfile.iuranJht
                  : (compConfig?.jht !== undefined ? compConfig.jht : 24000);
                const jkkVal = hasActiveData
                  ? ((compConfig?.jkkJkm !== undefined && compConfig?.jkkJkm !== null) ? Number(compConfig.jkkJkm) : 18800)
                  : 0;
                const jhtVal = hasActiveData && isIkutJht ? profileJhtNominal : 0;
                const kresekVal = 0;
                const kompenBersihVal = Math.max(0, kompenKotor - pphVal - jkkVal - jhtVal - kresekVal);

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bd-subcard p-3 text-center">
                        <span className="bd-label block">Total Akumulasi Penjualan</span>
                        <span className="bd-num text-sm sm:text-base font-bold text-neutral-900 dark:text-white mt-1 block">
                          {Math.trunc(totalPenjualanYL).toLocaleString("id-ID")} btl
                        </span>
                      </div>
                      <div className="bd-subcard p-3 text-center">
                        <span className="bd-label block">Rata-Rata Penjualan</span>
                        <span className="bd-num text-sm sm:text-base font-bold text-neutral-900 dark:text-white mt-1 block">
                          {Math.trunc(rata2PenjualanYL)} btl/hr
                        </span>
                      </div>
                    </div>

                    {/* Kompensasi Table */}
                    <div className="bd-subcard overflow-hidden">
                      <div className="p-2.5 bg-[var(--bg-header)] text-[var(--ink)] font-bold text-xs uppercase tracking-wider flex items-center justify-between border-b border-[var(--line)]">
                        <span>Rincian Kompensasi & Potongan</span>
                        <span className="text-[10px] bg-brand-500 text-white font-bold px-2 py-0.5 rounded font-mono">
                          Area {selectedYLArea}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 font-bold font-mono tabular-nums">
                            <tr>
                              <td className="p-2.5 font-sans text-neutral-600 dark:text-neutral-300 font-normal">Kompensasi Kotor</td>
                              <td className="p-2.5 text-right text-neutral-900 dark:text-white font-bold">{formatRp(kompenKotor)}</td>
                            </tr>
                            <tr className="text-rose-600 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/20">
                              <td className="p-2.5 font-sans font-normal">PPh ({pphRateNum.toString().replace('.', ',')}%)</td>
                              <td className="p-2.5 text-right font-bold">- {formatRp(pphVal)}</td>
                            </tr>
                            <tr className="text-rose-600 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/20">
                              <td className="p-2.5 font-sans font-normal">Iuran JKK / JKM</td>
                              <td className="p-2.5 text-right font-bold">- {formatRp(jkkVal)}</td>
                            </tr>
                            <tr className="text-rose-600 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/20">
                              <td className="p-2.5 font-sans font-normal" colSpan={2}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 font-sans">
                                    <span>Iuran JHT</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                      isIkutJht
                                        ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                                        : "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600"
                                    }`}>
                                      {isIkutJht ? "✓ Ikut Program" : "✕ Tidak Ikut"}
                                    </span>
                                  </div>
                                  <span className="font-bold text-rose-700 dark:text-rose-400">
                                    {isIkutJht ? `- ${formatRp(jhtVal)}` : "Rp 0"}
                                  </span>
                                </div>
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-normal italic block mt-1 leading-snug font-sans">
                                  *Nilai ini hanya ditampilkan. Untuk mengubah Iuran JHT, edit di tabel Profil/Kelola Yakult Lady.
                                </span>
                              </td>
                            </tr>
                            <tr className="text-rose-600 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/20">
                              <td className="p-2.5 font-sans font-normal">Kresek / Potongan Mandiri</td>
                              <td className="p-2.5 text-right font-bold">- {formatRp(kresekVal)}</td>
                            </tr>
                            <tr className="bg-emerald-100/80 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200 font-bold text-sm border-t-2 border-emerald-300 dark:border-emerald-800">
                              <td className="p-3 font-sans">Kompensasi Bersih</td>
                              <td className="p-3 text-right text-emerald-700 dark:text-emerald-300 font-bold text-base">{formatRp(kompenBersihVal)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <GridSelectionToolbar
              selection={targetGridSelection}
              isMenuOpen={targetIsMenuOpen}
              menuPos={targetMenuPos}
              onCopy={handleTargetGridCopy}
              onCut={handleTargetGridCut}
              onPaste={handleTargetGridPaste}
              onClear={handleTargetGridClear}
              onClose={() => {
                setTargetIsMenuOpen(false);
                setTargetGridSelection(null);
              }}
            />
            {targetClipboardModal && (
              <ClipboardFallbackModal
                mode={targetClipboardModal.mode}
                initialText={targetClipboardModal.text}
                onConfirmPaste={targetConfirmManualPaste}
                onClose={closeTargetClipboardModal}
              />
            )}

            <GridSelectionToolbar
              selection={tkuGridSelection}
              isMenuOpen={tkuIsMenuOpen}
              menuPos={tkuMenuPos}
              onCopy={handleTkuGridCopy}
              onCut={handleTkuGridCut}
              onPaste={handleTkuGridPaste}
              onClear={handleTkuGridClear}
              onClose={() => {
                setTkuIsMenuOpen(false);
                setTkuGridSelection(null);
              }}
            />
            {tkuClipboardModal && (
              <ClipboardFallbackModal
                mode={tkuClipboardModal.mode}
                initialText={tkuClipboardModal.text}
                onConfirmPaste={tkuConfirmManualPaste}
                onClose={closeTkuClipboardModal}
              />
            )}

            {/* Fix: bilah input spreadsheet (di atas keyboard) untuk grid Target
                per-YL maupun grid TKU — sebelumnya menu ini tidak pernah
                merender SpreadsheetInputBar sama sekali. */}
            <SpreadsheetInputBar
              activeCell={targetActiveCell}
              cellLabel={targetActiveCell ? getTargetGridCellLabel(targetActiveCell.r, targetActiveCell.c) : undefined}
              value={targetActiveCellValue}
              isEditable={isTargetActiveCellEditable}
              onChange={handleTargetActiveCellValueChange}
              onPrev={goToPrevTargetCell}
              onNext={goToNextTargetCell}
              onDone={() => setTargetActiveCell(null)}
            />
            <SpreadsheetInputBar
              activeCell={tkuActiveCell}
              cellLabel={tkuActiveCell ? getTkuGridCellLabel(tkuActiveCell.r, tkuActiveCell.c) : undefined}
              value={tkuActiveCellValue}
              isEditable={isTkuActiveCellEditable}
              onChange={handleTkuActiveCellValueChange}
              onPrev={goToPrevTkuCell}
              onNext={goToNextTkuCell}
              onDone={() => setTkuActiveCell(null)}
            />
          </div>
        )}

        {/* Tautan Yakult */}
        {activeTab === "tautan" && (
          <React.Suspense fallback={<TabLoadingFallback />}>
            <OfficialLinksViewer isAdmin={true} onBack={() => setActiveTab("dashboard")} />
          </React.Suspense>
        )}

        {/* Tab Pengaturan & Cloud Supabase */}
        {/* Tab Arsip */}
        {activeTab === "archive" && (
          <div className="space-y-4">
            {/* Archive Editor Feature */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-indigo-200 dark:border-indigo-800 shadow-sm space-y-3">
              <h2 className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">
                <span className="inline-flex items-center gap-1.5"><MenuTitleIcon id="archive" className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />Archive Editor (Edit Data Masa Lalu)</span>
              </h2>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">
                Masuk ke lingkungan terisolasi untuk melihat dan merevisi data arsip bulan-bulan sebelumnya yang tersimpan di Supabase tanpa mempengaruhi bulan berjalan.
              </p>
              <button
                onClick={() => setShowArchiveEditor(true)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer shadow flex items-center justify-center gap-2 mt-2"
              >
                🛠️ Buka Archive Editor
              </button>
            </div>

            {/* Arsip Target Tahunan Feature */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-emerald-200 dark:border-emerald-800 shadow-sm space-y-3">
              <h2 className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
                📊 Arsip Target Tahunan (Rekap Semester & Tahunan)
              </h2>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">
                Lihat rekap Target vs AKM PJL per bulan, semester, dan total tahunan — otomatis tersinkron dari arsip bulanan, dengan opsi isi manual untuk bulan yang belum diarsipkan.
              </p>
              <button
                onClick={() => setShowTargetArsipTahunan(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer shadow flex items-center justify-center gap-2 mt-2"
              >
                📊 Buka Arsip Target Tahunan
              </button>
            </div>

            {showTargetArsipTahunan && (
              <React.Suspense fallback={null}>
                <TargetArsipTahunanModal onClose={() => setShowTargetArsipTahunan(false)} />
              </React.Suspense>
            )}

            {/* 2. Finish & Archive Month */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800 pb-3">
                <h2 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                  📦 Selesaikan & Arsipkan Bulan Berjalan
                </h2>
                {/* Month Picker for Archive */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">Pilih Bulan:</span>
                  <input
                    type="month"
                    value={selectedMonthlyArchive}
                    onChange={(e) => setSelectedMonthlyArchive(e.target.value)}
                    className="p-1.5 text-xs font-bold bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 outline-none"
                  />
                </div>
              </div>

              {archivedMonthsList.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 bg-neutral-50 dark:bg-neutral-800/40 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <span className="text-[11px] font-bold text-neutral-600 dark:text-neutral-400">📂 Daftar Bulan Tersimpan di Supabase:</span>
                  <select
                    value={archivedMonthsList.includes(selectedMonthlyArchive) ? selectedMonthlyArchive : ""}
                    onChange={(e) => {
                      if (e.target.value) setSelectedMonthlyArchive(e.target.value);
                    }}
                    className="p-1.5 text-xs font-bold bg-white dark:bg-neutral-800 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-none cursor-pointer"
                  >
                    <option value="" disabled>-- Pilih Bulan Tersimpan --</option>
                    {archivedMonthsList.map((m) => (
                      <option key={m} value={m}>
                        {getIndonesianMonthLabel(m)} ({m})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
                Mengunci dan mengarsipkan seluruh rekapitulasi data bulan <strong className="text-indigo-900 dark:text-indigo-300 font-bold">{getIndonesianMonthLabel(selectedMonthlyArchive) || selectedMonthlyArchive} ({selectedMonthlyArchive})</strong> ke Supabase secara permanen.
              </p>

              {archiveStatusMsg && (
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 leading-relaxed">
                  {archiveStatusMsg}
                </p>
              )}

              <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-1">
                <button
                  onClick={handleFinishAndArchiveMonth}
                  disabled={isSbSyncing}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 px-3 rounded-xl transition-all cursor-pointer shadow disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  🔒 Selesaikan & Arsipkan Data ({selectedMonthlyArchive})
                </button>
                {isViewingHistoricalMonth && (
                  <button
                    onClick={handleResetToLiveData}
                    className="bg-neutral-700 hover:bg-neutral-800 text-white font-bold text-xs py-2.5 px-3 rounded-xl transition-all cursor-pointer shadow flex items-center justify-center gap-2 shrink-0"
                  >
                    🔄 Kembali ke Data Live
                  </button>
                )}
              </div>
            </div>

          </div>
        )}

        {/* Tab Attention Manager (Catatan Perhatian YL) */}
        {activeTab === "attention" && (
          <div className="space-y-4 max-w-4xl mx-auto pb-10">
            {/* Top Bar Header */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 sm:p-5 border border-neutral-200 dark:border-neutral-800 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className="p-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Kembali</span>
                </button>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <MenuTitleIcon id="attention" className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    <span>Catatan Perhatian Manager (Attention YL)</span>
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Pesan atau arahan khusus yang tampil langsung di dashboard YL sesuai area.
                  </p>
                </div>
              </div>
            </div>

            {/* Input & Form Card */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 sm:p-5 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider block">
                  Pilih Sasaran YL
                </label>
                <select
                  value={attentionArea}
                  onChange={(e) => {
                    const area = e.target.value;
                    setAttentionArea(area);
                    setAttentionText(area === "all" ? "" : (attentionMap[area] || ""));
                  }}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs rounded-xl p-3 font-bold text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">🌐 Semua YL (Broadcast ke seluruh Lady)</option>
                  {ylList.map((y: any) => (
                    <option key={y.area} value={y.area}>
                      Area {y.area} - {y.nama}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-wider block">
                  Pesan Attention / Instruksi Khusus
                </label>
                <textarea
                  rows={4}
                  value={attentionText}
                  onChange={(e) => setAttentionText(e.target.value)}
                  placeholder="Ketik catatan, instruksi, atau perhatian khusus untuk YL..."
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs rounded-xl p-3 font-medium text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                />
              </div>

              {attentionSavedMsg && (
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Catatan Attention berhasil disimpan dan diperbarui di sistem!</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={handleSaveAttention}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-2 active:scale-95"
                >
                  <span>💾</span>
                  <span>Simpan Catatan Attention</span>
                </button>
                {attentionText && (
                  <button
                    onClick={() => setAttentionText("")}
                    className="text-xs font-bold text-neutral-500 dark:text-neutral-400 hover:text-red-500 px-3 py-1.5 transition-colors cursor-pointer"
                  >
                    Bersihkan Kolom
                  </button>
                )}
              </div>
            </div>

            {/* Status Attention Per Area Overview */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 sm:p-5 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">
                Daftar Catatan Perhatian Aktif Saat Ini
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ylList.map((y: any) => {
                  const note = attentionMap[y.area];
                  return (
                    <div
                      key={y.area}
                      onClick={() => {
                        setAttentionArea(y.area);
                        setAttentionText(note || "");
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        note 
                          ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/60 hover:border-amber-400" 
                          : "bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200 dark:border-neutral-700/60 hover:border-neutral-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold text-neutral-900 dark:text-white">
                          Area {y.area} - {y.nama}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          note ? "bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100" : "bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400"
                        }`}>
                          {note ? "Ada Catatan" : "Kosong"}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-300 line-clamp-2 italic">
                        {note || "Belum ada catatan khusus."}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "setting" && (
          <div className="space-y-4">
            {/* 0. Konfigurasi Cloud Supabase (dikunci PIN) */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-cyan-200 dark:border-cyan-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold text-cyan-900 dark:text-cyan-300 uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1.5"><MenuTitleIcon id="setting" className="w-4 h-4 text-cyan-600 dark:text-cyan-300" />Konfigurasi Cloud Supabase</span>
                </h2>
                {isSbUnlocked && (
                  <button
                    onClick={handleLockSbMenu}
                    className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 hover:text-cyan-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-cyan-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                    title="Kunci kembali panel ini"
                  >
                    🔒 Kunci Lagi
                  </button>
                )}
              </div>

              {!isSbUnlocked ? (
                <div className="space-y-2">
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">
                    Bagian ini dikunci PIN khusus demi keamanan link & API key database.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={sbPinInput}
                      onChange={(e) => setSbPinInput(e.target.value)}
                      placeholder="Masukkan PIN"
                      className="flex-1 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 text-xs rounded-xl p-2.5 font-bold text-neutral-800 dark:text-neutral-200 outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <button
                      onClick={handleUnlockSbMenu}
                      className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow"
                    >
                      🔓 Buka
                    </button>
                  </div>
                  {sbPinError && <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">{sbPinError}</p>}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
                      URL Supabase
                    </label>
                    <input
                      type="text"
                      value={sbUrl}
                      onChange={(e) => setSbUrl(e.target.value)}
                      placeholder="https://xxxxx.supabase.co"
                      className="w-full bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 text-xs rounded-xl p-2.5 font-bold text-neutral-800 dark:text-neutral-200 outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
                      Anon/Public Key Supabase
                    </label>
                    <input
                      type="password"
                      value={sbKey}
                      onChange={(e) => setSbKey(e.target.value)}
                      placeholder="eyJhbGciOi..."
                      className="w-full bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 text-xs rounded-xl p-2.5 font-bold text-neutral-800 dark:text-neutral-200 outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={handleSaveSupabaseConfig}
                      className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow"
                    >
                      💾 Simpan &amp; Tes Koneksi
                    </button>
                    <button
                      onClick={handleSyncAllToSupabase}
                      disabled={isSbSyncing}
                      className="bg-emerald-100 dark:bg-emerald-900/50 hover:bg-emerald-200 text-emerald-900 dark:text-emerald-300 font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      ⬆️ Unggah Semua Data
                    </button>
                    <button
                      onClick={handleLoadAllFromSupabase}
                      disabled={isSbSyncing}
                      className="bg-sky-100 dark:bg-sky-900/50 hover:bg-sky-200 text-sky-900 dark:text-sky-300 font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      ⬇️ Tarik Semua Data
                    </button>
                  </div>

                  {sbMsg && (
                    <p className="text-xs font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 p-2.5 rounded-xl border border-cyan-200 dark:border-cyan-800 leading-relaxed">
                      {sbMsg}
                    </p>
                  )}

                  {/* SUB-PANEL: AKUN SUPABASE KEDUA (KHUSUS MEDIA / FOTO / SERAGAM / MOTIVASI) */}
                  <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 mt-2 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">🖼️</span>
                        <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wide">
                          Akun Supabase Media (Akun Kedua)
                        </h4>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        mediaStatus?.tableReady 
                          ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300" 
                          : "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300"
                      }`}>
                        {mediaStatus?.tableReady ? "🟢 Aktif & Siap" : "🟡 Menunggu Tabel SQL"}
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      Akun kedua ini khusus menyimpan foto profil YL, jadwal &amp; gambar seragam, dan konfigurasi motivasi agar akun utama 100% bebas beban egress.
                    </p>

                    {/* Form Edit Manual URL & Key Akun Media */}
                    <div className="bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 space-y-3 text-[11px]">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
                            URL Akun Media (Supabase Kedua)
                          </label>
                          <button
                            type="button"
                            onClick={handleResetDefaultMedia}
                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 underline cursor-pointer"
                          >
                            Isi URL Default
                          </button>
                        </div>
                        <input
                          type="text"
                          value={sbMediaUrl}
                          onChange={(e) => setSbMediaUrl(e.target.value)}
                          placeholder="https://xxxxx.supabase.co"
                          className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 text-xs rounded-xl p-2.5 font-bold text-neutral-800 dark:text-neutral-200 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
                          Anon / Public Key Akun Media
                        </label>
                        <input
                          type="password"
                          value={sbMediaKey}
                          onChange={(e) => setSbMediaKey(e.target.value)}
                          placeholder="eyJhbGciOi... atau sb_publishable_..."
                          className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 text-xs rounded-xl p-2.5 font-bold text-neutral-800 dark:text-neutral-200 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      {mediaStatus?.message && (
                        <div className={`text-[10px] font-bold mt-1 ${mediaStatus.tableReady ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700"}`}>
                          Status: {mediaStatus.message}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={handleSaveSupabaseMediaConfig}
                        disabled={isSbMediaSaving}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow disabled:opacity-50 flex items-center gap-1"
                      >
                        {isSbMediaSaving ? "⏳ Menyimpan..." : "💾 Simpan & Hubungkan Akun Media"}
                      </button>

                      <button
                        onClick={handleMigrateMedia}
                        disabled={isMigratingMedia}
                        className="bg-neutral-800 hover:bg-neutral-900 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow disabled:opacity-50"
                      >
                        {isMigratingMedia ? "⏳ Memindahkan..." : "🔄 Cek & Pindahkan Media ke Akun Baru"}
                      </button>

                      <button
                        onClick={() => setShowSqlGuide(!showSqlGuide)}
                        className="bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 text-neutral-800 dark:text-neutral-200 font-bold text-xs px-3 py-2 rounded-xl transition-all cursor-pointer"
                      >
                        {showSqlGuide ? "Sembunyikan Petunjuk SQL" : "📜 Petunjuk Buat Tabel SQL"}
                      </button>
                    </div>

                    {mediaMigrationMsg && (
                      <div className="text-xs font-bold text-indigo-900 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 leading-relaxed">
                        {mediaMigrationMsg}
                      </div>
                    )}

                    {showSqlGuide && (
                      <div className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 p-3 rounded-xl space-y-2 text-xs font-mono">
                        <div className="text-amber-300 font-bold text-[11px] font-sans">
                          Jalankan perintah SQL ini di SQL Editor Supabase Baru (wkwjmwxxdfxyfqaseuha):
                        </div>
                        <pre className="text-[10px] bg-neutral-950 p-2 rounded border border-neutral-800 overflow-x-auto whitespace-pre-wrap select-all">
{`CREATE TABLE IF NOT EXISTS public.app_store (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.app_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all" 
ON public.app_store 
FOR ALL 
USING (true) 
WITH CHECK (true);`}
                        </pre>
                        <button
                          onClick={() => {
                            const sql = `CREATE TABLE IF NOT EXISTS public.app_store (\n  key TEXT PRIMARY KEY,\n  data JSONB NOT NULL,\n  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())\n);\n\nALTER TABLE public.app_store ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY "Allow public all" \nON public.app_store \nFOR ALL \nUSING (true) \nWITH CHECK (true);`;
                            navigator.clipboard?.writeText(sql);
                            alert("Kueri SQL berhasil disalin ke clipboard!");
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-bold text-[10px] px-2.5 py-1.5 rounded cursor-pointer"
                        >
                          📋 Salin Kueri SQL
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
                    {!isChangingSbPin ? (
                      <button
                        onClick={() => setIsChangingSbPin(true)}
                        className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 underline cursor-pointer"
                      >
                        Ganti PIN Keamanan Supabase
                      </button>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <input
                          type="password"
                          value={newSbPinInput}
                          onChange={(e) => setNewSbPinInput(e.target.value)}
                          placeholder="PIN baru (min 4 karakter)"
                          className="flex-1 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 text-xs rounded-xl p-2 font-bold text-neutral-800 dark:text-neutral-200 outline-none"
                        />
                        <button
                          onClick={handleChangeSbPin}
                          className="bg-neutral-800 text-white text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
                        >
                          Simpan
                        </button>
                      </div>
                    )}
                    {sbPinChangeMsg && <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">{sbPinChangeMsg}</p>}
                  </div>
                </div>
              )}
            </div>

            {/* 6. Kelola Kalimat Motivasi Harian (YL) */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
                <h2 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                  📢 Kelola Kalimat Motivasi Harian (Running Text YL)
                </h2>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-bold text-neutral-700 dark:text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localMotivasiEnabled}
                      onChange={(e) => setLocalMotivasiEnabled(e.target.checked)}
                      className="accent-amber-600 rounded cursor-pointer w-4 h-4"
                    />
                    Aktifkan Running Text
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase">Interval:</span>
                    <input
                      type="number"
                      min={5}
                      value={localMotivasiInterval}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setLocalMotivasiInterval(e.target.value === '' ? '' : Number(e.target.value))}
                      className="bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 text-xs rounded-xl p-1.5 font-bold text-neutral-800 dark:text-neutral-200 w-16 text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">detik</span>
                  </div>
                </div>
              </div>

              {/* Input Tambah Kalimat */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
                  Tambah Kalimat Motivasi Baru
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMotivasiInput}
                    onChange={(e) => setNewMotivasiInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddMotivasi(); }}
                    placeholder="Ketik kalimat motivasi baru untuk YL di sini..."
                    className="flex-1 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 text-xs rounded-xl p-2.5 font-medium text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    onClick={handleAddMotivasi}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow shrink-0"
                  >
                    ➕ Tambah
                  </button>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSelectAllMotivasi}
                    className="bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-[11px] px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    ☑️ Pilih Semua ({localMotivasiList.length})
                  </button>
                  <button
                    onClick={handleDeselectAllMotivasi}
                    className="bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-[11px] px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    🔲 Batal Semua
                  </button>
                  <button
                    onClick={handleLoadSampleMotivasi}
                    className="bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-800 dark:text-amber-300 font-bold text-[11px] px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 transition-all cursor-pointer"
                  >
                    💡 Muat Contoh Motivasi
                  </button>
                </div>
                <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                  Terpilih: <strong className="text-amber-600 dark:text-amber-400">{localMotivasiTerpilih.length}</strong> / {localMotivasiList.length}
                </span>
              </div>

              {/* Daftar Kalimat Motivasi */}
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 border border-neutral-100 dark:border-neutral-800 rounded-xl p-2 bg-neutral-50/50 dark:bg-neutral-800/50">
                {localMotivasiList.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic text-center py-4">Belum ada kalimat motivasi. Silakan tambah atau muat contoh motivasi.</p>
                ) : (
                  localMotivasiList.map((item, idx) => {
                    const isSelected = localMotivasiTerpilih.includes(item);
                    return (
                      <div
                        key={idx}
                        className={`flex items-start justify-between gap-2 p-2.5 rounded-xl border text-xs transition-all ${
                          isSelected ? "bg-white dark:bg-neutral-900 border-amber-300 dark:border-amber-700 shadow-sm text-neutral-800 dark:text-neutral-200" : "bg-neutral-100/60 dark:bg-neutral-800/60 border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 opacity-70"
                        }`}
                      >
                        <label className="flex items-start gap-2.5 flex-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleMotivasiItem(item)}
                            className="accent-amber-600 rounded cursor-pointer w-4 h-4 mt-0.5 shrink-0"
                          />
                          <span className="font-medium leading-relaxed">{item}</span>
                        </label>
                        <button
                          onClick={() => handleDeleteMotivasiItem(item)}
                          className="text-neutral-400 hover:text-rose-600 font-bold text-xs p-1 rounded transition-colors shrink-0 cursor-pointer"
                          title="Hapus kalimat ini"
                        >
                          🗑️
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pesan Sukses Simpan */}
              {motivasiSavedMsg && (
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  {motivasiSavedMsg}
                </p>
              )}

              {/* Tombol Simpan Akhir */}
              <button
                onClick={handleSaveMotivasiConfigAll}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer shadow flex items-center justify-center gap-2"
              >
                💾 Simpan Pengaturan Motivasi & Branding
              </button>
            </div>




            {/* 5. Branding & Identitas Aplikasi */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-3">
              <h2 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                🏷️ Identitas Depo & Chatbot AI
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
                    Nama TKU / Depo (DP)
                  </label>
                  <input
                    type="text"
                    value={tkuNameInput}
                    onChange={(e) => setTkuNameInput(e.target.value)}
                    placeholder="DP Jember 1"
                    className="w-full bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 text-xs rounded-xl p-2.5 font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block">
                    Nama Chatbot AI
                  </label>
                  <input
                    type="text"
                    value={chatbotNameInput}
                    onChange={(e) => setChatbotNameInput(e.target.value)}
                    placeholder="AI Jember 1 Pro"
                    className="w-full bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 text-xs rounded-xl p-2.5 font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveMotivasiConfigAll}
                className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow cursor-pointer flex items-center gap-1.5"
              >
                <span>💾</span>
                <span>Simpan Branding</span>
              </button>
            </div>

            {/* 3. Reset Data (Targeted) */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-rose-100 dark:border-rose-900/40 shadow-sm space-y-3">
              <h2 className="text-xs font-bold text-rose-950 dark:text-rose-200 uppercase tracking-wider flex items-center gap-2">
                🗑️ Reset Data Kerja Aktif (4 Kategori)
              </h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed font-medium">
                Hanya menghapus data aktif kerja: PLG & PJL, Input PJL Harian, BD & Realisasi (termasuk LHPP), dan Target YL/TKU pada bulan yang dipilih. Data master profil, PIN, Motivasi, Seragam tetap AMAN.
              </p>

              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-emerald-900 dark:text-emerald-300 text-xs flex items-start gap-2">
                <span className="text-base">🛡️</span>
                <div className="text-[11px] leading-relaxed">
                  <strong className="text-emerald-950 font-bold block mb-0.5">Arsip di Supabase Tetap Aman:</strong>
                  Reset data di sini <u>TIDAK AKAN</u> menghapus arsip bulanan yang tersimpan di Supabase. Untuk mengelola atau menghapus data arsip di Supabase, silakan buka menu <span className="font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">Arsip</span>.
                </div>
              </div>

              <div className="space-y-3 mt-2">
                <label className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider block">Pilih Cakupan Reset:</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-neutral-700 dark:text-neutral-300 cursor-pointer">
                    <input type="radio" name="resetScope" value="current_month" checked={resetScope === "current_month"} onChange={() => setResetScope("current_month")} className="accent-rose-600" />
                    <span>Hanya Bulan Tertentu</span>
                  </label>

                  {resetScope === "current_month" && (
                    <div className="ml-6 flex items-center gap-2 bg-neutral-50 dark:bg-neutral-800/40 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800">
                      <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">Pilih Bulan:</span>
                      <input
                        type="month"
                        value={resetSelectedMonth}
                        onChange={(e) => setResetSelectedMonth(e.target.value)}
                        className="p-1.5 text-xs font-bold bg-white dark:bg-neutral-800 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 outline-none cursor-pointer"
                      />
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">({getIndonesianMonthLabel(resetSelectedMonth) || resetSelectedMonth})</span>
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-xs font-bold text-neutral-700 dark:text-neutral-300 cursor-pointer">
                    <input type="radio" name="resetScope" value="all" checked={resetScope === "all"} onChange={() => setResetScope("all")} className="accent-rose-600" />
                    <span>Semua Riwayat (Semua Bulan)</span>
                  </label>
                </div>
              </div>

              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-rose-900 dark:text-rose-300 text-xs space-y-2">
                <p><strong>Cakupan yang akan direset:</strong> <span className="font-mono font-bold text-rose-950 dark:text-rose-200">{resetScope === "all" ? "SEMUA RIWAYAT BULAN" : `BULAN ${resetSelectedMonth} (${getIndonesianMonthLabel(resetSelectedMonth)})`}</span></p>
                <p><strong>Data aktif yang AKAN DIKOSONGKAN:</strong></p>
                <ul className="list-disc pl-4 font-bold text-[10px] space-y-1">
                  <li>Data Pelanggan & Penjualan (PLG & PJL)</li>
                  <li>Transaksi Harian / LHPP PDM</li>
                  <li>Target YL & Target TKU</li>
                  <li>Breakdown Plan & Realisasi</li>
                </ul>
              </div>

              {resetSuccessMsg && (
                <div className={`p-3 rounded-xl border text-xs font-bold ${resetSuccessMsg.startsWith('✅') ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-300' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
                  {resetSuccessMsg}
                </div>
              )}

              <button
                onClick={handleResetTargeted}
                disabled={isResetting}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
              >
                <span>🗑️</span>
                <span>{isResetting ? "Sedang Mereset Data..." : `Reset Data ${resetScope === "all" ? "Semua Bulan" : `Bulan ${resetSelectedMonth}`} Sekarang`}</span>
              </button>
            </div>

            {/* 4. Backup & Cache */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-3">
              <h2 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                💾 Cadangan & Pembersihan Cache
              </h2>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={handleExportBackupJson}
                  className="bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                >
                  📥 Ekspor Backup Data JSON
                </button>
                <label className="bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1">
                  <span>📤 Impor Backup JSON</span>
                  <input type="file" accept=".json" onChange={handleImportBackupJson} className="hidden" />
                </label>
                <button
                  onClick={handleClearCache}
                  className="bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 text-amber-900 dark:text-amber-300 font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                >
                  🧹 Bersihkan Cache LocalStorage
                </button>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === "seragam" && (
          <ErrorBoundary>
            <React.Suspense fallback={<TabLoadingFallback />}>
              <ManagerSeragamView />
            </React.Suspense>
          </ErrorBoundary>
        )}
        
        {activeTab === "lady" && (
          <React.Suspense fallback={<TabLoadingFallback />}>
            <ManagerLadyTab
              ylList={ylList}
              setYlList={setYlList}
              handleSaveYlList={handleSaveYlList}
              handleDeleteYl={handleDeleteYl}
              handleAddYl={handleAddYl}
              newYlArea={newYlArea}
              setNewYlArea={setNewYlArea}
              newYlKode={newYlKode}
              setNewYlKode={setNewYlKode}
              newYlNama={newYlNama}
              setNewYlNama={setNewYlNama}
              newYlTanggalMasuk={newYlTanggalMasuk}
              setNewYlTanggalMasuk={setNewYlTanggalMasuk}
              newYlPin={newYlPin}
              setNewYlPin={setNewYlPin}
              newYlNik={newYlNik}
              setNewYlNik={setNewYlNik}
              newYlTglLahir={newYlTglLahir}
              setNewYlTglLahir={setNewYlTglLahir}
              newYlIkutJht={newYlIkutJht}
              setNewYlIkutJht={setNewYlIkutJht}
              newYlIuranJht={newYlIuranJht}
              setNewYlIuranJht={setNewYlIuranJht}
              ylSavedMsg={ylSavedMsg}
              newYlNoHP={newYlNoHP}
              setNewYlNoHP={setNewYlNoHP}
              newYlAlamat={newYlAlamat}
              setNewYlAlamat={setNewYlAlamat}
              compConfig={compConfig}
              setCompConfig={setCompConfig}
              handleSaveCompConfig={handleSaveCompConfig}
              compSavedMsg={compSavedMsg}
            />
          </React.Suspense>
        )}
        
        {(activeTab === "input_realisasi" || activeTab === "lhpp_realisasi") && (
          <div className="space-y-4">
            <React.Suspense fallback={<TabLoadingFallback />}>
              <LhppRealisasiView
                ylList={ylList}
                selectedMonth={globalMonth}
                breakdownPlanMap={breakdownPlanMap}
                breakdownRealisasiMap={breakdownRealisasiMap}
                onSaveLhpp={async () => { await fetchBreakdownPlan(globalMonth); }}
              />
            </React.Suspense>
          </div>
        )}

        {activeTab === "plg_pjl" && (
          <React.Suspense fallback={<TabLoadingFallback />}>
            <PlgPjlView ylList={ylList} historicalMonth={globalMonth} />
          </React.Suspense>
        )}

        {activeTab === "product_knowledge" && (
          <React.Suspense fallback={<TabLoadingFallback />}>
            <ProductKnowledgeView />
          </React.Suspense>
        )}
      </main>
      </div>

      {/* 1. In-App Modal: Konfirmasi Reset Data Kerja Aktif */}
      {showTargetedResetModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-rose-200 dark:border-rose-800 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 text-2xl shrink-0">
                🗑️
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 leading-tight">Konfirmasi Reset Data Kerja Aktif</h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-bold">Pengosongan Data Transaksi & Target</p>
              </div>
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-4 text-xs text-rose-950 dark:text-rose-200 space-y-2.5">
              <p className="font-bold text-neutral-800 dark:text-neutral-200">
                Apakah Anda yakin ingin mengosongkan data kerja aktif untuk:
              </p>
              <div className="text-center py-2.5 px-3 bg-white dark:bg-neutral-900 rounded-xl border border-rose-300 dark:border-rose-700 font-mono font-black text-sm text-rose-700 dark:text-rose-300 shadow-sm">
                📅 {resetScope === "all" ? "SEMUA RIWAYAT (Semua Bulan)" : `BULAN ${resetSelectedMonth} (${getIndonesianMonthLabel(resetSelectedMonth) || resetSelectedMonth})`}
              </div>

              <div className="text-[11px] text-neutral-700 dark:text-neutral-300 space-y-1">
                <p className="font-bold text-rose-900 dark:text-rose-300">Data yang AKAN DIKOSONGKAN:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-neutral-600 dark:text-neutral-400 font-medium">
                  <li>Data Pelanggan & Penjualan (PLG & PJL)</li>
                  <li>Transaksi Harian / LHPP PDM</li>
                  <li>Target YL & Target TKU</li>
                  <li>Breakdown Plan & Realisasi</li>
                </ul>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg p-2.5 text-[11px] text-emerald-900 dark:text-emerald-300 font-medium flex items-start gap-2">
                <span className="text-sm">🛡️</span>
                <span>
                  <strong className="text-emerald-950 font-bold">Arsip Supabase Aman:</strong> Data arsip bulanan yang tersimpan di cloud Supabase <u>TIDAK AKAN</u> terhapus.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowTargetedResetModal(false)}
                disabled={isResetting}
                className="flex-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleExecuteResetTargeted}
                disabled={isResetting}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <span>🗑️</span>
                <span>{isResetting ? "Mereset..." : "Ya, Reset Data Sekarang"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
