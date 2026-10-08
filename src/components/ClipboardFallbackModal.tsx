import React, { useEffect, useRef, useState } from "react";
import { Copy, ClipboardPaste, X } from "lucide-react";
import type { GridSelection } from "./useSimpleGrid";

export interface ClipboardFallbackModalProps {
  mode: "copy" | "paste";
  initialText: string;
  onConfirmPaste: (text: string) => void;
  onClose: () => void;
}

export function ClipboardFallbackModal({
  mode,
  initialText,
  onConfirmPaste,
  onClose,
}: ClipboardFallbackModalProps) {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mode === "copy" && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
      try {
        document.execCommand("copy");
      } catch {
        // do nothing
      }
    } else if (mode === "paste" && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [mode]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: 16,
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
            {mode === "copy" ? (
              <>
                <Copy size={16} className="text-blue-500" /> Salin Data (Manual)
              </>
            ) : (
              <>
                <ClipboardPaste size={16} className="text-emerald-500" /> Tempel Data (Manual)
              </>
            )}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-2">
          {mode === "copy"
            ? 'Tahan (long-press) teks di bawah ini, lalu pilih "Salin Semua" dari menu keyboard.'
            : 'Tahan (long-press) di kotak kosong di bawah ini, lalu pilih "Tempel" dari menu keyboard.'}
        </p>

        <textarea
          ref={textareaRef}
          value={text}
          readOnly={mode === "copy"}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === "paste" ? "Tempel data di sini..." : undefined}
          className="w-full h-40 border border-slate-300 rounded-lg p-2 text-xs font-mono"
        />

        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-600"
          >
            {mode === "copy" ? "Tutup" : "Batal"}
          </button>
          {mode === "paste" && (
            <button
              onClick={() => onConfirmPaste(text)}
              className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white font-semibold"
            >
              Gunakan Data
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
