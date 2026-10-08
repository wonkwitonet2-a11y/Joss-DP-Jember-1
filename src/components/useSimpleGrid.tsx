import React, { useState, useEffect, useCallback, useRef } from "react";

// Global in-memory clipboard for all grids across the entire application
let globalSharedClipboard: {
  text: string;
  matrix: string[][];
  copiedAt: number;
} | null = null;

// Track whether the user has left the browser window/tab (e.g. switched to Google Sheets / Excel)
let hasUserLeftAppSinceLastCopy = false;

if (typeof window !== "undefined") {
  window.addEventListener("blur", () => {
    hasUserLeftAppSinceLastCopy = true;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hasUserLeftAppSinceLastCopy = true;
    }
  });
}

export interface GridSelection {
  startR: number;
  startC: number;
  endR: number;
  endC: number;
}

export interface UseSimpleGridProps {
  totalRows: number;
  totalCols: number;
  isCellEditable?: (r: number, c: number) => boolean;
  getCellValue?: (r: number, c: number) => number | string;
  setCellValue?: (r: number, c: number, val: number | string) => void;
  setBatchCellValues?: (updates: { r: number; c: number; val: number | string }[]) => void;
  onRecordUndo?: () => void;
}

export function useSimpleGrid({
  totalRows,
  totalCols,
  isCellEditable = () => true,
  getCellValue,
  setCellValue,
  setBatchCellValues,
  onRecordUndo,
}: UseSimpleGridProps) {
  // Primary grid selection state
  const [selection, setSelection] = useState<GridSelection | null>(null);
  const selectionRef = useRef<GridSelection | null>(null);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // Active focused cell
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null);
  const activeCellRef = useRef<{ r: number; c: number } | null>(null);
  useEffect(() => {
    activeCellRef.current = activeCell;
  }, [activeCell]);

  // Handle drag state
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragAnchorRef = useRef<{ r: number; c: number } | null>(null);

  // Floating toolbar state (Copy, Paste, Cut, Clear)
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Clipboard & modals
  const [internalClipboard, setInternalClipboard] = useState<string[][] | null>(null);
  const [clipboardModal, setClipboardModal] = useState<{
    mode: "copy" | "paste";
    text: string;
    overrideSelection: GridSelection | null;
  } | null>(null);
  const [message, setMessage] = useState<string>("");

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  }, []);

  // Selection boundaries
  const minR = selection ? Math.min(selection.startR, selection.endR) : 0;
  const maxR = selection ? Math.max(selection.startR, selection.endR) : 0;
  const minC = selection ? Math.min(selection.startC, selection.endC) : 0;
  const maxC = selection ? Math.max(selection.startC, selection.endC) : 0;

  const isSelected = useCallback(
    (r: number, c: number) => {
      if (!selection) return false;
      return r >= minR && r <= maxR && c >= minC && c <= maxC;
    },
    [selection, minR, maxR, minC, maxC]
  );

  const isActiveCell = useCallback(
    (r: number, c: number) => {
      if (activeCell) {
        return activeCell.r === r && activeCell.c === c;
      }
      if (!selection) return false;
      return r === selection.endR && c === selection.endC;
    },
    [activeCell, selection]
  );

  // The corner cell where the Google Sheets selection handle is placed
  const isCornerCell = useCallback(
    (r: number, c: number) => {
      if (!selection) return false;
      return r === maxR && c === maxC;
    },
    [selection, maxR, maxC]
  );

  // Copy handler
  const handleCopy = useCallback(() => {
    setIsMenuOpen(false);
    if (!selection || !getCellValue) return;
    const rowsArr: string[][] = [];
    for (let r = minR; r <= maxR; r++) {
      const rowData: string[] = [];
      for (let c = minC; c <= maxC; c++) {
        rowData.push(String(getCellValue(r, c) ?? ""));
      }
      rowsArr.push(rowData);
    }
    const tsv = rowsArr.map((row) => row.join("\t")).join("\n");
    setInternalClipboard(rowsArr);
    globalSharedClipboard = {
      text: tsv,
      matrix: rowsArr,
      copiedAt: Date.now(),
    };
    hasUserLeftAppSinceLastCopy = false;

    // PENTING: jangan pakai `navigator.clipboard?.writeText(...).then().catch()`.
    // Kalau `navigator.clipboard` itu sendiri undefined (API tidak tersedia di
    // environment ini, misal WebView non-HTTPS), optional chaining bikin SELURUH
    // chain (termasuk .then/.catch) ikut short-circuit jadi tidak pernah jalan —
    // akibatnya modal fallback manual tidak pernah muncul. Cek eksplisit dulu.
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      setClipboardModal({ mode: "copy", text: tsv, overrideSelection: null });
      return;
    }

    try {
      navigator.clipboard
        .writeText(tsv)
        .then(() => {
          const cellCount = (maxR - minR + 1) * (maxC - minC + 1);
          showToast(`📋 ${cellCount} sel berhasil disalin`);
        })
        .catch(() => {
          setClipboardModal({ mode: "copy", text: tsv, overrideSelection: null });
        });
    } catch {
      setClipboardModal({ mode: "copy", text: tsv, overrideSelection: null });
    }
  }, [selection, minR, maxR, minC, maxC, getCellValue, showToast]);

  // Clear handler
  const handleClear = useCallback(() => {
    setIsMenuOpen(false);
    if (!selection || (!setCellValue && !setBatchCellValues)) return;
    onRecordUndo?.();

    let clearedCount = 0;
    const updates: { r: number; c: number; val: number | string }[] = [];

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (isCellEditable(r, c)) {
          updates.push({ r, c, val: 0 });
          clearedCount++;
        }
      }
    }

    if (setBatchCellValues) {
      setBatchCellValues(updates);
    } else if (setCellValue) {
      updates.forEach((u) => setCellValue(u.r, u.c, u.val));
    }
    if (clearedCount > 0) showToast(`🗑️ ${clearedCount} sel dikosongkan`);
  }, [selection, minR, maxR, minC, maxC, isCellEditable, setCellValue, setBatchCellValues, onRecordUndo, showToast]);

  // Cut handler
  const handleCut = useCallback(() => {
    handleCopy();
    handleClear();
  }, [handleCopy, handleClear]);

  // Paste handler
  const handlePaste = useCallback(
    (pastedText?: any, overrideSelection?: GridSelection | null) => {
      setIsMenuOpen(false);
      const activeSelection = overrideSelection || selection;
      if (!activeSelection || (!setCellValue && !setBatchCellValues)) return;

      const sMinR = Math.min(activeSelection.startR, activeSelection.endR);
      const sMaxR = Math.max(activeSelection.startR, activeSelection.endR);
      const sMinC = Math.min(activeSelection.startC, activeSelection.endC);
      const sMaxC = Math.max(activeSelection.startC, activeSelection.endC);

      const processPaste = (text: string) => {
        const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
        if (rawLines.length > 1 && rawLines[rawLines.length - 1] === "") {
          rawLines.pop();
        }
        if (rawLines.length === 0) return;

        const srcMatrix = rawLines.map((line) => line.split("\t"));
        const srcHeight = srcMatrix.length;
        const srcWidth = Math.max(...srcMatrix.map((r) => r.length));

        let pasteHeight = sMaxR - sMinR + 1;
        let pasteWidth = sMaxC - sMinC + 1;

        if (pasteHeight === 1 && pasteWidth === 1) {
          pasteHeight = srcHeight;
          pasteWidth = srcWidth;
        }

        onRecordUndo?.();

        const updates: { r: number; c: number; val: number | string }[] = [];
        let updatedCount = 0;

        for (let r = 0; r < pasteHeight; r++) {
          const targetR = sMinR + r;
          if (targetR >= totalRows) break;

          const srcR = r % srcHeight;
          const srcRow = srcMatrix[srcR] || [];

          for (let c = 0; c < pasteWidth; c++) {
            const targetC = sMinC + c;
            if (targetC >= totalCols) break;

            if (!isCellEditable(targetR, targetC)) continue;

            const srcC = c % srcWidth;
            let valStr = String(srcRow[srcC] || "0").trim();

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
            const finalVal = isNaN(cleanNum) ? valStr : Math.max(0, cleanNum);

            updates.push({ r: targetR, c: targetC, val: finalVal });
            updatedCount++;
          }
        }

        if (setBatchCellValues) {
          setBatchCellValues(updates);
        } else if (setCellValue) {
          updates.forEach((u) => setCellValue(u.r, u.c, u.val));
        }

        setSelection({
          startR: sMinR,
          startC: sMinC,
          endR: Math.min(totalRows - 1, sMinR + pasteHeight - 1),
          endC: Math.min(totalCols - 1, sMinC + pasteWidth - 1),
        });

        // Simpan data terakhir yang ditempel ke global clipboard dan tandai bahwa kita masih di dalam app
        setInternalClipboard(srcMatrix);
        globalSharedClipboard = {
          text,
          matrix: srcMatrix,
          copiedAt: Date.now(),
        };
        hasUserLeftAppSinceLastCopy = false;

        if (updatedCount > 0) showToast(`📥 ${updatedCount} sel berhasil ditempel`);
      };

      const fallbackToManualOrInternal = () => {
        // Hanya pakai internal clipboard JIKA pengguna TIDAK PERNAH keluar jendela aplikasi sejak salinan internal terakhir
        if (!hasUserLeftAppSinceLastCopy && (internalClipboard || globalSharedClipboard?.matrix)) {
          const matrix = internalClipboard || globalSharedClipboard?.matrix;
          if (matrix && matrix.length > 0) {
            const text = matrix.map((r) => r.join("\t")).join("\n");
            processPaste(text);
            return;
          }
        }
        // Pengguna sempat beralih ke aplikasi luar (misal Google Sheets) atau memori kosong,
        // buka modal dialog agar tidak salah menempelkan data lama!
        setClipboardModal({
          mode: "paste",
          text: "",
          overrideSelection: activeSelection,
        });
      };

      if (typeof pastedText === "string") {
        processPaste(pastedText);
      } else if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
        // Sama seperti di handleCopy: kalau API-nya sendiri tidak ada, jangan
        // pakai optional-chaining di depan .then/.catch (short-circuit bikin
        // fallback tidak pernah jalan) — cek eksplisit lalu fallback langsung.
        fallbackToManualOrInternal();
      } else {
        try {
          if (typeof window !== "undefined" && !document.hasFocus()) {
            try { window.focus(); } catch {}
          }
          navigator.clipboard
            .readText()
            .then((text) => {
              if (text && text.trim().length > 0) {
                processPaste(text);
              } else {
                fallbackToManualOrInternal();
              }
            })
            .catch(fallbackToManualOrInternal);
        } catch {
          fallbackToManualOrInternal();
        }
      }
    },
    [selection, totalRows, totalCols, isCellEditable, setCellValue, setBatchCellValues, internalClipboard, onRecordUndo, showToast]
  );

  const confirmManualPaste = useCallback(
    (text: string) => {
      if (clipboardModal?.mode === "paste") {
        handlePaste(text, clipboardModal.overrideSelection);
      }
      setClipboardModal(null);
    },
    [clipboardModal, handlePaste]
  );

  const closeClipboardModal = useCallback(() => setClipboardModal(null), []);

  const handleSelectAll = useCallback(() => {
    setSelection({
      startR: 0,
      startC: 0,
      endR: totalRows - 1,
      endC: totalCols - 1,
    });
    setActiveCell({ r: 0, c: 0 });
    showToast(`🔲 Seluruh tabel terpilih`);
  }, [totalRows, totalCols, showToast]);

  // =========================================================================
  // REQUIREMENT 3 & 4: SPREADSHEET SELECTION HANDLE DRAG (GAGANG SUDUT)
  // - Tarik gagang untuk memperluas blok tanpa mengganggu gestur scroll tabel
  // - Bisa melanjutkan blok yang terhenti dari jangkar sudut sebelumnya
  // - Menu floating TIDAK langsung muncul saat drag selesai
  // =========================================================================
  const startHandleDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const sel = selectionRef.current;
      if (!sel) return;

      // Anchor tetap berada di sudut yang berlawanan dari posisi handle (maxR, maxC),
      // yaitu sudut awal (minR, minC). Ini menjamin seleksi sebelumnya tidak terhapus
      // dan bisa melanjutkan blok yang terhenti secara mulus!
      const anchorR = Math.min(sel.startR, sel.endR);
      const anchorC = Math.min(sel.startC, sel.endC);
      dragAnchorRef.current = { r: anchorR, c: anchorC };

      isDraggingRef.current = true;
      setIsDragging(true);
      setIsMenuOpen(false);

      if (e.currentTarget && typeof (e.currentTarget as any).setPointerCapture === "function") {
        try {
          (e.currentTarget as any).setPointerCapture(e.pointerId);
        } catch (_) {}
      }
    },
    []
  );

  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || !dragAnchorRef.current) return;
      e.preventDefault();

      const rawEl = document.elementFromPoint(e.clientX, e.clientY);
      if (!rawEl) return;
      const targetEl = (rawEl instanceof Element ? rawEl : (rawEl as any)?.parentElement) as HTMLElement | null;
      if (!targetEl || typeof targetEl.closest !== "function") return;

      const td = targetEl.closest("td[data-r]");
      if (!td) return;

      const r = parseInt(td.getAttribute("data-r") || "-1", 10);
      const c = parseInt(td.getAttribute("data-c") || "-1", 10);

      if (r >= 0 && c >= 0) {
        const anchor = dragAnchorRef.current;
        setSelection((prev) => {
          if (prev && prev.startR === anchor.r && prev.startC === anchor.c && prev.endR === r && prev.endC === c) {
            return prev;
          }
          return {
            startR: anchor.r,
            startC: anchor.c,
            endR: r,
            endC: c,
          };
        });
      }
    };

    const handleGlobalPointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        // Requirement 3: Saat tarik blok selesai, JANGAN langsung muncul floating toolbar!
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("pointermove", handleGlobalPointerMove, { passive: false });
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
    };
  }, []);

  // =========================================================================
  // REQUIREMENT 1, 3, 5: CELL CLICK & TAP LOGIC
  // - Geser tabel murni scroll biasa (tidak ada touchmove drag di sel)
  // - Ketuk area terblok -> Toggle floating menu buka/tutup
  // - Ketuk sel di luar blok -> Blok hilang, ganti ke sel baru
  // =========================================================================
  const handleCellClick = useCallback(
    (r: number, c: number, clientX: number, clientY: number) => {
      const sel = selectionRef.current;
      const isInside =
        sel &&
        r >= Math.min(sel.startR, sel.endR) &&
        r <= Math.max(sel.startR, sel.endR) &&
        c >= Math.min(sel.startC, sel.endC) &&
        c <= Math.max(sel.startC, sel.endC);

      if (isInside) {
        // Requirement 3: Ketuk area terblok -> toggle menu floating
        setIsMenuOpen((prev) => {
          if (!prev) {
            setMenuPos({ x: clientX, y: clientY });
            return true;
          }
          return false;
        });
      } else {
        // Requirement 5: Klik sel lain di luar blok -> hilangkan blok lama, pilih sel ini
        setIsMenuOpen(false);
        setSelection({ startR: r, startC: c, endR: r, endC: c });
        setActiveCell({ r, c });
      }
    },
    []
  );

  // Requirement 5: Klik di luar tabel/toolbar -> hilangkan blok
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const rawTarget = e.target as any;
      if (!rawTarget) return;
      const target = (rawTarget instanceof Element ? rawTarget : rawTarget.parentElement) as HTMLElement | null;
      if (!target || typeof target.closest !== "function") return;

      // Jika klik terjadi di toolbar, input bar, modal, atau di dalam tabel sel: jangan batalkan
      if (
        target.closest("[data-grid-toolbar]") ||
        target.closest("[data-spreadsheet-bar]") ||
        target.closest("[data-grid-container]") ||
        target.closest("[data-r]") ||
        target.closest("[data-modal]") ||
        target.closest("button")
      ) {
        return;
      }

      setIsMenuOpen(false);
      setSelection(null);
      setActiveCell(null);
    };

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("touchstart", handleOutsideClick);

    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("touchstart", handleOutsideClick);
    };
  }, []);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || !selection) return;

      const key = e.key.toLowerCase();

      if (e.ctrlKey || e.metaKey) {
        if (key === "c") { e.preventDefault(); handleCopy(); return; }
        if (key === "x") { e.preventDefault(); handleCut(); return; }
        // Biarkan 'v' memicu event native 'paste' pada browser agar e.clipboardData dari Google Sheets/Excel
        // bisa langsung dibaca dan ditempel tanpa prompt izin atau modal konfirmasi!
        if (key === "a") { e.preventDefault(); handleSelectAll(); return; }
      }

      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        handleClear();
        return;
      }

      if (key === "escape") {
        e.preventDefault();
        setIsMenuOpen(false);
        setSelection(null);
        setActiveCell(null);
        return;
      }

      // Arrow navigation
      let { startR, startC, endR, endC } = selection;
      let moved = false;

      if (key === "arrowup") {
        if (e.shiftKey) { endR = Math.max(0, endR - 1); }
        else { startR = Math.max(0, startR - 1); endR = startR; startC = endC; }
        moved = true;
      } else if (key === "arrowdown") {
        if (e.shiftKey) { endR = Math.min(totalRows - 1, endR + 1); }
        else { startR = Math.min(totalRows - 1, startR + 1); endR = startR; startC = endC; }
        moved = true;
      } else if (key === "arrowleft") {
        if (e.shiftKey) { endC = Math.max(0, endC - 1); }
        else { startC = Math.max(0, startC - 1); endC = startC; startR = endR; }
        moved = true;
      } else if (key === "arrowright") {
        if (e.shiftKey) { endC = Math.min(totalCols - 1, endC + 1); }
        else { startC = Math.min(totalCols - 1, startC + 1); endC = startC; startR = endR; }
        moved = true;
      }

      if (moved) {
        e.preventDefault();
        setSelection({ startR, startC, endR, endC });
        setActiveCell({ r: endR, c: endC });
      }
    };

    const handleNativePaste = (e: ClipboardEvent) => {
      const activeTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") return;
      if (!selectionRef.current) return;

      const text = e.clipboardData?.getData("text/plain");
      if (text && text.length > 0) {
        e.preventDefault();
        handlePaste(text, selectionRef.current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handleNativePaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handleNativePaste);
    };
  }, [selection, totalRows, totalCols, handleCopy, handleCut, handlePaste, handleClear, handleSelectAll]);

  // Quick navigation helpers for active cell
  const goToNextCell = useCallback(() => {
    if (!activeCell) return;
    let nextC = activeCell.c + 1;
    let nextR = activeCell.r;

    // Cari sel berikutnya yang bisa diedit
    while (nextR < totalRows) {
      while (nextC < totalCols) {
        if (isCellEditable(nextR, nextC)) {
          setActiveCell({ r: nextR, c: nextC });
          setSelection({ startR: nextR, startC: nextC, endR: nextR, endC: nextC });
          return;
        }
        nextC++;
      }
      nextC = 0;
      nextR++;
    }
  }, [activeCell, totalRows, totalCols, isCellEditable]);

  const goToPrevCell = useCallback(() => {
    if (!activeCell) return;
    let prevC = activeCell.c - 1;
    let prevR = activeCell.r;

    while (prevR >= 0) {
      while (prevC >= 0) {
        if (isCellEditable(prevR, prevC)) {
          setActiveCell({ r: prevR, c: prevC });
          setSelection({ startR: prevR, startC: prevC, endR: prevR, endC: prevC });
          return;
        }
        prevC--;
      }
      prevC = totalCols - 1;
      prevR--;
    }
  }, [activeCell, totalCols, isCellEditable]);

  // Props generator for spreadsheet table cells (<td>)
  const getCellProps = useCallback(
    (r: number, c: number) => {
      const selected = isSelected(r, c);
      const active = isActiveCell(r, c);
      const corner = isCornerCell(r, c);

      return {
        "data-r": r,
        "data-c": c,
        className: `relative transition-colors cursor-cell ${
          selected
            ? active
              ? "!bg-blue-200/90 ring-2 ring-blue-600 ring-inset z-20"
              : "!bg-blue-100/80 ring-1 ring-blue-400 ring-inset z-10"
            : ""
        }`,
        style: {
          userSelect: "none" as const,
        },
        onClick: (e: React.MouseEvent) => {
          handleCellClick(r, c, e.clientX, e.clientY);
        },
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          if (!selected) {
            setSelection({ startR: r, startC: c, endR: r, endC: c });
            setActiveCell({ r, c });
          }
          setIsMenuOpen(true);
          setMenuPos({ x: e.clientX, y: e.clientY });
        },
      };
    },
    [isSelected, isActiveCell, isCornerCell, handleCellClick]
  );

  // Helper render gagang sudut (Google Sheets selection handle dot)
  const renderSelectionHandle = useCallback(
    (r: number, c: number) => {
      if (!isCornerCell(r, c)) return null;

      return (
        <div
          data-selection-handle="true"
          onPointerDown={startHandleDrag}
          className="absolute -bottom-2 -right-2 w-6 h-6 flex items-center justify-center z-50 cursor-crosshair touch-none select-none"
          title="Tarik bulatan ini untuk memperluas / melanjutkan blok"
        >
          <div className="w-3.5 h-3.5 bg-blue-600 border-2 border-white rounded-full shadow-md pointer-events-none transition-transform hover:scale-125 active:scale-150" />
        </div>
      );
    },
    [isCornerCell, startHandleDrag]
  );

  const selectColumn = useCallback(
    (c: number) => {
      setSelection({
        startR: 0,
        startC: c,
        endR: totalRows - 1,
        endC: c,
      });
      setActiveCell({ r: 0, c });
    },
    [totalRows]
  );

  const selectRow = useCallback(
    (r: number) => {
      setSelection({
        startR: r,
        startC: 0,
        endR: r,
        endC: totalCols - 1,
      });
      setActiveCell({ r, c: 0 });
    },
    [totalCols]
  );

  // Active cell value for the bottom formula/input bar
  const activeCellValue = activeCell && getCellValue ? getCellValue(activeCell.r, activeCell.c) : 0;
  const isActiveCellEditable = activeCell ? isCellEditable(activeCell.r, activeCell.c) : false;

  const handleActiveCellValueChange = useCallback(
    (val: number | string) => {
      if (!activeCell) return;
      if (setCellValue) {
        setCellValue(activeCell.r, activeCell.c, val);
      } else if (setBatchCellValues) {
        setBatchCellValues([{ r: activeCell.r, c: activeCell.c, val }]);
      }
    },
    [activeCell, setCellValue, setBatchCellValues]
  );

  return {
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
    setMenuPos,
    minR,
    maxR,
    minC,
    maxC,
    isSelected,
    isActiveCell,
    isCornerCell,
    isDragging,
    setIsDragging,
    message,
    getCellProps,
    renderSelectionHandle,
    startHandleDrag,
    selectColumn,
    selectRow,
    handleCopy,
    handleCut,
    handlePaste,
    handleClear,
    handleSelectAll,
    toolbarPos: menuPos,
    clipboardModal,
    confirmManualPaste,
    closeClipboardModal,
  };
}
