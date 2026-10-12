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
    <tr className="bd-row hover:bg-[var(--bg-hover)] transition-colors">
      <td
        data-r={idx}
        className="bd-td-name"
        onClick={() => selectTargetRow(idx)}
      >
        <span className="bd-td-code">{yl.area}</span>
        <span>{cleanYlName(yl.nama)}</span>
      </td>
      <td
        {...cellProps0}
        className={`bd-td bd-num select-none relative ${cellProps0.className || ""}`}
      >
        <span className="block truncate font-bold text-neutral-900 dark:text-white">{formatVal(ylTgt.target)}</span>
        {renderTargetSelectionHandle && renderTargetSelectionHandle(idx, 0)}
      </td>
      <td
        {...cellProps1}
        className={`bd-td bd-num select-none relative ${cellProps1.className || ""}`}
      >
        <span className="block truncate font-bold text-neutral-900 dark:text-white">{formatVal(ylTgt.bln_lalu)}</span>
        {renderTargetSelectionHandle && renderTargetSelectionHandle(idx, 1)}
      </td>
      <td
        {...cellProps2}
        className={`bd-td bd-num select-none relative ${cellProps2.className || ""}`}
      >
        <span className="block truncate font-bold text-neutral-900 dark:text-white">{formatVal(ylTgt.thn_lalu)}</span>
        {renderTargetSelectionHandle && renderTargetSelectionHandle(idx, 2)}
      </td>
    </tr>
  );
}

export const TargetManagerRow = React.memo(TargetManagerRowInner);
