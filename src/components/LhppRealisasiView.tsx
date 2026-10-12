import { ClipboardFallbackModal } from "./ClipboardFallbackModal";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MotivasiConfig, cleanYlName } from "../types";
import { useSimpleGrid } from "./useSimpleGrid";
import { GridSelectionToolbar } from "./GridSelectionToolbar";
import { SpreadsheetInputBar } from "./SpreadsheetInputBar";
import { NumberInput } from "./NumberInput";
import { safeFetchJson } from "../lib/safeFetch";
import { FileSpreadsheet, Calendar, ShieldCheck, Save, Loader2, RefreshCw, Trash2, Zap, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";

export interface LhppRow {
  area: string;
  nama: string;
  pdmSebelum: { yo: number; om: number; os: number; yt: number };
  isManualPdmSebelum?: boolean;
  bb: { yo: number; om: number; os: number; yt: number };
  setoran: { setor: number; bank1?: number; bank2?: number };
  pdmHariIni: { yo: number; om: number; os: number; yt: number };
}

export interface LhppYlmSummary {
  pdmYlm: { yo: number; om: number; os: number; yt: number };
  sisaYlm?: { yo: number; om: number; os: number; yt: number };
  botolRusak?: number;
}

interface LhppRealisasiViewProps {
  ylList: Array<{ area: string; nama: string; status?: string }>;
  selectedMonth?: string; // e.g. "2026-07"
  breakdownPlanMap?: Record<string, { days: Record<string, { yo: number; om: number; os: number; yt: number }> }>;
  breakdownRealisasiMap?: Record<string, { days: Record<string, { yo: number; om: number; os: number; yt: number }> }>;
  onSaveLhpp?: (data: { date: string; rows: LhppRow[]; summary: LhppYlmSummary }) => Promise<void>;
  motivasiConfig?: MotivasiConfig;
  theme?: "light" | "dark";
}

const parseInputInt = (val: string | number): number => {
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
  const cleaned = strVal.replace(/^-?0+(?=\d)/, strVal.startsWith("-") ? "-" : "");
  const num = parseInt(cleaned.replace(/[^0-9-]/g, ""), 10);
  return isNaN(num) ? 0 : num;
};

interface LhppLocalDraft {
  rows: LhppRow[];
  summary: LhppYlmSummary;
  savedAt?: string;
}

const getLhppDraftKey = (scope: string, month: string, day: number) =>
  `lhppPdmDraft:v1:${scope}:${month}:${String(day).padStart(2, "0")}`;

const getLhppDraftActiveDayKey = (scope: string, month: string) =>
  `lhppPdmDraftActiveDay:v1:${scope}:${month}`;

const readLhppLocalDraft = (scope: string, month: string, day: number): LhppLocalDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getLhppDraftKey(scope, month, day));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.rows) || !parsed?.summary?.pdmYlm) return null;
    return parsed as LhppLocalDraft;
  } catch {
    return null;
  }
};

const getInitialLhppDay = (scope: string, month: string): number => {
  const today = new Date().getDate();
  const fallback = today >= 1 && today <= 31 ? today : 1;
  if (typeof window === "undefined") return fallback;
  try {
    const rememberedDay = Number(window.localStorage.getItem(getLhppDraftActiveDayKey(scope, month)));
    if (rememberedDay >= 1 && rememberedDay <= 31 && readLhppLocalDraft(scope, month, rememberedDay)) {
      return rememberedDay;
    }
  } catch {
    // If browser storage is unavailable, keep the normal current-day default.
  }
  return fallback;
};

const clearLhppLocalDraft = (scope: string, month: string, day: number) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getLhppDraftKey(scope, month, day));
    const activeDayKey = getLhppDraftActiveDayKey(scope, month);
    if (window.localStorage.getItem(activeDayKey) === String(day)) {
      window.localStorage.removeItem(activeDayKey);
    }
  } catch (err) {
    console.warn("Tidak dapat menghapus draf lokal LHPP:", err);
  }
};

