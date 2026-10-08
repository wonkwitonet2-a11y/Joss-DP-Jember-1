import React from "react";
import { cleanYlName } from "../types";

interface TargetManagerRowProps {
  yl: any;
  idx: number;
  targetYLMap: Record<string, { target: number; bln_lalu: number; thn_lalu: number }>;
  setTargetYLMap: React.Dispatch<
    React.SetStateAction<Record<string, { target: number; bln_lalu: number; thn_lalu: number }>>
  >;
  getTargetCellProps: (r: number, c: number) => { className?: string; [key: string]: any };
  renderTargetSelectionHandle?: (r: number, c: number) => React.ReactNode;
  selectTargetRow: (idx: number) => void;
  setTargetGridSelection?: any;
  handleTargetGridPaste?: any;
}

// One row of the "Target Manager" table (Target / Bulan Lalu / Tahun Lalu per
// YL). Memoized so it only re-renders when its own data actually changes.
function TargetManagerRowInner({
  yl,
  idx,
  targetYLMap,
  getTargetCellProps,
  renderTargetSelectionHandle,
  selectTargetRow,
}: TargetManagerRowProps) {
  const ylTgt = targetYLMap[yl.area] ?? { target: 0, bln_lalu: 0, thn_lalu: 0 };

  const cellProps0 = getTargetCellProps(idx, 0);
  const cellProps1 = getTargetCellProps(idx, 1);
  const cellProps2 = getTargetCellProps(idx, 2);

  const formatVal = (v: any) => {
    if (v === undefined || v === null || v === "") return "0";
    const num = Number(v);
    if (isNaN(num)) return "0";
    return num.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  return (
    <tr className="hover:bg-amber-50/50 transition-colors">
      <td
        data-r={idx}
        className="p-2.5 border-r-2 border-slate-300 bg-slate-50/80 cursor-pointer hover:bg-amber-100 transition-colors select-none"
        onClick={() => selectTargetRow(idx)}
      >
        <span className="text-red-700 font-black mr-2">{yl.area}</span>
        <span className="text-slate-950 font-black">{cleanYlName(yl.nama)}</span>
      </td>
      <td
        {...cellProps0}
        className={`p-1.5 text-center border-r border-slate-300 font-black text-slate-900 select-none relative ${cellProps0.className || ""}`}
      >
        <span className="block truncate">{formatVal(ylTgt.target)}</span>
        {renderTargetSelectionHandle && renderTargetSelectionHandle(idx, 0)}
      </td>
      <td
        {...cellProps1}
        className={`p-1.5 text-center border-r border-slate-300 font-black text-slate-900 select-none relative ${cellProps1.className || ""}`}
      >
        <span className="block truncate">{formatVal(ylTgt.bln_lalu)}</span>
        {renderTargetSelectionHandle && renderTargetSelectionHandle(idx, 1)}
      </td>
      <td
        {...cellProps2}
        className={`p-1.5 text-center border-r border-slate-300 font-black text-slate-900 select-none relative ${cellProps2.className || ""}`}
      >
        <span className="block truncate">{formatVal(ylTgt.thn_lalu)}</span>
        {renderTargetSelectionHandle && renderTargetSelectionHandle(idx, 2)}
      </td>
    </tr>
  );
}

export const TargetManagerRow = React.memo(TargetManagerRowInner);
