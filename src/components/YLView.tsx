import ProductKnowledgeView from "./ProductKnowledgeView";
import { OfficialLinksViewer } from "./OfficialLinksViewer";
import { ClipboardFallbackModal } from "./ClipboardFallbackModal";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import JossLogo from "./JossLogo";
import { useTabHistory } from "../hooks/useTabHistory";
import {
  PieChart as Sparkles,
  AlertCircle,
  Camera,
  RefreshCw
} from "lucide-react";
import { Transaction, MotivasiConfig, cleanYlName } from "../types";
import { safeFetchJson, parseJsonResponse } from "../lib/safeFetch";
import { getStoredBreakdownPlan, getStoredBreakdownRealisasi } from "../lib/fallbackData";
import { getStoredYlList } from "../lib/storage";
import { NumberInput } from "./NumberInput";
import { useSimpleGrid } from "./useSimpleGrid";
import { GridSelectionToolbar } from "./GridSelectionToolbar";
import { YlRealisasiPotensiTab } from "./YlRealisasiPotensiTab";
import YLSeragamView from "./YLSeragamView";
import { NotificationBell } from "./NotificationBell";
import { EvaluasiView } from "./EvaluasiView";
import { formatTruncated, formatPercentTruncated, truncateDecimal } from "../utils/numberFormat";


const formatRp = (val: number) => {
  return "Rp" + Math.trunc(val).toLocaleString("id-ID");
};

interface YLViewProps {
  ylName: string;
  ylList?: any[];
  onLogout: () => void;
  onBackToAdmin?: () => void;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
  transactions: Transaction[];
  targetYL: any[];
  breakdownRealisasi?: any[];
  tanggalValid?: string[];
  onSaveTransaction: (data: Transaction) => Promise<any>;
  onSaveTargetYL: (data: any) => Promise<boolean>;
  motivasiConfig: MotivasiConfig;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  // FIX (1 Sep 2026): App.tsx sudah mengirim globalMonth (bulan yang dipilih admin/manajer
  // lewat date-picker header), tapi dulu prop ini tidak dideklarasikan di sini sama sekali
  // sehingga otomatis dibuang React — akun YL tidak pernah tahu manajer sedang melihat
  // bulan apa, dan selectedDate di bawah selalu balik ke tanggal asli device. Sekarang
  // dideklarasikan supaya bisa disinkronkan (lihat useEffect dekat deklarasi selectedDate).
  globalMonth?: string;
  setGlobalMonth?: (month: string) => void;
  evaluasiData?: any;
}

export function calculateMasaKerja(tanggalMasuk: string | undefined) {
  if (!tanggalMasuk) return { text: "-", years: 0, months: 0, title: "Yakult Lady" };

  const start = new Date(tanggalMasuk);
  const now = new Date();

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();

  if (months < 0) {
    years--;
    months += 12;
  }

  let text = "";
  if (years > 0) text += `${years} Tahun `;
  if (months > 0) text += `${months} Bulan`;
  if (years === 0 && months === 0) text = "Baru Bergabung";

  let title = "🌱 Kuncup";
  if (years >= 1 && years < 3) title = "🌿 Tuwuh";
  else if (years >= 3 && years < 5) title = "🌸 Mekar";
  else if (years >= 5 && years < 10) title = "🌳 Mantep";
  else if (years >= 10 && years < 15) title = "🐓 Wes Jago";
  else if (years >= 15 && years < 20) title = "🏅 Panutan";
  else if (years >= 20 && years < 25) title = "👑 Sesepuh";
  else if (years >= 25) title = "⚔️ Pusaka";

  return { text: text.trim(), years, months, title };
}

