import { MenuTitleIcon } from "./AppSidebar";
import React from "react";
import { YlProfileRow } from "./YlProfileRow";

interface ManagerLadyTabProps {
  ylList: any[];
  setYlList: React.Dispatch<React.SetStateAction<any[]>>;
  handleSaveYlList: (listToSave?: any[]) => Promise<void>;
  handleDeleteYl: (area: string) => Promise<void>;
  handleAddYl: () => Promise<void>;
  newYlArea: string;
  setNewYlArea: (val: string) => void;
  newYlKode: string;
  setNewYlKode: (val: string) => void;
  newYlNama: string;
  setNewYlNama: (val: string) => void;
  newYlTanggalMasuk: string;
  setNewYlTanggalMasuk: (val: string) => void;
  newYlPin: string;
  setNewYlPin: (val: string) => void;
  newYlNik: string;
  setNewYlNik: (val: string) => void;
  newYlTglLahir: string;
  setNewYlTglLahir: (val: string) => void;
  newYlIkutJht?: boolean;
  setNewYlIkutJht?: (val: boolean) => void;
  newYlIuranJht?: number;
  setNewYlIuranJht?: (val: number) => void;
  ylSavedMsg: string | null;
  compConfig?: any;
  setCompConfig?: React.Dispatch<React.SetStateAction<any>>;
  handleSaveCompConfig?: () => Promise<void>;
  compSavedMsg?: string | null;
}

