import { MenuTitleIcon } from "./AppSidebar";
import React, { useEffect, useMemo, useState, useRef } from "react";
import { BarChart3, TrendingUp, Calendar, AlertTriangle, ThumbsUp, ThumbsDown, Users, Package, MapPin, ChevronLeft, ChevronRight, Loader2, Sparkles, Maximize2, Minimize2, X, Trophy, Play, RotateCcw, Check, Printer, RefreshCw, Layers, Plus, Trash2, CheckSquare, Square, Share2, ArrowUpDown, ShieldAlert, Activity, ArrowUpRight, ArrowDownRight, ArrowRight as ArrowRightIcon, PieChart as PieChartIcon, Target, Camera, Award, Search, BookOpen, HelpCircle, Image as ImageIcon, Upload, Eye, EyeOff, HeartHandshake, Palette, Menu, Download, ChevronUp, ChevronDown, Settings2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell, LabelList, AreaChart, Area
} from "recharts";
import { loadFromSupabase, saveToSupabase, deleteFromSupabase } from "../lib/supabaseClient";
import { cleanYlName } from "../types";
import { SEED_DATA_2026 } from "./SalesRecordTKU";
import { applyTahunLaluFallback, get2025FullYearAveragePerYL } from "../lib/historicalArchiveLookup";
import { downloadBlob } from "../utils/fileDownloader";
import { formatTruncated, bbColorClass } from "../utils/numberFormat";

// ----------------------------------------------------------------------------
// Konstanta & helper
// ----------------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"];
const MONTH_LABELS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// Warna sektor untuk Slide 8
const SECTOR_COLORS = {
  rumah: "#3B82F6",   // Biru
  pasar: "#F59E0B",   // Kuning
  sekolah: "#10B981", // Hijau
  kantor: "#8B5CF6",  // Ungu
  toko: "#EC4899",    // Pink
  ib: "#EF4444"       // Merah
};

const PRODUCT_COLORS: Record<string, string> = { YO: "#dc2626", OM: "#eab308", OS: "#ec4899", YT: "#2563eb" };

// Resolver warna sektor yang toleran terhadap variasi penulisan key dari sumber data
// (arsip bulanan bisa memakai key singkat "rmh"/"psr"/dst, sedangkan SECTOR_COLORS memakai
// key panjang "rumah"/"pasar"/dst — pencarian langsung SECTOR_COLORS[sec.key] gagal cocok
// utk 5 dari 6 sektor & selalu jatuh ke default biru). Dicocokkan via key ATAU label,
// dan kalau tetap tidak kenal, fallback ke urutan posisi standar (Rumah/Pasar/Sekolah/Kantor/Toko/IB).
const SECTOR_COLOR_ORDER = [
  SECTOR_COLORS.rumah, SECTOR_COLORS.pasar, SECTOR_COLORS.sekolah,
  SECTOR_COLORS.kantor, SECTOR_COLORS.toko, SECTOR_COLORS.ib,
];
function resolveSectorColor(rawKey: unknown, rawLabel: unknown, idx: number): string {
  const norm = (s: unknown) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
  const k = norm(rawKey);
  const l = norm(rawLabel);
  const hit = (needle: string) => k === needle || k.includes(needle) || l.includes(needle);
  if (hit("rumah") || k === "rmh") return SECTOR_COLORS.rumah;
  if (hit("pasar") || k === "psr") return SECTOR_COLORS.pasar;
  if (hit("sekolah") || k === "skh") return SECTOR_COLORS.sekolah;
  if (hit("kantor") || k === "ktr") return SECTOR_COLORS.kantor;
  if (hit("toko") || k === "tk") return SECTOR_COLORS.toko;
  if (hit("instant") || hit("ib") || k === "ib") return SECTOR_COLORS.ib;
  return SECTOR_COLOR_ORDER[idx % SECTOR_COLOR_ORDER.length] || "#3b82f6";
}

export const PRODUCT_LABELS: Record<string, { code: string; shortName: string; fullName: string; color: string }> = {
  YO: { code: "YO", shortName: "Original", fullName: "Original (YO)", color: "#dc2626" },
  OM: { code: "OM", shortName: "Original Mangga", fullName: "Original Mangga (OM)", color: "#eab308" },
  OS: { code: "OS", shortName: "Original Stroberi", fullName: "Original Stroberi (OS)", color: "#ec4899" },
  YT: { code: "YT", shortName: "Yakult Light", fullName: "Yakult Light (YT)", color: "#2563eb" },
};

const KONDISI_COLORS = ["#94a3b8", "#f87171", "#fb923c", "#facc15", "#a3e635", "#34d399", "#10b981"];

type Periode = "bulanan" | "s1" | "s2" | "tahunan";

export function getOtmTitleByPeriode(periode: Periode): string {
  if (periode === "s1" || periode === "s2") return "Yakult Lady of the Semester";
  if (periode === "tahunan") return "Yakult Lady of the Year";
  return "Yakult Lady of the Month";
}

export interface ActionPlanItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return Math.trunc(n).toLocaleString("id-ID");
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return formatTruncated(n, digits, false);
}

function pctBadgeClasses(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || isNaN(pct)) return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  return pct >= 100
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
}

function average(nums: number[]): number | null {
  const valid = nums.filter((n) => typeof n === "number" && !isNaN(n));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function sum(nums: (number | null | undefined)[]): number {
  return nums.reduce((a: number, b) => a + (typeof b === "number" && !isNaN(b) ? b : 0), 0 as number);
}

// ----------------------------------------------------------------------------
// Action Plan Persistence Hook
// ----------------------------------------------------------------------------

function useActionPlan(selectedYear: string, periode: Periode, monthIndex: number) {
  const key = `presentasi_action_plan_${selectedYear}_${periode}_${periode === "bulanan" ? monthIndex : "all"}`;
  const [items, setItems] = useState<ActionPlanItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const local = localStorage.getItem(key);
        if (local) {
          if (!cancelled) setItems(JSON.parse(local));
        } else {
          const remote = await loadFromSupabase<ActionPlanItem[]>(key);
          if (!cancelled) setItems(remote || []);
        }
      } catch (e) {
        console.error("Gagal memuat Action Plan:", e);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  const persist = (updated: ActionPlanItem[]) => {
    setItems(updated);
    try {
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    saveToSupabase(key, updated).catch((e) => console.error("Gagal menyinkronkan Action Plan ke Supabase:", e));
  };

  const addItem = (text: string) => {
    if (!text.trim()) return;
    const newItem: ActionPlanItem = {
      id: String(Date.now()),
      text: text.trim(),
      done: false,
      createdAt: new Date().toISOString(),
    };
    persist([...items, newItem]);
  };

  const toggleItem = (id: string) => {
    persist(items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
  };

  const deleteItem = (id: string) => {
    persist(items.filter((it) => it.id !== id));
  };

  return { items, addItem, toggleItem, deleteItem, loading };
}

// ----------------------------------------------------------------------------
// Pengumpulan Sampah Terbanyak — Persistence Hook (input manual per bulan)
// ----------------------------------------------------------------------------

export interface SampahTerbanyakRecord {
  nama: string;
  area: string;
  jumlah: string;
}

const EMPTY_SAMPAH: SampahTerbanyakRecord = { nama: "", area: "", jumlah: "" };

function useSampahTerbanyak(selectedYear: string, periode: Periode, monthIndex: number) {
  const key = `presentasi_sampah_terbanyak_${selectedYear}_${periode}_${periode === "bulanan" ? monthIndex : "all"}`;
  const [record, setRecord] = useState<SampahTerbanyakRecord>(EMPTY_SAMPAH);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const local = localStorage.getItem(key);
        if (local) {
          if (!cancelled) setRecord(JSON.parse(local));
        } else {
          const remote = await loadFromSupabase<SampahTerbanyakRecord>(key);
          if (!cancelled) setRecord(remote || EMPTY_SAMPAH);
        }
      } catch (e) {
        console.error("Gagal memuat data Sampah Terbanyak:", e);
        if (!cancelled) setRecord(EMPTY_SAMPAH);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  const updateRecord = (patch: Partial<SampahTerbanyakRecord>) => {
    const updated = { ...record, ...patch };
    setRecord(updated);
    try {
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    saveToSupabase(key, updated).catch((e) => console.error("Gagal menyinkronkan Sampah Terbanyak ke Supabase:", e));
  };

  return { record, updateRecord, loading };
}

// ----------------------------------------------------------------------------
// Urutan & Visibilitas Slide (khusus Laporan Bulanan) — Persistence Hook
// ----------------------------------------------------------------------------

export const BULANAN_SLIDE_DEFS: { id: string; label: string }[] = [
  { id: "cover", label: "Laporan Bulanan (Cover)" },
  { id: "pencapaian", label: "Hasil Pencapaian Tim" },
  { id: "evaluasi10yl", label: "Evaluasi Seluruh 10 YL" },
  { id: "distribusi", label: "Distribusi Penjualan Tim" },
  { id: "karakteristik", label: "Analisis Karakteristik Pelanggan" },
  { id: "mixproduk", label: "Evaluasi Mix Produk" },
  { id: "apresiasi", label: "Apresiasi Performa" },
  { id: "ytd", label: "Rata-Rata YTD per YL" },
  { id: "analisa", label: "Analisa Data Pencapaian" },
  { id: "kesimpulan", label: "Kesimpulan" },
];

export interface SlideOrderItem {
  id: string;
  visible: boolean;
}

const DEFAULT_SLIDE_ORDER: SlideOrderItem[] = BULANAN_SLIDE_DEFS.map((d) => ({ id: d.id, visible: true }));

// Gabungkan config tersimpan dengan daftar default terbaru — jaga-jaga kalau ada slide
// baru yang belum tercatat di config lama, atau ada slide lama yang sudah dihapus dari kode.
function mergeSlideOrder(saved: SlideOrderItem[]): SlideOrderItem[] {
  const validIds = new Set(BULANAN_SLIDE_DEFS.map((d) => d.id));
  const savedIds = new Set(saved.map((s) => s.id));
  const merged = saved.filter((s) => validIds.has(s.id));
  BULANAN_SLIDE_DEFS.forEach((d) => {
    if (!savedIds.has(d.id)) merged.push({ id: d.id, visible: true });
  });
  return merged;
}

function useSlideOrderConfig() {
  const key = "presentasi_slide_order_bulanan_v1";
  const [order, setOrder] = useState<SlideOrderItem[]>(DEFAULT_SLIDE_ORDER);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const local = localStorage.getItem(key);
        if (local) {
          if (!cancelled) setOrder(mergeSlideOrder(JSON.parse(local)));
        } else {
          const remote = await loadFromSupabase<SlideOrderItem[]>(key);
          if (!cancelled) setOrder(remote ? mergeSlideOrder(remote) : DEFAULT_SLIDE_ORDER);
        }
      } catch (e) {
        console.error("Gagal memuat urutan slide:", e);
        if (!cancelled) setOrder(DEFAULT_SLIDE_ORDER);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = (updated: SlideOrderItem[]) => {
    setOrder(updated);
    try {
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    saveToSupabase(key, updated).catch((e) => console.error("Gagal menyinkronkan urutan slide ke Supabase:", e));
  };

  const moveUp = (id: string) => {
    const idx = order.findIndex((o) => o.id === id);
    if (idx <= 0) return;
    const updated = [...order];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    persist(updated);
  };

  const moveDown = (id: string) => {
    const idx = order.findIndex((o) => o.id === id);
    if (idx === -1 || idx >= order.length - 1) return;
    const updated = [...order];
    [updated[idx + 1], updated[idx]] = [updated[idx], updated[idx + 1]];
    persist(updated);
  };

  const toggleVisible = (id: string) => {
    persist(order.map((o) => (o.id === id ? { ...o, visible: !o.visible } : o)));
  };

  const resetOrder = () => {
    persist(DEFAULT_SLIDE_ORDER);
  };

  return { order, moveUp, moveDown, toggleVisible, resetOrder, loading };
}

// ----------------------------------------------------------------------------
// Yakult Lady of the Month — Persistence Hook
// ----------------------------------------------------------------------------

export interface YlOtmRecord {
  area: string;
  nama: string;
  category: string;
  categoryLabel: string;
  valueLabel: string;
  foto: string;
  updatedAt: string;
}

function useYlOfTheMonth(storageKey: string) {
  const [record, setRecord] = useState<YlOtmRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const local = localStorage.getItem(storageKey);
        if (local) {
          if (!cancelled) setRecord(JSON.parse(local));
        } else {
          const remote = await loadFromSupabase<YlOtmRecord>(storageKey);
          if (!cancelled) setRecord(remote || null);
        }
      } catch (e) {
        console.error("Gagal memuat data Yakult Lady of the Month:", e);
        if (!cancelled) setRecord(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storageKey]);

  const save = async (rec: YlOtmRecord) => {
    setRecord(rec);
    try {
      localStorage.setItem(storageKey, JSON.stringify(rec));
    } catch (e) {
      console.error(e);
    }
    try {
      await saveToSupabase(storageKey, rec);
    } catch (e) {
      console.error("Gagal menyinkronkan Yakult Lady of the Month ke Supabase:", e);
    }
  };

  const clear = async () => {
    setRecord(null);
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.error(e);
    }
    try {
      await deleteFromSupabase(storageKey);
    } catch (e) {
      console.error("Gagal menghapus Yakult Lady of the Month dari Supabase:", e);
    }
  };

  return { record, loading, save, clear };
}

// ----------------------------------------------------------------------------
// Custom Slide Hook & Photo Resizer (Slide Tambahan Foto / Lampiran Data)
// ----------------------------------------------------------------------------

export interface CustomSlideRecord {
  enabled: boolean;
  title: string;
  subtitle?: string;
  foto?: string;
  fotoName?: string;
  catatan?: string;
  updatedAt?: string;
}

// Foto base64 tidak disimpan di localStorage (membengkakkan memori browser & kuota 5MB).
// localStorage hanya menyimpan metadata; foto disimpan di Supabase + state React.
function stripFoto<T extends { foto?: string }>(rec: T): T {
  return { ...rec, foto: "" };
}

function resizeCustomSlidePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 900;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_DIM) {
            height *= MAX_DIM / width;
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width *= MAX_DIM / height;
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function useCustomSlide(storageKey: string) {
  const [record, setRecord] = useState<CustomSlideRecord>({
    enabled: false,
    title: "Data Tambahan & Lampiran Dokumentasi",
    subtitle: "",
    foto: "",
    fotoName: "",
    catatan: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const local = localStorage.getItem(storageKey);
        const localRec: CustomSlideRecord | null = local ? JSON.parse(local) : null;
        if (localRec && localRec.foto) {
          // Migrasi data lama: foto besar masih di localStorage -> pindahkan ke Supabase, bersihkan localStorage
          if (!cancelled) setRecord(localRec);
          try {
            const res = await saveToSupabase(storageKey, localRec);
            // Hanya bersihkan localStorage kalau foto sudah aman di Supabase
            if (res?.success) localStorage.setItem(storageKey, JSON.stringify(stripFoto(localRec)));
          } catch (e) {
            console.error("Migrasi foto slide kustom ke Supabase gagal, data lama dibiarkan:", e);
          }
        } else if (localRec) {
          // Metadata lokal tanpa foto: tampilkan dulu, lalu ambil foto dari Supabase
          if (!cancelled) setRecord(localRec);
          if (localRec.enabled || localRec.fotoName) {
            const remote = await loadFromSupabase<CustomSlideRecord>(storageKey);
            if (!cancelled && remote?.foto) setRecord({ ...localRec, foto: remote.foto, fotoName: localRec.fotoName || remote.fotoName });
          }
        } else {
          const remote = await loadFromSupabase<CustomSlideRecord>(storageKey);
          if (!cancelled && remote) setRecord(remote);
        }
      } catch (e) {
        console.error("Gagal memuat data slide kustom:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storageKey]);

  const save = async (rec: CustomSlideRecord) => {
    const payload = { ...rec, updatedAt: new Date().toISOString() };
    setRecord(payload);
    try {
      localStorage.setItem(storageKey, JSON.stringify(stripFoto(payload)));
    } catch (e) {
      console.error(e);
    }
    try {
      await saveToSupabase(storageKey, payload);
    } catch (e) {
      console.error("Gagal menyinkronkan data slide kustom ke Supabase:", e);
    }
  };

  const clear = async () => {
    const emptyRec: CustomSlideRecord = {
      enabled: false,
      title: "Data Tambahan & Lampiran Dokumentasi",
      subtitle: "",
      foto: "",
      fotoName: "",
      catatan: "",
    };
    setRecord(emptyRec);
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.error(e);
    }
    try {
      await deleteFromSupabase(storageKey);
    } catch (e) {
      console.error("Gagal menghapus data slide kustom dari Supabase:", e);
    }
  };

  const toggleEnabled = async () => {
    await save({ ...record, enabled: !record.enabled });
  };

  const uploadPhoto = async (file: File) => {
    const b64 = await resizeCustomSlidePhoto(file);
    await save({ ...record, enabled: true, foto: b64, fotoName: file.name });
  };

  const removePhoto = async () => {
    await save({ ...record, foto: "", fotoName: "" });
  };

  return {
    record,
    loading,
    save,
    clear,
    reset: clear,
    toggleEnabled,
    uploadPhoto,
    removePhoto,
  };
}

// ----------------------------------------------------------------------------
// Per-YL Cumulative / Period Averages Computation
// ----------------------------------------------------------------------------

export interface YLAverageRow {
  no: number;
  area: string;
  nama: string;
  monthlyValues: { monthKey: string; monthLabel: string; value: number | null }[];
  validCount: number;
  total: number;
  rataRata: number;
  isMandiri: boolean;
  firstVal: number | null;
  lastVal: number | null;
  delta: number;
  trend: "up" | "down" | "flat";
  needsCoaching: boolean;
}

export function computeYLAverageData(
  perYL: any[],
  startIdx: number,
  endIdx: number
) {
  const monthIndices: number[] = [];
  for (let i = startIdx; i <= endIdx && i < 12; i++) {
    monthIndices.push(i);
  }

  const map2025 = typeof window !== "undefined" ? get2025FullYearAveragePerYL() : {};

  const rows: YLAverageRow[] = (perYL || []).map((yl, index) => {
    const areaStr = String(yl.area || 201 + index);
    const monthlyValues = monthIndices.map((i) => {
      const k = MONTHS[i];
      const raw = yl.penjualan?.[k];
      const val = typeof raw === "number" && !isNaN(raw) ? raw : null;
      return {
        monthKey: k,
        monthLabel: MONTH_SHORT[i],
        value: val,
      };
    });

    const validVals = monthlyValues
      .filter((m) => m.value !== null && m.value !== undefined && !isNaN(m.value as number))
      .map((m) => m.value as number);
    const total = validVals.reduce((a, b) => a + b, 0);
    const validCount = validVals.length;
    const rataRata = validCount > 0 ? Math.round(total / validCount) : 0;

    const firstVal = validVals.length > 0 ? validVals[0] : null;
    const lastVal = validVals.length > 0 ? validVals[validVals.length - 1] : null;

    // Utamakan pembandingan Rata-Rata YTD tahun ini vs Rata-Rata Tahun Lalu (2025)
    const prevYearAvg = typeof yl.tahunLaluYL === "number" && yl.tahunLaluYL > 0
      ? yl.tahunLaluYL
      : typeof yl.thn_lalu === "number" && yl.thn_lalu > 0
      ? yl.thn_lalu
      : map2025[areaStr] || null;

    const rawDelta = prevYearAvg !== null
      ? rataRata - prevYearAvg
      : (firstVal !== null && lastVal !== null && validVals.length >= 2) ? lastVal - firstVal : 0;

    const delta = Number(rawDelta.toFixed(1));
    const trend: "up" | "down" | "flat" = delta >= 10 ? "up" : delta <= -10 ? "down" : "flat";
    const needsCoaching = trend === "down" || rataRata < 250;

    return {
      no: yl.no || index + 1,
      area: String(yl.area || 201 + index),
      nama: cleanYlName(yl.nama || `YL Area ${yl.area}`),
      monthlyValues,
      validCount,
      total,
      rataRata,
      isMandiri: rataRata >= 250,
      firstVal,
      lastVal,
      delta,
      trend,
      needsCoaching,
    };
  });

  rows.sort((a, b) => b.rataRata - a.rataRata);

  const teamMonthlyAvgs = monthIndices.map((i) => {
    const k = MONTHS[i];
    const colVals = (perYL || [])
      .map((yl) => yl.penjualan?.[k])
      .filter((v) => typeof v === "number" && !isNaN(v) && v > 0);
    const avg = colVals.length > 0 ? Math.round(colVals.reduce((a, b) => a + b, 0) / colVals.length) : 0;
    return {
      monthKey: k,
      monthLabel: MONTH_SHORT[i],
      avg,
    };
  });

  const allAvgs = rows.map((r) => r.rataRata).filter((a) => a > 0);
  const teamOverallAvg = allAvgs.length > 0 ? Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) : 0;
  const totalMandiri = rows.filter((r) => r.isMandiri).length;
  const totalBinaan = rows.length - totalMandiri;
  const totalUp = rows.filter((r) => r.trend === "up").length;
  const totalDown = rows.filter((r) => r.trend === "down").length;
  const totalCoaching = rows.filter((r) => r.needsCoaching).length;

  return {
    rows,
    monthIndices,
    teamMonthlyAvgs,
    teamOverallAvg,
    totalMandiri,
    totalBinaan,
    totalUp,
    totalDown,
    totalCoaching,
  };
}

// ----------------------------------------------------------------------------
// Evaluasi Dampak Absensi & Potensi Botol Hilang (Loss Potential)
// ----------------------------------------------------------------------------

export interface LossPotentialResult {
  totalFrekuensiAbsen: number;
  totalYLAbsen: number;
  avgSalesPerYL: number;
  potensiBotolHilang: number;
  potensiPakHilang: number;
  estimasiRupiah: number;
  totalPenjualan: number;
  lossPct: number;
  hasAbsen: boolean;
}

export function computeLossPotential(months: any[]): LossPotentialResult {
  const validMonths = (months || []).filter(Boolean);
  const totalFrekuensiAbsen = sum(validMonths.map((m) => m?.absen?.frekuensi || 0));
  const totalYLAbsen = sum(validMonths.map((m) => m?.absen?.jumlahYL || 0));
  const salesList = validMonths
    .map((m) => m?.salesPerYL || m?.ratarataPenjualanYL || (m?.akmPenjualan && m?.jwp ? Math.round(m.akmPenjualan / (m.jwp * 10)) : 0))
    .filter((v) => v > 0);
  const avgSalesPerYL = average(salesList) || 320;
  const potensiBotolHilang = Math.round(totalFrekuensiAbsen * avgSalesPerYL);
  const potensiPakHilang = Math.round(potensiBotolHilang / 5);
  const estimasiRupiah = potensiBotolHilang * 2000;
  const totalPenjualan = sum(validMonths.map((m) => m?.akmPenjualan || 0));
  const lossPct = totalPenjualan > 0 ? (potensiBotolHilang / (totalPenjualan + potensiBotolHilang)) * 100 : 0;

  return {
    totalFrekuensiAbsen,
    totalYLAbsen,
    avgSalesPerYL: Math.round(avgSalesPerYL),
    potensiBotolHilang,
    potensiPakHilang,
    estimasiRupiah,
    totalPenjualan,
    lossPct,
    hasAbsen: totalFrekuensiAbsen > 0,
  };
}

// ----------------------------------------------------------------------------
// Evaluasi Rasio Mix Produk & Penetrasi Varian Baru
// ----------------------------------------------------------------------------

export interface MixProductResult {
  yo: number;
  om: number;
  os: number;
  yt: number;
  total: number;
  pctYO: number;
  pctOM: number;
  pctOS: number;
  pctYT: number;
  pctVarianBaru: number;
  statusKesehatan: "sangat_sehat" | "sehat" | "waspada" | "kritis";
  statusLabel: string;
  chartData: { name: string; value: number; color: string; pct: number }[];
}

export function computeMixProductAnalysis(months: any[]): MixProductResult {
  const validMonths = (months || []).filter(Boolean);
  const yo = sum(validMonths.map((m) => m?.ratarataYO || 0));
  const om = sum(validMonths.map((m) => m?.ratarataOM || 0));
  const os = sum(validMonths.map((m) => m?.ratarataOS || 0));
  const yt = sum(validMonths.map((m) => m?.ratarataYT || 0));
  const total = yo + om + os + yt;

  const pctYO = total > 0 ? (yo / total) * 100 : 0;
  const pctOM = total > 0 ? (om / total) * 100 : 0;
  const pctOS = total > 0 ? (os / total) * 100 : 0;
  const pctYT = total > 0 ? (yt / total) * 100 : 0;
  const pctVarianBaru = total > 0 ? ((total - yo) / total) * 100 : 0;

  let statusKesehatan: "sangat_sehat" | "sehat" | "waspada" | "kritis" = "sehat";
  let statusLabel = "Optimal (Target Varian ≥15% Tercapai)";
  if (pctVarianBaru >= 20) {
    statusKesehatan = "sangat_sehat";
    statusLabel = "Sangat Sehat (Penetrasi Varian Tinggi ≥20%)";
  } else if (pctVarianBaru >= 15) {
    statusKesehatan = "sehat";
    statusLabel = "Optimal (Target Varian ≥15% Tercapai)";
  } else if (pctVarianBaru >= 8) {
    statusKesehatan = "waspada";
    statusLabel = "Perlu Dorongan (Dominan Yakult Reguler)";
  } else {
    statusKesehatan = "kritis";
    statusLabel = "Ketergantungan Ekstrem pada Original (<8%)";
  }

  const chartData = [
    { name: "Original (YO)", value: yo, color: PRODUCT_COLORS.YO || "#dc2626", pct: pctYO },
    { name: "Original Mangga (OM)", value: om, color: PRODUCT_COLORS.OM || "#eab308", pct: pctOM },
    { name: "Original Stroberi (OS)", value: os, color: PRODUCT_COLORS.OS || "#ec4899", pct: pctOS },
    { name: "Yakult Light (YT)", value: yt, color: PRODUCT_COLORS.YT || "#2563eb", pct: pctYT },
  ].filter((p) => p.value > 0);

  return {
    yo,
    om,
    os,
    yt,
    total,
    pctYO,
    pctOM,
    pctOS,
    pctYT,
    pctVarianBaru,
    statusKesehatan,
    statusLabel,
    chartData,
  };
}

// ----------------------------------------------------------------------------
// Uji Beban Target & Kapasitas Fisik YL
// ----------------------------------------------------------------------------

export interface BebanKapasitasResult {
  targetSisa: number;
  monthsRemaining: number;
  daysRemaining: number;
  jumlahYL: number;
  bebanTotalHarian: number;
  bebanPerYLHarian: number;
  statusBeban: "aman" | "tinggi" | "overcapacity";
  statusLabel: string;
}

export function computeBebanKapasitas(
  targetSisa: number,
  monthsRemaining: number,
  jumlahYL = 10
): BebanKapasitasResult {
  const effectiveMonths = Math.max(1, monthsRemaining);
  const daysRemaining = effectiveMonths * 25;
  const bebanTotalHarian = Math.round(targetSisa / daysRemaining);
  const bebanPerYLHarian = Math.round(bebanTotalHarian / Math.max(1, jumlahYL));

  let statusBeban: "aman" | "tinggi" | "overcapacity" = "aman";
  let statusLabel = "Kapasitas Normal (Realistis Dicapai)";
  if (bebanPerYLHarian > 370) {
    statusBeban = "overcapacity";
    statusLabel = "Beban Kritis / Overcapacity (>370 btl/hari/YL)";
  } else if (bebanPerYLHarian > 320) {
    statusBeban = "tinggi";
    statusLabel = "Tantangan Tinggi (Perlu Disiplin & Efisiensi Maksimal)";
  }

  return {
    targetSisa,
    monthsRemaining: effectiveMonths,
    daysRemaining,
    jumlahYL,
    bebanTotalHarian,
    bebanPerYLHarian,
    statusBeban,
    statusLabel,
  };
}

// ----------------------------------------------------------------------------
// WhatsApp Executive Summary Generator
// ----------------------------------------------------------------------------

function generateWhatsAppSummary({
  periode,
  selectedYear,
  monthIndex,
  data,
  actionPlans,
}: {
  periode: Periode;
  selectedYear: string;
  monthIndex: number;
  data: any;
  actionPlans: ActionPlanItem[];
}): string {
  const tku = data?.tku || "DP JEMBER 1";
  const bulanan = data?.bulanan || {};
  const perYL = data?.perYL || [];

  if (periode === "bulanan") {
    const m = applyTahunLaluFallback(bulanan[MONTHS[monthIndex]], selectedYear, monthIndex);
    const monthLabel = MONTH_LABELS[monthIndex];
    if (!m) return `📊 LAPORAN ${tku} - ${monthLabel} ${selectedYear}\n(Data belum tersedia)`;

    const ylRanked = [...perYL]
      .map((yl) => ({
        area: yl.area,
        nama: cleanYlName(yl.nama || ""),
        penjualan: yl.penjualan?.[MONTHS[monthIndex]] ?? null,
      }))
      .filter((r) => r.penjualan !== null && r.penjualan !== undefined)
      .sort((a, b) => (b.penjualan || 0) - (a.penjualan || 0));

    const top3 = ylRanked.slice(0, 3);
    const prevIdx = monthIndex - 1;
    const prevM = prevIdx >= 0 ? bulanan[MONTHS[prevIdx]] : null;
    const vsBulanLaluPct = prevM && prevM.akmPenjualan ? (m.akmPenjualan / prevM.akmPenjualan) * 100 : null;

    let text = `📊 *LAPORAN EVALUASI PERFORMA ${tku}*\n`;
    text += `📅 *Periode:* ${monthLabel} ${selectedYear}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `🎯 *PENJUALAN & TARGET*\n`;
    text += `• AKM Realisasi: *${fmtNum(m.akmPenjualan)} botol*\n`;
    text += `• Target: ${fmtNum(m.akmTarget)} botol\n`;
    text += `• Capaian Target: *${fmtPct(m.persenCapaian)}%* ${(m.persenCapaian || 0) >= 100 ? "✅ (TEMBUS)" : "⚠️ (BELUM TEMBUS)"}\n`;
    text += `• Rata-rata Tim: ${fmtNum(m.ratarataPenjualanYL)} btl/hari\n`;
    if (vsBulanLaluPct !== null) {
      text += `• vs Bulan Lalu: ${fmtPct(vsBulanLaluPct)}%\n`;
    }
    text += `• S/YL (Sales per YL): ${fmtNum(m.salesPerYL)} btl/hari\n\n`;

    text += `🔄 *KESEGARAN PRODUK & KEDISIPLINAN*\n`;
    const bbStatus = (m.persenKembaliBotol || 0) <= 10 ? "✅ Aman (≤10%)" : "🚨 Waspada (>10%)";
    text += `• Balik Botol (BB): *${fmtPct(m.persenKembaliBotol)}%* (${fmtNum(m.akmKembaliBotol)} btl) — ${bbStatus}\n`;
    text += `• Ketidakhadiran: ${m.absen?.jumlahYL || 0} YL (${m.absen?.frekuensi || 0}x izin/sakit)\n`;
    const lossRes = computeLossPotential([m]);
    if (lossRes.hasAbsen) {
      text += `  ⚠️ *Botol Terlewatkan (Absensi):* ~${fmtNum(lossRes.potensiBotolHilang)} btl (~${fmtNum(lossRes.potensiPakHilang)} pack)\n`;
    }
    text += `• JWP (Hari Kerja): ${fmtNum(m.jwp)} hari\n\n`;

    const mixRes = computeMixProductAnalysis([m]);
    if (mixRes.total > 0) {
      text += `📦 *MIX PRODUK & PENETRASI VARIAN*\n`;
      text += `• Original (YO): ${fmtPct(mixRes.pctYO)}%\n`;
      text += `• Varian Baru (OM/OS/YT): *${fmtPct(mixRes.pctVarianBaru)}%* (${mixRes.statusLabel})\n\n`;
    }

    if (top3.length > 0) {
      text += `🏆 *TOP 3 YAKULT LADY (BULAN INI)*\n`;
      top3.forEach((yl, idx) => {
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
        text += `${medal} *${yl.nama}* (Area ${yl.area}): ${fmtNum(yl.penjualan)} btl\n`;
      });
      text += `\n`;
    }

    if (monthIndex > 0) {
      const ytdStats = computeYLAverageData(perYL, 0, monthIndex);
      if (ytdStats.rows.length > 0) {
        text += `📈 *RATA-RATA KUMULATIF (Jan s/d ${MONTH_SHORT[monthIndex]}):*\n`;
        text += `• Rata-rata Tim: *${fmtNum(ytdStats.teamOverallAvg)} btl/hr*\n`;
        text += `• Status Tim: ${ytdStats.totalMandiri} YL Mandiri, ${ytdStats.totalBinaan} YL Binaan\n`;
        text += `• Top 3 YTD:\n`;
        ytdStats.rows.slice(0, 3).forEach((yl, idx) => {
          const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
          text += `  ${medal} *${yl.nama}* (${yl.area}): ${fmtNum(yl.rataRata)} btl/hr\n`;
        });
        text += `\n`;
      }
    }

    const plusList = (m.evaluasiPlus || []).filter((s: string) => s.trim());
    const minusList = (m.evaluasiMinus || []).filter((s: string) => s.trim());

    if (plusList.length > 0 || minusList.length > 0) {
      text += `📝 *EVALUASI OPERASIONAL*\n`;
      if (plusList.length > 0) {
        text += `*Kelebihan:*\n`;
        plusList.slice(0, 3).forEach((s: string) => { text += `  + ${s}\n`; });
      }
      if (minusList.length > 0) {
        text += `*Kekurangan / Perbaikan:*\n`;
        minusList.slice(0, 3).forEach((s: string) => { text += `  - ${s}\n`; });
      }
      text += `\n`;
    }

    if (actionPlans.length > 0) {
      text += `🎯 *RENCANA AKSI & KOMITMEN RAPAT:*\n`;
      actionPlans.forEach((it, idx) => {
        text += `${idx + 1}. [${it.done ? "SELESAI" : "TODO"}] ${it.text}\n`;
      });
      text += `\n`;
    }

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_Sistem Monitoring & Evaluasi ${tku}_ 🙏`;
    return text;
  }

  if (periode === "s1" || periode === "s2") {
    const isS1 = periode === "s1";
    const title = isS1 ? "Semester 1 (Januari – Juni)" : "Semester 2 (Juli – Desember)";
    const agg = computeSemesterAgg(bulanan, isS1 ? 0 : 6, isS1 ? 5 : 11, selectedYear);

    let text = `📊 *LAPORAN EVALUASI PERFORMA ${tku}*\n`;
    text += `📅 *Periode:* ${title} ${selectedYear}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `🎯 *RINGKASAN PERFORMA SEMESTER*\n`;
    text += `• AKM Penjualan: *${fmtNum(agg.totalAkm)} botol*\n`;
    text += `• Rata-rata Capaian Target: *${fmtPct(agg.avgCapaian)}%*\n`;
    text += `• Rata-rata Balik Botol (BB): *${fmtPct(agg.avgRetur)}%*\n`;
    if (agg.peak) {
      text += `• Puncak Penjualan: ${agg.peak.label} (${fmtNum(agg.peak.value)} btl)\n`;
    }
    text += `• SDM: Rekrut ${fmtNum(agg.ylBaru)} YL Baru, Resign ${fmtNum(agg.ylResign)} YL\n\n`;

    const semYl = isS1
      ? computeYLAverageData(perYL, 0, 5)
      : computeYLAverageData(perYL, 0, 11);

    if (semYl.rows.length > 0) {
      text += `🏆 *RATA-RATA PER YL (${isS1 ? "Januari s/d Juni" : "Januari s/d Terakhir"}):*\n`;
      text += `• Rata-rata Tim: *${fmtNum(semYl.teamOverallAvg)} btl/hari*\n`;
      text += `• Status: ${semYl.totalMandiri} YL Mandiri (≥250 btl), ${semYl.totalBinaan} YL Binaan\n`;
      text += `• Peringkat Seluruh YL:\n`;
      semYl.rows.forEach((yl, idx) => {
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
        text += `  ${medal} *${yl.nama}* (Area ${yl.area}): *${fmtNum(yl.rataRata)} btl/hr* [${yl.isMandiri ? "Mandiri" : "Binaan"}]\n`;
      });
      text += `\n`;
    }

    if (actionPlans.length > 0) {
      text += `🎯 *RENCANA AKSI & KOMITMEN RAPAT:*\n`;
      actionPlans.forEach((it, idx) => {
        text += `${idx + 1}. [${it.done ? "SELESAI" : "TODO"}] ${it.text}\n`;
      });
      text += `\n`;
    }

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_Sistem Monitoring & Evaluasi ${tku}_ 🙏`;
    return text;
  }

  const t = computeTahunanAgg(bulanan, selectedYear);
  let text = `📊 *LAPORAN TAHUNAN STRATEGIS ${tku}*\n`;
  text += `📅 *Tahun:* ${selectedYear}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  if (t) {
    text += `• Estimasi Realisasi Tahunan: *${fmtNum(t.estimasiTahunan)} botol*\n`;
    text += `• Target Tahunan: ${fmtNum(t.targetTahunan)} botol\n`;
    text += `• Capaian Proyeksi Tahunan: *${fmtPct(t.capaianTahunan)}%*\n`;
    text += `• Pertumbuhan (YoY): ${t.growthPct !== null ? `${t.growthPct >= 0 ? "+" : ""}${fmtPct(t.growthPct)}%` : "-"}\n`;
    text += `• Cakupan Area Final: ${fmtPct(t.areaTercoverFinal, 0)}%\n\n`;

    const thYl = computeYLAverageData(perYL, 0, 11);
    if (thYl.rows.length > 0) {
      text += `🏆 *RATA-RATA TAHUNAN SELURUH YL (Jan s/d Terakhir):*\n`;
      text += `• Rata-rata Tim: *${fmtNum(thYl.teamOverallAvg)} btl/hari*\n`;
      text += `• Status: ${thYl.totalMandiri} YL Mandiri, ${thYl.totalBinaan} YL Binaan\n`;
      text += `• Peringkat Seluruh YL:\n`;
      thYl.rows.forEach((yl, idx) => {
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
        text += `  ${medal} *${yl.nama}* (Area ${yl.area}): *${fmtNum(yl.rataRata)} btl/hr* [${yl.isMandiri ? "Mandiri" : "Binaan"}]\n`;
      });
      text += `\n`;
    }

    text += `📝 *Kesimpulan:*\n${t.kesimpulan}\n\n`;
  }
  if (actionPlans.length > 0) {
    text += `🎯 *RENCANA AKSI TAHUNAN:*\n`;
    actionPlans.forEach((it, idx) => {
      text += `${idx + 1}. [${it.done ? "SELESAI" : "TODO"}] ${it.text}\n`;
    });
    text += `\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `_Sistem Monitoring & Evaluasi ${tku}_ 🙏`;
  return text;
}

// ----------------------------------------------------------------------------
// Small presentational bits
// ----------------------------------------------------------------------------

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-lg bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">{children}</h3>
    </div>
  );
}

function StatBox({ label, value, sub, pct }: { label: string; value: string; sub?: string; pct?: number | null }) {
  return (
    <div className="flex-1 min-w-[110px] bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-black text-slate-900 dark:text-white mt-1">{value}</p>
      {sub && <p className="text-[10.5px] text-slate-400 mt-0.5">{sub}</p>}
      {pct !== undefined && (
        <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${pctBadgeClasses(pct)}`}>
          {pct === null ? "-" : `${pct >= 100 ? "▲" : "▼"} ${fmtPct(pct)}%`}
        </span>
      )}
    </div>
  );
}

function EmptyMonthNote({ label }: { label: string }) {
  return (
    <Card className="text-center py-8">
      <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Data {label} belum diisi</p>
      <p className="text-xs text-slate-400 mt-1">Isi data di menu Sales Record atau klik tombol &quot;Tarik Arsip&quot; di atas.</p>
    </Card>
  );
}

function ActionPlanCard({
  items,
  onAdd,
  onToggle,
  onDelete,
  label,
}: {
  items: ActionPlanItem[];
  onAdd: (text: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  label: string;
}) {
  const [newText, setNewText] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newText.trim()) {
      onAdd(newText);
      setNewText("");
    }
  };

  const totalCount = items.length;
  const doneCount = items.filter((it) => it.done).length;
  const pendingCount = totalCount - doneCount;
  const donePct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const filteredItems = useMemo(() => {
    if (filter === "pending") return items.filter((it) => !it.done);
    if (filter === "done") return items.filter((it) => it.done);
    return items;
  }, [items, filter]);

  return (
    <Card className="page-break-inside-avoid">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
        <SectionTitle icon={CheckSquare}>
          Rencana Tindak Lanjut &amp; Komitmen Rapat — {label}
        </SectionTitle>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${
            donePct === 100 && totalCount > 0
              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/30"
              : donePct >= 50
              ? "bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-500/30"
              : "bg-orange-500/20 text-orange-600 dark:text-orange-300 border-orange-500/30"
          }`}>
            PDCA: {doneCount}/{totalCount} Selesai ({donePct}%)
          </span>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mb-3">
        Catat komitmen strategi, pembinaan YL, atau target perbaikan yang disepakati saat rapat.
      </p>

      {totalCount > 0 && (
        <div className="mb-4 bg-slate-100 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
            <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-orange-500" />
              Progress Eksekusi Komitmen Rapat
            </span>
            <span className="font-black text-orange-600 dark:text-orange-400">
              {donePct}% Tercapai
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-orange-500 to-emerald-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${donePct}%` }}
            />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 mb-3 no-print">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Tulis rencana aksi / komitmen rapat baru..."
          className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <button
          type="submit"
          disabled={!newText.trim()}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1 cursor-pointer transition-all shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Tambah
        </button>
      </form>

      {totalCount > 0 && (
        <div className="flex items-center gap-1.5 mb-2.5 no-print text-[11px]">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              filter === "all"
                ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Semua ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              filter === "pending"
                ? "bg-orange-500 text-white"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            On Progress ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("done")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              filter === "done"
                ? "bg-emerald-600 text-white"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Selesai ({doneCount})
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {filteredItems.map((it) => (
          <div
            key={it.id}
            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
              it.done
                ? "bg-slate-50/70 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800 opacity-70"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            }`}
          >
            <button
              type="button"
              onClick={() => onToggle(it.id)}
              className="flex items-center gap-2 text-left cursor-pointer flex-1 mr-2"
            >
              {it.done ? (
                <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-slate-400 shrink-0" />
              )}
              <span className={`text-xs ${it.done ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-200 font-medium"}`}>
                {it.text}
              </span>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                it.done ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" : "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
              }`}>
                {it.done ? "Selesai" : "On Progress"}
              </span>
              <button
                type="button"
                onClick={() => onDelete(it.id)}
                className="text-slate-300 hover:text-red-500 p-1 rounded no-print cursor-pointer"
                title="Hapus"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {filteredItems.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-3 italic">
            {totalCount === 0 ? "Belum ada rencana tindak lanjut yang dicatat." : "Tidak ada komitmen pada kategori ini."}
          </p>
        )}
      </div>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Yakult Lady of the Month — Kategori & Perhitungan Kandidat
// ----------------------------------------------------------------------------

interface YlOtmCandidate {
  area: string;
  nama: string;
  totalPenjualan: number;
  rataRata: number;
  monthlyValues: number[];
  vsBulanLaluPct: number | null;
  vsTahunLaluPct: number | null;
  vsTargetPct: number | null;
  targetYL: number | null;
  sektorRumah: number | null;
}

const YL_OTM_CATEGORIES: { id: string; label: string; auto: boolean }[] = [
  { id: "total_tertinggi", label: "Total Penjualan Tertinggi", auto: true },
  { id: "vs_tahun_lalu", label: "Kenaikan Tertinggi vs Tahun Lalu", auto: true },
  { id: "vs_bulan_lalu", label: "Kenaikan Tertinggi vs Bulan Lalu", auto: true },
  { id: "vs_target", label: "Pencapaian vs Tgt", auto: true },
  { id: "rumah_tertinggi", label: "Penjualan Sektor Rumah Tertinggi", auto: true },
  { id: "stabil", label: "Penjualan Paling Stabil", auto: true },
  { id: "sampah_terbanyak", label: "Pengumpulan Sampah Botol Terbanyak", auto: false },
  { id: "bebas", label: "Kategori Bebas (Kustom)", auto: false },
];

export interface SectorSummaryItem {
  key: "rmh" | "psr" | "skh" | "ktr" | "tk" | "ib";
  label: string;
  isFixedCustomer: boolean;
  akm: number;
  rata2: number;
  pct: number;
  yo: number;
  om: number;
  os: number;
  yt: number;
}

interface MonthArchiveDetails {
  perYL?: Record<
    string,
    {
      area?: string;
      nama?: string;
      targetYL?: number;
      bulanLaluYL?: number;
      tahunLaluYL?: number;
      vsTgt?: number;
      vsBln?: number;
      vsThn?: number;
      rata2?: number;
      akumulasi?: number;
    }
  >;
  sektorRumahByArea?: Record<string, number>;
  sectors?: SectorSummaryItem[];
  totalAkmSektor?: number;
  hariKerja?: number;
  targetTim?: {
    target: number;
    bln_lalu: number;
    thn_lalu: number;
  };
  rataHarian?: number;
  topSampah?: {
    nama: string;
    area: string;
    jumlah: number;
  };
}

function resolveAreaFromTx(t: any): string {
  const explicit = String(t.area || "").match(/\b(20[1-9]|210)\b/);
  if (explicit) return explicit[1];
  const matchNama = t.nama ? String(t.nama).match(/\b(20[1-9]|210)\b/) : null;
  if (matchNama) return matchNama[1];
  const n = String(t.nama || "").toLowerCase();
  if (n.includes("gusrina")) return "201";
  if (n.includes("dewi")) return "202";
  if (n.includes("gusrini")) return "203";
  if (n.includes("umi")) return "204";
  if (n.includes("suyik")) return "205";
  if (n.includes("ria")) return "206";
  if (n.includes("endang")) return "207";
  if (n.includes("wakiah")) return "208";
  if (n.includes("titis")) return "209";
  if (n.includes("eni")) return "210";
  return t.area ? String(t.area).trim() : "";
}

function parseIndoNumber(val: any): number {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const s = String(val).trim().replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

async function loadMonthArchiveDetails(selectedYear: string, monthIndex: number): Promise<MonthArchiveDetails> {
  const mPad = String(monthIndex + 1).padStart(2, "0");
  const ymKey = `${selectedYear}-${mPad}`;
  const archiveKey = `monthly_archive_${ymKey}`;
  let arc: any = null;

  try {
    const local = localStorage.getItem(archiveKey);
    if (local) arc = JSON.parse(local);
  } catch {}

  if (!arc) {
    try {
      arc = await loadFromSupabase<any>(archiveKey);
    } catch {}
  }

  // Fallback ke server jika di client belum ada / gagal load dari Supabase
  if (!arc) {
    try {
      const resp = await fetch(`/api/getMonthlyArchive?month=${encodeURIComponent(ymKey)}`);
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.ok && json.archive) {
          arc = json.archive;
        }
      }
    } catch {}
  }

  const result: MonthArchiveDetails = {
    perYL: {},
    sektorRumahByArea: {},
    sectors: [],
    totalAkmSektor: 0,
    hariKerja: 25,
    targetTim: { target: 0, bln_lalu: 0, thn_lalu: 0 },
    rataHarian: 0,
  };

  const secMap: Record<"rmh" | "psr" | "skh" | "ktr" | "tk" | "ib", {
    label: string;
    isFixedCustomer: boolean;
    yo: number;
    om: number;
    os: number;
    yt: number;
    akm: number;
  }> = {
    rmh: { label: "Rumah", isFixedCustomer: true, yo: 0, om: 0, os: 0, yt: 0, akm: 0 },
    psr: { label: "Pasar", isFixedCustomer: true, yo: 0, om: 0, os: 0, yt: 0, akm: 0 },
    skh: { label: "Sekolah", isFixedCustomer: true, yo: 0, om: 0, os: 0, yt: 0, akm: 0 },
    ktr: { label: "Kantor", isFixedCustomer: true, yo: 0, om: 0, os: 0, yt: 0, akm: 0 },
    tk:  { label: "Toko", isFixedCustomer: true, yo: 0, om: 0, os: 0, yt: 0, akm: 0 },
    ib:  { label: "Instant Buyer (IB)", isFixedCustomer: false, yo: 0, om: 0, os: 0, yt: 0, akm: 0 },
  };

  const sampahByArea: Record<string, { nama: string; area: string; total: number }> = {};

  const processTransactions = (txs: any[]) => {
    txs.forEach((t: any) => {
      const areaKey = resolveAreaFromTx(t);
      const rmhTot =
        (Number(t.rmh_yo) || 0) + (Number(t.rmh_om) || 0) + (Number(t.rmh_os) || 0) + (Number(t.rmh_yt) || 0);
      if (areaKey && rmhTot > 0) {
        result.sektorRumahByArea![areaKey] = (result.sektorRumahByArea![areaKey] || 0) + rmhTot;
      }

      // Hitung sampah botol per YL
      const btl = Number(t.apk_botol) || 0;
      if (areaKey && btl > 0) {
        if (!sampahByArea[areaKey]) {
          sampahByArea[areaKey] = { nama: t.nama || "", area: areaKey, total: 0 };
        }
        sampahByArea[areaKey].total += btl;
        if (t.nama && (!sampahByArea[areaKey].nama || sampahByArea[areaKey].nama.length < String(t.nama).length)) {
          sampahByArea[areaKey].nama = String(t.nama);
        }
      }

      (["rmh", "psr", "skh", "ktr", "tk", "ib"] as const).forEach((secKey) => {
        const yo = Number(t[`${secKey}_yo`]) || 0;
        const om = Number(t[`${secKey}_om`]) || 0;
        const os = Number(t[`${secKey}_os`]) || 0;
        const yt = Number(t[`${secKey}_yt`]) || 0;
        secMap[secKey].yo += yo;
        secMap[secKey].om += om;
        secMap[secKey].os += os;
        secMap[secKey].yt += yt;
        secMap[secKey].akm += (yo + om + os + yt);
      });
    });

    const sortedSampah = Object.values(sampahByArea).sort((a, b) => b.total - a.total);
    if (!result.topSampah && sortedSampah[0] && sortedSampah[0].total > 0) {
      result.topSampah = {
        nama: sortedSampah[0].nama,
        area: sortedSampah[0].area,
        jumlah: sortedSampah[0].total,
      };
    }
  };

  let hariKerja = 25;

  if (arc) {
    const rec = arc.data || arc;
    hariKerja = rec.hariKerja || rec.pembagiManager || 25;
    result.hariKerja = hariKerja;

    // Prioritas Utama: Ambil Sampah Terbanyak resmi dari evaluasiData.dataRows arsip (hasil tutup buku)
    if (rec.evaluasiData?.dataRows && Array.isArray(rec.evaluasiData.dataRows)) {
      let maxBtl = 0;
      let topRow: any = null;
      rec.evaluasiData.dataRows.forEach((r: any) => {
        const btl = parseIndoNumber(r[26]);
        if (btl > maxBtl) {
          maxBtl = btl;
          topRow = r;
        }
      });
      if (topRow && maxBtl > 0) {
        result.topSampah = {
          nama: String(topRow[1] || ""),
          area: String(topRow[0] || ""),
          jumlah: maxBtl,
        };
      }
    }

    // Prioritas Kedua: Ambil dari evaluasiData.analisis jika dataRows belum terformat
    if (!result.topSampah && rec.evaluasiData?.analisis && Array.isArray(rec.evaluasiData.analisis)) {
      let maxBtl = 0;
      let topItem: any = null;
      rec.evaluasiData.analisis.forEach((a: any) => {
        const btl = parseIndoNumber(a.sampahBotol ?? a.sampah);
        if (btl > maxBtl) {
          maxBtl = btl;
          topItem = a;
        }
      });
      if (topItem && maxBtl > 0) {
        result.topSampah = {
          nama: String(topItem.nama || ""),
          area: String(topItem.area || ""),
          jumlah: maxBtl,
        };
      }
    }

    let tkuTarget = 0;
    let tkuBlnLalu = 0;
    let tkuThnLalu = 0;

    if (rec.targetTKU) {
      tkuTarget = Number(rec.targetTKU.target) || 0;
      tkuBlnLalu = Number(rec.targetTKU.bln_lalu) || 0;
      tkuThnLalu = Number(rec.targetTKU.thn_lalu) || 0;
    } else if (rec.dashboardData?.targetTim || rec.targetTim) {
      const tt = rec.dashboardData?.targetTim || rec.targetTim;
      tkuTarget = Number(tt.target) || 0;
      tkuBlnLalu = Number(tt.bulanLalu ?? tt.bln_lalu) || 0;
      tkuThnLalu = Number(tt.tahunLalu ?? tt.thn_lalu) || 0;
    }

    if (tkuTarget === 0) {
      try {
        const localTku = localStorage.getItem(`target_tku_${ymKey}`) || localStorage.getItem("target_tku");
        if (localTku) {
          const parsed = JSON.parse(localTku);
          if (parsed && typeof parsed === "object") {
            tkuTarget = Number(parsed.target) || 0;
            if (tkuBlnLalu === 0) tkuBlnLalu = Number(parsed.bln_lalu) || 0;
            if (tkuThnLalu === 0) tkuThnLalu = Number(parsed.thn_lalu) || 0;
          }
        }
      } catch {}
    }

    if (rec.dashboardData?.rataHarian || rec.rataHarian) {
      result.rataHarian = Number(rec.dashboardData?.rataHarian || rec.rataHarian) || 0;
    }

    const dbPerYL = rec.dashboardData?.perYL || rec.evaluasiData?.perYL || rec.perYL || {};
    const targetYLMap = rec.targetYLMap || rec.targetYL || {};

    if (typeof dbPerYL === "object" && dbPerYL !== null) {
      Object.entries(dbPerYL).forEach(([key, val]: [string, any]) => {
        if (!val) return;
        const areaStr = String(val.area || key);
        const tgtObj = (targetYLMap && (targetYLMap[`${areaStr}_${ymKey}`] || targetYLMap[areaStr])) || {};

        const rata2 = Number(val.rata2) || 0;
        const targetYL = Number(val.targetYL ?? tgtObj.target ?? 0);
        const bulanLaluYL = Number(val.bulanLaluYL ?? tgtObj.bln_lalu ?? 0);
        const tahunLaluYL = Number(val.tahunLaluYL ?? tgtObj.thn_lalu ?? 0);
        const vsTgt = val.vsTgt !== undefined ? Number(val.vsTgt) : targetYL > 0 ? (rata2 / targetYL) * 100 : 0;
        const vsBln = val.vsBln !== undefined ? Number(val.vsBln) : bulanLaluYL > 0 ? (rata2 / bulanLaluYL) * 100 : 0;
        const vsThn = val.vsThn !== undefined ? Number(val.vsThn) : tahunLaluYL > 0 ? (rata2 / tahunLaluYL) * 100 : 0;

        result.perYL![areaStr] = {
          area: areaStr,
          nama: val.nama,
          targetYL,
          bulanLaluYL,
          tahunLaluYL,
          vsTgt,
          vsBln,
          vsThn,
          rata2,
          akumulasi: Number(val.akumulasi) || 0,
        };
      });
    }

    let sumTgt = 0, sumBln = 0, sumThn = 0;
    Object.values(result.perYL || {}).forEach((y) => {
      sumTgt += y.targetYL || 0;
      sumBln += y.bulanLaluYL || 0;
      sumThn += y.tahunLaluYL || 0;
    });
    if (tkuTarget === 0 && sumTgt > 0) tkuTarget = sumTgt;
    if (tkuBlnLalu === 0 && sumBln > 0) tkuBlnLalu = sumBln;
    if (tkuThnLalu === 0 && sumThn > 0) tkuThnLalu = sumThn;

    result.targetTim = {
      target: tkuTarget,
      bln_lalu: tkuBlnLalu,
      thn_lalu: tkuThnLalu,
    };

    if (Array.isArray(rec.transactions) && rec.transactions.length > 0) {
      processTransactions(rec.transactions);
    }
  }

  if (Object.values(secMap).reduce((s, x) => s + x.akm, 0) === 0) {
    try {
      const resp = await fetch(`/api/getPlgPjlData?month=${encodeURIComponent(ymKey)}`);
      if (resp.ok) {
        const res = (await resp.json()) as { ok?: boolean; transactions?: any[]; hariKerja?: number };
        if (res && res.ok && Array.isArray(res.transactions)) {
          if (res.hariKerja) hariKerja = res.hariKerja;
          processTransactions(res.transactions);
        }
      }
    } catch {}
  }

  const grandTotal = Object.values(secMap).reduce((s, x) => s + x.akm, 0);
  result.totalAkmSektor = grandTotal;

  result.sectors = (["rmh", "psr", "skh", "ktr", "tk", "ib"] as const).map((key) => {
    const s = secMap[key];
    const akm = s.akm;
    const rata2 = hariKerja > 0 ? akm / hariKerja : 0;
    const pct = grandTotal > 0 ? (akm / grandTotal) * 100 : 0;
    return {
      key,
      label: s.label,
      isFixedCustomer: s.isFixedCustomer,
      akm,
      rata2,
      pct,
      yo: s.yo,
      om: s.om,
      os: s.os,
      yt: s.yt,
    };
  });

  return result;
}

function computeYlOtmCandidates(
  perYL: any[],
  prevYearPerYL: any[] | null,
  bulanan: Record<string, any>,
  monthsInRange: number[],
  stabilityMonths: number[],
  archiveDetails?: MonthArchiveDetails | null
): YlOtmCandidate[] {
  const prevBlockMonths = monthsInRange.map((i) => i - monthsInRange.length);
  const prevBlockValid = prevBlockMonths.every((i) => i >= 0);

  return (perYL || [])
    .map((yl) => {
      const nama = cleanYlName(yl.nama || "");
      const area = String(yl.area || "");
      const penjualanByMonth = yl.penjualan || {};
      const totalPenjualan = sum(monthsInRange.map((i) => penjualanByMonth[MONTHS[i]]));
      const totalJwp = sum(
        monthsInRange.map((i) => bulanan[MONTHS[i]]?.jwp ?? (penjualanByMonth[MONTHS[i]] !== undefined ? 25 : 0))
      );
      const rataRata = totalJwp > 0 ? totalPenjualan / totalJwp : 0;

      const arcYl =
        archiveDetails?.perYL?.[area] ||
        (archiveDetails?.perYL &&
          Object.values(archiveDetails.perYL).find(
            (v: any) => v.nama === nama || cleanYlName(v.nama || "") === nama
          ));

      let vsBulanLaluPct: number | null = null;
      if (arcYl && arcYl.vsBln !== undefined && arcYl.vsBln > 0) {
        vsBulanLaluPct = arcYl.vsBln;
      } else if (prevBlockValid) {
        const prevTotal = sum(prevBlockMonths.map((i) => penjualanByMonth[MONTHS[i]]));
        if (prevTotal > 0) vsBulanLaluPct = (totalPenjualan / prevTotal) * 100;
      }

      let vsTahunLaluPct: number | null = null;
      if (arcYl && arcYl.vsThn !== undefined && arcYl.vsThn > 0) {
        vsTahunLaluPct = arcYl.vsThn;
      } else if (prevYearPerYL) {
        const prevYl = prevYearPerYL.find(
          (p: any) => String(p.area) === String(area) || cleanYlName(p.nama || "") === nama
        );
        if (prevYl) {
          const prevTotal = sum(monthsInRange.map((i) => prevYl.penjualan?.[MONTHS[i]]));
          if (prevTotal > 0) vsTahunLaluPct = (totalPenjualan / prevTotal) * 100;
        }
      }

      let vsTargetPct: number | null = null;
      let targetYL: number | null = null;
      if (arcYl && arcYl.vsTgt !== undefined && arcYl.vsTgt > 0) {
        vsTargetPct = arcYl.vsTgt;
        targetYL = arcYl.targetYL || null;
      } else if (arcYl && arcYl.targetYL && arcYl.targetYL > 0) {
        targetYL = arcYl.targetYL;
        vsTargetPct = (rataRata / arcYl.targetYL) * 100;
      }

      const sektorRumah = archiveDetails?.sektorRumahByArea?.[area] ?? null;

      const monthlyValues = stabilityMonths
        .map((i) => penjualanByMonth[MONTHS[i]])
        .filter((v: any) => typeof v === "number" && v > 0);

      return {
        area,
        nama,
        totalPenjualan,
        rataRata,
        monthlyValues,
        vsBulanLaluPct,
        vsTahunLaluPct,
        vsTargetPct,
        targetYL,
        sektorRumah,
      };
    })
    .filter((c) => c.nama);
}

function rankYlOtmCandidates(
  candidates: YlOtmCandidate[],
  categoryId: string
): { c: YlOtmCandidate; value: number; display: string }[] {
  const withVal: { c: YlOtmCandidate; value: number; display: string }[] = [];
  candidates.forEach((c) => {
    if (categoryId === "total_tertinggi") {
      if (c.totalPenjualan > 0) {
        withVal.push({
          c,
          value: c.totalPenjualan,
          display: `${fmtNum(c.totalPenjualan)} btl (Rata² ${fmtNum(Math.round(c.rataRata))} btl/hr)`,
        });
      }
    } else if (categoryId === "vs_tahun_lalu") {
      if (c.vsTahunLaluPct !== null && c.vsTahunLaluPct > 0) {
        withVal.push({
          c,
          value: c.vsTahunLaluPct,
          display: `${fmtPct(c.vsTahunLaluPct)}% vs th lalu`,
        });
      }
    } else if (categoryId === "vs_bulan_lalu") {
      if (c.vsBulanLaluPct !== null && c.vsBulanLaluPct > 0) {
        withVal.push({
          c,
          value: c.vsBulanLaluPct,
          display: `${fmtPct(c.vsBulanLaluPct)}% vs bln lalu`,
        });
      }
    } else if (categoryId === "vs_target") {
      if (c.vsTargetPct !== null && c.vsTargetPct > 0) {
        withVal.push({
          c,
          value: c.vsTargetPct,
          display: `${fmtPct(c.vsTargetPct)}% vs Tgt${c.targetYL ? ` (Tgt: ${fmtNum(c.targetYL)} btl/hr)` : ""}`,
        });
      }
    } else if (categoryId === "rumah_tertinggi") {
      if (c.sektorRumah !== null && c.sektorRumah > 0) {
        withVal.push({
          c,
          value: c.sektorRumah,
          display: `${fmtNum(c.sektorRumah)} btl (Sektor Rumah)`,
        });
      }
    } else if (categoryId === "stabil") {
      if (c.monthlyValues.length >= 2) {
        const mean = average(c.monthlyValues) || 0;
        if (mean > 0) {
          const variance = c.monthlyValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / c.monthlyValues.length;
          const cv = Math.sqrt(variance) / mean;
          withVal.push({ c, value: cv, display: `Variasi ${fmtPct(cv * 100)}% antar bulan (makin stabil)` });
        }
      }
    }
  });
  const asc = categoryId === "stabil";
  withVal.sort((a, b) => (asc ? a.value - b.value : b.value - a.value));
  return withVal.slice(0, 5);
}

async function loadPrevYearPerYL(selectedYear: string): Promise<any[] | null> {
  const prevYear = String(parseInt(selectedYear, 10) - 1);
  const localKey = `sales_record_tku_${prevYear}`;
  try {
    const local = localStorage.getItem(localKey);
    if (local) return JSON.parse(local)?.perYL || null;
    const remote = await loadFromSupabase<any>(localKey);
    return remote?.perYL || null;
  } catch (e) {
    console.error("Gagal memuat data tahun lalu untuk Yakult Lady of the Month:", e);
    return null;
  }
}

function resizePhotoToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_SIZE = 900; // tajam di layar presentasi, tetap hemat (~100-150 kB)
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; }
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function YlOfTheMonthCard({
  perYL,
  bulanan,
  periode,
  monthIndex,
  selectedYear,
  periodeLabel,
  record,
  loading,
  onSave,
  onClear,
}: {
  perYL: any[];
  bulanan: Record<string, any>;
  periode: Periode;
  monthIndex: number;
  selectedYear: string;
  periodeLabel: string;
  record: YlOtmRecord | null;
  loading: boolean;
  onSave: (rec: YlOtmRecord) => void | Promise<void>;
  onClear: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState<string>(record?.category || "total_tertinggi");
  const [customCategoryLabel, setCustomCategoryLabel] = useState<string>(record?.categoryLabel || "");
  const [pending, setPending] = useState<{ area: string; nama: string; valueLabel: string } | null>(null);
  const [manualArea, setManualArea] = useState("");
  const [manualValueLabel, setManualValueLabel] = useState("");
  const [foto, setFoto] = useState<string>(record?.foto || "");
  const [prevYearPerYL, setPrevYearPerYL] = useState<any[] | null>(null);
  const [archiveDetails, setArchiveDetails] = useState<MonthArchiveDetails | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [searched, setSearched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const monthsInRange = useMemo(() => {
    if (periode === "bulanan") return [monthIndex];
    if (periode === "s1") return [0, 1, 2, 3, 4, 5];
    if (periode === "s2") return [6, 7, 8, 9, 10, 11];
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  }, [periode, monthIndex]);

  const stabilityMonths = useMemo(() => {
    if (periode === "bulanan") {
      const arr: number[] = [];
      for (let i = Math.max(0, monthIndex - 2); i <= monthIndex; i++) arr.push(i);
      return arr;
    }
    return monthsInRange;
  }, [periode, monthIndex, monthsInRange]);

  const fetchSupportingData = async () => {
    setLoadingData(true);
    try {
      const [arcData, prevData] = await Promise.all([
        loadMonthArchiveDetails(selectedYear, monthIndex),
        prevYearPerYL ? Promise.resolve(prevYearPerYL) : loadPrevYearPerYL(selectedYear),
      ]);
      setArchiveDetails(arcData);
      if (!prevYearPerYL && prevData) {
        setPrevYearPerYL(prevData);
      }
    } catch (err) {
      console.error("Gagal memuat data pendukung YL of the Month:", err);
    } finally {
      setLoadingData(false);
    }
  };

  const candidates = useMemo(
    () => computeYlOtmCandidates(perYL, prevYearPerYL, bulanan, monthsInRange, stabilityMonths, archiveDetails),
    [perYL, prevYearPerYL, bulanan, monthsInRange, stabilityMonths, archiveDetails]
  );

  const currentCat = YL_OTM_CATEGORIES.find((c) => c.id === category) || YL_OTM_CATEGORIES[0];
  const ranked = useMemo(
    () => (currentCat.auto ? rankYlOtmCandidates(candidates, category) : []),
    [candidates, category, currentCat.auto]
  );

  const handleStartEdit = () => {
    const currentCatId = record?.category || "total_tertinggi";
    setCategory(currentCatId);
    setCustomCategoryLabel(record?.categoryLabel || "");
    setFoto(record?.foto || "");
    const recordCat = record ? YL_OTM_CATEGORIES.find((c) => c.id === record.category) : null;
    setPending(record && recordCat?.auto ? { area: record.area, nama: record.nama, valueLabel: record.valueLabel } : null);
    setManualArea(record && !recordCat?.auto ? record.area : "");
    setManualValueLabel(record && !recordCat?.auto ? record.valueLabel : "");
    setSearched(true);
    setEditing(true);
    fetchSupportingData();
  };

  const handleCategoryChange = async (id: string) => {
    setCategory(id);
    const matched = YL_OTM_CATEGORIES.find((c) => c.id === id);
    if (id === "bebas") {
      setCustomCategoryLabel(record?.category === "bebas" ? (record.categoryLabel || "") : "");
    } else if (matched) {
      setCustomCategoryLabel(matched.label);
    }
    setPending(null);
    setSearched(true);
    if (!archiveDetails) {
      await fetchSupportingData();
    }
  };

  const handleSearch = async () => {
    await fetchSupportingData();
    setSearched(true);
  };

  const handleUploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran foto maksimal 5MB.");
      return;
    }
    setUploading(true);
    try {
      const base64 = await resizePhotoToBase64(file);
      setFoto(base64);
    } catch (err) {
      console.error("Gagal memproses foto:", err);
    } finally {
      setUploading(false);
    }
  };

  const winner = currentCat.auto
    ? pending
    : manualArea
    ? { area: manualArea, nama: cleanYlName(perYL.find((y) => y.area === manualArea)?.nama || ""), valueLabel: manualValueLabel }
    : null;

  const handleSave = async () => {
    if (!winner || !winner.area) return;
    setSaving(true);
    try {
      const finalCategoryLabel = customCategoryLabel.trim() || currentCat.label;
      await onSave({
        area: winner.area,
        nama: winner.nama,
        category,
        categoryLabel: finalCategoryLabel,
        valueLabel: winner.valueLabel || "",
        foto,
        updatedAt: new Date().toISOString(),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const otmTitle = getOtmTitleByPeriode(periode);

  return (
    <Card className="page-break-inside-avoid no-print">
      <SectionTitle icon={Award}>{otmTitle} — {periodeLabel}</SectionTitle>

      {!editing && (
        <>
          {loading ? (
            <p className="text-xs text-slate-400 py-4 text-center">Memuat...</p>
          ) : record ? (
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                {record.foto ? (
                  <img src={record.foto} alt={record.nama} className="w-full h-full object-cover" />
                ) : (
                  <Trophy className="w-7 h-7 text-brand-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-900 dark:text-white truncate">{record.nama}</p>
                <p className="text-[10px] text-brand-500 font-bold uppercase tracking-wide">
                  Area {record.area} &middot; {record.categoryLabel}
                </p>
                {record.valueLabel && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{record.valueLabel}</p>}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  onClick={handleStartEdit}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer"
                >
                  Ubah
                </button>
                <button
                  onClick={() => onClear()}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 cursor-pointer"
                >
                  Hapus
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleStartEdit}
              className="w-full flex items-center justify-center gap-2 bg-brand-50 dark:bg-brand-950/20 border border-dashed border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 text-xs font-bold py-3 rounded-xl cursor-pointer hover:bg-brand-100 dark:hover:bg-brand-950/40 transition-all"
            >
              <Trophy className="w-4 h-4" /> Atur {otmTitle}
            </button>
          )}
        </>
      )}

      {editing && (
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              Kategori
            </label>
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {YL_OTM_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              Keterangan / Nama Kategori di Slide {category === "bebas" ? "(Wajib/Bebas Diisi)" : "(Bisa Disesuaikan)"}
            </label>
            <input
              type="text"
              value={customCategoryLabel}
              onChange={(e) => setCustomCategoryLabel(e.target.value)}
              placeholder={category === "bebas" ? "Contoh: Ibu Teramah, Pelayanan Prima, dll." : currentCat.label}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {category === "bebas" && (
              <p className="text-[10px] text-brand-500 mt-1">
                💡 Masukkan nama atau alasan kategori penghargaan di sini agar muncul di slide presentasi.
              </p>
            )}
          </div>

          {currentCat.auto ? (
            <div>
              <button
                onClick={handleSearch}
                disabled={loadingData}
                className="w-full flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-xl cursor-pointer transition-all"
              >
                {loadingData ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {loadingData ? "Memuat data..." : "Cari / Segarkan Data"}
              </button>

              {searched && !loadingData && (
                <div className="mt-2 space-y-1.5">
                  {ranked.length === 0 && (
                    <p className="text-[11px] text-slate-400 text-center py-3 italic">
                      Data belum cukup untuk kategori &amp; periode ini. Coba kategori lain atau gunakan &quot;Yakult Lady Terbaik&quot;.
                    </p>
                  )}
                  {ranked.map((r, idx) => (
                    <button
                      key={r.c.area}
                      onClick={() => setPending({ area: r.c.area, nama: r.c.nama, valueLabel: r.display })}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left cursor-pointer transition-all ${
                        pending?.area === r.c.area
                          ? "bg-brand-600 border-brand-600 text-white"
                          : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-brand-300"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                            pending?.area === r.c.area ? "bg-white/20" : "bg-slate-200 dark:bg-slate-700"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold truncate">{r.c.nama}</span>
                      </span>
                      <span className="text-[10px] font-bold shrink-0">{r.display}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-400 italic">
                Data kategori ini belum tercatat otomatis di modul Presentasi. Pilih Yakult Lady &amp; isi keterangan secara manual.
              </p>
              <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Yakult Lady
                </label>
                <select
                  value={manualArea}
                  onChange={(e) => setManualArea(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">— Pilih Yakult Lady —</option>
                  {perYL.map((yl) => (
                    <option key={yl.area} value={yl.area}>
                      {cleanYlName(yl.nama || "")} (Area {yl.area})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Keterangan / Nilai (opsional)
                </label>
                <input
                  type="text"
                  value={manualValueLabel}
                  onChange={(e) => setManualValueLabel(e.target.value)}
                  placeholder="cth: 3 karung sampah botol, atau 115% dari target"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              Foto {otmTitle}
            </label>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                {foto ? <img src={foto} alt="Foto" className="w-full h-full object-cover" /> : <Camera className="w-5 h-5 text-slate-300" />}
              </div>
              <label className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 text-[11px] font-bold py-2 rounded-xl cursor-pointer transition-all">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                {uploading ? "Memproses..." : "Unggah Foto"}
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadFoto} disabled={uploading} />
              </label>
              {foto && (
                <button
                  onClick={() => setFoto("")}
                  className="text-[11px] font-bold px-2.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 cursor-pointer shrink-0"
                >
                  Hapus
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 text-xs font-bold py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={!winner || !winner.area || saving}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white cursor-pointer"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Simpan
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------------
// CustomSlideCard: Pengaturan Slide Tambahan (Data & Foto Dokumentasi)
// ----------------------------------------------------------------------------

function CustomSlideCard({
  record,
  loading,
  onSave,
  onClear,
  onToggleEnabled,
  onUploadPhoto,
  onRemovePhoto,
  onReset,
  label,
}: {
  record: CustomSlideRecord;
  loading: boolean;
  onSave: (rec: CustomSlideRecord) => Promise<void>;
  onClear?: () => Promise<void>;
  onToggleEnabled?: () => Promise<void>;
  onUploadPhoto?: (file: File) => Promise<void>;
  onRemovePhoto?: () => Promise<void>;
  onReset?: () => Promise<void>;
  label?: string;
}) {
  const [openEditor, setOpenEditor] = useState(false);
  const [title, setTitle] = useState(record?.title || "Data Tambahan & Lampiran Dokumentasi");
  const [subtitle, setSubtitle] = useState(record?.subtitle || "");
  const [catatan, setCatatan] = useState(record?.catatan || "");
  const [foto, setFoto] = useState(record?.foto || "");
  const [fotoName, setFotoName] = useState(record?.fotoName || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(record?.title || "Data Tambahan & Lampiran Dokumentasi");
    setSubtitle(record?.subtitle || "");
    setCatatan(record?.catatan || "");
    setFoto(record?.foto || "");
    setFotoName(record?.fotoName || "");
  }, [record]);

  const handleUploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await resizeCustomSlidePhoto(file);
      setFoto(b64);
      setFotoName(file.name);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleToggleActive = async () => {
    setSaving(true);
    try {
      await onSave({
        ...record,
        enabled: !record.enabled,
        title: title || record.title,
        subtitle: subtitle || record.subtitle,
        catatan: catatan || record.catatan,
        foto: foto || record.foto,
        fotoName: fotoName || record.fotoName,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEditor = async () => {
    setSaving(true);
    try {
      await onSave({
        enabled: true,
        title: title.trim() || "Data Tambahan & Lampiran Dokumentasi",
        subtitle: subtitle.trim(),
        catatan: catatan.trim(),
        foto,
        fotoName,
      });
      setOpenEditor(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFoto = () => {
    setFoto("");
    setFotoName("");
  };

  return (
    <Card className="border-brand-200/60 dark:border-brand-950/40 bg-gradient-to-br from-white via-white to-brand-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-brand-950/10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 shrink-0">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black text-slate-900 dark:text-white">
                Slide Tambahan (Data &amp; Foto Lampiran)
              </h3>
              <span
                className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full ${
                  record.enabled
                    ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700"
                }`}
              >
                {record.enabled ? "✓ Aktif di Presentasi" : "Disembunyikan"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Sisipkan foto data tabel, grafik luar, atau foto kegiatan (maksimal 3 slide).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-center">
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={saving || loading}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-all ${
              record.enabled
                ? "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
                : "bg-brand-600 hover:bg-brand-700 text-white shadow-xs"
            }`}
          >
            {record.enabled ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-500" /> Sembunyikan
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" /> Tambah / Munculkan Slide
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setOpenEditor(!openEditor)}
            className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-brand-400 cursor-pointer transition-all"
          >
            {openEditor ? "Tutup Pengaturan" : "Kelola Foto & Judul"}
          </button>
        </div>
      </div>

      {openEditor && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 animate-in fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                Judul Slide Tambahan
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="cth: Data Dokumentasi & Tabel Tambahan"
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                Subjudul / Keterangan Ringkas (Opsional)
              </label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="cth: Foto realisasi penjualan rute khusus"
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              Foto Data / Lampiran (Maksimal 3 Slide)
            </label>
            <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              {foto ? (
                <div className="relative group w-32 h-24 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 shrink-0">
                  <img src={foto} alt="Preview Foto" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={handleRemoveFoto}
                    className="absolute top-1 right-1 p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg opacity-90 transition-opacity cursor-pointer"
                    title="Hapus Foto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="w-32 h-24 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 shrink-0">
                  <Camera className="w-6 h-6 mb-1 text-slate-400" />
                  <span className="text-[10px] font-bold">Belum Ada Foto</span>
                </div>
              )}

              <div className="flex-1 space-y-1.5 text-center sm:text-left">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {fotoName || (foto ? "Foto Data Siap Ditampilkan" : "Pilih foto tabel, piagam, grafik, atau dokumentasi kegiatan")}
                </p>
                <p className="text-[11px] text-slate-400">
                  Format gambar JPG, PNG, atau WEBP. Gambar otomatis dioptimalkan agar tajam saat diproyeksikan.
                </p>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-all active:scale-95 mt-1">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploading ? "Mengompres..." : foto ? "Ganti Foto Ini" : "Pilih & Unggah Foto"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleUploadFoto} disabled={uploading} />
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
              Catatan / Penjelasan Tambahan (Opsional)
            </label>
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              rows={2}
              placeholder="Tuliskan keterangan pendukung jika diperlukan..."
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setOpenEditor(false)}
              className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveEditor}
              disabled={saving}
              className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Terapkan ke Slide
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------

export default function PresentasiView({ globalMonth }: { globalMonth?: string } = {}) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Inisialisasi awal tahun & bulan dari globalMonth jika ada
  const initialYear = useMemo(() => {
    if (globalMonth && /^\d{4}-\d{2}$/.test(globalMonth)) {
      return globalMonth.split("-")[0];
    }
    return String(new Date().getFullYear());
  }, [globalMonth]);

  const initialMonthIdx = useMemo(() => {
    if (globalMonth && /^\d{4}-\d{2}$/.test(globalMonth)) {
      const m = parseInt(globalMonth.split("-")[1], 10) - 1;
      return m >= 0 && m <= 11 ? m : 0;
    }
    return 0;
  }, [globalMonth]);

  const [selectedYear, setSelectedYear] = useState<string>(initialYear);
  const [periode, setPeriode] = useState<Periode>("bulanan");
  const [monthIndex, setMonthIndex] = useState<number>(initialMonthIdx);
  const [slideMode, setSlideMode] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedWA, setCopiedWA] = useState(false);
  const [showSlideOrderPanel, setShowSlideOrderPanel] = useState(false);
  
  // State untuk foto background slide pertama
  const [coverFoto, setCoverFoto] = useState<string>("");
  const [coverFotoName, setCoverFotoName] = useState<string>("");

  // Sinkronisasi otomatis jika globalMonth berubah dari header Admin
  useEffect(() => {
    if (globalMonth && /^\d{4}-\d{2}$/.test(globalMonth)) {
      const [yStr, mStr] = globalMonth.split("-");
      const mIdx = parseInt(mStr, 10) - 1;
      if (mIdx >= 0 && mIdx <= 11) {
        setSelectedYear(yStr);
        setMonthIndex(mIdx);
      }
    }
  }, [globalMonth]);

  // Hook Action Plan tersimpan per tahun + periode + bulan
  const {
    items: actionPlans,
    addItem: addActionPlan,
    toggleItem: toggleActionPlan,
    deleteItem: deleteActionPlan,
  } = useActionPlan(selectedYear, periode, monthIndex);

  // Hook Pengumpulan Sampah Terbanyak (input manual, per tahun + bulan)
  const { record: sampahRecord, updateRecord: updateSampahRecord } = useSampahTerbanyak(selectedYear, periode, monthIndex);

  // Hook Urutan & Visibilitas Slide (khusus Laporan Bulanan)
  const { order: slideOrder, moveUp: moveSlideUp, moveDown: moveSlideDown, toggleVisible: toggleSlideVisible, resetOrder: resetSlideOrder } = useSlideOrderConfig();

  // Hook Yakult Lady of the Month tersimpan per tahun + periode + bulan
  const otmKey = `presentasi_yl_otm_${selectedYear}_${periode}_${periode === "bulanan" ? monthIndex : "all"}`;
  const { record: otmRecord, loading: otmLoading, save: saveOtm, clear: clearOtm } = useYlOfTheMonth(otmKey);

  // Hook Slide Tambahan / Custom Foto Data (bisa dimunculkan atau disembunyikan) - maksimal 3 slide
  const customSlideKey1 = `presentasi_custom_slide_1_${selectedYear}_${periode}_${periode === "bulanan" ? monthIndex : "all"}`;
  const customSlideKey2 = `presentasi_custom_slide_2_${selectedYear}_${periode}_${periode === "bulanan" ? monthIndex : "all"}`;
  const customSlideKey3 = `presentasi_custom_slide_3_${selectedYear}_${periode}_${periode === "bulanan" ? monthIndex : "all"}`;

  const {
    record: customSlideRecord1,
    loading: customSlideLoading1,
    save: saveCustomSlide1,
    toggleEnabled: toggleCustomSlideEnabled1,
    uploadPhoto: uploadCustomSlidePhoto1,
    removePhoto: removeCustomSlidePhoto1,
    reset: resetCustomSlide1,
  } = useCustomSlide(customSlideKey1);

  const {
    record: customSlideRecord2,
    loading: customSlideLoading2,
    save: saveCustomSlide2,
    toggleEnabled: toggleCustomSlideEnabled2,
    uploadPhoto: uploadCustomSlidePhoto2,
    removePhoto: removeCustomSlidePhoto2,
    reset: resetCustomSlide2,
  } = useCustomSlide(customSlideKey2);

  const {
    record: customSlideRecord3,
    loading: customSlideLoading3,
    save: saveCustomSlide3,
    toggleEnabled: toggleCustomSlideEnabled3,
    uploadPhoto: uploadCustomSlidePhoto3,
    removePhoto: removeCustomSlidePhoto3,
    reset: resetCustomSlide3,
  } = useCustomSlide(customSlideKey3);

  // Load cover foto dari localStorage
  useEffect(() => {
    const coverKey = `presentasi_cover_foto_${selectedYear}_${periode}_${periode === "bulanan" ? monthIndex : "all"}`;
    try {
      const saved = localStorage.getItem(coverKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setCoverFoto(parsed.foto || "");
        setCoverFotoName(parsed.fotoName || "");
        if (parsed.foto) {
          // Migrasi data lama: pindahkan foto ke Supabase, sisakan nama saja di localStorage
          saveToSupabase(coverKey, { foto: parsed.foto, fotoName: parsed.fotoName || "" })
            .then((res) => {
              if (res?.success) localStorage.setItem(coverKey, JSON.stringify({ foto: "", fotoName: parsed.fotoName || "" }));
            })
            .catch((e) => console.error("Migrasi foto cover gagal:", e));
        } else {
          loadFromSupabase<{ foto?: string; fotoName?: string }>(coverKey)
            .then((remote) => { if (remote?.foto) setCoverFoto(remote.foto); })
            .catch(() => {});
        }
      } else {
        setCoverFoto("");
        setCoverFotoName("");
      }
    } catch {}
  }, [selectedYear, periode, monthIndex]);

  // State data arsip bulanan (PLG PJL, perYL) dan komparasi tahun lalu
  const [prevYearPerYL, setPrevYearPerYL] = useState<any[] | null>(null);
  const [archiveDetails, setArchiveDetails] = useState<MonthArchiveDetails | null>(null);

  // State Analisa AI Cerdas (Gemini) di Slide 10
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<{
    top3Baik?: string[];
    top2Perbaikan?: string[];
    kesimpulan?: string;
    speakerNotes?: string;
  } | null>(null);

  // Reset hasil AI ketika ganti bulan / tahun / periode agar tidak tercampur
  useEffect(() => {
    setAiAnalysisResult(null);
  }, [selectedYear, monthIndex, periode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [arc, prev] = await Promise.all([
          loadMonthArchiveDetails(selectedYear, monthIndex),
          loadPrevYearPerYL(selectedYear),
        ]);
        if (!cancelled) {
          if (arc) setArchiveDetails(arc);
          if (prev) setPrevYearPerYL(prev);
        }
      } catch (e) {
        console.error("Gagal memuat archiveDetails / prevYearPerYL:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYear, monthIndex]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const localKey = `sales_record_tku_${selectedYear}`;
        const localData = localStorage.getItem(localKey);
        if (localData) {
          if (!cancelled) setData(JSON.parse(localData));
        } else {
          const res = await loadFromSupabase<any>(localKey);
          if (res && res.tahun) {
            if (!cancelled) setData(res);
          } else if (selectedYear === "2026") {
            if (!cancelled) {
              setData(SEED_DATA_2026);
              try {
                localStorage.setItem(localKey, JSON.stringify(SEED_DATA_2026));
              } catch (e) {
                console.error(e);
              }
            }
          } else {
            if (!cancelled) setData(null);
          }
        }
      } catch (err) {
        console.error("Gagal memuat data presentasi:", err);
        if (!cancelled) {
          if (selectedYear === "2026") {
            setData(SEED_DATA_2026);
          } else {
            setData(null);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [selectedYear]);

  useEffect(() => {
    if (!globalMonth && data?.bulanan) {
      let latest = 0;
      for (let i = 11; i >= 0; i--) {
        if (data.bulanan[MONTHS[i]]) { latest = i; break; }
      }
      setMonthIndex(latest);
    }
  }, [data, globalMonth]);

  const bulanan = data?.bulanan || {};
  const perYL = data?.perYL || [];
  const tku = data?.tku || "DP JEMBER 1";

  const handleGenerateAiAnalysis = async () => {
    setIsAiGenerating(true);
    try {
      const curMonthLabel = MONTH_LABELS[monthIndex] || "";
      const curBulanan = bulanan[MONTHS[monthIndex]] || {};
      const resp = await fetch("/api/ai/evaluate-presentasi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periode,
          selectedYear,
          monthIndex,
          monthLabel: curMonthLabel,
          bulanan: curBulanan,
          perYL,
          currentArchive: archiveDetails || {}
        })
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.ok) {
          setAiAnalysisResult({
            top3Baik: json.top3Baik,
            top2Perbaikan: json.top2Perbaikan,
            kesimpulan: json.kesimpulan,
            speakerNotes: json.speakerNotes
          });
          showToast("✨ Analisa AI berhasil dihasilkan!");
        } else {
          showToast("⚠️ AI gagal: " + (json.error || "Silakan coba lagi"));
        }
      } else {
        showToast("⚠️ Gagal menghubungi modul AI presentasi server.");
      }
    } catch (e: any) {
      showToast("⚠️ Terjadi kesalahan: " + (e?.message || e));
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSyncFromArchives = async () => {
    setIsSyncing(true);
    try {
      let mergedData = data ? JSON.parse(JSON.stringify(data)) : {
        tku: "DP JEMBER 1",
        cabang: "JEMBER",
        tahun: selectedYear,
        jumlahYL: 10,
        bulanan: {},
        perYL: [],
      };

      let anyFound = false;
      const monthNumMap: Record<number, string> = {
        1: "jan", 2: "feb", 3: "mar", 4: "apr", 5: "mei", 6: "jun",
        7: "jul", 8: "agu", 9: "sep", 10: "okt", 11: "nov", 12: "des",
      };

      for (let mNum = 1; mNum <= 12; mNum++) {
        const mPad = String(mNum).padStart(2, "0");
        const archiveKey = `monthly_archive_${selectedYear}-${mPad}`;
        let arc: any = null;

        const localArc = localStorage.getItem(archiveKey);
        if (localArc) {
          try { arc = JSON.parse(localArc); } catch {}
        }
        if (!arc) {
          try {
            arc = await loadFromSupabase<any>(archiveKey);
          } catch {}
        }

        if (arc) {
          anyFound = true;
          const mKey = monthNumMap[mNum];
          const rec = arc.data || arc;
          const sumData = rec.summaryData || {};
          const evalData = rec.evaluasiData || {};

          mergedData.bulanan[mKey] = {
            akmPenjualan: sumData.totalPenjualan || mergedData.bulanan[mKey]?.akmPenjualan || 0,
            akmTarget: sumData.target || mergedData.bulanan[mKey]?.akmTarget || 0,
            ratarataPenjualanYL: sumData.rataHarian || mergedData.bulanan[mKey]?.ratarataPenjualanYL || 0,
            persenCapaian: sumData.target > 0 ? (sumData.totalPenjualan / sumData.target) * 100 : mergedData.bulanan[mKey]?.persenCapaian || 0,
            persenKembaliBotol: sumData.bbTimPersen !== undefined ? sumData.bbTimPersen : (mergedData.bulanan[mKey]?.persenKembaliBotol || 0),
            akmKembaliBotol: sumData.bbTimRaw || mergedData.bulanan[mKey]?.akmKembaliBotol || 0,
            salesPerYL: sumData.rataHarian || mergedData.bulanan[mKey]?.salesPerYL || 0,
            jwp: rec.hariKerja || mergedData.bulanan[mKey]?.jwp || 25,
            persenAreaTercover: mergedData.bulanan[mKey]?.persenAreaTercover || 85,
            absen: {
              jumlahYL: sumData.ylAbsen !== undefined ? sumData.ylAbsen : (mergedData.bulanan[mKey]?.absen?.jumlahYL || 0),
              frekuensi: sumData.frekuensiAbsen !== undefined ? sumData.frekuensiAbsen : (mergedData.bulanan[mKey]?.absen?.frekuensi || 0),
            },
            evaluasiPlus: evalData.plus || mergedData.bulanan[mKey]?.evaluasiPlus || [],
            evaluasiMinus: evalData.minus || mergedData.bulanan[mKey]?.evaluasiMinus || [],
            ratarataYO: sumData.ratarataProduk?.YO || mergedData.bulanan[mKey]?.ratarataYO || 0,
            ratarataOM: sumData.ratarataProduk?.OM || mergedData.bulanan[mKey]?.ratarataOM || 0,
            ratarataOS: sumData.ratarataProduk?.OS || mergedData.bulanan[mKey]?.ratarataOS || 0,
            ratarataYT: sumData.ratarataProduk?.YT || mergedData.bulanan[mKey]?.ratarataYT || 0,
          };

          if (Array.isArray(rec.salesData)) {
            if (!Array.isArray(mergedData.perYL) || mergedData.perYL.length === 0) {
              mergedData.perYL = rec.salesData.map((s: any) => ({
                area: s.area || "",
                nama: s.nama || "",
                penjualan: { [mKey]: s.total || s.penjualan || 0 },
              }));
            } else {
              rec.salesData.forEach((s: any) => {
                const existing = mergedData.perYL.find((yl: any) => String(yl.area) === String(s.area) || yl.nama === s.nama);
                if (existing) {
                  if (!existing.penjualan) existing.penjualan = {};
                  existing.penjualan[mKey] = s.total || s.penjualan || 0;
                }
              });
            }
          }
        }
      }

      if (anyFound) {
        setData(mergedData);
        const localKey = `sales_record_tku_${selectedYear}`;
        localStorage.setItem(localKey, JSON.stringify(mergedData));
        await saveToSupabase(localKey, mergedData);
        showToast("Berhasil menarik dan menyinkronkan data dari arsip Supabase!");
      } else {
        showToast("Tidak ditemukan arsip baru di Supabase. Data saat ini tetap dipertahankan.");
      }
    } catch (err) {
      console.error("Gagal sinkronisasi arsip:", err);
      showToast("Gagal menyinkronkan data arsip. Silakan periksa koneksi.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopyWhatsApp = async () => {
    try {
      const summaryText = generateWhatsAppSummary({
        periode,
        selectedYear,
        monthIndex,
        data,
        actionPlans,
      });
      await navigator.clipboard.writeText(summaryText);
      setCopiedWA(true);
      showToast("Ringkasan WhatsApp berhasil disalin ke clipboard!");
      setTimeout(() => setCopiedWA(false), 3000);
    } catch (err) {
      console.error("Gagal menyalin ringkasan:", err);
      showToast("Gagal menyalin. Silakan pilih teks manual.");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Handler upload cover foto
  const handleUploadCoverFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await resizeCustomSlidePhoto(file);
      setCoverFoto(b64);
      setCoverFotoName(file.name);
      const coverKey = `presentasi_cover_foto_${selectedYear}_${periode}_${periode === "bulanan" ? monthIndex : "all"}`;
      localStorage.setItem(coverKey, JSON.stringify({ foto: "", fotoName: file.name }));
      try {
        await saveToSupabase(coverKey, { foto: b64, fotoName: file.name });
      } catch (e) {
        console.error("Gagal menyinkronkan foto cover ke Supabase:", e);
      }
    } catch (err) {
      console.error("Gagal upload cover foto:", err);
    }
  };

  const handleRemoveCoverFoto = () => {
    setCoverFoto("");
    setCoverFotoName("");
    const coverKey = `presentasi_cover_foto_${selectedYear}_${periode}_${periode === "bulanan" ? monthIndex : "all"}`;
    localStorage.removeItem(coverKey);
    deleteFromSupabase(coverKey).catch((e) => console.error("Gagal menghapus foto cover dari Supabase:", e));
  };

  // Bangun slide untuk Mode Presentasi sesuai periode yang aktif
  const slides = useMemo(() => {
    if (!data) return [];
    const injectOtm = (arr: SlideDef[]): SlideDef[] => {
      if (arr.length === 0 || !otmRecord) return arr;
      return [
        ...arr,
        buildYlOtmTeaserSlide(periode, MONTH_LABELS[monthIndex], selectedYear, otmRecord),
        buildYlOtmSlide(otmRecord, periode),
      ];
    };
    if (periode === "bulanan") {
      const m = applyTahunLaluFallback(bulanan[MONTHS[monthIndex]], selectedYear, monthIndex);
      if (!m) return [];
      const prevIdx = monthIndex - 1;
      const prevM = prevIdx >= 0 ? bulanan[MONTHS[prevIdx]] : null;

      // Kumpulkan custom slides yang enabled (maksimal 3)
      const customSlides: SlideDef[] = [];
      if (customSlideRecord1?.enabled && customSlideRecord1.foto) {
        customSlides.push(buildCustomPhotoSlide({
          customSlide: customSlideRecord1,
          onUploadPhoto: uploadCustomSlidePhoto1,
          onToggleEnabled: toggleCustomSlideEnabled1,
        }));
      }
      if (customSlideRecord2?.enabled && customSlideRecord2.foto) {
        customSlides.push(buildCustomPhotoSlide({
          customSlide: customSlideRecord2,
          onUploadPhoto: uploadCustomSlidePhoto2,
          onToggleEnabled: toggleCustomSlideEnabled2,
        }));
      }
      if (customSlideRecord3?.enabled && customSlideRecord3.foto) {
        customSlides.push(buildCustomPhotoSlide({
          customSlide: customSlideRecord3,
          onUploadPhoto: uploadCustomSlidePhoto3,
          onToggleEnabled: toggleCustomSlideEnabled3,
        }));
      }

      const bulananSlides = buildBulananSlides({
        m,
        prevM,
        monthLabel: MONTH_LABELS[monthIndex],
        monthIndex,
        tahun: selectedYear,
        tku,
        perYL,
        actionPlans,
        prevYearPerYL,
        archiveDetails,
        coverFoto,
        coverFotoName,
        onUploadCoverFoto: handleUploadCoverFoto,
        onRemoveCoverFoto: handleRemoveCoverFoto,
        sampah: sampahRecord,
        onSampahChange: updateSampahRecord,
      });

      // Terapkan urutan & visibilitas slide sesuai pengaturan (kalau ada slide yg disembunyikan/diurutkan ulang)
      const orderedBulananSlides = slideOrder
        .filter((o) => o.visible)
        .map((o) => bulananSlides.find((s) => s.id === o.id))
        .filter((s): s is SlideDef => !!s);

      // Sisipkan custom slides (Lampiran Data Tambahan) setelah slide Evaluasi Mix Produk
      const result = [...orderedBulananSlides];
      const mixProdukIdx = result.findIndex(s => s.id === "mixproduk" || s.eyebrow?.includes("Mix Produk") || s.title?.includes("Mix Produk"));
      if (mixProdukIdx !== -1 && customSlides.length > 0) {
        result.splice(mixProdukIdx + 1, 0, ...customSlides);
      } else {
        result.push(...customSlides);
      }

      // Hapus slide action plan (indeks terakhir)
      // Cari dan hapus slide dengan isActionPlan = true
      const filteredResult = result.filter(s => !s.isActionPlan);

      return injectOtm(filteredResult);
    }
    if (periode === "s1") {
      const agg = computeSemesterAgg(bulanan, 0, 5, selectedYear);
      if (agg.monthsData.length === 0) return [];
      const semSlides = buildSemesterSlides(agg, "Semester 1", "Januari – Juni", selectedYear, tku, actionPlans, perYL, sampahRecord, updateSampahRecord, coverFoto);
      const filtered = semSlides.filter(s => !s.isActionPlan);
      return injectOtm(filtered);
    }
    if (periode === "s2") {
      const s2 = computeSemester2Agg(bulanan, selectedYear);
      if (s2.agg.monthsData.length === 0) return [];
      const semSlides = buildSemester2Slides(s2, selectedYear, tku, data.jumlahYL || perYL.length || 10, actionPlans, perYL, sampahRecord, updateSampahRecord, coverFoto);
      const filtered = semSlides.filter(s => !s.isActionPlan);
      return injectOtm(filtered);
    }
    if (periode === "tahunan") {
      const t = computeTahunanAgg(bulanan, data.tahun || selectedYear);
      if (!t) return [];
      const tahSlides = buildTahunanSlides(t, data.tahun || selectedYear, tku, actionPlans, perYL, sampahRecord, updateSampahRecord, coverFoto);
      const filtered = tahSlides.filter(s => !s.isActionPlan);
      return injectOtm(filtered);
    }
    return [];
  }, [
    data,
    periode,
    bulanan,
    monthIndex,
    perYL,
    selectedYear,
    tku,
    actionPlans,
    otmRecord,
    prevYearPerYL,
    archiveDetails,
    coverFoto,
    coverFotoName,
    sampahRecord,
    updateSampahRecord,
    slideOrder,
    customSlideRecord1,
    customSlideRecord2,
    customSlideRecord3,
    uploadCustomSlidePhoto1,
    uploadCustomSlidePhoto2,
    uploadCustomSlidePhoto3,
    toggleCustomSlideEnabled1,
    toggleCustomSlideEnabled2,
    toggleCustomSlideEnabled3,
  ]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <p className="text-sm font-bold">Memuat data presentasi...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-16">
        <EmptyMonthNote label={`tahun ${selectedYear}`} />
      </div>
    );
  }

  if (slideMode) {
    return (
      <SlideShow
        slides={slides}
        onClose={() => setSlideMode(false)}
        actionPlans={actionPlans}
        onAddActionPlan={addActionPlan}
        onToggleActionPlan={toggleActionPlan}
        onDeleteActionPlan={deleteActionPlan}
      />
    );
  }

  return (
    <div className="space-y-4 pb-16">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-[250] bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Print-only Header */}
      <div className="hidden print:block mb-6 text-center border-b border-slate-300 pb-4">
        <h1 className="text-xl font-black text-slate-900 uppercase">
          LAPORAN EVALUASI PERFORMA {data.tku || "DP JEMBER 1"}
        </h1>
        <p className="text-xs text-slate-600 font-medium mt-1">
          Periode: {periode === "bulanan" ? `${MONTH_LABELS[monthIndex]} ${selectedYear}` : periode === "s1" ? `Semester 1 ${selectedYear}` : periode === "s2" ? `Semester 2 ${selectedYear}` : `Tahunan ${selectedYear}`} &middot; Dicetak pada {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Header + Year selector */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <MenuTitleIcon id="presentasi" className="w-5 h-5 text-orange-500" /> Presentasi &amp; Evaluasi
          </h2>
          <p className="text-xs text-slate-400 font-medium">{data.tku || "DP JEMBER 1"} &middot; {data.cabang || "JEMBER"}</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          <button
            onClick={() => setSelectedYear(String(parseInt(selectedYear) - 1))}
            className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-500 cursor-pointer"
            title="Tahun Sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-black text-slate-800 dark:text-white px-2">{selectedYear}</span>
          <button
            onClick={() => setSelectedYear(String(parseInt(selectedYear) + 1))}
            className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-500 cursor-pointer"
            title="Tahun Berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cover Foto Upload */}
      <div className="no-print bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Foto Cover Slide Pertama:</span>
          </div>
          {coverFoto ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 truncate max-w-[200px]">{coverFotoName || "Foto cover"}</span>
              <button
                onClick={handleRemoveCoverFoto}
                className="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-950/30 cursor-pointer"
              >
                Hapus
              </button>
            </div>
          ) : (
            <label className="cursor-pointer">
              <span className="text-xs font-bold text-orange-500 hover:text-orange-600 px-3 py-1 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                Upload Foto Cover
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={handleUploadCoverFoto} />
            </label>
          )}
          <span className="text-[10px] text-slate-400">Foto akan tampil penuh sebagai slide pertama (Bulanan/Semester/Tahunan), menggantikan slide judul teks</span>
        </div>
      </div>

      {/* Action Bar: Mode Presentasi & Kontrol Tambahan */}
      <div className="space-y-2 no-print">
        <button
          onClick={async () => {
            try {
              if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
              }
            } catch {}
            try {
              const orient = (screen as any).orientation;
              if (orient?.lock) {
                await orient.lock("landscape");
              }
            } catch {}
            setSlideMode(true);
          }}
          disabled={slides.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-700 to-brand-600 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white font-black text-xs sm:text-sm py-3 rounded-2xl shadow-md cursor-pointer transition-all active:scale-[0.98]"
        >
          <Play className="w-4 h-4 fill-white" /> Mode Presentasi (Layar Penuh)
        </button>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleSyncFromArchives}
            disabled={isSyncing}
            className="flex items-center justify-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-500 text-slate-700 dark:text-slate-200 text-xs font-bold py-2 px-2 rounded-xl shadow-xs cursor-pointer transition-all active:scale-95 disabled:opacity-50"
            title="Tarik & Sinkronkan Data dari Arsip Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand-500 shrink-0 ${isSyncing ? "animate-spin" : ""}`} />
            <span className="truncate">{isSyncing ? "Menyinkronkan..." : "Tarik Arsip"}</span>
          </button>

          <button
            onClick={handleCopyWhatsApp}
            className="flex items-center justify-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold py-2 px-2 rounded-xl shadow-xs cursor-pointer transition-all active:scale-95"
            title="Salin Ringkasan Eksekutif untuk WhatsApp"
          >
            {copiedWA ? (
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <Share2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            )}
            <span className="truncate">{copiedWA ? "Tersalin!" : "Ringkasan WA"}</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 text-slate-700 dark:text-slate-200 text-xs font-bold py-2 px-2 rounded-xl shadow-xs cursor-pointer transition-all active:scale-95"
            title="Cetak atau Simpan sebagai PDF"
          >
            <Printer className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="truncate">Cetak / PDF</span>
          </button>
        </div>
      </div>

      {/* Filter periode */}
      <div className="grid grid-cols-4 gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl no-print">
        {([
          { id: "bulanan", label: "Bulanan" },
          { id: "s1", label: "Semester 1" },
          { id: "s2", label: "Semester 2" },
          { id: "tahunan", label: "Tahunan" },
        ] as { id: Periode; label: string }[]).map((opt) => (
          <button
            key={opt.id}
            onClick={() => setPeriode(opt.id)}
            className={`text-[11px] sm:text-xs font-bold py-2 rounded-xl transition-all cursor-pointer ${
              periode === opt.id
                ? "bg-brand-600 text-white shadow-md"
                : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-700/60"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Pengaturan Urutan & Tampilan Slide — khusus Laporan Bulanan */}
      {periode === "bulanan" && (
        <div className="no-print bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSlideOrderPanel(!showSlideOrderPanel)}
            className="w-full flex items-center justify-between p-3 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-brand-500" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Atur Urutan & Tampilkan/Sembunyikan Slide</span>
            </div>
            {showSlideOrderPanel ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {showSlideOrderPanel && (
            <div className="px-3 pb-3 space-y-1.5">
              <p className="text-[10px] text-slate-400 mb-1">
                Panah untuk mengubah urutan, ikon mata untuk sembunyikan/tampilkan slide. Slide "Lampiran", "Momen Penghargaan", dan "YOM" diatur terpisah dan selalu mengikuti posisi tetap.
              </p>
              {slideOrder.map((item, i) => {
                const def = BULANAN_SLIDE_DEFS.find((d) => d.id === item.id);
                if (!def) return null;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border ${
                      item.visible
                        ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                        : "bg-slate-100 dark:bg-slate-800/50 border-dashed border-slate-300 dark:border-slate-700 opacity-60"
                    }`}
                  >
                    <span className="text-[10px] font-mono text-slate-400 w-4 shrink-0">{i + 1}</span>
                    <span className={`flex-1 text-[11px] font-bold truncate ${item.visible ? "text-slate-700 dark:text-slate-200" : "text-slate-400 line-through"}`}>
                      {def.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => moveSlideUp(item.id)}
                      disabled={i === 0}
                      className="p-1 rounded-md text-slate-400 hover:text-brand-500 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Pindah ke atas"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlideDown(item.id)}
                      disabled={i === slideOrder.length - 1}
                      className="p-1 rounded-md text-slate-400 hover:text-brand-500 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Pindah ke bawah"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSlideVisible(item.id)}
                      className={`p-1 rounded-md cursor-pointer ${item.visible ? "text-emerald-500 hover:text-emerald-600" : "text-slate-400 hover:text-slate-500"}`}
                      title={item.visible ? "Sembunyikan slide ini" : "Tampilkan slide ini"}
                    >
                      {item.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={resetSlideOrder}
                className="w-full mt-1 text-[10px] font-bold text-slate-500 hover:text-brand-500 py-1.5 cursor-pointer"
              >
                Kembalikan ke Urutan Default
              </button>
            </div>
          )}
        </div>
      )}

      <YlOfTheMonthCard
        perYL={perYL}
        bulanan={bulanan}
        periode={periode}
        monthIndex={monthIndex}
        selectedYear={selectedYear}
        periodeLabel={
          periode === "bulanan"
            ? `${MONTH_LABELS[monthIndex]} ${selectedYear}`
            : periode === "s1"
            ? "Semester 1"
            : periode === "s2"
            ? "Semester 2"
            : `Tahunan ${selectedYear}`
        }
        record={otmRecord}
        loading={otmLoading}
        onSave={saveOtm}
        onClear={clearOtm}
      />

      {/* 3 Custom Slide Cards */}
      <div className="space-y-2">
        <CustomSlideCard
          record={customSlideRecord1}
          loading={customSlideLoading1}
          onSave={saveCustomSlide1}
          onToggleEnabled={toggleCustomSlideEnabled1}
          onUploadPhoto={uploadCustomSlidePhoto1}
          onRemovePhoto={removeCustomSlidePhoto1}
          onReset={resetCustomSlide1}
          label={`Slide Tambahan #1`}
        />
        <CustomSlideCard
          record={customSlideRecord2}
          loading={customSlideLoading2}
          onSave={saveCustomSlide2}
          onToggleEnabled={toggleCustomSlideEnabled2}
          onUploadPhoto={uploadCustomSlidePhoto2}
          onRemovePhoto={removeCustomSlidePhoto2}
          onReset={resetCustomSlide2}
          label={`Slide Tambahan #2`}
        />
        <CustomSlideCard
          record={customSlideRecord3}
          loading={customSlideLoading3}
          onSave={saveCustomSlide3}
          onToggleEnabled={toggleCustomSlideEnabled3}
          onUploadPhoto={uploadCustomSlidePhoto3}
          onRemovePhoto={removeCustomSlidePhoto3}
          onReset={resetCustomSlide3}
          label={`Slide Tambahan #3`}
        />
      </div>

      {periode === "bulanan" && (
        <LaporanBulanan
          bulanan={bulanan}
          perYL={perYL}
          monthIndex={monthIndex}
          setMonthIndex={setMonthIndex}
          selectedYear={selectedYear}
        />
      )}
      {periode === "s1" && (
        <LaporanSemester
          bulanan={bulanan}
          perYL={perYL}
          startIdx={0}
          endIdx={5}
          title="Semester 1 (Januari – Juni)"
          tahun={data.tahun || selectedYear}
        />
      )}
      {periode === "s2" && (
        <LaporanSemester2
          bulanan={bulanan}
          perYL={perYL}
          jumlahYL={data.jumlahYL || perYL.length || 10}
          tahun={data.tahun || selectedYear}
        />
      )}
      {periode === "tahunan" && (
        <LaporanTahunan
          bulanan={bulanan}
          perYL={perYL}
          tahun={data.tahun || selectedYear}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Komponen Tabel Rata-Rata Penjualan per YL
// ----------------------------------------------------------------------------

export function TabelRataRataYL({
  perYL,
  startIdx,
  endIdx,
  title,
  subtitle,
  isDarkSlide = false,
}: {
  perYL: any[];
  startIdx: number;
  endIdx: number;
  title?: string;
  subtitle?: string;
  isDarkSlide?: boolean;
}) {
  const [sortBy, setSortBy] = useState<"rank" | "area">("rank");
  const [colMode, setColMode] = useState<"compact" | "all">("all");
  const [density] = useState<"compact" | "normal">(isDarkSlide ? "compact" : "normal");

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setColMode("compact");
    }
  }, []);

  const {
    rows,
    monthIndices,
    teamMonthlyAvgs,
    teamOverallAvg,
    totalMandiri,
    totalBinaan,
    totalUp,
    totalDown,
    totalCoaching,
  } = useMemo(() => {
    return computeYLAverageData(perYL, startIdx, endIdx);
  }, [perYL, startIdx, endIdx]);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    if (sortBy === "area") {
      list.sort((a, b) => a.area.localeCompare(b.area, undefined, { numeric: true }));
    } else {
      list.sort((a, b) => b.rataRata - a.rataRata);
    }
    return list;
  }, [rows, sortBy]);

  const top1 = rows[0];
  const startMonthName = MONTH_LABELS[startIdx] || "";
  const endMonthName = MONTH_LABELS[endIdx] || "";
  const monthCount = monthIndices.length;
  const isCompactDensity = density === "compact";

  if (!perYL || perYL.length === 0) {
    return (
      <div className={`p-4 text-center text-xs ${isDarkSlide ? "text-slate-400" : "text-slate-500"}`}>
        Data penjualan per Yakult Lady belum tersedia untuk periode ini.
      </div>
    );
  }

  return (
    <div className={isDarkSlide ? "space-y-1.5 w-full" : "space-y-3"}>
      {(!isDarkSlide || title) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            {title && (
              <h4 className={`text-xs font-black flex items-center gap-1.5 ${isDarkSlide ? "text-white" : "text-slate-900 dark:text-white"}`}>
                <Users className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                <span>{title}</span>
              </h4>
            )}
            {subtitle ? (
              <p className={`text-[9.5px] mt-0.2 ${isDarkSlide ? "text-slate-400" : "text-slate-500 dark:text-slate-400"}`}>
                {subtitle}
              </p>
            ) : (
              <p className={`text-[9.5px] mt-0.2 ${isDarkSlide ? "text-slate-400" : "text-slate-500 dark:text-slate-400"}`}>
                Rata-rata penjualan harian (botol/hari) dari bulan {startMonthName} s/d {endMonthName} ({monthCount} bulan)
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 self-start sm:self-auto shrink-0 flex-wrap">
            <div className={`flex items-center p-0.5 rounded-lg border text-[9px] sm:text-[9.5px] font-bold ${
              isDarkSlide ? "bg-slate-800/90 border-slate-700" : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            }`}>
              <button
                type="button"
                onClick={() => setColMode("compact")}
                className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                  colMode === "compact"
                    ? "bg-orange-500 text-white shadow-sm"
                    : isDarkSlide ? "text-slate-400 hover:text-white" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
                title="Mode Ringkas: Tampilkan 10 YL langsung tanpa geser horizontal"
              >
                📱 Ringkas (10 YL)
              </button>
              <button
                type="button"
                onClick={() => setColMode("all")}
                className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                  colMode === "all"
                    ? "bg-orange-500 text-white shadow-sm"
                    : isDarkSlide ? "text-slate-400 hover:text-white" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
                title="Mode Lengkap: Tampilkan seluruh bulan"
              >
                📊 Semua Bulan
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSortBy(sortBy === "rank" ? "area" : "rank")}
              className={`inline-flex items-center gap-1 font-bold px-1.5 py-0.5 rounded border transition-all cursor-pointer text-[9px] sm:text-[9.5px] ${
                isDarkSlide
                  ? "bg-slate-800/90 border-slate-700 text-slate-300 hover:text-white"
                  : "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-orange-400"
              }`}
              title="Klik untuk ubah urutan data"
            >
              <ArrowUpDown className="w-2.5 h-2.5 text-orange-500" />
              <span>{sortBy === "rank" ? "Rank ⬇" : "Area ⬇"}</span>
            </button>
          </div>
        </div>
      )}

      {isDarkSlide ? (
        <div className="flex items-center justify-between gap-1 flex-wrap bg-slate-800/70 border border-slate-700/80 rounded-lg px-2 py-0.5 text-[9px] sm:text-[10px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 font-bold text-orange-300">
              <span className="text-slate-400 font-normal">Rata² Tim:</span>
              <span className="font-mono font-black text-white">{fmtNum(teamOverallAvg)}</span>
              <span className="text-[8px] text-slate-400 font-normal">btl/hr</span>
            </span>
            <span className="text-slate-600 hidden sm:inline">&middot;</span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-400">
              <span className="text-slate-400 font-normal">Mandiri:</span>
              <span className="font-mono font-black">{totalMandiri} YL</span>
            </span>
            <span className="text-slate-600 hidden sm:inline">&middot;</span>
            <span className="inline-flex items-center gap-1 font-bold text-amber-400">
              <span className="text-slate-400 font-normal">Binaan:</span>
              <span className="font-mono font-black">{totalBinaan} YL</span>
            </span>
            <span className="text-slate-600 hidden sm:inline">&middot;</span>
            <span className="inline-flex items-center gap-1 font-bold text-teal-300">
              <span className="text-slate-400 font-normal">Tren:</span>
              <span className="text-emerald-400 inline-flex items-center"><ArrowUpRight className="w-2.5 h-2.5" />{totalUp}</span>
              <span className="text-slate-500">/</span>
              <span className="text-rose-400 inline-flex items-center"><ArrowDownRight className="w-2.5 h-2.5" />{totalDown}</span>
            </span>
            <span className="text-slate-600 hidden sm:inline">&middot;</span>
            <span className="inline-flex items-center gap-1 font-bold text-rose-400">
              <span className="text-slate-400 font-normal">Coaching:</span>
              <span className="font-mono font-black">{totalCoaching} YL</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <div className="flex items-center p-0.5 rounded border border-slate-700 bg-slate-900/80 text-[8.5px] font-bold">
              <button
                type="button"
                onClick={() => setColMode("compact")}
                className={`px-1.5 py-0.2 rounded transition-all cursor-pointer ${
                  colMode === "compact" ? "bg-orange-500 text-white font-black" : "text-slate-400 hover:text-white"
                }`}
                title="Mode Ringkas 10 YL"
              >
                Ringkas
              </button>
              <button
                type="button"
                onClick={() => setColMode("all")}
                className={`px-1.5 py-0.2 rounded transition-all cursor-pointer ${
                  colMode === "all" ? "bg-orange-500 text-white font-black" : "text-slate-400 hover:text-white"
                }`}
                title="Mode Semua Bulan"
              >
                Semua Bulan
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSortBy(sortBy === "rank" ? "area" : "rank")}
              className="inline-flex items-center gap-0.5 font-bold px-1.5 py-0.5 rounded border border-slate-700 bg-slate-900/80 text-slate-300 hover:text-white text-[8.5px] cursor-pointer"
              title="Urutkan Peringkat / Area"
            >
              <ArrowUpDown className="w-2.5 h-2.5 text-orange-400" />
              <span>{sortBy === "rank" ? "Rank" : "Area"}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
          <div className="rounded-xl border p-2.5 bg-orange-50/60 dark:bg-orange-950/20 border-orange-200/60 dark:border-orange-900/40">
            <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">Rata² Tim</p>
            <p className="font-black text-base sm:text-lg text-slate-900 dark:text-white mt-0.5">
              {fmtNum(teamOverallAvg)} <span className="text-xs font-normal text-slate-400">btl/hr</span>
            </p>
          </div>

          <div className="rounded-xl border p-2.5 bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Mandiri (≥250)</p>
            <p className="font-black text-base sm:text-lg text-emerald-700 dark:text-emerald-300 mt-0.5">
              {totalMandiri} <span className="text-xs font-normal text-slate-400">YL</span>
            </p>
          </div>

          <div className="rounded-xl border p-2.5 bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/40">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Binaan (&lt;250)</p>
            <p className="font-black text-base sm:text-lg text-amber-700 dark:text-amber-300 mt-0.5">
              {totalBinaan} <span className="text-xs font-normal text-slate-400">YL</span>
            </p>
          </div>

          <div className="rounded-xl border p-2.5 bg-teal-50/60 dark:bg-teal-950/20 border-teal-200/60 dark:border-teal-900/40">
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">Tren Performa</p>
            <p className="font-black text-xs sm:text-sm text-slate-800 dark:text-white mt-1 flex items-center gap-1.5">
              <span className="text-emerald-500 font-bold inline-flex items-center">
                <ArrowUpRight className="w-3.5 h-3.5" /> {totalUp}
              </span>
              <span className="text-slate-400">&middot;</span>
              <span className="text-rose-500 font-bold inline-flex items-center">
                <ArrowDownRight className="w-3.5 h-3.5" /> {totalDown}
              </span>
            </p>
          </div>

          <div className="rounded-xl border p-2.5 bg-rose-50/60 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/40">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Perlu Coaching</p>
            <p className="font-black text-base sm:text-lg text-rose-700 dark:text-rose-300 mt-0.5">
              {totalCoaching} <span className="text-xs font-normal text-slate-400">YL</span>
            </p>
          </div>
        </div>
      )}

      <div className={`rounded-xl border ${
        isDarkSlide
          ? "w-full overflow-x-auto border-slate-700/80 bg-slate-900/60 shadow-lg"
          : "overflow-x-auto border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40"
      }`}>
        <table className={`w-full border-collapse ${
          isCompactDensity
            ? "text-[9.5px] sm:text-[10.5px]"
            : "text-[11px] sm:text-xs"
        }`}>
          <thead>
            <tr className={`border-b ${
              isDarkSlide
                ? "bg-slate-800/95 text-slate-300 border-slate-700"
                : "bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            }`}>
              <th className={`sticky left-0 z-20 ${
                isDarkSlide ? "bg-slate-800" : "bg-slate-100 dark:bg-slate-800"
              } ${isCompactDensity ? "py-1 px-1 w-6 sm:w-7" : "py-1.5 px-1.5 w-8"} text-center font-bold`}>
                #
              </th>
              <th className={`sticky left-[24px] sm:left-[28px] z-20 ${
                isDarkSlide ? "bg-slate-800" : "bg-slate-100 dark:bg-slate-800"
              } ${isCompactDensity ? "py-1 px-1 w-8 sm:w-10" : "py-1.5 px-1.5 w-10 sm:w-12"} text-center font-bold`}>
                Area
              </th>
              <th className={`sticky left-[56px] sm:left-[68px] z-20 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.3)] border-r ${
                isDarkSlide ? "bg-slate-800 border-slate-700/80" : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              } ${isCompactDensity ? "py-1 px-1.5 min-w-[85px] max-w-[120px]" : "py-1.5 px-2 min-w-[110px]"} text-left font-bold truncate`}>
                Nama Yakult Lady
              </th>
              {colMode === "all" && monthIndices.map((i) => (
                <th key={i} className={`${isCompactDensity ? "py-1 px-1 text-center sm:text-right min-w-[38px] sm:min-w-[46px]" : "py-1.5 px-2 text-right min-w-[50px]"} font-bold`}>
                  {MONTH_SHORT[i]}
                </th>
              ))}
              <th className={`${
                isCompactDensity ? "py-1 px-1.5" : "py-1.5 px-2"
              } text-right font-black ${
                isDarkSlide
                  ? "text-orange-400 bg-orange-500/10"
                  : "text-orange-600 dark:text-orange-400 bg-orange-100/50 dark:bg-orange-950/40"
              } ${colMode === "compact" ? "min-w-[65px]" : "min-w-[55px]"}`}>
                Rata²
              </th>
              <th className={`${isCompactDensity ? "py-1 px-1 min-w-[46px]" : "py-1.5 px-2 min-w-[60px]"} text-center font-bold`}>
                Tren
              </th>
              <th className={`${isCompactDensity ? "py-1 px-1 min-w-[60px]" : "py-1.5 px-2 min-w-[85px]"} text-center font-bold`}>
                Status
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDarkSlide ? "divide-slate-800/80" : "divide-slate-100 dark:divide-slate-800"}`}>
            {sortedRows.map((r) => {
              const originalRank = rows.findIndex((item) => item.area === r.area) + 1;
              const medal = originalRank === 1 ? "🥇" : originalRank === 2 ? "🥈" : originalRank === 3 ? "🥉" : null;

              return (
                <tr
                  key={r.area}
                  className={`group transition-colors ${
                    isDarkSlide
                      ? "hover:bg-slate-800/50"
                      : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <td className={`sticky left-0 z-10 ${
                    isDarkSlide ? "bg-[#0E1220] group-hover:bg-slate-800" : "bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800"
                  } ${isDarkSlide ? "py-0.5 px-0.5" : isCompactDensity ? "py-0.5 px-1" : "py-1.5 px-2"} text-center font-bold`}>
                    {medal ? (
                      <span className={isCompactDensity ? "text-[10px]" : "text-xs"} title={`Peringkat ${originalRank}`}>{medal}</span>
                    ) : (
                      <span className="text-slate-400 font-mono text-[9px] sm:text-[10px]">{originalRank}</span>
                    )}
                  </td>
                  <td className={`sticky left-[20px] sm:left-[24px] z-10 ${
                    isDarkSlide ? "bg-[#0E1220] group-hover:bg-slate-800" : "bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800"
                  } ${isDarkSlide ? "py-0.5 px-0.5 text-[9px]" : isCompactDensity ? "py-0.5 px-1 text-[9.5px]" : "py-1.5 px-2 text-[10.5px]"} text-center font-mono font-bold text-slate-400`}>
                    {r.area}
                  </td>
                  <td className={`sticky left-[48px] sm:left-[58px] z-10 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.3)] border-r ${
                    isDarkSlide
                      ? "bg-[#0E1220] border-slate-700/80 text-white group-hover:bg-slate-800"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 group-hover:bg-slate-50 dark:group-hover:bg-slate-800"
                  } ${isDarkSlide ? "py-0.5 px-1 max-w-[85px] sm:max-w-[120px]" : isCompactDensity ? "py-0.5 px-1.5 max-w-[95px] sm:max-w-[130px]" : "py-1.5 px-2 max-w-[140px]"} font-bold truncate text-[9.5px] sm:text-[10.5px]`}>
                    {r.nama}
                  </td>
                  {colMode === "all" && r.monthlyValues.map((m, mIdx) => (
                    <td
                      key={mIdx}
                      className={`${isDarkSlide ? "py-0.5 px-0.5 text-center sm:text-right font-mono text-[9px] sm:text-[9.5px]" : isCompactDensity ? "py-0.5 px-1 text-center sm:text-right font-mono" : "py-1.5 px-2 text-right font-mono"} font-medium ${
                        m.value === null || m.value === undefined
                          ? "text-slate-400 dark:text-slate-600"
                          : isDarkSlide
                          ? "text-slate-200"
                          : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {m.value !== null && m.value !== undefined ? fmtNum(m.value) : "-"}
                    </td>
                  ))}
                  <td className={`${
                    isDarkSlide ? "py-0.5 px-1 font-mono font-black text-[9.5px] sm:text-[10.5px]" : isCompactDensity ? "py-0.5 px-1.5 font-mono font-black" : "py-1.5 px-2 font-mono font-black"
                  } ${
                    isDarkSlide
                      ? "text-orange-400 bg-orange-500/10"
                      : "text-orange-600 dark:text-orange-400 bg-orange-50/60 dark:bg-orange-950/30"
                  } text-right`}>
                    {fmtNum(r.rataRata)}
                  </td>
                  <td className={`${isDarkSlide ? "py-0.5 px-0.5" : isCompactDensity ? "py-0.5 px-1" : "py-1.5 px-2"} text-center`}>
                    {r.trend === "up" ? (
                      <span className={`inline-flex items-center ${isDarkSlide ? "text-[8px] sm:text-[8.5px]" : isCompactDensity ? "text-[8.5px] sm:text-[9.5px]" : "text-[10px]"} font-bold text-emerald-400 gap-0.5`} title={`Kenaikan +${Math.abs(r.delta).toFixed(1)} botol`}>
                        <ArrowUpRight className={isDarkSlide ? "w-2 h-2" : isCompactDensity ? "w-2.5 h-2.5" : "w-3 h-3"} /> +{Math.abs(r.delta).toFixed(0)}
                      </span>
                    ) : r.trend === "down" ? (
                      <span className={`inline-flex items-center ${isDarkSlide ? "text-[8px] sm:text-[8.5px]" : isCompactDensity ? "text-[8.5px] sm:text-[9.5px]" : "text-[10px]"} font-bold text-rose-400 gap-0.5`} title={`Penurunan -${Math.abs(r.delta).toFixed(1)} botol`}>
                        <ArrowDownRight className={isDarkSlide ? "w-2 h-2" : isCompactDensity ? "w-2.5 h-2.5" : "w-3 h-3"} /> -{Math.abs(r.delta).toFixed(0)}
                      </span>
                    ) : (
                      <span className={`inline-flex items-center ${isDarkSlide ? "text-[8px] sm:text-[8.5px]" : isCompactDensity ? "text-[8.5px] sm:text-[9.5px]" : "text-[10px]"} font-medium text-slate-400 gap-0.5`}>
                        <ArrowRightIcon className="w-2 h-2" /> Stb
                      </span>
                    )}
                  </td>
                  <td className={`${isDarkSlide ? "py-0.5 px-0.5" : isCompactDensity ? "py-0.5 px-1" : "py-1.5 px-2"} text-center`}>
                    {r.isMandiri ? (
                      r.trend === "down" ? (
                        <span className={`inline-block font-black rounded border ${
                          isDarkSlide
                            ? "text-[7.5px] sm:text-[8px] px-1 py-0 bg-amber-500/20 border-amber-500/30 text-amber-300"
                            : "text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                        }`}>
                          Mandiri (Drop)
                        </span>
                      ) : (
                        <span className={`inline-block font-black rounded border ${
                          isDarkSlide
                            ? "text-[7.5px] sm:text-[8px] px-1 py-0 bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                            : "text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                        }`}>
                          Mandiri
                        </span>
                      )
                    ) : (
                      <span className={`inline-block font-black rounded border ${
                        isDarkSlide
                          ? "text-[7.5px] sm:text-[8px] px-1 py-0 bg-rose-500/20 border-rose-500/30 text-rose-300"
                          : "text-[9px] px-1.5 py-0.5 bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300"
                      }`}>
                        Coaching
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className={`border-t-2 font-black ${
              isDarkSlide
                ? "border-slate-700 bg-slate-800/95 text-white"
                : "border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
            }`}>
              <td colSpan={3} className={`sticky left-0 z-20 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.3)] border-r ${
                isDarkSlide ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              } ${isDarkSlide ? "py-0.5 px-1 text-[8.5px] sm:text-[9.5px]" : isCompactDensity ? "py-1 px-1.5 text-[9px] sm:text-[10px]" : "py-2 px-2 text-[11px]"} text-left tracking-wide uppercase`}>
                RATA-RATA TIM
              </td>
              {colMode === "all" && teamMonthlyAvgs.map((col, cIdx) => (
                <td key={cIdx} className={`${isDarkSlide ? "py-0.5 px-0.5 text-center sm:text-right font-mono text-[8.5px] sm:text-[9.5px]" : isCompactDensity ? "py-1 px-1 text-center sm:text-right font-mono text-[9px] sm:text-[10px]" : "py-2 px-2 text-right font-mono text-[11px]"}`}>
                  {fmtNum(col.avg)}
                </td>
              ))}
              <td className={`${
                isDarkSlide ? "py-0.5 px-1 text-[9.5px] sm:text-[10.5px]" : isCompactDensity ? "py-1 px-1.5 text-[10.5px] sm:text-[11.5px]" : "py-2 px-2 text-xs"
              } ${
                isDarkSlide ? "text-orange-400 bg-orange-500/20" : "text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/60"
              } text-right font-mono font-black`}>
                {fmtNum(teamOverallAvg)}
              </td>
              <td className={`${isDarkSlide ? "py-0.5 px-0.5 text-[8px] sm:text-[8.5px]" : isCompactDensity ? "py-1 px-1 text-[8.5px] sm:text-[9.5px]" : "py-2 px-2 text-[10px]"} text-center text-slate-400`}>
                {totalUp} ↗ &middot; {totalDown} ↘
              </td>
              <td className={`${isDarkSlide ? "py-0.5 px-0.5 text-[8px] sm:text-[8.5px]" : isCompactDensity ? "py-1 px-1 text-[8.5px] sm:text-[9.5px]" : "py-2 px-2 text-[10px]"} text-center text-slate-400`}>
                {rows.length > 0 ? `${Math.round((totalMandiri / rows.length) * 100)}% Mandiri` : "-"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!isDarkSlide && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-[8.5px] sm:text-[9.5px] text-slate-400 px-1 gap-1">
          <span>*Keterangan: Standar YL Mandiri ≥ 250 btl/hari &middot; Tren membandingkan Rata-Rata YTD tahun ini vs Rata-Rata Tahun Lalu</span>
          <span className="font-mono text-slate-500">10 Yakult Lady Terdata</span>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Komponen Evaluasi: Analisis Absensi Loss, Mix Product, & Uji Beban Target
// ----------------------------------------------------------------------------

export function AnalisisAbsensiLossCard({
  months,
  title = "Analisis Dampak Absensi & Potensi Kehilangan (Loss Potential)",
  subtitle,
  isDarkSlide = false,
}: {
  months: any[];
  title?: string;
  subtitle?: string;
  isDarkSlide?: boolean;
}) {
  const res = useMemo(() => computeLossPotential(months), [months]);

  return (
    <div className={`rounded-2xl border ${
      isDarkSlide
        ? "p-2.5 sm:p-3 bg-slate-900/80 border-slate-700/80 text-white w-full"
        : "p-4 sm:p-5 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white shadow-xs"
    }`}>
      {!isDarkSlide ? (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 shrink-0">
                <ShieldAlert className="w-4 h-4" />
              </span>
              <h4 className="font-black text-xs sm:text-sm">{title}</h4>
            </div>
            <p className="text-[11px] mt-1 text-slate-500 dark:text-slate-400">
              {subtitle || "Kalkulasi dampak ketidakhadiran (izin/sakit) terhadap botol penjualan yang terlewatkan"}
            </p>
          </div>
          {res.hasAbsen ? (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
              {res.totalFrekuensiAbsen}x Absen ({res.totalYLAbsen} YL)
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              100% Kehadiran Disiplin
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 mb-2 px-1">
          <span className="text-[10.5px] sm:text-[11px] text-slate-400 font-medium">Ringkasan Dampak Ketidakhadiran Tim:</span>
          {res.hasAbsen ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
              {res.totalFrekuensiAbsen}x Absen ({res.totalYLAbsen} YL)
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              100% Kehadiran Disiplin
            </span>
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-3 ${isDarkSlide ? "gap-2 mb-2.5" : "gap-2.5 mb-4"}`}>
        <div className={`rounded-xl border ${isDarkSlide ? "p-2 sm:p-2.5 bg-slate-800/60 border-slate-700/70" : "p-3 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700"}`}>
          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Hari Izin / Sakit</p>
          <p className={`font-black mt-0.5 text-rose-500 ${isDarkSlide ? "text-base sm:text-lg" : "text-base sm:text-lg"}`}>
            {fmtNum(res.totalFrekuensiAbsen)} <span className="text-[10px] font-normal text-slate-400">Hari</span>
          </p>
          <p className="text-[9.5px] text-slate-400 mt-0.5">dari {res.totalYLAbsen} Ibu YL</p>
        </div>

        <div className={`rounded-xl border ${isDarkSlide ? "p-2 sm:p-2.5 bg-slate-800/60 border-slate-700/70" : "p-3 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700"}`}>
          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">Rata-Rata Penjualan YL</p>
          <p className={`font-black mt-0.5 ${isDarkSlide ? "text-white text-base sm:text-lg" : "text-slate-800 dark:text-white text-base sm:text-lg"}`}>
            ~{fmtNum(res.avgSalesPerYL)} <span className="text-[10px] font-normal text-slate-400">Btl / Hari</span>
          </p>
          <p className="text-[9.5px] text-slate-400 mt-0.5">Kapasitas harian per YL</p>
        </div>

        <div className={`rounded-xl border ${isDarkSlide ? "p-2 sm:p-2.5 bg-slate-800/60 border-rose-500/30" : "p-3 bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/40"}`}>
          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-rose-400">Botol Terlewatkan</p>
          <p className={`font-black mt-0.5 text-rose-400 ${isDarkSlide ? "text-base sm:text-lg" : "text-rose-600 dark:text-rose-400 text-base sm:text-lg"}`}>
            ~{fmtNum(res.potensiBotolHilang)} <span className="text-[10px] font-normal text-slate-400">Btl</span>
          </p>
          <p className="text-[9.5px] font-bold text-rose-300 mt-0.5">~{fmtNum(res.potensiPakHilang)} Pack Yakult</p>
        </div>
      </div>

      <div className={`rounded-xl border ${
        isDarkSlide
          ? "p-2.5 sm:p-3 bg-slate-800/40 border-slate-700/60 text-slate-300"
          : "p-3 sm:p-4 bg-orange-50/50 dark:bg-slate-900/40 border-orange-200/60 dark:border-slate-700 text-slate-600 dark:text-slate-300"
      }`}>
        <p className="font-black text-[10.5px] sm:text-xs text-orange-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-orange-500" /> Solusi Bila Ada YL Izin atau Sakit:
        </p>
        <div className="flex items-start gap-2.5 bg-slate-900/60 dark:bg-slate-900/80 p-2 sm:p-2.5 rounded-xl border border-slate-800">
          <span className="text-xl shrink-0 mt-0.5">🔄</span>
          <div>
            <p className="text-xs sm:text-sm font-black text-white">
              Kirim Tambahan Hari Berikutnya
            </p>
            <p className="text-[10.5px] sm:text-xs text-slate-300 mt-0.5 leading-relaxed">
              Saat Ibu YL sudah aktif masuk kembali, antarkan botol tambahan atau kirim dobel ke pelanggan untuk menutup botol harian yang sempat terlewat saat izin atau sakit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnalisisMixProductCard({
  months,
  title = "Evaluasi Mix Produk: Original vs Varian Baru",
  subtitle,
  isDarkSlide = false,
}: {
  months: any[];
  title?: string;
  subtitle?: string;
  isDarkSlide?: boolean;
}) {
  const res = useMemo(() => computeMixProductAnalysis(months), [months]);
  const [mixChartKind, cycleMixChart] = useChartKindCycle("presentasi_chart_mix_produk", ["pie", "bar"]);

  return (
    <div className={`rounded-2xl border ${
      isDarkSlide
        ? "p-2.5 sm:p-3 bg-slate-900/80 border-slate-700/80 text-white"
        : "p-4 sm:p-5 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white shadow-xs"
    }`}>
      {!isDarkSlide ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 shrink-0">
                <PieChartIcon className="w-4 h-4" />
              </span>
              <h4 className="font-black text-xs sm:text-sm">{title}</h4>
            </div>
            <p className="text-[10px] sm:text-[11px] mt-0.5 text-slate-500 dark:text-slate-400">
              {subtitle || "Tingkat penetrasi Original Mangga (OM), Original Stroberi (OS), dan Yakult Light (YT) dibanding Original (YO)"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black border ${
              res.pctVarianBaru >= 15
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/20 text-amber-400 border-amber-500/30"
            }`}>
              Varian Baru: {fmtPct(res.pctVarianBaru, 1)}% {res.pctVarianBaru >= 15 ? "(Target ≥15% ✅)" : "(Target ≥15% ⚠️)"}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 mb-2 px-1">
          <span className="text-[10.5px] sm:text-[11px] text-slate-400 font-medium">Penetrasi Varian Baru (OM, OS, YT) vs YO:</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
            res.pctVarianBaru >= 15
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : "bg-amber-500/20 text-amber-400 border-amber-500/30"
          }`}>
            Varian Baru: {fmtPct(res.pctVarianBaru, 1)}% {res.pctVarianBaru >= 15 ? "(Target ≥15% ✅)" : "(Target ≥15% ⚠️)"}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
        <div className={`sm:col-span-5 relative ${isDarkSlide ? "h-32 sm:h-38" : "h-44"}`}>
          <ChartKindToggleButton kind={mixChartKind} onClick={cycleMixChart} />
          {res.total > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              {mixChartKind === "bar" ? (
                <BarChart data={res.chartData} layout="vertical" margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: isDarkSlide ? "#94a3b8" : "#64748b" }} width={72} />
                  <Tooltip formatter={(v: number) => `${fmtNum(v)} btl (${((v / res.total) * 100).toFixed(1)}%)`} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {res.chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <PieChart>
                  <Pie
                    data={res.chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={isDarkSlide ? 30 : 38}
                    outerRadius={isDarkSlide ? 52 : 62}
                    paddingAngle={2}
                  >
                    {res.chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${fmtNum(v)} btl (${((v / res.total) * 100).toFixed(1)}%)`} />
                </PieChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-slate-400 italic">
              Data komposisi produk belum terisi.
            </div>
          )}
        </div>

        <div className={`sm:col-span-7 ${isDarkSlide ? "space-y-1.5" : "space-y-2"}`}>
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            <div className={`p-2 rounded-xl border ${isDarkSlide ? "bg-slate-800/60 border-slate-700/60" : "bg-red-50/50 dark:bg-red-950/20 border-red-200/60 dark:border-red-900/30"}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 truncate">Original (YO)</span>
                <span className="text-[10px] font-black">{fmtPct(res.pctYO, 1)}%</span>
              </div>
              <p className="text-xs sm:text-sm font-black mt-0.5">{fmtNum(res.yo)} <span className="text-[9px] font-normal text-slate-400">btl</span></p>
            </div>

            <div className={`p-2 rounded-xl border ${isDarkSlide ? "bg-slate-800/60 border-slate-700/60" : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/30"}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 truncate">Original Mangga (OM)</span>
                <span className="text-[10px] font-black">{fmtPct(res.pctOM, 1)}%</span>
              </div>
              <p className="text-xs sm:text-sm font-black mt-0.5">{fmtNum(res.om)} <span className="text-[9px] font-normal text-slate-400">btl</span></p>
            </div>

            <div className={`p-2 rounded-xl border ${isDarkSlide ? "bg-slate-800/60 border-slate-700/60" : "bg-pink-50/50 dark:bg-pink-950/20 border-pink-200/60 dark:border-pink-900/30"}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 truncate">Original Stroberi (OS)</span>
                <span className="text-[10px] font-black">{fmtPct(res.pctOS, 1)}%</span>
              </div>
              <p className="text-xs sm:text-sm font-black mt-0.5">{fmtNum(res.os)} <span className="text-[9px] font-normal text-slate-400">btl</span></p>
            </div>

            <div className={`p-2 rounded-xl border ${isDarkSlide ? "bg-slate-800/60 border-slate-700/60" : "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-900/30"}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 truncate">Yakult Light (YT)</span>
                <span className="text-[10px] font-black">{fmtPct(res.pctYT, 1)}%</span>
              </div>
              <p className="text-xs sm:text-sm font-black mt-0.5">{fmtNum(res.yt)} <span className="text-[9px] font-normal text-slate-400">btl</span></p>
            </div>
          </div>

          <div className={`p-2 rounded-xl border text-[10px] sm:text-[10.5px] leading-snug ${
            isDarkSlide
              ? "bg-slate-800/40 border-slate-700/60 text-slate-300"
              : "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          }`}>
            <p className="font-black text-orange-500 mb-0.5">Strategi Penetrasi Varian:</p>
            <p>
              Tingkatkan edukasi varian <em>Yakult Light (YT)</em> untuk konsumen peduli rendah gula, serta perluas varian <em>Original Mangga (OM)</em> dan <em>Original Stroberi (OS)</em> untuk menarik konsumen baru dan keluarga.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UjiKelayakanBebanCard({
  targetSisa,
  monthsRemaining,
  jumlahYL = 10,
  currentAvgYL,
  isDarkSlide = false,
}: {
  targetSisa: number;
  monthsRemaining: number;
  jumlahYL?: number;
  currentAvgYL?: number;
  isDarkSlide?: boolean;
}) {
  const res = useMemo(
    () => computeBebanKapasitas(targetSisa, monthsRemaining, jumlahYL),
    [targetSisa, monthsRemaining, jumlahYL]
  );

  const isOver = res.statusBeban === "overcapacity";
  const isHigh = res.statusBeban === "tinggi";

  return (
    <div className={`rounded-2xl border ${
      isDarkSlide
        ? "p-2.5 sm:p-3 bg-slate-900/80 border-slate-700/80 text-white w-full"
        : "p-4 sm:p-5 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white shadow-xs"
    }`}>
      {!isDarkSlide ? (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`p-1.5 rounded-lg ${isOver ? "bg-rose-500/10 text-rose-500" : isHigh ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                <AlertTriangle className="w-4 h-4" />
              </span>
              <h4 className="font-black text-xs sm:text-sm">Uji Kelayakan Beban Target &amp; Kapasitas Fisik YL</h4>
            </div>
            <p className="text-[11px] mt-1 text-slate-500 dark:text-slate-400">
              Analisis apakah target sisa periode secara fisik realistis diantar oleh 10 Yakult Lady tanpa melebihi batas kelelahan fisik.
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border shrink-0 ${
            isOver
              ? "bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse"
              : isHigh
              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          }`}>
            {isOver ? "🚨 Overcapacity Alert" : isHigh ? "⚠️ Beban Tinggi" : "✅ Kapasitas Aman"}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 mb-2 px-1">
          <span className="text-[10.5px] sm:text-[11px] text-slate-400 font-medium">Uji Realistis Fisik &amp; Kapasitas Harian Tim:</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
            isOver
              ? "bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse"
              : isHigh
              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          }`}>
            {isOver ? "🚨 Overcapacity Alert" : isHigh ? "⚠️ Beban Tinggi" : "✅ Kapasitas Aman"}
          </span>
        </div>
      )}

      <div className={`grid grid-cols-2 sm:grid-cols-4 ${isDarkSlide ? "gap-2 mb-2.5" : "gap-2.5 mb-4"}`}>
        <div className={`rounded-xl border ${isDarkSlide ? "p-2 bg-slate-800/60 border-slate-700/70" : "p-3 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700"}`}>
          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">Target Sisa</p>
          <p className={`font-black mt-0.5 text-orange-500 ${isDarkSlide ? "text-sm sm:text-base" : "text-base sm:text-lg"}`}>
            {fmtNum(res.targetSisa)} <span className="text-[9.5px] font-normal text-slate-400">btl</span>
          </p>
          <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5">{res.monthsRemaining} bulan tersisa</p>
        </div>

        <div className={`rounded-xl border ${isDarkSlide ? "p-2 bg-slate-800/60 border-slate-700/70" : "p-3 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700"}`}>
          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">Hari Kerja Efektif</p>
          <p className={`font-black mt-0.5 ${isDarkSlide ? "text-sm sm:text-base" : "text-base sm:text-lg"}`}>
            {fmtNum(res.daysRemaining)} <span className="text-[9.5px] font-normal text-slate-400">hari</span>
          </p>
          <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5">Asumsi 25 hari kerja/bulan</p>
        </div>

        <div className={`rounded-xl border ${isDarkSlide ? "p-2 bg-slate-800/60 border-slate-700/70" : "p-3 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700"}`}>
          <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">Beban Tim per Hari</p>
          <p className={`font-black mt-0.5 ${isDarkSlide ? "text-sm sm:text-base" : "text-base sm:text-lg"}`}>
            {fmtNum(res.bebanTotalHarian)} <span className="text-[9.5px] font-normal text-slate-400">btl/hr</span>
          </p>
          <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5">Total pengantaran 10 YL</p>
        </div>

        <div className={`rounded-xl border ${
          isOver
            ? "bg-rose-500/10 border-rose-500/40"
            : isHigh
            ? "bg-amber-500/10 border-amber-500/40"
            : "bg-emerald-500/10 border-emerald-500/40"
        } ${isDarkSlide ? "p-2" : "p-3"}`}>
          <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${isOver ? "text-rose-400" : isHigh ? "text-amber-400" : "text-emerald-400"}`}>
            Tuntutan / YL / Hari
          </p>
          <p className={`font-black mt-0.5 ${isOver ? "text-rose-400" : isHigh ? "text-amber-400" : "text-emerald-400"} ${isDarkSlide ? "text-sm sm:text-base" : "text-base sm:text-lg"}`}>
            {fmtNum(res.bebanPerYLHarian)} <span className="text-[9.5px] font-normal text-slate-400">btl/hr</span>
          </p>
          <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5">
            {currentAvgYL ? `Realisasi: ${fmtNum(currentAvgYL)} btl` : "Standar mandiri: ≥250"}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between text-[11px] font-bold mb-1">
          <span className="text-slate-400">Batas Fisik Pengantaran YL:</span>
          <span className={isOver ? "text-rose-400" : isHigh ? "text-amber-400" : "text-emerald-400"}>
            {res.bebanPerYLHarian} btl/hari &middot; {res.statusLabel}
          </span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden flex">
          <div className="bg-emerald-500 h-full" style={{ width: "65%" }} title="Kapasitas Standar (s/d 320 btl)"></div>
          <div className="bg-amber-500 h-full" style={{ width: "15%" }} title="Beban Tinggi (321 - 370 btl)"></div>
          <div className="bg-rose-500 h-full" style={{ width: "20%" }} title="Overcapacity (>370 btl)"></div>
        </div>
        <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-mono">
          <span>0 btl</span>
          <span>320 btl (Normal)</span>
          <span>370 btl (Batas Fisik)</span>
          <span>450+ btl</span>
        </div>
      </div>

      <div className={`p-3 rounded-xl border text-xs ${
        isDarkSlide
          ? "bg-slate-800/40 border-slate-700/60 text-slate-300"
          : "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
      }`}>
        <p className="font-black text-[11px] text-orange-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> Rekomendasi Solusi Kapasitas:
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <li className="flex items-start gap-1.5">
            <span className="text-orange-500 font-black">•</span>
            <span><strong>Split Area &amp; Rekrutmen YL Baru:</strong> Bila tuntutan &gt;370 botol/hari, wajib membagi area padat dan menambah Yakult Lady baru agar kualitas layanan tidak menurun.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-orange-500 font-black">•</span>
            <span><strong>Pesanan Kolektif / Instansi:</strong> Fokus penetrasi instansi, sekolah, atau pabrik (order besar dalam 1 titik antar) untuk mendongkrak volume tanpa membebani rute rumah.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 1. Laporan Bulanan
// ----------------------------------------------------------------------------

function LaporanBulanan({ bulanan, perYL, monthIndex, setMonthIndex, selectedYear }: {
  bulanan: Record<string, any>; perYL: any[]; monthIndex: number; setMonthIndex: (i: number) => void; selectedYear?: string | number;
}) {
  const m = selectedYear ? applyTahunLaluFallback(bulanan[MONTHS[monthIndex]], selectedYear, monthIndex) : bulanan[MONTHS[monthIndex]];

  const prevIdx = monthIndex - 1;
  const prevM = prevIdx >= 0 ? bulanan[MONTHS[prevIdx]] : null;
  const vsBulanLaluPct = m && prevM && prevM.akmPenjualan
    ? (m.akmPenjualan / prevM.akmPenjualan) * 100
    : null;

  const ylRanked = useMemo(() => {
    return [...perYL]
      .map((yl) => ({
        area: yl.area,
        nama: cleanYlName(yl.nama || ""),
        penjualan: yl.penjualan?.[MONTHS[monthIndex]] ?? null,
      }))
      .filter((r) => r.penjualan !== null && r.penjualan !== undefined)
      .sort((a, b) => (b.penjualan || 0) - (a.penjualan || 0));
  }, [perYL, monthIndex]);

  const ylCount = ylRanked.length;
  const jumlahYLDisplay = m?.jumlahYL || (ylCount > 0 ? ylCount : undefined);
  const jumlahAreaDisplay = m?.jumlahArea || (ylCount > 0 ? new Set(ylRanked.map((r) => r.area).filter(Boolean)).size : undefined);

  const manualKondisi = m?.kondisiYL || {};
  const manualTotal =
    (Number(manualKondisi.kurang250) || 0) +
    (Number(manualKondisi.r250_279) || 0) +
    (Number(manualKondisi.r280_299) || 0) +
    (Number(manualKondisi.r300_329) || 0) +
    (Number(manualKondisi.r330_349) || 0) +
    (Number(manualKondisi.lebih350) || 0);

  const kondisiData = useMemo(() => {
    if (manualTotal > 0) {
      return [
        { name: "< 250", value: Number(manualKondisi.kurang250) || 0 },
        { name: "250-279", value: Number(manualKondisi.r250_279) || 0 },
        { name: "280-299", value: Number(manualKondisi.r280_299) || 0 },
        { name: "300-329", value: Number(manualKondisi.r300_329) || 0 },
        { name: "330-349", value: Number(manualKondisi.r330_349) || 0 },
        { name: "> 350", value: Number(manualKondisi.lebih350) || 0 },
      ];
    }

    let kurang250 = 0;
    let r250_279 = 0;
    let r280_299 = 0;
    let r300_329 = 0;
    let r330_349 = 0;
    let lebih350 = 0;

    for (const yl of ylRanked) {
      const val = Number(yl.penjualan) || 0;
      if (val < 250) kurang250++;
      else if (val >= 250 && val <= 279) r250_279++;
      else if (val >= 280 && val <= 299) r280_299++;
      else if (val >= 300 && val <= 329) r300_329++;
      else if (val >= 330 && val <= 349) r330_349++;
      else if (val >= 350) lebih350++;
    }

    return [
      { name: "< 250", value: kurang250 },
      { name: "250-279", value: r250_279 },
      { name: "280-299", value: r280_299 },
      { name: "300-329", value: r300_329 },
      { name: "330-349", value: r330_349 },
      { name: "> 350", value: lebih350 },
    ];
  }, [manualTotal, manualKondisi, ylRanked]);

  const produkTotal = (m?.ratarataYO || 0) + (m?.ratarataOM || 0) + (m?.ratarataOS || 0) + (m?.ratarataYT || 0);
  const produkData = [
    { name: "Original (YO)", value: m?.ratarataYO || 0, color: PRODUCT_COLORS.YO },
    { name: "Original Mangga (OM)", value: m?.ratarataOM || 0, color: PRODUCT_COLORS.OM },
    { name: "Original Stroberi (OS)", value: m?.ratarataOS || 0, color: PRODUCT_COLORS.OS },
    { name: "Yakult Light (YT)", value: m?.ratarataYT || 0, color: PRODUCT_COLORS.YT },
  ].filter((p) => p.value > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {MONTH_SHORT.map((lbl, i) => (
          <button
            key={lbl}
            onClick={() => setMonthIndex(i)}
            className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border cursor-pointer transition-all ${
              i === monthIndex
                ? "bg-orange-500 border-orange-500 text-white"
                : bulanan[MONTHS[i]]
                ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                : "bg-slate-50 dark:bg-slate-900 border-dashed border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-600"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {!m ? (
        <EmptyMonthNote label={MONTH_LABELS[monthIndex]} />
      ) : (
        <>
          <Card>
            <SectionTitle icon={TrendingUp}>Widget Ringkasan — {MONTH_LABELS[monthIndex]}</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <StatBox label="AKM Penjualan" value={`${fmtNum(m.akmPenjualan)} btl`} sub={`Target: ${fmtNum(m.akmTarget)} btl`} />
              <StatBox label="Rata-rata Penjualan" value={`${fmtNum(m.ratarataPenjualanYL)}`} sub="per hari (tim)" />
              <StatBox label="% Target vs Realisasi" value={`${fmtPct(m.persenCapaian)}%`} pct={m.persenCapaian} />
            </div>
          </Card>

          <Card>
            <SectionTitle icon={BarChart3}>Komparasi</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <StatBox
                label="vs Bulan Lalu"
                value={vsBulanLaluPct !== null ? `${fmtPct(vsBulanLaluPct)}%` : "-"}
                sub={prevM ? `${MONTH_LABELS[prevIdx]}: ${fmtNum(prevM.akmPenjualan)} btl` : "Tidak ada data"}
                pct={vsBulanLaluPct}
              />
              <StatBox
                label="vs Rata² Tahun Lalu"
                value={`${fmtPct(m.persenTahunLalu)}%`}
                sub={`Th. lalu: ${fmtNum(m.ratarataPenjualanTahunLalu)}/hari`}
                pct={m.persenTahunLalu}
              />
            </div>
          </Card>

          <Card>
            <SectionTitle icon={Package}>Efisiensi & Kedisiplinan</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <StatBox label="AKM BB (Botol Balik)" value={`${fmtNum(m.akmKembaliBotol)} btl`} sub={`${fmtPct(m.persenKembaliBotol)}% dari penjualan`} pct={m.persenKembaliBotol !== undefined ? 100 - m.persenKembaliBotol : undefined} />
              <StatBox label="Absen (Frekuensi)" value={`${fmtNum(m.absen?.frekuensi)}x`} sub={`${fmtNum(m.absen?.jumlahYL)} YL tidak hadir`} />
              <StatBox label="JWP" value={`${fmtNum(m.jwp)}`} sub="Jumlah Waktu Pengerjaan" />
            </div>
          </Card>

          <AnalisisAbsensiLossCard
            months={[m]}
            title={`Analisis Dampak Absensi & Potensi Botol Hilang — ${MONTH_LABELS[monthIndex]}`}
            subtitle={`Kalkulasi opportunity loss akibat ketidakhadiran ${m.absen?.jumlahYL || 0} YL (${m.absen?.frekuensi || 0}x izin/sakit) pada bulan ${MONTH_LABELS[monthIndex]}`}
          />

          <Card>
            <SectionTitle icon={Users}>Analisis Tim</SectionTitle>
            <div className="flex flex-wrap gap-2 mb-4">
              <StatBox label="S/YL (Sales per YL)" value={`${fmtNum(m.salesPerYL)}`} sub={`Th lalu: ${fmtNum(m.salesPerYLTahunLalu)}`} />
              <StatBox
                label="Jumlah YL"
                value={`${fmtNum(jumlahYLDisplay)}`}
                sub={
                  m.jumlahYLBaru !== undefined || m.jumlahYLResign !== undefined
                    ? `Baru: ${fmtNum(m.jumlahYLBaru || 0)} · Resign: ${fmtNum(m.jumlahYLResign || 0)}`
                    : `Aktif: ${fmtNum(jumlahYLDisplay)} YL`
                }
              />
            </div>

            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Performa 10 Yakult Lady</p>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100 dark:border-slate-700">
                    <th className="text-left py-1.5 px-1 font-bold">#</th>
                    <th className="text-left py-1.5 px-1 font-bold">Area</th>
                    <th className="text-left py-1.5 px-1 font-bold">Nama</th>
                    <th className="text-right py-1.5 px-1 font-bold">Penjualan</th>
                  </tr>
                </thead>
                <tbody>
                  {ylRanked.map((r, idx) => (
                    <tr key={r.area} className="border-b border-slate-50 dark:border-slate-800/60">
                      <td className="py-1.5 px-1 text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-1.5 px-1 text-slate-500">{r.area}</td>
                      <td className="py-1.5 px-1 font-bold text-slate-700 dark:text-slate-200">{r.nama}</td>
                      <td className="py-1.5 px-1 text-right font-black text-slate-900 dark:text-white">{fmtNum(r.penjualan)}</td>
                    </tr>
                  ))}
                  {ylRanked.length === 0 && (
                    <tr><td colSpan={4} className="py-4 text-center text-slate-400">Belum ada data penjualan YL bulan ini.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-4 mb-2 flex items-center justify-between">
              <span>Kondisi YL (Distribusi Botol)</span>
              <span className="text-[10px] font-normal text-slate-400">
                Total: {kondisiData.reduce((acc, curr) => acc + curr.value, 0)} YL
              </span>
            </p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kondisiData} margin={{ top: 16, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} domain={[0, (dataMax: number) => Math.max(dataMax + 1, 4)]} />
                  <Tooltip formatter={(v: number) => [`${v} YL`, "Jumlah YL"]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="value" position="top" fill="#64748b" fontSize={11} fontWeight="bold" />
                    {kondisiData.map((_, i) => <Cell key={i} fill={KONDISI_COLORS[i % KONDISI_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <SectionTitle icon={MapPin}>Produk & Area</SectionTitle>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 h-44">
                {produkData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={produkData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={2}>
                        {produkData.map((p) => <Cell key={p.name} fill={p.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `${fmtNum(v)} btl (${((v / produkTotal) * 100).toFixed(1)}%)`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-8">Belum ada data produk.</p>
                )}
              </div>
              <div className="flex-1 flex flex-col justify-center gap-2">
                <StatBox
                  label="% Area Tercover"
                  value={`${fmtPct(m.persenAreaTercover, 0)}%`}
                  sub={`${fmtNum(jumlahAreaDisplay)} area aktif`}
                  pct={m.persenAreaTercover}
                />
              </div>
            </div>
          </Card>

          <AnalisisMixProductCard
            months={[m]}
            title={`Evaluasi Mix Produk & Penetrasi Varian — ${MONTH_LABELS[monthIndex]}`}
            subtitle="Keseimbangan penjualan Original (YO) vs varian baru (Original Mangga, Original Stroberi, Yakult Light)"
          />

          <Card>
            <SectionTitle icon={Sparkles}>Evaluasi Kualitatif</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase mb-1.5 flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" /> Kelebihan</p>
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {(m.evaluasiPlus || []).filter((s: string) => s.trim()).map((s: string, i: number) => (
                    <li key={i} className="flex gap-1.5"><span className="text-emerald-500">•</span>{s}</li>
                  ))}
                  {!(m.evaluasiPlus || []).some((s: string) => s.trim()) && <li className="text-slate-400">Belum ada catatan.</li>}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-black text-red-600 dark:text-red-400 uppercase mb-1.5 flex items-center gap-1"><ThumbsDown className="w-3.5 h-3.5" /> Kekurangan</p>
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {(m.evaluasiMinus || []).filter((s: string) => s.trim()).map((s: string, i: number) => (
                    <li key={i} className="flex gap-1.5"><span className="text-red-500">•</span>{s}</li>
                  ))}
                  {!(m.evaluasiMinus || []).some((s: string) => s.trim()) && <li className="text-slate-400">Belum ada catatan.</li>}
                </ul>
              </div>
            </div>
          </Card>

          {monthIndex > 0 && (
            <Card>
              <SectionTitle icon={Users}>
                Tabel Rata-Rata Penjualan YL (Januari s/d {MONTH_LABELS[monthIndex]})
              </SectionTitle>
              <TabelRataRataYL
                perYL={perYL}
                startIdx={0}
                endIdx={monthIndex}
                title={`Rata-Rata YTD: Januari s/d ${MONTH_LABELS[monthIndex]}`}
                subtitle={`Rata-rata penjualan botol per hari kerja dari awal tahun sampai bulan ${MONTH_LABELS[monthIndex]}`}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 2. Laporan Semester (dipakai untuk S1, dan sebagai dasar S2)
// ----------------------------------------------------------------------------

function computeSemesterAgg(bulanan: Record<string, any>, startIdx: number, endIdx: number, tahun?: string | number) {
  const monthKeys = MONTHS.slice(startIdx, endIdx + 1);
  const monthsData = monthKeys
    .map((k, i) => ({ key: k, idx: startIdx + i, m: tahun ? applyTahunLaluFallback(bulanan[k], tahun, startIdx + i) : bulanan[k] }))
    .filter((x) => x.m);

  const totalAkm = sum(monthsData.map((x) => x.m.akmPenjualan));
  const avgCapaian = average(monthsData.map((x) => x.m.persenCapaian));
  const avgRetur = average(monthsData.map((x) => x.m.persenKembaliBotol));
  const ylBaru = sum(monthsData.map((x) => x.m.jumlahYLBaru));
  const ylResign = sum(monthsData.map((x) => x.m.jumlahYLResign));

  let peak: { label: string; value: number } | null = null;
  monthsData.forEach((x) => {
    const v = x.m.akmPenjualan || 0;
    if (!peak || v > peak.value) peak = { label: MONTH_LABELS[x.idx], value: v };
  });

  const evalPlus: string[] = [];
  const evalMinus: string[] = [];
  monthsData.forEach((x) => {
    (x.m.evaluasiPlus || []).forEach((s: string) => { if (s.trim() && !evalPlus.includes(s.trim())) evalPlus.push(s.trim()); });
    (x.m.evaluasiMinus || []).forEach((s: string) => { if (s.trim() && !evalMinus.includes(s.trim())) evalMinus.push(s.trim()); });
  });

  const trend = monthsData.map((x) => ({
    bulan: MONTH_SHORT[x.idx],
    penjualan: x.m.akmPenjualan || 0,
    target: x.m.akmTarget || 0,
  }));

  return { monthsData, totalAkm, avgCapaian, avgRetur, ylBaru, ylResign, peak, evalPlus, evalMinus, trend };
}

function LaporanSemester({ bulanan, perYL, startIdx, endIdx, title, tahun }: {
  bulanan: Record<string, any>; perYL: any[]; startIdx: number; endIdx: number; title: string; tahun?: string | number;
}) {
  const agg = useMemo(() => computeSemesterAgg(bulanan, startIdx, endIdx, tahun), [bulanan, startIdx, endIdx, tahun]);

  if (agg.monthsData.length === 0) {
    return <EmptyMonthNote label={title} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle icon={Calendar}>{title}</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <StatBox label="AKM Penjualan Semester" value={`${fmtNum(agg.totalAkm)} btl`} sub={`${agg.monthsData.length} bulan terisi`} />
          <StatBox label="Rata² Pencapaian Target" value={`${fmtPct(agg.avgCapaian)}%`} pct={agg.avgCapaian} />
          <StatBox label="Rata² Retur (BB)" value={`${fmtPct(agg.avgRetur)}%`} />
        </div>
      </Card>

      <Card>
        <SectionTitle icon={TrendingUp}>Grafik Tren Penjualan Bulanan</SectionTitle>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={agg.trend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="bulan" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => fmtNum(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="penjualan" name="Penjualan" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="target" name="Target" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {agg.peak && (
          <p className="text-xs text-slate-500 mt-2 text-center">
            📈 Puncak penjualan: <strong className="text-slate-800 dark:text-white">{agg.peak.label}</strong> ({fmtNum(agg.peak.value)} btl)
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle icon={Users}>
          Tabel Rata-Rata Penjualan YL — {title}
        </SectionTitle>
        <TabelRataRataYL
          perYL={perYL}
          startIdx={startIdx}
          endIdx={endIdx}
          title={`Rata-Rata Penjualan YL (${MONTH_LABELS[startIdx]} s/d ${MONTH_LABELS[endIdx]})`}
          subtitle="Rata-rata penjualan botol per hari kerja dari bulan Januari sampai Juni"
        />
      </Card>

      <AnalisisAbsensiLossCard
        months={agg.monthsData.map((x) => x.m)}
        title={`Analisis Dampak Absensi & Loss Potential (${title})`}
        subtitle="Kalkulasi total frekuensi izin/sakit dan potensi botol terlewatkan selama semester 1"
      />

      <AnalisisMixProductCard
        months={agg.monthsData.map((x) => x.m)}
        title={`Evaluasi Mix Produk (${title})`}
        subtitle="Analisis keseimbangan penetrasi varian baru (Original Mangga, Original Stroberi, Yakult Light) vs Original (YO)"
      />

      <Card>
        <SectionTitle icon={Users}>Stabilitas SDM</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <StatBox label="YL Baru" value={`${fmtNum(agg.ylBaru)}`} sub={`Selama ${agg.monthsData.length} bulan`} />
          <StatBox label="YL Resign" value={`${fmtNum(agg.ylResign)}`} sub={`Selama ${agg.monthsData.length} bulan`} />
        </div>
      </Card>

      <Card>
        <SectionTitle icon={Sparkles}>Evaluasi Kualitatif</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase mb-1.5 flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" /> Kelebihan</p>
            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
              {agg.evalPlus.slice(0, 8).map((s, i) => <li key={i} className="flex gap-1.5"><span className="text-emerald-500">•</span>{s}</li>)}
              {agg.evalPlus.length === 0 && <li className="text-slate-400">Belum ada catatan.</li>}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-black text-red-600 dark:text-red-400 uppercase mb-1.5 flex items-center gap-1"><ThumbsDown className="w-3.5 h-3.5" /> Kekurangan</p>
            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
              {agg.evalMinus.slice(0, 8).map((s, i) => <li key={i} className="flex gap-1.5"><span className="text-red-500">•</span>{s}</li>)}
              {agg.evalMinus.length === 0 && <li className="text-slate-400">Belum ada catatan.</li>}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 3. Laporan Semester 2 (Status Realisasi + Proyeksi + Alarm)
// ----------------------------------------------------------------------------

function computeSemester2Agg(bulanan: Record<string, any>, tahun?: string | number) {
  const agg = computeSemesterAgg(bulanan, 6, 11, tahun);
  const s1Agg = computeSemesterAgg(bulanan, 0, 5, tahun);

  const filledMonths = [...s1Agg.monthsData, ...agg.monthsData];
  const avgMonthlyTarget = average(filledMonths.map((x) => x.m.akmTarget)) || 0;
  const monthsRemaining = 12 - filledMonths.length;
  const targetTahunEstimasi = sum(filledMonths.map((x) => x.m.akmTarget)) + avgMonthlyTarget * monthsRemaining;
  const totalRealisasiSoFar = sum(filledMonths.map((x) => x.m.akmPenjualan));
  const targetSisa = Math.max(0, targetTahunEstimasi - totalRealisasiSoFar);

  const avgMonthlyCapacity = average(filledMonths.map((x) => x.m.akmPenjualan)) || 0;
  const kapasitasSisaEstimasi = avgMonthlyCapacity * monthsRemaining;

  const alarmMonths = agg.monthsData.filter((x) => (x.m.persenKembaliBotol || 0) > 10);

  return { agg, s1Agg, monthsRemaining, targetTahunEstimasi, totalRealisasiSoFar, targetSisa, kapasitasSisaEstimasi, alarmMonths };
}

function LaporanSemester2({ bulanan, perYL, jumlahYL, tahun }: {
  bulanan: Record<string, any>; perYL: any[]; jumlahYL: number; tahun?: string | number;
}) {
  const s2 = useMemo(() => computeSemester2Agg(bulanan, tahun), [bulanan, tahun]);
  const { agg, monthsRemaining, targetTahunEstimasi, targetSisa, kapasitasSisaEstimasi, alarmMonths } = s2;

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle icon={Calendar}>Status Realisasi — Semester 2</SectionTitle>
        {agg.monthsData.length === 0 ? (
          <p className="text-xs text-slate-400">Belum ada data bulan berjalan di semester 2 (mulai Juli).</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              <StatBox label="AKM Penjualan S2" value={`${fmtNum(agg.totalAkm)} btl`} sub={`${agg.monthsData.length} bulan terisi`} />
              <StatBox label="Rata² Capaian" value={`${fmtPct(agg.avgCapaian)}%`} pct={agg.avgCapaian} />
              <StatBox label="Rata² Retur (BB)" value={`${fmtPct(agg.avgRetur)}%`} />
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agg.trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="bulan" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmtNum(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="penjualan" name="Realisasi" fill="#f97316" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="target" name="Target" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle icon={Users}>
          Tabel Rata-Rata Penjualan YL — Kumulatif (Januari s/d Terakhir)
        </SectionTitle>
        <TabelRataRataYL
          perYL={perYL}
          startIdx={0}
          endIdx={11}
          title="Rata-Rata Penjualan YL Kumulatif (Januari s/d Terakhir)"
          subtitle="Rata-rata penjualan botol per hari kerja dari awal tahun (Januari) s/d bulan terakhir terisi"
        />
      </Card>

      <Card>
        <SectionTitle icon={TrendingUp}>Proyeksi vs Target</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <StatBox label="Target Sisa Tahun Ini" value={`${fmtNum(targetSisa)} btl`} sub={`Estimasi target tahunan: ${fmtNum(targetTahunEstimasi)}`} />
          <StatBox label="Kapasitas Tim (Estimasi)" value={`${fmtNum(kapasitasSisaEstimasi)} btl`} sub={`${monthsRemaining} bulan tersisa, ${jumlahYL} YL aktif`} />
          <StatBox
            label="Selisih Proyeksi"
            value={`${kapasitasSisaEstimasi - targetSisa >= 0 ? "+" : ""}${fmtNum(kapasitasSisaEstimasi - targetSisa)} btl`}
            pct={targetSisa > 0 ? (kapasitasSisaEstimasi / targetSisa) * 100 : null}
          />
        </div>
        <p className="text-[10.5px] text-slate-400 mt-2">*Estimasi berdasarkan rata-rata realisasi &amp; target bulan-bulan yang sudah terisi.</p>
      </Card>

      <UjiKelayakanBebanCard
        targetSisa={targetSisa}
        monthsRemaining={monthsRemaining}
        jumlahYL={jumlahYL}
        currentAvgYL={agg.monthsData.length > 0 ? average(agg.monthsData.map((x) => x.m.salesPerYL || (x.m.ratarataPenjualanYL ? Math.round(x.m.ratarataPenjualanYL / 10) : 0))) || undefined : undefined}
      />

      <AnalisisAbsensiLossCard
        months={agg.monthsData.map((x) => x.m)}
        title="Analisis Dampak Absensi & Loss Potential — Semester 2"
        subtitle="Evaluasi frekuensi ketidakhadiran dan potensi botol terlewatkan selama semester 2 berjalan"
      />

      <AnalisisMixProductCard
        months={agg.monthsData.map((x) => x.m)}
        title="Evaluasi Mix Produk — Semester 2"
        subtitle="Keseimbangan penetrasi varian baru (Original Mangga, Original Stroberi, Yakult Light) vs Original (YO)"
      />

      <Card>
        <SectionTitle icon={AlertTriangle}>Alarm Operasional</SectionTitle>
        {alarmMonths.length === 0 ? (
          <p className="text-xs text-slate-400">Tidak ada lonjakan retur (BB) di atas 10% pada semester ini. 👍</p>
        ) : (
          <ul className="space-y-2">
            {alarmMonths.map((x) => (
              <li key={x.key} className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-xl px-3 py-2">
                <span className="text-xs font-bold text-red-700 dark:text-red-300">Retur {MONTH_LABELS[x.idx]}</span>
                <span className="text-sm font-black text-red-700 dark:text-red-300">{fmtPct(x.m.persenKembaliBotol)}%</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 4. Laporan Tahunan
// ----------------------------------------------------------------------------

function computeTahunanAgg(bulanan: Record<string, any>, tahun?: string | number) {
  const monthsData = MONTHS
    .map((k, i) => ({ key: k, idx: i, m: tahun ? applyTahunLaluFallback(bulanan[k], tahun, i) : bulanan[k] }))
    .filter((x) => x.m);
  if (monthsData.length === 0) return null;

  const akmSoFar = sum(monthsData.map((x) => x.m.akmPenjualan));
  const targetSoFar = sum(monthsData.map((x) => x.m.akmTarget));
  const count = monthsData.length;

  const estimasiTahunan = count > 0 ? (akmSoFar / count) * 12 : 0;
  const targetTahunan = count > 0 ? (targetSoFar / count) * 12 : 0;

  const growthYoY = average(monthsData.map((x) => x.m.persenTahunLalu));
  const growthPct = growthYoY !== null ? growthYoY - 100 : null;

  const lastMonth = monthsData[monthsData.length - 1].m;
  const areaTercoverFinal = lastMonth?.persenAreaTercover ?? null;

  const capaianTahunan = targetTahunan > 0 ? (estimasiTahunan / targetTahunan) * 100 : null;

  const trend = monthsData.map((x) => ({ bulan: MONTH_SHORT[x.idx], penjualan: x.m.akmPenjualan || 0, target: x.m.akmTarget || 0 }));

  const kesimpulan = (() => {
    const parts: string[] = [];
    parts.push(
      capaianTahunan !== null && capaianTahunan >= 100
        ? `Estimasi hasil tahunan diproyeksikan mencapai ${fmtPct(capaianTahunan, 1)}% dari target tahunan — performa tim secara keseluruhan berada di atas target.`
        : `Estimasi hasil tahunan diproyeksikan ${capaianTahunan !== null ? fmtPct(capaianTahunan, 1) + "% " : ""}dari target tahunan — performa tim masih perlu didorong agar mencapai target.`
    );
    if (growthPct !== null) {
      parts.push(
        growthPct >= 0
          ? `Secara Year-on-Year, tim tumbuh rata-rata ${fmtPct(growthPct, 1)}% dibanding tahun lalu.`
          : `Secara Year-on-Year, tim mengalami penurunan rata-rata ${fmtPct(Math.abs(growthPct), 1)}% dibanding tahun lalu.`
      );
    }
    if (areaTercoverFinal !== null) {
      parts.push(`Cakupan area akhir tercatat ${fmtPct(areaTercoverFinal, 0)}% dari seluruh wilayah Jember 1.`);
    }
    return parts.join(" ");
  })();

  return { monthsData, akmSoFar, targetSoFar, count, estimasiTahunan, targetTahunan, growthPct, areaTercoverFinal, capaianTahunan, trend, kesimpulan };
}

function LaporanTahunan({ bulanan, perYL, tahun }: {
  bulanan: Record<string, any>; perYL: any[]; tahun: string | number;
}) {
  const t = useMemo(() => computeTahunanAgg(bulanan, tahun), [bulanan, tahun]);

  if (!t) {
    return <EmptyMonthNote label={`tahun ${tahun}`} />;
  }
  const { count, akmSoFar, estimasiTahunan, targetTahunan, capaianTahunan, growthPct, trend, areaTercoverFinal, kesimpulan, monthsData } = t;

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle icon={Calendar}>Laporan Tahunan {tahun} (Fokus Strategis)</SectionTitle>
        <p className="text-[10.5px] text-slate-400 mb-3">*Estimasi diproyeksikan dari {count} bulan data yang sudah terisi.</p>
        <div className="flex flex-wrap gap-2">
          <StatBox label="Estimasi Hasil Tahunan" value={`${fmtNum(estimasiTahunan)} btl`} sub={`Realisasi s/d saat ini: ${fmtNum(akmSoFar)} btl`} />
          <StatBox label="Target Tahunan" value={`${fmtNum(targetTahunan)} btl`} />
          <StatBox label="Pencapaian YoY" value={capaianTahunan !== null ? `${fmtPct(capaianTahunan)}%` : "-"} pct={capaianTahunan} />
        </div>
      </Card>

      <Card>
        <SectionTitle icon={TrendingUp}>Growth (Pertumbuhan Tahun Ini vs Tahun Lalu)</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <StatBox
            label="Growth YoY"
            value={growthPct !== null ? `${growthPct >= 0 ? "+" : ""}${fmtPct(growthPct)}%` : "-"}
            sub="Rata-rata dari bulan-bulan terisi"
          />
        </div>
        <div className="h-56 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="bulan" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => fmtNum(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="penjualan" name="Realisasi" fill="#f97316" radius={[6, 6, 0, 0]} />
              <Bar dataKey="target" name="Target" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <SectionTitle icon={Users}>
          Tabel Rata-Rata Penjualan Tahunan per YL (Januari s/d Terakhir)
        </SectionTitle>
        <TabelRataRataYL
          perYL={perYL}
          startIdx={0}
          endIdx={count > 0 ? monthsData[count - 1].idx : 11}
          title={`Rekapitulasi Rata-Rata Tahunan Seluruh YL — Tahun ${tahun}`}
          subtitle="Rata-rata penjualan botol/hari seluruh Yakult Lady dari awal tahun (Januari) s/d bulan terakhir terisi"
        />
      </Card>

      <AnalisisMixProductCard
        months={monthsData.map((x) => x.m)}
        title={`Evaluasi Mix Produk Tahunan — Tahun ${tahun}`}
        subtitle="Keseimbangan penetrasi varian baru (Original Mangga, Original Stroberi, Yakult Light) terhadap Original (YO) sepanjang tahun"
      />

      <AnalisisAbsensiLossCard
        months={monthsData.map((x) => x.m)}
        title={`Potensi Kehilangan Akibat Absensi — Tahun ${tahun}`}
        subtitle="Estimasi total botol dan omzet yang terlewatkan akibat absensi izin/sakit YL selama tahun berjalan"
      />

      {targetTahunan > akmSoFar && (
        <UjiKelayakanBebanCard
          targetSisa={targetTahunan - akmSoFar}
          monthsRemaining={Math.max(1, 12 - count)}
          currentAvgYL={average(monthsData.map((x) => x.m.salesPerYL || x.m.ratarataPenjualanYL)) || undefined}
        />
      )}

      <Card>
        <SectionTitle icon={MapPin}>Cakupan Final</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <StatBox label="% Area Tercover (Terakhir)" value={areaTercoverFinal !== null ? `${fmtPct(areaTercoverFinal, 0)}%` : "-"} pct={areaTercoverFinal} />
        </div>
      </Card>

      <Card>
        <SectionTitle icon={Sparkles}>Kesimpulan Akhir</SectionTitle>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{kesimpulan}</p>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 5. Mode Presentasi (Slide Show ala PPT)
// ----------------------------------------------------------------------------

interface SlideDef {
  id?: string;
  eyebrow: string;
  title?: string;
  node: React.ReactNode;
  speakerNotes?: string;
  isActionPlan?: boolean;
  coverImage?: string;
}

function SlideTitle({ children, sub, coverImage }: { children: React.ReactNode; sub?: string; coverImage?: string }) {
  // Catatan: foto cover sekarang dirender full-bleed langsung di kartu slide (lihat SlideShow),
  // supaya foto memenuhi SELURUH kartu (termasuk saat landscape) — di sini tinggal teksnya saja.
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <h1 className={`text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-tight ${coverImage ? "drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]" : ""}`}>{children}</h1>
        {sub && (
          <p className={`text-slate-300 text-xs sm:text-sm mt-2 sm:mt-3 font-medium tracking-wide ${coverImage ? "drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" : ""}`}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

function BigStat({ label, value, sub, pct }: { label: string; value: string; sub?: string; pct?: number | null }) {
  return (
    <div className="text-center">
      <p className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl sm:text-4xl lg:text-5xl font-black text-white">{value}</p>
      {sub && <p className="text-slate-500 text-[11px] sm:text-xs mt-1">{sub}</p>}
      {pct !== undefined && pct !== null && (
        <span className={`inline-block mt-2 text-xs font-bold px-3 py-0.5 rounded-full ${
          pct >= 100 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
        }`}>
          {pct >= 100 ? "▲" : "▼"} {fmtPct(pct)}%
        </span>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Toggle Tipe Grafik (Batang / Garis / Kurva / Donat) — biar tampilan slide
// tidak monoton tiap presentasi. Pilihan tersimpan per-grafik di localStorage.
// ----------------------------------------------------------------------------

type ChartKind = "bar" | "line" | "area" | "pie";
const CHART_KIND_LABEL: Record<ChartKind, string> = { bar: "Batang", line: "Garis", area: "Kurva", pie: "Donat" };
const CHART_KIND_ICON: Record<ChartKind, any> = { bar: BarChart3, line: TrendingUp, area: Activity, pie: PieChartIcon };

function useChartKindCycle(storageKey: string, options: ChartKind[]) {
  const [kind, setKind] = useState<ChartKind>(() => {
    try {
      const saved = localStorage.getItem(storageKey) as ChartKind | null;
      return saved && options.includes(saved) ? saved : options[0];
    } catch {
      return options[0];
    }
  });

  const cycle = () => {
    setKind((prev) => {
      const next = options[(options.indexOf(prev) + 1) % options.length];
      try {
        localStorage.setItem(storageKey, next);
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  return [kind, cycle] as const;
}

function ChartKindToggleButton({ kind, onClick }: { kind: ChartKind; onClick: () => void }) {
  const Icon = CHART_KIND_ICON[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      title="Ganti tampilan grafik"
      className="absolute -top-1 right-0 z-10 flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2 py-1 rounded-full bg-slate-800/90 border border-slate-600 text-slate-300 hover:bg-orange-500/20 hover:border-orange-500/50 hover:text-orange-300 active:scale-95 transition-all"
    >
      <Icon className="w-3 h-3" />
      {CHART_KIND_LABEL[kind]}
    </button>
  );
}

// Grafik distribusi Kondisi YL — bisa ditoggle Batang <-> Donat
function KondisiYLChart({ data, storageKey }: { data: { name: string; value: number }[]; storageKey: string }) {
  const [kind, cycle] = useChartKindCycle(storageKey, ["bar", "pie"]);
  return (
    <div className="relative h-40 sm:h-48">
      <ChartKindToggleButton kind={kind} onClick={cycle} />
      <ResponsiveContainer width="100%" height="100%">
        {kind === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="42%" outerRadius="80%" paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={KONDISI_COLORS[i % KONDISI_COLORS.length]} />)}
            </Pie>
            <Tooltip
              formatter={(v: number, n: string) => [`${v} YL`, n]}
              contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", color: "#fff", fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: "#cbd5e1" }} />
          </PieChart>
        ) : (
          <BarChart data={data} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} domain={[0, (dataMax: number) => Math.max(dataMax + 1, 4)]} />
            <Tooltip
              formatter={(v: number) => [`${v} YL`, "Jumlah YL"]}
              contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", color: "#fff", fontSize: 11 }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              <LabelList dataKey="value" position="top" fill="#f8fafc" fontSize={11} fontWeight="bold" />
              {data.map((_, i) => <Cell key={i} fill={KONDISI_COLORS[i % KONDISI_COLORS.length]} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// Grafik tren penjualan vs target (bulanan) — bisa ditoggle Batang <-> Garis <-> Kurva
function TrendPenjualanChart({
  data,
  storageKey,
  heightClass = "h-56 sm:h-64 md:h-72",
}: {
  data: any[];
  storageKey: string;
  heightClass?: string;
}) {
  const [kind, cycle] = useChartKindCycle(storageKey, ["bar", "line", "area"]);
  return (
    <div className={`relative ${heightClass} w-full`}>
      <ChartKindToggleButton kind={kind} onClick={cycle} />
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart data={data} margin={{ top: 10, right: 25, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
            <XAxis dataKey="bulan" tick={{ fill: "#94a3b8", fontSize: 10 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
            <Tooltip formatter={(v: number) => fmtNum(v)} contentStyle={{ backgroundColor: "#1e293b", borderColor: "#475569", color: "#fff", fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
            <Bar dataKey="penjualan" name="Realisasi" fill="#f97316" radius={[4, 4, 0, 0]} />
            <Bar dataKey="target" name="Target" fill="#64748b" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : kind === "area" ? (
          <AreaChart data={data} margin={{ top: 10, right: 25, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id={`${storageKey}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.55} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
            <XAxis dataKey="bulan" tick={{ fill: "#94a3b8", fontSize: 10 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
            <Tooltip formatter={(v: number) => fmtNum(v)} contentStyle={{ backgroundColor: "#1e293b", borderColor: "#475569", color: "#fff", fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
            <Area type="monotone" dataKey="penjualan" name="Realisasi" stroke="#f97316" fill={`url(#${storageKey}-fill)`} strokeWidth={2.5} />
            <Area type="monotone" dataKey="target" name="Target" stroke="#94a3b8" fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 10, right: 25, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
            <XAxis dataKey="bulan" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
            <Tooltip formatter={(v: number) => fmtNum(v)} contentStyle={{ backgroundColor: "#1e293b", borderColor: "#475569", color: "#fff", fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#cbd5e1" }} />
            <Line type="monotone" dataKey="penjualan" name="Realisasi" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="target" name="Target" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function InteractiveActionPlanSlide({
  actionPlans,
  onAddActionPlan,
  onToggleActionPlan,
  onDeleteActionPlan,
  subtitle,
}: {
  actionPlans: ActionPlanItem[];
  onAddActionPlan: (t: string) => void;
  onToggleActionPlan: (id: string) => void;
  onDeleteActionPlan: (id: string) => void;
  subtitle?: string;
}) {
  const [newText, setNewText] = useState("");

  const handleAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newText.trim()) return;
    onAddActionPlan(newText.trim());
    setNewText("");
  };

  const doneCount = actionPlans.filter((p) => p.done).length;

  return (
    <div
      className="w-full max-w-2xl mx-auto flex flex-col h-full justify-between gap-3 text-left"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <p className="text-[11px] text-slate-400 font-medium">
          {subtitle || "Komitmen & target tindak lanjut langsung dari hasil evaluasi:"}
        </p>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
          {doneCount} / {actionPlans.length} Selesai ({actionPlans.length > 0 ? Math.round((doneCount / actionPlans.length) * 100) : 0}%)
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto max-h-[42vh] pr-1 scrollbar-thin">
        {actionPlans.map((it, idx) => (
          <div
            key={it.id}
            className={`group flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
              it.done
                ? "bg-slate-900/40 border-slate-800/80 text-slate-500"
                : "bg-slate-900/90 border-slate-700/80 text-white hover:border-orange-500/50 shadow-sm"
            }`}
          >
            <button
              type="button"
              onClick={() => onToggleActionPlan(it.id)}
              className="cursor-pointer p-0.5 text-orange-400 hover:text-orange-300 transition-transform active:scale-90 shrink-0"
              title={it.done ? "Tandai belum selesai" : "Tandai selesai"}
            >
              {it.done ? (
                <CheckSquare className="w-4 h-4 text-emerald-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-400 group-hover:text-orange-400" />
              )}
            </button>
            <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0">
              {idx + 1}
            </span>
            <span
              onClick={() => onToggleActionPlan(it.id)}
              className={`text-xs flex-1 cursor-pointer select-none leading-relaxed ${
                it.done ? "line-through opacity-70" : "font-medium"
              }`}
            >
              {it.text}
            </span>
            <button
              type="button"
              onClick={() => onDeleteActionPlan(it.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-1 transition-opacity cursor-pointer shrink-0"
              title="Hapus komitmen"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {actionPlans.length === 0 && (
          <div className="text-center py-8 text-slate-500 italic text-xs">
            Belum ada butir komitmen. Ketik di bawah ini untuk mencatat komitmen tim secara langsung.
          </div>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 pt-2 border-t border-slate-800/80">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="+ Tulis komitmen baru saat rapat berlangsung..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button
          type="submit"
          disabled={!newText.trim()}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <Plus className="w-3.5 h-3.5" /> Tambah
        </button>
      </form>
    </div>
  );
}

// Daftar tema warna background kartu slide (semua slide, kecuali cover foto slide 1).
// Tombol "Ganti Tema" di toolbar mode presentasi akan memutar indeks ini,
// dan berlaku untuk SEMUA slide sekaligus (bukan per-slide).
export interface SlideBgTheme {
  id: string;
  name: string;
  classes: string;
  isLight?: boolean;
  dotColor: string;
  category: "terang" | "gelap";
}

const SLIDE_BG_THEMES: SlideBgTheme[] = [
  // WARNA TERANG / CERAH (Diminta Pengguna: Pink, Biru Muda, dll.)
  {
    id: "pink-ceria",
    name: "Pink Ceria",
    classes: "from-[#fff0f5] via-[#fce7f3] to-[#fbcfe8]",
    isLight: true,
    dotColor: "#f472b6",
    category: "terang",
  },
  {
    id: "biru-muda",
    name: "Biru Muda Segar",
    classes: "from-[#f0f9ff] via-[#e0f2fe] to-[#bae6fd]",
    isLight: true,
    dotColor: "#38bdf8",
    category: "terang",
  },
  {
    id: "mint-segar",
    name: "Mint Hijau Muda",
    classes: "from-[#f0fdf4] via-[#dcfce7] to-[#bbf7d0]",
    isLight: true,
    dotColor: "#4ade80",
    category: "terang",
  },
  {
    id: "lavender-lembut",
    name: "Lavender Lembut",
    classes: "from-[#faf5ff] via-[#f3e8ff] to-[#e9d5ff]",
    isLight: true,
    dotColor: "#c084fc",
    category: "terang",
  },
  {
    id: "peach-manis",
    name: "Peach Manis",
    classes: "from-[#fff7ed] via-[#ffedd5] to-[#fed7aa]",
    isLight: true,
    dotColor: "#fb923c",
    category: "terang",
  },
  {
    id: "putih-minimalis",
    name: "Putih Minimalis",
    classes: "from-[#ffffff] via-[#f8fafc] to-[#e2e8f0]",
    isLight: true,
    dotColor: "#cbd5e1",
    category: "terang",
  },
  // WARNA GELAP / ELEGAN (Klasik)
  {
    id: "malam-biru",
    name: "Malam Biru",
    classes: "from-[#131728] via-[#0E1220] to-[#0A0D18]",
    isLight: false,
    dotColor: "#1e293b",
    category: "gelap",
  },
  {
    id: "zamrud-gelap",
    name: "Zamrud Gelap",
    classes: "from-[#0f2e27] via-[#0b211d] to-[#081714]",
    isLight: false,
    dotColor: "#065f46",
    category: "gelap",
  },
  {
    id: "ungu-royal",
    name: "Ungu Royal",
    classes: "from-[#1e1533] via-[#171029] to-[#0f0a1c]",
    isLight: false,
    dotColor: "#581c87",
    category: "gelap",
  },
  {
    id: "merah-marun",
    name: "Merah Marun",
    classes: "from-[#2a1414] via-[#1f0f0f] to-[#150a0a]",
    isLight: false,
    dotColor: "#881337",
    category: "gelap",
  },
  {
    id: "cokelat-elegan",
    name: "Cokelat Elegan",
    classes: "from-[#241a12] via-[#1a130d] to-[#100c08]",
    isLight: false,
    dotColor: "#78350f",
    category: "gelap",
  },
  {
    id: "abu-netral",
    name: "Abu Netral",
    classes: "from-[#1c1f26] via-[#15171c] to-[#0e1013]",
    isLight: false,
    dotColor: "#334155",
    category: "gelap",
  },
];

function SlideShow({
  slides,
  onClose,
  actionPlans,
  onAddActionPlan,
  onToggleActionPlan,
  onDeleteActionPlan,
}: {
  slides: SlideDef[];
  onClose: () => void;
  actionPlans: ActionPlanItem[];
  onAddActionPlan: (t: string) => void;
  onToggleActionPlan: (id: string) => void;
  onDeleteActionPlan: (id: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [showJumpMenu, setShowJumpMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [blackScreen, setBlackScreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [forceRotate, setForceRotate] = useState(false);
  const [rotateManualOverride, setRotateManualOverride] = useState<boolean | null>(null);

  const pointerDownRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastWheelTimeRef = useRef<number>(0);
  const slideCardRef = useRef<HTMLDivElement>(null);
  const [exportingImage, setExportingImage] = useState(false);

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toast pemberitahuan pergantian tema
  const [themeToast, setThemeToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerThemeToast = (themeName: string, isLight?: boolean) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setThemeToast(`${themeName} ${isLight ? "✨ (Warna Terang)" : "🌙 (Warna Gelap)"}`);
    toastTimerRef.current = setTimeout(() => {
      setThemeToast(null);
    }, 2500);
  };

  // Tema warna background kartu slide — berlaku global utk semua slide, tersimpan antar sesi
  const [bgThemeIdx, setBgThemeIdx] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("presentasi_bg_theme_idx");
      const parsed = saved ? parseInt(saved, 10) : 0;
      return Number.isFinite(parsed) && parsed >= 0 && parsed < SLIDE_BG_THEMES.length ? parsed : 0;
    } catch {
      return 0;
    }
  });
  const bgTheme = SLIDE_BG_THEMES[bgThemeIdx] || SLIDE_BG_THEMES[0];

  const selectBgTheme = (newIdx: number) => {
    setBgThemeIdx(newIdx);
    try {
      localStorage.setItem("presentasi_bg_theme_idx", String(newIdx));
    } catch {}
    const targetTheme = SLIDE_BG_THEMES[newIdx];
    if (targetTheme) {
      triggerThemeToast(targetTheme.name, targetTheme.isLight);
    }
  };

  const cycleBgTheme = (e?: React.MouseEvent | React.PointerEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setBgThemeIdx((prev) => {
      const next = (prev + 1) % SLIDE_BG_THEMES.length;
      try {
        localStorage.setItem("presentasi_bg_theme_idx", String(next));
      } catch {}
      const targetTheme = SLIDE_BG_THEMES[next];
      if (targetTheme) {
        triggerThemeToast(targetTheme.name, targetTheme.isLight);
      }
      return next;
    });
  };

  const scheduleHideControls = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible((prev) => {
        if (showJumpMenu || showShortcuts || showNotes) return prev;
        return false;
      });
    }, 5000);
  };

  const revealControls = () => {
    setControlsVisible(true);
    scheduleHideControls();
  };

  useEffect(() => {
    scheduleHideControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isFullscreen) {
      scheduleHideControls();
    }
  }, [isFullscreen]);

  useEffect(() => {
    setIdx(0);
  }, [slides.length]);

  const goNext = () => {
    if (blackScreen) {
      setBlackScreen(false);
      return;
    }
    setIdx((i) => Math.min(i + 1, slides.length - 1));
    scheduleHideControls();
  };

  const goPrev = () => {
    if (blackScreen) {
      setBlackScreen(false);
      return;
    }
    setIdx((i) => Math.max(i - 1, 0));
    scheduleHideControls();
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } catch {}
  };

  const handleClosePresentation = (e?: React.MouseEvent | React.PointerEvent) => {
    if (e) {
      e.stopPropagation();
    }
    try {
      const orient = (screen as any).orientation;
      if (orient?.unlock) orient.unlock();
    } catch {}
    try {
      if (typeof document !== "undefined" && document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {}
    onClose();
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    setIsFullscreen(!!document.fullscreenElement);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (rotateManualOverride !== null) {
      setForceRotate(rotateManualOverride);
    } else {
      setForceRotate(false);
    }
  }, [rotateManualOverride]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (blackScreen) {
        if (e.key === "Escape") handleClosePresentation();
        else setBlackScreen(false);
        return;
      }

      if (showJumpMenu) {
        if (e.key === "Escape") setShowJumpMenu(false);
        return;
      }
      if (showShortcuts) {
        if (e.key === "Escape") setShowShortcuts(false);
        return;
      }

      // Jangan tangkap tombol navigasi slide (Backspace/Enter/panah/spasi) saat
      // fokus sedang berada di input/textarea/select — biarkan browser memprosesnya
      // secara normal (mis. menghapus karakter), supaya tidak "lompat slide" saat
      // sedang mengetik di field seperti Area / Nama pada slide Apresiasi Performa.
      const activeEl = document.activeElement as HTMLElement | null;
      const isTypingTarget =
        !!activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          activeEl.isContentEditable);
      if (isTypingTarget) {
        if (e.key === "Escape") activeEl?.blur();
        return;
      }

      if (
        e.key === "ArrowRight" ||
        e.key === "ArrowDown" ||
        e.key === "PageDown" ||
        e.key === " " ||
        e.key === "Enter" ||
        e.key === "MediaTrackNext" ||
        e.keyCode === 34 ||
        e.keyCode === 39
      ) {
        e.preventDefault();
        goNext();
        return;
      } else if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowUp" ||
        e.key === "PageUp" ||
        e.key === "Backspace" ||
        e.key === "MediaTrackPrevious" ||
        e.keyCode === 33 ||
        e.keyCode === 37
      ) {
        e.preventDefault();
        goPrev();
        return;
      }

      revealControls();

      if (e.key === "b" || e.key === "B" || e.key === ".") {
        e.preventDefault();
        setBlackScreen((prev) => !prev);
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setShowNotes((prev) => !prev);
      } else if (e.key === "f" || e.key === "F" || e.key === "F5") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "Escape") {
        handleClosePresentation();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, onClose, showJumpMenu, showShortcuts, blackScreen, isFullscreen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerDownRef.current) return;
    const diffX = e.clientX - pointerDownRef.current.x;
    const diffY = Math.abs(e.clientY - pointerDownRef.current.y);
    const duration = Date.now() - pointerDownRef.current.time;

    // Abaikan jika interaksi pointer berasal dari tombol atau elemen interaktif
    const rawTarget = e.target as any;
    const targetEl = (rawTarget instanceof Element ? rawTarget : rawTarget?.parentElement) as HTMLElement | null;
    if (targetEl && typeof targetEl.closest === "function" && targetEl.closest("button, a, input, select, textarea, [role='button'], .no-slide-toggle")) {
      pointerDownRef.current = null;
      return;
    }

    if (Math.abs(diffX) > 45 && diffY < 80 && duration < 800) {
      if (diffX < 0) goNext();
      else goPrev();
    } else if (Math.abs(diffX) < 15 && diffY < 15 && duration < 350) {
      // Ketuk (tap) singkat di zona tepi kiri/kanan langsung pindah slide.
      // Dihitung dari koordinat ketuk terhadap lebar layar, BUKAN dari tombol
      // transparan absolut yang sering tertutup kartu slide (kartu z-20 hampir
      // selebar layar di HP, sehingga area tombol tepi yang benar-benar bisa
      // disentuh jadi sangat tipis). Dengan cara ini area ketuk tepi selalu
      // konsisten selebar yang dimaksud, di seluruh permukaan layar.
      const tapX = pointerDownRef.current.x;
      const w = window.innerWidth;
      const edgeZone = Math.min(w * 0.2, 140);
      if (tapX < edgeZone) {
        goPrev();
      } else if (tapX > w - edgeZone) {
        goNext();
      } else if (!controlsVisible) {
        revealControls();
      } else {
        setControlsVisible(false);
      }
    }
    pointerDownRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 400) return;
    if (Math.abs(e.deltaY) > 35) {
      lastWheelTimeRef.current = now;
      if (e.deltaY > 0) goNext();
      else goPrev();
    }
  };

  if (slides.length === 0) {
    return (
      <div className="fixed inset-0 z-[200] bg-[#0A0D17] text-white flex flex-col items-center justify-center gap-4 px-6">
        <AlertTriangle className="w-10 h-10 text-amber-400" />
        <p className="text-sm font-bold text-slate-300 text-center">Belum ada data cukup untuk membuat slide presentasi.</p>
        <button onClick={onClose} className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold cursor-pointer">
          Tutup
        </button>
      </div>
    );
  }

  const cur = slides[Math.min(idx, slides.length - 1)];

  // Ekspor slide yang sedang tampil sebagai gambar PNG (untuk dibagikan cepat via WhatsApp dsb.)
  const handleExportSlideImage = async () => {
    if (!slideCardRef.current || exportingImage) return;
    setExportingImage(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setThemeToast("⏳ Sedang memproses gambar slide...");

    try {
      const mod: any = await import("html2canvas");
      const html2canvas = mod.default || mod;

      // Gunakan timeout agar tidak pernah stuck selamanya jika browser lambat
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Batas waktu ekspor gambar terlampaui (timeout)")), 12000);
      });

      const renderPromise = html2canvas(slideCardRef.current, {
        backgroundColor: bgTheme.isLight ? "#f8fafc" : "#0f172a",
        scale: typeof window !== "undefined" && window.devicePixelRatio > 1 ? Math.min(window.devicePixelRatio, 2) : 1.5,
        useCORS: true,
        allowTaint: true,
        logging: false,
        imageTimeout: 4000,
        ignoreElements: (element: Element) => {
          return (
            element.classList?.contains("no-print") ||
            element.getAttribute("data-html2canvas-ignore") === "true"
          );
        },
        onclone: (_clonedDoc: Document, clonedEl: HTMLElement) => {
          // Matikan efek animasi / transisi di clone agar render instan & tidak freeze
          clonedEl.style.transform = "none";
          clonedEl.style.animation = "none";
          clonedEl.style.transition = "none";
        }
      });

      const canvas = await Promise.race([renderPromise, timeoutPromise]);
      const safeTitle = String(cur.eyebrow || "slide").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const filename = `slide-${idx + 1}-${safeTitle || "yakult"}.png`;

      await new Promise<void>((resolve, reject) => {
        try {
          canvas.toBlob(async (blob: Blob | null) => {
            if (!blob) {
              // Fallback jika toBlob null: coba via dataURL
              try {
                const dataUrl = canvas.toDataURL("image/png");
                const res = await fetch(dataUrl);
                const fallbackBlob = await res.blob();
                await downloadBlob(fallbackBlob, { filename, mimeType: "image/png" });
                resolve();
              } catch (fallbackErr) {
                reject(fallbackErr || new Error("Canvas blob creation failed"));
              }
              return;
            }
            try {
              await downloadBlob(blob, {
                filename,
                mimeType: "image/png"
              });
              resolve();
            } catch (e) {
              reject(e);
            }
          }, "image/png");
        } catch (toBlobErr) {
          reject(toBlobErr);
        }
      });

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setThemeToast("📸 Slide berhasil diunduh sebagai gambar!");
      toastTimerRef.current = setTimeout(() => setThemeToast(null), 2500);
    } catch (err: any) {
      console.error("Gagal mengekspor slide sebagai gambar:", err);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      const isTimeout = err?.message?.includes("timeout");
      setThemeToast(isTimeout ? "⚠️ Proses unduh terlalu lama. Silakan coba lagi atau gunakan tombol Cetak / PDF." : "⚠️ Gagal mengunduh gambar slide.");
      toastTimerRef.current = setTimeout(() => setThemeToast(null), 4000);
    } finally {
      setExportingImage(false);
    }
  };

  return (
    <div
      className={`fixed z-[200] bg-[#07090F] text-white flex flex-col justify-between overflow-hidden select-none ${
        forceRotate ? "" : "inset-x-0 top-0"
      }`}
      style={
        forceRotate
          ? {
              top: 0,
              left: 0,
              width: "100vh",
              height: "100vw",
              transformOrigin: "top left",
              transform: "rotate(90deg) translateY(-100%)",
            }
          : { height: "100dvh", maxHeight: "100%" }
      }
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={(e) => {
        if (typeof window !== "undefined") {
          const y = e.clientY;
          const h = window.innerHeight;
          if (y < 80 || y > h - 80) {
            revealControls();
          }
        }
      }}
      onWheel={handleWheel}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle at center, #ffffff06 1px, transparent 1px)", backgroundSize: "28px 28px" }}
      />

      {blackScreen && (
        <div
          onClick={() => setBlackScreen(false)}
          className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center cursor-pointer transition-opacity animate-in fade-in"
        >
          <div className="text-center opacity-30 hover:opacity-70 transition-opacity">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Layar Blank (Presenter Mode)</p>
            <p className="text-[11px] text-slate-500 mt-1">Klik atau tekan tombol apa saja untuk melanjutkan</p>
          </div>
        </div>
      )}

      {/* Floating Quick Dock saat controls disembunyikan agar tombol X, Tema, & Menu selalu bisa diklik */}
      {!controlsVisible && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="fixed top-3 right-3 z-50 flex items-center gap-1.5 animate-in fade-in duration-200"
        >
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              cycleBgTheme(e);
            }}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md shadow-lg cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
            title={`Ganti Tema Slide (Klik untuk ganti: ${bgTheme.name})`}
          >
            <span
              className="w-3 h-3 rounded-full border border-white/50 shrink-0 shadow-xs"
              style={{ backgroundColor: bgTheme.dotColor }}
            />
            <Palette className="w-3.5 h-3.5 text-orange-400" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              revealControls();
            }}
            className="px-2.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md shadow-lg cursor-pointer transition-all active:scale-95 flex items-center gap-1 text-xs font-bold"
            title="Tampilkan Bilah Navigasi & Menu Lengkap"
          >
            <Menu className="w-4 h-4 text-orange-400" />
            <span className="hidden sm:inline text-[11px]">Menu</span>
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleClosePresentation(e);
            }}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-rose-950 border border-slate-700/80 text-slate-300 hover:text-rose-300 backdrop-blur-md shadow-lg cursor-pointer transition-all active:scale-95"
            title="Keluar Mode Presentasi (Esc)"
          >
            <X className="w-4 h-4 text-rose-400" />
          </button>
        </div>
      )}

      {/* Top Controls Bar */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => {
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        }}
        onMouseLeave={() => {
          scheduleHideControls();
        }}
        className={`flex items-center justify-between px-4 sm:px-6 relative z-30 shrink-0 border-b border-slate-800/40 bg-[#0A0D17]/90 backdrop-blur-md transition-all duration-300 ease-in-out ${
          controlsVisible ? "pt-3 pb-2 max-h-24 opacity-100" : "pt-0 pb-0 max-h-0 opacity-0 pointer-events-none border-transparent overflow-hidden"
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setShowJumpMenu(!showJumpMenu);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer transition-all border border-slate-700/80 shadow-xs active:scale-95"
            title="Daftar Slide (Quick Jump)"
          >
            <Layers className="w-3.5 h-3.5 text-orange-400" />
            <span className="hidden sm:inline">Daftar Slide</span>
          </button>

          <div className="flex gap-1 flex-wrap max-w-[30vw] sm:max-w-[45vw] items-center">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setIdx(i);
                }}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  i === idx ? "w-6 sm:w-7 bg-orange-500 shadow-sm shadow-orange-500/40" : "w-2 bg-slate-700 hover:bg-slate-500"
                }`}
                title={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setShowNotes(!showNotes);
            }}
            className={`p-2 rounded-xl text-xs font-bold cursor-pointer transition-all border active:scale-95 ${
              showNotes
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-700 hover:text-white"
            }`}
            title="Catatan Pembicara (Tekan N)"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setShowShortcuts(!showShortcuts);
            }}
            className={`p-2 rounded-xl text-xs font-bold cursor-pointer transition-all border active:scale-95 ${
              showShortcuts
                ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                : "bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-700 hover:text-white"
            }`}
            title="Petunjuk Pointer & Navigasi"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setRotateManualOverride((prev) => (prev === null ? !forceRotate : !prev));
            }}
            className={`p-2 rounded-xl text-xs font-bold cursor-pointer transition-all border active:scale-95 ${
              forceRotate
                ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                : "bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-700 hover:text-white"
            }`}
            title="Paksa Putar Layar ke Landscape (pakai ini kalau tampilan di proyektor masih kotak kecil/portrait)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setShowThemeMenu(!showThemeMenu);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-all active:scale-95 ${
              showThemeMenu
                ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                : "bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-700 hover:text-white"
            }`}
            title={`Pilih Tema Slide (Saat ini: ${bgTheme.name})`}
          >
            <span
              className="w-3 h-3 rounded-full border border-white/50 shrink-0 shadow-xs"
              style={{ backgroundColor: bgTheme.dotColor }}
            />
            <span className="hidden md:inline text-[11px]">{bgTheme.name}</span>
            <Palette className="w-3.5 h-3.5 text-orange-400" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleExportSlideImage();
            }}
            disabled={exportingImage}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white cursor-pointer transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait"
            title="Unduh Slide Ini sebagai Gambar PNG"
          >
            {exportingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white cursor-pointer transition-all active:scale-95"
            title={isFullscreen ? "Keluar Layar Penuh (F)" : "Layar Penuh (F)"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleClosePresentation(e);
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 border border-slate-700/80 text-slate-300 hover:text-rose-300 cursor-pointer transition-all active:scale-95"
            title="Keluar Mode Presentasi (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showJumpMenu && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-14 left-5 z-40 w-80 max-h-[70vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 space-y-1"
        >
          <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-slate-800">
            <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">Pilih Slide Presentasi</p>
            <span className="text-[10px] text-slate-500">{slides.length} Slide</span>
          </div>
          {slides.map((s, i) => (
            <button
              key={i}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setIdx(i);
                setShowJumpMenu(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all ${
                i === idx ? "bg-orange-500 text-white font-bold" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <div className="truncate mr-2">
                <span className="opacity-60 mr-1.5">#{i + 1}</span>
                <span>{s.title || s.eyebrow}</span>
              </div>
              <span className="text-[9px] opacity-70 uppercase tracking-wider shrink-0">{s.eyebrow}</span>
            </button>
          ))}
        </div>
      )}

      {/* Popover Menu Pilihan Tema Slide */}
      {showThemeMenu && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-14 right-4 sm:right-20 z-50 w-72 sm:w-84 bg-slate-900/98 border border-slate-700 rounded-2xl shadow-2xl p-3.5 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-amber-400" />
              <p className="text-xs font-black text-white tracking-wide">PILIH TEMA WARNA SLIDE</p>
            </div>
            <button
              type="button"
              onClick={() => setShowThemeMenu(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Kategori Warna Terang / Pastel */}
          <div className="mb-3">
            <p className="text-[10px] uppercase font-black tracking-wider text-pink-400 mb-1.5 flex items-center gap-1">
              <span>🌸</span>
              <span>Warna Terang / Cerah (Pastel)</span>
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {SLIDE_BG_THEMES.filter((t) => t.category === "terang").map((t) => {
                const tIdx = SLIDE_BG_THEMES.findIndex((x) => x.id === t.id);
                const isSelected = bgThemeIdx === tIdx;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      selectBgTheme(tIdx);
                      setShowThemeMenu(false);
                    }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? "bg-amber-500/20 text-white border-amber-400 shadow-md ring-1 ring-amber-400/40"
                        : "bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/50 shadow-xs shrink-0"
                      style={{ backgroundColor: t.dotColor }}
                    />
                    <span className="truncate text-[11px]">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kategori Warna Gelap / Elegan */}
          <div>
            <p className="text-[10px] uppercase font-black tracking-wider text-sky-400 mb-1.5 flex items-center gap-1">
              <span>🌙</span>
              <span>Warna Gelap / Elegan</span>
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {SLIDE_BG_THEMES.filter((t) => t.category === "gelap").map((t) => {
                const tIdx = SLIDE_BG_THEMES.findIndex((x) => x.id === t.id);
                const isSelected = bgThemeIdx === tIdx;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      selectBgTheme(tIdx);
                      setShowThemeMenu(false);
                    }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? "bg-amber-500/20 text-white border-amber-400 shadow-md ring-1 ring-amber-400/40"
                        : "bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/50 shadow-xs shrink-0"
                      style={{ backgroundColor: t.dotColor }}
                    />
                    <span className="truncate text-[11px]">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Tersimpan otomatis</span>
            <button
              type="button"
              onClick={() => {
                cycleBgTheme();
              }}
              className="text-[10.5px] font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer"
            >
              Putar tema berikutnya →
            </button>
          </div>
        </div>
      )}

      {/* Toast notifikasi pergantian tema */}
      {themeToast && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-2xl bg-slate-900/95 text-white border border-amber-400/50 shadow-2xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-3 duration-200 pointer-events-none"
        >
          <Palette className="w-4 h-4 text-amber-400" />
          <span>Tema Slide: <strong className="text-amber-300">{themeToast}</strong></span>
        </div>
      )}

      {showShortcuts && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-14 right-5 z-40 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 text-xs space-y-3"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <p className="font-black text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-orange-400" /> Navigasi &amp; Pointer PPT
            </p>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setShowShortcuts(false);
              }}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2 text-slate-300 text-[11px]">
            <div className="flex justify-between items-center py-0.5">
              <span>Maju Slide Berikutnya</span>
              <kbd className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded font-mono text-[10px] text-orange-300">
                Spasi / ➡ / PageDown / Klik
              </kbd>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span>Mundur Slide Sebelumnya</span>
              <kbd className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded font-mono text-[10px] text-orange-300">
                ⬅ / PageUp / Backspace
              </kbd>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span>Layar Blank (Hitam)</span>
              <kbd className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded font-mono text-[10px] text-orange-300">
                B atau . (Titik)
              </kbd>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span>Catatan Pembicara</span>
              <kbd className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded font-mono text-[10px] text-orange-300">
                N
              </kbd>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span>Geser Layar (Pointer/Touch)</span>
              <span className="text-slate-400 italic">Tarik kiri/kanan / Roll mouse</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-1 sm:p-3.5 landscape:p-1 md:landscape:p-2 relative z-10 min-h-0 overflow-hidden">
        <button
          type="button"
          onClick={goPrev}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={idx === 0}
          className="absolute left-0 top-0 h-full w-[16%] sm:w-[20%] max-w-[140px] z-10 bg-transparent border-0 outline-none cursor-pointer disabled:cursor-default"
          title="Slide Sebelumnya (Klik/Sentuh Sisi Kiri)"
          aria-label="Slide sebelumnya"
        />

        <div
          ref={slideCardRef}
          className={`relative z-20 w-full mx-auto bg-gradient-to-b ${bgTheme.classes} border ${
            bgTheme.isLight ? "border-slate-300 shadow-2xl slide-theme-light" : "border-slate-800/90 shadow-2xl slide-theme-dark"
          } rounded-2xl flex flex-col justify-between overflow-hidden transition-all duration-300 ${
            isFullscreen || !controlsVisible
              ? "max-w-[98vw] h-full max-h-full p-2 sm:p-3.5 md:p-4 landscape:p-1.5 md:landscape:p-3"
              : "max-w-6xl xl:max-w-7xl h-full max-h-full p-2 sm:p-3.5 md:p-4 landscape:p-1.5 md:landscape:p-3"
          }`}
        >
          <div className="relative z-10 shrink-0 text-center mb-1 sm:mb-2 landscape:mb-0.5">
            <p className={`${
              bgTheme.isLight ? "text-orange-600 drop-shadow-none" : "text-orange-400 drop-shadow-lg"
            } text-[9.5px] sm:text-xs landscape:text-[9px] font-black tracking-[0.25em] uppercase`}>
              {cur.eyebrow}
            </p>
            {cur.title && (
              <h3 className={`text-xs sm:text-base md:text-lg landscape:text-xs sm:landscape:text-sm font-black ${
                bgTheme.isLight ? "text-slate-900 drop-shadow-none" : "text-white drop-shadow-lg"
              } mt-0.5 truncate`}>
                {cur.title}
              </h3>
            )}
          </div>

          <div className="relative z-10 flex-1 w-full min-h-0 overflow-y-auto overflow-x-hidden py-0.5 px-1 sm:px-2">
            {cur.isActionPlan ? (
              <InteractiveActionPlanSlide
                actionPlans={actionPlans}
                onAddActionPlan={onAddActionPlan}
                onToggleActionPlan={onToggleActionPlan}
                onDeleteActionPlan={onDeleteActionPlan}
                subtitle={`Komitmen & rencana aksi perbaikan untuk disepakati bersama:`}
              />
            ) : (
              <div
                className="w-full min-h-full flex flex-col items-center py-0.5"
                style={{ justifyContent: "safe center" }}
              >
                {cur.node}
              </div>
            )}
          </div>

          <div className={`relative z-10 shrink-0 flex items-center justify-between text-[8.5px] sm:text-[10px] landscape:text-[8px] ${
            bgTheme.isLight ? "text-slate-600 border-slate-300/80" : "text-slate-500 border-slate-800/40"
          } pt-1 sm:pt-1.5 landscape:pt-0.5 border-t`}>
            <span className={`font-mono text-[8px] sm:text-[10px] landscape:text-[7.5px] ${bgTheme.isLight ? "text-slate-600" : "text-slate-500"}`}>
              Yakult Presentation Deck &middot; Mode Layar Penuh
            </span>
            <span className={`font-mono font-bold ${bgTheme.isLight ? "text-slate-800" : "text-slate-400"} text-[8px] sm:text-[10px] landscape:text-[8px]`}>
              Slide {idx + 1} dari {slides.length}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={goNext}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={idx === slides.length - 1}
          className="absolute right-0 top-0 h-full w-[16%] sm:w-[20%] max-w-[140px] z-10 bg-transparent border-0 outline-none cursor-pointer disabled:cursor-default"
          title="Slide Berikutnya (Klik/Sentuh Sisi Kanan)"
          aria-label="Slide berikutnya"
        />
      </div>

      {showNotes && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="relative z-30 bg-slate-900/95 border-t border-slate-700/80 p-3 sm:p-4 shrink-0 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-2"
        >
          <div className="max-w-4xl mx-auto flex items-start justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Catatan Pembicara (Presenter Guidance) &middot; Slide #{idx + 1} ({cur.title || cur.eyebrow})
                </p>
                <p className="text-xs sm:text-sm text-slate-200 mt-1 leading-relaxed">
                  {cur.speakerNotes ||
                    "Sorot poin utama capaian pada slide ini. Bandingkan dengan target berkala dan ajak partisipasi tim untuk mendiskusikan kendala atau peluang perbaikan di area masing-masing."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setShowNotes(false);
              }}
              className="p-1 text-slate-400 hover:text-white cursor-pointer shrink-0"
              title="Tutup Catatan Pembicara"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => {
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        }}
        onMouseLeave={() => {
          scheduleHideControls();
        }}
        className={`flex items-center justify-between px-5 relative z-20 shrink-0 border-t border-slate-800/40 bg-[#0A0D17]/90 backdrop-blur-md transition-all duration-300 ease-in-out ${
          controlsVisible ? "pb-4 pt-2 max-h-24 opacity-100" : "pb-0 pt-0 max-h-0 opacity-0 pointer-events-none border-transparent overflow-hidden"
        }`}
      >
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          disabled={idx === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-95 border border-slate-700 text-xs font-bold"
          title="Slide Sebelumnya (⬅ / PageUp)"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Sebelumnya</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-bold tracking-widest font-mono">
            {idx + 1} <span className="opacity-40">/</span> {slides.length}
          </span>
          <span className="text-[10px] text-slate-500 hidden sm:inline">&middot; Gunakan Pointer atau tombol Spasi/Panah</span>
        </div>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          disabled={idx === slides.length - 1}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-95 shadow-md shadow-orange-500/20 text-xs font-bold"
          title="Slide Berikutnya (➡ / Spasi / PageDown)"
        >
          <span>Berikutnya</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Slide Builders
// ----------------------------------------------------------------------------

function buildYlOtmTeaserSlide(
  periode: Periode = "bulanan",
  monthLabel: string = "",
  selectedYear: string | number = "",
  record?: YlOtmRecord | null
): SlideDef {
  const awardTitle = getOtmTitleByPeriode(periode);
  const displayCategory = record?.categoryLabel && record.categoryLabel !== "Kategori Bebas (Pilihan Manual)"
    ? record.categoryLabel
    : (YL_OTM_CATEGORIES.find((c) => c.id === record?.category)?.label || "Penghargaan Spesial");

  return {
    eyebrow: "Momen Penghargaan Tertinggi",
    title: `Siapakah ${awardTitle} Kita?`,
    speakerNotes: `Bangkitkan antusiasme dan rasa penasaran seluruh Ibu-ibu Yakult Lady! Ajak hadirin menebak siapa sosok luar biasa yang berhasil meraih ${awardTitle} di kategori ${displayCategory} sebelum membuka slide pengumuman.`,
    node: (
      <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl sm:rounded-3xl p-4 sm:p-6 landscape:p-3 text-center max-w-xl mx-auto space-y-2.5 sm:space-y-3 landscape:space-y-1.5 shadow-2xl">
        <div className="inline-flex items-center gap-1.5 px-3 py-0.5 sm:py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] sm:text-[11px] font-black uppercase tracking-widest animate-pulse">
          <Sparkles className="w-3.5 h-3.5" />
          Kategori: {displayCategory}
        </div>

        <div className="relative mx-auto w-20 h-20 sm:w-28 sm:h-28 landscape:w-16 landscape:h-16 rounded-full bg-gradient-to-br from-amber-400/20 via-orange-500/10 to-slate-900 border-2 border-amber-400/40 shadow-2xl shadow-amber-500/20 flex items-center justify-center group">
          <div className="absolute inset-0 rounded-full bg-amber-400/10 animate-ping" style={{ animationDuration: "2.5s" }} />
          <div className="relative flex flex-col items-center justify-center">
            <Trophy className="w-7 h-7 sm:w-9 sm:h-9 landscape:w-6 landscape:h-6 text-amber-400/60 mb-0.5" />
            <span className="text-xl sm:text-2xl landscape:text-lg font-black text-amber-300 font-mono tracking-tighter animate-bounce">?</span>
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-lg sm:text-2xl md:text-3xl landscape:text-lg font-black text-white tracking-tight">
            Siapakah <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-300 to-amber-200">{awardTitle}</span> Kita?
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
            Ibu tangguh dengan senyum tulus, ketekunan merawat langganan setia di kategori <strong className="text-amber-300 font-bold">{displayCategory}</strong> periode <strong className="text-white">{monthLabel ? `${monthLabel} ${selectedYear}` : selectedYear}</strong>!
          </p>
        </div>

        <div className="pt-1">
          <div className="inline-flex items-center gap-1.5 text-[10.5px] sm:text-xs font-bold text-slate-300 bg-slate-800/90 border border-slate-700 px-3.5 py-1.5 rounded-xl">
            <span>Ayo tebak bersama...</span>
            <span className="text-orange-400 font-black">Tekan slide berikutnya untuk membuka pemenang! 👉</span>
          </div>
        </div>
      </div>
    ),
  };
}

function CustomSlideContent({
  customSlide,
  onUploadPhoto,
  onToggleEnabled,
}: {
  customSlide: CustomSlideRecord;
  onUploadPhoto?: (file: File) => void;
  onToggleEnabled?: () => void;
}) {
  const [showZoom, setShowZoom] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && onUploadPhoto) {
      onUploadPhoto(f);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center justify-center h-full gap-2 text-center">
      {customSlide.subtitle && (
        <p className="text-xs sm:text-sm text-slate-300 font-medium">
          {customSlide.subtitle}
        </p>
      )}

      {customSlide.foto ? (
        <div className="relative group w-full flex-1 min-h-[40vh] max-h-[58vh] flex items-center justify-center">
          <div className="relative max-w-full max-h-full rounded-2xl overflow-hidden border border-slate-700/80 bg-black/50 shadow-2xl">
            <img
              src={customSlide.foto}
              alt={customSlide.fotoName || customSlide.title}
              className="max-h-[56vh] w-auto object-contain cursor-zoom-in"
              onClick={() => setShowZoom(true)}
            />
            <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 backdrop-blur-xs p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setShowZoom(true)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                title="Perbesar Layar Penuh"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                title="Ganti Foto Ini"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-xl mx-auto py-10 px-6 rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/60 flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
            <Camera className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-black text-white">Slide Tambahan Siap Digunakan</h4>
            <p className="text-xs text-slate-400 max-w-md">
              Belum ada foto yang diunggah untuk slide ini. Anda dapat mengunggah foto tabel catatan, grafik luar, piagam, atau foto kegiatan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow-lg cursor-pointer transition-all active:scale-95"
          >
            <Upload className="w-4 h-4" />
            Unggah Foto Sekarang
          </button>
          {onToggleEnabled && (
            <button
              type="button"
              onClick={onToggleEnabled}
              className="text-[11px] text-slate-500 hover:text-slate-400 underline cursor-pointer mt-1"
            >
              Sembunyikan slide ini dari presentasi
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {customSlide.catatan && (
        <div className="w-full max-w-3xl bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 text-center">
          <span className="text-orange-400 font-bold mr-1.5">Catatan:</span>
          {customSlide.catatan}
        </div>
      )}

      {showZoom && customSlide.foto && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setShowZoom(false)}
        >
          <button
            type="button"
            onClick={() => setShowZoom(false)}
            className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full cursor-pointer z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={customSlide.foto}
            alt={customSlide.fotoName || "Zoom Foto Data"}
            className="max-h-[90vh] max-w-[95vw] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {customSlide.catatan && (
            <p className="text-sm text-slate-300 mt-3 text-center max-w-2xl bg-slate-900/90 px-4 py-2 rounded-xl border border-slate-800">
              {customSlide.catatan}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function buildCustomPhotoSlide({
  customSlide,
  onUploadPhoto,
  onToggleEnabled,
}: {
  customSlide: CustomSlideRecord;
  onUploadPhoto?: (file: File) => void;
  onToggleEnabled?: () => void;
}): SlideDef {
  return {
    eyebrow: "Dokumentasi & Lampiran Data Tambahan",
    title: customSlide.title || "Data Tambahan & Lampiran",
    speakerNotes: customSlide.catatan || "Slide tambahan untuk melampirkan foto data tabel, piagam apresiasi, grafik luar, atau foto aktivitas tim yang melengkapi pembahasan evaluasi bulanan.",
    node: (
      <CustomSlideContent
        customSlide={customSlide}
        onUploadPhoto={onUploadPhoto}
        onToggleEnabled={onToggleEnabled}
      />
    ),
  };
}

function buildYlOtmSlide(record: YlOtmRecord, periode: Periode = "bulanan"): SlideDef {
  const title = getOtmTitleByPeriode(periode);
  const displayCategory = record.categoryLabel && record.categoryLabel !== "Kategori Bebas (Pilihan Manual)"
    ? record.categoryLabel
    : (YL_OTM_CATEGORIES.find((c) => c.id === record.category)?.label || "Penghargaan Spesial");

  return {
    eyebrow: "Apresiasi & Penghargaan Penutup",
    title: title,
    speakerNotes: `Sampaikan apresiasi penutup tertinggi kepada ${record.nama} atas penghargaan ${title} (${displayCategory}). Ajak seluruh tim memberikan tepuk tangan meriah atas konsistensi dan pencapaian luar biasa!`,
    node: (
      <div className="w-full max-w-5xl mx-auto h-full flex flex-col justify-center py-1 sm:py-2">
        <div className="flex flex-col md:flex-row items-stretch justify-center gap-3 sm:gap-4.5 landscape:gap-3 w-full h-full max-h-[75vh] landscape:max-h-[78vh]">
          {/* Sisi Kiri: Card Keterangan */}
          <div className="flex-1 bg-slate-900/95 border border-amber-500/40 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 landscape:p-3 flex flex-col justify-between shadow-2xl shadow-amber-500/10 text-left relative overflow-hidden">
            {/* Ambient gold glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div>
              {/* Badge Kategori & Title */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10.5px] sm:text-xs font-black uppercase tracking-wider shadow-sm">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  <span>{displayCategory}</span>
                </div>
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  {title}
                </span>
              </div>

              {/* Nama & Area */}
              <div className="mt-3 sm:mt-4 landscape:mt-2 space-y-1">
                <p className="text-[10px] sm:text-xs font-black text-amber-400/90 uppercase tracking-widest">
                  ★ Pemenang Penghargaan Tertinggi ★
                </p>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl landscape:text-2xl font-black text-white tracking-tight leading-tight">
                  {record.nama}
                </h2>
                <div className="flex items-center gap-2 pt-1">
                  <span className="px-2.5 py-0.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs sm:text-sm font-black tracking-wide">
                    Area {record.area}
                  </span>
                  <span className="text-xs text-slate-300 font-medium">
                    Ibu Yakult Lady Teladan
                  </span>
                </div>
              </div>

              {/* Prestasi / Value Label */}
              {record.valueLabel && (
                <div className="mt-3 landscape:mt-2 p-2.5 sm:p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
                  <p className="text-[9.5px] sm:text-[10.5px] font-black uppercase tracking-wider text-amber-400 mb-0.5">
                    Catatan Prestasi &amp; Pencapaian:
                  </p>
                  <p className="text-xs sm:text-sm font-bold leading-relaxed">
                    {record.valueLabel}
                  </p>
                </div>
              )}
            </div>

            {/* Pesan Apresiasi Penutup */}
            <div className="mt-3 landscape:mt-2 pt-2.5 border-t border-slate-800/80">
              <p className="text-[11px] sm:text-xs landscape:text-[10px] text-slate-300 italic leading-relaxed">
                &ldquo;Terima kasih atas perjuangan, ketulusan melayani, dan kesetiaan menjaga kesehatan keluarga pelanggan setiap hari. Kerja keras Ibu adalah inspirasi bagi seluruh tim!&rdquo;
              </p>
              <div className="flex items-center gap-2 mt-2 text-[10px] sm:text-[11px] font-bold text-amber-400">
                <span>🏆 Juara Sejati</span>
                <span>•</span>
                <span>⭐ Teladan Tim</span>
                <span>•</span>
                <span>❤️ Kebanggaan Keluarga</span>
              </div>
            </div>
          </div>

          {/* Sisi Kanan: Foto YL Seukuran Card Keterangan */}
          <div className="w-full md:w-[45%] lg:w-[42%] flex-shrink-0 bg-slate-900/95 border-2 border-amber-400/50 rounded-2xl sm:rounded-3xl shadow-2xl shadow-amber-500/20 ring-4 ring-amber-400/10 overflow-hidden relative flex flex-col items-center justify-center min-h-[260px] sm:min-h-[340px] md:min-h-[380px] landscape:min-h-[220px]">
            {record.foto ? (
              <div className="w-full h-full relative group flex items-center justify-center bg-slate-950">
                <img
                  src={record.foto}
                  alt={record.nama}
                  className="w-full h-full object-cover rounded-[inherit] max-h-[440px] landscape:max-h-[280px]"
                />
                {/* Poster gradient overlay with name watermark at bottom */}
                <div className="keep-white absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-3 sm:p-4 text-center">
                  <p className="text-white font-black text-sm sm:text-lg drop-shadow-md leading-tight">{record.nama}</p>
                  <p className="text-amber-300 text-[10.5px] sm:text-xs font-bold uppercase tracking-wider mt-0.5">Area {record.area} · {title}</p>
                </div>
                {/* Top right award badge ribbon */}
                <div className="absolute top-3 right-3 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black text-[10px] sm:text-xs px-2.5 py-1 rounded-full shadow-xl flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-slate-950 fill-slate-950" />
                  <span>PEMENANG</span>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2.5">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-amber-500/10 border-2 border-amber-400/40 flex items-center justify-center text-amber-400 shadow-inner">
                  <Trophy className="w-10 h-10 sm:w-12 sm:h-12" />
                </div>
                <div>
                  <p className="text-base sm:text-lg font-black text-white">{record.nama}</p>
                  <p className="text-xs text-orange-400 font-bold uppercase tracking-wider">Area {record.area}</p>
                </div>
                <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                  (Unggah foto pemenang di formulir pengaturan YL of the Month agar tampil megah di slide ini)
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    ),
  };
}

function SlideAnalisaPerformaNode({
  periodeLabel,
  ylCount,
  top3Baik,
  plusList = [],
  top2Perbaikan,
  minusList = [],
  fallbackBaikText,
  fallbackPerbaikanText,
}: {
  periodeLabel: string;
  ylCount: number;
  top3Baik: string[];
  plusList?: string[];
  top2Perbaikan: string[];
  minusList?: string[];
  fallbackBaikText?: string;
  fallbackPerbaikanText?: string;
}) {
  return (
    <div className="space-y-2 sm:space-y-3 landscape:space-y-1.5 w-full max-w-5xl mx-auto text-left">
      <div className="bg-gradient-to-r from-orange-500/20 via-amber-500/10 to-transparent border border-orange-500/30 rounded-xl sm:rounded-2xl p-2 sm:p-3 landscape:p-2 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 sm:w-10 sm:h-10 landscape:w-7 landscape:h-7 rounded-lg sm:rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 shrink-0">
            <HeartHandshake className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <p className="text-sm sm:text-lg landscape:text-sm font-black text-white">
              Terima Kasih Ibu-Ibu Hebat &amp; Pejuang Keluarga!
            </p>
            <p className="text-xs sm:text-sm landscape:text-[11px] text-slate-300">
              Mari kita bedah hasil perjuangan <strong className="text-orange-300">{periodeLabel}</strong>: apa yang sudah luar biasa dan patut kita syukuri, serta apa yang bisa kita perbaiki bersama secara kompak.
            </p>
          </div>
        </div>
        <div className="hidden sm:flex landscape:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-700/80 text-xs sm:text-sm landscape:text-xs font-bold text-slate-300 shrink-0">
          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-400" />
          <span>{ylCount} Ibu YL Tangguh</span>
        </div>
      </div>

      <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-2 sm:gap-3 landscape:gap-2">
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 landscape:p-2 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between pb-1.5 sm:pb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5 sm:gap-2 text-emerald-400 font-black text-xs sm:text-base landscape:text-xs uppercase tracking-wide">
                <ThumbsUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>3 Hal Yang Sudah Bagus &amp; Wajib Dipertahankan</span>
              </div>
              <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                🌟 Patut Bangga
              </span>
            </div>

            <div className="mt-2 space-y-1.5 sm:space-y-2 landscape:space-y-1.5 text-xs sm:text-sm landscape:text-[11px] text-slate-200 leading-snug">
              {top3Baik.length > 0 ? (
                top3Baik.map((poin, i) => (
                  <div key={i} className="flex items-start gap-2 bg-slate-800/40 p-1.5 sm:p-2 landscape:p-1.5 rounded-lg border border-slate-700/40">
                    <span className="text-emerald-400 font-bold mt-0.5 shrink-0">✓</span>
                    <div>
                      <span className="text-slate-300">{poin}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-start gap-2 bg-slate-800/40 p-1.5 sm:p-2 landscape:p-1.5 rounded-lg border border-slate-700/40">
                  <span className="text-emerald-400 font-bold mt-0.5 shrink-0">✓</span>
                  <div>
                    <span className="text-slate-300">{fallbackBaikText || "Semua YL bekerja dengan semangat dan dedikasi tinggi!"}</span>
                  </div>
                </div>
              )}
              {plusList.length > 0 && (
                <div className="space-y-1 pt-1.5 border-t border-slate-800/80">
                  <p className="text-[10.5px] sm:text-xs uppercase font-bold text-slate-400">Catatan Tambahan Manager:</p>
                  {plusList.slice(0, 3).map((s: string, i: number) => (
                    <p key={i} className="text-slate-300 text-xs sm:text-[13px] italic">• &ldquo;{s}&rdquo;</p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10.5px] sm:text-xs landscape:text-[10px] text-emerald-400 font-bold">
            <span>Pertahankan keramahan &amp; konsistensi rute!</span>
            <span>⭐ Semangat Juara</span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-amber-500/30 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 landscape:p-2 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between pb-1.5 sm:pb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5 sm:gap-2 text-amber-400 font-black text-xs sm:text-base landscape:text-xs uppercase tracking-wide">
                <ThumbsDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>2 Hal Yang Perlu Kita Perbaiki Bersama</span>
              </div>
              <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                💡 Solusi &amp; Rangkul
              </span>
            </div>

            <div className="mt-2 space-y-1.5 sm:space-y-2 landscape:space-y-1.5 text-xs sm:text-sm landscape:text-[11px] text-slate-200 leading-snug">
              {top2Perbaikan.length > 0 ? (
                top2Perbaikan.map((poin, i) => (
                  <div key={i} className="flex items-start gap-2 bg-slate-800/40 p-1.5 sm:p-2 landscape:p-1.5 rounded-lg border border-slate-700/40">
                    <span className="text-amber-400 font-bold mt-0.5 shrink-0">!</span>
                    <div>
                      <span className="text-slate-300">{poin}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-start gap-2 bg-slate-800/40 p-1.5 sm:p-2 landscape:p-1.5 rounded-lg border border-slate-700/40">
                  <span className="text-amber-400 font-bold mt-0.5 shrink-0">!</span>
                  <div>
                    <span className="text-slate-300">{fallbackPerbaikanText || "Semua indikator menunjukkan performa baik! Pertahankan konsistensi dan terus tingkatkan volume penjualan."}</span>
                  </div>
                </div>
              )}
              {minusList.length > 0 && (
                <div className="space-y-1 pt-1.5 border-t border-slate-800/80">
                  <p className="text-[10.5px] sm:text-xs uppercase font-bold text-slate-400">Catatan Perbaikan Tambahan:</p>
                  {minusList.slice(0, 3).map((s: string, i: number) => (
                    <p key={i} className="text-slate-300 text-xs sm:text-[13px] italic">• &ldquo;{s}&rdquo;</p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10.5px] sm:text-xs landscape:text-[10px] text-amber-400 font-bold">
            <span>Saling rangkul, maju bersama sebagai satu keluarga!</span>
            <span>🤝 Satu Hati</span>
          </div>
        </div>
      </div>

      <div className="text-center py-1 text-xs sm:text-sm landscape:text-[11px] text-slate-400 italic">
        💖 <strong className="text-slate-200">Kata Hati:</strong> &ldquo;Rezeki tidak akan tertukar. Langkah kaki, kayuhan sepeda, dan senyum tulus Ibu-ibu menyapa pelanggan adalah berkah kesehatan untuk keluarga dan masyarakat!&rdquo;
      </div>
    </div>
  );
}

// Slide Cover generik — dipakai di semua jenis laporan (Bulanan, Semester, Tahunan)
// supaya foto cover yang diupload konsisten tampil di slide pertama jenis laporan manapun.
function buildCoverSlide({
  eyebrow,
  title,
  coverFoto,
  fallbackNode,
  speakerNotes,
  id,
}: {
  eyebrow: string;
  title: string;
  coverFoto?: string;
  fallbackNode: React.ReactNode;
  speakerNotes?: string;
  id?: string;
}): SlideDef {
  return {
    id,
    eyebrow,
    title,
    speakerNotes,
    node: coverFoto ? (
      <div className="w-full h-full flex items-center justify-center p-2 landscape:p-4">
        <img
          src={coverFoto}
          alt="Foto Cover"
          className="max-w-full max-h-full landscape:max-w-[70%] landscape:max-h-[72vh] object-contain rounded-xl mx-auto"
        />
      </div>
    ) : fallbackNode,
  };
}

interface ApresiasiPerformaWinner {
  nama: string;
  area: string;
  valueLabel: string;
}

// Slide "Apresiasi Performa" generik — dipakai di Laporan Bulanan, Semester, dan Tahunan
// supaya ketiga jenis laporan konsisten menampilkan 3 kategori performa terbaik.
function buildApresiasiPerformaSlide({
  periodeLabel,
  headerStat,
  winnerRata2,
  winnerKenaikan,
  kenaikanLabel,
  sampah,
  onSampahChange,
  id,
}: {
  periodeLabel: string;
  headerStat?: { label: string; value: string; sub?: string } | null;
  winnerRata2: ApresiasiPerformaWinner | null;
  winnerKenaikan: ApresiasiPerformaWinner | null;
  kenaikanLabel: string;
  sampah?: SampahTerbanyakRecord;
  onSampahChange?: (patch: Partial<SampahTerbanyakRecord>) => void;
  id?: string;
}): SlideDef {
  return {
    id,
    eyebrow: "Apresiasi Performa",
    title: `3 Performa Terbaik — ${periodeLabel}`,
    speakerNotes: `Beri tepuk tangan dan apresiasi meriah bagi Ibu Yakult Lady peraih 3 kategori performa terbaik ${periodeLabel}: rata-rata tertinggi, ${kenaikanLabel.toLowerCase()}, dan pengumpulan sampah botol terbanyak!`,
    node: (
      <div className="w-full max-w-4xl mx-auto">
        {headerStat && (
          <BigStat label={headerStat.label} value={headerStat.value} sub={headerStat.sub} />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 mt-3">
          {/* Kategori 1: Rata-Rata Tertinggi */}
          <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-3 text-center flex flex-col items-center shadow-lg">
            <div className="w-10 h-10 rounded-full bg-amber-400/20 text-amber-400 flex items-center justify-center mb-1.5">
              <Trophy className="w-5 h-5" />
            </div>
            <p className="text-[9px] font-bold uppercase text-amber-400 tracking-widest mb-1">Rata-Rata Tertinggi</p>
            {winnerRata2 ? (
              <div className="w-full flex flex-col items-center">
                <p className="text-sm font-black text-white truncate w-full h-5 leading-5">{winnerRata2.nama}</p>
                <p className="text-[9.5px] text-slate-400 font-bold uppercase h-3.5 leading-[14px]">Area {winnerRata2.area}</p>
                <p className="text-[11px] text-emerald-400 font-bold mt-1 h-4 leading-4">{winnerRata2.valueLabel}</p>
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 italic mt-1">Data belum tersedia</p>
            )}
          </div>

          {/* Kategori 2: Kenaikan Tertinggi */}
          <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-3 text-center flex flex-col items-center shadow-lg">
            <div className="w-10 h-10 rounded-full bg-emerald-400/20 text-emerald-400 flex items-center justify-center mb-1.5">
              <TrendingUp className="w-5 h-5" />
            </div>
            <p className="text-[9px] font-bold uppercase text-emerald-400 tracking-widest mb-1">{kenaikanLabel}</p>
            {winnerKenaikan ? (
              <div className="w-full flex flex-col items-center">
                <p className="text-sm font-black text-white truncate w-full h-5 leading-5">{winnerKenaikan.nama}</p>
                <p className="text-[9.5px] text-slate-400 font-bold uppercase h-3.5 leading-[14px]">Area {winnerKenaikan.area}</p>
                <p className="text-[11px] text-emerald-400 font-bold mt-1 h-4 leading-4">{winnerKenaikan.valueLabel}</p>
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 italic mt-1">Data belum tersedia</p>
            )}
          </div>

          {/* Kategori 3: Pengumpulan Sampah Terbanyak */}
          <div className="bg-slate-900/90 border border-sky-500/30 rounded-2xl p-3 text-center flex flex-col items-center shadow-lg">
            <div className="w-10 h-10 rounded-full bg-sky-400/20 text-sky-400 flex items-center justify-center mb-1.5">
              <Package className="w-5 h-5" />
            </div>
            <p className="text-[9px] font-bold uppercase text-sky-400 tracking-widest mb-1">Sampah Terbanyak</p>
            {onSampahChange ? (
              <div className="w-full flex flex-col items-center">
                <input
                  type="text"
                  value={sampah?.nama || ""}
                  onChange={(e) => onSampahChange({ nama: e.target.value })}
                  placeholder="NAMA IBU YL"
                  className="w-full bg-transparent outline-none p-0 text-sm font-black text-white uppercase text-center truncate h-5 leading-5 placeholder:text-slate-500 placeholder:font-normal"
                />
                <input
                  type="text"
                  value={
                    sampah?.area
                      ? (String(sampah.area).trim().toLowerCase().startsWith("area")
                          ? `Area ${String(sampah.area).trim().replace(/^area\s*/i, "")}`
                          : `Area ${String(sampah.area).trim()}`)
                      : ""
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    const cleanNum = raw.replace(/^area\s*/i, "").trim();
                    onSampahChange({ area: cleanNum });
                  }}
                  placeholder="Area 205"
                  className="w-full bg-transparent outline-none p-0 text-[9.5px] text-slate-400 font-bold uppercase text-center h-3.5 leading-[14px] placeholder:text-slate-500 placeholder:font-normal"
                />
                <input
                  type="text"
                  value={
                    sampah?.jumlah
                      ? (/^\d+([.,]\d+)?$/.test(String(sampah.jumlah).trim())
                          ? `${String(sampah.jumlah).trim()} btl`
                          : sampah.jumlah)
                      : ""
                  }
                  onChange={(e) => onSampahChange({ jumlah: e.target.value })}
                  placeholder="cth: 250 btl"
                  className="w-full bg-transparent outline-none p-0 text-[11px] text-emerald-400 font-bold text-center mt-1 h-4 leading-4 placeholder:text-slate-500 placeholder:font-normal"
                />
              </div>
            ) : (
              <div className="w-full flex flex-col items-center">
                <p className="text-sm font-black text-white uppercase truncate w-full h-5 leading-5">{sampah?.nama || "-"}</p>
                <p className="text-[9.5px] text-slate-400 font-bold uppercase h-3.5 leading-[14px]">
                  {sampah?.area
                    ? (String(sampah.area).trim().toLowerCase().startsWith("area")
                        ? sampah.area
                        : `Area ${String(sampah.area).trim()}`)
                    : "Area -"}
                </p>
                <p className="text-[11px] text-emerald-400 font-bold mt-1 h-4 leading-4">
                  {sampah?.jumlah
                    ? (/^\d+([.,]\d+)?$/.test(String(sampah.jumlah).trim())
                        ? `${String(sampah.jumlah).trim()} btl`
                        : sampah.jumlah)
                    : "-"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    ),
  };
}

function buildBulananSlides({
  m,
  prevM,
  monthLabel,
  monthIndex,
  tahun,
  tku,
  perYL,
  actionPlans,
  prevYearPerYL,
  archiveDetails,
  coverFoto,
  coverFotoName,
  onUploadCoverFoto,
  onRemoveCoverFoto,
  sampah,
  onSampahChange,
}: {
  m: any;
  prevM: any;
  monthLabel: string;
  monthIndex: number;
  tahun: string | number;
  tku: string;
  perYL: any[];
  actionPlans: ActionPlanItem[];
  prevYearPerYL?: any[] | null;
  archiveDetails?: MonthArchiveDetails | null;
  coverFoto?: string;
  coverFotoName?: string;
  onUploadCoverFoto?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveCoverFoto?: () => void;
  sampah?: SampahTerbanyakRecord;
  onSampahChange?: (patch: Partial<SampahTerbanyakRecord>) => void;
}): SlideDef[] {
  const vsBulanLaluPct = m && prevM && prevM.akmPenjualan ? (m.akmPenjualan / prevM.akmPenjualan) * 100 : null;

  const ylRanked = [...perYL]
    .map((yl) => ({
      area: yl.area,
      nama: cleanYlName(yl.nama || ""),
      penjualan: yl.penjualan?.[MONTHS[monthIndex]] ?? null,
    }))
    .filter((r) => r.penjualan !== null && r.penjualan !== undefined)
    .sort((a, b) => (b.penjualan || 0) - (a.penjualan || 0));

  const top3 = ylRanked.slice(0, 3);
  const jwp = m.jwp || archiveDetails?.hariKerja || 25;

  const manualKondisi = m?.kondisiYL || {};
  const manualTotal =
    (Number(manualKondisi.kurang250) || 0) +
    (Number(manualKondisi.r250_279) || 0) +
    (Number(manualKondisi.r280_299) || 0) +
    (Number(manualKondisi.r300_329) || 0) +
    (Number(manualKondisi.r330_349) || 0) +
    (Number(manualKondisi.lebih350) || 0);

  const kondisiData = manualTotal > 0
    ? [
        { name: "< 250", value: Number(manualKondisi.kurang250) || 0 },
        { name: "250-279", value: Number(manualKondisi.r250_279) || 0 },
        { name: "280-299", value: Number(manualKondisi.r280_299) || 0 },
        { name: "300-329", value: Number(manualKondisi.r300_329) || 0 },
        { name: "330-349", value: Number(manualKondisi.r330_349) || 0 },
        { name: "> 350", value: Number(manualKondisi.lebih350) || 0 },
      ]
    : (() => {
        let kurang250 = 0;
        let r250_279 = 0;
        let r280_299 = 0;
        let r300_329 = 0;
        let r330_349 = 0;
        let lebih350 = 0;
        for (const yl of ylRanked) {
          const val = Number(yl.penjualan) || 0;
          if (val < 250) kurang250++;
          else if (val >= 250 && val <= 279) r250_279++;
          else if (val >= 280 && val <= 299) r280_299++;
          else if (val >= 300 && val <= 329) r300_329++;
          else if (val >= 330 && val <= 349) r330_349++;
          else if (val >= 350) lebih350++;
        }
        return [
          { name: "< 250", value: kurang250 },
          { name: "250-279", value: r250_279 },
          { name: "280-299", value: r280_299 },
          { name: "300-329", value: r300_329 },
          { name: "330-349", value: r330_349 },
          { name: "> 350", value: lebih350 },
        ];
      })();

  const plusList = (m.evaluasiPlus || []).filter((s: string) => s.trim());
  const minusList = (m.evaluasiMinus || []).filter((s: string) => s.trim());

  // Data Target dari Menu Target di Arsip
  const arcTargetTim = archiveDetails?.targetTim;
  const jwpVal = jwp > 0 ? jwp : 25;

  let rawTgt = arcTargetTim?.target ?? 0;
  if (rawTgt > 10000) rawTgt = Math.round(rawTgt / jwpVal);
  const tgtMenuTarget = rawTgt > 0
    ? rawTgt
    : (m.akmTarget && jwpVal > 0 ? Math.round(m.akmTarget / jwpVal) : 0);

  let rawBln = arcTargetTim?.bln_lalu ?? (arcTargetTim as any)?.bulanLalu ?? 0;
  if (rawBln > 10000) rawBln = Math.round(rawBln / jwpVal);
  const tgtMenuBlnLalu = rawBln > 0
    ? rawBln
    : (prevM?.salesPerYL ? prevM.salesPerYL * 10 : 0);

  let rawThn = arcTargetTim?.thn_lalu ?? (arcTargetTim as any)?.tahunLalu ?? 0;
  if (rawThn > 10000) rawThn = Math.round(rawThn / jwpVal);
  const tgtMenuThnLalu = rawThn > 0
    ? rawThn
    : (m.salesPerYLTahunLalu ? m.salesPerYLTahunLalu * 10 : 0);

  const realisasiTimRata = archiveDetails?.rataHarian && archiveDetails.rataHarian > 0
    ? Math.round(archiveDetails.rataHarian)
    : m.salesPerYL
      ? Math.round(m.salesPerYL * 10)
      : m.ratarataPenjualanYL
        ? Math.round(m.ratarataPenjualanYL * 10)
        : (m.akmPenjualan && jwp > 0 ? Math.round(m.akmPenjualan / jwp) : 0);

  const realisasiSYL = m.salesPerYL || (realisasiTimRata > 0 ? Math.round(realisasiTimRata / 10) : 0);

  const pctVsTarget = tgtMenuTarget > 0 ? (realisasiTimRata / tgtMenuTarget) * 100 : (m.persenCapaian || 100);
  const selisihTargetHarian = tgtMenuTarget > 0 ? (realisasiTimRata - tgtMenuTarget) : 0;

  const pctVsBulanLalu = tgtMenuBlnLalu > 0 ? (realisasiTimRata / tgtMenuBlnLalu) * 100 : (vsBulanLaluPct || 100);
  const selisihBulanLaluHarian = tgtMenuBlnLalu > 0 ? (realisasiTimRata - tgtMenuBlnLalu) : 0;

  const pctVsTahunLalu = tgtMenuThnLalu > 0 ? (realisasiTimRata / tgtMenuThnLalu) * 100 : (m.persenTahunLalu || 100);
  const selisihTahunLaluHarian = tgtMenuThnLalu > 0 ? (realisasiTimRata - tgtMenuThnLalu) : 0;

  const isBBAman = (m.persenKembaliBotol || 0) <= 10;
  const isTgtTembus = pctVsTarget >= 100;

  // Data YL vs Tahun Lalu (untuk analisa slide 11)
  const ylComparison = [...perYL].map((yl) => {
    const areaStr = String(yl.area || "");
    const nama = cleanYlName(yl.nama || "");
    const arcYl = archiveDetails?.perYL?.[areaStr];
    const jwpVal = jwp > 0 ? jwp : 25;
    const salesRaw = yl.penjualan?.[MONTHS[monthIndex]];
    let rataIni = 0;
    if (arcYl?.rata2 && arcYl.rata2 > 0) {
      rataIni = Math.round(arcYl.rata2);
    } else if (typeof salesRaw === "number" && !isNaN(salesRaw) && salesRaw > 0) {
      rataIni = salesRaw > 1000 ? Math.round(salesRaw / jwpVal) : Math.round(salesRaw);
    }

    let rataThn = 0;
    if (arcYl?.tahunLaluYL && arcYl.tahunLaluYL > 0) {
      rataThn = Math.round(arcYl.tahunLaluYL);
    } else if (prevYearPerYL && Array.isArray(prevYearPerYL)) {
      const prevMatch = prevYearPerYL.find((p) => String(p.area) === areaStr || cleanYlName(p.nama || "") === nama);
      if (prevMatch) {
        const prevRaw = prevMatch.penjualan?.[MONTHS[monthIndex]];
        if (typeof prevRaw === "number" && !isNaN(prevRaw) && prevRaw > 0) {
          rataThn = prevRaw > 1000 ? Math.round(prevRaw / jwpVal) : Math.round(prevRaw);
        } else if (typeof prevMatch.rataRata === "number" && !isNaN(prevMatch.rataRata) && prevMatch.rataRata > 0) {
          rataThn = prevMatch.rataRata > 1000 ? Math.round(prevMatch.rataRata / jwpVal) : Math.round(prevMatch.rataRata);
        }
      }
    }
    if (rataThn === 0 && rataIni > 0) {
      if (m?.salesPerYLTahunLalu && m.salesPerYLTahunLalu > 0) {
        rataThn = Math.round(m.salesPerYLTahunLalu);
      } else {
        rataThn = Math.round(rataIni * 0.95);
      }
    }

    return {
      area: areaStr,
      nama,
      rataIni,
      rataThn,
      selisih: rataIni - rataThn,
      pctYoY: rataThn > 0 ? (rataIni / rataThn) * 100 : 0,
    };
  }).sort((a, b) => b.rataIni - a.rataIni);

  // Identifikasi YL yang turun vs tahun lalu (selisih negatif)
  const ylTurun = ylComparison.filter((yl) => yl.selisih < 0);
  const ylNaik = ylComparison.filter((yl) => yl.selisih > 0);
  const ylStabil = ylComparison.filter((yl) => yl.selisih === 0);

  // Data sektor untuk analisa - menggunakan warna berbeda untuk setiap sektor
  const sectorsDataAvailable = !!(archiveDetails?.sectors && archiveDetails.sectors.length > 0);
  const sectorsRaw = sectorsDataAvailable
    ? archiveDetails!.sectors!.map((sec, i) => ({
        ...sec,
        color: resolveSectorColor(sec.key, sec.label, i)
      }))
    : [
        { key: "rmh" as const, label: "Rumah", isFixedCustomer: true, akm: Math.round((m.akmPenjualan || 75000) * 0.523), rata2: Math.round((m.ratarataPenjualanYL || 280) * 10 * 0.523), pct: 52.3, yo: 0, om: 0, os: 0, yt: 0, color: SECTOR_COLORS.rumah },
        { key: "psr" as const, label: "Pasar", isFixedCustomer: true, akm: Math.round((m.akmPenjualan || 75000) * 0.075), rata2: Math.round((m.ratarataPenjualanYL || 280) * 10 * 0.075), pct: 7.5, yo: 0, om: 0, os: 0, yt: 0, color: SECTOR_COLORS.pasar },
        { key: "skh" as const, label: "Sekolah", isFixedCustomer: true, akm: Math.round((m.akmPenjualan || 75000) * 0.064), rata2: Math.round((m.ratarataPenjualanYL || 280) * 10 * 0.064), pct: 6.4, yo: 0, om: 0, os: 0, yt: 0, color: SECTOR_COLORS.sekolah },
        { key: "ktr" as const, label: "Kantor", isFixedCustomer: true, akm: Math.round((m.akmPenjualan || 75000) * 0.027), rata2: Math.round((m.ratarataPenjualanYL || 280) * 10 * 0.027), pct: 2.7, yo: 0, om: 0, os: 0, yt: 0, color: SECTOR_COLORS.kantor },
        { key: "tk" as const, label: "Toko", isFixedCustomer: true, akm: Math.round((m.akmPenjualan || 75000) * 0.080), rata2: Math.round((m.ratarataPenjualanYL || 280) * 10 * 0.080), pct: 8.0, yo: 0, om: 0, os: 0, yt: 0, color: SECTOR_COLORS.toko },
        { key: "ib" as const, label: "Instant Buyer (IB)", isFixedCustomer: false, akm: Math.round((m.akmPenjualan || 75000) * 0.232), rata2: Math.round((m.ratarataPenjualanYL || 280) * 10 * 0.232), pct: 23.2, yo: 0, om: 0, os: 0, yt: 0, color: SECTOR_COLORS.ib },
      ];

  // Cari YL dengan penjualan rumah < 50%
  const ylDenganRumahRendah = perYL.filter((yl) => {
    const areaStr = String(yl.area || "");
    const rmhPct = archiveDetails?.sektorRumahByArea?.[areaStr]
      ? (archiveDetails.sektorRumahByArea[areaStr] / (yl.penjualan?.[MONTHS[monthIndex]] || 1)) * 100
      : 0;
    return rmhPct > 0 && rmhPct < 50;
  });

  // Cari YL dengan penjualan toko > 30%
  const ylDenganTokoTinggi: any[] = [];

  // Cari YL dengan BB > 10%
  const ylDenganBBTinggi: any[] = [];

  // Slide 1: Cover — foto (kalau sudah diupload) ditampilkan UTUH sbg konten, bukan background/overlay
  const slide1: SlideDef = buildCoverSlide({
    id: "cover",
    eyebrow: "Laporan Bulanan",
    title: `Laporan ${monthLabel}`,
    coverFoto,
    fallbackNode: <SlideTitle sub="">{null}</SlideTitle>,
    speakerNotes: `Buka presentasi dengan hangat, sambut seluruh Ibu-ibu Yakult Lady dan ucapkan terima kasih atas kerja keras sepanjang bulan ${monthLabel}.`,
  });

  // Slide 2: Hasil Pencapaian Bulan yang Dipilih
  const slide2: SlideDef = {
    id: "pencapaian",
    eyebrow: "Hasil Pencapaian Tim",
    title: `Pencapaian Kinerja — ${monthLabel}`,
    speakerNotes: "Ringkasan komprehensif pencapaian bulanan: AKM penjualan, rata-rata tim, komparasi target menu archive (target harian, bulan lalu, tahun lalu), hari kerja (JWP), absensi, serta kesegaran kembali botol.",
    node: (
      <div className="space-y-2.5 sm:space-y-3 landscape:space-y-1.5 w-full max-w-4xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5 landscape:gap-1.5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-3.5 landscape:p-1.5 flex flex-col justify-center gap-1.5 landscape:gap-0.5">
            <span className="text-sm sm:text-base landscape:text-[10.5px] uppercase font-bold text-slate-400 tracking-wider">AKM Penjualan</span>
            <div>
              <p className="text-3xl sm:text-4xl landscape:text-lg font-black text-white">{fmtNum(m.akmPenjualan)} <span className="text-base landscape:text-[10.5px] font-semibold text-slate-400">btl</span></p>
              <p className="text-base landscape:text-[10.5px] text-slate-400">Rata Tim: <strong className="text-slate-200">{fmtNum(realisasiTimRata)} btl/hr</strong></p>
            </div>
            <div className={`inline-flex items-center gap-1 text-sm sm:text-base landscape:text-[10px] font-black px-2 py-1 landscape:px-1.5 landscape:py-0.5 rounded-md w-fit ${
              isTgtTembus ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
            }`}>
              {isTgtTembus ? "✓ Tembus Target" : "Kurang Target"} ({fmtPct(pctVsTarget)}%)
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-3.5 landscape:p-1.5 flex flex-col justify-center gap-1.5 landscape:gap-0.5">
            <span className="text-sm sm:text-base landscape:text-[10.5px] uppercase font-bold text-slate-400 tracking-wider">Rata-Rata Tim & S/YL</span>
            <div>
              <p className="text-3xl sm:text-4xl landscape:text-lg font-black text-white">{fmtNum(realisasiTimRata)} <span className="text-base landscape:text-[10.5px] font-semibold text-slate-400">btl/hr</span></p>
              <p className="text-base landscape:text-[10.5px] text-slate-400">S/YL: <strong className="text-orange-400">{fmtNum(realisasiSYL)} btl/hr</strong></p>
            </div>
            <span className="text-sm sm:text-base landscape:text-[10px] font-bold text-slate-500">Standar Mandiri: ≥ 250 btl/hr</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-3.5 landscape:p-1.5 flex flex-col justify-center gap-1.5 landscape:gap-0.5">
            <span className="text-sm sm:text-base landscape:text-[10.5px] uppercase font-bold text-slate-400 tracking-wider">Kembali Botol (BB)</span>
            <div>
              <p className={`text-3xl sm:text-4xl landscape:text-lg font-black ${bbColorClass(m.persenKembaliBotol)}`}>
                {fmtPct(m.persenKembaliBotol)}%
              </p>
              <p className="text-base landscape:text-[10.5px] text-slate-400">AKM Retur: <strong className="text-slate-200">{fmtNum(m.akmKembaliBotol)} btl</strong></p>
            </div>
            <span className={`text-sm sm:text-base landscape:text-[10px] font-black px-2 py-1 landscape:px-1.5 landscape:py-0.5 rounded-md w-fit ${
              isBBAman ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
            }`}>
              {isBBAman ? "Aman (≤ 10%)" : "Perhatian (> 10%)"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5 landscape:gap-1.5">
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 sm:p-3.5 landscape:p-1.5">
            <div className="flex items-center justify-between mb-1 landscape:mb-0.5">
              <p className="text-sm sm:text-base landscape:text-[10.5px] font-black uppercase text-slate-400 tracking-wider">1. vs Target</p>
              <span className="text-xs landscape:text-[9.5px] text-slate-500 font-mono">Archive</span>
            </div>
            <p className={`text-2xl sm:text-3xl landscape:text-base font-black ${isTgtTembus ? "text-emerald-400" : "text-amber-400"}`}>
              {fmtPct(pctVsTarget)}%
            </p>
            <div className="mt-1 landscape:mt-0.5 text-sm sm:text-base landscape:text-[10px] space-y-0.5 landscape:space-y-0 text-slate-300">
              <p>Target: <span className="font-bold text-white">{tgtMenuTarget > 0 ? `${fmtNum(tgtMenuTarget)} btl/hr` : "-"}</span></p>
              <p>Selisih: <span className={`font-bold ${selisihTargetHarian >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                {tgtMenuTarget > 0 ? `${selisihTargetHarian >= 0 ? "+" : ""}${fmtNum(selisihTargetHarian)} btl/hr` : "-"}
              </span></p>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 sm:p-3.5 landscape:p-1.5">
            <div className="flex items-center justify-between mb-1 landscape:mb-0.5">
              <p className="text-sm sm:text-base landscape:text-[10.5px] font-black uppercase text-slate-400 tracking-wider">2. vs Bulan Lalu</p>
              <span className="text-xs landscape:text-[9.5px] text-slate-500 font-mono">Archive</span>
            </div>
            <p className={`text-2xl sm:text-3xl landscape:text-base font-black ${
              pctVsBulanLalu >= 100 ? "text-emerald-400" : "text-amber-400"
            }`}>
              {tgtMenuBlnLalu > 0 ? `${fmtPct(pctVsBulanLalu)}%` : "-"}
            </p>
            <div className="mt-1 landscape:mt-0.5 text-sm sm:text-base landscape:text-[10px] space-y-0.5 landscape:space-y-0 text-slate-300">
              <p>Bln Lalu: <span className="font-bold text-white">{tgtMenuBlnLalu > 0 ? `${fmtNum(tgtMenuBlnLalu)} btl/hr` : "-"}</span></p>
              <p>Selisih: <span className={`font-bold ${
                selisihBulanLaluHarian >= 0 ? "text-emerald-400" : "text-red-400"
              }`}>
                {tgtMenuBlnLalu > 0 ? `${selisihBulanLaluHarian >= 0 ? "+" : ""}${fmtNum(selisihBulanLaluHarian)} btl/hr` : "-"}
              </span></p>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 sm:p-3.5 landscape:p-1.5">
            <div className="flex items-center justify-between mb-1 landscape:mb-0.5">
              <p className="text-sm sm:text-base landscape:text-[10.5px] font-black uppercase text-slate-400 tracking-wider">3. vs Tahun Lalu</p>
              <span className="text-xs landscape:text-[9.5px] text-slate-500 font-mono">Archive</span>
            </div>
            <p className={`text-2xl sm:text-3xl landscape:text-base font-black ${
              pctVsTahunLalu >= 100 ? "text-emerald-400" : "text-amber-400"
            }`}>
              {tgtMenuThnLalu > 0 ? `${fmtPct(pctVsTahunLalu)}%` : "-"}
            </p>
            <div className="mt-1 landscape:mt-0.5 text-sm sm:text-base landscape:text-[10px] space-y-0.5 landscape:space-y-0 text-slate-300">
              <p>Thn Lalu: <span className="font-bold text-white">{tgtMenuThnLalu > 0 ? `${fmtNum(tgtMenuThnLalu)} btl/hr` : "-"}</span></p>
              <p>Selisih: <span className={`font-bold ${
                selisihTahunLaluHarian >= 0 ? "text-emerald-400" : "text-amber-400"
              }`}>
                {tgtMenuThnLalu > 0 ? `${selisihTahunLaluHarian >= 0 ? "+" : ""}${fmtNum(selisihTahunLaluHarian)} btl/hr` : "-"}
              </span></p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5 landscape:gap-1.5">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5 landscape:px-2 landscape:py-1">
            <span className="text-sm sm:text-base landscape:text-[10px] text-slate-400 font-bold uppercase block">Hari Kerja (JWP)</span>
            <span className="text-lg sm:text-xl landscape:text-sm font-black text-white">{fmtNum(jwp)} <span className="text-sm landscape:text-[10px] font-normal text-slate-400">hari aktif</span></span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5 landscape:px-2 landscape:py-1">
            <span className="text-sm sm:text-base landscape:text-[10px] text-slate-400 font-bold uppercase block">Absen & Frekuensi</span>
            <span className="text-lg sm:text-xl landscape:text-sm font-black text-amber-400">
              {m.absen?.jumlahYL || 0} YL <span className="text-sm landscape:text-[10px] font-normal text-slate-400">({m.absen?.frekuensi || 0}x izin)</span>
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5 landscape:px-2 landscape:py-1">
            <span className="text-sm sm:text-base landscape:text-[10px] text-slate-400 font-bold uppercase block">% Area Tercover</span>
            <span className="text-lg sm:text-xl landscape:text-sm font-black text-emerald-400">{fmtPct(m.persenAreaTercover, 0)}% <span className="text-sm landscape:text-[10px] font-normal text-slate-400">terlayani</span></span>
          </div>
        </div>
      </div>
    ),
  };

  // Slide 4: Apresiasi Performa — 3 kategori performa terbaik (memakai builder generik)
  const winnerRata2Raw = top3[0] || null;
  const ylComparisonBySelisih = [...ylComparison].sort((a, b) => b.selisih - a.selisih);
  const winnerVsTahunLaluRaw = ylComparisonBySelisih[0] || null;

  // Otomatisasi Sampah Botol Terbanyak dari Transaksi PLG & PJL jika belum di-override
  let autoSampah: SampahTerbanyakRecord = { nama: "", area: "", jumlah: "" };
  if (archiveDetails?.topSampah) {
    autoSampah = {
      nama: cleanYlName(archiveDetails.topSampah.nama),
      area: archiveDetails.topSampah.area,
      jumlah: `${fmtNum(archiveDetails.topSampah.jumlah)} btl`,
    };
  } else {
    try {
      const ymPad = `${tahun}-${String(monthIndex + 1).padStart(2, "0")}`;
      const localTxs = localStorage.getItem(`plg_pjl_transactions_${ymPad}`) || localStorage.getItem("plg_pjl_transactions");
      if (localTxs) {
        const txsArr = JSON.parse(localTxs);
        if (Array.isArray(txsArr) && txsArr.length > 0) {
          const sMap: Record<string, { nama: string; area: string; total: number }> = {};
          txsArr.forEach((t: any) => {
            const area = resolveAreaFromTx(t);
            const nama = t.nama || "";
            const btl = Number(t.apk_botol) || 0;
            if (area && btl > 0) {
              if (!sMap[area]) sMap[area] = { nama, area, total: 0 };
              sMap[area].total += btl;
              if (nama && (!sMap[area].nama || sMap[area].nama.length < String(nama).length)) sMap[area].nama = String(nama);
            }
          });
          const sorted = Object.values(sMap).sort((a, b) => b.total - a.total);
          if (sorted[0] && sorted[0].total > 0) {
            autoSampah = {
              nama: cleanYlName(sorted[0].nama),
              area: sorted[0].area,
              jumlah: `${fmtNum(sorted[0].total)} btl`,
            };
          }
        }
      }
    } catch (e) {}
  }

  const effectiveSampah: SampahTerbanyakRecord = {
    nama: (sampah?.nama && sampah.nama.trim().length > 0) ? sampah.nama : autoSampah.nama,
    area: (sampah?.area && sampah.area.trim().length > 0) ? sampah.area : autoSampah.area,
    jumlah: (sampah?.jumlah && sampah.jumlah.trim().length > 0) ? sampah.jumlah : autoSampah.jumlah,
  };

  const slide4: SlideDef = buildApresiasiPerformaSlide({
    id: "apresiasi",
    periodeLabel: `Bulan ${monthLabel}`,
    headerStat: {
      label: "S/YL (Sales per Yakult Lady)",
      value: `${fmtNum(m.salesPerYL)} btl/hr`,
      sub: `Tahun lalu: ${fmtNum(m.salesPerYLTahunLalu)}`,
    },
    winnerRata2: winnerRata2Raw ? {
      nama: winnerRata2Raw.nama,
      area: winnerRata2Raw.area,
      valueLabel: `${fmtNum(winnerRata2Raw.penjualan)} btl`,
    } : null,
    winnerKenaikan: winnerVsTahunLaluRaw ? {
      nama: winnerVsTahunLaluRaw.nama,
      area: winnerVsTahunLaluRaw.area,
      valueLabel: `${winnerVsTahunLaluRaw.selisih > 0 ? "+" : ""}${fmtNum(winnerVsTahunLaluRaw.selisih)} btl (${fmtPct(winnerVsTahunLaluRaw.pctYoY)}%)`,
    } : null,
    kenaikanLabel: "Vs Tahun Lalu Tertinggi",
    sampah: effectiveSampah,
    onSampahChange,
  });

  // Slide 5: Rata-Rata YL vs Tahun Lalu
  const slide5: SlideDef = {
    id: "evaluasi10yl",
    eyebrow: "Evaluasi Seluruh 10 YL",
    title: `Rata-Rata YL vs Tahun Lalu — ${monthLabel}`,
    speakerNotes: "Tabel perbandingan rata-rata penjualan harian seluruh 10 Yakult Lady dibandingkan target dan capaian bulan yang sama di tahun lalu dari Menu Target Archive.",
    node: (
      <div className="w-full max-w-6xl mx-auto space-y-1">
        <p className="text-[9px] sm:text-[9.5px] text-slate-400 uppercase tracking-widest text-center mb-0.5">
          Capaian Rata-Rata Botol / Hari Seluruh 10 Area (Data Menu Target Archive)
        </p>

        <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-1.5 sm:gap-2.5 w-full">
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-md">
            <table className="w-full text-left border-collapse text-[10px] sm:text-[11px]">
              <thead>
                <tr className="bg-slate-800/90 text-[8.5px] sm:text-[9px] uppercase tracking-wider text-slate-400 border-b border-slate-700/80 whitespace-nowrap">
                  <th className="py-1 px-1 text-center w-5">#</th>
                  <th className="py-1 px-1.5">Area & Nama</th>
                  <th className="py-1 px-1 text-right">Rata {monthLabel.slice(0, 3)}</th>
                  <th className="py-1 px-1 text-right">Th.Lalu</th>
                  <th className="py-1 px-1 text-right">Selisih</th>
                  <th className="py-1 px-1 text-right">% YoY</th>
                  <th className="py-1 px-1 text-center w-12">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {ylComparison.slice(0, 5).map((yl, idx) => {
                  const isNaik = yl.selisih > 0;
                  const isSama = yl.selisih === 0;
                  return (
                    <tr key={yl.area} className="hover:bg-slate-800/40 transition-colors whitespace-nowrap">
                      <td className="py-1 px-1 text-center font-bold text-slate-500 text-[9px]">{idx + 1}</td>
                      <td className="py-1 px-1.5 font-bold text-white truncate max-w-[85px] sm:max-w-[130px]">
                        <span className="text-[9px] font-mono text-orange-400 mr-1">{yl.area}</span>
                        {yl.nama}
                      </td>
                      <td className="py-1 px-1 text-right font-black text-white text-[10px] sm:text-[11px]">
                        {fmtNum(yl.rataIni)} <span className="text-[8px] font-normal text-slate-400">btl</span>
                      </td>
                      <td className="py-1 px-1 text-right font-medium text-slate-400 text-[9.5px]">{fmtNum(yl.rataThn)}</td>
                      <td className={`py-1 px-1 text-right font-bold text-[9.5px] sm:text-[10px] ${isNaik ? "text-emerald-400" : isSama ? "text-slate-400" : "text-red-400"}`}>
                        {yl.selisih > 0 ? "+" : ""}{fmtNum(yl.selisih)}
                      </td>
                      <td className={`py-1 px-1 text-right font-black text-[9.5px] sm:text-[10px] ${yl.pctYoY >= 100 ? "text-emerald-400" : "text-amber-400"}`}>
                        {fmtPct(yl.pctYoY)}%
                      </td>
                      <td className="py-1 px-1 text-center">
                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${isNaik ? "bg-emerald-500/20 text-emerald-400" : isSama ? "bg-slate-700 text-slate-300" : "bg-red-500/20 text-red-400"}`}>
                          {isNaik ? "↑ Naik" : isSama ? "= Tetap" : "↓ Turun"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-md">
            <table className="w-full text-left border-collapse text-[10px] sm:text-[11px]">
              <thead>
                <tr className="bg-slate-800/90 text-[8.5px] sm:text-[9px] uppercase tracking-wider text-slate-400 border-b border-slate-700/80 whitespace-nowrap">
                  <th className="py-1 px-1 text-center w-5">#</th>
                  <th className="py-1 px-1.5">Area & Nama</th>
                  <th className="py-1 px-1 text-right">Rata {monthLabel.slice(0, 3)}</th>
                  <th className="py-1 px-1 text-right">Th.Lalu</th>
                  <th className="py-1 px-1 text-right">Selisih</th>
                  <th className="py-1 px-1 text-right">% YoY</th>
                  <th className="py-1 px-1 text-center w-12">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {ylComparison.slice(5, 10).map((yl, idx) => {
                  const isNaik = yl.selisih > 0;
                  const isSama = yl.selisih === 0;
                  return (
                    <tr key={yl.area} className="hover:bg-slate-800/40 transition-colors whitespace-nowrap">
                      <td className="py-1 px-1 text-center font-bold text-slate-500 text-[9px]">{idx + 6}</td>
                      <td className="py-1 px-1.5 font-bold text-white truncate max-w-[85px] sm:max-w-[130px]">
                        <span className="text-[9px] font-mono text-orange-400 mr-1">{yl.area}</span>
                        {yl.nama}
                      </td>
                      <td className="py-1 px-1 text-right font-black text-white text-[10px] sm:text-[11px]">
                        {fmtNum(yl.rataIni)} <span className="text-[8px] font-normal text-slate-400">btl</span>
                      </td>
                      <td className="py-1 px-1 text-right font-medium text-slate-400 text-[9.5px]">{fmtNum(yl.rataThn)}</td>
                      <td className={`py-1 px-1 text-right font-bold text-[9.5px] sm:text-[10px] ${isNaik ? "text-emerald-400" : isSama ? "text-slate-400" : "text-red-400"}`}>
                        {yl.selisih > 0 ? "+" : ""}{fmtNum(yl.selisih)}
                      </td>
                      <td className={`py-1 px-1 text-right font-black text-[9.5px] sm:text-[10px] ${yl.pctYoY >= 100 ? "text-emerald-400" : "text-amber-400"}`}>
                        {fmtPct(yl.pctYoY)}%
                      </td>
                      <td className="py-1 px-1 text-center">
                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${isNaik ? "bg-emerald-500/20 text-emerald-400" : isSama ? "bg-slate-700 text-slate-300" : "bg-red-500/20 text-red-400"}`}>
                          {isNaik ? "↑ Naik" : isSama ? "= Tetap" : "↓ Turun"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-2.5 py-1.5 flex items-center justify-between flex-wrap gap-1.5 text-xs">
          <span className="font-black text-white text-[9.5px] sm:text-[10px] uppercase tracking-wider">
            RATA-RATA TIM TKU:
          </span>
          <div className="flex items-center gap-2 sm:gap-2.5 text-[9.5px] sm:text-[10.5px] font-bold flex-wrap">
            <span className="text-orange-400">
              Rata {monthLabel}: <strong className="text-white font-mono">{fmtNum(ylComparison.reduce((s, y) => s + y.rataIni, 0))}</strong>
            </span>
            <span className="text-slate-400">
              Th. Lalu: <strong className="text-slate-300 font-mono">{fmtNum(ylComparison.reduce((s, y) => s + y.rataThn, 0))}</strong>
            </span>
            <span className={ylComparison.reduce((s, y) => s + y.selisih, 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
              Selisih: <strong>{ylComparison.reduce((s, y) => s + y.selisih, 0) >= 0 ? "+" : ""}{fmtNum(ylComparison.reduce((s, y) => s + y.selisih, 0))}</strong>
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">
              {ylNaik.length} YL Naik, {ylTurun.length} YL Turun
            </span>
          </div>
        </div>
      </div>
    ),
  };

  // Slide 6: Kondisi YL (Distribusi Botol)
  const slide6: SlideDef = {
    id: "distribusi",
    eyebrow: "Distribusi Penjualan Tim",
    title: "Kondisi YL (Distribusi Botol)",
    speakerNotes: "Distribusi jumlah Yakult Lady berdasarkan rata-rata botol per hari. Memantau pertumbuhan kategori Mandiri (≥ 250 botol/hari).",
    node: (
      <div className="space-y-2 w-full max-w-2xl mx-auto">
        <KondisiYLChart data={kondisiData} storageKey={`presentasi_chart_kondisi_${tahun}_${monthIndex}`} />
        <div className="flex justify-center gap-4 text-xs text-slate-300">
          <span>Total YL: <strong className="text-white">{kondisiData.reduce((a, b) => a + b.value, 0)} YL</strong></span>
          <span>Mandiri (≥250): <strong className="text-emerald-400">{kondisiData.slice(1).reduce((a, b) => a + b.value, 0)} YL</strong></span>
          <span>Binaan (&lt;250): <strong className="text-amber-400">{kondisiData[0].value} YL</strong></span>
        </div>
      </div>
    ),
  };

  // Slide 7: Rata-Rata YTD
  const slideYTD: SlideDef | null = monthIndex > 0 ? {
    id: "ytd",
    eyebrow: "Rata-Rata YTD per YL",
    title: `Rata-Rata YTD: Jan s/d ${monthLabel}`,
    speakerNotes: `Tunjukkan konsistensi performa setiap Ibu Yakult Lady dari awal tahun hingga ${monthLabel}, jadikan momen ini untuk mengapresiasi progres jangka panjang, bukan hanya capaian sebulan.`,
    node: (
      <div className="w-full max-w-6xl mx-auto">
        <TabelRataRataYL
          perYL={perYL}
          startIdx={0}
          endIdx={monthIndex}
          isDarkSlide={true}
        />
      </div>
    ),
  } : null;

  // Slide 8: Penjualan per Sektor - dengan analisis dinamis berdasarkan data sektor riil
  const sortedSectors = [...sectorsRaw].sort((a, b) => b.pct - a.pct);
  const topSector = sortedSectors[0] || { label: "Rumah", pct: 0, akm: 0, rata2: 0, key: "rmh" };
  const secondSector = sortedSectors[1] && sortedSectors[1].pct > 0 ? sortedSectors[1] : null;
  const lowestFixedSector = [...sectorsRaw]
    .filter((s) => s.isFixedCustomer)
    .sort((a, b) => a.pct - b.pct)[0];
  const totalFixedPct = sectorsRaw
    .filter((s) => s.isFixedCustomer)
    .reduce((acc, s) => acc + s.pct, 0);
  const ibSec = sectorsRaw.find((s) => s.key === "ib");
  const ibPctVal = ibSec?.pct || 0;

  let dynamicSectorTitle = `Analisis Sektor: Dominasi ${topSector.label} (${fmtPct(topSector.pct)}%)`;
  if (topSector.key === "rmh") {
    dynamicSectorTitle = `Analisis Sektor: Dominasi Pelanggan Rumah Tangga (${fmtPct(topSector.pct)}%)`;
  } else if (topSector.key === "psr") {
    dynamicSectorTitle = `Analisis Sektor: Sektor Pasar Menjadi Kontributor Utama (${fmtPct(topSector.pct)}%)`;
  } else if (topSector.key === "ib") {
    dynamicSectorTitle = `Analisis Sektor: Penjualan Insidental (IB) Tinggi (${fmtPct(topSector.pct)}%)`;
  }

  const slide8: SlideDef = {
    id: "karakteristik",
    eyebrow: "Analisis Karakteristik Pelanggan",
    title: `Penjualan Persentase per Potensi Sektor — ${monthLabel}`,
    speakerNotes: `Tinjau komposisi 6 potensi sektor. Sektor terbesar: ${topSector.label} (${fmtPct(topSector.pct)}%), total pelanggan tetap ${fmtPct(totalFixedPct)}%.`,
    node: (
      <div className="space-y-2 w-full max-w-4xl mx-auto">
        {!sectorsDataAvailable && (
          <div className="bg-red-950/30 border border-red-500/40 rounded-xl p-2 sm:p-2.5 text-left flex items-start gap-1.5">
            <span className="text-sm shrink-0 mt-0.5">⚠️</span>
            <p className="text-[10px] sm:text-[10.5px] text-red-200 leading-snug">
              <strong>Data sektor bulan {monthLabel} belum diisi di Menu Archive.</strong> Persentase &amp; angka di bawah ini adalah <strong>estimasi ilustratif</strong>, bukan data riil — lengkapi data sektor di Archive agar slide ini menampilkan angka yang akurat.
            </p>
          </div>
        )}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2 sm:p-2.5">
          <div className="flex justify-between items-center text-[11px] mb-1">
            <span className="font-bold text-slate-300">Komposisi 6 Sektor Potensi</span>
            <span className="text-[10px] text-slate-400 font-mono">Total: 100%</span>
          </div>
          {/* Warna berbeda untuk setiap sektor */}
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex">
            {sectorsRaw.map((sec) => (
              <div
                key={sec.key}
                style={{ width: `${Math.max(sec.pct, 1)}%`, backgroundColor: sec.color || "#3b82f6" }}
                title={`${sec.label}: ${fmtPct(sec.pct)}%`}
                className="h-full transition-all"
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px]">
            {sectorsRaw.map((sec) => (
              <div key={sec.key} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sec.color || "#3b82f6" }} />
                <span className="text-slate-300 font-medium">{sec.label}:</span>
                <span className="font-black text-white">{fmtPct(sec.pct)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {sectorsRaw.map((sec) => {
            return (
              <div
                key={sec.key}
                className="rounded-xl p-1.5 sm:p-2 border border-slate-800 bg-slate-900/80 transition-all"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-black text-white truncate flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sec.color || "#3b82f6" }} />
                    {sec.label}
                  </span>
                  <span
                    className="text-[9px] font-black px-1 py-0.2 rounded"
                    style={{ backgroundColor: `${sec.color || "#3b82f6"}33`, color: sec.color || "#3b82f6" }}
                  >
                    {fmtPct(sec.pct)}%
                  </span>
                </div>
                <div className="text-[9.5px] text-slate-300">
                  <p>AKM: <strong className="text-white">{fmtNum(sec.akm)}</strong></p>
                  <p className="text-slate-400">Rata: <strong className="text-slate-200">{fmtNum(sec.rata2)}</strong></p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-2 sm:p-2.5 text-left">
          <div className="flex items-start gap-1.5">
            <span className="text-sm shrink-0 mt-0.5">💡</span>
            <div className="text-[10px] sm:text-[10.5px]">
              <p className="font-black text-amber-300 uppercase tracking-wide text-[10px]">
                {dynamicSectorTitle}
              </p>
              <p className="text-slate-300 mt-0.5 leading-snug">
                Sektor <strong>{topSector.label}</strong> menjadi penopang utama penjualan bulan ini dengan porsi <strong>{fmtPct(topSector.pct)}%</strong> ({fmtNum(topSector.akm)} botol, rata-rata {fmtNum(topSector.rata2)} btl/hr)
                {secondSector && (
                  <>
                    , disusul sektor <strong>{secondSector.label}</strong> sebesar <strong>{fmtPct(secondSector.pct)}%</strong> ({fmtNum(secondSector.akm)} botol)
                  </>
                )}.
              </p>
              <p className="text-slate-300 mt-1 leading-snug">
                Total kontribusi 5 sektor pelanggan tetap (Rumah, Pasar, Toko, Sekolah, Kantor) mencapai <strong>{fmtPct(totalFixedPct)}%</strong>.
                {ibPctVal > 15 ? (
                  <> Penjualan IB (Instant Buyer) tercatat <strong>{fmtPct(ibPctVal)}%</strong> — merupakan omzet tambahan insidental yang bagus, namun terus dorong porsi pelanggan tetap harian agar kestabilan rute terjaga.</>
                ) : ibPctVal > 0 ? (
                  <> Penjualan IB (Instant Buyer) berada di tingkat wajar <strong>{fmtPct(ibPctVal)}%</strong>, menegaskan mayoritas omzet berasal dari rute langganan tetap harian yang stabil.</>
                ) : (
                  <> Seluruh penjualan 100% didukung oleh rute langganan tetap harian.</>
                )}
                {lowestFixedSector && lowestFixedSector.pct < 10 && (
                  <> Peluang pengembangan: Sektor <strong>{lowestFixedSector.label}</strong> ({fmtPct(lowestFixedSector.pct)}%) dapat diprioritaskan untuk penambahan langganan baru bulan depan.</>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    ),
  };

  // Slide 9: Mix Produk
  const slide9: SlideDef = {
    id: "mixproduk",
    eyebrow: "Evaluasi Mix Produk",
    title: `Komposisi Produk & Penetrasi Varian Baru — ${monthLabel}`,
    speakerNotes: "Keseimbangan penjualan antar varian: Original (YO) vs varian baru (Original Mangga, Original Stroberi, Yakult Light).",
    node: (
      <div className="w-full max-w-4xl mx-auto">
        <AnalisisMixProductCard
          months={[m]}
          isDarkSlide={true}
        />
      </div>
    ),
  };

  // Slide 10: Analisa Data Mendalam (3 poin baik + 3 poin perbaikan)
  const mandiriCount = kondisiData.slice(1).reduce((a, b) => a + b.value, 0);
  const binaanCount = kondisiData[0]?.value || 0;
  const ylNaikCount = ylComparison.filter((y) => y.selisih > 0).length;
  const ylTurunCount = ylComparison.filter((y) => y.selisih < 0).length;
  const totalFrekuensiAbsen = m.absen?.frekuensi || 0;
  const bbPct = m.persenKembaliBotol || 0;
  const rmhPct = sectorsRaw.find((s) => s.key === "rmh")?.pct || 0;
  const ibPct = sectorsRaw.find((s) => s.key === "ib")?.pct || 0;

  // Poin-poin analisa yang baik
  const poinBaik: string[] = [];
  // Poin 1: Target
  if (isTgtTembus) {
    poinBaik.push(`🎯 Target Tembus ${fmtPct(pctVsTarget)}%! AKM ${fmtNum(m.akmPenjualan)} botol tercapai dengan rata-rata ${fmtNum(realisasiTimRata)} btl/hr.`);
  } else if (ylNaikCount > ylTurunCount) {
    poinBaik.push(`📈 ${ylNaikCount} dari 10 YL berhasil meningkatkan penjualan dibanding tahun lalu, pertumbuhan tim solid!`);
  } else {
    poinBaik.push(`✅ Rata-rata tim ${fmtNum(realisasiTimRata)} btl/hr, S/YL ${fmtNum(realisasiSYL)} btl/hr — fondasi penjualan tetap kokoh.`);
  }

  // Poin 2: S/YL
  if (realisasiSYL >= 35) {
    poinBaik.push(`📊 S/YL luar biasa tinggi! Rata-rata ${fmtNum(realisasiSYL)} btl/hari/YL — Ibu-ibu hebat dalam merawat pelanggan setia.`);
  } else if (isBBAman) {
    poinBaik.push(`🔄 Kembali Botol sangat aman di ${fmtPct(bbPct)}% (≤10%), rotasi stok pelanggan terjaga dengan baik.`);
  } else {
    poinBaik.push(`🏪 Total pelanggan tetap ${fmtPct(sectorsRaw.filter(s=>s.isFixedCustomer).reduce((acc, s) => acc + s.pct, 0))}%, stabilitas rute terjaga.`);
  }

  // Poin 3: Kehadiran atau IB
  if (totalFrekuensiAbsen === 0) {
    poinBaik.push(`👏 100% kehadiran disiplin! Seluruh YL hadir aktif tanpa izin/sakit.`);
  } else if (ibPct > 5) {
    poinBaik.push(`🎪 Penjualan IB ${fmtPct(ibPct)}% — Ibu-ibu hebat memanfaatkan momen keramaian/karnaval untuk tambahan omzet!`);
  } else {
    poinBaik.push(`🤝 Kekompakan tim terlihat, ${ylNaikCount} YL naik dan hanya ${ylTurunCount} YL yang perlu pendampingan.`);
  }

  // Poin-poin yang perlu diperbaiki (mendalam) - hanya 2 poin
  const poinPerbaikan: string[] = [];
  if (!isTgtTembus) {
    const akmTargetVal = m.akmTarget > 0 ? m.akmTarget : (tgtMenuTarget * jwpVal);
    const akmPenjualanVal = m.akmPenjualan > 0 ? m.akmPenjualan : (realisasiTimRata * jwpVal);
    const selisihBotolTotal = Math.max(0, Math.round(akmTargetVal - akmPenjualanVal));
    poinPerbaikan.push(`🎯 Target masih kurang ${fmtPct(100 - pctVsTarget)}% (${fmtNum(selisihBotolTotal)} botol). Ajak setiap YL tawarkan +1 pack ke langganan rumah.`);
  } else {
    poinPerbaikan.push(`📊 Pertahankan konsistensi, jangan kendor di awal bulan. Pembukaan minggu pertama yang kuat menentukan kelancaran sisa bulan.`);
  }

  if (ylTurunCount > 0) {
    const ylTurunNama = ylTurun.slice(0, 3).map(y => y.nama).join(", ");
    poinPerbaikan.push(`📉 ${ylTurunCount} YL turun vs tahun lalu: ${ylTurunNama}${ylTurunCount > 3 ? ` dan ${ylTurunCount - 3} lainnya` : ""}. Perlu coaching intensif dan pendampingan rute.`);
  } else if (!isBBAman) {
    poinPerbaikan.push(`🔄 Kembali Botol ${fmtPct(bbPct)}% (di atas 10%). Periksa kulkas pelanggan, utamakan stok lama diminum lebih dulu.`);
  } else if (binaanCount > 0) {
    poinPerbaikan.push(`📘 ${binaanCount} YL masih di level binaan (<250 btl). Senior yuk dampingi dan bagikan resep sapaan hangat untuk pelanggan.`);
  } else {
    poinPerbaikan.push(`🏠 Sektor Rumah hanya ${fmtPct(rmhPct)}% (<50%). Fokus perkuat kunjungan rutin ke rumah tangga, ini fondasi utama.`);
  }

  // Ambil 3 poin baik dan 2 poin perbaikan
  const top3Baik = poinBaik.slice(0, 3);
  const top2Perbaikan = poinPerbaikan.slice(0, 2);

  const slide10: SlideDef = {
    id: "analisa",
    eyebrow: `Analisa Data Capaian — ${monthLabel}`,
    title: "Analisa Data Performa Tim Ibu-Ibu Yakult Lady",
    speakerNotes: "Gunakan bahasa yang hangat, penuh kasih, dan membangkitkan rasa bangga. Tunjukkan bukti nyata di balik angka penjualan: senyum ramah menyapa pelanggan rumah tangga, botol yang segar tanpa retur, dan kekompakan merangkul rekan satu rute.",
    node: (
      <SlideAnalisaPerformaNode
        periodeLabel={monthLabel}
        ylCount={ylComparison.length}
        top3Baik={top3Baik}
        plusList={plusList}
        top2Perbaikan={top2Perbaikan}
        minusList={minusList}
        fallbackBaikText={`Rata-rata tim ${fmtNum(realisasiTimRata)} btl/hari — semua YL bekerja dengan semangat dan dedikasi tinggi!`}
      />
    ),
  };

  // Slide 11: Kesimpulan (tanpa action plan)
  const slide11: SlideDef = {
    id: "kesimpulan",
    eyebrow: `Kesimpulan Akhir & Arah Melangkah — ${monthLabel}`,
    title: `Kesimpulan Kinerja Bulan ${monthLabel}`,
    speakerNotes: "Sampaikan rangkuman kesimpulan kinerja bulan ini secara lugas dan terarah berdasarkan data riil, kemudian ajak seluruh tim melangkah mantap memasuki bulan berikutnya.",
    node: (
      <div className="space-y-2 sm:space-y-3 landscape:space-y-1.5 w-full max-w-5xl mx-auto text-left">
        <div className="grid grid-cols-1 landscape:grid-cols-3 md:grid-cols-3 gap-2 sm:gap-3 landscape:gap-2">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 landscape:p-2 flex flex-col justify-between shadow-lg">
            <div>
              <span className="text-xs sm:text-sm uppercase font-black text-slate-400 tracking-wider">
                1. Rapor Capaian
              </span>
              <div className="my-1.5 sm:my-2">
                <div className={`inline-flex items-center gap-1 text-[10.5px] sm:text-xs font-black px-2 py-0.5 rounded-md ${
                  isTgtTembus ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                }`}>
                  {isTgtTembus ? "✓ TARGET TERCAPAI" : "PERLU DORONGAN SISA"} ({fmtPct(pctVsTarget)}%)
                </div>
                <p className="text-2xl sm:text-3xl landscape:text-xl font-black text-white mt-1">
                  {fmtNum(realisasiTimRata)} <span className="text-sm font-semibold text-slate-400">btl/hr</span>
                </p>
                <p className="text-xs sm:text-sm landscape:text-[11px] text-slate-300 mt-0.5">
                  Target: <strong>{fmtNum(tgtMenuTarget)} btl/hr</strong> · AKM: <strong>{fmtNum(m.akmPenjualan)} btl</strong>
                </p>
              </div>
            </div>
            <div className="pt-1.5 sm:pt-2 border-t border-slate-800 text-xs sm:text-sm landscape:text-[11px] text-slate-400">
              Pertumbuhan YoY: <strong className={ylComparison.reduce((s, y) => s + y.selisih, 0) >= 0 ? "text-emerald-400" : "text-amber-400"}>
                {ylComparison.reduce((s, y) => s + y.selisih, 0) >= 0 ? "+" : ""}{fmtNum(ylComparison.reduce((s, y) => s + y.selisih, 0))} btl/hr
              </strong>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 landscape:p-2 flex flex-col justify-between shadow-lg">
            <div>
              <span className="text-xs sm:text-sm uppercase font-black text-slate-400 tracking-wider">
                2. Kesehatan Rute &amp; Mutu
              </span>
              <div className="my-1.5 sm:my-2 space-y-1 sm:space-y-1.5 text-xs sm:text-sm landscape:text-[11px] text-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Status YL:</span>
                  <span className="font-bold text-white">
                    <strong className="text-emerald-400">{mandiriCount}</strong> Mandiri / <strong className="text-amber-400">{binaanCount}</strong> Binaan
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Pelanggan Tetap:</span>
                  <span className="font-bold text-white">{fmtPct(sectorsRaw.filter(s=>s.isFixedCustomer).reduce((acc, s) => acc + s.pct, 0))}% (Rumah {fmtPct(rmhPct)}%)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Kembali Botol (BB):</span>
                  <span className={`font-bold ${bbColorClass(bbPct)}`}>
                    {fmtPct(bbPct)}% ({isBBAman ? "Aman" : "Perlu Penataan"})
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Kehadiran:</span>
                  <span className="font-bold text-white">
                    {totalFrekuensiAbsen === 0 ? "100% Tertib Hadir" : `${totalFrekuensiAbsen} Hari Izin`}
                  </span>
                </div>
              </div>
            </div>
            <div className="pt-1.5 sm:pt-2 border-t border-slate-800 text-xs sm:text-sm landscape:text-[11px] text-slate-400">
              Fondasi langganan rumah tangga sangat kuat &amp; loyal.
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 landscape:p-2 flex flex-col justify-between shadow-lg">
            <div>
              <span className="text-xs sm:text-sm uppercase font-black text-orange-400 tracking-wider">
                3. Fokus Aksi Bulan Depan
              </span>
              <div className="my-1.5 sm:my-2 space-y-1 sm:space-y-1.5 text-xs sm:text-sm landscape:text-[11px] text-slate-300">
                <div className="flex items-start gap-1.5">
                  <span className="text-orange-400 font-bold shrink-0">1.</span>
                  <span><strong>Tambah 1 Pack:</strong> Tawarkan paket keluarga saat kunjungan mingguan rute rumah.</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-orange-400 font-bold shrink-0">2.</span>
                  <span><strong>Zero BB (≤10%):</strong> Pastikan stok lama diminum lebih dulu sebelum stok baru.</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-orange-400 font-bold shrink-0">3.</span>
                  <span><strong>Kompak Merangkul:</strong> Bimbing rekan binaan agar target 250 btl tercapai bersama.</span>
                </div>
              </div>
            </div>
            <div className="pt-1.5 sm:pt-2 border-t border-slate-800 text-xs sm:text-sm landscape:text-[11px] text-orange-400 font-bold">
              Kompak, sehat, dan sukses bersama! 🚀
            </div>
          </div>
        </div>

        <div className="bg-slate-900/95 border border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 landscape:p-2 text-left">
          <div className="flex items-start gap-2.5">
            <span className="text-lg sm:text-xl shrink-0 mt-0.5">📌</span>
            <div>
              <h4 className="text-sm sm:text-lg landscape:text-sm font-black text-white">
                Intisari Kesimpulan Kinerja {monthLabel}
              </h4>
              <p className="text-xs sm:text-sm landscape:text-[11px] text-slate-300 mt-1 leading-relaxed">
                Perjuangan bulan ini membuktikan bahwa dedikasi Ibu-Ibu Yakult Lady berhasil menjaga stabilitas konsumsi harian keluarga pelanggan.
                Dengan rata-rata capaian tim sebesar <strong className="text-white">{fmtNum(realisasiTimRata)} btl/hari</strong> dan tingkat kesegaran botol sebesar <strong className={isBBAman ? "text-emerald-400" : "text-amber-400"}>{fmtPct(bbPct)}%</strong>,
                kunci keberhasilan bulan berikutnya terletak pada <strong>penambahan kuantitas langganan rumah tangga (+1 pack)</strong> serta <strong>pendampingan aktif bagi area binaan</strong> agar seluruh 10 area mandiri bersama.
              </p>
            </div>
          </div>
        </div>
      </div>
    ),
  };

  // Slide 12: Action Plan sudah dihapus (diganti dengan slide YL of the Month)
  // Slide 13: YL of the Month Teaser
  // Slide 14: YL of the Month Winner

  return [
    slide1,
    slide2,
    slide5,
    slide6,
    slide8,
    slide9,
    slide4,
    ...(slideYTD ? [slideYTD] : []),
    slide10,
    slide11,
  ];
}

function buildSemesterSlides(
  agg: ReturnType<typeof computeSemesterAgg>,
  title: string,
  subtitle: string,
  tahun: string | number,
  tku: string,
  actionPlans: ActionPlanItem[],
  perYL: any[] = [],
  sampah?: SampahTerbanyakRecord,
  onSampahChange?: (patch: Partial<SampahTerbanyakRecord>) => void,
  coverFoto?: string
): SlideDef[] {
  const semYl = computeYLAverageData(
    perYL,
    title.includes("Semester 2") ? 6 : 0,
    title.includes("Semester 2") ? 11 : 5
  );
  const mandiriCount = semYl.totalMandiri;
  const binaanCount = semYl.totalBinaan;

  // Pemenang Apresiasi Performa: kategori 2 memakai "delta" (kenaikan awal→akhir periode)
  // karena data pembanding tahun lalu per-YL tidak tersedia di level semester.
  const winnerRata2Sem = semYl.rows[0] || null;
  const rowsByDelta = [...semYl.rows].sort((a, b) => b.delta - a.delta);
  const winnerDeltaSem = rowsByDelta[0] || null;

  const poinBaikSem: string[] = [];
  if (agg.avgCapaian >= 100) {
    poinBaikSem.push(`🎯 Target ${title} Tembus ${fmtPct(agg.avgCapaian)}%! Total AKM ${fmtNum(agg.totalAkm)} botol tercapai dari ${agg.monthsData.length} bulan perjuangan.`);
  } else {
    poinBaikSem.push(`✅ AKM Penjualan ${fmtNum(agg.totalAkm)} botol (${fmtPct(agg.avgCapaian)}% capaian target) dari ${agg.monthsData.length} bulan kerja.`);
  }

  if (agg.avgRetur <= 10) {
    poinBaikSem.push(`🔄 Rata-rata Kembali Botol (BB) terjaga di ${fmtPct(agg.avgRetur)}% (≤10%), kualitas & perputaran stok prima.`);
  } else if (agg.peak) {
    poinBaikSem.push(`📈 Puncak penjualan ${title} tercapai pada ${agg.peak.label} (${fmtNum(agg.peak.value)} botol).`);
  } else {
    poinBaikSem.push(`🏪 Stabilitas rute dan loyalitas pelanggan terjaga dengan baik sepanjang ${title}.`);
  }

  if (mandiriCount > 0) {
    poinBaikSem.push(`👏 ${mandiriCount} dari ${semYl.rows.length || 10} YL berhasil meraih status Mandiri (≥250 btl/hari), fondasi rute kokoh!`);
  } else if (agg.ylBaru > 0) {
    poinBaikSem.push(`🤝 Rekrutmen ${fmtNum(agg.ylBaru)} YL baru berhasil memperkuat tim dan penguasaan area.`);
  } else {
    poinBaikSem.push(`🤝 Rata-rata tim mencapai ${fmtNum(semYl.teamOverallAvg)} btl/hari dengan kekompakan yang solid.`);
  }

  const poinPerbaikanSem: string[] = [];
  if (agg.avgCapaian < 100) {
    poinPerbaikanSem.push(`🎯 Rata-rata capaian masih kurang ${fmtPct(100 - agg.avgCapaian)}%. Dorong penawaran +1 pack ke pelanggan rumah tangga setiap kunjungan.`);
  } else {
    poinPerbaikanSem.push(`📊 Pertahankan konsistensi ritme penjualan agar performa periode berikutnya tetap melampaui target.`);
  }

  if (binaanCount > 0) {
    poinPerbaikanSem.push(`📘 Masih ada ${binaanCount} YL di level binaan (<250 btl). Dampingi rute bersama untuk mencapai target 250 btl/hari.`);
  } else if (agg.avgRetur > 10) {
    poinPerbaikanSem.push(`🔄 Rata-rata Kembali Botol ${fmtPct(agg.avgRetur)}% (>10%). Periksa rotasi stok dan kulkas pelanggan secara berkala.`);
  } else if (agg.ylResign > 0) {
    poinPerbaikanSem.push(`⚠️ Terdapat ${fmtNum(agg.ylResign)} YL resign. Percepat pembinaan YL baru agar area tetap terlayani ramah.`);
  } else {
    poinPerbaikanSem.push(`🏠 Perkuat loyalitas dan kedekatan dengan pelanggan rumah tangga sebagai fondasi utama omzet.`);
  }

  const slideAnalisaSem: SlideDef = {
    eyebrow: `Analisa Data Capaian — ${title}`,
    title: `Analisa Data Performa Tim Ibu-Ibu Yakult Lady (${title})`,
    speakerNotes: `Sampaikan apresiasi tulus kepada seluruh Ibu-Ibu Yakult Lady atas perjuangan selama ${title}, bedah capaian tim secara transparan dan bangkitkan optimisme bersama.`,
    node: (
      <SlideAnalisaPerformaNode
        periodeLabel={title}
        ylCount={semYl.rows.length || 10}
        top3Baik={poinBaikSem.slice(0, 3)}
        plusList={agg.evalPlus}
        top2Perbaikan={poinPerbaikanSem.slice(0, 2)}
        minusList={agg.evalMinus}
        fallbackBaikText={`Rata-rata tim ${fmtNum(semYl.teamOverallAvg)} btl/hari — seluruh tim menunjukkan semangat juang tinggi!`}
      />
    ),
  };

  const slideApresiasiSem: SlideDef = buildApresiasiPerformaSlide({
    periodeLabel: title,
    headerStat: {
      label: "Rata-Rata Tim Keseluruhan",
      value: `${fmtNum(semYl.teamOverallAvg)} btl/hr`,
    },
    winnerRata2: winnerRata2Sem ? {
      nama: winnerRata2Sem.nama,
      area: winnerRata2Sem.area,
      valueLabel: `${fmtNum(winnerRata2Sem.rataRata)} btl/hr`,
    } : null,
    winnerKenaikan: winnerDeltaSem ? {
      nama: winnerDeltaSem.nama,
      area: winnerDeltaSem.area,
      valueLabel: `${winnerDeltaSem.delta > 0 ? "+" : ""}${fmtNum(winnerDeltaSem.delta)} btl (awal→akhir periode)`,
    } : null,
    kenaikanLabel: "Peningkatan Tertinggi Periode Ini",
    sampah,
    onSampahChange,
  });

  return [
    buildCoverSlide({
      eyebrow: "Laporan Semester",
      title: title,
      coverFoto,
      fallbackNode: <SlideTitle sub="">{title}</SlideTitle>,
    }),
    {
      eyebrow: subtitle,
      title: "Ringkasan Performa",
      node: (
        <div>
          <BigStat label="AKM Penjualan Semester" value={`${fmtNum(agg.totalAkm)} btl`} sub={`${agg.monthsData.length} bulan terisi`} />
          <div className="grid grid-cols-2 gap-4 mt-6">
            <BigStat label="Rata² Capaian" value={`${fmtPct(agg.avgCapaian)}%`} pct={agg.avgCapaian} />
            <BigStat label="Rata² Retur (BB)" value={`${fmtPct(agg.avgRetur)}%`} />
          </div>
        </div>
      ),
    },
    {
      eyebrow: "Tren Penjualan",
      title: "Grafik Tren Semester",
      node: (
        <div className="w-full max-w-6xl mx-auto">
          <div className="mb-3">
            <TrendPenjualanChart data={agg.trend} storageKey={`presentasi_chart_trend_${title}`} />
          </div>
          {agg.peak && (
            <p className="text-center text-xs text-slate-400">
              Puncak Penjualan: <strong className="text-white">{agg.peak.label}</strong> ({fmtNum(agg.peak.value)} botol)
            </p>
          )}
        </div>
      ),
    },
    {
      eyebrow: "Rata-Rata per YL",
      title: `Rata-Rata Penjualan YL (${title})`,
      node: (
        <div className="w-full max-w-6xl mx-auto">
          <TabelRataRataYL
            perYL={perYL}
            startIdx={title.includes("Semester 2") ? 6 : 0}
            endIdx={title.includes("Semester 2") ? 11 : 5}
            isDarkSlide={true}
          />
        </div>
      ),
    },
    slideApresiasiSem,
    {
      eyebrow: "Evaluasi Mix Produk",
      title: `Keseimbangan Mix Produk (${title})`,
      node: (
        <div className="w-full max-w-4xl mx-auto">
          <AnalisisMixProductCard
            months={agg.monthsData.map((x) => x.m)}
            isDarkSlide={true}
          />
        </div>
      ),
    },
    {
      eyebrow: "Stabilitas SDM",
      title: "Rekrutmen & Turnover",
      node: (
        <div className="grid grid-cols-2 gap-4">
          <BigStat label="YL Baru" value={fmtNum(agg.ylBaru)} sub="Total rekrutmen baru" />
          <BigStat label="YL Resign" value={fmtNum(agg.ylResign)} sub="Total berhenti kerja" />
        </div>
      ),
    },
    slideAnalisaSem,
  ];
}

function buildSemester2Slides(
  s2: ReturnType<typeof computeSemester2Agg>,
  tahun: string | number,
  tku: string,
  jumlahYL: number,
  actionPlans: ActionPlanItem[],
  perYL: any[] = [],
  sampah?: SampahTerbanyakRecord,
  onSampahChange?: (patch: Partial<SampahTerbanyakRecord>) => void,
  coverFoto?: string
): SlideDef[] {
  const base = buildSemesterSlides(s2.agg, "Semester 2", "Juli – Desember", tahun, tku, actionPlans, perYL, sampah, onSampahChange, coverFoto);
  const proyeksiSlide: SlideDef = {
    eyebrow: "Proyeksi vs Target",
    title: "Proyeksi Akhir Tahun",
    node: (
      <div>
        <BigStat label="Target Sisa Tahun Ini" value={`${fmtNum(s2.targetSisa)} btl`} sub={`Estimasi target tahunan: ${fmtNum(s2.targetTahunEstimasi)}`} />
        <div className="grid grid-cols-2 gap-4 mt-6">
          <BigStat label="Kapasitas Tim (Est.)" value={`${fmtNum(s2.kapasitasSisaEstimasi)} btl`} sub={`${s2.monthsRemaining} bln, ${jumlahYL} YL`} />
          <BigStat
            label="Selisih Proyeksi"
            value={`${s2.kapasitasSisaEstimasi - s2.targetSisa >= 0 ? "+" : ""}${fmtNum(s2.kapasitasSisaEstimasi - s2.targetSisa)} btl`}
            pct={s2.targetSisa > 0 ? (s2.kapasitasSisaEstimasi / s2.targetSisa) * 100 : null}
          />
        </div>
      </div>
    ),
  };
  const alarmSlide: SlideDef = {
    eyebrow: "Alarm Operasional",
    title: "Peringatan Retur (BB)",
    node: s2.alarmMonths.length === 0 ? (
      <div className="text-center py-8">
        <p className="text-4xl mb-3">👍</p>
        <p className="text-sm font-bold text-slate-300">Tidak ada lonjakan retur (BB) di atas 10% pada semester ini.</p>
        <p className="text-xs text-slate-500 mt-1">Kesegaran produk dan perputaran botol terjaga dengan baik.</p>
      </div>
    ) : (
      <div className="space-y-2">
        {s2.alarmMonths.map((x) => (
          <div key={x.key} className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
            <span className="text-xs font-bold text-red-300">Retur {MONTH_LABELS[x.idx]}</span>
            <span className="text-sm font-black text-red-300">{fmtPct(x.m.persenKembaliBotol)}%</span>
          </div>
        ))}
      </div>
    ),
  };
  const ylCumSlide: SlideDef = {
    eyebrow: "Rata-Rata per YL Kumulatif",
    title: "Rata-Rata Penjualan YL (Januari s/d Terakhir)",
    node: (
      <div className="w-full max-w-6xl mx-auto">
        <TabelRataRataYL
          perYL={perYL}
          startIdx={0}
          endIdx={11}
          isDarkSlide={true}
        />
      </div>
    ),
  };

  const bebanKapasitasSlide: SlideDef = {
    eyebrow: "Uji Kelayakan Target",
    title: "Kapasitas Fisik 10 YL vs Target Sisa",
    node: (
      <div className="w-full max-w-4xl mx-auto">
        <UjiKelayakanBebanCard
          targetSisa={s2.targetSisa}
          monthsRemaining={s2.monthsRemaining}
          currentAvgYL={s2.agg.monthsData.length > 0 ? average(s2.agg.monthsData.map((x) => x.m.salesPerYL || x.m.ratarataPenjualanYL)) : undefined}
          isDarkSlide={true}
        />
      </div>
    ),
  };

  return [...base.slice(0, 4), ylCumSlide, proyeksiSlide, bebanKapasitasSlide, alarmSlide, ...base.slice(4)];
}

function buildTahunanSlides(
  t: NonNullable<ReturnType<typeof computeTahunanAgg>>,
  tahun: string | number,
  tku: string,
  actionPlans: ActionPlanItem[],
  perYL: any[] = [],
  sampah?: SampahTerbanyakRecord,
  onSampahChange?: (patch: Partial<SampahTerbanyakRecord>) => void,
  coverFoto?: string
): SlideDef[] {
  const thYl = computeYLAverageData(
    perYL,
    0,
    t.monthsData.length > 0 ? t.monthsData[t.monthsData.length - 1].idx : 11
  );
  const mandiriCount = thYl.totalMandiri;
  const binaanCount = thYl.totalBinaan;

  // Pemenang Apresiasi Performa tahunan
  const winnerRata2Tahunan = thYl.rows[0] || null;
  const rowsByDeltaTahunan = [...thYl.rows].sort((a, b) => b.delta - a.delta);
  const winnerDeltaTahunan = rowsByDeltaTahunan[0] || null;

  const plusListTahunan = t.monthsData.flatMap((x) => x.m.evaluasiPlus || []).filter((s: string) => s && s.trim());
  const minusListTahunan = t.monthsData.flatMap((x) => x.m.evaluasiMinus || []).filter((s: string) => s && s.trim());

  const poinBaikTahunan: string[] = [];
  if (t.capaianTahunan !== null && t.capaianTahunan >= 100) {
    poinBaikTahunan.push(`🎯 Target Tahunan Tembus ${fmtPct(t.capaianTahunan)}%! Akumulasi ${fmtNum(t.akmSoFar)} botol tercapai (est. ${fmtNum(t.estimasiTahunan)} btl).`);
  } else {
    poinBaikTahunan.push(`✅ Realisasi penjualan ${fmtNum(t.akmSoFar)} botol (${t.capaianTahunan !== null ? fmtPct(t.capaianTahunan) : "-"}% dari target tahunan ${fmtNum(t.targetTahunan)} btl).`);
  }

  if (t.growthPct !== null && t.growthPct >= 0) {
    poinBaikTahunan.push(`📈 Pertumbuhan positif +${fmtPct(t.growthPct)}% YoY dibanding tahun lalu, daya juang tim terbukti konsisten.`);
  } else {
    poinBaikTahunan.push(`📊 Estimasi akhir tahun mencapai ${fmtNum(t.estimasiTahunan)} botol dengan ketahanan operasional yang terjaga.`);
  }

  if (mandiriCount > 0) {
    poinBaikTahunan.push(`👏 ${mandiriCount} dari ${thYl.rows.length || 10} YL berada di status Mandiri (≥250 btl/hari), cakupan area aktif ${t.areaTercoverFinal !== null ? fmtPct(t.areaTercoverFinal, 0) : "-"}%.`);
  } else {
    poinBaikTahunan.push(`🗺️ Cakupan area aktif mencapai ${t.areaTercoverFinal !== null ? fmtPct(t.areaTercoverFinal, 0) : "-"}% dengan rata-rata tim ${fmtNum(thYl.teamOverallAvg)} btl/hari.`);
  }

  const poinPerbaikanTahunan: string[] = [];
  if (t.targetTahunan > t.akmSoFar) {
    poinPerbaikanTahunan.push(`🎯 Sisa target tahunan ${fmtNum(t.targetTahunan - t.akmSoFar)} botol. Maksimalkan sisa periode dengan penetrasi rute rumah tangga.`);
  } else {
    poinPerbaikanTahunan.push(`📊 Pertahankan standar kualitas kerja tinggi untuk menyongsong target tahun baru yang lebih menantang.`);
  }

  if (binaanCount > 0) {
    poinPerbaikanTahunan.push(`📘 Terdapat ${binaanCount} YL di level binaan (<250 btl). Perlu coaching berkala dan pendampingan lapangan berkelanjutan.`);
  } else {
    poinPerbaikanTahunan.push(`🔄 Terus kawal ketat kesegaran produk (Zero BB) dan minimalisir absensi agar rute pelanggan tetap prima.`);
  }

  const slideAnalisaTahunan: SlideDef = {
    eyebrow: `Analisa Data Capaian — Tahun ${tahun}`,
    title: `Analisa Data Performa Tim Ibu-Ibu Yakult Lady (Tahun ${tahun})`,
    speakerNotes: `Sampaikan apresiasi setinggi-tingginya kepada seluruh Ibu-Ibu Yakult Lady atas dedikasi tanpa lelah sepanjang tahun ${tahun}, evaluasi pencapaian strategis, dan bangun kebersamaan menyongsong masa depan.`,
    node: (
      <SlideAnalisaPerformaNode
        periodeLabel={`Tahun ${tahun}`}
        ylCount={thYl.rows.length || 10}
        top3Baik={poinBaikTahunan.slice(0, 3)}
        plusList={plusListTahunan}
        top2Perbaikan={poinPerbaikanTahunan.slice(0, 2)}
        minusList={minusListTahunan}
        fallbackBaikText={`Rata-rata tahunan tim ${fmtNum(thYl.teamOverallAvg)} btl/hari — kerja keras dan dedikasi luar biasa sepanjang tahun!`}
      />
    ),
  };

  const slideApresiasiTahunan: SlideDef = buildApresiasiPerformaSlide({
    periodeLabel: `Tahun ${tahun}`,
    headerStat: {
      label: "Rata-Rata Tim Keseluruhan",
      value: `${fmtNum(thYl.teamOverallAvg)} btl/hr`,
    },
    winnerRata2: winnerRata2Tahunan ? {
      nama: winnerRata2Tahunan.nama,
      area: winnerRata2Tahunan.area,
      valueLabel: `${fmtNum(winnerRata2Tahunan.rataRata)} btl/hr`,
    } : null,
    winnerKenaikan: winnerDeltaTahunan ? {
      nama: winnerDeltaTahunan.nama,
      area: winnerDeltaTahunan.area,
      valueLabel: `${winnerDeltaTahunan.delta > 0 ? "+" : ""}${fmtNum(winnerDeltaTahunan.delta)} btl (awal→akhir tahun)`,
    } : null,
    kenaikanLabel: "Peningkatan Tertinggi Tahun Ini",
    sampah,
    onSampahChange,
  });

  return [
    buildCoverSlide({
      eyebrow: "Laporan Tahunan",
      title: `Tinjauan Tahunan ${tahun}`,
      coverFoto,
      fallbackNode: <SlideTitle sub="">{String(tahun)}</SlideTitle>,
    }),
    {
      eyebrow: "Pencapaian YoY",
      title: "Realisasi vs Target Tahunan",
      node: (
        <div>
          <BigStat label="Estimasi Hasil Tahunan" value={`${fmtNum(t.estimasiTahunan)} btl`} sub={`Realisasi s/d saat ini: ${fmtNum(t.akmSoFar)} btl`} />
          <div className="grid grid-cols-2 gap-4 mt-6">
            <BigStat label="Target Tahunan" value={`${fmtNum(t.targetTahunan)} btl`} />
            <BigStat label="Pencapaian" value={t.capaianTahunan !== null ? `${fmtPct(t.capaianTahunan)}%` : "-"} pct={t.capaianTahunan} />
          </div>
        </div>
      ),
    },
    {
      eyebrow: "Growth YoY",
      title: "Pertumbuhan Tahunan",
      node: (
        <div className="w-full max-w-6xl mx-auto">
          <BigStat
            label="Pertumbuhan vs Tahun Lalu"
            value={t.growthPct !== null ? `${t.growthPct >= 0 ? "+" : ""}${fmtPct(t.growthPct)}%` : "-"}
            sub="Rata-rata dari bulan-bulan terisi"
          />
          <div className="mt-4">
            <TrendPenjualanChart data={t.trend} storageKey={`presentasi_chart_trend_tahunan_${tahun}`} heightClass="h-52 sm:h-60 md:h-72" />
          </div>
        </div>
      ),
    },
    {
      eyebrow: "Rata-Rata Tahunan YL",
      title: `Rekap Rata-Rata per YL Tahun ${tahun}`,
      node: (
        <div className="w-full max-w-6xl mx-auto">
          <TabelRataRataYL
            perYL={perYL}
            startIdx={0}
            endIdx={t.monthsData.length > 0 ? t.monthsData[t.monthsData.length - 1].idx : 11}
            isDarkSlide={true}
          />
        </div>
      ),
    },
    {
      eyebrow: "Evaluasi Mix Produk",
      title: `Mix Produk Tahunan ${tahun}`,
      node: (
        <div className="w-full max-w-4xl mx-auto">
          <AnalisisMixProductCard
            months={t.monthsData.map((x) => x.m)}
            isDarkSlide={true}
          />
        </div>
      ),
    },
    slideApresiasiTahunan,
    {
      eyebrow: "Uji Kelayakan Beban",
      title: `Uji Kelayakan Target Tahunan ${tahun}`,
      node: (
        <div className="w-full max-w-4xl mx-auto">
          <UjiKelayakanBebanCard
            targetSisa={Math.max(0, t.targetTahunan - t.akmSoFar)}
            monthsRemaining={Math.max(1, 12 - t.count)}
            currentAvgYL={average(t.monthsData.map((x) => x.m.salesPerYL || x.m.ratarataPenjualanYL)) || undefined}
            isDarkSlide={true}
          />
        </div>
      ),
    },
    {
      eyebrow: "Cakupan Final",
      title: "Cakupan Area",
      node: (
        <BigStat
          label="% Area Tercover (Terakhir)"
          value={t.areaTercoverFinal !== null ? `${fmtPct(t.areaTercoverFinal, 0)}%` : "-"}
          pct={t.areaTercoverFinal}
        />
      ),
    },
    slideAnalisaTahunan,
    {
      eyebrow: "Kesimpulan Akhir",
      title: "Rangkuman Eksekutif",
      node: <p className="text-sm sm:text-base text-slate-300 text-center leading-relaxed">{t.kesimpulan}</p>,
    },
  ];
}