function LhppRealisasiViewInner({
  ylList,
  selectedMonth = "2026-07",
  onSaveLhpp,
}: LhppRealisasiViewProps) {
  const draftScope = onSaveLhpp ? "live" : "archive";
  // 1. Tanggal berjalan: Default = Tanggal Hari Ini (device / server time)
  const [selectedDay, setSelectedDay] = useState<number>(() => getInitialLhppDay(draftScope, selectedMonth));

  const [rows, setRows] = useState<LhppRow[]>([]);
  const [summary, setSummary] = useState<LhppYlmSummary>({
    pdmYlm: { yo: 0, om: 0, os: 0, yt: 0 },
    sisaYlm: { yo: 0, om: 0, os: 0, yt: 0 },
    botolRusak: 0
  });
  const [msg, setMsg] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [prevSourceDate, setPrevSourceDate] = useState<string | null>(null);
  const [showQuickInput] = useState<boolean>(true);
  const [hasUnsaved, setHasUnsaved] = useState<boolean>(false);
  const [selectedYlIndex, setSelectedYlIndex] = useState<number>(0);
  const prevPdmMapRef = useRef<Record<string, { yo: number; om: number; os: number; yt: number }>>({});
  const loadedDateRef = useRef({ month: selectedMonth, day: selectedDay });

  // Fetch data from server when date or month changes
  const loadDataFromServer = useCallback(async (month: string, day: number) => {
    const localDraft = readLhppLocalDraft(draftScope, month, day);
    loadedDateRef.current = { month, day };
    if (localDraft) {
      setRows(localDraft.rows);
      setSummary(localDraft.summary);
      isDirtyRef.current = true;
      setHasUnsaved(true);
    }
    setIsLoading(true);
    try {
      const res = await safeFetchJson<any>(`/api/getLhppPdm?month=${month}&day=${day}`);
      if (res && res.ok) {
        const summaryData: LhppYlmSummary = {
          pdmYlm: res.pdmYlm || { yo: 0, om: 0, os: 0, yt: 0 },
          sisaYlm: { yo: 0, om: 0, os: 0, yt: 0 },
          botolRusak: 0
        };

        const activeYls = (ylList || []).filter((y: any) => y.status !== "Resign" && y.area !== "TKU");
        const rowsData = res.rowsData || {};
        const prevPdmMap = res.prevPdmMap || {};
        prevPdmMapRef.current = prevPdmMap;
        setPrevSourceDate(res.prevSourceDate || null);

        const newRows: LhppRow[] = activeYls.map((yl: any) => {
          const cleanName = cleanYlName(yl.nama || "");
          const savedYlData = rowsData[yl.area] || rowsData[cleanName] || rowsData[yl.nama] || null;

          const prevPdm = prevPdmMap[yl.area] || prevPdmMap[cleanName] || prevPdmMap[yl.nama] || { yo: 0, om: 0, os: 0, yt: 0 };
          const isManual = !!savedYlData?.isManualPdmSebelum;

          // PDM Sebelum: Jika user manual mengedit, hormati input manualnya.
          // Jika tidak manual dan ada sumber tanggal kemarin (res.prevSourceDate), selalu gunakan prevPdm agar sinkron!
          let finalPdmSebelum = { yo: 0, om: 0, os: 0, yt: 0 };
          if (isManual && savedYlData?.pdmSebelum) {
            finalPdmSebelum = { ...savedYlData.pdmSebelum };
          } else if (res.prevSourceDate) {
            finalPdmSebelum = { ...prevPdm };
          } else if (savedYlData?.pdmSebelum) {
            finalPdmSebelum = { ...savedYlData.pdmSebelum };
          }

          return {
            area: yl.area,
            nama: yl.nama,
            pdmSebelum: finalPdmSebelum,
            isManualPdmSebelum: isManual,
            bb: savedYlData?.bb ? { ...savedYlData.bb } : { yo: 0, om: 0, os: 0, yt: 0 },
            setoran: { setor: 0, bank1: 0, bank2: 0 },
            pdmHariIni: savedYlData?.pdmHariIni ? { ...savedYlData.pdmHariIni } : { yo: 0, om: 0, os: 0, yt: 0 }
          };
        });

        const draftRowsByArea = new Map<string, LhppRow>(
          (localDraft?.rows || []).map((row): [string, LhppRow] => [String(row.area), row])
        );
        const restoredRows = newRows.map((serverRow) => {
          const draftRow = draftRowsByArea.get(String(serverRow.area));
          if (!draftRow) return serverRow;
          return {
            ...serverRow,
            pdmSebelum: draftRow.pdmSebelum
              ? { ...serverRow.pdmSebelum, ...draftRow.pdmSebelum }
              : serverRow.pdmSebelum,
            isManualPdmSebelum: draftRow.isManualPdmSebelum ?? serverRow.isManualPdmSebelum,
            bb: draftRow.bb ? { ...serverRow.bb, ...draftRow.bb } : serverRow.bb,
            setoran: draftRow.setoran ? { ...serverRow.setoran, ...draftRow.setoran } : serverRow.setoran,
            pdmHariIni: draftRow.pdmHariIni
              ? { ...serverRow.pdmHariIni, ...draftRow.pdmHariIni }
              : serverRow.pdmHariIni,
          };
        });

        setRows(restoredRows);
        setSummary(localDraft?.summary || summaryData);
        setUndoStack([]);
        setRedoStack([]);
        isDirtyRef.current = !!localDraft;
        setHasUnsaved(!!localDraft);
      }
    } catch (err) {
      console.error("Error loading LHPP data from server:", err);
    } finally {
      setIsLoading(false);
    }
  }, [draftScope, ylList]);

  // Handler to manually pull / refresh PDM Sebelumnya from last transaction date (cross-month supported)
  const handlePullPrevPdm = async () => {
    setIsLoading(true);
    try {
      const res = await safeFetchJson<any>(`/api/getLhppPdm?month=${selectedMonth}&day=${selectedDay}`);
      if (res && res.ok) {
        const pMap = res.prevPdmMap || {};
        prevPdmMapRef.current = pMap;
        setPrevSourceDate(res.prevSourceDate || null);

        recordHistory();
        setRows(prevRows => prevRows.map(r => {
          const cleanName = cleanYlName(r.nama || "");
          const prev = pMap[r.area] || pMap[cleanName] || pMap[r.nama] || { yo: 0, om: 0, os: 0, yt: 0 };
          return {
            ...r,
            pdmSebelum: { ...prev },
            isManualPdmSebelum: false
          };
        }));

        const srcLabel = res.prevSourceDate 
          ? res.prevSourceDate.split("-").reverse().join("-") 
          : "hari sebelumnya";
        setMsg(`✅ Berhasil menyelaraskan PDM Sebelumnya dari ${srcLabel}`);
        setTimeout(() => setMsg(""), 4000);
      }
    } catch (err) {
      console.error("Gagal menarik PDM Sebelumnya:", err);
      setMsg("❌ Gagal menarik data PDM Sebelumnya");
      setTimeout(() => setMsg(""), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    isDirtyRef.current = false; setHasUnsaved(false);
    loadDataFromServer(selectedMonth, selectedDay);

    const handleAppRefresh = () => {
      isDirtyRef.current = false; setHasUnsaved(false);
      loadDataFromServer(selectedMonth, selectedDay);
    };
    window.addEventListener("app_header_refresh", handleAppRefresh);
    return () => window.removeEventListener("app_header_refresh", handleAppRefresh);
  }, [selectedMonth, selectedDay, loadDataFromServer]);

  // Undo / Redo stacks for edits; the current draft is also persisted in browser storage.
  const [undoStack, setUndoStack] = useState<Array<{ rows: LhppRow[]; summary: LhppYlmSummary }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ rows: LhppRow[]; summary: LhppYlmSummary }>>([]);

  const isDirtyRef = useRef(false);
  const editVersionRef = useRef(0);

  useEffect(() => {
    if (!hasUnsaved || typeof window === "undefined") return;
    const { month, day } = loadedDateRef.current;
    try {
      window.localStorage.setItem(
        getLhppDraftKey(draftScope, month, day),
        JSON.stringify({ rows, summary, savedAt: new Date().toISOString() } satisfies LhppLocalDraft)
      );
      window.localStorage.setItem(getLhppDraftActiveDayKey(draftScope, month), String(day));
    } catch (err) {
      console.warn("Tidak dapat menyimpan draf LHPP di browser:", err);
    }
  }, [rows, summary, hasUnsaved, draftScope]);

  const recordHistory = useCallback(() => {
    isDirtyRef.current = true; setHasUnsaved(true);
    editVersionRef.current += 1;
    setUndoStack(u => [...u.slice(-19), JSON.parse(JSON.stringify({ rows, summary }))]);
    setRedoStack([]);
  }, [rows, summary]);

  const handlePdmYlmChange = (field: "yo" | "om" | "os" | "yt", val: number) => {
    recordHistory();
    setSummary(s => ({ ...s, pdmYlm: { ...s.pdmYlm, [field]: val } }));
  };

  const handleCellChange = (
    rIdx: number,
    section: "pdmSebelum" | "bb" | "pdmHariIni",
    field: "yo" | "om" | "os" | "yt",
    val: number
  ) => {
    recordHistory();
    const cleanVal = parseInputInt(val);
    setRows(prev => {
      const next = [...prev];
      const targetRow = { ...next[rIdx] };
      if (section === "pdmSebelum") {
        targetRow.pdmSebelum = {
          ...targetRow.pdmSebelum,
          [field]: cleanVal
        };
        targetRow.isManualPdmSebelum = true;
      } else if (section === "bb" || section === "pdmHariIni") {
        targetRow[section] = {
          ...targetRow[section],
          [field]: cleanVal
        };
      }
      next[rIdx] = targetRow;
      return next;
    });
  };

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(u => u.slice(0, u.length - 1));
    setRedoStack(r => [...r, JSON.parse(JSON.stringify({ rows, summary }))]);
    setRows(JSON.parse(JSON.stringify(last.rows)));
    setSummary(JSON.parse(JSON.stringify(last.summary)));
    setMsg("↩️ Undone edit terakhir!");
    setTimeout(() => setMsg(""), 2000);
  }, [undoStack, rows, summary]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(r => r.slice(0, r.length - 1));
    setUndoStack(u => [...u, JSON.parse(JSON.stringify({ rows, summary }))]);
    setRows(JSON.parse(JSON.stringify(next.rows)));
    setSummary(JSON.parse(JSON.stringify(next.summary)));
    setMsg("↪️ Redone edit!");
    setTimeout(() => setMsg(""), 2000);
  }, [redoStack, rows, summary]);

  // Calculations for each row
  const computedRows = useMemo(() => {
    return rows.map(r => {
      const terjual = {
        yo: Math.max(0, r.pdmSebelum.yo - r.bb.yo),
        om: Math.max(0, r.pdmSebelum.om - r.bb.om),
        os: Math.max(0, r.pdmSebelum.os - r.bb.os),
        yt: Math.max(0, r.pdmSebelum.yt - r.bb.yt)
      };

      const totalSetoran = (terjual.yo * 2040) + (terjual.om * 2130) + (terjual.os * 2130) + (terjual.yt * 2460);

      const turun = {
        yo: Math.max(0, r.pdmHariIni.yo - r.bb.yo),
        om: Math.max(0, r.pdmHariIni.om - r.bb.om),
        os: Math.max(0, r.pdmHariIni.os - r.bb.os),
        yt: Math.max(0, r.pdmHariIni.yt - r.bb.yt)
      };

      return {
        ...r,
        terjual,
        totalSetoran,
        turun
      };
    });
  }, [rows]);

  // Main Table Column Totals
  const totals = useMemo(() => {
    const init = {
      pdmSebelum: { yo: 0, om: 0, os: 0, yt: 0, sum: 0 },
      bb: { yo: 0, om: 0, os: 0, yt: 0, sum: 0 },
      terjual: { yo: 0, om: 0, os: 0, yt: 0, sum: 0 },
      setoran: { setor: 0, sum: 0 },
      pdmHariIni: { yo: 0, om: 0, os: 0, yt: 0, sum: 0 },
      turun: { yo: 0, om: 0, os: 0, yt: 0, sum: 0 }
    };

    computedRows.forEach(r => {
      init.pdmSebelum.yo += r.pdmSebelum.yo;
      init.pdmSebelum.om += r.pdmSebelum.om;
      init.pdmSebelum.os += r.pdmSebelum.os;
      init.pdmSebelum.yt += r.pdmSebelum.yt;

      init.bb.yo += r.bb.yo;
      init.bb.om += r.bb.om;
      init.bb.os += r.bb.os;
      init.bb.yt += r.bb.yt;

      init.terjual.yo += r.terjual.yo;
      init.terjual.om += r.terjual.om;
      init.terjual.os += r.terjual.os;
      init.terjual.yt += r.terjual.yt;

      init.setoran.setor += r.totalSetoran;

      init.pdmHariIni.yo += r.pdmHariIni.yo;
      init.pdmHariIni.om += r.pdmHariIni.om;
      init.pdmHariIni.os += r.pdmHariIni.os;
      init.pdmHariIni.yt += r.pdmHariIni.yt;

      init.turun.yo += r.turun.yo;
      init.turun.om += r.turun.om;
      init.turun.os += r.turun.os;
      init.turun.yt += r.turun.yt;
    });

    init.pdmSebelum.sum = init.pdmSebelum.yo + init.pdmSebelum.om + init.pdmSebelum.os + init.pdmSebelum.yt;
    init.bb.sum = init.bb.yo + init.bb.om + init.bb.os + init.bb.yt;
    init.terjual.sum = init.terjual.yo + init.terjual.om + init.terjual.os + init.terjual.yt;
    init.setoran.sum = init.setoran.setor;
    init.pdmHariIni.sum = init.pdmHariIni.yo + init.pdmHariIni.om + init.pdmHariIni.os + init.pdmHariIni.yt;
    init.turun.sum = init.turun.yo + init.turun.om + init.turun.os + init.turun.yt;

    return init;
  }, [computedRows]);

  // SISA YLM Calculations: PDM YLM - Total Turun
  const sisaYlm = useMemo(() => {
    const yo = summary.pdmYlm.yo - totals.turun.yo;
    const om = summary.pdmYlm.om - totals.turun.om;
    const os = summary.pdmYlm.os - totals.turun.os;
    const yt = summary.pdmYlm.yt - totals.turun.yt;
    const total = yo + om + os + yt;
    return { yo, om, os, yt, total };
  }, [summary.pdmYlm, totals.turun]);

  // Save Handler: only an explicit user confirmation sends the draft to the server and Realisasi.
  const handleSaveLhpp = async () => {
    if (isSaving) return;
    if (!window.confirm(`Simpan data LHPP tanggal ${selectedDay} (${selectedMonth}) ke server dan Realisasi?`)) return;
    const editVersionAtSave = editVersionRef.current;
    setIsSaving(true);
    setMsg("⏳ Menyimpan data LHPP & memperbarui Realisasi...");

    try {
      const formattedDate = `${selectedMonth}-${String(selectedDay).padStart(2, "0")}`;
      const payload = {
        month: selectedMonth,
        day: selectedDay,
        tanggal: formattedDate,
        summary,
        rows: computedRows.map(r => ({
          area: r.area,
          nama: r.nama,
          pdmSebelum: r.pdmSebelum,
          isManualPdmSebelum: !!r.isManualPdmSebelum,
          bb: r.bb,
          pdmHariIni: r.pdmHariIni,
          terjual: r.terjual
        }))
      };

      const res = await safeFetchJson<{ ok: boolean; message?: string; error?: string }>("/api/saveLhppPdm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res && res.ok) {
        // Hanya bersihkan penanda 'belum tersimpan' kalau tidak ada edit baru selama request berjalan
        if (editVersionRef.current === editVersionAtSave) {
          isDirtyRef.current = false;
          setHasUnsaved(false);
          clearLhppLocalDraft(draftScope, selectedMonth, selectedDay);
        }
        setMsg("✅ Data LHPP tersimpan & tersambung ke Realisasi");
        setTimeout(() => setMsg(""), 4000);
        window.dispatchEvent(new Event("lhpp_saved"));
      } else {
        setMsg(`⚠️ ${res?.error || "Gagal menyimpan data LHPP ke server."}`);
      }
    } catch (err: any) {
      console.error("Failed to save LHPP:", err);
      setMsg("❌ Gagal menyimpan data LHPP. Periksa koneksi jaringan.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDayChange = async (newDay: number) => {
    if (isLoading || isSaving) return;
    if (newDay === selectedDay) return;
    // Draf tiap tanggal sudah disimpan di browser; pindah tanggal tidak membuangnya.
    setSelectedDay(newDay);
  };

  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  // Trigger Delete Modal
  const handleDeleteLhpp = () => {
    setShowDeleteModal(true);
  };

  // Execute Delete after in-app modal confirmation
  const executeDeleteLhpp = async () => {
    setShowDeleteModal(false);
    const formattedDate = `${selectedMonth}-${String(selectedDay).padStart(2, "0")}`;

    setIsDeleting(true);
    setMsg("⏳ Sedang menghapus data LHPP dan membersihkan transaksi...");

    try {
      const res = await safeFetchJson<{ ok: boolean; message?: string; error?: string }>("/api/deleteLhppPdm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          day: selectedDay,
          tanggal: formattedDate
        })
      });

      if (res && res.ok) {
        clearLhppLocalDraft(draftScope, selectedMonth, selectedDay);
        isDirtyRef.current = false; setHasUnsaved(false);
        setMsg(`✅ Data LHPP dan transaksi tanggal ${selectedDay} berhasil dihapus.`);
        await loadDataFromServer(selectedMonth, selectedDay);
        window.dispatchEvent(new Event("lhpp_saved"));
        window.dispatchEvent(new Event("bd_realisasi_updated"));
        setTimeout(() => setMsg(""), 4000);
      } else {
        setMsg(`⚠️ ${res?.error || "Gagal menghapus data LHPP."}`);
      }
    } catch (err: any) {
      console.error("Failed to delete LHPP:", err);
      setMsg("❌ Gagal menghapus data LHPP. Periksa koneksi jaringan.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Spreadsheet Grid Integration
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const isLhppCellEditable = useCallback((r: number, c: number) => {
    if (r >= computedRows.length) return false;
    if (computedRows[r]?.area === "TKU") return false;
    // c: 0..3 (PDM Sebelum) sekarang bisa diedit untuk penyesuaian manual/stok awal
    if (c >= 8 && c <= 11) return false; // Terjual read-only (formula)
    if (c === 12) return false; // Setoran read-only (formula)
    if (c >= 17 && c <= 20) return false; // Turun read-only (formula)
    return true;
  }, [computedRows]);

  const getLhppCellValue = useCallback((r: number, c: number) => {
    const row = computedRows[r];
    if (!row) return 0;
    if (c >= 0 && c <= 3) {
      const fields = ["yo", "om", "os", "yt"] as const;
      return row.pdmSebelum[fields[c]] || 0;
    }
    if (c >= 4 && c <= 7) {
      const fields = ["yo", "om", "os", "yt"] as const;
      return row.bb[fields[c - 4]] || 0;
    }
    if (c >= 8 && c <= 11) {
      const fields = ["yo", "om", "os", "yt"] as const;
      return row.terjual[fields[c - 8]] || 0;
    }
    if (c === 12) {
      return row.totalSetoran || 0;
    }
    if (c >= 13 && c <= 16) {
      const fields = ["yo", "om", "os", "yt"] as const;
      return row.pdmHariIni[fields[c - 13]] || 0;
    }
    if (c >= 17 && c <= 20) {
      const fields = ["yo", "om", "os", "yt"] as const;
      return row.turun[fields[c - 17]] || 0;
    }
    return 0;
  }, [computedRows]);

  const setLhppBatchCellValues = useCallback((updates: { r: number; c: number; val: number | string }[]) => {
    recordHistory();
    setRows(prevRows => {
      const nextRows = JSON.parse(JSON.stringify(prevRows));
      updates.forEach(({ r, c, val }) => {
        if (!isLhppCellEditable(r, c)) return;
        const numVal = parseInputInt(val);
        const row = nextRows[r];
        if (!row) return;

        if (c >= 0 && c <= 3) {
          const fields = ["yo", "om", "os", "yt"] as const;
          row.pdmSebelum[fields[c]] = numVal;
          row.isManualPdmSebelum = true;
        } else if (c >= 4 && c <= 7) {
          const fields = ["yo", "om", "os", "yt"] as const;
          row.bb[fields[c - 4]] = numVal;
        } else if (c >= 13 && c <= 16) {
          const fields = ["yo", "om", "os", "yt"] as const;
          row.pdmHariIni[fields[c - 13]] = numVal;
        }
      });
      return nextRows;
    });
  }, [isLhppCellEditable, recordHistory]);

  const {
    selection,
    setSelection,
    activeCell,
    setActiveCell,
    activeCellValue,
    isActiveCellEditable,
    handleActiveCellValueChange,
    goToNextCell,
    goToPrevCell,
    isMenuOpen,
    setIsMenuOpen,
    menuPos,
    getCellProps,
    renderSelectionHandle,
    selectColumn,
    selectRow,
    handleCopy,
    handleCut,
    handlePaste,
    handleClear,
    clipboardModal,
    confirmManualPaste,
    closeClipboardModal,
  } = useSimpleGrid({
    totalRows: computedRows.length,
    totalCols: 21,
    isCellEditable: isLhppCellEditable,
    getCellValue: getLhppCellValue,
    setCellValue: (r, c, val) => {
      setLhppBatchCellValues([{ r, c, val }]);
    },
    setBatchCellValues: setLhppBatchCellValues,
    onRecordUndo: recordHistory
  });

  // === Grid khusus tabel ringkasan PDM YLM & SISA YLM (kanan atas) ===
  // r=0 -> baris PDM YLM (bisa diedit), r=1 -> baris SISA YLM (hasil hitung, read-only)
  // c=0..3 -> YO/OM/OS/YT, c=4 -> TOTAL (read-only)
  const ylmFields = ["yo", "om", "os", "yt"] as const;

  const isYlmCellEditable = useCallback((r: number, c: number) => r === 0 && c < 4, []);

  const getYlmCellValue = useCallback(
    (r: number, c: number) => {
      if (c === 4) {
        return r === 0
          ? summary.pdmYlm.yo + summary.pdmYlm.om + summary.pdmYlm.os + summary.pdmYlm.yt
          : sisaYlm.total;
      }
      const field = ylmFields[c];
      return r === 0 ? summary.pdmYlm[field] : sisaYlm[field];
    },
    [summary.pdmYlm, sisaYlm]
  );

  const setYlmBatchCellValues = useCallback(
    (updates: { r: number; c: number; val: number | string }[]) => {
      recordHistory();
      setSummary((s) => {
        const nextYlm = { ...s.pdmYlm };
        updates.forEach(({ r, c, val }) => {
          if (r !== 0 || c >= 4) return;
          const numVal = typeof val === "number" ? val : parseInputInt(String(val));
          nextYlm[ylmFields[c]] = numVal;
        });
        return { ...s, pdmYlm: nextYlm };
      });
    },
    [recordHistory]
  );

  const {
    selection: ylmSelection,
    setSelection: setYlmSelection,
    activeCell: ylmActiveCell,
    setActiveCell: setYlmActiveCell,
    activeCellValue: ylmActiveCellValue,
    isActiveCellEditable: isYlmActiveCellEditable,
    handleActiveCellValueChange: handleYlmActiveCellValueChange,
    goToNextCell: goToNextYlmCell,
    goToPrevCell: goToPrevYlmCell,
    isMenuOpen: isYlmMenuOpen,
    setIsMenuOpen: setIsYlmMenuOpen,
    menuPos: ylmMenuPos,
    getCellProps: getYlmCellProps,
    renderSelectionHandle: renderYlmSelectionHandle,
    handleCopy: handleYlmCopy,
    handleCut: handleYlmCut,
    handlePaste: handleYlmPaste,
    handleClear: handleYlmClear,
    clipboardModal: ylmClipboardModal,
    confirmManualPaste: confirmYlmManualPaste,
    closeClipboardModal: closeYlmClipboardModal,
  } = useSimpleGrid({
    totalRows: 2,
    totalCols: 5,
    isCellEditable: isYlmCellEditable,
    getCellValue: getYlmCellValue,
    setCellValue: (r, c, val) => setYlmBatchCellValues([{ r, c, val }]),
    setBatchCellValues: setYlmBatchCellValues,
    onRecordUndo: recordHistory,
  });

  const getYlmCellLabel = useCallback((r: number, c: number) => {
    const rowName = r === 0 ? "PDM YLM" : "SISA YLM";
    const colName = c === 4 ? "TOTAL" : ["YO", "OM", "OS", "YT"][c];
    return `${rowName} • ${colName}`;
  }, []);

  // Pastikan hanya satu blok yang aktif dalam satu waktu: tabel utama vs tabel PDM/SISA YLM.
  // Menyentuh sel di tabel yang satu otomatis membatalkan blok di tabel yang lain.
  useEffect(() => {
    if (activeCell) {
      setYlmSelection(null);
      setYlmActiveCell(null);
      setIsYlmMenuOpen(false);
    }
  }, [activeCell]);

  useEffect(() => {
    if (ylmActiveCell) {
      setSelection(null);
      setActiveCell(null);
      setIsMenuOpen(false);
    }
  }, [ylmActiveCell]);

  const getLhppCellLabel = useCallback((r: number, c: number) => {
    const row = computedRows[r];
    const ylName = cleanYlName(row?.nama || `YL #${r + 1}`);
    const area = row?.area || "";
    const colNames: Record<number, string> = {
      0: "PDM SBLM • YO",
      1: "PDM SBLM • OM",
      2: "PDM SBLM • OS",
      3: "PDM SBLM • YT",
      4: "BB • YO (Btl)",
      5: "BB • OM (Btl)",
      6: "BB • OS (Btl)",
      7: "BB • YT (Btl)",
      8: "TERJUAL • YO",
      9: "TERJUAL • OM",
      10: "TERJUAL • OS",
      11: "TERJUAL • YT",
      12: "TOTAL SETORAN",
      13: "PDM HARI INI • YO",
      14: "PDM HARI INI • OM",
      15: "PDM HARI INI • OS",
      16: "PDM HARI INI • YT",
      17: "TURUN • YO",
      18: "TURUN • OM",
      19: "TURUN • OS",
      20: "TURUN • YT",
    };
    return `[${area}] ${ylName} • ${colNames[c] || `C${c}`}`;
  }, [computedRows]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (targetTag !== "input" && targetTag !== "textarea") {
          if (e.shiftKey) {
            e.preventDefault();
            handleRedo();
          } else {
            e.preventDefault();
            handleUndo();
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        if (targetTag !== "input" && targetTag !== "textarea") {
          e.preventDefault();
          handleRedo();
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (targetTag !== "input" && targetTag !== "textarea") {
          e.preventDefault();
          if (selection) handleClear();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (targetTag !== "input" && targetTag !== "textarea") {
          if (selection) {
             handleCopy();
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
          handlePaste(text);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [handleUndo, handleRedo, selection, handleCopy, handlePaste, handleClear]);

  const totalPdmYlm = summary.pdmYlm.yo + summary.pdmYlm.om + summary.pdmYlm.os + summary.pdmYlm.yt;

  // Copy Summary text for WhatsApp or Sheets
  const handleCopyText = () => {
    let t = `*LHPP & LPPBJ - REKAP REALISASI TANGGAL ${selectedDay} (${selectedMonth})*\n\n`;
    t += `*PDM YLM (KANTOR)*: ${totalPdmYlm} btl (YO:${summary.pdmYlm.yo}, OM:${summary.pdmYlm.om}, OS:${summary.pdmYlm.os}, YT:${summary.pdmYlm.yt})\n`;
    t += `*TOTAL TURUN PDM*: ${totals.turun.sum} btl\n`;
    t += `*SISA YLM (KEMBALI)*: ${sisaYlm.total} btl (YO:${sisaYlm.yo}, OM:${sisaYlm.om}, OS:${sisaYlm.os}, YT:${sisaYlm.yt})\n\n`;
    t += `*RINGKASAN TOTAL TIM*:\n`;
    t += `• Total PDM Sebelum : ${totals.pdmSebelum.sum} btl\n`;
    t += `• Total BB (Retur)  : ${totals.bb.sum} btl\n`;
    t += `• Total Terjual     : ${totals.terjual.sum} btl\n`;
    t += `• Total Setoran Rp  : Rp ${totals.setoran.sum.toLocaleString("id-ID")}\n`;
    t += `• Total PDM Hari Ini: ${totals.pdmHariIni.sum} btl\n`;
    t += `• Total Turun PDM   : ${totals.turun.sum} btl\n`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(t);
      setMsg("📋 Ringkasan LHPP & LPPBJ berhasil disalin ke clipboard!");
      setTimeout(() => setMsg(""), 3000);
    }
  };

  return (
    <div className="space-y-4 font-sans select-none">
      {/* Top Action Bar & Date Controls */}
      <div className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-2 sm:p-2.5 rounded-xl shadow-2xs border border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-300 border border-brand-300 dark:border-brand-700 rounded-lg shrink-0">
            <FileSpreadsheet className="w-4 h-4 text-brand-700 dark:text-brand-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xs sm:text-sm font-bold tracking-wide text-neutral-900 dark:text-neutral-100 uppercase flex flex-wrap items-center gap-1.5 leading-tight">
              <span>Penjualan</span>
              <span className="px-1.5 py-0.2 bg-brand-50 dark:bg-brand-900/50 text-brand-800 dark:text-brand-300 border border-brand-200 dark:border-brand-700 rounded text-[9px] font-bold uppercase whitespace-nowrap">Acuan Manager</span>
            </h2>
          </div>
        </div>

        {/* Date / Day Picker & Action Controls */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-neutral-100 dark:border-neutral-800 pt-1.5 sm:pt-0">
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <Calendar className="w-3 h-3 text-red-600 dark:text-red-400 mr-1 shrink-0" />
            <span className="text-[10px] font-bold text-neutral-700 dark:text-neutral-300 mr-1">TGL:</span>
            <select
              value={selectedDay}
              onChange={e => handleDayChange(Number(e.target.value))}
              disabled={isLoading || isSaving}
              className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-mono font-black text-[11px] px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 outline-none cursor-pointer shadow-2xs focus:border-emerald-500"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {msg && (
        <div className={`border font-bold text-xs px-3 py-2 rounded-xl text-center shadow-2xs animate-pulse ${
          msg.includes("❌") || msg.includes("⚠️") 
            ? "bg-rose-100 dark:bg-rose-900/50 border-rose-400 text-rose-900 dark:text-rose-300" 
            : "bg-emerald-100 dark:bg-emerald-900/50 border-emerald-400 text-emerald-900 dark:text-emerald-300"
        }`}>
          {msg}
        </div>
      )}

      {isLoading && (
        <div className="text-center py-2 text-xs font-bold text-neutral-500 dark:text-neutral-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400" />
          <span>Memuat data LHPP tanggal {selectedDay}...</span>
        </div>
      )}

      {/* Top Banner & Side Tables Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-stretch">
        {/* Left Side Header Banner Info */}
        <div className="lg:col-span-6 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase text-brand-800 dark:text-brand-200 tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 dark:text-brand-400 shrink-0" />
              <span>REKAP HARI KUNJUNG MANAGER & YL</span>
            </span>
            <span className="text-[10px] sm:text-[11px] font-mono font-black bg-brand-50 dark:bg-brand-950/40 text-brand-800 dark:text-brand-300 px-2.5 py-0.5 rounded-lg border border-brand-200 dark:border-brand-800 shadow-2xs whitespace-nowrap shrink-0 ml-2">
              Tgl {selectedDay} ({selectedMonth})
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center pt-0.5 [&>*]:min-w-0">
            <div className="bg-neutral-50 dark:bg-neutral-800/40 p-2 sm:p-2.5 rounded-lg sm:rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 block font-bold uppercase tracking-wider">TOTAL TERJUAL</span>
              <span className="text-base sm:text-lg font-black text-brand-700 dark:text-brand-300 font-mono my-0.5 sm:my-1">{totals.terjual.sum} <span className="text-[11px] sm:text-[12px] font-bold">btl</span></span>
              <div className="text-[11px] leading-4 font-mono font-extrabold text-neutral-700 dark:text-neutral-300 flex flex-wrap justify-center gap-x-2 gap-y-0 whitespace-nowrap mt-0.5 pt-0.5 sm:pt-1 border-t border-neutral-200 dark:border-neutral-800">
                <span className="text-rose-600 dark:text-rose-400">YO:{totals.terjual.yo}</span>
                <span className="text-amber-600 dark:text-amber-400">OM:{totals.terjual.om}</span>
                <span className="text-fuchsia-600 dark:text-fuchsia-400">OS:{totals.terjual.os}</span>
                <span className="text-sky-600 dark:text-sky-400">YT:{totals.terjual.yt}</span>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden bg-neutral-50 dark:bg-neutral-800/40 p-2 sm:p-2.5 rounded-lg sm:rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 block font-bold uppercase tracking-wider">TOTAL SETORAN</span>
              {(() => {
                const setoranTxt = totals.setoran.sum.toLocaleString("id-ID");
                // Ukuran huruf mengikuti LEBAR CARD (cqw) & jumlah digit, jadi tidak keluar card
                // baik di mode HP maupun mode desktop.
                const fs = Math.max(8, Math.min(16, Math.floor(88 / (Math.max(setoranTxt.length, 6) * 0.68) * 10) / 10));
                return (
                  <div className="my-auto min-w-0 w-full text-center" style={{ containerType: "inline-size" }}>
                    <span className="block text-[9px] sm:text-[10px] font-bold text-neutral-500 dark:text-neutral-400 leading-none mb-0.5">Rp</span>
                    <span
                      className="block max-w-full overflow-hidden leading-tight font-black text-brand-700 dark:text-brand-300 font-mono whitespace-nowrap tabular-nums"
                      style={{ fontSize: `clamp(8px, ${fs}cqw, 16px)` }}
                    >
                      {setoranTxt}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-800/40 p-2 sm:p-2.5 rounded-lg sm:rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 block font-bold uppercase tracking-wider">PDM HARI INI</span>
              <span className="text-base sm:text-lg font-black text-brand-700 dark:text-brand-300 font-mono my-0.5 sm:my-1">{totals.pdmHariIni.sum} <span className="text-[11px] sm:text-[12px] font-bold">btl</span></span>
              <div className="text-[11px] leading-4 font-mono font-extrabold text-neutral-700 dark:text-neutral-300 flex flex-wrap justify-center gap-x-2 gap-y-0 whitespace-nowrap mt-0.5 pt-0.5 sm:pt-1 border-t border-neutral-200 dark:border-neutral-800">
                <span className="text-rose-600 dark:text-rose-400">YO:{totals.pdmHariIni.yo}</span>
                <span className="text-amber-600 dark:text-amber-400">OM:{totals.pdmHariIni.om}</span>
                <span className="text-fuchsia-600 dark:text-fuchsia-400">OS:{totals.pdmHariIni.os}</span>
                <span className="text-sky-600 dark:text-sky-400">YT:{totals.pdmHariIni.yt}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side Summary Table (PDM YLM & SISA YLM) */}
        <div className="lg:col-span-6 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col justify-center relative">
          <GridSelectionToolbar
            selection={ylmSelection}
            isMenuOpen={isYlmMenuOpen}
            menuPos={ylmMenuPos}
            onCopy={handleYlmCopy}
            onCut={handleYlmCut}
            onPaste={handleYlmPaste}
            onClear={handleYlmClear}
            onClose={() => setIsYlmMenuOpen(false)}
          />
          <SpreadsheetInputBar
            activeCell={ylmActiveCell}
            cellLabel={ylmActiveCell ? getYlmCellLabel(ylmActiveCell.r, ylmActiveCell.c) : undefined}
            value={ylmActiveCellValue}
            isEditable={isYlmActiveCellEditable}
            onChange={handleYlmActiveCellValueChange}
            onPrev={goToPrevYlmCell}
            onNext={goToNextYlmCell}
            onDone={() => setYlmActiveCell(null)}
          />
          {ylmClipboardModal && (
            <ClipboardFallbackModal
              mode={ylmClipboardModal.mode}
              initialText={ylmClipboardModal.text}
              onConfirmPaste={confirmYlmManualPaste}
              onClose={closeYlmClipboardModal}
            />
          )}
          <div data-grid-container="true" className="overflow-x-auto rounded-lg sm:rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs">
            <table className="w-full text-center text-[11px] font-mono border-collapse select-none">
              <thead>
                <tr className="bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold text-[10px] uppercase border-b border-neutral-200 dark:border-neutral-800">
                  <th className="p-2 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-left px-3">TGL</th>
                  <th className="p-2 border-r border-neutral-200 dark:border-neutral-800 text-center font-bold text-xs text-cyan-700 dark:text-cyan-300" colSpan={2}>
                    {selectedDay}
                  </th>
                  <th className="p-2 border-r border-neutral-200 dark:border-neutral-800 text-red-600 dark:text-red-400 font-bold">YO</th>
                  <th className="p-2 border-r border-neutral-200 dark:border-neutral-800 text-amber-500 dark:text-amber-400 font-bold">OM</th>
                  <th className="p-2 border-r border-neutral-200 dark:border-neutral-800 text-pink-600 dark:text-pink-400 font-bold">OS</th>
                  <th className="p-2 border-r border-neutral-200 dark:border-neutral-800 text-blue-600 dark:text-blue-400 font-bold">YT</th>
                  <th className="p-2 text-emerald-800 dark:text-emerald-300 font-bold">TOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 font-bold bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
                {/* PDM YLM Row (r=0, bisa diedit) */}
                <tr className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
                  <td className="p-2 font-bold text-left bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-3 border-r border-neutral-200 dark:border-neutral-800" colSpan={3}>
                    PDM YLM
                  </td>
                  {ylmFields.map((field, c) => (
                    <td
                      key={field}
                      {...getYlmCellProps(0, c)}
                      className={`p-2 font-bold bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 border-r border-neutral-200 dark:border-neutral-800 ${getYlmCellProps(0, c).className}`}
                    >
                      {summary.pdmYlm[field]}
                      {renderYlmSelectionHandle(0, c)}
                    </td>
                  ))}
                  <td
                    {...getYlmCellProps(0, 4)}
                    className={`p-2 font-bold bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 ${getYlmCellProps(0, 4).className}`}
                  >
                    {totalPdmYlm}
                    {renderYlmSelectionHandle(0, 4)}
                  </td>
                </tr>

                {/* SISA YLM Row (r=1, hasil hitung / read-only) */}
                <tr className="bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-bold">
                  <td className="p-2 text-left bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 border-r border-neutral-200 dark:border-neutral-800" colSpan={3}>
                    SISA YLM
                  </td>
                  {ylmFields.map((field, c) => (
                    <td
                      key={field}
                      {...getYlmCellProps(1, c)}
                      className={`p-2 bg-neutral-100 dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-800 ${sisaYlm[field] < 0 ? "text-rose-600 dark:text-rose-400 font-bold" : "text-neutral-900 dark:text-white"} ${getYlmCellProps(1, c).className}`}
                    >
                      {sisaYlm[field]}
                      {renderYlmSelectionHandle(1, c)}
                    </td>
                  ))}
                  <td
                    {...getYlmCellProps(1, 4)}
                    className={`p-2 bg-neutral-100 dark:bg-neutral-800 font-bold ${sisaYlm.total < 0 ? "text-rose-600 dark:text-rose-400" : "text-neutral-900 dark:text-white"} ${getYlmCellProps(1, 4).className}`}
                  >
                    {sisaYlm.total}
                    {renderYlmSelectionHandle(1, 4)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* QUICK INPUT PER-YL PANEL */}
      {showQuickInput && computedRows.length > 0 && (() => {
        const safeIdx = selectedYlIndex < computedRows.length ? selectedYlIndex : 0;
        const currentQuickYl = computedRows[safeIdx];
        if (!currentQuickYl) return null;

        const totPdmSblm = (currentQuickYl.pdmSebelum.yo || 0) + (currentQuickYl.pdmSebelum.om || 0) + (currentQuickYl.pdmSebelum.os || 0) + (currentQuickYl.pdmSebelum.yt || 0);
        const totBb = (currentQuickYl.bb.yo || 0) + (currentQuickYl.bb.om || 0) + (currentQuickYl.bb.os || 0) + (currentQuickYl.bb.yt || 0);
        const totTerjual = (currentQuickYl.terjual.yo || 0) + (currentQuickYl.terjual.om || 0) + (currentQuickYl.terjual.os || 0) + (currentQuickYl.terjual.yt || 0);
        const totSetoran = currentQuickYl.totalSetoran || 0;
        const totPdmHariIni = (currentQuickYl.pdmHariIni.yo || 0) + (currentQuickYl.pdmHariIni.om || 0) + (currentQuickYl.pdmHariIni.os || 0) + (currentQuickYl.pdmHariIni.yt || 0);
        const totTurun = (currentQuickYl.turun.yo || 0) + (currentQuickYl.turun.om || 0) + (currentQuickYl.turun.os || 0) + (currentQuickYl.turun.yt || 0);

        return (
          <div className="bd-card p-2.5 sm:p-4 space-y-2.5">
            {/* Header Compact & YL Selector */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--line)]">
              <div className="flex items-center gap-1.5">
                <div className="p-1 bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-300 border border-brand-200 dark:border-brand-800 rounded-lg shadow-2xs">
                  <Zap className="w-4 h-4 fill-current" />
                </div>
                <h3 className="bd-title tracking-tight flex items-center gap-1.5">
                  <span>INPUT CEPAT YL</span>
                  <span className="text-[10px] font-mono font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-2 py-0.5 rounded-full border border-neutral-200 dark:border-neutral-700">
                    {safeIdx + 1}/{computedRows.length}
                  </span>
                </h3>
              </div>

              {/* YL Selector & Nav Buttons */}
              <div className="flex items-center gap-1 w-full sm:w-auto min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedYlIndex(prev => (prev > 0 ? prev - 1 : computedRows.length - 1))}
                  className="shrink-0 p-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:scale-95 text-neutral-700 dark:text-neutral-300 rounded-lg border border-neutral-300 dark:border-neutral-700 transition-all cursor-pointer"
                  title="YL Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <select
                  value={safeIdx}
                  onChange={(e) => setSelectedYlIndex(Number(e.target.value))}
                  className="bd-field flex-1 min-w-0 text-xs font-bold text-neutral-900 dark:text-white cursor-pointer truncate"
                >
                  {computedRows.map((r, idx) => (
                    <option key={idx} value={idx} className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono">
                      {cleanYlName(r.nama)} {r.area === "TKU" ? "(TKU)" : ""}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setSelectedYlIndex(prev => (prev < computedRows.length - 1 ? prev + 1 : 0))}
                  className="shrink-0 p-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:scale-95 text-neutral-700 dark:text-neutral-300 rounded-lg border border-neutral-300 dark:border-neutral-700 transition-all cursor-pointer"
                  title="YL Berikutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Horizontal Table for YO / OM / OS / YT / TOTAL */}
            <div className="bd-subcard overflow-hidden">
              <table className="w-full text-[10px] sm:text-xs text-center border-collapse table-fixed">
                <thead>
                  <tr className="bg-[var(--bg-inset)] text-[var(--ink)] font-bold uppercase border-b border-[var(--line)] text-[9px] sm:text-[11px]">
                    <th className="py-1.5 px-1 text-left w-[26%] sm:w-[20%] bg-[var(--bg-header)] text-[var(--ink)]">Keterangan</th>
                    <th className="py-1.5 px-0.5 text-neutral-700 dark:text-neutral-300 bg-[var(--bg-inset)] border-l border-[var(--line)] w-[14.8%] sm:w-[16%] font-bold">YO</th>
                    <th className="py-1.5 px-0.5 text-neutral-700 dark:text-neutral-300 bg-[var(--bg-inset)] border-l border-[var(--line)] w-[14.8%] sm:w-[16%] font-bold">OM</th>
                    <th className="py-1.5 px-0.5 text-neutral-700 dark:text-neutral-300 bg-[var(--bg-inset)] border-l border-[var(--line)] w-[14.8%] sm:w-[16%] font-bold">OS</th>
                    <th className="py-1.5 px-0.5 text-neutral-700 dark:text-neutral-300 bg-[var(--bg-inset)] border-l border-[var(--line)] w-[14.8%] sm:w-[16%] font-bold">YT</th>
                    <th className="py-1.5 px-0.5 text-neutral-700 dark:text-neutral-300 bg-[var(--bg-header)] border-l border-[var(--line)] w-[14.8%] sm:w-[16%] font-bold">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 font-mono font-bold text-neutral-800 dark:text-neutral-200">
                  {/* Row 1: PDM Sebelumnya */}
                  <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                    <td className="py-1.5 px-1 text-left font-sans font-bold text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/40 truncate">
                      <div className="flex items-center justify-between gap-1">
                        <span>1. PDM Sblm</span>
                        {currentQuickYl.isManualPdmSebelum && (
                          <span className="text-[8px] px-1 py-0.2 bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded font-mono font-bold">Manual</span>
                        )}
                      </div>
                    </td>
                    <td className="py-1 px-0.5 border-l border-neutral-200 dark:border-neutral-800">
                      <NumberInput
                        value={currentQuickYl.pdmSebelum.yo || 0}
                        onChange={(val) => handleCellChange(safeIdx, "pdmSebelum", "yo", val)}
                        className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono font-bold text-center py-0.5 rounded border border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-400 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-neutral-200 dark:border-neutral-800">
                      <NumberInput
                        value={currentQuickYl.pdmSebelum.om || 0}
                        onChange={(val) => handleCellChange(safeIdx, "pdmSebelum", "om", val)}
                        className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono font-bold text-center py-0.5 rounded border border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-400 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-neutral-200 dark:border-neutral-800">
                      <NumberInput
                        value={currentQuickYl.pdmSebelum.os || 0}
                        onChange={(val) => handleCellChange(safeIdx, "pdmSebelum", "os", val)}
                        className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono font-bold text-center py-0.5 rounded border border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-400 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-neutral-200 dark:border-neutral-800">
                      <NumberInput
                        value={currentQuickYl.pdmSebelum.yt || 0}
                        onChange={(val) => handleCellChange(safeIdx, "pdmSebelum", "yt", val)}
                        className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono font-bold text-center py-0.5 rounded border border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-400 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white bg-neutral-100/80 dark:bg-neutral-800/80 font-bold border-l border-neutral-300 dark:border-neutral-700">{totPdmSblm}</td>
                  </tr>

                  {/* Row 2: BB (Balik Botol / Kembali) */}
                    <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                    <td className="py-1.5 px-1 text-left font-sans font-bold text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/40 truncate">
                      2. BB (Kembali)
                    </td>
                    <td className="py-1 px-0.5 border-l border-neutral-200 dark:border-neutral-800">
                      <NumberInput
                        value={currentQuickYl.bb.yo || 0}
                        onChange={(val) => handleCellChange(safeIdx, "bb", "yo", val)}
                        className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono font-black text-center py-0.5 rounded border border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-400 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-neutral-200 dark:border-neutral-800">
                      <NumberInput
                        value={currentQuickYl.bb.om || 0}
                        onChange={(val) => handleCellChange(safeIdx, "bb", "om", val)}
                        className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono font-black text-center py-0.5 rounded border border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-400 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-neutral-200 dark:border-neutral-800">
                      <NumberInput
                        value={currentQuickYl.bb.os || 0}
                        onChange={(val) => handleCellChange(safeIdx, "bb", "os", val)}
                        className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono font-black text-center py-0.5 rounded border border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-400 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-neutral-200 dark:border-neutral-800">
                      <NumberInput
                        value={currentQuickYl.bb.yt || 0}
                        onChange={(val) => handleCellChange(safeIdx, "bb", "yt", val)}
                        className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono font-black text-center py-0.5 rounded border border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-400 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white bg-neutral-100/80 dark:bg-neutral-800/80 font-bold border-l border-neutral-300 dark:border-neutral-700">{totBb}</td>
                  </tr>

                  {/* Row 3: Terjual */}
                  <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                    <td className="py-1.5 px-1 text-left font-sans font-bold text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/40 truncate">3. Terjual (btl)</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white font-bold border-l border-neutral-200 dark:border-neutral-800">{currentQuickYl.terjual.yo || 0}</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white font-bold border-l border-neutral-200 dark:border-neutral-800">{currentQuickYl.terjual.om || 0}</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white font-bold border-l border-neutral-200 dark:border-neutral-800">{currentQuickYl.terjual.os || 0}</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white font-bold border-l border-neutral-200 dark:border-neutral-800">{currentQuickYl.terjual.yt || 0}</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white bg-neutral-100/80 dark:bg-neutral-800/80 font-bold border-l border-neutral-300 dark:border-neutral-700">{totTerjual}</td>
                  </tr>

                  {/* Row 4: Setoran */}
                  <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                    <td className="py-1.5 px-1 text-left font-sans font-bold text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/40 truncate">4. Setoran (Rp)</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white font-bold border-l border-neutral-200 dark:border-neutral-800">{((currentQuickYl.terjual.yo || 0) * 2040).toLocaleString("id-ID")}</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white font-bold border-l border-neutral-200 dark:border-neutral-800">{((currentQuickYl.terjual.om || 0) * 2130).toLocaleString("id-ID")}</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white font-bold border-l border-neutral-200 dark:border-neutral-800">{((currentQuickYl.terjual.os || 0) * 2130).toLocaleString("id-ID")}</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white font-bold border-l border-neutral-200 dark:border-neutral-800">{((currentQuickYl.terjual.yt || 0) * 2460).toLocaleString("id-ID")}</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white bg-neutral-100/80 dark:bg-neutral-800/80 font-bold border-l border-neutral-300 dark:border-neutral-700 text-[9px] sm:text-[11px] truncate">{totSetoran.toLocaleString("id-ID")}</td>
                  </tr>

                  {/* Row 5: PDM Hari Ini */}
                    <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                    <td className="py-1.5 px-1 text-left font-sans font-bold text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/40 truncate">
                      5. PDM Hari Ini
                    </td>
                    <td className="py-1 px-0.5 border-l border-neutral-200 dark:border-neutral-800">
                      <NumberInput
                        value={currentQuickYl.pdmHariIni.yo || 0}
                        onChange={(val) => handleCellChange(safeIdx, "pdmHariIni", "yo", val)}
                        className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono font-black text-center py-0.5 rounded border border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-400 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-neutral-200 dark:border-neutral-800">
                      <NumberInput
                        value={currentQuickYl.pdmHariIni.om || 0}
                        onChange={(val) => handleCellChange(safeIdx, "pdmHariIni", "om", val)}
                        className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono font-black text-center py-0.5 rounded border border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-400 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-neutral-200 dark:border-neutral-800">
                      <NumberInput
                        value={currentQuickYl.pdmHariIni.os || 0}
                        onChange={(val) => handleCellChange(safeIdx, "pdmHariIni", "os", val)}
                        className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono font-black text-center py-0.5 rounded border border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-400 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-neutral-200 dark:border-neutral-800">
                      <NumberInput
                        value={currentQuickYl.pdmHariIni.yt || 0}
                        onChange={(val) => handleCellChange(safeIdx, "pdmHariIni", "yt", val)}
                        className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono font-black text-center py-0.5 rounded border border-neutral-300 dark:border-neutral-700 focus:border-neutral-500 dark:focus:border-neutral-400 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white bg-neutral-100/80 dark:bg-neutral-800/80 font-bold border-l border-neutral-300 dark:border-neutral-700">{totPdmHariIni}</td>
                  </tr>

                  {/* Row 6: Turun Barang */}
                  <tr className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                    <td className="py-1.5 px-1 text-left font-sans font-bold text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/40 truncate">6. Turun Barang</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white font-bold border-l border-neutral-200 dark:border-neutral-800">{currentQuickYl.turun.yo || 0}</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white font-bold border-l border-neutral-200 dark:border-neutral-800">{currentQuickYl.turun.om || 0}</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white font-bold border-l border-neutral-200 dark:border-neutral-800">{currentQuickYl.turun.os || 0}</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white font-bold border-l border-neutral-200 dark:border-neutral-800">{currentQuickYl.turun.yt || 0}</td>
                    <td className="py-1.5 px-0.5 text-neutral-900 dark:text-white bg-neutral-100/80 dark:bg-neutral-800/80 font-bold border-l border-neutral-300 dark:border-neutral-700">{totTurun}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer Action */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[10px] text-neutral-400 italic">
                *Tersambung ke tabel LHPP. Tekan Simpan di bawah tabel untuk menyimpan
              </span>
              <button
                type="button"
                onClick={() => {
                  recordHistory();
                  if (safeIdx < computedRows.length - 1) {
                    setSelectedYlIndex(safeIdx + 1);
                  } else {
                    setSelectedYlIndex(0);
                  }
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-[11px] sm:text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <span>Lanjut YL</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* MAIN SPREADSHEET TABLE */}
      <div ref={gridContainerRef} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-md overflow-hidden relative">
        <GridSelectionToolbar
          selection={selection}
          isMenuOpen={isMenuOpen}
          menuPos={menuPos}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onClear={handleClear}
          onClose={() => {
            setIsMenuOpen(false);
          }}
        />
        <SpreadsheetInputBar
          activeCell={activeCell}
          cellLabel={activeCell ? getLhppCellLabel(activeCell.r, activeCell.c) : undefined}
          value={activeCellValue}
          isEditable={isActiveCellEditable}
          onChange={handleActiveCellValueChange}
          onPrev={goToPrevCell}
          onNext={goToNextCell}
          onDone={() => setActiveCell(null)}
        />
        {clipboardModal && (
          <ClipboardFallbackModal
            mode={clipboardModal.mode}
            initialText={clipboardModal.text}
            onConfirmPaste={confirmManualPaste}
            onClose={closeClipboardModal}
          />
        )}
        <div className="overflow-x-auto max-h-[680px]">
          <table className="w-full text-left text-[11px] sm:text-[12px] font-mono border-collapse select-none">
            {/* Header Level 1 */}
            <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 z-30 shadow-sm">
              <tr className="bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold uppercase text-[11px] sm:text-[12px] divide-x divide-neutral-200 dark:divide-neutral-800">
                <th className="p-2 sticky left-0 bg-neutral-50 dark:bg-neutral-800 z-40 min-w-[140px] max-w-[140px] text-left border-r border-neutral-200 dark:border-neutral-800 shadow-[1px_0_0_0_#e5e5e5]">
                  YAKULT LADY
                </th>
                <th
                  colSpan={4}
                  className="p-2 text-center bg-neutral-50 dark:bg-neutral-800/40 text-neutral-600 dark:text-neutral-400 border-r border-neutral-200 dark:border-neutral-800 transition-colors font-bold tracking-wide"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span
                      className="cursor-pointer hover:underline"
                      onClick={() => setSelection({ startR: 0, startC: 0, endR: Math.max(0, computedRows.length - 1), endC: 3 })}
                      title="Klik untuk memilih seluruh kolom PDM Sebelumnya"
                    >
                      PDM SEBELUMNYA
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handlePullPrevPdm(); }}
                      className="text-amber-700 dark:text-amber-300 hover:text-amber-900 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 p-0.5 rounded transition-all cursor-pointer inline-flex items-center gap-0.5 text-[10px] font-bold px-1"
                      title={`Ambil / Perbarui data PDM dari tanggal sebelumnya (termasuk lintas bulan saat awal bulan)${prevSourceDate ? ` [Sumber: ${prevSourceDate.split("-").reverse().join("-")}]` : ""}`}
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isLoading ? "animate-spin" : ""}`} />
                      <span className="hidden md:inline">Ambil</span>
                    </button>
                  </div>
                  {prevSourceDate && (
                    <div className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300 mt-0.5 normal-case">
                      sumber: {prevSourceDate.split("-").reverse().join("-")}
                    </div>
                  )}
                </th>
                <th
                  colSpan={4}
                  className="p-2 text-center bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-r border-neutral-200 dark:border-neutral-800 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors font-bold tracking-wide"
                  onClick={() => setSelection({ startR: 0, startC: 4, endR: Math.max(0, computedRows.length - 1), endC: 7 })}
                >
                  BB
                </th>
                <th
                  colSpan={4}
                  className="p-2 text-center bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-r border-neutral-200 dark:border-neutral-800 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors font-bold tracking-wide"
                  onClick={() => setSelection({ startR: 0, startC: 8, endR: Math.max(0, computedRows.length - 1), endC: 11 })}
                >
                  TERJUAL
                </th>
                <th
                  colSpan={1}
                  className="p-2 text-center bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-r border-neutral-200 dark:border-neutral-800 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors font-bold tracking-wide"
                  onClick={() => selectColumn(12)}
                >
                  SETORAN
                </th>
                <th
                  colSpan={4}
                  className="p-2 text-center bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-r border-neutral-200 dark:border-neutral-800 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors font-bold tracking-wide"
                  onClick={() => setSelection({ startR: 0, startC: 13, endR: Math.max(0, computedRows.length - 1), endC: 16 })}
                >
                  PDM HARI INI
                </th>
                <th
                  colSpan={4}
                  className="p-2 text-center bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors font-bold tracking-wide"
                  onClick={() => setSelection({ startR: 0, startC: 17, endR: Math.max(0, computedRows.length - 1), endC: 20 })}
                >
                  TURUN PDM
                </th>
              </tr>

              {/* Header Level 2 Sub-columns */}
              <tr className="bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold uppercase text-[10px] sm:text-[11px] border-t border-neutral-200 dark:border-neutral-800 divide-x divide-neutral-200 dark:divide-neutral-800">
                <th className="p-1 sticky left-0 bg-neutral-50 dark:bg-neutral-800 z-40 border-r border-neutral-200 dark:border-neutral-800 shadow-[1px_0_0_0_#e5e5e5]"></th>

                {[
                  { label: "YO", c: 0 }, { label: "OM", c: 1 }, { label: "OS", c: 2 }, { label: "YT", c: 3, borderRight: true },
                  { label: "YO", c: 4 }, { label: "OM", c: 5 }, { label: "OS", c: 6 }, { label: "YT", c: 7, borderRight: true },
                  { label: "YO", c: 8 }, { label: "OM", c: 9 }, { label: "OS", c: 10 }, { label: "YT", c: 11, borderRight: true },
                  { label: "SETORAN (RP)", c: 12, borderRight: true, minW: true },
                  { label: "YO", c: 13 }, { label: "OM", c: 14 }, { label: "OS", c: 15 }, { label: "YT", c: 16, borderRight: true },
                  { label: "YO", c: 17 }, { label: "OM", c: 18 }, { label: "OS", c: 19 }, { label: "YT", c: 20 }
                ].map((col) => {
                  const labelColor = "text-neutral-700 dark:text-neutral-300 font-bold";

                  return (
                    <th
                      key={col.c}
                      data-c={col.c}
                      className={`p-1 text-center bg-[var(--bg-inset)] ${labelColor} cursor-pointer hover:bg-[var(--bg-hover)] transition-colors select-none ${col.minW ? "min-w-[125px]" : "w-11"} ${col.borderRight ? "border-r border-[var(--line)]" : ""}`}
                      onClick={() => selectColumn(col.c)}
                    >
                      {col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 font-bold bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
              {computedRows.map((row, rIdx) => {
                const isTku = row.area === "TKU";
                return (
                  <tr
                    key={row.area + rIdx}
                    className={`hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                      isTku ? "bg-neutral-100 dark:bg-neutral-800 font-bold text-neutral-900 dark:text-neutral-100" : "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
                    }`}
                  >
                    {/* YAKULT LADY Column */}
                    <td
                      data-r={rIdx}
                      className="p-1.5 sticky left-0 bg-neutral-50 dark:bg-neutral-800 z-20 border-r border-neutral-200 dark:border-neutral-800 cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors select-none min-w-[140px] max-w-[140px] truncate shadow-[1px_0_0_0_#e5e5e5]"
                      onClick={() => selectRow(rIdx)}
                    >
                      <span className="font-bold text-neutral-900 dark:text-neutral-100 text-[11px] sm:text-[12px]">{cleanYlName(row.nama)}</span>
                    </td>
                    {/* PDM SEBELUMNYA (Auto / Read-Only dari PDM Hari Ini tanggal sebelumnya) */}
                    <td {...getCellProps(rIdx, 0)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-neutral-50/60 dark:bg-neutral-800/40 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 0).className}`}>
                      {row.pdmSebelum.yo}
                      {renderSelectionHandle(rIdx, 0)}
                    </td>
                    <td {...getCellProps(rIdx, 1)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-neutral-50/60 dark:bg-neutral-800/40 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 1).className}`}>
                      {row.pdmSebelum.om}
                      {renderSelectionHandle(rIdx, 1)}
                    </td>
                    <td {...getCellProps(rIdx, 2)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-neutral-50/60 dark:bg-neutral-800/40 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 2).className}`}>
                      {row.pdmSebelum.os}
                      {renderSelectionHandle(rIdx, 2)}
                    </td>
                    <td {...getCellProps(rIdx, 3)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-neutral-50/60 dark:bg-neutral-800/40 border-r-2 border-neutral-400 dark:border-neutral-600 ${getCellProps(rIdx, 3).className}`}>
                      {row.pdmSebelum.yt}
                      {renderSelectionHandle(rIdx, 3)}
                    </td>

                    {/* BB (Barang Bawaan) Inputs */}
                    <td {...getCellProps(rIdx, 4)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-neutral-50/60 dark:bg-neutral-800/40 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 4).className}`}>
                      <span className="font-mono font-black">{row.bb.yo || 0}</span>
                      {renderSelectionHandle(rIdx, 4)}
                    </td>
                    <td {...getCellProps(rIdx, 5)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-neutral-50/60 dark:bg-neutral-800/40 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 5).className}`}>
                      <span className="font-mono font-black">{row.bb.om || 0}</span>
                      {renderSelectionHandle(rIdx, 5)}
                    </td>
                    <td {...getCellProps(rIdx, 6)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-neutral-50/60 dark:bg-neutral-800/40 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 6).className}`}>
                      <span className="font-mono font-black">{row.bb.os || 0}</span>
                      {renderSelectionHandle(rIdx, 6)}
                    </td>
                    <td {...getCellProps(rIdx, 7)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-neutral-50/60 dark:bg-neutral-800/40 border-r-2 border-neutral-400 dark:border-neutral-600 ${getCellProps(rIdx, 7).className}`}>
                      <span className="font-mono font-black">{row.bb.yt || 0}</span>
                      {renderSelectionHandle(rIdx, 7)}
                    </td>

                    {/* TERJUAL (Auto Formula: PDM SEBELUMNYA - BB) */}
                    <td {...getCellProps(rIdx, 8)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 8).className}`}>
                      {row.terjual.yo}
                      {renderSelectionHandle(rIdx, 8)}
                    </td>
                    <td {...getCellProps(rIdx, 9)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 9).className}`}>
                      {row.terjual.om}
                      {renderSelectionHandle(rIdx, 9)}
                    </td>
                    <td {...getCellProps(rIdx, 10)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 10).className}`}>
                      {row.terjual.os}
                      {renderSelectionHandle(rIdx, 10)}
                    </td>
                    <td {...getCellProps(rIdx, 11)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-white dark:bg-neutral-900 border-r-2 border-neutral-400 dark:border-neutral-600 ${getCellProps(rIdx, 11).className}`}>
                      {row.terjual.yt}
                      {renderSelectionHandle(rIdx, 11)}
                    </td>

                    {/* SETORAN Column (Auto Formula: Terjual x Harga) */}
                    <td {...getCellProps(rIdx, 12)} className={`p-1.5 text-right font-bold text-neutral-900 dark:text-white bg-neutral-50/60 dark:bg-neutral-800/40 border-r-2 border-neutral-400 dark:border-neutral-600 font-mono ${getCellProps(rIdx, 12).className}`}>
                      Rp {row.totalSetoran.toLocaleString("id-ID")}
                      {renderSelectionHandle(rIdx, 12)}
                    </td>

                    {/* PDM HARI INI Inputs */}
                    <td {...getCellProps(rIdx, 13)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 13).className}`}>
                      <span className="font-mono font-black">{row.pdmHariIni.yo || 0}</span>
                      {renderSelectionHandle(rIdx, 13)}
                    </td>
                    <td {...getCellProps(rIdx, 14)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 14).className}`}>
                      <span className="font-mono font-black">{row.pdmHariIni.om || 0}</span>
                      {renderSelectionHandle(rIdx, 14)}
                    </td>
                    <td {...getCellProps(rIdx, 15)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 15).className}`}>
                      <span className="font-mono font-black">{row.pdmHariIni.os || 0}</span>
                      {renderSelectionHandle(rIdx, 15)}
                    </td>
                    <td {...getCellProps(rIdx, 16)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-white dark:bg-neutral-900 border-r-2 border-neutral-400 dark:border-neutral-600 ${getCellProps(rIdx, 16).className}`}>
                      <span className="font-mono font-black">{row.pdmHariIni.yt || 0}</span>
                      {renderSelectionHandle(rIdx, 16)}
                    </td>

                    {/* TURUN (Auto Formula: PDM HARI INI - BB) */}
                    <td {...getCellProps(rIdx, 17)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-neutral-50/60 dark:bg-neutral-800/40 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 17).className}`}>
                      {row.turun.yo}
                      {renderSelectionHandle(rIdx, 17)}
                    </td>
                    <td {...getCellProps(rIdx, 18)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-neutral-50/60 dark:bg-neutral-800/40 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 18).className}`}>
                      {row.turun.om}
                      {renderSelectionHandle(rIdx, 18)}
                    </td>
                    <td {...getCellProps(rIdx, 19)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-neutral-50/60 dark:bg-neutral-800/40 border-r border-neutral-200 dark:border-neutral-800 ${getCellProps(rIdx, 19).className}`}>
                      {row.turun.os}
                      {renderSelectionHandle(rIdx, 19)}
                    </td>
                    <td {...getCellProps(rIdx, 20)} className={`p-1.5 text-center text-neutral-900 dark:text-white font-bold bg-neutral-50/60 dark:bg-neutral-800/40 ${getCellProps(rIdx, 20).className}`}>
                      {row.turun.yt}
                      {renderSelectionHandle(rIdx, 20)}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Bottom Row Totals */}
            <tfoot className="bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold border-t-2 border-neutral-300 dark:border-neutral-700 shadow-[0_-1px_0_0_#d4d4d4]">
              {/* Row 1: Subtotal Item Totals */}
              <tr className="text-[11px] sm:text-[12px] divide-x divide-neutral-200 dark:divide-neutral-800">
                <td className="p-2.5 sticky left-0 bg-neutral-50 dark:bg-neutral-800 z-20 font-bold text-neutral-800 dark:text-neutral-200 text-left shadow-[1px_0_0_0_#e5e5e5]">
                  Subtotal
                </td>

                {/* PDM SEBELUM Total */}
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.pdmSebelum.yo}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.pdmSebelum.om}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.pdmSebelum.os}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold border-r border-neutral-300 dark:border-neutral-700">
                  {totals.pdmSebelum.yt}
                </td>

                {/* BB Total */}
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.bb.yo}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.bb.om}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.bb.os}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold border-r border-neutral-300 dark:border-neutral-700">
                  {totals.bb.yt}
                </td>

                {/* TERJUAL Total */}
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.terjual.yo}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.terjual.om}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.terjual.os}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold border-r border-neutral-300 dark:border-neutral-700">
                  {totals.terjual.yt}
                </td>

                {/* SETORAN Total */}
                <td className="p-2 text-right text-xs bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white font-black border-r border-neutral-300 dark:border-neutral-700 font-mono">
                  Rp {totals.setoran.setor.toLocaleString("id-ID")}
                </td>

                {/* PDM HARI INI Total */}
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.pdmHariIni.yo}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.pdmHariIni.om}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.pdmHariIni.os}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold border-r border-neutral-300 dark:border-neutral-700">
                  {totals.pdmHariIni.yt}
                </td>

                {/* TURUN Total */}
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.turun.yo}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.turun.om}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.turun.os}</td>
                <td className="p-2 text-center text-neutral-900 dark:text-white font-bold">{totals.turun.yt}</td>
              </tr>

              {/* Row 2: Grand Total Combined Bottle Sum */}
              <tr className="bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-bold text-xs uppercase divide-x divide-neutral-300 border-t border-neutral-200 dark:border-neutral-800">
                <td className="p-2.5 sticky left-0 bg-neutral-300 dark:bg-neutral-600 z-20 text-left font-bold tracking-wide text-neutral-900 dark:text-white shadow-[1px_0_0_0_#d4d4d4]">
                  Total Yo, Om, Os & Yt
                </td>

                <td colSpan={4} className="p-2 text-center bg-neutral-200 dark:bg-neutral-700 border-r border-neutral-300 dark:border-neutral-700 font-bold text-neutral-900 dark:text-white">
                  {totals.pdmSebelum.sum} btl
                </td>

                <td colSpan={4} className="p-2 text-center bg-neutral-200 dark:bg-neutral-700 border-r border-neutral-300 dark:border-neutral-700 font-bold text-neutral-900 dark:text-white">
                  {totals.bb.sum} btl
                </td>

                <td colSpan={4} className="p-2 text-center bg-neutral-200 dark:bg-neutral-700 border-r border-neutral-300 dark:border-neutral-700 font-bold text-neutral-900 dark:text-white">
                  {totals.terjual.sum} btl
                </td>

                <td colSpan={1} className="p-2 text-center bg-neutral-200 dark:bg-neutral-700 border-r border-neutral-300 dark:border-neutral-700 font-bold text-neutral-900 dark:text-white">
                  Rp {totals.setoran.setor.toLocaleString("id-ID")}
                </td>

                <td colSpan={4} className="p-2 text-center bg-neutral-200 dark:bg-neutral-700 border-r border-neutral-300 dark:border-neutral-700 font-bold text-neutral-900 dark:text-white">
                  {totals.pdmHariIni.sum} btl
                </td>

                <td colSpan={4} className="p-2 text-center bg-neutral-200 dark:bg-neutral-700 font-bold text-neutral-900 dark:text-white">
                  {totals.turun.sum} btl
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Tombol Simpan (di bawah tabel) */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 sm:p-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">
          <span className={`text-[11px] font-bold ${hasUnsaved ? "text-amber-700 dark:text-amber-300" : "text-neutral-500 dark:text-neutral-400"}`}>
            {hasUnsaved ? "📝 Draf tersimpan di perangkat, belum ke Realisasi" : "Semua perubahan sudah tersimpan"}
          </span>
          <button
            onClick={handleSaveLhpp}
            disabled={isSaving || isLoading}
            className="h-9 px-5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
            title="Simpan LHPP & update Realisasi ke Server"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Save className="w-4 h-4 shrink-0" />}
            <span>{isSaving ? "Menyimpan..." : "Simpan"}</span>
          </button>
        </div>
      </div>

      {/* MODAL KONFIRMASI HAPUS DATA LHPP (BEKERJA DI SEMUA BROWSER & ANDROID WEBVIEW) */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-neutral-200 dark:border-neutral-800 animate-in zoom-in-95 duration-150">
            <div className="p-5 sm:p-6 space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-inner">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="text-center space-y-1.5">
                <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100">
                  Hapus Data LHPP Tanggal {selectedDay}?
                </h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  Tindakan ini akan <span className="font-bold text-rose-600 dark:text-rose-400">menghapus bersih</span> seluruh data LHPP tanggal <span className="font-bold">{selectedDay} ({selectedMonth})</span>, menghapus catatan transaksi harian YL, dan mengosongkan kolom tanggal {selectedDay} di menu Realisasi Admin & YL.
                </p>
              </div>

              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-[11px] text-rose-800 dark:text-rose-300 font-semibold flex items-start gap-2">
                <span className="text-rose-600 dark:text-rose-400 text-base leading-none">⚠️</span>
                <span>Data yang dihapus tidak dapat dipulihkan kembali. Pastikan Anda telah memeriksa tanggal yang dipilih.</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="w-full py-2.5 px-4 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:scale-95 text-neutral-700 dark:text-neutral-300 font-bold text-xs rounded-xl transition-all cursor-pointer border border-neutral-300 dark:border-neutral-700"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={executeDeleteLhpp}
                  disabled={isDeleting}
                  className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>{isDeleting ? "Menghapus..." : "Ya, Hapus Sekarang"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const LhppRealisasiView = React.memo(LhppRealisasiViewInner);
