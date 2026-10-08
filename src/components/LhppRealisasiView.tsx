import { ClipboardFallbackModal } from "./ClipboardFallbackModal";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MotivasiConfig, cleanYlName } from "../types";
import { useSimpleGrid } from "./useSimpleGrid";
import { GridSelectionToolbar } from "./GridSelectionToolbar";
import { SpreadsheetInputBar } from "./SpreadsheetInputBar";
import { NumberInput } from "./NumberInput";
import { safeFetchJson } from "../lib/safeFetch";
import {
  FileSpreadsheet,
  Copy,
  Printer,
  Calendar,
  ShieldCheck,
  Undo2,
  Redo2,
  Save,
  Loader2,
  RefreshCw,
  Trash2,
  Zap,
  ChevronLeft,
  ChevronRight,
  ArrowRight
} from "lucide-react";

export interface LhppRow {
  area: string;
  nama: string;
  pdmSebelum: { yo: number; om: number; os: number; yt: number };
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

function LhppRealisasiViewInner({
  ylList,
  selectedMonth = "2026-07",
}: LhppRealisasiViewProps) {
  // 1. Tanggal berjalan: Default = Tanggal Hari Ini (device / server time)
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const today = new Date().getDate();
    return today >= 1 && today <= 31 ? today : 1;
  });

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
  const [showQuickInput, setShowQuickInput] = useState<boolean>(true);
  const [selectedYlIndex, setSelectedYlIndex] = useState<number>(0);
  const prevPdmMapRef = useRef<Record<string, { yo: number; om: number; os: number; yt: number }>>({});

  // Fetch data from server when date or month changes
  const loadDataFromServer = useCallback(async (month: string, day: number) => {
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

          // PDM Sebelum (PDM YL) diambil otomatis dari PDM Hari Ini tanggal sebelumnya (termasuk saat berganti bulan)
          const prevPdm = prevPdmMap[yl.area] || prevPdmMap[cleanName] || prevPdmMap[yl.nama] || { yo: 0, om: 0, os: 0, yt: 0 };
          const hasSavedPdmSebelum = savedYlData?.pdmSebelum && (savedYlData.pdmSebelum.yo > 0 || savedYlData.pdmSebelum.om > 0 || savedYlData.pdmSebelum.os > 0 || savedYlData.pdmSebelum.yt > 0);

          return {
            area: yl.area,
            nama: yl.nama,
            pdmSebelum: hasSavedPdmSebelum ? { ...savedYlData.pdmSebelum } : { ...prevPdm },
            bb: savedYlData?.bb ? { ...savedYlData.bb } : { yo: 0, om: 0, os: 0, yt: 0 },
            setoran: { setor: 0, bank1: 0, bank2: 0 },
            pdmHariIni: savedYlData?.pdmHariIni ? { ...savedYlData.pdmHariIni } : { yo: 0, om: 0, os: 0, yt: 0 }
          };
        });

        setRows(newRows);
        setSummary(summaryData);
        setUndoStack([]);
        setRedoStack([]);
        isDirtyRef.current = false;
      }
    } catch (err) {
      console.error("Error loading LHPP data from server:", err);
    } finally {
      setIsLoading(false);
      isDirtyRef.current = false;
    }
  }, [ylList]);

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
            pdmSebelum: { ...prev }
          };
        }));

        const srcLabel = res.prevSourceDate 
          ? res.prevSourceDate.split("-").reverse().join("-") 
          : "hari sebelumnya";
        setMsg(`✅ Berhasil mengambil data PDM Sebelumnya (sumber: ${srcLabel})`);
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
    isDirtyRef.current = false;
    loadDataFromServer(selectedMonth, selectedDay);

    const handleAppRefresh = () => {
      isDirtyRef.current = false;
      loadDataFromServer(selectedMonth, selectedDay);
    };
    window.addEventListener("app_header_refresh", handleAppRefresh);
    return () => window.removeEventListener("app_header_refresh", handleAppRefresh);
  }, [selectedMonth, selectedDay, loadDataFromServer]);

  // Undo / Redo Stacks (Draft mode in memory)
  const [undoStack, setUndoStack] = useState<Array<{ rows: LhppRow[]; summary: LhppYlmSummary }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ rows: LhppRow[]; summary: LhppYlmSummary }>>([]);

  const isDirtyRef = useRef(false);
  const editVersionRef = useRef(0);

  const recordHistory = useCallback(() => {
    isDirtyRef.current = true;
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
    section: "bb" | "pdmHariIni",
    field: "yo" | "om" | "os" | "yt",
    val: number
  ) => {
    recordHistory();
    const cleanVal = parseInputInt(val);
    setRows(prev => {
      const next = [...prev];
      const targetRow = { ...next[rIdx] };
      if (section === "bb" || section === "pdmHariIni") {
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

  // Auto-save Effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isSaving && isDirtyRef.current && rows.length > 0) {
        handleSaveLhpp(true);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [rows, summary, selectedDay, selectedMonth, isSaving]);

  // Save Handler: Save PDM to server & patch Realisasi db.transactions
  const handleSaveLhpp = async (isAutoSave = false) => {
    if (isSaving || (!isAutoSave && !isDirtyRef.current)) return;
    const editVersionAtSave = editVersionRef.current;
    setIsSaving(true);
    if (!isAutoSave) setMsg("⏳ Menyimpan data LHPP & memperbarui Realisasi...");

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
        if (editVersionRef.current === editVersionAtSave) isDirtyRef.current = false;
        if (!isAutoSave) {
          setMsg("✅ Data LHPP tersimpan & tersambung ke Realisasi");
          setTimeout(() => setMsg(""), 4000);
        }
        window.dispatchEvent(new Event("lhpp_saved"));
      } else {
        if (!isAutoSave) setMsg(`⚠️ ${res?.error || "Gagal menyimpan data LHPP ke server."}`);
      }
    } catch (err: any) {
      console.error("Failed to save LHPP:", err);
      if (!isAutoSave) setMsg("❌ Gagal menyimpan data LHPP. Periksa koneksi jaringan.");
    } finally {
      setIsSaving(false);
    }
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
        isDirtyRef.current = false;
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
    if (c >= 0 && c <= 3) return false; // PDM Sebelum is READ-ONLY
    if (c >= 8 && c <= 11) return false; // Terjual read-only
    if (c === 12) return false; // Setoran read-only
    if (c >= 17 && c <= 20) return false; // Turun read-only
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

        if (c >= 4 && c <= 7) {
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

  // Dedicated paste handler for grid inputs
  const handleCellPaste = (e: React.ClipboardEvent, rIdx: number, cIdx: number) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const clean = text.trim();
    if (/[\t\n\r,;/|\s]/.test(clean) || clean.length > 0) {
      e.preventDefault();
      const newSelection = { startR: rIdx, startC: cIdx, endR: rIdx, endC: cIdx };
      setSelection(newSelection);
      setTimeout(() => {
        handlePaste(text, newSelection);
      }, 0);
    }
  };

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
      <div className="bg-white text-slate-900 p-2 sm:p-2.5 rounded-xl shadow-2xs border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg shrink-0">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xs sm:text-sm font-black tracking-wide text-slate-900 uppercase flex flex-wrap items-center gap-1.5 leading-tight">
              <span>4) LHPP & LPPBJ (Input PJL & PDM)</span>
              <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[9px] font-extrabold uppercase whitespace-nowrap">Acuan Manager</span>
            </h2>
          </div>
        </div>

        {/* Date / Day Picker & Action Controls */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-slate-100 pt-1.5 sm:pt-0">
          {/* UNDO / REDO Buttons */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold text-slate-700 hover:bg-white disabled:opacity-40 transition-all flex items-center gap-1 cursor-pointer"
              title="Undo Edit (Ctrl+Z)"
            >
              <Undo2 className="w-3 h-3 text-amber-600" />
              <span>Undo ({undoStack.length})</span>
            </button>
            <div className="w-[1px] h-3 bg-slate-300 mx-0.5" />
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold text-slate-700 hover:bg-white disabled:opacity-40 transition-all flex items-center gap-1 cursor-pointer"
              title="Redo Edit (Ctrl+Y)"
            >
              <Redo2 className="w-3 h-3 text-blue-600" />
              <span>Redo ({redoStack.length})</span>
            </button>
          </div>

          <div className="flex items-center bg-slate-100 px-1.5 py-0.5 rounded-lg border border-slate-200">
            <Calendar className="w-3 h-3 text-red-600 mr-1 shrink-0" />
            <span className="text-[10px] font-black text-slate-700 mr-1">TGL:</span>
            <select
              value={selectedDay}
              onChange={e => setSelectedDay(Number(e.target.value))}
              className="bg-white text-slate-900 font-mono font-black text-[11px] px-1.5 py-0.5 rounded border border-slate-300 outline-none cursor-pointer shadow-2xs focus:border-emerald-500"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 ml-auto sm:ml-0 flex-wrap sm:flex-nowrap">
            {/* Tombol Toggle Form Input Cepat Per-YL */}
            <button
              onClick={() => setShowQuickInput(prev => !prev)}
              className={`h-8.5 px-3 font-extrabold text-[11px] rounded-lg shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                showQuickInput
                  ? "bg-amber-500 hover:bg-amber-600 text-slate-950 font-black ring-2 ring-amber-300"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
              title="Buka / Tutup Form Input Cepat Per-YL"
            >
              <Zap className="w-3.5 h-3.5 shrink-0 fill-current" />
              <span>{showQuickInput ? "Sembunyikan Form" : "Input Cepat"}</span>
            </button>

            {/* Tombol Ambil PDM */}
            <button
              onClick={handlePullPrevPdm}
              disabled={isLoading}
              className="h-8.5 px-3 bg-amber-600 hover:bg-amber-700 active:scale-95 disabled:opacity-50 text-white font-extrabold text-[11px] rounded-lg shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap min-w-[92px]"
              title={`Ambil data PDM dari hari sebelumnya (termasuk lintas bulan saat berganti bulan)${prevSourceDate ? ` [Sumber: ${prevSourceDate.split("-").reverse().join("-")}]` : ""}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isLoading ? "animate-spin" : ""}`} />
              <span>Ambil PDM</span>
            </button>

            {/* Tombol Simpan - Utama */}
            <button
              onClick={() => handleSaveLhpp(false)}
              disabled={isSaving}
              className="h-8.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-extrabold text-[11px] rounded-lg shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap min-w-[92px]"
              title="Simpan LHPP & update Realisasi ke Server"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Save className="w-3.5 h-3.5 shrink-0" />}
              <span>{isSaving ? "Menyimpan..." : "Simpan"}</span>
            </button>

            {/* Tombol Hapus Manual */}
            <button
              onClick={handleDeleteLhpp}
              disabled={isDeleting || isSaving || isLoading}
              className="h-8.5 px-3 bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-50 text-white font-extrabold text-[11px] rounded-lg shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap min-w-[92px]"
              title={`Hapus data LHPP tanggal ${selectedDay} secara menyeluruh (termasuk di Realisasi Admin & Transaksi YL)`}
            >
              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Trash2 className="w-3.5 h-3.5 shrink-0" />}
              <span>{isDeleting ? "Hapus..." : "Hapus LHPP"}</span>
            </button>

            {/* Tombol Salin Rekap */}
            <button
              onClick={handleCopyText}
              className="h-8.5 px-3 bg-slate-700 hover:bg-slate-800 active:scale-95 text-white font-extrabold text-[11px] rounded-lg shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap min-w-[92px]"
              title="Salin rekap LHPP ke clipboard"
            >
              <Copy className="w-3.5 h-3.5 shrink-0" />
              <span>Salin Rekap</span>
            </button>

            {/* Tombol Cetak */}
            <button
              onClick={() => window.print()}
              className="h-8.5 w-8.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-bold rounded-lg border border-slate-200 transition-all cursor-pointer flex items-center justify-center shrink-0"
              title="Cetak Laporan"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`border font-black text-xs px-3 py-2 rounded-xl text-center shadow-2xs animate-pulse ${
          msg.includes("❌") || msg.includes("⚠️") 
            ? "bg-rose-100 border-rose-400 text-rose-900" 
            : "bg-emerald-100 border-emerald-400 text-emerald-900"
        }`}>
          {msg}
        </div>
      )}

      {isLoading && (
        <div className="text-center py-2 text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          <span>Memuat data LHPP tanggal {selectedDay}...</span>
        </div>
      )}

      {/* Top Banner & Side Tables Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-stretch">
        {/* Left Side Header Banner Info */}
        <div className="lg:col-span-6 bg-white text-slate-900 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs space-y-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-[11px] sm:text-xs font-black uppercase text-emerald-700 tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
              <span>REKAP HARI KUNJUNG MANAGER & YL</span>
            </span>
            <span className="text-[10px] sm:text-[11px] font-mono font-black bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-lg border border-emerald-200 shadow-2xs">
              Tgl {selectedDay} ({selectedMonth})
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center pt-0.5">
            <div className="bg-slate-50 p-2 sm:p-2.5 rounded-lg sm:rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
              <span className="text-[9px] sm:text-[10px] text-slate-500 block font-bold uppercase tracking-wider">TOTAL TERJUAL</span>
              <span className="text-base sm:text-lg font-black text-emerald-700 font-mono my-0.5 sm:my-1">{totals.terjual.sum} <span className="text-[10px] sm:text-xs font-bold">btl</span></span>
              <div className="text-[8px] sm:text-[9px] font-mono font-extrabold text-slate-700 flex items-center justify-center gap-0.5 sm:gap-1 mt-0.5 pt-0.5 sm:pt-1 border-t border-slate-200">
                <span className="text-rose-600">YO:{totals.terjual.yo}</span>
                <span className="text-amber-600">OM:{totals.terjual.om}</span>
                <span className="text-fuchsia-600">OS:{totals.terjual.os}</span>
                <span className="text-sky-600">YT:{totals.terjual.yt}</span>
              </div>
            </div>

            <div className="bg-slate-50 p-2 sm:p-2.5 rounded-lg sm:rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
              <span className="text-[9px] sm:text-[10px] text-slate-500 block font-bold uppercase tracking-wider">TOTAL SETORAN</span>
              <span className="text-xs sm:text-sm font-black text-amber-700 font-mono my-auto">Rp {totals.setoran.sum.toLocaleString("id-ID")}</span>
            </div>

            <div className="bg-slate-50 p-2 sm:p-2.5 rounded-lg sm:rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
              <span className="text-[9px] sm:text-[10px] text-slate-500 block font-bold uppercase tracking-wider">PDM HARI INI</span>
              <span className="text-base sm:text-lg font-black text-sky-700 font-mono my-0.5 sm:my-1">{totals.pdmHariIni.sum} <span className="text-[10px] sm:text-xs font-bold">btl</span></span>
              <div className="text-[8px] sm:text-[9px] font-mono font-extrabold text-slate-700 flex items-center justify-center gap-0.5 sm:gap-1 mt-0.5 pt-0.5 sm:pt-1 border-t border-slate-200">
                <span className="text-rose-600">YO:{totals.pdmHariIni.yo}</span>
                <span className="text-amber-600">OM:{totals.pdmHariIni.om}</span>
                <span className="text-fuchsia-600">OS:{totals.pdmHariIni.os}</span>
                <span className="text-sky-600">YT:{totals.pdmHariIni.yt}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side Summary Table (PDM YLM & SISA YLM) */}
        <div className="lg:col-span-6 bg-white text-slate-900 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-center relative">
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
          <div data-grid-container="true" className="overflow-x-auto rounded-lg sm:rounded-xl border border-slate-200 shadow-2xs">
            <table className="w-full text-center text-[11px] font-mono border-collapse select-none">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-black text-[10px] uppercase border-b border-slate-200">
                  <th className="p-2 border-r border-slate-200 bg-slate-100 text-slate-700 text-left px-3">TGL</th>
                  <th className="p-2 border-r border-slate-200 text-center font-extrabold text-[12px] text-cyan-700" colSpan={2}>
                    {selectedDay}
                  </th>
                  <th className="p-2 border-r border-slate-200 text-rose-700">YO</th>
                  <th className="p-2 border-r border-slate-200 text-amber-800">OM</th>
                  <th className="p-2 border-r border-slate-200 text-fuchsia-800">OS</th>
                  <th className="p-2 border-r border-slate-200 text-sky-800">YT</th>
                  <th className="p-2 text-emerald-800 font-black">TOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-bold bg-white text-slate-900">
                {/* PDM YLM Row (r=0, bisa diedit) */}
                <tr className="bg-white text-slate-900">
                  <td className="p-2 font-black text-left bg-white text-slate-900 px-3 border-r border-slate-200" colSpan={3}>
                    PDM YLM
                  </td>
                  {ylmFields.map((field, c) => (
                    <td
                      key={field}
                      {...getYlmCellProps(0, c)}
                      className={`p-2 font-black bg-white text-slate-900 border-r border-slate-200 ${getYlmCellProps(0, c).className}`}
                    >
                      {summary.pdmYlm[field]}
                      {renderYlmSelectionHandle(0, c)}
                    </td>
                  ))}
                  <td
                    {...getYlmCellProps(0, 4)}
                    className={`p-2 font-black bg-white text-slate-900 ${getYlmCellProps(0, 4).className}`}
                  >
                    {totalPdmYlm}
                    {renderYlmSelectionHandle(0, 4)}
                  </td>
                </tr>

                {/* SISA YLM Row (r=1, hasil hitung / read-only) */}
                <tr className="bg-slate-50 text-slate-900 font-black">
                  <td className="p-2 text-left bg-slate-50 text-slate-900 px-3 border-r border-slate-200" colSpan={3}>
                    SISA YLM
                  </td>
                  {ylmFields.map((field, c) => (
                    <td
                      key={field}
                      {...getYlmCellProps(1, c)}
                      className={`p-2 bg-slate-50 border-r border-slate-200 ${sisaYlm[field] < 0 ? "text-rose-600 font-extrabold" : ""} ${getYlmCellProps(1, c).className}`}
                    >
                      {sisaYlm[field]}
                      {renderYlmSelectionHandle(1, c)}
                    </td>
                  ))}
                  <td
                    {...getYlmCellProps(1, 4)}
                    className={`p-2 bg-slate-50 font-black ${sisaYlm.total < 0 ? "text-rose-600" : "text-slate-900"} ${getYlmCellProps(1, 4).className}`}
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
          <div className="bg-white text-slate-800 p-2.5 sm:p-4 rounded-xl shadow-md border border-slate-200 space-y-2.5">
            {/* Header Compact & YL Selector */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div className="flex items-center gap-1.5">
                <div className="p-1 bg-amber-500 text-white rounded-lg shadow-2xs">
                  <Zap className="w-4 h-4 fill-current" />
                </div>
                <h3 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                  <span>INPUT CEPAT YL</span>
                  <span className="text-[10px] font-mono font-extrabold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                    {safeIdx + 1}/{computedRows.length}
                  </span>
                </h3>
              </div>

              {/* YL Selector & Nav Buttons */}
              <div className="flex items-center gap-1 w-full sm:w-auto min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedYlIndex(prev => (prev > 0 ? prev - 1 : computedRows.length - 1))}
                  className="shrink-0 p-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-lg border border-slate-300 transition-all cursor-pointer"
                  title="YL Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <select
                  value={safeIdx}
                  onChange={(e) => setSelectedYlIndex(Number(e.target.value))}
                  className="flex-1 min-w-0 bg-slate-50 text-slate-900 font-extrabold text-xs px-2 py-1 rounded-lg border border-slate-300 outline-none cursor-pointer focus:ring-1 focus:ring-amber-500 truncate"
                >
                  {computedRows.map((r, idx) => (
                    <option key={idx} value={idx} className="bg-white text-slate-900 font-mono">
                      [{r.area}] {cleanYlName(r.nama)} {r.area === "TKU" ? "(TKU)" : ""}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setSelectedYlIndex(prev => (prev < computedRows.length - 1 ? prev + 1 : 0))}
                  className="shrink-0 p-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-lg border border-slate-300 transition-all cursor-pointer"
                  title="YL Berikutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Horizontal Table for YO / OM / OS / YT / TOTAL */}
            <div className="overflow-hidden rounded-lg border border-slate-200 shadow-2xs">
              <table className="w-full text-[10px] sm:text-xs text-center border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-black uppercase border-b border-slate-200 text-[9px] sm:text-[11px]">
                    <th className="py-1.5 px-1 text-left w-[26%] sm:w-[20%] bg-slate-200/80 text-slate-800">Keterangan</th>
                    <th className="py-1.5 px-0.5 text-red-600 bg-red-50/70 border-l border-slate-200 w-[14.8%] sm:w-[16%]">YO</th>
                    <th className="py-1.5 px-0.5 text-amber-600 bg-amber-50/70 border-l border-slate-200 w-[14.8%] sm:w-[16%]">OM</th>
                    <th className="py-1.5 px-0.5 text-fuchsia-600 bg-fuchsia-50/70 border-l border-slate-200 w-[14.8%] sm:w-[16%]">OS</th>
                    <th className="py-1.5 px-0.5 text-sky-600 bg-sky-50/70 border-l border-slate-200 w-[14.8%] sm:w-[16%]">YT</th>
                    <th className="py-1.5 px-0.5 text-slate-900 bg-slate-200/90 border-l border-slate-300 w-[14.8%] sm:w-[16%] font-black">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono font-bold text-slate-800">
                  {/* Row 1: PDM Sebelumnya */}
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="py-1.5 px-1 text-left font-sans font-bold text-slate-700 bg-slate-50 truncate">1. PDM Sblm</td>
                    <td className="py-1.5 px-0.5 text-red-600 font-black border-l border-slate-200">{currentQuickYl.pdmSebelum.yo || 0}</td>
                    <td className="py-1.5 px-0.5 text-amber-600 font-black border-l border-slate-200">{currentQuickYl.pdmSebelum.om || 0}</td>
                    <td className="py-1.5 px-0.5 text-fuchsia-600 font-black border-l border-slate-200">{currentQuickYl.pdmSebelum.os || 0}</td>
                    <td className="py-1.5 px-0.5 text-sky-600 font-black border-l border-slate-200">{currentQuickYl.pdmSebelum.yt || 0}</td>
                    <td className="py-1.5 px-0.5 text-slate-900 bg-slate-100/80 font-black border-l border-slate-300">{totPdmSblm}</td>
                  </tr>

                  {/* Row 2: BB (Balik Botol / Kembali) */}
                  <tr className="bg-amber-50/30 hover:bg-amber-50/60 transition-colors">
                    <td className="py-1.5 px-1 text-left font-sans font-extrabold text-amber-900 bg-amber-100/50 truncate">
                      2. BB (Kembali)
                    </td>
                    <td className="py-1 px-0.5 border-l border-slate-200">
                      <NumberInput
                        value={currentQuickYl.bb.yo || 0}
                        onChange={(val) => handleCellChange(safeIdx, "bb", "yo", val)}
                        className="w-full bg-white text-red-600 font-mono font-black text-center py-0.5 rounded border border-red-300 focus:border-red-500 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-slate-200">
                      <NumberInput
                        value={currentQuickYl.bb.om || 0}
                        onChange={(val) => handleCellChange(safeIdx, "bb", "om", val)}
                        className="w-full bg-white text-amber-600 font-mono font-black text-center py-0.5 rounded border border-amber-300 focus:border-amber-500 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-slate-200">
                      <NumberInput
                        value={currentQuickYl.bb.os || 0}
                        onChange={(val) => handleCellChange(safeIdx, "bb", "os", val)}
                        className="w-full bg-white text-fuchsia-600 font-mono font-black text-center py-0.5 rounded border border-fuchsia-300 focus:border-fuchsia-500 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-slate-200">
                      <NumberInput
                        value={currentQuickYl.bb.yt || 0}
                        onChange={(val) => handleCellChange(safeIdx, "bb", "yt", val)}
                        className="w-full bg-white text-sky-600 font-mono font-black text-center py-0.5 rounded border border-sky-300 focus:border-sky-500 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1.5 px-0.5 text-slate-900 bg-amber-100/60 font-black border-l border-slate-300">{totBb}</td>
                  </tr>

                  {/* Row 3: Terjual */}
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="py-1.5 px-1 text-left font-sans font-bold text-slate-700 bg-slate-50 truncate">3. Terjual (btl)</td>
                    <td className="py-1.5 px-0.5 text-red-600 font-black border-l border-slate-200">{currentQuickYl.terjual.yo || 0}</td>
                    <td className="py-1.5 px-0.5 text-amber-600 font-black border-l border-slate-200">{currentQuickYl.terjual.om || 0}</td>
                    <td className="py-1.5 px-0.5 text-fuchsia-600 font-black border-l border-slate-200">{currentQuickYl.terjual.os || 0}</td>
                    <td className="py-1.5 px-0.5 text-sky-600 font-black border-l border-slate-200">{currentQuickYl.terjual.yt || 0}</td>
                    <td className="py-1.5 px-0.5 text-emerald-700 bg-emerald-50/80 font-black border-l border-slate-300">{totTerjual}</td>
                  </tr>

                  {/* Row 4: Setoran */}
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="py-1.5 px-1 text-left font-sans font-bold text-slate-700 bg-slate-50 truncate">4. Setoran (Rp)</td>
                    <td className="py-1.5 px-0.5 text-red-600 font-bold border-l border-slate-200">{((currentQuickYl.terjual.yo || 0) * 2040).toLocaleString("id-ID")}</td>
                    <td className="py-1.5 px-0.5 text-amber-600 font-bold border-l border-slate-200">{((currentQuickYl.terjual.om || 0) * 2130).toLocaleString("id-ID")}</td>
                    <td className="py-1.5 px-0.5 text-fuchsia-600 font-bold border-l border-slate-200">{((currentQuickYl.terjual.os || 0) * 2130).toLocaleString("id-ID")}</td>
                    <td className="py-1.5 px-0.5 text-sky-600 font-bold border-l border-slate-200">{((currentQuickYl.terjual.yt || 0) * 2460).toLocaleString("id-ID")}</td>
                    <td className="py-1.5 px-0.5 text-amber-800 bg-amber-100/60 font-black border-l border-slate-300 text-[9px] sm:text-[11px] truncate">{totSetoran.toLocaleString("id-ID")}</td>
                  </tr>

                  {/* Row 5: PDM Hari Ini */}
                  <tr className="bg-sky-50/30 hover:bg-sky-50/60 transition-colors">
                    <td className="py-1.5 px-1 text-left font-sans font-extrabold text-sky-900 bg-sky-100/50 truncate">
                      5. PDM Hari Ini
                    </td>
                    <td className="py-1 px-0.5 border-l border-slate-200">
                      <NumberInput
                        value={currentQuickYl.pdmHariIni.yo || 0}
                        onChange={(val) => handleCellChange(safeIdx, "pdmHariIni", "yo", val)}
                        className="w-full bg-white text-red-600 font-mono font-black text-center py-0.5 rounded border border-red-300 focus:border-red-500 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-slate-200">
                      <NumberInput
                        value={currentQuickYl.pdmHariIni.om || 0}
                        onChange={(val) => handleCellChange(safeIdx, "pdmHariIni", "om", val)}
                        className="w-full bg-white text-amber-600 font-mono font-black text-center py-0.5 rounded border border-amber-300 focus:border-amber-500 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-slate-200">
                      <NumberInput
                        value={currentQuickYl.pdmHariIni.os || 0}
                        onChange={(val) => handleCellChange(safeIdx, "pdmHariIni", "os", val)}
                        className="w-full bg-white text-fuchsia-600 font-mono font-black text-center py-0.5 rounded border border-fuchsia-300 focus:border-fuchsia-500 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1 px-0.5 border-l border-slate-200">
                      <NumberInput
                        value={currentQuickYl.pdmHariIni.yt || 0}
                        onChange={(val) => handleCellChange(safeIdx, "pdmHariIni", "yt", val)}
                        className="w-full bg-white text-sky-600 font-mono font-black text-center py-0.5 rounded border border-sky-300 focus:border-sky-500 outline-none text-[10px] sm:text-xs h-6 sm:h-7"
                      />
                    </td>
                    <td className="py-1.5 px-0.5 text-slate-900 bg-sky-100/60 font-black border-l border-slate-300">{totPdmHariIni}</td>
                  </tr>

                  {/* Row 6: Turun Barang */}
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="py-1.5 px-1 text-left font-sans font-bold text-slate-700 bg-slate-50 truncate">6. Turun Barang</td>
                    <td className="py-1.5 px-0.5 text-red-600 font-black border-l border-slate-200">{currentQuickYl.turun.yo || 0}</td>
                    <td className="py-1.5 px-0.5 text-amber-600 font-black border-l border-slate-200">{currentQuickYl.turun.om || 0}</td>
                    <td className="py-1.5 px-0.5 text-fuchsia-600 font-black border-l border-slate-200">{currentQuickYl.turun.os || 0}</td>
                    <td className="py-1.5 px-0.5 text-sky-600 font-black border-l border-slate-200">{currentQuickYl.turun.yt || 0}</td>
                    <td className="py-1.5 px-0.5 text-sky-700 bg-sky-50/80 font-black border-l border-slate-300">{totTurun}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer Action */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[10px] text-slate-400 italic">
                *Tersambung otomatis ke tabel LHPP
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
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-[11px] sm:text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <span>Simpan & Lanjut YL</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* MAIN SPREADSHEET TABLE */}
      <div ref={gridContainerRef} className="bg-white border border-slate-200 rounded-2xl shadow-md overflow-hidden relative">
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
          <table className="w-full text-left text-[11px] font-mono border-collapse select-none">
            {/* Header Level 1 */}
            <thead className="sticky top-0 bg-slate-50 text-slate-700 z-30 shadow-sm">
              <tr className="bg-slate-50 text-slate-800 font-black uppercase text-[10px] divide-x divide-slate-200">
                <th className="p-2 sticky left-0 bg-slate-50 z-40 min-w-[140px] max-w-[140px] text-left border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">
                  YAKULT LADY
                </th>
                <th
                  colSpan={4}
                  className="p-2 text-center bg-slate-50 text-slate-600 border-r border-slate-200 transition-colors font-extrabold tracking-wide"
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
                      className="text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 p-0.5 rounded transition-all cursor-pointer inline-flex items-center gap-0.5 text-[9px] font-bold px-1"
                      title={`Ambil / Perbarui data PDM dari tanggal sebelumnya (termasuk lintas bulan saat awal bulan)${prevSourceDate ? ` [Sumber: ${prevSourceDate.split("-").reverse().join("-")}]` : ""}`}
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isLoading ? "animate-spin" : ""}`} />
                      <span className="hidden md:inline">Ambil</span>
                    </button>
                  </div>
                  {prevSourceDate && (
                    <div className="text-[9px] font-mono font-bold text-emerald-700 mt-0.5 normal-case">
                      sumber: {prevSourceDate.split("-").reverse().join("-")}
                    </div>
                  )}
                </th>
                <th
                  colSpan={4}
                  className="p-2 text-center bg-red-50 text-red-800 border-r border-slate-200 cursor-pointer hover:bg-red-100 transition-colors font-extrabold tracking-wide"
                  onClick={() => setSelection({ startR: 0, startC: 4, endR: Math.max(0, computedRows.length - 1), endC: 7 })}
                >
                  BB
                </th>
                <th
                  colSpan={4}
                  className="p-2 text-center bg-emerald-50 text-emerald-800 border-r border-slate-200 cursor-pointer hover:bg-emerald-100 transition-colors font-extrabold tracking-wide"
                  onClick={() => setSelection({ startR: 0, startC: 8, endR: Math.max(0, computedRows.length - 1), endC: 11 })}
                >
                  TERJUAL
                </th>
                <th
                  colSpan={1}
                  className="p-2 text-center bg-amber-50 text-amber-800 border-r border-slate-200 cursor-pointer hover:bg-amber-100 transition-colors font-extrabold tracking-wide"
                  onClick={() => selectColumn(12)}
                >
                  SETORAN
                </th>
                <th
                  colSpan={4}
                  className="p-2 text-center bg-indigo-50 text-indigo-800 border-r border-slate-200 cursor-pointer hover:bg-indigo-100 transition-colors font-extrabold tracking-wide"
                  onClick={() => setSelection({ startR: 0, startC: 13, endR: Math.max(0, computedRows.length - 1), endC: 16 })}
                >
                  PDM HARI INI
                </th>
                <th
                  colSpan={4}
                  className="p-2 text-center bg-sky-50 text-sky-800 cursor-pointer hover:bg-sky-100 transition-colors font-extrabold tracking-wide"
                  onClick={() => setSelection({ startR: 0, startC: 17, endR: Math.max(0, computedRows.length - 1), endC: 20 })}
                >
                  TURUN PDM
                </th>
              </tr>

              {/* Header Level 2 Sub-columns */}
              <tr className="bg-slate-50/80 text-slate-700 font-black uppercase text-[9px] border-t border-slate-200 divide-x divide-slate-200">
                <th className="p-1 sticky left-0 bg-slate-50/80 z-40 border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0]"></th>

                {[
                  { label: "YO", c: 0 }, { label: "OM", c: 1 }, { label: "OS", c: 2 }, { label: "YT", c: 3, borderRight: true },
                  { label: "YO", c: 4 }, { label: "OM", c: 5 }, { label: "OS", c: 6 }, { label: "YT", c: 7, borderRight: true },
                  { label: "YO", c: 8 }, { label: "OM", c: 9 }, { label: "OS", c: 10 }, { label: "YT", c: 11, borderRight: true },
                  { label: "SETORAN (RP)", c: 12, borderRight: true, minW: true },
                  { label: "YO", c: 13 }, { label: "OM", c: 14 }, { label: "OS", c: 15 }, { label: "YT", c: 16, borderRight: true },
                  { label: "YO", c: 17 }, { label: "OM", c: 18 }, { label: "OS", c: 19 }, { label: "YT", c: 20 }
                ].map((col) => (
                  <th
                    key={col.c}
                    data-c={col.c}
                    className={`p-1 text-center bg-slate-50/80 text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors select-none ${col.minW ? "min-w-[125px]" : "w-11"} ${col.borderRight ? "border-r border-slate-200" : ""}`}
                    onClick={() => selectColumn(col.c)}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 font-bold bg-white text-slate-900">
              {computedRows.map((row, rIdx) => {
                const isTku = row.area === "TKU";
                return (
                  <tr
                    key={row.area + rIdx}
                    className={`hover:bg-indigo-50/50 transition-colors ${
                      isTku ? "bg-slate-100 font-black text-slate-900" : "bg-white text-slate-900"
                    }`}
                  >
                    {/* YAKULT LADY Column */}
                    <td
                      data-r={rIdx}
                      className="p-1.5 sticky left-0 bg-slate-50 z-20 border-r border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors select-none min-w-[140px] max-w-[140px] truncate shadow-[1px_0_0_0_#e2e8f0]"
                      onClick={() => selectRow(rIdx)}
                    >
                      <span className="text-rose-700 font-black mr-1">[{row.area}]</span>
                      <span className="font-extrabold text-slate-900 text-[10px] sm:text-[11px]">{cleanYlName(row.nama)}</span>
                    </td>
                    {/* PDM SEBELUMNYA (Auto / Read-Only dari PDM Hari Ini tanggal sebelumnya) */}
                    <td {...getCellProps(rIdx, 0)} className={`p-1.5 text-center text-red-700 font-extrabold bg-slate-50 border-r border-slate-200 ${getCellProps(rIdx, 0).className}`}>
                      {row.pdmSebelum.yo}
                      {renderSelectionHandle(rIdx, 0)}
                    </td>
                    <td {...getCellProps(rIdx, 1)} className={`p-1.5 text-center text-amber-800 font-extrabold bg-slate-50 border-r border-slate-200 ${getCellProps(rIdx, 1).className}`}>
                      {row.pdmSebelum.om}
                      {renderSelectionHandle(rIdx, 1)}
                    </td>
                    <td {...getCellProps(rIdx, 2)} className={`p-1.5 text-center text-fuchsia-800 font-extrabold bg-slate-50 border-r border-slate-200 ${getCellProps(rIdx, 2).className}`}>
                      {row.pdmSebelum.os}
                      {renderSelectionHandle(rIdx, 2)}
                    </td>
                    <td {...getCellProps(rIdx, 3)} className={`p-1.5 text-center text-blue-800 font-extrabold bg-slate-50 border-r-2 border-slate-400 ${getCellProps(rIdx, 3).className}`}>
                      {row.pdmSebelum.yt}
                      {renderSelectionHandle(rIdx, 3)}
                    </td>

                    {/* BB (Barang Bawaan) Inputs */}
                    <td {...getCellProps(rIdx, 4)} className={`p-1.5 text-center text-red-700 font-black bg-rose-50 border-r border-slate-200 ${getCellProps(rIdx, 4).className}`}>
                      <span className="font-mono font-black">{row.bb.yo || 0}</span>
                      {renderSelectionHandle(rIdx, 4)}
                    </td>
                    <td {...getCellProps(rIdx, 5)} className={`p-1.5 text-center text-amber-800 font-black bg-rose-50 border-r border-slate-200 ${getCellProps(rIdx, 5).className}`}>
                      <span className="font-mono font-black">{row.bb.om || 0}</span>
                      {renderSelectionHandle(rIdx, 5)}
                    </td>
                    <td {...getCellProps(rIdx, 6)} className={`p-1.5 text-center text-fuchsia-800 font-black bg-rose-50 border-r border-slate-200 ${getCellProps(rIdx, 6).className}`}>
                      <span className="font-mono font-black">{row.bb.os || 0}</span>
                      {renderSelectionHandle(rIdx, 6)}
                    </td>
                    <td {...getCellProps(rIdx, 7)} className={`p-1.5 text-center text-blue-800 font-black bg-rose-50 border-r-2 border-slate-400 ${getCellProps(rIdx, 7).className}`}>
                      <span className="font-mono font-black">{row.bb.yt || 0}</span>
                      {renderSelectionHandle(rIdx, 7)}
                    </td>

                    {/* TERJUAL (Auto Formula: PDM SEBELUMNYA - BB) */}
                    <td {...getCellProps(rIdx, 8)} className={`p-1.5 text-center text-red-700 font-black bg-white border-r border-slate-200 ${getCellProps(rIdx, 8).className}`}>
                      {row.terjual.yo}
                      {renderSelectionHandle(rIdx, 8)}
                    </td>
                    <td {...getCellProps(rIdx, 9)} className={`p-1.5 text-center text-amber-800 font-black bg-white border-r border-slate-200 ${getCellProps(rIdx, 9).className}`}>
                      {row.terjual.om}
                      {renderSelectionHandle(rIdx, 9)}
                    </td>
                    <td {...getCellProps(rIdx, 10)} className={`p-1.5 text-center text-fuchsia-800 font-black bg-white border-r border-slate-200 ${getCellProps(rIdx, 10).className}`}>
                      {row.terjual.os}
                      {renderSelectionHandle(rIdx, 10)}
                    </td>
                    <td {...getCellProps(rIdx, 11)} className={`p-1.5 text-center text-blue-800 font-black bg-white border-r-2 border-slate-400 ${getCellProps(rIdx, 11).className}`}>
                      {row.terjual.yt}
                      {renderSelectionHandle(rIdx, 11)}
                    </td>

                    {/* SETORAN Column (Auto Formula: Terjual x Harga) */}
                    <td {...getCellProps(rIdx, 12)} className={`p-1.5 text-right font-bold text-slate-900 bg-amber-50 border-r-2 border-slate-400 font-mono ${getCellProps(rIdx, 12).className}`}>
                      Rp {row.totalSetoran.toLocaleString("id-ID")}
                      {renderSelectionHandle(rIdx, 12)}
                    </td>

                    {/* PDM HARI INI Inputs */}
                    <td {...getCellProps(rIdx, 13)} className={`p-1.5 text-center text-red-700 font-black bg-white border-r border-slate-200 ${getCellProps(rIdx, 13).className}`}>
                      <span className="font-mono font-black">{row.pdmHariIni.yo || 0}</span>
                      {renderSelectionHandle(rIdx, 13)}
                    </td>
                    <td {...getCellProps(rIdx, 14)} className={`p-1.5 text-center text-amber-800 font-black bg-white border-r border-slate-200 ${getCellProps(rIdx, 14).className}`}>
                      <span className="font-mono font-black">{row.pdmHariIni.om || 0}</span>
                      {renderSelectionHandle(rIdx, 14)}
                    </td>
                    <td {...getCellProps(rIdx, 15)} className={`p-1.5 text-center text-fuchsia-800 font-black bg-white border-r border-slate-200 ${getCellProps(rIdx, 15).className}`}>
                      <span className="font-mono font-black">{row.pdmHariIni.os || 0}</span>
                      {renderSelectionHandle(rIdx, 15)}
                    </td>
                    <td {...getCellProps(rIdx, 16)} className={`p-1.5 text-center text-blue-800 font-black bg-white border-r-2 border-slate-400 ${getCellProps(rIdx, 16).className}`}>
                      <span className="font-mono font-black">{row.pdmHariIni.yt || 0}</span>
                      {renderSelectionHandle(rIdx, 16)}
                    </td>

                    {/* TURUN (Auto Formula: PDM HARI INI - BB) */}
                    <td {...getCellProps(rIdx, 17)} className={`p-1.5 text-center text-red-700 font-black bg-cyan-50 border-r border-slate-200 ${getCellProps(rIdx, 17).className}`}>
                      {row.turun.yo}
                      {renderSelectionHandle(rIdx, 17)}
                    </td>
                    <td {...getCellProps(rIdx, 18)} className={`p-1.5 text-center text-amber-800 font-black bg-cyan-50 border-r border-slate-200 ${getCellProps(rIdx, 18).className}`}>
                      {row.turun.om}
                      {renderSelectionHandle(rIdx, 18)}
                    </td>
                    <td {...getCellProps(rIdx, 19)} className={`p-1.5 text-center text-fuchsia-800 font-black bg-cyan-50 border-r border-slate-200 ${getCellProps(rIdx, 19).className}`}>
                      {row.turun.os}
                      {renderSelectionHandle(rIdx, 19)}
                    </td>
                    <td {...getCellProps(rIdx, 20)} className={`p-1.5 text-center text-blue-800 font-black bg-cyan-50 ${getCellProps(rIdx, 20).className}`}>
                      {row.turun.yt}
                      {renderSelectionHandle(rIdx, 20)}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Bottom Row Totals */}
            <tfoot className="bg-slate-50 text-slate-800 font-black border-t-2 border-slate-300 shadow-[0_-1px_0_0_#cbd5e1]">
              {/* Row 1: Subtotal Item Totals */}
              <tr className="text-[11px] divide-x divide-slate-200">
                <td className="p-2.5 sticky left-0 bg-slate-50 z-20 font-black text-slate-800 text-left shadow-[1px_0_0_0_#e2e8f0]">
                  Subtotal
                </td>

                {/* PDM SEBELUM Total */}
                <td className="p-2 text-center text-slate-600 font-black">{totals.pdmSebelum.yo}</td>
                <td className="p-2 text-center text-slate-600 font-black">{totals.pdmSebelum.om}</td>
                <td className="p-2 text-center text-slate-600 font-black">{totals.pdmSebelum.os}</td>
                <td className="p-2 text-center text-slate-600 font-black border-r border-slate-300">
                  {totals.pdmSebelum.yt}
                </td>

                {/* BB Total */}
                <td className="p-2 text-center text-red-700 font-black">{totals.bb.yo}</td>
                <td className="p-2 text-center text-amber-700 font-black">{totals.bb.om}</td>
                <td className="p-2 text-center text-fuchsia-700 font-black">{totals.bb.os}</td>
                <td className="p-2 text-center text-blue-700 font-black border-r border-slate-300">
                  {totals.bb.yt}
                </td>

                {/* TERJUAL Total */}
                <td className="p-2 text-center text-emerald-700 font-black">{totals.terjual.yo}</td>
                <td className="p-2 text-center text-emerald-700 font-black">{totals.terjual.om}</td>
                <td className="p-2 text-center text-emerald-700 font-black">{totals.terjual.os}</td>
                <td className="p-2 text-center text-emerald-700 font-black border-r border-slate-300">
                  {totals.terjual.yt}
                </td>

                {/* SETORAN Total */}
                <td className="p-2 text-right text-xs bg-amber-100/60 text-amber-800 font-black border-r border-slate-300 font-mono">
                  Rp {totals.setoran.setor.toLocaleString("id-ID")}
                </td>

                {/* PDM HARI INI Total */}
                <td className="p-2 text-center text-indigo-700 font-black">{totals.pdmHariIni.yo}</td>
                <td className="p-2 text-center text-indigo-700 font-black">{totals.pdmHariIni.om}</td>
                <td className="p-2 text-center text-indigo-700 font-black">{totals.pdmHariIni.os}</td>
                <td className="p-2 text-center text-indigo-700 font-black border-r border-slate-300">
                  {totals.pdmHariIni.yt}
                </td>

                {/* TURUN Total */}
                <td className="p-2 text-center text-sky-700 font-black">{totals.turun.yo}</td>
                <td className="p-2 text-center text-sky-700 font-black">{totals.turun.om}</td>
                <td className="p-2 text-center text-sky-700 font-black">{totals.turun.os}</td>
                <td className="p-2 text-center text-sky-700 font-black">{totals.turun.yt}</td>
              </tr>

              {/* Row 2: Grand Total Combined Bottle Sum */}
              <tr className="bg-slate-200 text-slate-800 font-black text-xs uppercase divide-x divide-slate-300 border-t border-slate-200">
                <td className="p-2.5 sticky left-0 bg-slate-300 z-20 text-left font-black tracking-wide text-slate-900 shadow-[1px_0_0_0_#cbd5e1]">
                  Total Yo, Om, Os & Yt
                </td>

                <td colSpan={4} className="p-2 text-center bg-slate-200 border-r border-slate-300 font-black text-slate-800">
                  {totals.pdmSebelum.sum} btl
                </td>

                <td colSpan={4} className="p-2 text-center bg-slate-200 border-r border-slate-300 font-black text-slate-800">
                  {totals.bb.sum} btl
                </td>

                <td colSpan={4} className="p-2 text-center bg-slate-200 border-r border-slate-300 font-black text-slate-800">
                  {totals.terjual.sum} btl
                </td>

                <td colSpan={1} className="p-2 text-center bg-amber-100/80 border-r border-slate-300 font-black text-amber-900">
                  Rp {totals.setoran.setor.toLocaleString("id-ID")}
                </td>

                <td colSpan={4} className="p-2 text-center bg-slate-200 border-r border-slate-300 font-black text-slate-800">
                  {totals.pdmHariIni.sum} btl
                </td>

                <td colSpan={4} className="p-2 text-center bg-slate-200 font-black text-slate-800">
                  {totals.turun.sum} btl
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* MODAL KONFIRMASI HAPUS DATA LHPP (BEKERJA DI SEMUA BROWSER & ANDROID WEBVIEW) */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="p-5 sm:p-6 space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="text-center space-y-1.5">
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  Hapus Data LHPP Tanggal {selectedDay}?
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Tindakan ini akan <span className="font-bold text-rose-600">menghapus bersih</span> seluruh data LHPP tanggal <span className="font-bold">{selectedDay} ({selectedMonth})</span>, menghapus catatan transaksi harian YL, dan mengosongkan kolom tanggal {selectedDay} di menu Realisasi Admin & YL.
                </p>
              </div>

              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-[11px] text-rose-800 font-semibold flex items-start gap-2">
                <span className="text-rose-600 text-base leading-none">⚠️</span>
                <span>Data yang dihapus tidak dapat dipulihkan kembali. Pastikan Anda telah memeriksa tanggal yang dipilih.</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-300"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={executeDeleteLhpp}
                  disabled={isDeleting}
                  className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
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
