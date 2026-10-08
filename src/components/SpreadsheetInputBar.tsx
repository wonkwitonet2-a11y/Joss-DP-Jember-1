import React, { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X, Check, Calculator } from "lucide-react";

export interface SpreadsheetInputBarProps {
  activeCell: { r: number; c: number } | null;
  cellLabel?: string;
  value: number | string;
  isEditable?: boolean;
  onChange: (val: number | string) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDone?: () => void;
}

export const SpreadsheetInputBar: React.FC<SpreadsheetInputBarProps> = ({
  activeCell,
  cellLabel,
  value,
  isEditable = true,
  onChange,
  onPrev,
  onNext,
  onDone,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input when activeCell changes on user tap
  useEffect(() => {
    if (activeCell && isEditable && inputRef.current) {
      // Focus without scrolling parent container
      try {
        inputRef.current.focus({ preventScroll: true });
        inputRef.current.select();
      } catch (_) {
        inputRef.current.focus();
      }
    }
  }, [activeCell?.r, activeCell?.c, isEditable]);

  if (!activeCell) return null;

  return (
    <div
      data-spreadsheet-bar="true"
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-300 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] p-2 sm:px-4 flex flex-col gap-1.5 animate-in slide-in-from-bottom duration-150 select-none"
    >
      <div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-2">
        {/* Cell Identifier Badge */}
        <div className="flex items-center gap-1.5 shrink-0 max-w-[40%] sm:max-w-none truncate">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold font-mono truncate shadow-xs">
            <Calculator size={13} className="shrink-0 text-blue-600" />
            <span className="truncate">{cellLabel || `R${activeCell.r + 1} : C${activeCell.c + 1}`}</span>
          </span>
          {!isEditable && (
            <span className="text-[11px] font-semibold text-slate-500 hidden sm:inline">
              (Rumus Otomatis)
            </span>
          )}
        </div>

        {/* Quick Navigation & Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {onPrev && (
            <button
              type="button"
              onClick={onPrev}
              className="p-1.5 hover:bg-slate-100 active:bg-slate-200 rounded-lg text-slate-600 border border-slate-200 transition-colors cursor-pointer"
              title="Kolom Sebelumnya (Shift+Tab)"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              className="p-1.5 hover:bg-slate-100 active:bg-slate-200 rounded-lg text-slate-600 border border-slate-200 transition-colors cursor-pointer"
              title="Kolom Selanjutnya (Tab / Enter)"
            >
              <ChevronRight size={16} />
            </button>
          )}
          {isEditable && (
            <button
              type="button"
              onClick={() => onChange(0)}
              className="p-1.5 hover:bg-rose-50 active:bg-rose-100 text-slate-500 hover:text-rose-600 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              title="Kosongkan / Reset ke 0"
            >
              <X size={16} />
            </button>
          )}
          {onDone && (
            <button
              type="button"
              onClick={onDone}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
              title="Selesai (Tutup Keyboard)"
            >
              <Check size={14} />
              <span>Selesai</span>
            </button>
          )}
        </div>
      </div>

      {/* Input Area (Full Width, Large, Clear) */}
      <div className="max-w-4xl mx-auto w-full flex items-center gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type={isEditable ? "number" : "text"}
            inputMode={isEditable ? "numeric" : "text"}
            readOnly={!isEditable}
            value={value === 0 || value === "0" ? "" : value}
            placeholder={isEditable ? "0 (Ketik angka...)" : "Hasil hitung otomatis"}
            onChange={(e) => {
              if (!isEditable) return;
              const raw = e.target.value;
              if (raw === "") {
                onChange(0);
              } else {
                const num = parseInt(raw, 10);
                onChange(isNaN(num) ? 0 : Math.max(0, num));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onNext?.();
              } else if (e.key === "Tab") {
                e.preventDefault();
                if (e.shiftKey) {
                  onPrev?.();
                } else {
                  onNext?.();
                }
              } else if (e.key === "Escape") {
                e.preventDefault();
                onDone?.();
              }
            }}
            className={`w-full px-3.5 py-1.5 text-base sm:text-lg font-black font-mono rounded-xl border transition-all outline-none ${
              isEditable
                ? "bg-blue-50/40 text-slate-900 border-blue-300 focus:bg-white focus:border-blue-600 focus:ring-3 focus:ring-blue-100"
                : "bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed"
            }`}
          />
        </div>
      </div>
    </div>
  );
};
