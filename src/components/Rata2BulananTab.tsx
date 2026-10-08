import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calendar,
  Save,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  FileSpreadsheet,
  Search,
  Database,
  ArrowDownToLine,
  Layers,
  Copy,
  ClipboardPaste
} from "lucide-react";
import { loadFromSupabase, saveToSupabase, deleteFromSupabase } from "../lib/supabaseClient";
import { getPreviousYearDataSync } from "../lib/historicalArchiveLookup";
import { useSimpleGrid } from "./useSimpleGrid";
import { GridSelectionToolbar } from "./GridSelectionToolbar";
import { SpreadsheetInputBar } from "./SpreadsheetInputBar";
import { ClipboardFallbackModal } from "./ClipboardFallbackModal";

export interface Rata2Row {
  area: string;
  nama: string;
  total: number;
  yo: number;
  om: number;
  os: number;
  yt: number;
  totalRata2: number;
}

export interface MonthlyRata2Data {
  yearMonth: string; // e.g. "2025-01"
  year: string; // "2025"
  month: string; // "01"
  label: string; // "Januari 2025"
  updatedAt: string;
  pembagi?: number;
  jwp?: number;
  salesPerYL?: number;
  absen?: {
    jumlahYL: number;
    frekuensi: number;
  };
  rows: Rata2Row[];
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const DEFAULT_YLS = [
  { area: "201", nama: "Gusrina" },
  { area: "202", nama: "Dewi A" },
  { area: "203", nama: "Gusrini" },
  { area: "204", nama: "Umi Maisaroh" },
  { area: "205", nama: "Suyik" },
  { area: "206", nama: "Ria R. Wulan" },
  { area: "207", nama: "Endang" },
  { area: "208", nama: "Wakiah" },
  { area: "209", nama: "Titis" },
  { area: "210", nama: "Eni" }
];

// Sample baseline values matching the user's Excel sheet screenshot
const INITIAL_SAMPLES: Record<string, Rata2Row[]> = {
  "2025-07": [
    { area: "201", nama: "Gusrina", total: 11225, yo: 332.26, om: 22.58, os: 0, yt: 7.26, totalRata2: 362.10 },
    { area: "202", nama: "Dewi A", total: 14525, yo: 396.77, om: 52.42, os: 0, yt: 19.35, totalRata2: 468.55 },
    { area: "203", nama: "Gusrini", total: 16245, yo: 461.29, om: 42.74, os: 0, yt: 20.00, totalRata2: 524.03 },
    { area: "204", nama: "Umi Maisaroh", total: 14075, yo: 371.29, om: 55.32, os: 0, yt: 27.42, totalRata2: 454.03 },
    { area: "205", nama: "Suyik", total: 7750, yo: 200.32, om: 36.77, os: 0, yt: 12.90, totalRata2: 250.00 },
    { area: "206", nama: "Ria R. Wulan", total: 11845, yo: 304.03, om: 58.06, os: 0, yt: 20.00, totalRata2: 382.10 },
    { area: "207", nama: "Endang", total: 10655, yo: 270.97, om: 57.58, os: 0, yt: 15.16, totalRata2: 343.71 },
    { area: "208", nama: "Wakiah", total: 9990, yo: 254.84, om: 53.87, os: 0, yt: 13.55, totalRata2: 322.26 },
    { area: "209", nama: "Titis", total: 8215, yo: 192.26, om: 58.06, os: 0, yt: 14.68, totalRata2: 265.00 },
    { area: "210", nama: "Eni", total: 7800, yo: 204.19, om: 37.42, os: 0, yt: 10.00, totalRata2: 251.61 }
  ],
  "2025-08": [
    { area: "201", nama: "Gusrina", total: 11315, yo: 335.50, om: 22.80, os: 0, yt: 7.50, totalRata2: 365.80 },
    { area: "202", nama: "Dewi A", total: 14630, yo: 398.20, om: 53.10, os: 0, yt: 19.50, totalRata2: 470.80 },
    { area: "203", nama: "Gusrini", total: 16180, yo: 458.00, om: 43.50, os: 0, yt: 20.10, totalRata2: 521.60 },
    { area: "204", nama: "Umi Maisaroh", total: 13950, yo: 368.50, om: 56.00, os: 0, yt: 27.50, totalRata2: 452.00 },
    { area: "205", nama: "Suyik", total: 7900, yo: 205.00, om: 37.00, os: 0, yt: 13.00, totalRata2: 255.00 },
    { area: "206", nama: "Ria R. Wulan", total: 11750, yo: 301.50, om: 58.50, os: 0, yt: 20.20, totalRata2: 380.20 },
    { area: "207", nama: "Endang", total: 10780, yo: 275.00, om: 58.00, os: 0, yt: 15.30, totalRata2: 348.30 },
    { area: "208", nama: "Wakiah", total: 10120, yo: 258.00, om: 54.20, os: 0, yt: 13.80, totalRata2: 326.00 },
    { area: "209", nama: "Titis", total: 8450, yo: 198.00, om: 58.50, os: 0, yt: 14.80, totalRata2: 271.30 },
    { area: "210", nama: "Eni", total: 8020, yo: 210.00, om: 38.00, os: 0, yt: 10.20, totalRata2: 258.20 }
  ],
  "2026-01": [
    { area: "201", nama: "Gusrina", total: 9895, yo: 281.45, om: 20.97, os: 0, yt: 16.77, totalRata2: 319.19 },
    { area: "202", nama: "Dewi A", total: 13100, yo: 379.84, om: 25.81, os: 0, yt: 16.94, totalRata2: 422.58 },
    { area: "203", nama: "Gusrini", total: 14300, yo: 433.87, om: 12.90, os: 0, yt: 14.52, totalRata2: 461.29 },
    { area: "204", nama: "Umi Maisaroh", total: 12860, yo: 362.58, om: 36.13, os: 0, yt: 16.13, totalRata2: 414.84 },
    { area: "205", nama: "Suyik", total: 8010, yo: 233.71, om: 12.42, os: 0, yt: 12.26, totalRata2: 258.39 },
    { area: "206", nama: "Ria R. Wulan", total: 6545, yo: 186.29, om: 12.42, os: 0, yt: 12.42, totalRata2: 211.13 },
    { area: "207", nama: "Endang", total: 10500, yo: 271.77, om: 38.71, os: 0, yt: 28.23, totalRata2: 338.71 },
    { area: "208", nama: "Wakiah", total: 7880, yo: 226.45, om: 16.45, os: 0, yt: 11.29, totalRata2: 254.19 },
    { area: "209", nama: "Titis", total: 8700, yo: 250.00, om: 17.58, os: 0, yt: 13.06, totalRata2: 280.65 },
    { area: "210", nama: "Eni", total: 7750, yo: 226.13, om: 11.94, os: 0, yt: 11.94, totalRata2: 250.00 }
  ]
};

interface Rata2BulananTabProps {
  ylList?: any[];
  defaultYearMonth?: string;
}

export function Rata2BulananTab({ ylList = [], defaultYearMonth }: Rata2BulananTabProps) {
  const [selectedYear, setSelectedYear] = useState<string>(() => defaultYearMonth ? defaultYearMonth.split("-")[0] : "2025");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => defaultYearMonth ? defaultYearMonth.split("-")[1] : "01");
  const [activeYearMonth, setActiveYearMonth] = useState<string>(() => defaultYearMonth || "2025-01");

