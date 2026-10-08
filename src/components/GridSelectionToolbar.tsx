import React from "react";
import { Copy, Scissors, ClipboardPaste, Trash2, X, CheckSquare } from "lucide-react";

export interface GridSelectionToolbarProps {
  selection: any;
  isMenuOpen?: boolean;
  menuPos?: { x: number; y: number } | null;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onClear: () => void;
  onClose: () => void;
  onSelectAll?: () => void;
}

export function GridSelectionToolbar({
  selection,
  isMenuOpen = true,
  menuPos,
  onCopy,
  onCut,
  onPaste,
  onClear,
  onClose,
  onSelectAll
}: GridSelectionToolbarProps) {
  if (!selection || isMenuOpen === false) return null;

  const rows = Math.abs(selection.endR - selection.startR) + 1;
  const cols = Math.abs(selection.endC - selection.startC) + 1;
  const totalCells = rows * cols;

  let style: React.CSSProperties = {};
  if (menuPos && typeof window !== "undefined") {
    const popupWidth = 320;
    const popupHeight = 50;
    const windowWidth = window.innerWidth;

    let left = menuPos.x - popupWidth / 2;
    if (left < 10) left = 10;
    if (left + popupWidth > windowWidth - 10) left = windowWidth - popupWidth - 10;

    let top = menuPos.y - popupHeight - 12;
    if (top < 10) {
      top = menuPos.y + 16;
    }

    style = {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      zIndex: 9999,
    };
  } else {
    style = {
      position: "fixed",
      top: "70px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 9999,
    };
  }

  return (
    <div
      data-grid-toolbar="true"
      style={style}
      className="bg-slate-900/95 text-white p-2 px-3 flex items-center justify-between gap-2 shadow-2xl rounded-xl border border-slate-700/80 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs font-bold bg-blue-600/30 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono">
          <span>{rows}x{cols}</span>
          <span className="text-[10px] text-slate-300 font-normal">({totalCells})</span>
        </span>
      </div>

      <div className="flex items-center gap-1">
        {onSelectAll && (
          <button
            onClick={onSelectAll}
            className="px-2 py-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors text-xs flex items-center gap-1 font-medium cursor-pointer"
            title="Pilih Semua Sel Tabel (Ctrl+A)"
          >
            <CheckSquare size={14} className="text-indigo-400" />
            <span className="hidden md:inline">Semua</span>
          </button>
        )}

        <button
          onClick={onCopy}
          className="px-2 py-1 hover:bg-slate-800 rounded text-blue-400 hover:text-blue-300 transition-colors text-xs flex items-center gap-1 font-semibold cursor-pointer"
          title="Salin ke Clipboard (Ctrl+C)"
        >
          <Copy size={14} />
          <span className="hidden sm:inline">Salin</span>
        </button>

        <button
          onClick={onCut}
          className="px-2 py-1 hover:bg-slate-800 rounded text-amber-400 hover:text-amber-300 transition-colors text-xs flex items-center gap-1 font-semibold cursor-pointer"
          title="Potong (Ctrl+X)"
        >
          <Scissors size={14} />
          <span className="hidden sm:inline">Potong</span>
        </button>

        <button
          onClick={onPaste}
          className="px-2 py-1 hover:bg-slate-800 rounded text-emerald-400 hover:text-emerald-300 transition-colors text-xs flex items-center gap-1 font-semibold cursor-pointer"
          title="Tempel Teks/Tabel (Ctrl+V)"
        >
          <ClipboardPaste size={14} />
          <span className="hidden sm:inline">Tempel</span>
        </button>

        <button
          onClick={onClear}
          className="px-2 py-1 hover:bg-slate-800 rounded text-rose-400 hover:text-rose-300 transition-colors text-xs flex items-center gap-1 font-semibold cursor-pointer"
          title="Kosongkan Nilai Sel (Delete / Backspace)"
        >
          <Trash2 size={14} />
          <span className="hidden sm:inline">Hapus</span>
        </button>

        <div className="w-px h-5 bg-slate-700 mx-1"></div>

        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Tutup Menu"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