function ManagerLadyTabInner({
  ylList,
  setYlList,
  handleSaveYlList,
  handleDeleteYl,
  handleAddYl,
  newYlArea,
  setNewYlArea,
  newYlKode,
  setNewYlKode,
  newYlNama,
  setNewYlNama,
  newYlTanggalMasuk,
  setNewYlTanggalMasuk,
  newYlPin,
  setNewYlPin,
  newYlNik,
  setNewYlNik,
  newYlTglLahir,
  setNewYlTglLahir,
  newYlIkutJht = true,
  setNewYlIkutJht,
  newYlIuranJht = 24000,
  setNewYlIuranJht,
  ylSavedMsg,
  compConfig,
  setCompConfig,
  handleSaveCompConfig,
  compSavedMsg
}: ManagerLadyTabProps) {
  const [applyingJhtMsg, setApplyingJhtMsg] = React.useState<string | null>(null);
  const [isSavingComp, setIsSavingComp] = React.useState<boolean>(false);

  // Dynamic values from global compensation configuration
  const currentJkk = compConfig?.jkkJkm !== undefined ? Number(compConfig.jkkJkm) : 18800;
  const currentJht = compConfig?.jht !== undefined ? Number(compConfig.jht) : 24000;
  const currentPph = compConfig?.pphRate !== undefined ? Number(compConfig.pphRate) : 2.5;

  const handleApplyJhtToAllYl = async () => {
    const targetNominal = currentJht;
    const updatedList = ylList.map((y) => {
      if (y.ikutJht !== false) {
        return { ...y, iuranJht: targetNominal };
      }
      return y;
    });
    setYlList(updatedList);
    await handleSaveYlList(updatedList);
    setApplyingJhtMsg(`✅ Berhasil menerapkan Iuran JHT Rp ${targetNominal.toLocaleString("id-ID")} ke seluruh YL yang berstatus Ikut!`);
    setTimeout(() => setApplyingJhtMsg(null), 4000);
  };

  const handleResetToDefault = () => {
    if (setCompConfig) {
      setCompConfig((prev: any) => ({
        ...prev,
        jkkJkm: 18800,
        jht: 24000,
        pphRate: 2.5
      }));
    }
  };

  const onSaveCompRates = async () => {
    if (handleSaveCompConfig) {
      setIsSavingComp(true);
      await handleSaveCompConfig();
      setIsSavingComp(false);
    }
  };
  return (
    <div className="space-y-6">
      {/* KELOLA PROFIL & STATUS YL */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
              <span className="inline-flex items-center gap-1.5"><MenuTitleIcon id="lady" className="w-4 h-4 text-brand-600 dark:text-brand-400" />Kelola Profil & Status Yakult Lady (YL)</span>
            </h2>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed font-bold">
              Kelola nama lengkap, PIN login, status keaktifan/resign, serta pendaftaran YL baru. Tombol Hapus akan menghapus YL secara permanen dari seluruh sistem.
            </p>
          </div>
          <span className="text-[10px] font-bold bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 px-2.5 py-1 rounded-lg border border-brand-200 dark:border-brand-800">
            Total: {ylList.length} YL ({ylList.filter((y) => y.status !== "Resign").length} Aktif)
          </span>
        </div>

        {/* Table of YLs */}
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto border-2 border-neutral-300 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-900 shadow-sm">
          <table className="w-full text-left text-xs border-collapse min-w-[850px]">
            <thead>
              <tr className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 font-bold uppercase text-xs sticky top-0 z-10 border-b-2 border-neutral-800 divide-x divide-neutral-700">
                <th className="p-3 w-20 text-center">Area</th>
                <th className="p-3 w-28">Kode YL</th>
                <th className="p-3 min-w-[240px] w-72">Nama Lengkap YL</th>
                <th className="p-3 text-center min-w-[140px]">Tanggal Masuk</th>
                <th className="p-3 text-center min-w-[100px]">PIN Login</th>
                <th className="p-3 text-center min-w-[100px]">NIK</th>
                <th className="p-3 text-center min-w-[100px]">Tgl Lahir</th>
                <th className="p-3 text-center min-w-[170px]">Iuran JHT</th>
                <th className="p-3 text-center min-w-[100px]">Status</th>
                <th className="p-3 text-right min-w-[160px]">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 font-bold">
              {ylList.map((yl: any, idx) => (
                <YlProfileRow
                  key={idx}
                  yl={yl}
                  idx={idx}
                  ylList={ylList}
                  setYlList={setYlList}
                  handleSaveYlList={handleSaveYlList}
                  handleDeleteYl={handleDeleteYl}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Form Input / Mendaftar YL Baru */}
        <div className="bg-neutral-50 dark:bg-neutral-800/40 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-3 shadow-sm">
          <span className="text-[11px] font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider block">
            ➕ Mendaftar Yakult Lady (YL) Baru
          </span>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-2.5 items-end [&>*]:min-w-0">
            <div>
              <label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400 block mb-1">Area</label>
              <input
                type="text"
                placeholder="mis: 211"
                value={newYlArea}
                onChange={(e) => setNewYlArea(e.target.value)}
                className="w-full p-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-bold outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400 block mb-1">Kode YL</label>
              <input
                type="text"
                placeholder="mis: YL-211"
                value={newYlKode}
                onChange={(e) => setNewYlKode(e.target.value)}
                className="w-full p-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-bold outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-emerald-500 font-mono"
              />
            </div>
            <div className="col-span-1">
              <label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400 block mb-1">Nama YL</label>
              <input
                type="text"
                placeholder="mis: Rahmawati"
                value={newYlNama}
                onChange={(e) => setNewYlNama(e.target.value)}
                className="w-full p-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-bold outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-700 dark:text-neutral-300 block mb-1 flex items-center gap-1">
                <span>📅 Tgl Masuk</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={newYlTanggalMasuk}
                  onChange={(e) => setNewYlTanggalMasuk(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-bold outline-none text-neutral-900 dark:text-neutral-100 focus:border-emerald-500 cursor-pointer min-h-[36px]"
                  style={{ colorScheme: "light" }}
                />
                {!newYlTanggalMasuk && (
                  <span className="absolute left-2.5 right-8 top-2.5 text-xs text-neutral-400 font-bold pointer-events-none select-none flex items-center gap-1 whitespace-nowrap overflow-hidden text-ellipsis">
                    <span>Pilih Tanggal (YYYY-MM-DD)</span>
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400 block mb-1">PIN Login</label>
              <input
                type="text"
                placeholder="mis: 211"
                value={newYlPin}
                onChange={(e) => setNewYlPin(e.target.value)}
                className="w-full p-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-bold outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400 block mb-1">NIK (opsional)</label>
              <input
                type="text"
                placeholder="350xxx"
                value={newYlNik}
                onChange={(e) => setNewYlNik(e.target.value)}
                className="w-full p-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-bold outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-neutral-700 dark:text-neutral-300 block mb-1 flex items-center gap-1">
                <span>🎂 Tgl Lahir</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={newYlTglLahir}
                  onChange={(e) => setNewYlTglLahir(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-bold outline-none text-neutral-900 dark:text-neutral-100 focus:border-emerald-500 cursor-pointer min-h-[36px]"
                  style={{ colorScheme: "light" }}
                />
                {!newYlTglLahir && (
                  <span className="absolute left-2.5 right-8 top-2.5 text-xs text-neutral-400 font-bold pointer-events-none select-none flex items-center gap-1 whitespace-nowrap overflow-hidden text-ellipsis">
                    <span>Pilih Tanggal (YYYY-MM-DD)</span>
                  </span>
                )}
              </div>
            </div>
            {/* Input & Toggle Iuran JHT */}
            <div className="col-span-1">
              <label className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400 block mb-1">Iuran JHT</label>
              <div className="flex items-center gap-1.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 min-h-[36px]">
                <button
                  type="button"
                  onClick={() => setNewYlIkutJht && setNewYlIkutJht(!newYlIkutJht)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap shadow-xs ${
                    newYlIkutJht
                      ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-200"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  }`}
                  title={newYlIkutJht ? "Status: Ikut Program JHT" : "Status: Tidak Ikut JHT"}
                >
                  {newYlIkutJht ? "✓ Ikut" : "✕ Tidak"}
                </button>
                <div className="relative flex-1">
                  <span className="absolute left-1 top-1 text-[10px] text-neutral-400 font-bold pointer-events-none">Rp</span>
                  <input
                    type="number"
                    step={1000}
                    min={0}
                    disabled={!newYlIkutJht}
                    value={newYlIkutJht ? newYlIuranJht : 0}
                    onChange={(e) => setNewYlIuranJht && setNewYlIuranJht(parseInt(e.target.value, 10) || 0)}
                    placeholder="24000"
                    className={`w-full pl-6 pr-1 py-0.5 text-xs font-mono font-bold outline-none text-right rounded ${
                      !newYlIkutJht ? "text-neutral-400 cursor-not-allowed bg-neutral-50 dark:bg-neutral-800/40" : "text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={handleAddYl}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all shadow cursor-pointer flex items-center justify-center gap-1.5"
          >
            💾 Simpan Pendaftaran YL Baru
          </button>
        </div>

        <button
          onClick={() => handleSaveYlList(ylList)}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer shadow-md shadow-brand-900/20 flex items-center justify-center gap-1.5"
        >
          💾 Simpan Perubahan Table Profil YL & PIN
        </button>
        {ylSavedMsg && (
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-[11px] font-bold text-emerald-700 dark:text-emerald-300 text-center animate-pulse">
            {ylSavedMsg}
          </div>
        )}
      </div>

      {/* ⚙️ PENGATURAN NILAI POTONGAN KOMPENSASI */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base text-brand-600 dark:text-brand-400">⚙️</span>
              <h2 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-tight">
                PENGATURAN NILAI POTONGAN KOMPENSASI (JKK/JKN, JHT &amp; PPH/PPN)
              </h2>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium mt-0.5">
              Nilai yang diubah di sini otomatis terhubung ke perhitungan kompensasi di akun Manager dan seluruh akun Yakult Lady.
            </p>
          </div>
          <span className="inline-flex items-center self-start sm:self-auto bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-brand-100 dark:border-brand-800">
            Terhubung Global
          </span>
        </div>

        {/* 1. Iuran JKK / JKM (JKN) */}
        <div className="bg-neutral-50/70 dark:bg-neutral-800/70 border border-neutral-200/90 dark:border-neutral-800/90 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-600 inline-block shrink-0" />
              <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">Iuran JKK / JKM (JKN)</span>
            </div>
            <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-2 py-0.5 rounded-md shadow-2xs">
              BPJS Naker
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight">
            Nominal potongan iuran JKK &amp; JKM per bulan untuk seluruh YL.
          </p>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 flex items-center justify-between focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
            <span className="text-xs font-bold text-neutral-400 select-none">Rp</span>
            <input
              type="number"
              step={100}
              min={0}
              value={currentJkk}
              onChange={(e) => {
                const val = Number(e.target.value) || 0;
                setCompConfig && setCompConfig((prev: any) => ({ ...prev, jkkJkm: val }));
              }}
              className="text-right text-sm font-black text-neutral-900 dark:text-neutral-100 outline-none w-full bg-transparent font-mono"
            />
          </div>
          <p className="text-[10px] text-neutral-400 font-semibold text-right">
            Default sistem: Rp 18.800
          </p>
        </div>

        {/* 2. Iuran JHT Standar */}
        <div className="bg-neutral-50/70 dark:bg-neutral-800/70 border border-neutral-200/90 dark:border-neutral-800/90 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block shrink-0" />
              <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">Iuran JHT Standar</span>
            </div>
            <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-2 py-0.5 rounded-md shadow-2xs">
              Hari Tua
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight">
            Nominal iuran standar bulanan bagi YL yang berstatus ikut JHT.
          </p>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 flex items-center justify-between focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
            <span className="text-xs font-bold text-neutral-400 select-none">Rp</span>
            <input
              type="number"
              step={1000}
              min={0}
              value={currentJht}
              onChange={(e) => {
                const val = Number(e.target.value) || 0;
                setCompConfig && setCompConfig((prev: any) => ({ ...prev, jht: val }));
              }}
              className="text-right text-sm font-black text-neutral-900 dark:text-neutral-100 outline-none w-full bg-transparent font-mono"
            />
          </div>
          <p className="text-[10px] text-neutral-400 font-semibold text-right">
            Default sistem: Rp 24.000
          </p>
        </div>

        {/* 3. Pajak PPh / PPN (%) */}
        <div className="bg-neutral-50/70 dark:bg-neutral-800/70 border border-neutral-200/90 dark:border-neutral-800/90 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block shrink-0" />
              <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">Pajak PPh / PPN (%)</span>
            </div>
            <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-2 py-0.5 rounded-md shadow-2xs">
              Pajak
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight">
            Persentase potongan pajak dari kompensasi bulanan kotor.
          </p>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 flex items-center justify-end gap-1.5 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
            <input
              type="number"
              step={0.1}
              min={0}
              max={100}
              value={currentPph}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setCompConfig && setCompConfig((prev: any) => ({ ...prev, pphRate: val }));
              }}
              className="text-right text-sm font-black text-neutral-900 dark:text-neutral-100 outline-none w-24 bg-transparent font-mono"
            />
            <span className="text-xs font-bold text-neutral-400 select-none">%</span>
          </div>
          <p className="text-[10px] text-neutral-400 font-semibold text-right">
            Default sistem: 2.5%
          </p>
        </div>

        {/* Ringkasan Potongan Standar per YL */}
        <div className="bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/80 rounded-2xl p-4 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                Ringkasan Potongan Standar per YL:
              </span>
            </div>
            <div className="bg-white dark:bg-neutral-900 border border-indigo-200 dark:border-indigo-800 rounded-xl px-3 py-1.5 shadow-2xs self-start sm:self-auto">
              <span className="text-xs sm:text-sm font-black text-indigo-900 dark:text-indigo-300 font-mono">
                Rp {(currentJkk + currentJht).toLocaleString("id-ID")} + PPh {currentPph.toString().replace(".", ",")}%
              </span>
            </div>
          </div>
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 hover:text-indigo-700 underline cursor-pointer transition-colors"
            >
              Reset ke Nilai Default
            </button>
          </div>
        </div>

        {compSavedMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-300 text-center animate-pulse">
            {compSavedMsg}
          </div>
        )}

        {applyingJhtMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-300 text-center">
            {applyingJhtMsg}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={onSaveCompRates}
            disabled={isSavingComp}
            className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs py-3 rounded-xl transition-all shadow cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isSavingComp ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Menyimpan Potongan Kompensasi...</span>
              </>
            ) : (
              <>
                <span>💾</span>
                <span>Simpan Perubahan Nilai Potongan (JKK, JHT, PPH/PPN)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleApplyJhtToAllYl}
            className="w-full bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 font-bold text-xs py-3 rounded-xl transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-2"
          >
            <span>🔄</span>
            <span>Terapkan JHT (Rp {currentJht.toLocaleString("id-ID")}) ke Semua YL yang Ikut</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export const ManagerLadyTab = React.memo(ManagerLadyTabInner);