  const [savedMonthsList, setSavedMonthsList] = useState<string[]>(["2025-07", "2025-08", "2026-01"]);
  const [currentData, setCurrentData] = useState<MonthlyRata2Data | null>(null);
  
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editableRows, setEditableRows] = useState<Rata2Row[]>([]);
  
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [deleteModalMonth, setDeleteModalMonth] = useState<{ ym: string; label: string } | null>(null);
  
  const [showPasteModal, setShowPasteModal] = useState<boolean>(false);
  const [pasteInputText, setPasteInputText] = useState<string>("");
  const [internalCopiedText, setInternalCopiedText] = useState<string>("");

  // Process pasted string from Excel / Spreadsheet / TSV
  const processPastedText = useCallback((pastedText: string) => {
    if (!pastedText || !pastedText.trim()) return;
    const rawLines = pastedText.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

    setEditableRows(prev => {
      const copy = [...prev];
      let rowPointer = 0;

      for (let i = 0; i < rawLines.length && rowPointer < copy.length; i++) {
        const line = rawLines[i].trim();
        if (!line) continue;
        const lower = line.toLowerCase();
        if (lower.includes("area") || lower.includes("nama") || lower.includes("rata")) continue;

        const parts = line.split(/[\t;]+/).map(p => p.trim());
        const numVals: number[] = [];
        parts.forEach(p => {
          const cleaned = p.replace(/,/g, ".");
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed)) numVals.push(parsed);
        });

        if (numVals.length >= 4) {
          const yo = numVals[0] || 0;
          const om = numVals[1] || 0;
          const os = numVals[2] || 0;
          const yt = numVals[3] || 0;
          const totalRata2 = numVals[4] !== undefined ? numVals[4] : parseFloat((yo + om + os + yt).toFixed(2));

          copy[rowPointer] = {
            ...copy[rowPointer],
            yo, om, os, yt, totalRata2
          };
          rowPointer++;
        }
      }
      return copy;
    });

    setIsEditing(true);
    setStatusMsg("📋 Data dari Excel berhasil dipaste ke tabel Rata-Rata Bulanan!");
    setTimeout(() => setStatusMsg(""), 4000);
  }, []);

  const handleCopyTable = () => {
    const rows = isEditing ? editableRows : (currentData?.rows || []);
    if (!rows || rows.length === 0) return;
    const header = "Area\tNama YL\tYO\tOM\tOS\tYT\tRata-Rata";
    const lines = rows.map(r => `${r.area}\t${r.nama}\t${r.yo}\t${r.om}\t${r.os}\t${r.yt}\t${r.totalRata2}`);
    const textToCopy = [header, ...lines].join("\n");
    setInternalCopiedText(textToCopy);
    navigator.clipboard.writeText(textToCopy).then(() => {
      setStatusMsg("📋 Tabel Rata-Rata Bulanan berhasil disalin ke clipboard! Siap di-paste ke Excel.");
      setTimeout(() => setStatusMsg(""), 4000);
    }).catch(() => {
      // Masih berhasil tersimpan di memori internal app
      setStatusMsg("📋 Tabel disalin ke memori aplikasi.");
      setTimeout(() => setStatusMsg(""), 3000);
    });
  };

  const handleInputCellPaste = (e: React.ClipboardEvent<HTMLInputElement>, startRowIdx: number, startField: "yo" | "om" | "os" | "yt" | "totalRata2") => {
    const text = e.clipboardData.getData("text/plain") || e.clipboardData.getData("text");
    if (!text) return;
    e.preventDefault();
    processPastedText(text);
  };

  const handleDirectPasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        processPastedText(text);
      } else if (internalCopiedText) {
        processPastedText(internalCopiedText);
      } else {
        setShowPasteModal(true);
      }
    } catch (e) {
      if (internalCopiedText) {
        processPastedText(internalCopiedText);
      } else {
        setShowPasteModal(true);
      }
    }
  };

  const activeYlNames = useMemo(() => {
    if (ylList && ylList.length > 0) {
      return ylList.map(y => ({
        area: String(y.area || "").substring(0, 3),
        nama: y.nama || ""
      }));
    }
    return DEFAULT_YLS;
  }, [ylList]);

  // Function to create initial rows for a given month
  const createEmptyRows = (ymKey: string): Rata2Row[] => {
    if (INITIAL_SAMPLES[ymKey]) {
      return INITIAL_SAMPLES[ymKey];
    }
    return activeYlNames.map(y => ({
      area: y.area,
      nama: y.nama,
      total: 0,
      yo: 0,
      om: 0,
      os: 0,
      yt: 0,
      totalRata2: 0
    }));
  };

  // 1. Load saved months index on mount
  useEffect(() => {
    const loadIndex = async () => {
      let localIndex: string[] = [];
      try {
        const raw = localStorage.getItem("rata2_bulanan_index");
        if (raw) localIndex = JSON.parse(raw);
      } catch (e) {}

      // Try fetching from Supabase
      try {
        const sbIndex = await loadFromSupabase<string[]>("rata2_bulanan_index");
        if (Array.isArray(sbIndex) && sbIndex.length > 0) {
          const merged = Array.from(new Set([...localIndex, ...sbIndex, "2025-07", "2025-08", "2026-01"])).sort().reverse();
          setSavedMonthsList(merged);
          if (!defaultYearMonth && merged.length > 0) {
            const [y, m] = merged[0].split("-");
            setSelectedYear(y);
            setSelectedMonth(m);
            setActiveYearMonth(merged[0]);
          }
          return;
        }
      } catch (e) {}

      const merged = Array.from(new Set([...localIndex, "2025-07", "2025-08", "2026-01"])).sort().reverse();
      setSavedMonthsList(merged);
      if (!defaultYearMonth && merged.length > 0) {
        const [y, m] = merged[0].split("-");
        setSelectedYear(y);
        setSelectedMonth(m);
        setActiveYearMonth(merged[0]);
      }
    };
    loadIndex();
  }, [defaultYearMonth]);

  // Helper to load data for a specific yearMonth
  const loadMonthData = async (ymKey: string) => {
    const [yr, mo] = ymKey.split("-");
    const label = `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${yr}`;
    
    // Check LocalStorage
    let dataLoaded: MonthlyRata2Data | null = null;
    try {
      const raw = localStorage.getItem(`rata2_bulanan_${ymKey}`);
      if (raw) {
        dataLoaded = JSON.parse(raw);
      }
    } catch (e) {}

    // Check Supabase if not in LocalStorage
    if (!dataLoaded) {
      try {
        const sbData = await loadFromSupabase<MonthlyRata2Data>(`rata2_bulanan_${ymKey}`);
        if (sbData && Array.isArray(sbData.rows)) {
          dataLoaded = sbData;
          try {
            localStorage.setItem(`rata2_bulanan_${ymKey}`, JSON.stringify(sbData));
          } catch (e) {}
        }
      } catch (e) {}
    }

    if (dataLoaded) {
      setCurrentData(dataLoaded);
      setEditableRows(dataLoaded.rows);
    } else {
      // Default sample or fresh empty rows
      const rows = createEmptyRows(ymKey);
      const newMonthObj: MonthlyRata2Data = {
        yearMonth: ymKey,
        year: yr,
        month: mo,
        label,
        updatedAt: new Date().toISOString(),
        rows
      };
      setCurrentData(newMonthObj);
      setEditableRows(rows);
    }
  };

  // Load when activeYearMonth changes
  useEffect(() => {
    loadMonthData(activeYearMonth);
  }, [activeYearMonth]);

  const handleSelectMonthYear = (ymKey: string) => {
    const [y, m] = ymKey.split("-");
    setSelectedYear(y);
    setSelectedMonth(m);
    setActiveYearMonth(ymKey);
    setIsEditing(false);
  };

  const handleCreateOrEditNewMonth = () => {
    const ymKey = `${selectedYear}-${selectedMonth}`;
    setActiveYearMonth(ymKey);
    setIsEditing(true);
  };

  const handleRowInputChange = (idx: number, field: keyof Rata2Row, value: string) => {
    const numVal = parseFloat(value) || 0;
    setEditableRows(prev => {
      const copy = [...prev];
      const updatedRow = { ...copy[idx], [field]: numVal };
      
      // Auto recalculate totalRata2 = yo + om + os + yt
      if (["yo", "om", "os", "yt"].includes(field)) {
        const totalR = (updatedRow.yo || 0) + (updatedRow.om || 0) + (updatedRow.os || 0) + (updatedRow.yt || 0);
        updatedRow.totalRata2 = parseFloat(totalR.toFixed(2));
      }
      copy[idx] = updatedRow;
      return copy;
    });
  };

  const getRata2CellValue = useCallback((r: number, c: number) => {
    const row = isEditing ? editableRows[r] : currentData?.rows?.[r];
    if (!row) return 0;
    if (c === 0) return row.yo || 0;
    if (c === 1) return row.om || 0;
    if (c === 2) return row.os || 0;
    if (c === 3) return row.yt || 0;
    if (c === 4) return row.totalRata2 || 0;
    return 0;
  }, [isEditing, editableRows, currentData]);

  const setRata2BatchCellValues = useCallback((updates: { r: number; c: number; val: number | string }[]) => {
    if (!isEditing) return;
    setEditableRows(prev => {
      const copy = [...prev];
      updates.forEach(({ r, c, val }) => {
        if (!copy[r]) return;
        const numVal = typeof val === "number" ? val : parseFloat(String(val).replace(/\./g, "").replace(",", ".")) || 0;
        const updatedRow = { ...copy[r] };
        if (c === 0) updatedRow.yo = numVal;
        else if (c === 1) updatedRow.om = numVal;
        else if (c === 2) updatedRow.os = numVal;
        else if (c === 3) updatedRow.yt = numVal;
        else if (c === 4) updatedRow.totalRata2 = numVal;

        if (c >= 0 && c < 4) {
          const totalR = (updatedRow.yo || 0) + (updatedRow.om || 0) + (updatedRow.os || 0) + (updatedRow.yt || 0);
          updatedRow.totalRata2 = parseFloat(totalR.toFixed(2));
        }
        copy[r] = updatedRow;
      });
      return copy;
    });
  }, [isEditing]);

  const {
    selection: rata2Selection,
    setSelection: setRata2Selection,
    activeCell: rata2ActiveCell,
    activeCellValue: rata2ActiveCellValue,
    isActiveCellEditable: isRata2ActiveCellEditable,
    handleActiveCellValueChange: handleRata2ActiveCellValueChange,
    goToNextCell: goToNextRata2Cell,
    goToPrevCell: goToPrevRata2Cell,
    renderSelectionHandle: renderRata2SelectionHandle,
    isMenuOpen: rata2IsMenuOpen,
    setIsMenuOpen: setRata2IsMenuOpen,
    menuPos: rata2MenuPos,
    getCellProps: getRata2CellProps,
    handleCopy: handleRata2Copy,
    handleCut: handleRata2Cut,
    handlePaste: handleRata2Paste,
    handleClear: handleRata2Clear,
    clipboardModal: rata2ClipboardModal,
    confirmManualPaste: rata2ConfirmManualPaste,
    closeClipboardModal: closeRata2CloseClipboardModal,
  } = useSimpleGrid({
    totalRows: (isEditing ? editableRows : (currentData?.rows || [])).length,
    totalCols: 5,
    isCellEditable: () => isEditing,
    getCellValue: getRata2CellValue,
    setBatchCellValues: setRata2BatchCellValues
  });

  // Save Month Data permanently to Local and Supabase
  const handleSavePermanently = async () => {
    const ymKey = activeYearMonth;
    const [yr, mo] = ymKey.split("-");
    const label = `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${yr}`;

    setIsSaving(true);
    setStatusMsg(`⏳ Menyimpan data Rata-Rata Bulanan ${label} ke Supabase...`);

    const sumTotalAll = editableRows.reduce((acc, r) => acc + (r.total || 0), 0);
    const sumRata2All = editableRows.reduce((acc, r) => acc + (r.totalRata2 || 0), 0);
    const activeCount = editableRows.length > 0 ? editableRows.length : 10;
    const daysInMonth = new Date(parseInt(yr, 10) || 2026, parseInt(mo, 10) || 8, 0).getDate();
    const safePembagi = currentData?.pembagi || (sumTotalAll > 0 && sumRata2All > 0 ? Math.round(sumTotalAll / sumRata2All) : daysInMonth);
    const jwpVal = activeCount * safePembagi;
    const salesPerYL = jwpVal > 0 ? Math.round(sumTotalAll / jwpVal) : (activeCount > 0 ? Math.round(sumRata2All / activeCount) : 0);

    const updatedData: MonthlyRata2Data = {
      yearMonth: ymKey,
      year: yr,
      month: mo,
      label,
      updatedAt: new Date().toISOString(),
      pembagi: safePembagi,
      jwp: jwpVal,
      salesPerYL,
      absen: currentData?.absen || { jumlahYL: 0, frekuensi: 0 },
      rows: editableRows
    };

    // 1. Save locally
    try {
      localStorage.setItem(`rata2_bulanan_${ymKey}`, JSON.stringify(updatedData));
      const newIndex = Array.from(new Set([...savedMonthsList, ymKey])).sort().reverse();
      setSavedMonthsList(newIndex);
      localStorage.setItem("rata2_bulanan_index", JSON.stringify(newIndex));
    } catch (e) {}

    // 2. Save to Supabase
    try {
      await saveToSupabase(`rata2_bulanan_${ymKey}`, updatedData);
      const newIndex = Array.from(new Set([...savedMonthsList, ymKey])).sort().reverse();
      await saveToSupabase("rata2_bulanan_index", newIndex);
      
      setStatusMsg(`✅ Berhasil! Data Rata-Rata Bulanan ${label} tersimpan abadi di Supabase & penyimpanan lokal.`);
      setCurrentData(updatedData);
      setIsEditing(false);
    } catch (e: any) {
      setStatusMsg(`⚠️ Tersimpan di lokal, namun gagal sync ke Supabase: ${e.message || "Error jaringan"}`);
      setCurrentData(updatedData);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
      setTimeout(() => setStatusMsg(""), 5000);
    }
  };

  // Delete Month Data permanently from Local and Supabase
  const handleConfirmDeletePermanently = async () => {
    if (!deleteModalMonth) return;
    const { ym, label } = deleteModalMonth;

    setIsDeleting(true);
    setStatusMsg(`⏳ Menghapus permanen data ${label} dari Supabase agar memori longgar...`);

    // 1. Remove from LocalStorage
    try {
      localStorage.removeItem(`rata2_bulanan_${ym}`);
      const updatedIndex = savedMonthsList.filter(x => x !== ym);
      setSavedMonthsList(updatedIndex);
      localStorage.setItem("rata2_bulanan_index", JSON.stringify(updatedIndex));
    } catch (e) {}

    // 2. Delete permanently from Supabase
    try {
      await deleteFromSupabase(`rata2_bulanan_${ym}`);
      const updatedIndex = savedMonthsList.filter(x => x !== ym);
      await saveToSupabase("rata2_bulanan_index", updatedIndex);

      setStatusMsg(`🗑️ Data Rata-Rata Bulanan ${label} telah DIHAPUS PERMANEN dari Supabase & penyimpanan lokal! Memori Supabase kembali longgar.`);
      
      if (activeYearMonth === ym) {
        const nextMonth = updatedIndex.length > 0 ? updatedIndex[0] : "2025-01";
        handleSelectMonthYear(nextMonth);
      }
    } catch (e: any) {
      setStatusMsg(`❌ Gagal menghapus permanen dari Supabase: ${e.message}`);
    } finally {
      setIsDeleting(false);
      setDeleteModalMonth(null);
      setTimeout(() => setStatusMsg(""), 6000);
    }
  };

  // Summary calculations
  const totals = useMemo(() => {
    const rows = isEditing ? editableRows : (currentData?.rows || []);
    let sumTotal = 0;
    let sumYo = 0;
    let sumOm = 0;
    let sumOs = 0;
    let sumYt = 0;
    let sumRata2 = 0;

    rows.forEach(r => {
      sumTotal += r.total || 0;
      sumYo += r.yo || 0;
      sumOm += r.om || 0;
      sumOs += r.os || 0;
      sumYt += r.yt || 0;
      sumRata2 += r.totalRata2 || 0;
    });

    return {
      total: sumTotal,
      yo: parseFloat(sumYo.toFixed(2)),
      om: parseFloat(sumOm.toFixed(2)),
      os: parseFloat(sumOs.toFixed(2)),
      yt: parseFloat(sumYt.toFixed(2)),
      totalRata2: parseFloat(sumRata2.toFixed(2))
    };
  }, [isEditing, editableRows, currentData]);

  const allMonthsOptions = useMemo(() => {
    const options = [];
    for (let year = 2028; year >= 2024; year--) {
      for (let month = 12; month >= 1; month--) {
        const mm = String(month).padStart(2, "0");
        options.push(`${year}-${mm}`);
      }
    }
    return options;
  }, []);

  const activeLabel = `${MONTH_NAMES[parseInt(selectedMonth, 10) - 1]} ${selectedYear}`;

  // Perbandingan Vs Tahun Lalu: cari data arsip tahun sebelumnya untuk bulan yang sama.
  // Otomatis fallback ke monthly_archive -> rata2_bulanan -> sales_record_tku -> baseline
  // historis 2025, jadi tetap muncul walau bulan ini belum ada di record TKU tahun berjalan.
  const vsTahunLalu = useMemo(() => {
    const monthIdx = parseInt(selectedMonth, 10) - 1;
    const prev = getPreviousYearDataSync(selectedYear, monthIdx);
    if (!prev.found || !prev.ratarataPenjualanTahunLalu) return null;
    const persen = totals.totalRata2 > 0
      ? Number(((totals.totalRata2 / prev.ratarataPenjualanTahunLalu) * 100).toFixed(1))
      : null;
    return { ...prev, persen };
  }, [selectedYear, selectedMonth, totals.totalRata2]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header Panel */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-emerald-500/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-400/30">
              <Calendar className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-emerald-300">
                Menu Data Rata-Rata Bulanan
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Input manual, kelola, dan hapus permanen data rata-rata penjualan per bulan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full border border-emerald-400/30 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              Tersimpan di Cloud Supabase
            </span>
          </div>
        </div>
      </div>

      {/* Control Toolbar: Unified Month Picker & Quick Actions */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-end">
          
          {/* Unified Dropdown Selector */}
          <div className="space-y-1.5 w-full md:w-auto flex-1 max-w-sm">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
              Pilih Bulan & Tahun
            </label>
            <select
              value={activeYearMonth}
              onChange={(e) => handleSelectMonthYear(e.target.value)}
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              {allMonthsOptions.map(ymKey => {
                const [yr, mo] = ymKey.split("-");
                const lbl = `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${yr}`;
                const isSaved = savedMonthsList.includes(ymKey);
                return (
                  <option key={ymKey} value={ymKey}>
                    {isSaved ? "✅ " : "📅 "}{lbl} {isSaved ? "(Tersimpan)" : "(Kosong)"}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            {!isEditing ? (
              <button
                onClick={handleCreateOrEditNewMonth}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Input / Edit Manual ({activeLabel})</span>
              </button>
            ) : (
              <button
                onClick={handleSavePermanently}
                disabled={isSaving}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? "Menyimpan..." : `Simpan Permanen (${activeLabel})`}</span>
              </button>
            )}

            {savedMonthsList.includes(activeYearMonth) && (
              <button
                onClick={() => setDeleteModalMonth({ ym: activeYearMonth, label: activeLabel })}
                className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-all cursor-pointer flex items-center gap-1.5"
                title="Hapus permanen data bulan ini dari Supabase & lokal"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Hapus Data</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback Message */}
        {statusMsg && (
          <div className={`p-3 rounded-xl border text-xs font-bold text-center animate-fade-in flex items-center justify-center gap-2 ${
            statusMsg.includes("⚠️") || statusMsg.includes("❌")
              ? "bg-amber-50 border-amber-300 text-amber-900"
              : statusMsg.includes("🗑️")
              ? "bg-rose-50 border-rose-300 text-rose-900"
              : "bg-emerald-50 border-emerald-300 text-emerald-900"
          }`}>
            {statusMsg}
          </div>
        )}
      </div>

      {/* Main Table View / Edit Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
        <div className="bg-emerald-950 text-white p-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2">
              <span>Hasil {selectedYear} - BULAN TH {selectedYear}</span>
              <span className="bg-emerald-500 text-white text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                {activeLabel}
              </span>
            </h3>
            <p className="text-[10px] text-emerald-200 mt-0.5">
              Tabel Rekapitulasi Rata-Rata Penjualan Per Yakult Lady ({activeLabel})
            </p>
            {vsTahunLalu && (
              <p className="text-[10px] text-emerald-300 mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="bg-emerald-700/60 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
                  vs Tahun Lalu: {vsTahunLalu.persen !== null ? `${vsTahunLalu.persen}%` : "-"}
                </span>
                <span className="text-emerald-400/80">
                  ({vsTahunLalu.sourceDescription}: {vsTahunLalu.ratarataPenjualanTahunLalu.toLocaleString("id-ID")} btl/hari)
                </span>
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-2 pt-1 border-t border-emerald-800/60 text-[10px]">
              {(() => {
                const sYr = parseInt(selectedYear, 10) || 2026;
                const sMo = parseInt(selectedMonth, 10) || 8;
                const calDays = new Date(sYr, sMo, 0).getDate();
                const displayPembagi = currentData?.pembagi || (totals.totalRata2 > 0 && totals.total > 0 ? Math.round(totals.total / totals.totalRata2) : calDays);
                const displayJwp = currentData?.jwp || ((editableRows.length || 10) * displayPembagi);
                return (
                  <>
                    <span className="bg-emerald-800/80 text-emerald-200 px-2 py-0.5 rounded font-medium">
                      Pembagi: <strong className="text-white">{displayPembagi} Hari</strong>
                    </span>
                    <span className="bg-emerald-800/80 text-emerald-200 px-2 py-0.5 rounded font-medium">
                      JWP: <strong className="text-white">{displayJwp}</strong>
                    </span>
                  </>
                );
              })()}
              <span className="bg-amber-500/20 border border-amber-400/30 text-amber-200 px-2 py-0.5 rounded font-bold">
                S/YL: <strong className="text-white">{currentData?.salesPerYL || (totals.totalRata2 > 0 ? Math.round(totals.totalRata2 / (editableRows.length || 10)) : 0)} btl</strong>
              </span>
              {currentData?.absen && (currentData.absen.jumlahYL > 0 || currentData.absen.frekuensi > 0) && (
                <span className="bg-rose-500/20 border border-rose-400/30 text-rose-200 px-2 py-0.5 rounded font-medium">
                  Absen: <strong className="text-white">{currentData.absen.jumlahYL} YL ({currentData.absen.frekuensi} Hari)</strong>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyTable}
              className="bg-emerald-800 hover:bg-emerald-700 text-emerald-100 font-bold text-xs px-2.5 py-1.5 rounded-xl transition-all border border-emerald-700 cursor-pointer flex items-center gap-1"
              title="Salin seluruh tabel ke clipboard untuk Excel"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin Tabel</span>
            </button>

            <button
              onClick={handleDirectPasteFromClipboard}
              className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs px-2.5 py-1.5 rounded-xl transition-all border border-emerald-600 cursor-pointer flex items-center gap-1 shadow-xs"
              title="Paste data dari Excel / Spreadsheet"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Paste Excel</span>
            </button>

            {isEditing ? (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] px-3 py-1 rounded-full font-bold animate-pulse">
                ✏️ Mode Edit Aktif
              </span>
            ) : (
              <button
                onClick={handleCreateOrEditNewMonth}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition-all shadow cursor-pointer flex items-center gap-1"
              >
                ✏️ Edit Data
              </button>
            )}
          </div>
        </div>

        {/* Spreadsheet Input Bar */}
        <SpreadsheetInputBar
          activeCell={rata2ActiveCell}
          value={rata2ActiveCellValue}
          isEditable={isRata2ActiveCellEditable}
          onChange={handleRata2ActiveCellValueChange}
          onEnter={goToNextRata2Cell}
          onTab={goToNextRata2Cell}
          onShiftTab={goToPrevRata2Cell}
        />

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-950 dark:text-emerald-100 font-extrabold border-b border-emerald-200">
                <th className="p-2.5 border-r border-emerald-200 w-16 text-center">Area</th>
                <th className="p-2.5 border-r border-emerald-200 min-w-[140px]">Nama YL</th>
                <th className="p-2.5 border-r border-emerald-200 bg-red-100 text-red-950 text-right w-28">YO</th>
                <th className="p-2.5 border-r border-emerald-200 bg-amber-100 text-amber-950 text-right w-28">OM</th>
                <th className="p-2.5 border-r border-emerald-200 bg-fuchsia-100 text-fuchsia-950 text-right w-28">OS</th>
                <th className="p-2.5 border-r border-emerald-200 bg-sky-100 text-sky-950 text-right w-28">YT</th>
                <th className="p-2.5 bg-emerald-300 text-emerald-950 font-black text-right min-w-[130px]">RATA-RATA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
              {(isEditing ? editableRows : (currentData?.rows || [])).map((row, idx) => (
                <tr key={row.area || idx} className="hover:bg-slate-50 transition-colors">
                  <td className="p-2.5 border-r border-slate-200 font-bold text-center bg-slate-50 text-slate-700">
                    {row.area}
                  </td>
                  <td className="p-2.5 border-r border-slate-200 font-bold text-slate-900">
                    {row.nama}
                  </td>

                  {/* YO */}
                  <td
                    {...getRata2CellProps(idx, 0)}
                    className={`p-2 border-r border-slate-200 text-right font-bold text-red-700 relative select-none ${getRata2CellProps(idx, 0).className}`}
                  >
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={row.yo}
                        onChange={(e) => handleRowInputChange(idx, "yo", e.target.value)}
                        onPaste={(e) => handleInputCellPaste(e, idx, "yo")}
                        className="w-full p-1 text-right bg-white border border-slate-300 rounded text-xs font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      />
                    ) : (
                      row.yo.toFixed(2)
                    )}
                    {renderRata2SelectionHandle(idx, 0)}
                  </td>

                  {/* OM */}
                  <td
                    {...getRata2CellProps(idx, 1)}
                    className={`p-2 border-r border-slate-200 text-right font-bold text-amber-700 relative select-none ${getRata2CellProps(idx, 1).className}`}
                  >
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={row.om}
                        onChange={(e) => handleRowInputChange(idx, "om", e.target.value)}
                        onPaste={(e) => handleInputCellPaste(e, idx, "om")}
                        className="w-full p-1 text-right bg-white border border-slate-300 rounded text-xs font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                    ) : (
                      row.om.toFixed(2)
                    )}
                    {renderRata2SelectionHandle(idx, 1)}
                  </td>

                  {/* OS */}
                  <td
                    {...getRata2CellProps(idx, 2)}
                    className={`p-2 border-r border-slate-200 text-right font-bold text-fuchsia-700 relative select-none ${getRata2CellProps(idx, 2).className}`}
                  >
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={row.os}
                        onChange={(e) => handleRowInputChange(idx, "os", e.target.value)}
                        onPaste={(e) => handleInputCellPaste(e, idx, "os")}
                        className="w-full p-1 text-right bg-white border border-slate-300 rounded text-xs font-bold focus:ring-2 focus:ring-fuchsia-500 outline-none"
                      />
                    ) : (
                      row.os.toFixed(2)
                    )}
                    {renderRata2SelectionHandle(idx, 2)}
                  </td>

                  {/* YT */}
                  <td
                    {...getRata2CellProps(idx, 3)}
                    className={`p-2 border-r border-slate-200 text-right font-bold text-sky-700 relative select-none ${getRata2CellProps(idx, 3).className}`}
                  >
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={row.yt}
                        onChange={(e) => handleRowInputChange(idx, "yt", e.target.value)}
                        onPaste={(e) => handleInputCellPaste(e, idx, "yt")}
                        className="w-full p-1 text-right bg-white border border-slate-300 rounded text-xs font-bold focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    ) : (
                      row.yt.toFixed(2)
                    )}
                    {renderRata2SelectionHandle(idx, 3)}
                  </td>

                  {/* TOTAL RATA-RATA */}
                  <td
                    {...getRata2CellProps(idx, 4)}
                    className={`p-2 bg-emerald-100/70 text-right font-black text-emerald-950 border-l border-emerald-200 relative select-none ${getRata2CellProps(idx, 4).className}`}
                  >
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={row.totalRata2}
                        onChange={(e) => handleRowInputChange(idx, "totalRata2", e.target.value)}
                        onPaste={(e) => handleInputCellPaste(e, idx, "totalRata2")}
                        className="w-full p-1 text-right bg-white border border-emerald-400 rounded text-xs font-black text-emerald-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    ) : (
                      row.totalRata2.toFixed(2)
                    )}
                    {renderRata2SelectionHandle(idx, 4)}
                  </td>
                </tr>
              ))}
            </tbody>

            {/* TOTAL FOOTER ROW */}
            <tfoot>
              <tr className="bg-amber-100 text-amber-950 font-black border-t-2 border-amber-300 text-xs">
                <td className="p-3 text-center border-r border-amber-200" colSpan={2}>
                  TOTAL REKAPITULASI ({activeLabel})
                </td>
                <td className="p-3 text-right border-r border-amber-200 text-red-950">
                  {totals.yo.toFixed(2)}
                </td>
                <td className="p-3 text-right border-r border-amber-200 text-amber-950">
                  {totals.om.toFixed(2)}
                </td>
                <td className="p-3 text-right border-r border-amber-200 text-fuchsia-950">
                  {totals.os.toFixed(2)}
                </td>
                <td className="p-3 text-right border-r border-amber-200 text-sky-950">
                  {totals.yt.toFixed(2)}
                </td>
                <td className="p-3 text-right bg-amber-200 text-emerald-950 font-black text-sm">
                  {totals.totalRata2.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>

          <GridSelectionToolbar
            selection={rata2Selection}
            menuPos={rata2MenuPos}
            isMenuOpen={rata2IsMenuOpen}
            onClose={() => setRata2IsMenuOpen(false)}
            onCopy={handleRata2Copy}
            onCut={handleRata2Cut}
            onPaste={handleRata2Paste}
            onClear={handleRata2Clear}
          />

          {rata2ClipboardModal && (
            <ClipboardFallbackModal
              mode={rata2ClipboardModal.mode}
              initialText={rata2ClipboardModal.text}
              onConfirmPaste={rata2ConfirmManualPaste}
              onClose={closeRata2CloseClipboardModal}
            />
          )}
        </div>

        {/* Footer save bar in edit mode */}
        {isEditing && (
          <div className="p-4 bg-emerald-50 border-t border-emerald-200 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-emerald-900 font-bold flex items-center gap-2">
              <span>💡 Setelah selesai mengubah angka di atas, klik tombol simpan untuk menyimpan permanen ke Supabase.</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleSavePermanently}
                disabled={isSaving}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? "Menyimpan..." : "💾 Simpan Permanen ke Supabase"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Permanent Delete */}
      {deleteModalMonth && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-rose-300 dark:border-rose-900">
            <div className="flex items-center justify-between border-b border-rose-100 dark:border-rose-900/50 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-rose-100 text-rose-600 rounded-xl font-bold">⚠️</span>
                <div>
                  <h3 className="text-sm font-black text-rose-950 dark:text-rose-200 uppercase">
                    Konfirmasi Hapus Permanen
                  </h3>
                  <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                    Pembersihan Memori Supabase Cloud
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDeleteModalMonth(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                Apakah Anda yakin ingin menghapus data <strong>Rata-Rata Bulanan ({deleteModalMonth.label})</strong>?
              </p>
              <div className="p-3 bg-rose-50 dark:bg-rose-950/60 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs space-y-1">
                <p className="font-extrabold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Efek Penghapusan Permanen:</span>
                </p>
                <ul className="list-disc pl-5 text-[11px] space-y-0.5 text-rose-800 dark:text-rose-300">
                  <li>Data bulan <strong>{deleteModalMonth.label}</strong> akan dihapus permanen dari Supabase Cloud.</li>
                  <li>Memori di Supabase akan menjadi longgar & bersih kembali.</li>
                  <li>Data di penyimpanan browser lokal juga dihapus permanen.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteModalMonth(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Batal
              </button>

              <button
                onClick={handleConfirmDeletePermanently}
                disabled={isDeleting}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? "Menghapus..." : "Ya, Hapus Permanen dari Supabase"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Paste Data Excel */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-emerald-300 dark:border-emerald-800">
            <div className="flex items-center justify-between border-b border-emerald-100 dark:border-emerald-900/50 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl font-bold">📋</span>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-emerald-200 uppercase">
                    Paste Data dari Excel / Spreadsheet
                  </h3>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                    Tempelkan kolom YO, OM, OS, YT dari Excel di sini
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                Copy/blok tabel dari Excel atau Google Sheets (kolom: <strong>YO, OM, OS, YT</strong> atau dengan Area/Nama) lalu paste di kotak di bawah ini:
              </p>
              <textarea
                value={pasteInputText}
                onChange={(e) => setPasteInputText(e.target.value)}
                rows={6}
                placeholder={"Contoh format dari Excel:\n332.26\t22.58\t0\t7.26\n396.77\t52.42\t0\t19.35\n..."}
                className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  processPastedText(pasteInputText);
                  setPasteInputText("");
                  setShowPasteModal(false);
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow cursor-pointer flex items-center gap-1.5"
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>Proses & Terapkan ke Tabel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
