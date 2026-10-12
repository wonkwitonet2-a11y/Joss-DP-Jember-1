import React, { useState, useEffect } from "react";
import { Trash2, Camera } from "lucide-react";
import { cleanYlName } from "../types";

interface YlProfileRowProps {
  yl: any;
  idx: number;
  ylList: any[];
  setYlList: (list: any[]) => void;
  handleSaveYlList: (newList: any) => void;
  handleDeleteYl: (idx: number) => void;
}

// One row of the "Profil YL" management table (kode, nama, tanggal masuk,
// PIN, status, aksi). Extracted from ManagerView and memoized for the same
// reason as BreakdownGridRow / TargetManagerRow: so editing one YL's row
// doesn't force React to re-check every other YL row too.
function YlProfileRowInner({
  yl,
  idx,
  ylList,
  setYlList,
  handleSaveYlList,
  handleDeleteYl,
}: YlProfileRowProps) {
  const isResign = yl.status === "Resign";
  const [foto, setFoto] = useState<string>("");

  useEffect(() => {
    if (!yl?.nama && !yl?.area) return;
    const query = yl.nama || yl.area;
    fetch(`/api/getYlFoto?nama=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.foto) setFoto(d.foto);
      })
      .catch(() => {});
  }, [yl?.nama, yl?.area]);

  const handleUploadPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran foto maksimal 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 500;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL("image/jpeg", 0.7);
        setFoto(base64);
        try {
          await fetch("/api/saveYlFoto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nama: yl.nama || yl.area, foto: base64 })
          });
        } catch (err) {
          console.error("Gagal simpan foto YL:", err);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <tr className={`hover:bg-amber-50/50 transition-colors ${isResign ? "bg-rose-50/40 dark:bg-rose-950/40 text-neutral-400" : ""}`}>
      <td className="p-2.5 text-center text-red-700 dark:text-red-300 font-bold text-xs sm:text-sm">{yl.area}</td>
      <td className="p-2.5">
        <input
          type="text"
          value={yl.kodeYl || `YL-${yl.area}`}
          onChange={(e) => {
            const copy = [...ylList];
            copy[idx].kodeYl = e.target.value;
            setYlList(copy);
          }}
          className="p-1.5 text-xs bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-300 dark:border-neutral-700 rounded outline-none font-mono w-28 text-neutral-900 dark:text-neutral-100 font-bold focus:border-red-500 focus:bg-white dark:focus:bg-neutral-800"
        />
      </td>
      <td className="p-2.5 min-w-[280px]">
        <div className="flex items-center gap-2">
          <div className="relative group shrink-0" title="Klik ikon kamera untuk mengunggah / mengganti foto profil YL">
            {foto ? (
              <img src={foto} alt={cleanYlName(yl.nama)} className="w-9 h-9 rounded-xl object-cover border-2 border-red-300 dark:border-red-700 shadow-xs" />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 flex items-center justify-center font-bold text-xs border-2 border-dashed border-red-300 dark:border-red-700">
                {cleanYlName(yl.nama).charAt(0).toUpperCase() || "Y"}
              </div>
            )}
            <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white rounded-xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity shadow-xs">
              <Camera className="w-4 h-4 text-white drop-shadow" />
              <input type="file" accept="image/*" className="hidden" onChange={handleUploadPhoto} />
            </label>
          </div>
          <input
            type="text"
            value={cleanYlName(yl.nama)}
            onChange={(e) => {
              const copy = [...ylList];
              copy[idx].nama = e.target.value;
              setYlList(copy);
            }}
            placeholder="Nama Lengkap YL"
            className={`p-1.5 text-xs sm:text-sm border rounded outline-none font-bold w-full min-w-[180px] text-neutral-900 dark:text-neutral-100 focus:border-red-500 focus:bg-white dark:focus:bg-neutral-800 ${isResign ? "bg-rose-100/50 dark:bg-rose-900/50 border-rose-200 dark:border-rose-800 text-neutral-500 line-through" : "bg-neutral-50 dark:bg-neutral-800/40 border-neutral-300 dark:border-neutral-700"}`}
          />
        </div>
      </td>
      <td className="p-2.5 text-center">
        <div className="relative inline-block w-full min-w-[130px]">
          <input
            type="date"
            value={yl.tanggalMasuk || yl.tanggalDaftar || ""}
            onChange={(e) => {
              const copy = [...ylList];
              copy[idx].tanggalMasuk = e.target.value;
              setYlList(copy);
            }}
            className="w-full p-1.5 text-xs bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-300 dark:border-neutral-700 rounded outline-none font-bold text-neutral-900 dark:text-neutral-100 focus:border-red-500 focus:bg-white dark:focus:bg-neutral-800 cursor-pointer"
          />
          {!(yl.tanggalMasuk || yl.tanggalDaftar) && (
            <span className="absolute left-2.5 top-2 text-[10px] text-neutral-400 font-bold pointer-events-none select-none">
              Pilih Tanggal
            </span>
          )}
        </div>
      </td>
      <td className="p-2.5 text-center">
        <input
          type="text"
          maxLength={6}
          value={yl.pin}
          onChange={(e) => {
            const copy = [...ylList];
            copy[idx].pin = e.target.value;
            setYlList(copy);
          }}
          className="p-1.5 text-xs bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-300 dark:border-neutral-700 rounded outline-none text-center font-mono w-20 text-neutral-900 dark:text-neutral-100 font-bold focus:border-red-500 focus:bg-white dark:focus:bg-neutral-800"
        />
      </td>
      <td className="p-2.5 text-center">
        <input
          type="text"
          value={yl.nik || ""}
          placeholder="350xxx"
          onChange={(e) => {
            const copy = [...ylList];
            copy[idx].nik = e.target.value;
            setYlList(copy);
          }}
          className="p-1.5 text-xs bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-300 dark:border-neutral-700 rounded outline-none text-center font-mono w-32 text-neutral-900 dark:text-neutral-100 font-bold focus:border-red-500 focus:bg-white dark:focus:bg-neutral-800"
        />
      </td>
      <td className="p-2.5 text-center">
        <div className="relative inline-block w-full min-w-[130px]">
          <input
            type="date"
            value={yl.tglLahir || ""}
            onChange={(e) => {
              const copy = [...ylList];
              copy[idx].tglLahir = e.target.value;
              setYlList(copy);
            }}
            className="w-full p-1.5 text-xs bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-300 dark:border-neutral-700 rounded outline-none font-bold text-neutral-900 dark:text-neutral-100 focus:border-red-500 focus:bg-white dark:focus:bg-neutral-800 cursor-pointer"
          />
          {!yl.tglLahir && (
            <span className="absolute left-2.5 top-2 text-[10px] text-neutral-400 font-bold pointer-events-none select-none">
              Pilih Tanggal
            </span>
          )}
        </div>
      </td>
      <td className="p-2.5 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const copy = [...ylList];
              const currentIkut = copy[idx].ikutJht !== false;
              const nextIkut = !currentIkut;
              copy[idx].ikutJht = nextIkut;
              if (nextIkut && (copy[idx].iuranJht === undefined || copy[idx].iuranJht === 0)) {
                copy[idx].iuranJht = 24000;
              }
              setYlList(copy);
            }}
            className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap shadow-xs ${
              (yl.ikutJht !== false)
                ? "bg-emerald-100 dark:bg-emerald-900/50 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200"
                : "bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
            title={(yl.ikutJht !== false) ? "Status: Ikut Program JHT (Klik untuk ubah)" : "Status: Tidak Ikut JHT (Klik untuk ubah)"}
          >
            {(yl.ikutJht !== false) ? "✓ Ikut" : "✕ Tidak"}
          </button>
          <div className="relative">
            <span className="absolute left-1.5 top-1.5 text-[10px] text-neutral-400 font-bold pointer-events-none">Rp</span>
            <input
              type="number"
              step={1000}
              min={0}
              disabled={yl.ikutJht === false}
              value={yl.ikutJht === false ? 0 : (yl.iuranJht !== undefined ? yl.iuranJht : 24000)}
              onChange={(e) => {
                const copy = [...ylList];
                const val = parseInt(e.target.value, 10);
                copy[idx].iuranJht = isNaN(val) ? 0 : val;
                setYlList(copy);
              }}
              placeholder="24000"
              className={`pl-6 pr-1.5 py-1 text-xs rounded border outline-none font-mono font-bold w-24 text-right transition-colors ${
                yl.ikutJht === false
                  ? "bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-800 text-neutral-400 cursor-not-allowed"
                  : "bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:border-red-500"
              }`}
            />
          </div>
        </div>
      </td>
      <td className="p-2.5 text-center">
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${isResign ? "bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300" : "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300"}`}>
          {isResign ? "Resign" : "Aktif"}
        </span>
      </td>
      <td className="p-2.5 text-right space-x-2">
        <button
          onClick={() => {
            const copy = [...ylList];
            if (isResign) {
              copy[idx].status = "Aktif";
              delete copy[idx].tanggalResign;
            } else {
              copy[idx].status = "Resign";
              copy[idx].tanggalResign = new Date().toISOString().split("T")[0];
            }
            setYlList(copy);
            handleSaveYlList(copy);
          }}
          className={`text-[10px] font-bold border px-2 py-1 rounded transition-colors ${isResign ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100" : "text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"}`}
        >
          {isResign ? "Aktifkan" : "Tandai Resign"}
        </button>
        <button
          onClick={() => handleDeleteYl(idx)}
          className="text-rose-600 dark:text-rose-400 hover:text-white hover:bg-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[10px] font-bold px-2 py-1 rounded transition-all cursor-pointer inline-flex items-center gap-1"
          title="Hapus YL Permanen"
        >
          <Trash2 className="w-3 h-3" />
          <span>Hapus</span>
        </button>
      </td>
    </tr>
  );
}

export const YlProfileRow = React.memo(YlProfileRowInner);