export function YLView({
  ylName,
  ylList = [],
  onLogout,
  onBackToAdmin,
  onRefresh,
  isRefreshing,
  transactions,
  targetYL,
  breakdownRealisasi = [],
  tanggalValid = [],
  motivasiConfig,
  onToggleTheme,
  globalMonth,
  evaluasiData
}: YLViewProps) {
  const [activeTab, setActiveTab] = useState<
    | "beranda"
    | "input"
    | "ringkasan"
    | "breakdown"
    | "realisasi_potensi"
    | "evaluasi"
    | "potensi_tembus"
    | "seragam"
    | "product_knowledge"
    | "tautan"
  >("beranda");
  useTabHistory(activeTab, setActiveTab, "beranda");

  const currentYlInfo = useMemo(() => {
    const list = (ylList && ylList.length > 0) ? ylList : getStoredYlList();
    const digitsMatch = ylName.match(/^\d+/) || ylName.match(/\b\d{3}\b/);
    const areaDigits = digitsMatch ? digitsMatch[0] : "";
    const cleanTargetName = cleanYlName(ylName).trim().toLowerCase();

    return list.find(y => {
      const yArea = String(y.area || "").trim();
      const yNama = String(y.nama || "").trim().toLowerCase();
      const cleanYNama = cleanYlName(y.nama || "").trim().toLowerCase();

      if (areaDigits && yArea === areaDigits) return true;
      if (yArea && (yArea === ylName.trim() || ylName.trim().startsWith(yArea))) return true;
      if (yNama && (yNama === cleanTargetName || cleanTargetName.includes(yNama) || yNama.includes(cleanTargetName))) return true;
      if (cleanYNama && (cleanYNama === cleanTargetName || cleanTargetName.includes(cleanYNama) || cleanYNama.includes(cleanTargetName))) return true;
      return false;
    }) || {};
  }, [ylName, ylList]);

  const ylAreaCode = useMemo(() => {
    if (currentYlInfo.area) return String(currentYlInfo.area).trim();
    const digitsMatch = ylName.match(/\b\d{3}\b/) || ylName.match(/^\d+/);
    if (digitsMatch) return digitsMatch[0];
    const list = getStoredYlList();
    const cleanTargetName = cleanYlName(ylName).trim().toLowerCase();
    const found = list.find(y => {
      const yNama = String(y.nama || "").trim().toLowerCase();
      const cleanYNama = cleanYlName(y.nama || "").trim().toLowerCase();
      return (yNama && (yNama === cleanTargetName || cleanTargetName.includes(yNama) || yNama.includes(cleanTargetName))) ||
             (cleanYNama && (cleanYNama === cleanTargetName || cleanTargetName.includes(cleanYNama) || cleanYNama.includes(cleanTargetName)));
    });
    return found?.area ? String(found.area).trim() : "";
  }, [currentYlInfo, ylName]);

  const displayAreaNumber = useMemo(() => {
    const raw = ylAreaCode || currentYlInfo.area || "";
    return String(raw).replace(/^Area\s*/i, "").trim();
  }, [ylAreaCode, currentYlInfo.area]);

  const isBirthday = useMemo(() => {
    let day, month;
    if (currentYlInfo.tglLahir) {
      const parts = currentYlInfo.tglLahir.split("-"); // YYYY-MM-DD
      if (parts.length === 3) {
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
      }
    } else if (currentYlInfo.nik && currentYlInfo.nik.length >= 16) {
      const dobDayStr = currentYlInfo.nik.substring(6, 8);
      const dobMonthStr = currentYlInfo.nik.substring(8, 10);
      day = parseInt(dobDayStr, 10);
      month = parseInt(dobMonthStr, 10);
      if (day > 40) day -= 40;
    }
    
    if (day && month) {
      const today = new Date();
      return today.getDate() === day && (today.getMonth() + 1) === month;
    }
    return false;
  }, [currentYlInfo.nik, currentYlInfo.tglLahir]);
  const [isSavingInputHarian, setIsSavingInputHarian] = useState(false);
  const [inputHarianMsg, setInputHarianMsg] = useState("");
  const getTodayLocalString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalString());

  // FIX (1 Sep 2026): dulu selectedDate murni lokal ke YLView dan tidak pernah tahu-menahu
  // soal globalMonth yang dipilih admin/manajer di dashboard — jadi walau admin sudah
  // pindah ke "Agustus 2026", akun YL tetap menampilkan bulan sesuai tanggal device (mis.
  // September) karena selectedDate tidak ikut berubah. Sekarang setiap globalMonth berubah,
  // selectedDate ikut disesuaikan ke bulan yang sama (hari tetap dipertahankan kalau valid
  // di bulan tsb, kalau tidak dipangkas ke hari terakhir bulan itu).
  useEffect(() => {
    if (!globalMonth || !/^\d{4}-\d{2}$/.test(globalMonth)) return;
    setSelectedDate(prevDate => {
      const currentDateMonth = prevDate.substring(0, 7);
      if (currentDateMonth === globalMonth) return prevDate;
      const day = parseInt(prevDate.substring(8, 10), 10) || 1;
      const [y, m] = globalMonth.split("-").map(Number);
      const lastDayOfTargetMonth = new Date(y, m, 0).getDate();
      const safeDay = Math.min(day, lastDayOfTargetMonth);
      return `${globalMonth}-${String(safeDay).padStart(2, "0")}`;
    });
  }, [globalMonth]);

  // YL AI Insight states
  const [ylAiInsight, setYlAiInsight] = useState<string>("");
  const [isYlAiLoading, setIsYlAiLoading] = useState<boolean>(false);

  // Form states
  const [totOm, setTotOm] = useState<number>(0);
  const [totOs, setTotOs] = useState<number>(0);
  const [isPotensiTembusSaving, setIsPotensiTembusSaving] = useState(false);
  const [potensiTembusMsg, setPotensiTembusMsg] = useState("");
  const [isBreakdownLoading, setIsBreakdownLoading] = useState(false);
  const [potensiTembus, setPotensiTembus] = useState<any>({
    skhTotal: 0, skhTembus: 0,
    kntrTotal: 0, kntrTembus: 0,
    tkoTotal: 0, tkoTembus: 0
  });

  // Load Potensi vs Tembus
  useEffect(() => {
    if (ylName && selectedDate) {
      const month = selectedDate.substring(0, 7);
      safeFetchJson<{ data: any }>(`/api/getPotensiTembus?bulan=${month}&nama=${encodeURIComponent(ylName)}`).then(res => {
        if (res && res.data) {
          setPotensiTembus({
            skhTotal: Number(res.data.skhTotal) || 0,
            skhTembus: Number(res.data.skhTembus) || 0,
            kntrTotal: Number(res.data.kntrTotal) || 0,
            kntrTembus: Number(res.data.kntrTembus) || 0,
            tkoTotal: Number(res.data.tkoTotal) || 0,
            tkoTembus: Number(res.data.tkoTembus) || 0
          });
        }
      }).catch(console.error);
    }
  }, [selectedDate, ylName, activeTab]);

  const handleSavePotensiTembus = async () => {
    if (!ylName) return;
    setIsPotensiTembusSaving(true);
    setPotensiTembusMsg("");
    try {
      const month = selectedDate.substring(0, 7);
      const payload = {
        bulan: month,
        nama: ylName,
        skhTotal: Number(potensiTembus.skhTotal) || 0,
        skhTembus: Number(potensiTembus.skhTembus) || 0,
        kntrTotal: Number(potensiTembus.kntrTotal) || 0,
        kntrTembus: Number(potensiTembus.kntrTembus) || 0,
        tkoTotal: Number(potensiTembus.tkoTotal) || 0,
        tkoTembus: Number(potensiTembus.tkoTembus) || 0
      };
      const res = await safeFetchJson<{ ok: boolean }>("/api/savePotensiTembus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res && res.ok) {
        setPotensiTembusMsg("✅ Data Potensi vs Tembus berhasil disimpan!");
      } else {
        setPotensiTembusMsg("❌ Gagal menyimpan data.");
      }
    } catch (err) {
      console.error("Error saving potensi vs tembus:", err);
      setPotensiTembusMsg("❌ Terjadi kesalahan saat menyimpan data.");
    } finally {
      setIsPotensiTembusSaving(false);
    }
  };
  const [totYo, setTotYo] = useState<number>(0);
  const [totYt, setTotYt] = useState<number>(0);

  // Sectors rmh, psr, skh, ktr, tk, ib
  const [sectors, setSectors] = useState<Record<string, Record<string, number>>>({
    rmh: { yo: 0, om: 0, os: 0, yt: 0 },
    psr: { yo: 0, om: 0, os: 0, yt: 0 },
    skh: { yo: 0, om: 0, os: 0, yt: 0 },
    ktr: { yo: 0, om: 0, os: 0, yt: 0 },
    tk: { yo: 0, om: 0, os: 0, yt: 0 },
    ib: { yo: 0, om: 0, os: 0, yt: 0 }
  });

  // BB states
  const [bbYo, setBbYo] = useState<number>(0);
  const [bbOm, setBbOm] = useState<number>(0);
  const [bbOs, setBbOs] = useState<number>(0);
  const [bbYt, setBbYt] = useState<number>(0);

  // Kunjungan states
  const [fPlg, setFPlg] = useState<number>(0);
  const [fRk, setFRk] = useState<number>(0);
  const [fRa, setFRa] = useState<number>(0);
  const [fRb, setFRb] = useState<number>(0);

  // PB & Sampah states
  const [pbP, setPbP] = useState<number>(0);
  const [pbS, setPbS] = useState<number>(0);
  const [apkPlg, setApkPlg] = useState<number>(0);
  const [apkBotol, setApkBotol] = useState<number>(0);
      
  const [isEditRealisasi, setIsEditRealisasi] = useState(false);
  const [mismatchConfirm, setMismatchConfirm] = useState<{ type: 'edit' | 'input', detail: string } | null>(null);
  const [editDataRealisasi, setEditDataRealisasi] = useState<Record<number, any>>({});
  // Snapshot grid saat mode edit dibuka. Dipakai untuk mengirim HANYA hari yang benar-benar diubah,
  // supaya hari lain (mis. entry baru dari perangkat lain) tidak ikut tertimpa nol.
  const editBaselineRealisasiRef = useRef<Record<number, any>>({});

  const realisasiFields = useMemo(() => [
    "rmh_yo", "rmh_om", "rmh_os", "rmh_yt",
    "psr_yo", "psr_om", "psr_os", "psr_yt",
    "skh_yo", "skh_om", "skh_os", "skh_yt",
    "ktr_yo", "ktr_om", "ktr_os", "ktr_yt",
    "tk_yo",  "tk_om",  "tk_os",  "tk_yt",
    "ib_yo",  "ib_om",  "ib_os",  "ib_yt",
    "bb_yo",  "bb_om",  "bb_os",  "bb_yt",
    "pb_p", "pb_s", "f_plg", "f_rk", "f_ra", "f_rb",
    "apk_plg", "apk_botol"
  ], []);

  const getRealisasiCellValue = useCallback((r: number, c: number) => {
    const day = r + 1;
    const field = realisasiFields[c];
    return editDataRealisasi[day]?.[field] ?? 0;
  }, [editDataRealisasi, realisasiFields]);

  const setRealisasiBatchCellValues = useCallback((updates: { r: number; c: number; val: number | string }[]) => {
    setEditDataRealisasi(prev => {
      let next = { ...prev };
      updates.forEach(({ r, c, val }) => {
        const day = r + 1;
        const field = realisasiFields[c];
        const numVal = Math.max(0, Math.round(Number(val)) || 0);
        if (next[day]) {
          next[day] = { ...next[day], [field]: numVal };
        }
      });
      return next;
    });
  }, [realisasiFields]);

  const {
    selection: realisasiGridSelection,
    setSelection: setRealisasiGridSelection,
    activeCell: realisasiActiveCell,
    activeCellValue: realisasiActiveCellValue,
    isActiveCellEditable: isRealisasiActiveCellEditable,
    handleActiveCellValueChange: handleRealisasiActiveCellValueChange,
    goToNextCell: goToNextRealisasiCell,
    goToPrevCell: goToPrevRealisasiCell,
    renderSelectionHandle: renderRealisasiSelectionHandle,
    isMenuOpen: realisasiIsMenuOpen,
    setIsMenuOpen: setRealisasiIsMenuOpen,
    menuPos: realisasiMenuPos,
    getCellProps: getRealisasiCellProps,
    selectRow: selectRealisasiRow,
    handleCopy: handleRealisasiGridCopy,
    handleCut: handleRealisasiGridCut,
    handlePaste: handleRealisasiGridPaste,
    handleClear: handleRealisasiGridClear,
    clipboardModal,
    confirmManualPaste,
    closeClipboardModal,
  } = useSimpleGrid({
    totalRows: 31,
    totalCols: 36,
    isCellEditable: (_r, c) => isEditRealisasi && (c < 24 || c > 27),
    getCellValue: getRealisasiCellValue,
    setBatchCellValues: setRealisasiBatchCellValues
  });

  const [isSavingRealisasi, setIsSavingRealisasi] = useState(false);

  const [targetVal, setTargetVal] = useState<number>(0);
  const [blnLaluVal, setBlnLaluVal] = useState<number>(0);
  const [thnLaluVal, setThnLaluVal] = useState<number>(0);

    
  // Papan Attention Manager state
  const [attentionNote, setAttentionNote] = useState<string>("");
  const [isLoadingAttention, setIsLoadingAttention] = useState<boolean>(false);
  const motYlLines = useMemo(() => attentionNote ? attentionNote.split('\n').filter(Boolean) : [], [attentionNote]);

  // Global Keyboard Shortcuts (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, Copy/Paste/Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      
      if (e.key === "Delete" || e.key === "Backspace") {
        if (targetTag !== "input" && targetTag !== "textarea") {
          e.preventDefault();
          if (activeTab === "realisasi_potensi" && isEditRealisasi && realisasiGridSelection) handleRealisasiGridClear();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (activeTab === "realisasi_potensi" && isEditRealisasi && realisasiGridSelection) {
           handleRealisasiGridCopy();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        if (activeTab === "realisasi_potensi" && isEditRealisasi) {
          if (targetTag !== "input" && targetTag !== "textarea") {
            navigator.clipboard.readText().then(text => {
              handleRealisasiGridPaste(text);
            }).catch(() => {
              handleRealisasiGridPaste();
            });
          }
        }
      }
    };

    const handleWindowPaste = (e: ClipboardEvent) => {
      if (activeTab === "realisasi_potensi" && isEditRealisasi) {
        const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (targetTag === "textarea") return;
        const text = e.clipboardData?.getData("text/plain");
        if (text !== undefined && text !== null) {
          e.preventDefault();
          handleRealisasiGridPaste(text);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handleWindowPaste);
    }
  }, [activeTab, isEditRealisasi, realisasiGridSelection, handleRealisasiGridClear, handleRealisasiGridCopy, handleRealisasiGridPaste]);

  // YL Breakdown & Realisasi state (from Admin)
  const [ylBreakdownPlan, setYlBreakdownPlan] = useState<{ pembagiTanggal: number; days: Record<string, { yo: number; om: number; os: number; yt: number }> } | null>(null);
  const [ylBreakdownRealisasi, setYlBreakdownRealisasi] = useState<{ pembagiTanggal: number; days: Record<string, { yo: number; om: number; os: number; yt: number }> } | null>(null);
  
  // Compensation Config State
  const [compConfig, setCompConfig] = useState<{ pphRate: number; jkkJkm: number; jht: number }>({
    pphRate: 2.5,
    jkkJkm: 16800,
    jht: 24000
  });

  useEffect(() => {
    safeFetchJson("/api/getCompensationConfig").then(res => {
      if (res && res.config) {
        setCompConfig({
          pphRate: (typeof res.config.pphRate === "number" && res.config.pphRate > 0) ? (res.config.pphRate === 2 ? 2.5 : res.config.pphRate) : 2.5,
          jkkJkm: typeof res.config.jkkJkm === "number" ? res.config.jkkJkm : 16800,
          jht: typeof res.config.jht === "number" ? res.config.jht : 24000
        });
      }
    }).catch(() => {});
  }, []);
  
  // Fetch Breakdown & Realisasi for YL from Admin
  const fetchYlBreakdown = useCallback(async () => {
    const area = ylAreaCode || currentYlInfo.area || ylName.substring(0, 3).trim();
    const month = selectedDate ? selectedDate.substring(0, 7) : new Date().toISOString().substring(0, 7);
    setIsBreakdownLoading(true);
    try {
      const res = await safeFetchJson<any>(`/api/getBreakdownPlan?month=${month}`);
      let planMap = res && res.ok && res.breakdownPlan ? res.breakdownPlan : null;
      let realMap = res && res.ok && res.breakdownRealisasi ? res.breakdownRealisasi : null;

      if (!res || !res.ok) {
        planMap = getStoredBreakdownPlan(month);
        realMap = getStoredBreakdownRealisasi(month);
      }

      const findData = (objMap: any) => {
        if (!objMap || typeof objMap !== "object") return null;
        const keys = Object.keys(objMap);
        let matchKey = keys.find(k => k === area || k === ylName);
        if (!matchKey) {
          matchKey = keys.find(k =>
            k === area ||
            k.startsWith(area) ||
            area.startsWith(k) ||
            k.toLowerCase().includes(ylName.toLowerCase()) ||
            ylName.toLowerCase().includes(k.toLowerCase())
          );
        }
        return matchKey ? objMap[matchKey] : null;
      };

      const planData = findData(planMap);
      setYlBreakdownPlan(planData || null);

      const realData = findData(realMap);
      setYlBreakdownRealisasi(realData || null);
    } catch (err) {
      console.error("Error loading YL breakdown plan & realisasi:", err);
    } finally {
      setIsBreakdownLoading(false);
    }
  }, [ylName, selectedDate, currentYlInfo.area, ylAreaCode]);

  useEffect(() => {
    fetchYlBreakdown();
  }, [fetchYlBreakdown, activeTab]);

  useEffect(() => {
    const handleAppRefresh = () => {
      fetchYlBreakdown();
    };
    window.addEventListener("app_header_refresh", handleAppRefresh);
    return () => window.removeEventListener("app_header_refresh", handleAppRefresh);
  }, [fetchYlBreakdown]);

  const handleHeaderRefresh = async () => {
    if (onRefresh) await onRefresh();
    await fetchYlBreakdown();
    window.dispatchEvent(new CustomEvent("app_header_refresh"));
  };

  // Fetch Attention Note for current YL area
  useEffect(() => {
    const area = ylAreaCode || currentYlInfo.area || ylName.substring(0, 3).trim();
    setIsLoadingAttention(true);
    safeFetchJson("/api/getAttention")
      .then(res => {
        if (res && res.attention && res.attention[area]) {
          setAttentionNote(res.attention[area]);
        } else {
          setAttentionNote("");
        }
      })
      .catch(err => console.error("Error loading attention note:", err))
      .finally(() => setIsLoadingAttention(false));
  }, [ylName, activeTab, currentYlInfo.area, ylAreaCode]);

  // YL Profile photo state
  const [ylFoto, setYlFoto] = useState<string>(() => {
    try {
      return localStorage.getItem(`yl_foto_${ylName}`) || "";
    } catch (e) {
      return "";
    }
  });

  useEffect(() => {
    if (!ylName) return;
    safeFetchJson<{ ok: boolean; foto?: string }>(`/api/getYlFoto?nama=${encodeURIComponent(ylName)}&t=${Date.now()}`)
      .then(res => {
        if (res && res.ok) {
          if (res.foto) {
            setYlFoto(res.foto);
            try {
              localStorage.setItem(`yl_foto_${ylName}`, res.foto);
            } catch (e) {}
          } else {
            try {
              const localFoto = localStorage.getItem(`yl_foto_${ylName}`);
              if (localFoto) {
                fetch("/api/saveYlFoto", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ nama: ylName, foto: localFoto })
                }).catch(() => {});
              }
            } catch (e) {}
          }
        }
      }).catch(() => {});
  }, [ylName]);

  const handleUploadFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran foto maksimal 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 500;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        setYlFoto(base64);
        try {
          localStorage.setItem(`yl_foto_${ylName}`, base64);
        } catch (e) {}

        try {
          await fetch("/api/saveYlFoto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nama: ylName, foto: base64 })
          });
        } catch (err) {
          console.error("Gagal simpan foto YL ke server:", err);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Motivasi sliding slideshow state
  const [activeMotivasi, setActiveMotivasi] = useState<string>("Semangat menjalani hari ini dengan tulus!");

  // Rotate motivasi slideshow
  useEffect(() => {
    if (!motivasiConfig.enabled || motivasiConfig.terpilih.length === 0) return;
    
    const list = motivasiConfig.terpilih;
    const storageKey = `yakult_motivasi_state_${ylName.replace(/\s+/g, '_')}`;

    const getNextQuote = () => {
      let remaining: string[] = [];
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          remaining = JSON.parse(saved);
        }
      } catch (e) {}

      // Filter remaining to only include quotes that are STILL in the current terpilih list
      remaining = remaining.filter(q => list.includes(q));

      if (remaining.length === 0) {
        // reshuffle from list
        remaining = [...list];
        for (let i = remaining.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
      }

      const nextQuote = remaining.shift() || list[0];
      
      try {
        localStorage.setItem(storageKey, JSON.stringify(remaining));
      } catch (e) {}
      
      return nextQuote;
    };

    setActiveMotivasi(getNextQuote());

    const timer = setInterval(() => {
      setActiveMotivasi(getNextQuote());
    }, (motivasiConfig.intervalDetik || 30) * 1000);

    return () => clearInterval(timer);
  }, [motivasiConfig, ylName]);

  const loadedDateRef = useRef<string>("");

  // Load existing transaction for chosen date
  useEffect(() => {
    const existing = transactions.find(t => t.tanggal === selectedDate);
    if (existing) {
      setTotYo(existing.tot_yo || 0);
      setTotOm(existing.tot_om || 0);
      setTotOs(existing.tot_os || 0);
      setTotYt(existing.tot_yt || 0);

      const secCopy = {
        rmh: { yo: 0, om: 0, os: 0, yt: 0 },
        psr: { yo: 0, om: 0, os: 0, yt: 0 },
        skh: { yo: 0, om: 0, os: 0, yt: 0 },
        ktr: { yo: 0, om: 0, os: 0, yt: 0 },
        tk: { yo: 0, om: 0, os: 0, yt: 0 },
        ib: { yo: 0, om: 0, os: 0, yt: 0 }
      };
      ["rmh", "psr", "skh", "ktr", "tk", "ib"].forEach(sec => {
        ["yo", "om", "os", "yt"].forEach(prod => {
          secCopy[sec][prod] = (existing as any)[`${sec}_${prod}`] || 0;
        });
      });
      setSectors(secCopy);

      setBbYo(existing.bb_yo || 0);
      setBbOm(existing.bb_om || 0);
      setBbOs(existing.bb_os || 0);
      setBbYt(existing.bb_yt || 0);

      setFPlg(existing.f_plg || 0);
      setFRk(existing.f_rk || 0);
      setFRa(existing.f_ra || 0);
      setFRb(existing.f_rb || 0);

      setPbP(existing.pb_p || 0);
      setPbS(existing.pb_s || 0);
      setApkPlg(existing.apk_plg || 0);
      setApkBotol(existing.apk_botol || 0);
    } else {
      // Clear form for new date or when reset
      setTotYo(0); setTotOm(0); setTotOs(0); setTotYt(0);
      setSectors({
        rmh: { yo: 0, om: 0, os: 0, yt: 0 },
        psr: { yo: 0, om: 0, os: 0, yt: 0 },
        skh: { yo: 0, om: 0, os: 0, yt: 0 },
        ktr: { yo: 0, om: 0, os: 0, yt: 0 },
        tk: { yo: 0, om: 0, os: 0, yt: 0 },
        ib: { yo: 0, om: 0, os: 0, yt: 0 }
      });
      setBbYo(0); setBbOm(0); setBbOs(0); setBbYt(0);
      setFPlg(0); setFRk(0); setFRa(0); setFRb(0);
      setPbP(0); setPbS(0); setApkPlg(0); setApkBotol(0);
    }

    // Load matching target configuration
    const area = ylAreaCode || currentYlInfo.area || ylName.substring(0, 3).trim();
    safeFetchJson("/api/getSettingTargets").then(res => {
      if (res && res.targetYL && res.targetYL[area]) {
        setTargetVal(res.targetYL[area].target ?? 0);
        setBlnLaluVal(res.targetYL[area].bln_lalu ?? 0);
        setThnLaluVal(res.targetYL[area].thn_lalu ?? 0);
      } else {
        setTargetVal(0);
        setBlnLaluVal(0);
        setThnLaluVal(0);
      }
    });
  }, [selectedDate, transactions, targetYL, ylName, currentYlInfo.area, ylAreaCode]);


  // Sector calculations


  // Save targets E6
  
  const handleToggleEditRealisasi = () => {
    if (isEditRealisasi) {
      setIsEditRealisasi(false);
      setEditDataRealisasi({});
    } else {
      const initial: Record<number, any> = {};
      const daysList = Array.from({ length: 31 }, (_, i) => i + 1);
      const currentMonthPrefix = selectedDate.substring(0, 7);
      daysList.forEach(d => {
        const dayStrPadded = String(d).padStart(2, '0');
        const targetDateStr = `${currentMonthPrefix}-${dayStrPadded}`;
        const tx = transactions.find(t => t.tanggal === targetDateStr);
        if (tx) {
          initial[d] = { ...tx };
        } else {
          initial[d] = {
            tanggal: targetDateStr,
            rmh_yo: 0, rmh_om: 0, rmh_os: 0, rmh_yt: 0,
            psr_yo: 0, psr_om: 0, psr_os: 0, psr_yt: 0,
            skh_yo: 0, skh_om: 0, skh_os: 0, skh_yt: 0,
            ktr_yo: 0, ktr_om: 0, ktr_os: 0, ktr_yt: 0,
            tk_yo: 0, tk_om: 0, tk_os: 0, tk_yt: 0,
            ib_yo: 0, ib_om: 0, ib_os: 0, ib_yt: 0,
            bb_yo: 0, bb_om: 0, bb_os: 0, bb_yt: 0,
            pb_p: 0, pb_s: 0, apk_plg: 0, apk_botol: 0,
            f_plg: 0, f_rk: 0, f_ra: 0, f_rb: 0
          };
        }
      });
      editBaselineRealisasiRef.current = JSON.parse(JSON.stringify(initial));
      setEditDataRealisasi(initial);
      setIsEditRealisasi(true);
    }
  };

  const handleSaveEditRealisasi = async () => {
    // Validasi: total penjualan per produk (YO/OM/OS/YT), gabungan semua sektor,
    // pada tiap tanggal yg diedit HARUS SAMA dengan Acuan Admin (Realisasi Admin) tanggal tsb.
    // Kalau tidak sama, tidak bisa disimpan.
    const sumProd = (obj: any, prod: "yo" | "om" | "os" | "yt") =>
      (obj[`rmh_${prod}`]||0) + (obj[`psr_${prod}`]||0) + (obj[`skh_${prod}`]||0) +
      (obj[`ktr_${prod}`]||0) + (obj[`tk_${prod}`]||0) + (obj[`ib_${prod}`]||0);

    const mismatches: { tanggal: string; detail: string }[] = [];
    const currentMonthPrefix = selectedDate.substring(0, 7);
    Object.entries(editDataRealisasi).forEach(([dayStr, data]: [string, any]) => {
      const d = parseInt(dayStr, 10);
      const dayStrPadded = String(d).padStart(2, '0');
      const targetDateStr = `${currentMonthPrefix}-${dayStrPadded}`;
      const originalTx = editBaselineRealisasiRef.current[d] ?? transactions.find(t => t.tanggal === targetDateStr);
      const adminDataDay = ylBreakdownRealisasi?.days?.[String(d)];

      // Hanya validasi tanggal yg benar-benar diubah di sesi edit ini (dirty).
      // Tanggal yg tidak disentuh (sama persis dg data lama) dilewati agar tidak
      // terblokir gara-gara data lama yg belum ada Acuan Admin-nya.
      let dirty = false;
      const perProdMismatch: string[] = [];
      (["yo", "om", "os", "yt"] as const).forEach(prod => {
        const aktual = sumProd(data, prod);
        const lama = originalTx ? sumProd(originalTx, prod) : 0;
        if (aktual !== lama) dirty = true;
        const acuan = (adminDataDay as any)?.[prod] || 0;
        if (aktual !== acuan) {
          perProdMismatch.push(`${prod.toUpperCase()}: ${aktual}/${acuan}`);
        }
      });
      if (dirty && perProdMismatch.length > 0) {
        mismatches.push({ tanggal: data.tanggal || `Tgl ${dayStrPadded}`, detail: perProdMismatch.join(", ") });
      }
    });

    if (mismatches.length > 0) {
      const detail = mismatches.map(m => `• ${m.tanggal}: ${m.detail}`).join("\n");
      setMismatchConfirm({ type: 'edit', detail });
      return;
    }
    executeSaveEditRealisasi();
  };

  const executeSaveEditRealisasi = async () => {

    setIsSavingRealisasi(true);
    try {
      const EDIT_FIELDS: string[] = [];
      for (const sk of ['rmh', 'psr', 'skh', 'ktr', 'tk', 'ib']) for (const pr of ['yo', 'om', 'os', 'yt']) EDIT_FIELDS.push(`${sk}_${pr}`);
      EDIT_FIELDS.push('bb_yo', 'bb_om', 'bb_os', 'bb_yt', 'pb_p', 'pb_s', 'apk_plg', 'apk_botol', 'f_plg', 'f_rk', 'f_ra', 'f_rb');
      const dirtyRows = Object.entries(editDataRealisasi).filter(([dayStr, data]: [string, any]) => {
        const base = editBaselineRealisasiRef.current[Number(dayStr)] || {};
        return EDIT_FIELDS.some(f => Number(data?.[f] || 0) !== Number(base?.[f] || 0));
      }).map(([, data]) => data);

      if (dirtyRows.length === 0) {
        setIsEditRealisasi(false);
        alert("Tidak ada perubahan yang perlu disimpan.");
        return;
      }

      const updates = dirtyRows.map((data: any) => ({
        tanggal: data.tanggal,
        nama: ylName,
        sektor: {
          rmh: { yo: data.rmh_yo||0, om: data.rmh_om||0, os: data.rmh_os||0, yt: data.rmh_yt||0 },
          psr: { yo: data.psr_yo||0, om: data.psr_om||0, os: data.psr_os||0, yt: data.psr_yt||0 },
          skh: { yo: data.skh_yo||0, om: data.skh_om||0, os: data.skh_os||0, yt: data.skh_yt||0 },
          ktr: { yo: data.ktr_yo||0, om: data.ktr_om||0, os: data.ktr_os||0, yt: data.ktr_yt||0 },
          tk:  { yo: data.tk_yo||0,  om: data.tk_om||0,  os: data.tk_os||0,  yt: data.tk_yt||0 },
          ib:  { yo: data.ib_yo||0,  om: data.ib_om||0,  os: data.ib_os||0,  yt: data.ib_yt||0 }
        },
        bb_yo: data.bb_yo||0, bb_om: data.bb_om||0, bb_os: data.bb_os||0, bb_yt: data.bb_yt||0,
        pb_p: data.pb_p||0, pb_s: data.pb_s||0,
        apk_plg: data.apk_plg||0, apk_botol: data.apk_botol||0,
        f_plg: data.f_plg||0, f_rk: data.f_rk||0, f_ra: data.f_ra||0, f_rb: data.f_rb||0
      }));
      
      const res = await safeFetchJson<{ ok: boolean; count?: number }>('/api/saveBatchRealisasiPotensiYL', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, nama: ylName })
      });
      
      if (res && res.ok) {
        setIsEditRealisasi(false);
        if (onRefresh) await onRefresh(); 
        alert("✅ Data berhasil disimpan!");
      } else {
        alert("❌ Gagal menyimpan data ke server.");
      }
    } catch (e) {
      alert("❌ Error menyimpan data.");
    } finally {
      setIsSavingRealisasi(false);
    }
  };

  // ==== INPUT HARIAN (Tab "INPUT") ====
  // Total per produk dari pecahan sektor (Rumah/Pasar/Sekolah/Kantor/Toko/IB)
  const secSumYo = sectors.rmh.yo + sectors.psr.yo + sectors.skh.yo + sectors.ktr.yo + sectors.tk.yo + sectors.ib.yo;
  const secSumOm = sectors.rmh.om + sectors.psr.om + sectors.skh.om + sectors.ktr.om + sectors.tk.om + sectors.ib.om;
  const secSumOs = sectors.rmh.os + sectors.psr.os + sectors.skh.os + sectors.ktr.os + sectors.tk.os + sectors.ib.os;
  const secSumYt = sectors.rmh.yt + sectors.psr.yt + sectors.skh.yt + sectors.ktr.yt + sectors.tk.yt + sectors.ib.yt;

  // Cocok/tidaknya HANYA ditentukan oleh Acuan Admin (bukan lagi dibandingkan ke Total Jual manual)

  // Acuan (referensi) dari Realisasi Admin pertanggal, ditarik dari ylBreakdownRealisasi
  const inputHarianDay = parseInt((selectedDate.split(/[-/]/)[2] || "0"), 10);
  const adminAcuanDay = ylBreakdownRealisasi?.days?.[String(inputHarianDay)] as any;
  const hasAdminAcuan = !!adminAcuanDay;
  const acuanHarianYo = Number(adminAcuanDay?.yo) || 0;
  const acuanHarianOm = Number(adminAcuanDay?.om) || 0;
  const acuanHarianOs = Number(adminAcuanDay?.os) || 0;
  const acuanHarianYt = Number(adminAcuanDay?.yt) || 0;
  const cocokAcuanAdmin = !hasAdminAcuan || (
    secSumYo === acuanHarianYo && secSumOm === acuanHarianOm && secSumOs === acuanHarianOs && secSumYt === acuanHarianYt
  );

  const canSaveInputHarian = cocokAcuanAdmin;

  const handleSaveInputHarian = () => {
    if (!canSaveInputHarian) {
      setMismatchConfirm({ type: 'input', detail: "Total pecahan potensi (Aktual) tidak pas dengan Acuan Admin." });
      return;
    }
    executeSaveInputHarian();
  };

  const executeSaveInputHarian = async () => {
    setIsSavingInputHarian(true);
    setInputHarianMsg("");
    try {
      const payload = {
        tanggal: selectedDate,
        nama: ylName,
        sektor: {
          rmh: { ...sectors.rmh },
          psr: { ...sectors.psr },
          skh: { ...sectors.skh },
          ktr: { ...sectors.ktr },
          tk: { ...sectors.tk },
          ib: { ...sectors.ib }
        },
        bb_yo: bbYo, bb_om: bbOm, bb_os: bbOs, bb_yt: bbYt,
        pb_p: pbP, pb_s: pbS,
        apk_plg: apkPlg, apk_botol: apkBotol,
        f_plg: fPlg, f_rk: fRk, f_ra: fRa, f_rb: fRb
      };
      const res = await fetch("/api/saveRealisasiPotensiYL", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => null);
      if (json && json.ok) {
        setInputHarianMsg("✅ Laporan harian berhasil disimpan ke Realisasi Potensi!");
        if (onRefresh) await onRefresh();
      } else {
        setInputHarianMsg("❌ Gagal menyimpan laporan.");
      }
    } catch (err) {
      console.error("Error saving input harian:", err);
      setInputHarianMsg("❌ Terjadi kesalahan saat menyimpan.");
    } finally {
      setIsSavingInputHarian(false);
    }
  };

  // Save report
  
  // Setoran calculations
  const setYo = totYo * 2040;
  const setOm = totOm * 2130;
  const setOs = totOs * 2130;
  const setYt = totYt * 2460;
  
  // Monthly stats calculations for RINGKASAN
  const currentMonth = selectedDate.substring(0, 7);
  const currentMonthTxs = transactions.filter(t => t.tanggal && t.tanggal.startsWith(currentMonth));
  
  // Total Penjualan Bulan Ini (mYo/mOm/mOs/mYt) diambil dari tabel Realisasi (ylBreakdownRealisasi.days)
  // jika tersedia — bukan sekadar akumulasi transaksi biasa. Fallback ke akumulasi transaksi
  // hanya kalau data Realisasi belum ada, supaya tidak dobel hitung.
  const hasRealisasiTable = !!(ylBreakdownRealisasi && ylBreakdownRealisasi.days);
  let mYo = 0, mOm = 0, mOs = 0, mYt = 0;
  let mKompensasiHarian = 0;

  if (hasRealisasiTable) {
    Object.values(ylBreakdownRealisasi.days).forEach((d: any) => {
      mYo += d.yo || 0;
      mOm += d.om || 0;
      mOs += d.os || 0;
      mYt += d.yt || 0;
      
      const kYo = (d.yo || 0) * 60;
      const kOm = (d.om || 0) * 70;
      const kOs = (d.os || 0) * 70;
      const kYt = (d.yt || 0) * 140;
      mKompensasiHarian += (kYo + kOm + kOs + kYt);
    });
  }

  let mRmh = 0, mPsr = 0, mSkh = 0, mKtr = 0, mTk = 0, mIb = 0;

  let sumPb = 0, sumBb = 0, sumSampah = 0, sumPlg = 0, sumRk = 0, sumRa = 0, sumRb = 0;

  currentMonthTxs.forEach(t => {
    if (!hasRealisasiTable) {
      mYo += t.tot_yo || 0;
      mOm += t.tot_om || 0;
      mOs += t.tot_os || 0;
      mYt += t.tot_yt || 0;

      const kYo = (t.tot_yo || 0) * 60;
      const kOm = (t.tot_om || 0) * 70;
      const kOs = (t.tot_os || 0) * 70;
      const kYt = (t.tot_yt || 0) * 140;
      mKompensasiHarian += (kYo + kOm + kOs + kYt);
    }

    mRmh += (t.rmh_yo||0) + (t.rmh_om||0) + (t.rmh_os||0) + (t.rmh_yt||0);
    mPsr += (t.psr_yo||0) + (t.psr_om||0) + (t.psr_os||0) + (t.psr_yt||0);
    mSkh += (t.skh_yo||0) + (t.skh_om||0) + (t.skh_os||0) + (t.skh_yt||0);
    mKtr += (t.ktr_yo||0) + (t.ktr_om||0) + (t.ktr_os||0) + (t.ktr_yt||0);
    mTk += (t.tk_yo||0) + (t.tk_om||0) + (t.tk_os||0) + (t.tk_yt||0);
    mIb += (t.ib_yo||0) + (t.ib_om||0) + (t.ib_os||0) + (t.ib_yt||0);

    sumPb += (t.pb_p || 0) + (t.pb_s || 0);
    sumBb += (t.bb_yo || 0) + (t.bb_om || 0) + (t.bb_os || 0) + (t.bb_yt || 0);
    sumSampah += (t.apk_botol || 0);
    sumPlg += (t.f_plg || 0);
    sumRk += (t.f_rk || 0);
    sumRa += (t.f_ra || 0);
    sumRb += (t.f_rb || 0);
  });

  // PLG/RK/RA/RB/PB/BB/Sampah Botol & pembagi E6 diambil dari sheet atau penjumlahan transaksi
  const tgtObjBulanIni: any = (Array.isArray(targetYL) ? targetYL.find((t: any) => t.bulan === currentMonth) || targetYL[0] : targetYL) || null;
  const mPlg = tgtObjBulanIni?.plg || sumPlg;
  const mRk = tgtObjBulanIni?.rk || sumRk;
  const mRa = tgtObjBulanIni?.ra || sumRa;
  const mRb = tgtObjBulanIni?.rb || sumRb;
  const mPb = tgtObjBulanIni?.totalPb || sumPb;
  const mBb = tgtObjBulanIni?.totalBb || sumBb;
  const mSampahBotol = tgtObjBulanIni?.totalSampahBotol || sumSampah;

  const mTotalSales = mYo + mOm + mOs + mYt;
  const activePembagi = ylBreakdownRealisasi?.pembagiTanggal || 25;
  const mRata2 = activePembagi > 0 ? mTotalSales / activePembagi : 0;


  // Fallback breakdown list synchronized directly from transactions if sheet list is empty
  const displayBreakdownRealisasi = (breakdownRealisasi && breakdownRealisasi.length > 0)
    ? breakdownRealisasi
    : transactions.map(t => ({
        tanggal: t.tanggal,
        breakdown: { yo: t.tot_yo || 0, om: t.tot_om || 0, os: t.tot_os || 0, yt: t.tot_yt || 0 },
        realisasi: { yo: t.tot_yo || 0, om: t.tot_om || 0, os: t.tot_os || 0, yt: t.tot_yt || 0 }
      }));

  // Kompensasi monthly factor calculation
  const getKompensasiFactor = (avg: number) => {
    if (avg < 200) return 338;
    if (avg >= 200 && avg < 250) return 374;
    if (avg >= 250 && avg < 280) return 409;
    if (avg >= 280 && avg < 300) return 417;
    if (avg >= 300 && avg < 330) return 424;
    if (avg >= 330 && avg < 350) return 428;
    return 432; // avg >= 350
  };

  const kompFactor = getKompensasiFactor(mRata2);
  const mKompensasiBulanan = mTotalSales * kompFactor;

  // Total Kompensasi Kotor & Potongan Pajak / PPh / JHT
  const mPphRate = (compConfig.pphRate && compConfig.pphRate > 0) ? compConfig.pphRate : 2.5;
  const mPphRateStr = mPphRate.toString().replace('.', ',');
  const mPph = Math.floor(mKompensasiBulanan * (mPphRate / 100));
  const mIkutJht = currentYlInfo ? (currentYlInfo.ikutJht !== false) : true;
  const mJht = mIkutJht ? (typeof currentYlInfo?.iuranJht === "number" ? currentYlInfo.iuranJht : (compConfig.jht || 24000)) : 0;
  const mJkk = compConfig.jkkJkm;
  const mTotalPotongan = mPph + mJht + mJkk;
  const mKompensasiBersihBulanan = Math.max(0, mKompensasiBulanan - mTotalPotongan);
  const mTotalTakeHome = mKompensasiHarian + mKompensasiBersihBulanan;

  const pctOfTotal = (val: number) => {
    return mTotalSales > 0 ? Math.trunc((val / mTotalSales) * 100) : 0;
  };

  const getPctString = (num: number, denom: number) => {
    return denom > 0 ? Math.trunc((num / denom) * 100) + "%" : "0%";
  };

  // Manual maternal-style AI analysis handler
  const handleGenerateYlAi = async () => {
    setIsYlAiLoading(true);
    try {
      const res = await safeFetchJson<{ insight?: string }>("/api/gemini/evaluate-yl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: ylName,
          data: {
            nama: ylName,
            akumulasi: mTotalSales,
            rata2: mRata2,
            targetYL: targetVal,
            bbYL: mBb,
            totalPb: mPb,
            pbPersen: mPlg > 0 ? Math.trunc((mPb / mPlg) * 100) : 0,
            totalSampah: mSampahBotol
          }
        })
      });
      setYlAiInsight(res?.insight || "<p>Tidak ada analisa yang dihasilkan.</p>");
    } catch (err) {
      console.error("Error loading YL AI:", err);
      setYlAiInsight(`<p class="mb-2"><b>Assalamu'alaikum Ibu ${cleanYlName(ylName)} sayang! ❤️</b></p><p class="mb-2">Capaian rata-rata harian Ibu saat ini <b>${mRata2} botol/hari</b> dari target <b>${targetVal} botol</b> dengan Balik Botol <b>${mBb} botol</b>.</p><p>Tetap semangat dan jaga senyuman ramah untuk pelanggan Ibu tercinta nggih Bu! 🌸✨</p>`);
    } finally {
      setIsYlAiLoading(false);
    }
  };

  return (
    <div className="yl-view-root min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 text-slate-800 dark:text-slate-100 transition-colors duration-200">
      {/* Header Area matching Manager Account */}
      <header className="bg-gradient-to-r from-red-950 to-red-800 border-b-2 border-red-600 text-white py-2 px-3 sm:py-2.5 sm:px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {activeTab === "beranda" ? (
               <div className="flex items-center gap-2.5 min-w-0">
                 <JossLogo size={34} compact />
                 <div className="min-w-0 flex flex-col justify-center">
                   <h1 className="text-base sm:text-lg font-black tracking-tight leading-none uppercase text-white">JOSS</h1>
                   <p className="text-[11px] sm:text-xs font-semibold text-red-200 leading-none mt-1">DP Jember 1</p>
                 </div>
               </div>
            ) : (
               <div className="flex items-center gap-2 min-w-0">
                 <button 
                   onClick={() => setActiveTab("beranda")}
                   className="p-1.5 bg-black/20 hover:bg-black/40 text-white rounded-lg border border-red-500/40 transition-all cursor-pointer shrink-0 active:scale-95"
                   title="Kembali ke Beranda"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>
                 </button>
                 <JossLogo size={34} compact />
                 <div className="min-w-0 flex flex-col justify-center">
                   <h1 className="text-sm sm:text-base font-black tracking-tight leading-none uppercase truncate text-white">{cleanYlName(ylName)}</h1>
                   <p className="text-[10px] sm:text-[11px] font-semibold text-red-200 leading-none mt-1 truncate">DP Jember 1 • Area {displayAreaNumber || "-"}</p>
                 </div>
               </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <NotificationBell
              role="yl"
              currentYlName={ylName}
              currentYlArea={displayAreaNumber}
              globalMonth={globalMonth}
              ylList={ylList}
            />
            <button
              onClick={handleHeaderRefresh}
              className="flex items-center justify-center p-1.5 bg-black/20 hover:bg-black/40 text-white rounded-lg border border-red-500/40 transition-all cursor-pointer shadow-xs active:scale-95"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 text-white ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
            {onBackToAdmin && (
              <button
                onClick={onBackToAdmin}
                className="bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-black px-2.5 py-1.5 rounded-lg border border-amber-300 shadow-xs transition-all active:scale-95"
                title="Kembali ke akun Admin"
              >
                ← Admin
              </button>
            )}
            <button
              onClick={onLogout}
              className="bg-slate-900/80 hover:bg-slate-950 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg border border-red-500/40 shadow-xs transition-all active:scale-95"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      {/* Floating Rotating & Moving Motivasi Banner */}
      {motivasiConfig.enabled && (
        <div className="sticky top-16 z-30 mx-3 my-3 bg-slate-900 border-2 border-red-500 shadow-xl rounded-2xl p-3 max-w-xl sm:mx-auto overflow-hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center font-black text-sm sm:text-base text-yellow-300 tracking-wide line-clamp-2">
                {activeMotivasi}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className={`p-3 sm:p-5 space-y-5 mx-auto ${
        ["realisasi_potensi", "breakdown", "potensi_tembus", "ringkasan", "evaluasi"].includes(activeTab)
          ? "w-full max-w-5xl lg:max-w-6xl"
          : "max-w-xl sm:max-w-2xl"
      }`}>
        {activeTab === "beranda" && (
          <div className="space-y-3 animate-in fade-in zoom-in-95 duration-300">
            
            {/* Hero Section: Profile Card (Left) + Bio Data (Right) */}
            <div className="flex flex-row items-stretch gap-3 mt-2">
              
              {/* Profile Photo Card (iPhone Clock Sizeish) */}
              <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-900 p-3 rounded-[24px] sm:rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm shrink-0 w-28 sm:w-36">
                <div className="relative group w-full aspect-square mb-2">
                  {ylFoto ? (
                    <img
                      src={ylFoto}
                      alt={cleanYlName(ylName)}
                      className="w-full h-full rounded-[20px] sm:rounded-[24px] object-cover shadow-md transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-red-600 to-red-800 text-white font-black text-4xl sm:text-5xl rounded-[20px] sm:rounded-[24px] shadow-md flex items-center justify-center group-hover:from-red-500 group-hover:to-red-700 transition-all">
                      {cleanYlName(ylName).charAt(0).toUpperCase() || "Y"}
                    </div>
                  )}
                  <label
                    className="absolute -bottom-2 -right-2 bg-slate-900 text-white p-2 rounded-full cursor-pointer hover:bg-slate-800 shadow-lg border-2 border-slate-50 dark:border-slate-800 transition-transform active:scale-90"
                    title="Ganti Foto Profil YL"
                  >
                    <Camera className="w-4 h-4 text-red-300" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadFoto}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Bio Data Board */}
              <div className="flex-1 bg-white dark:bg-slate-900 rounded-[28px] sm:rounded-[32px] p-3.5 sm:p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-center relative overflow-hidden">
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight truncate">{cleanYlName(ylName)}</h2>
                      <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider block mt-0.5">
                        {displayAreaNumber ? `Area ${displayAreaNumber}` : "-"} • {currentYlInfo.kodeYl || (displayAreaNumber ? `YL-${displayAreaNumber}` : "-")}
                      </span>
                      {/* Gelar / Tier Badge dipindah ke card Bio */}
                      <div className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 px-2 py-0.5 rounded-lg text-[9.5px] sm:text-[10px] font-extrabold mt-1">
                        <span>🌟</span>
                        <span>{calculateMasaKerja(currentYlInfo.tanggalMasuk).title}</span>
                      </div>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-[9px] sm:text-[10px] font-bold px-2 py-1 rounded-xl text-center shrink-0">
                      <span className="text-[8px] uppercase tracking-wider block text-rose-500 font-extrabold">Masa Kerja</span>
                      <span className="text-xs font-black">{calculateMasaKerja(currentYlInfo.tanggalMasuk).text}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-xl">
                      <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider block">Tanggal Masuk</span>
                      <span className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-200">{currentYlInfo.tanggalMasuk || "-"}</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-xl">
                      <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider block">NIK</span>
                      <span className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-200">{currentYlInfo.nik || "-"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card Rekapitulasi Mini Kinerja YL (Pengganti Card Tier) */}
            <div className={`bg-white dark:bg-slate-900 p-3 rounded-2xl shadow-xs border ${
              mRata2 < 250 && mRata2 > 0
                ? "border-rose-300 dark:border-rose-800 ring-2 ring-rose-500/20"
                : "border-slate-200 dark:border-slate-800"
            } flex flex-col gap-2`}>
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${mRata2 < 250 ? "bg-rose-600 animate-ping" : "bg-emerald-600 animate-pulse"}`}></div>
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Kinerja Bulan Ini
                  </span>
                </div>
                <div className="text-[11px] sm:text-xs font-bold text-slate-600 dark:text-slate-300 flex items-baseline gap-1">
                  <span>Rata-rata:</span>
                  <span className={`font-black ${
                    mRata2 < 250
                      ? "text-rose-600 dark:text-rose-400 text-sm sm:text-base font-black px-1.5 py-0.2 bg-rose-50 dark:bg-rose-950/60 rounded-md border border-rose-200 dark:border-rose-900"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {Math.trunc(mRata2).toLocaleString("id-ID")}
                  </span>
                  <span className="text-[9.5px] font-normal text-slate-400">btl/hr</span>
                </div>
              </div>

              {mRata2 < 250 && (
                <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 px-2.5 py-1 rounded-xl text-[9.5px] sm:text-[10px] font-bold flex items-center gap-1.5">
                  <span className="text-xs">⚠️</span>
                  <span>Rata-rata harian masih <strong className="text-rose-700 dark:text-rose-400 font-black">&lt; 250 btl</strong> (Di bawah standar YL Mandiri). Tingkatkan penjualan harian yuk Bu!</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-1.5 text-center">
                {/* 1. vs Target */}
                <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block tracking-wider">vs Target</span>
                    <p className={`text-xs sm:text-sm font-black mt-0.5 ${
                      targetVal > 0 && mRata2 >= targetVal ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                    }`}>
                      {targetVal > 0 ? formatPercentTruncated((mRata2 / targetVal) * 100, 1) : "-"}
                    </p>
                  </div>
                  <div className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/50 leading-tight">
                    <span className="block font-medium">Tgt: {Math.trunc(targetVal)}</span>
                    <span className={`font-bold ${mRata2 >= targetVal ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {targetVal > 0 ? `${mRata2 >= targetVal ? "+" : ""}${Math.trunc(mRata2 - targetVal)}` : "-"}
                    </span>
                  </div>
                </div>

                {/* 2. vs Bulan Lalu */}
                <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block tracking-wider">vs Bln Lalu</span>
                    <p className={`text-xs sm:text-sm font-black mt-0.5 ${
                      blnLaluVal > 0 && mRata2 >= blnLaluVal ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"
                    }`}>
                      {blnLaluVal > 0 ? formatPercentTruncated((mRata2 / blnLaluVal) * 100, 1) : "-"}
                    </p>
                  </div>
                  <div className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/50 leading-tight">
                    <span className="block font-medium">Lalu: {Math.trunc(blnLaluVal)}</span>
                    <span className={`font-bold ${mRata2 >= blnLaluVal ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {blnLaluVal > 0 ? `${mRata2 >= blnLaluVal ? "+" : ""}${Math.trunc(mRata2 - blnLaluVal)}` : "-"}
                    </span>
                  </div>
                </div>

                {/* 3. vs Tahun Lalu */}
                <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-extrabold uppercase text-slate-500 dark:text-slate-400 block tracking-wider">vs Thn Lalu</span>
                    <p className={`text-xs sm:text-sm font-black mt-0.5 ${
                      thnLaluVal > 0 && mRata2 >= thnLaluVal ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"
                    }`}>
                      {thnLaluVal > 0 ? formatPercentTruncated((mRata2 / thnLaluVal) * 100, 1) : "-"}
                    </p>
                  </div>
                  <div className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/50 leading-tight">
                    <span className="block font-medium">Th Lalu: {Math.trunc(thnLaluVal)}</span>
                    <span className={`font-bold ${mRata2 >= thnLaluVal ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {thnLaluVal > 0 ? `${mRata2 >= thnLaluVal ? "+" : ""}${Math.trunc(mRata2 - thnLaluVal)}` : "-"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Birthday Message */}
            {isBirthday && (
              <div className="bg-gradient-to-r from-rose-400 via-pink-500 to-rose-500 p-4 rounded-2xl shadow-md flex items-center justify-center text-center animate-pulse border-2 border-rose-300 mt-1">
                <p className="text-white font-black text-sm sm:text-base leading-snug">
                  🎉 Selamat Ulang Tahun Ibu {cleanYlName(ylName)}! 🎂<br/>
                  <span className="text-[10px] sm:text-xs font-semibold opacity-90 block mt-1 leading-tight">Kami keluarga besar Yakult mengucapkan selamat ulang tahun. Semoga selalu diberikan kesehatan, kebahagiaan, dan makin sukses bersama Yakult. Amin.</span>
                </p>
              </div>
            )}

            {/* Menu Grid - Compact 4 to 5 Columns Responsive */}
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-5 landscape:grid-cols-5 gap-2 sm:gap-2.5">
              {[
                { id: "input", icon: "📝", label: "Entry Penjualan", color: "bg-red-50 dark:bg-red-950/30 text-red-600" },
                { id: "ringkasan", icon: "✨", label: "Ringkasan", color: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600" },
                { id: "breakdown", icon: "📊", label: "Breakdown dan Realisasi", color: "bg-amber-50 dark:bg-amber-950/30 text-amber-600" },
                { id: "realisasi_potensi", icon: "🎯", label: "Realisasi Potensi", color: "bg-sky-50 dark:bg-sky-950/30 text-sky-600" },
                { id: "evaluasi", icon: "📋", label: "Evaluasi", color: "bg-blue-50 dark:bg-blue-950/30 text-blue-600" },
                { id: "potensi_tembus", icon: "🚀", label: "Potensi Tembus", color: "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600" },
                { id: "seragam", icon: "👗", label: "Seragam", color: "bg-purple-50 dark:bg-purple-950/30 text-purple-600" },
                { id: "product_knowledge", icon: "📚", label: "Product Knowledge", color: "bg-rose-50 dark:bg-rose-950/30 text-rose-600" },
                { id: "tautan", icon: "🔗", label: "Link", color: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" },
                { id: "ai_chat", icon: "🤖", label: "Tanya AI", color: "bg-violet-50 dark:bg-violet-950/30 text-violet-600" },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => {
                    if (btn.id === "ai_chat") {
                      window.dispatchEvent(new CustomEvent("open-ai-chat"));
                    } else {
                      setActiveTab(btn.id as any);
                    }
                  }}
                  className="bg-white dark:bg-slate-900 p-2 sm:p-2.5 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md transition-all active:scale-95 group text-center flex flex-col items-center justify-center gap-1.5 min-h-[76px] sm:min-h-[82px] cursor-pointer"
                >
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${btn.color} flex items-center justify-center text-lg sm:text-xl group-hover:scale-110 transition-transform`}>
                    {btn.icon}
                  </div>
                  <h3 className="font-extrabold text-slate-800 dark:text-slate-200 text-[10px] sm:text-[11px] leading-tight text-center line-clamp-2 w-full px-0.5">
                    {btn.label}
                  </h3>
                </button>
              ))}
            </div>

            {/* Papan Catatan Perhatian Manager */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-2xl p-3 sm:p-4 border border-amber-300 dark:border-amber-700/50 shadow-xs flex flex-col justify-between">
              <div className="flex items-center gap-1.5 border-b border-amber-200 dark:border-amber-800/60 pb-1.5 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 animate-bounce shrink-0" />
                <h2 className="text-[10px] sm:text-xs font-black text-amber-950 dark:text-amber-100 uppercase tracking-wider">
                  Perhatian
                </h2>
              </div>
              <div className="overflow-y-auto pr-1 flex-1 max-h-24">
                {motYlLines.length > 0 ? (
                  <ul className="space-y-1.5">
                    {motYlLines.map((line, idx) => (
                      <li key={idx} className="text-[10px] sm:text-xs font-bold text-amber-900 dark:text-amber-200 leading-snug flex items-start gap-1">
                        <span className="text-amber-500 dark:text-amber-400 mt-0.5">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] sm:text-xs font-semibold text-amber-700/60 dark:text-amber-400/60 italic text-center py-2">
                    Belum ada catatan khusus.
                  </p>
                )}
              </div>
            </div>

          </div>
        )}
        

        {/* TAB INPUT — Form harian YL, tampilan disederhanakan (khusus menu YL) */}
        {activeTab === "input" && (
          <div className="space-y-3">
            {/* Tanggal */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Tanggal Transaksi</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            {/* 1. Total Jual & Setoran Harian */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
              <h2 className="text-sm font-black text-slate-800">1. Total Jual & Setoran Harian</h2>
              <div className="space-y-2">
                {[
                  { label: "YO", val: totYo, set: setTotYo, rp: setYo },
                  { label: "OM", val: totOm, set: setTotOm, rp: setOm },
                  { label: "OS", val: totOs, set: setTotOs, rp: setOs },
                  { label: "YT", val: totYt, set: setTotYt, rp: setYt },
                ].map(row => (
                  <div key={row.label} className="grid grid-cols-[1.75rem_1fr_7rem] sm:grid-cols-[2rem_1fr_8rem] items-center gap-2 sm:gap-3">
                    <span className="font-black text-xs sm:text-sm text-slate-600">{row.label}</span>
                    <NumberInput
                      min={0}
                      value={row.val}
                      onChange={(v) => row.set(Math.max(0, v))}
                      className="w-full text-center font-bold text-sm text-slate-900 bg-slate-50 border border-slate-200 py-1.5 rounded-xl outline-none focus:ring-2 focus:ring-red-400"
                    />
                    <span className="text-right text-[11px] sm:text-xs font-bold text-slate-500 tabular-nums whitespace-nowrap">{formatRp(row.rp)}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[1.75rem_1fr_7rem] sm:grid-cols-[2rem_1fr_8rem] items-center gap-2 sm:gap-3 pt-2 border-t border-slate-100">
                <span className="col-span-2 text-[11px] sm:text-xs font-bold text-slate-500 uppercase">Total Setoran</span>
                <span className="text-right text-sm sm:text-base font-black text-emerald-600 tabular-nums whitespace-nowrap">{formatRp(setYo + setOm + setOs + setYt)}</span>
              </div>
            </div>

            {/* 2. Balik Botol (BB) */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
              <h2 className="text-sm font-black text-slate-800">2. Balik Botol (BB)</h2>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "YO", val: bbYo, set: setBbYo },
                  { label: "OM", val: bbOm, set: setBbOm },
                  { label: "OS", val: bbOs, set: setBbOs },
                  { label: "YT", val: bbYt, set: setBbYt },
                ].map(row => (
                  <div key={row.label} className="space-y-1">
                    <span className="text-xs font-bold text-slate-500 block text-center">{row.label}</span>
                    <NumberInput
                      min={0}
                      value={row.val}
                      onChange={(v) => row.set(Math.max(0, v))}
                      className="w-full text-center font-bold text-sm text-slate-900 bg-slate-50 border border-slate-200 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Realisasi Potensi */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div>
                <h2 className="text-sm font-black text-slate-800">3. Potensi</h2>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">Pecah total jual ke potensi di bawah ini. Total harus pas dengan Acuan Admin.</p>
              </div>

              {[
                { key: "rmh", label: "Rumah" },
                { key: "psr", label: "Pasar" },
                { key: "skh", label: "Sekolah" },
                { key: "ktr", label: "Kantor" },
                { key: "tk", label: "Toko" },
                { key: "ib", label: "IB" },
              ].map(sec => (
                <div key={sec.key} className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
                  <span className="text-xs font-black text-slate-600 uppercase">{sec.label}</span>
                  <div className="grid grid-cols-4 gap-2">
                    {(["yo", "om", "os", "yt"] as const).map(prod => (
                      <div key={prod} className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 block text-center uppercase">{prod}</span>
                        <NumberInput
                          min={0}
                          value={sectors[sec.key][prod]}
                          onChange={(v) => setSectors(prev => ({ ...prev, [sec.key]: { ...prev[sec.key], [prod]: Math.max(0, v) } }))}
                          className="w-full text-center font-bold text-xs text-slate-900 bg-white border border-slate-200 py-2 rounded-lg outline-none focus:ring-2 focus:ring-red-400"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Pencocokan Potensi Jual — SATU acuan saja: Acuan Admin pertanggal */}
              <div className={`rounded-xl p-4 border space-y-3 ${canSaveInputHarian ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
                <div className="flex justify-between items-center">
                  <span className="text-base font-black text-slate-800">Pencocokan Potensi Jual</span>
                  <span className={`text-sm font-black px-2.5 py-1 rounded-lg ${canSaveInputHarian ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                    {canSaveInputHarian ? "✓ COCOK" : "✗ BELUM PAS"}
                  </span>
                </div>
                {hasAdminAcuan ? (
                  <>
                    <span className="text-xs font-bold text-slate-500 uppercase block">Acuan Admin (Tgl {inputHarianDay})</span>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-bold">
                      <span className={secSumYo === acuanHarianYo ? "text-emerald-700" : "text-rose-700"}>YO: {secSumYo}/{acuanHarianYo}</span>
                      <span className={secSumOm === acuanHarianOm ? "text-emerald-700" : "text-rose-700"}>OM: {secSumOm}/{acuanHarianOm}</span>
                      <span className={secSumOs === acuanHarianOs ? "text-emerald-700" : "text-rose-700"}>OS: {secSumOs}/{acuanHarianOs}</span>
                      <span className={secSumYt === acuanHarianYt ? "text-emerald-700" : "text-rose-700"}>YT: {secSumYt}/{acuanHarianYt}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-slate-500">Acuan Admin untuk tanggal ini belum tersedia.</p>
                )}
              </div>
            </div>

            {/* 4. Kunjungan, PB, & Sampah Botol */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
              <h2 className="text-sm font-black text-slate-800">4. Kunjungan, PB, & Sampah Botol</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "PLG (Pelanggan)", val: fPlg, set: setFPlg },
                  { label: "RK (Rmh Kunjung)", val: fRk, set: setFRk },
                  { label: "RA (Rmh Ada)", val: fRa, set: setFRa },
                  { label: "RB (Rmh Beli)", val: fRb, set: setFRb },
                ].map(row => (
                  <div key={row.label} className="space-y-1">
                    <span className="text-xs font-bold text-slate-500 block">{row.label}</span>
                    <NumberInput min={0} value={row.val} onChange={(v) => row.set(Math.max(0, v))} className="w-full text-center font-bold text-sm text-slate-900 bg-slate-50 border border-slate-200 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 block">PB Pagi</span>
                  <NumberInput min={0} value={pbP} onChange={(v) => setPbP(Math.max(0, v))} className="w-full text-center font-bold text-sm text-slate-900 bg-slate-50 border border-slate-200 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 block">PB Sore</span>
                  <NumberInput min={0} value={pbS} onChange={(v) => setPbS(Math.max(0, v))} className="w-full text-center font-bold text-sm text-slate-900 bg-slate-50 border border-slate-200 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 block">PLG APK</span>
                  <NumberInput min={0} value={apkPlg} onChange={(v) => setApkPlg(Math.max(0, v))} className="w-full text-center font-bold text-sm text-slate-900 bg-slate-50 border border-slate-200 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 block">Sampah Botol</span>
                  <NumberInput min={0} value={apkBotol} onChange={(v) => setApkBotol(Math.max(0, v))} className="w-full text-center font-bold text-sm text-slate-900 bg-slate-50 border border-slate-200 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-red-400" />
                </div>
              </div>
            </div>

            {/* Simpan */}
            <button
              onClick={handleSaveInputHarian}
              disabled={isSavingInputHarian}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black text-sm py-4 rounded-2xl shadow-sm transition-all active:scale-[0.99]"
            >
              {isSavingInputHarian ? "Menyimpan..." : "💾 Simpan Laporan Harian"}
            </button>
            
            {inputHarianMsg && (
              <p className={`text-xs font-bold text-center -mt-2 ${inputHarianMsg.includes("❌") ? "text-rose-600" : "text-emerald-600"}`}>
                {inputHarianMsg}
              </p>
            )}
          </div>
        )}

        {/* RINGKASAN TAB */}
        {activeTab === "ringkasan" && (
          <div className="space-y-3.5">
            {/* Target, Bulan Lalu, & Tahun Lalu Per YL Display Card - Ringkas & Pas Isi */}
            <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between border-l-4 border-red-600 pl-2.5">
                <div>
                  <h2 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider">
                    Target, Bulan Lalu & Tahun Lalu
                  </h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-semibold uppercase">
                    Rata-Rata Saat Ini: <span className={`font-black ${mRata2 < 250 ? "text-rose-600 text-xs sm:text-sm font-black" : "text-slate-900"}`}>{Math.trunc(mRata2)} btl/hari {mRata2 < 250 && mRata2 > 0 ? "(<250 Standar Mandiri)" : ""}</span>
                  </p>
                </div>
                <span className="text-[10px] sm:text-[11px] font-black bg-red-50 text-red-700 px-2.5 py-0.5 rounded-lg border border-red-200">
                  Area {displayAreaNumber || "-"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-2.5 text-center pt-0.5">
                {/* 1. Target Bulan Ini */}
                <div className="p-2 sm:p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between">
                  <div>
                    <span className="text-[9.5px] sm:text-[10px] font-extrabold uppercase text-slate-600 block tracking-wider">Target Bulan Ini</span>
                    <p className="text-base sm:text-xl font-black text-slate-800 leading-tight mt-0.5">
                      {Math.trunc(targetVal).toLocaleString("id-ID")}
                      <span className="text-[9px] sm:text-[9.5px] font-bold text-slate-400 block -mt-0.5">btl / hari</span>
                    </p>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200 leading-tight">
                    <span className="text-[9px] text-slate-500 font-extrabold uppercase block">vs Target</span>
                    <p className={`text-xs sm:text-sm font-black ${targetVal > 0 && mRata2 >= targetVal ? "text-emerald-700" : "text-amber-700"}`}>
                      {getPctString(mRata2, targetVal)}
                    </p>
                    <p className={`text-[10px] sm:text-[11px] font-black mt-0.5 ${targetVal > 0 && mRata2 >= targetVal ? "text-emerald-700" : "text-amber-700"}`}>
                      {targetVal > 0 ? `${mRata2 >= targetVal ? "+" : ""}${Math.trunc(mRata2 - targetVal)} btl` : "-"}
                    </p>
                  </div>
                </div>

                {/* 2. Bulan Lalu */}
                <div className="p-2 sm:p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between">
                  <div>
                    <span className="text-[9.5px] sm:text-[10px] font-extrabold uppercase text-slate-600 block tracking-wider">Bulan Lalu</span>
                    <p className="text-base sm:text-xl font-black text-slate-800 leading-tight mt-0.5">
                      {Math.trunc(blnLaluVal).toLocaleString("id-ID")}
                      <span className="text-[9px] sm:text-[9.5px] font-bold text-slate-400 block -mt-0.5">btl / hari</span>
                    </p>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200 leading-tight">
                    <span className="text-[9px] text-slate-500 font-extrabold uppercase block">vs Bln Lalu</span>
                    <p className={`text-xs sm:text-sm font-black ${blnLaluVal > 0 && mRata2 >= blnLaluVal ? "text-emerald-700" : "text-rose-700"}`}>
                      {getPctString(mRata2, blnLaluVal)}
                    </p>
                    <p className={`text-[10px] sm:text-[11px] font-black mt-0.5 ${blnLaluVal > 0 && mRata2 >= blnLaluVal ? "text-emerald-700" : "text-rose-700"}`}>
                      {blnLaluVal > 0 ? `${mRata2 >= blnLaluVal ? "+" : ""}${Math.trunc(mRata2 - blnLaluVal)} btl` : "-"}
                    </p>
                  </div>
                </div>

                {/* 3. Tahun Lalu */}
                <div className="p-2 sm:p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between">
                  <div>
                    <span className="text-[9.5px] sm:text-[10px] font-extrabold uppercase text-slate-600 block tracking-wider">Tahun Lalu</span>
                    <p className="text-base sm:text-xl font-black text-slate-800 leading-tight mt-0.5">
                      {Math.trunc(thnLaluVal).toLocaleString("id-ID")}
                      <span className="text-[9px] sm:text-[9.5px] font-bold text-slate-400 block -mt-0.5">btl / hari</span>
                    </p>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200 leading-tight">
                    <span className="text-[9px] text-slate-500 font-extrabold uppercase block">vs Thn Lalu</span>
                    <p className={`text-xs sm:text-sm font-black ${thnLaluVal > 0 && mRata2 >= thnLaluVal ? "text-emerald-700" : "text-rose-700"}`}>
                      {getPctString(mRata2, thnLaluVal)}
                    </p>
                    <p className={`text-[10px] sm:text-[11px] font-black mt-0.5 ${thnLaluVal > 0 && mRata2 >= thnLaluVal ? "text-emerald-700" : "text-rose-700"}`}>
                      {thnLaluVal > 0 ? `${mRata2 >= thnLaluVal ? "+" : ""}${Math.trunc(mRata2 - thnLaluVal)} btl` : "-"}
                    </p>
                  </div>
                </div>
              </div>
            </div>


            {/* Akumulasi Penjualan */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wider border-l-4 border-red-600 pl-3">
                Akumulasi Penjualan (Bulan Ini)
              </h2>
              <div className="space-y-4">
                {/* YO progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs sm:text-sm font-black text-slate-800">
                    <span className="text-red-600">YO Original</span>
                    <span>{mYo} btl ({pctOfTotal(mYo)}%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-600 rounded-full" style={{ width: `${pctOfTotal(mYo)}%` }} />
                  </div>
                </div>

                {/* OM progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs sm:text-sm font-black text-slate-800">
                    <span className="text-amber-500">OM Mango</span>
                    <span>{mOm} btl ({pctOfTotal(mOm)}%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pctOfTotal(mOm)}%` }} />
                  </div>
                </div>

                {/* OS progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs sm:text-sm font-black text-slate-800">
                    <span className="text-pink-500">OS Stroberi</span>
                    <span>{mOs} btl ({pctOfTotal(mOs)}%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-pink-500 rounded-full" style={{ width: `${pctOfTotal(mOs)}%` }} />
                  </div>
                </div>

                {/* YT progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs sm:text-sm font-black text-slate-800">
                    <span className="text-blue-600">YT Light</span>
                    <span>{mYt} btl ({pctOfTotal(mYt)}%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pctOfTotal(mYt)}%` }} />
                  </div>
                </div>

                <hr className="border-slate-200 my-2" />
                <div className="bg-red-50/90 p-4 rounded-2xl border border-red-200 text-center space-y-1">
                  <span className="text-xs font-black text-red-950 uppercase tracking-wider block">Grand Total Jual</span>
                  <span className="text-2xl sm:text-4xl font-black text-rose-600 block">{mTotalSales} btl</span>
                  <span className="text-xs text-slate-600 font-extrabold block">Rata-Rata harian: {Math.trunc(mRata2)} btl/hari</span>
                </div>
              </div>
            </div>

            {/* Akumulasi Realisasi Per Potensi & Persentase Matrix */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-l-4 border-indigo-600 pl-3">
                <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wider">
                  📊 Ringkasan Akumulasi Per Potensi
                </h2>
                <span className="text-xs font-mono bg-indigo-50 text-indigo-700 font-black px-2.5 py-1 rounded-lg border border-indigo-100">
                  Total: {mRmh + mPsr + mSkh + mKtr + mTk + mIb} btl
                </span>
              </div>

              {(() => {
                const totalPot = mRmh + mPsr + mSkh + mKtr + mTk + mIb;
                const getPct = (val: number) => totalPot > 0 ? String(Math.round((val / totalPot) * 100)) : "0";

                const sectorList = [
                  { key: "rmh", label: "Rumah", val: mRmh, pct: getPct(mRmh), bg: "bg-emerald-50 border-emerald-200 text-emerald-950", bar: "bg-emerald-500" },
                  { key: "psr", label: "Pasar", val: mPsr, pct: getPct(mPsr), bg: "bg-amber-50 border-amber-200 text-amber-950", bar: "bg-amber-500" },
                  { key: "skh", label: "Sekolah", val: mSkh, pct: getPct(mSkh), bg: "bg-pink-50 border-pink-200 text-pink-950", bar: "bg-pink-500" },
                  { key: "ktr", label: "Kantor", val: mKtr, pct: getPct(mKtr), bg: "bg-purple-50 border-purple-200 text-purple-950", bar: "bg-purple-500" },
                  { key: "tk", label: "Toko", val: mTk, pct: getPct(mTk), bg: "bg-teal-50 border-teal-200 text-teal-950", bar: "bg-teal-500" },
                  { key: "ib", label: "IB (Instan Buyer)", val: mIb, pct: getPct(mIb), bg: "bg-indigo-50 border-indigo-200 text-indigo-950", bar: "bg-indigo-500" }
                ];

                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {sectorList.map(s => (
                        <div key={s.key} className={`p-3 rounded-2xl border ${s.bg} space-y-1.5 shadow-sm`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase">{s.label}</span>
                            <span className="text-xs font-black font-mono">{s.pct}%</span>
                          </div>
                          <span className="text-base sm:text-lg font-black font-mono block">{s.val} <span className="text-xs font-normal">btl</span></span>
                          <div className="w-full bg-black/10 rounded-full h-2 overflow-hidden">
                            <div className={`${s.bar} h-full rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, Number(s.pct))}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Ratios & Comparisons */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-l-4 border-slate-500 pl-3">
                <h2 className="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wider">
                  Performa & Rasio Kunjungan
                </h2>
                <span className="text-[11px] font-bold text-slate-500 uppercase">PLG, RK, RA, & RB</span>
              </div>

              {/* Stat Card Jumlah PLG, RK, RA, dan RB */}
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                <div className="bg-slate-50 p-2 sm:p-2.5 rounded-xl border border-slate-200 text-center flex flex-col justify-between">
                  <div className="h-4 sm:h-5 flex items-center justify-center">
                    <span className="text-[8.5px] xs:text-[9.5px] sm:text-[10px] text-slate-500 font-extrabold uppercase whitespace-nowrap tracking-tighter sm:tracking-normal">Jumlah PLG</span>
                  </div>
                  <span className="text-sm sm:text-xl font-black text-slate-800 my-0.5">{mPlg.toLocaleString("id-ID")}</span>
                  <span className="text-[8px] sm:text-[9px] text-slate-400 font-semibold block truncate">Pelanggan</span>
                </div>
                <div className="bg-sky-50 p-2 sm:p-2.5 rounded-xl border border-sky-200 text-center flex flex-col justify-between">
                  <div className="h-4 sm:h-5 flex items-center justify-center">
                    <span className="text-[8.5px] xs:text-[9.5px] sm:text-[10px] text-sky-700 font-extrabold uppercase whitespace-nowrap tracking-tighter sm:tracking-normal">Jumlah RK</span>
                  </div>
                  <span className="text-sm sm:text-xl font-black text-sky-800 my-0.5">{mRk.toLocaleString("id-ID")}</span>
                  <span className="text-[8px] sm:text-[9px] text-sky-600/80 font-semibold block truncate">Rumah Kunjung</span>
                </div>
                <div className="bg-indigo-50 p-2 sm:p-2.5 rounded-xl border border-indigo-200 text-center flex flex-col justify-between">
                  <div className="h-4 sm:h-5 flex items-center justify-center">
                    <span className="text-[8.5px] xs:text-[9.5px] sm:text-[10px] text-indigo-700 font-extrabold uppercase whitespace-nowrap tracking-tighter sm:tracking-normal">Jumlah RA</span>
                  </div>
                  <span className="text-sm sm:text-xl font-black text-indigo-800 my-0.5">{mRa.toLocaleString("id-ID")}</span>
                  <span className="text-[8px] sm:text-[9px] text-indigo-600/80 font-semibold block truncate">Rumah Ada</span>
                </div>
                <div className="bg-emerald-50 p-2 sm:p-2.5 rounded-xl border border-emerald-200 text-center flex flex-col justify-between">
                  <div className="h-4 sm:h-5 flex items-center justify-center">
                    <span className="text-[8.5px] xs:text-[9.5px] sm:text-[10px] text-emerald-700 font-extrabold uppercase whitespace-nowrap tracking-tighter sm:tracking-normal">Jumlah RB</span>
                  </div>
                  <span className="text-sm sm:text-xl font-black text-emerald-800 my-0.5">{mRb.toLocaleString("id-ID")}</span>
                  <span className="text-[8px] sm:text-[9px] text-emerald-600/80 font-semibold block truncate">Rumah Beli</span>
                </div>
              </div>

              {/* Grid Rasio Persentase & Detail Jumlah */}
              <div className="grid grid-cols-2 gap-2.5 text-center text-xs font-bold">
                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] sm:text-xs text-slate-500 font-bold block mb-0.5">RK vs PELANGGAN</span>
                    <span className="text-base sm:text-xl font-black text-indigo-700">{getPctString(mRk, mPlg)}</span>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200 text-[10px] sm:text-[11px] text-slate-600 font-bold">
                    RK: <span className="font-black text-slate-900">{mRk}</span> / PLG: <span className="font-black text-slate-900">{mPlg}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] sm:text-xs text-slate-500 font-bold block mb-0.5">RA vs RK</span>
                    <span className="text-base sm:text-xl font-black text-sky-700">{getPctString(mRa, mRk)}</span>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200 text-[10px] sm:text-[11px] text-slate-600 font-bold">
                    RA: <span className="font-black text-slate-900">{mRa}</span> / RK: <span className="font-black text-slate-900">{mRk}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] sm:text-xs text-slate-500 font-bold block mb-0.5">RB vs RA</span>
                    <span className="text-base sm:text-xl font-black text-emerald-700">{getPctString(mRb, mRa)}</span>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200 text-[10px] sm:text-[11px] text-slate-600 font-bold">
                    RB: <span className="font-black text-slate-900">{mRb}</span> / RA: <span className="font-black text-slate-900">{mRa}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] sm:text-xs text-slate-500 font-bold block mb-0.5">RB vs PELANGGAN</span>
                    <span className="text-base sm:text-xl font-black text-teal-700">{getPctString(mRb, mPlg)}</span>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200 text-[10px] sm:text-[11px] text-slate-600 font-bold">
                    RB: <span className="font-black text-slate-900">{mRb}</span> / PLG: <span className="font-black text-slate-900">{mPlg}</span>
                  </div>
                </div>

                {/* Total PB */}
                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-slate-800">
                  <span className="text-[10px] sm:text-xs text-slate-500 font-bold block mb-0.5">TOTAL PB</span>
                  <span className="text-base sm:text-lg font-black text-rose-600">{mPb} btl</span>
                </div>
                {/* Total BB & % */}
                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-slate-800">
                  <span className="text-[10px] sm:text-xs text-slate-500 font-bold block mb-0.5">TOTAL BB & %</span>
                  <span className="text-base sm:text-lg font-black text-rose-600">{mBb} btl ({getPctString(mBb, mTotalSales)})</span>
                </div>
                {/* Total Sampah Botol */}
                <div className="col-span-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-slate-800">
                  <span className="text-[10px] sm:text-xs text-slate-500 font-bold block mb-0.5">TOTAL SAMPAH BOTOL</span>
                  <span className="text-base sm:text-lg font-black text-emerald-600">{mSampahBotol} btl</span>
                </div>
              </div>
            </div>

            {/* Estimasi Kompensasi (Dipindah ke bawah di atas Analisa) */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wider border-l-4 border-emerald-500 pl-3">
                Rincian Estimasi Kompensasi
              </h2>
              <div className="space-y-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center text-xs sm:text-sm text-slate-800">
                  <span className="font-bold text-slate-600">1. Laba Harian</span>
                  <span className="font-black text-slate-900">{formatRp(mKompensasiHarian)}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center text-xs sm:text-sm text-slate-800">
                  <span className="font-bold text-slate-600">2. Estimasi Kompensasi Bulanan (Kotor)</span>
                  <span className="font-black text-slate-900">{formatRp(mKompensasiBulanan)}</span>
                </div>

                {/* Potongan Pajak & Iuran */}
                <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-xl space-y-2 text-xs">
                  <div className="text-[11px] font-black uppercase text-rose-800 tracking-wider border-b border-rose-200/80 pb-1.5 flex justify-between items-center">
                    <span>✂️ Potongan (Dari Kompensasi Bulanan)</span>
                    <span className="text-[10px] font-bold text-rose-600">PPh & JHT</span>
                  </div>
                  <div className="flex justify-between items-center text-rose-900 font-medium">
                    <span>• Pajak PPh ({mPphRateStr}%)</span>
                    <span className="font-bold text-rose-700">- {formatRp(mPph)}</span>
                  </div>
                  <div className="flex justify-between items-center text-rose-900 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span>• Iuran JHT (Jaminan Hari Tua)</span>
                      {!mIkutJht && (
                        <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                          Tidak Ikut
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-rose-700">{mIkutJht ? `- ${formatRp(mJht)}` : "Rp 0"}</span>
                  </div>
                  {mJkk > 0 && (
                    <div className="flex justify-between items-center text-rose-900 font-medium">
                      <span>• Iuran JKK / JKM</span>
                      <span className="font-bold text-rose-700">- {formatRp(mJkk)}</span>
                    </div>
                  )}
                  <div className="pt-1.5 border-t border-rose-200 flex justify-between items-center text-xs font-black text-rose-950">
                    <span>Total Potongan</span>
                    <span className="text-rose-700">- {formatRp(mTotalPotongan)}</span>
                  </div>
                </div>

                <div className="bg-emerald-50/90 p-4 rounded-2xl border-2 border-emerald-300 text-center space-y-1.5 shadow-sm">
                  <span className="text-xs font-black text-emerald-950 uppercase block">Kompensasi Bersih Bulanan</span>
                  <span className="text-2xl sm:text-4xl font-black text-emerald-600 block">{formatRp(mKompensasiBersihBulanan)}</span>
                  <span className="text-[10px] text-slate-500 font-semibold block">*Dihitung dari Kompensasi Bulanan Kotor ({formatRp(mKompensasiBulanan)}) dipotong PPh ({mPphRateStr}%), JHT ({formatRp(mJht)}), dan JKK/JKM ({formatRp(mJkk)}).</span>
                  {mKompensasiHarian > 0 && (
                    <div className="pt-2 border-t border-emerald-200/80 text-xs font-black text-slate-800 flex justify-between items-center px-2">
                      <span>Total Terima (Harian + Bersih Bulanan):</span>
                      <span className="text-emerald-700 font-black text-sm">{formatRp(mTotalTakeHome)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* AI Analysis Block */}
            <div className="col-span-2 bg-gradient-to-br from-rose-50 via-pink-50 to-amber-50 rounded-2xl p-5 border-2 border-rose-200 shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-rose-200/80 pb-2">
                <div className="flex items-center gap-2.5 text-rose-700">
                  <Sparkles className="w-6 h-6 animate-pulse text-rose-600" />
                  <div>
                    <h2 className="text-base sm:text-lg font-black uppercase tracking-wider text-rose-900">
                      Analisa Ibu {motivasiConfig?.chatbotName || "AI Jember 1 Pro"}
                    </h2>
                    <p className="text-xs sm:text-sm font-bold text-rose-600">
                      Pesan Motivasi & Evaluasi Keibuan Unik
                    </p>
                  </div>
                </div>
              </div>

              {isYlAiLoading ? (
                <div className="flex flex-col items-center py-8 space-y-3 bg-white/70 rounded-xl p-4 border border-rose-100">
                  <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-base sm:text-lg font-black text-rose-800 animate-pulse text-center">
                    Sebentar nggih Bu... Ibu {motivasiConfig?.chatbotName || "AI Jember 1 Pro"} sedang membaca data & menyiapkan pesan untuk Ibu... 🌸
                  </p>
                </div>
              ) : ylAiInsight ? (
                <div className="space-y-4">
                  <div 
                    className="text-base sm:text-lg leading-relaxed text-slate-900 font-semibold space-y-3 bg-white/95 p-4 sm:p-5 rounded-xl border border-rose-200 shadow-sm"
                    dangerouslySetInnerHTML={{ __html: ylAiInsight }}
                  />
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleGenerateYlAi}
                      className="px-5 py-2.5 bg-rose-100 hover:bg-rose-200 text-rose-900 font-extrabold text-sm sm:text-base rounded-xl transition-all flex items-center gap-2 shadow-sm border border-rose-300 active:scale-95"
                    >
                      <Sparkles className="w-5 h-5 text-rose-600" />
                      <span>🔄 Klik di Sini untuk Analisa Ulang</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-4 space-y-3 text-center bg-white/80 p-5 rounded-xl border border-rose-200 shadow-sm">
                  <p className="text-base sm:text-lg font-bold text-slate-800 leading-snug">
                    Klik tombol di bawah ini untuk melihat pesan motivasi & analisa harian dari Ibu {motivasiConfig?.chatbotName || "AI Jember 1 Pro"}:
                  </p>
                  <button
                    onClick={handleGenerateYlAi}
                    className="w-full sm:w-auto mx-auto px-6 py-4 bg-gradient-to-r from-rose-600 via-pink-600 to-rose-700 hover:from-rose-700 hover:to-pink-700 text-white font-black text-base sm:text-xl rounded-xl shadow-lg hover:shadow-rose-300/50 transition-all flex items-center justify-center gap-2.5 active:scale-95"
                  >
                    <Sparkles className="w-6 h-6 text-yellow-300 animate-bounce" />
                    <span>✨ Klik di Sini untuk Analisa Ibu {motivasiConfig?.chatbotName || "AI Jember 1 Pro"}</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB BREAKDOWN RENCANA & REALISASI (READ-ONLY FOR YL - VERTIKAL PERTANGGAL) */}
        {activeTab === "breakdown" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4 overflow-hidden">
              <div className="border-l-4 border-red-600 pl-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex-1 min-w-0 pr-1">
                  <h2 className="text-sm sm:text-base font-black text-red-950 uppercase tracking-wider flex items-center gap-2">
                    <span>📊 Breakdown Rencana & Realisasi Harian</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-bold leading-relaxed mt-0.5">
                    Diambil dari menu Breakdown & Realisasi Admin. Bersifat <span className="text-red-600 font-extrabold">Read-Only (Hanya Lihat - Vertikal Pertanggal)</span>.
                  </p>
                </div>
                <span className="text-xs font-mono bg-red-100 text-red-800 font-black px-3 py-1.5 rounded-lg shrink-0">
                  🔒 Mode Read-Only YL
                </span>
              </div>

              {/* Summary Metrics for YL Breakdown */}
              {(() => {
                const daysObj = ylBreakdownPlan?.days || ylBreakdownPlan || {};
                const realDaysObj = ylBreakdownRealisasi?.days || ylBreakdownRealisasi || {};

                let sumPlanYo = 0, sumPlanOm = 0, sumPlanOs = 0, sumPlanYt = 0;
                let sumRealYo = 0, sumRealOm = 0, sumRealOs = 0, sumRealYt = 0;

                const daysList = Array.from({ length: 31 }, (_, i) => i + 1);

                return (
                  <div className="space-y-3">
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs sm:text-sm border-collapse font-mono">
                        <thead>
                          <tr className="bg-slate-900 text-slate-200 font-black uppercase text-xs border-b border-slate-800">
                            <th className="p-2.5 border-r border-slate-800 sticky left-0 bg-slate-900 z-10 min-w-[80px]">Tanggal</th>
                            <th colSpan={5} className="p-2.5 text-center border-r border-slate-800 bg-slate-800/80 text-amber-300">Rencana Breakdown (Admin)</th>
                            <th colSpan={5} className="p-2.5 text-center bg-slate-800/40 text-emerald-300">Realisasi Penjualan (Admin)</th>
                          </tr>
                          <tr className="bg-slate-800 text-slate-300 text-xs font-black uppercase border-b border-slate-700">
                            <th className="p-2 border-r border-slate-700 sticky left-0 bg-slate-800 text-slate-300">Tgl</th>
                            <th className="p-2 text-center text-red-300">YO</th>
                            <th className="p-2 text-center text-amber-300">OM</th>
                            <th className="p-2 text-center text-pink-300">OS</th>
                            <th className="p-2 text-center text-blue-300">YT</th>
                            <th className="p-2 text-right text-amber-400 border-r border-slate-700 bg-amber-950/30">Tot Rcn</th>
                            <th className="p-2 text-center text-red-300">YO</th>
                            <th className="p-2 text-center text-amber-300">OM</th>
                            <th className="p-2 text-center text-pink-300">OS</th>
                            <th className="p-2 text-center text-blue-300">YT</th>
                            <th className="p-2 text-right text-emerald-400 bg-emerald-950/30">Tot Rls</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold text-slate-800 text-xs sm:text-sm">
                          {daysList.map(d => {
                            const dayPlan = daysObj[String(d)] || daysObj[d] || { yo: 0, om: 0, os: 0, yt: 0 };
                            const pYo = Number(dayPlan.yo) || 0;
                            const pOm = Number(dayPlan.om) || 0;
                            const pOs = Number(dayPlan.os) || 0;
                            const pYt = Number(dayPlan.yt) || 0;
                            const pTot = pYo + pOm + pOs + pYt;

                            sumPlanYo += pYo; sumPlanOm += pOm; sumPlanOs += pOs; sumPlanYt += pYt;

                            // Realisasi murni diambil dari Breakdown Realisasi Admin (sesuai data Admin)
                            const adminRealDay = realDaysObj[String(d)] || realDaysObj[d] || { yo: 0, om: 0, os: 0, yt: 0 };
                            const rYo = Number(adminRealDay.yo) || 0;
                            const rOm = Number(adminRealDay.om) || 0;
                            const rOs = Number(adminRealDay.os) || 0;
                            const rYt = Number(adminRealDay.yt) || 0;
                            const rTot = rYo + rOm + rOs + rYt;

                            sumRealYo += rYo; sumRealOm += rOm; sumRealOs += rOs; sumRealYt += rYt;

                            return (
                              <tr key={d} className="hover:bg-slate-50 transition-colors">
                                <td className="p-2 border-r border-slate-200 font-black text-slate-900 sticky left-0 bg-white">Tgl {d}</td>
                                {/* Plan */}
                                <td className="p-2 text-center text-slate-700">{pYo || "-"}</td>
                                <td className="p-2 text-center text-slate-700">{pOm || "-"}</td>
                                <td className="p-2 text-center text-slate-700">{pOs || "-"}</td>
                                <td className="p-2 text-center text-slate-700">{pYt || "-"}</td>
                                <td className="p-2 text-right font-black text-amber-800 border-r border-slate-200 bg-amber-50/50">{pTot}</td>
                                {/* Realisasi */}
                                <td className="p-2 text-center text-slate-700">{rYo || "-"}</td>
                                <td className="p-2 text-center text-slate-700">{rOm || "-"}</td>
                                <td className="p-2 text-center text-slate-700">{rOs || "-"}</td>
                                <td className="p-2 text-center text-slate-700">{rYt || "-"}</td>
                                <td className="p-2 text-right font-black text-emerald-800 bg-emerald-50/50">{rTot}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-900 text-white font-black text-xs sm:text-sm border-t-2 border-slate-800">
                          <tr>
                            <td className="p-2.5 uppercase border-r border-slate-800 sticky left-0 bg-slate-900">TOTAL</td>
                            <td className="p-2.5 text-center text-red-300">{sumPlanYo}</td>
                            <td className="p-2.5 text-center text-amber-300">{sumPlanOm}</td>
                            <td className="p-2.5 text-center text-pink-300">{sumPlanOs}</td>
                            <td className="p-2.5 text-center text-blue-300">{sumPlanYt}</td>
                            <td className="p-2.5 text-right text-amber-300 border-r border-slate-800 bg-amber-950/60 font-mono">{sumPlanYo + sumPlanOm + sumPlanOs + sumPlanYt}</td>
                            <td className="p-2.5 text-center text-red-300">{sumRealYo}</td>
                            <td className="p-2.5 text-center text-amber-300">{sumRealOm}</td>
                            <td className="p-2.5 text-center text-pink-300">{sumRealOs}</td>
                            <td className="p-2.5 text-center text-blue-300">{sumRealYt}</td>
                            <td className="p-2.5 text-right text-emerald-300 bg-emerald-950/60 font-mono">{sumRealYo + sumRealOm + sumRealOs + sumRealYt}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>
        )}

        {/* TAB REALISASI POTENSI (PERTANGGAL) */}
        {activeTab === "realisasi_potensi" && (
          <>
            <YlRealisasiPotensiTab
              currentMonth={currentMonth}
              isEditRealisasi={isEditRealisasi}
              isRefreshing={isRefreshing}
              realisasiGridSelection={realisasiGridSelection}
              realisasiIsMenuOpen={realisasiIsMenuOpen}
              setRealisasiIsMenuOpen={setRealisasiIsMenuOpen}
              realisasiMenuPos={realisasiMenuPos}
              handleRealisasiGridCopy={handleRealisasiGridCopy}
              handleRealisasiGridCut={handleRealisasiGridCut}
              handleRealisasiGridPaste={handleRealisasiGridPaste}
              handleRealisasiGridClear={handleRealisasiGridClear}
              setRealisasiGridSelection={setRealisasiGridSelection}
              handleToggleEditRealisasi={handleToggleEditRealisasi}
              handleSaveEditRealisasi={handleSaveEditRealisasi}
              isSavingRealisasi={isSavingRealisasi}
              transactions={currentMonthTxs}
              editDataRealisasi={editDataRealisasi}
              setEditDataRealisasi={setEditDataRealisasi}
              ylBreakdownRealisasi={ylBreakdownRealisasi}
              getRealisasiCellProps={getRealisasiCellProps}
              renderRealisasiSelectionHandle={renderRealisasiSelectionHandle}
              selectRealisasiRow={selectRealisasiRow}
              activeCell={realisasiActiveCell}
              activeCellValue={realisasiActiveCellValue}
              isActiveCellEditable={isRealisasiActiveCellEditable}
              handleActiveCellValueChange={handleRealisasiActiveCellValueChange}
              goToNextCell={goToNextRealisasiCell}
              goToPrevCell={goToPrevRealisasiCell}
            />
            {clipboardModal && (
              <ClipboardFallbackModal
                mode={clipboardModal.mode}
                initialText={clipboardModal.text}
                onConfirmPaste={confirmManualPaste}
                onClose={closeClipboardModal}
              />
            )}
          </>
        )}
      
        {/* TAB POTENSI VS TEMBUS */}
        {activeTab === "seragam" && <YLSeragamView />}

        {/* PRODUCT KNOWLEDGE TAB */}
        {activeTab === "product_knowledge" && <ProductKnowledgeView />}
        {activeTab === "tautan" && <OfficialLinksViewer onBack={() => setActiveTab("beranda")} />}

        {/* TAB EVALUASI */}
        {activeTab === "evaluasi" && (
          <div className="space-y-4">
            <EvaluasiView
              evaluasiData={evaluasiData}
              globalMonth={globalMonth}
              currentYlName={ylName}
              currentYlArea={ylAreaCode || currentYlInfo.area || ylName.substring(0, 3).trim()}
              role="yl"
              transactions={transactions}
              ylBreakdownRealisasi={ylBreakdownRealisasi}
              selectedDate={selectedDate}
              onBack={() => setActiveTab("beranda")}
            />
          </div>
        )}

        {activeTab === "potensi_tembus" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4">
              <h2 className="text-sm sm:text-base font-black text-slate-900 border-l-4 border-indigo-600 pl-3">
                Potensi vs Tembus (Bulan Ini)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Sekolah */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h3 className="text-xs sm:text-sm font-black text-slate-800 border-b border-slate-200 pb-2">Sekolah</h3>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">Total Kunjungan</label>
                    <NumberInput min={0} value={potensiTembus.skhTotal} onChange={(val) => setPotensiTembus(prev => ({...prev, skhTotal: val}))} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-emerald-700">Total Tembus</label>
                    <NumberInput min={0} value={potensiTembus.skhTembus} onChange={(val) => setPotensiTembus(prev => ({...prev, skhTembus: val}))} className="w-full p-2.5 bg-white border border-emerald-300 rounded-lg text-sm font-bold text-emerald-800" />
                  </div>
                </div>
                {/* Kantor */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h3 className="text-xs sm:text-sm font-black text-slate-800 border-b border-slate-200 pb-2">Kantor</h3>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">Total Kunjungan</label>
                    <NumberInput min={0} value={potensiTembus.kntrTotal} onChange={(val) => setPotensiTembus(prev => ({...prev, kntrTotal: val}))} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-emerald-700">Total Tembus</label>
                    <NumberInput min={0} value={potensiTembus.kntrTembus} onChange={(val) => setPotensiTembus(prev => ({...prev, kntrTembus: val}))} className="w-full p-2.5 bg-white border border-emerald-300 rounded-lg text-sm font-bold text-emerald-800" />
                  </div>
                </div>
                {/* Toko */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h3 className="text-xs sm:text-sm font-black text-slate-800 border-b border-slate-200 pb-2">Toko</h3>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">Total Kunjungan</label>
                    <NumberInput min={0} value={potensiTembus.tkoTotal} onChange={(val) => setPotensiTembus(prev => ({...prev, tkoTotal: val}))} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm font-bold text-slate-800" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-emerald-700">Total Tembus</label>
                    <NumberInput min={0} value={potensiTembus.tkoTembus} onChange={(val) => setPotensiTembus(prev => ({...prev, tkoTembus: val}))} className="w-full p-2.5 bg-white border border-emerald-300 rounded-lg text-sm font-bold text-emerald-800" />
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={handleSavePotensiTembus}
                  disabled={isPotensiTembusSaving}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm py-3.5 rounded-xl transition-all disabled:opacity-50"
                >
                  {isPotensiTembusSaving ? "Menyimpan..." : "💾 Simpan Potensi vs Tembus"}
                </button>
                {potensiTembusMsg && (
                  <p className={`mt-2 text-xs font-bold text-center ${potensiTembusMsg.includes('Error') || potensiTembusMsg.includes('Gagal') ? 'text-red-600' : 'text-emerald-600'}`}>
                    {potensiTembusMsg}
                  </p>
                )}

              </div>
            </div>
          </div>
        )}

      {/* Modal Konfirmasi Mismatch Acuan */}
      {mismatchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-slide-up border border-slate-200">
            <div className="p-4 bg-amber-50 border-b border-amber-100 flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="font-black text-slate-800">Peringatan: Data Tidak Cocok</h3>
                <p className="text-[10px] sm:text-xs text-slate-600 font-medium mt-1">
                  Data realisasi tidak sama dengan acuan.
                </p>
              </div>
            </div>
            <div className="p-4">
              <p className="text-xs text-slate-700 whitespace-pre-wrap font-mono bg-slate-50 p-2 rounded-lg border border-slate-200 max-h-32 overflow-y-auto">
                {mismatchConfirm.detail}
              </p>
              <p className="text-xs text-slate-700 font-bold mt-4 text-center">
                Apakah Anda ingin tetap menyimpan data ini?
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
              <button 
                onClick={() => setMismatchConfirm(null)} 
                className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50"
              >
                Batal
              </button>
              <button 
                onClick={() => {
                  if (mismatchConfirm.type === 'edit') executeSaveEditRealisasi();
                  else executeSaveInputHarian();
                  setMismatchConfirm(null);
                }} 
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-sm"
              >
                Tetap Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      </main>
    </div>
  );
}