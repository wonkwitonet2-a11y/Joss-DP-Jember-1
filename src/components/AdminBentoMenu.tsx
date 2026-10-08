import {
  ClipboardCheck, Calculator, Store, CircleDollarSign, Shirt, PieChart,
  BookOpen, Link2, Droplet, TrendingUp, BarChart3, Users, Target, Activity,
  Globe, Archive, Sparkles, Pin
} from 'lucide-react';
import type { DashboardData } from '../types';

import { formatTruncated } from '../utils/numberFormat';

interface AdminBentoMenuProps {
  dashboardData: DashboardData | null;
  targetTKU: any;
  currentMonthTotal: (perYL: Record<string, any>, key: "yo" | "om" | "os" | "yt") => number;
  activeGridMap: any;
  setActiveTab: (tab: any) => void;
  selectedMonth?: string;
}

export function AdminBentoMenu({ dashboardData, targetTKU, currentMonthTotal, activeGridMap, setActiveTab, selectedMonth }: AdminBentoMenuProps) {
  const yo = currentMonthTotal(dashboardData?.perYL || {}, "yo");
  const om = currentMonthTotal(dashboardData?.perYL || {}, "om");
  const os = currentMonthTotal(dashboardData?.perYL || {}, "os");
  const yt = currentMonthTotal(dashboardData?.perYL || {}, "yt");
  const totalBotol = yo + om + os + yt;
  
  const pembagiStr = Object.values(activeGridMap || {}).reduce((acc: number, curr: any) => Math.max(acc, Number(curr.pembagiTanggal) || 25), 25);
  const pembagi = Number(pembagiStr) || 25;
  const rataRata = Math.trunc(dashboardData?.rataHarian || 0);
  
  const baseTarget = dashboardData?.targetTim?.target || targetTKU?.target || 0;
  const baseBulanLalu = dashboardData?.targetTim?.bulanLalu || targetTKU?.bln_lalu || 0;
  const baseTahunLalu = dashboardData?.targetTim?.tahunLalu || targetTKU?.thn_lalu || 0;
  
  const numRata = rataRata;
  const vsTgt = baseTarget > 0 ? formatTruncated((numRata / baseTarget) * 100, 1) : "0,0";
  const vsBln = baseBulanLalu > 0 ? formatTruncated((numRata / baseBulanLalu) * 100, 1) : "0,0";
  const vsThn = baseTahunLalu > 0 ? formatTruncated((numRata / baseTahunLalu) * 100, 1) : "0,0";

  // Menghitung bulan dan tahun (Indonesia) berdasarkan bulan yang dipilih di header
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const currentCalMonth = new Date().toISOString().substring(0, 7);
  const targetMonthKey = selectedMonth || (dashboardData as any)?.month || currentCalMonth;
  
  let monthName = months[new Date().getMonth()];
  let year = new Date().getFullYear();
  let isCurrentMonth = true;

  if (targetMonthKey && /^\d{4}-\d{2}$/.test(targetMonthKey)) {
    const [yStr, mStr] = targetMonthKey.split('-');
    const mIdx = parseInt(mStr, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      monthName = months[mIdx];
    }
    year = parseInt(yStr, 10);
    isCurrentMonth = (targetMonthKey === currentCalMonth);
  }

  return (
    <div className="bg-[#0F111E] -mx-4 -mt-4 px-4 pt-6 pb-20 min-h-screen relative font-sans overflow-hidden">
      {/* Background stars / dust effect */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #ffffff08 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
      
      {/* Top Banner: Rekapitulasi Bulan Ini */}
      <div className="bg-[#171A2A]/80 backdrop-blur-md rounded-3xl border border-slate-700/50 p-5 mb-6 shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2"></div>
        
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-pink-500 shadow-[0_0_12px_rgba(236,72,153,1)]"></div>
            <h2 className="text-slate-200 font-bold text-sm sm:text-base tracking-wide">
              {isCurrentMonth ? "Rekapitulasi Bulan Ini" : `Rekapitulasi Bulan ${monthName}`}
            </h2>
          </div>
          <div className="bg-cyan-900/40 border border-cyan-800/60 text-cyan-300 px-3.5 py-1.5 rounded-full text-[10px] sm:text-xs font-black shadow-inner">
            {monthName} {year}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-4 relative z-10 divide-x divide-slate-700/50">
          <div className="px-1 sm:px-2">
            <div className="flex items-center gap-1.5 mb-2">
              <Droplet className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold tracking-widest uppercase">AKM Botol</span>
            </div>
            <p className="text-lg sm:text-xl font-black text-white">{totalBotol.toLocaleString('id-ID')}</p>
            <p className="text-[10px] text-slate-900 opacity-0 select-none mt-1">-</p>
          </div>
          <div className="px-3 sm:px-4">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-pink-400" />
              <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold tracking-widest uppercase">Rata-Rata</span>
            </div>
            <p className="text-lg sm:text-xl font-black text-white">{rataRata}</p>
            <p className="text-[9px] text-slate-500 mt-1 font-medium">btl / hari</p>
          </div>
          <div className="px-3 sm:px-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold tracking-widest uppercase">Pencapaian</span>
            </div>
            <div className="flex flex-col gap-1 mt-1">
               <div className="flex justify-between items-center text-[10px]">
                 <span className="text-slate-500">vs TGT:</span>
                 <span className="text-white font-bold">{vsTgt}%</span>
               </div>
               <div className="flex justify-between items-center text-[10px]">
                 <span className="text-slate-500">vs B.LALU:</span>
                 <span className="text-white font-bold">{vsBln}%</span>
               </div>
               <div className="flex justify-between items-center text-[10px]">
                 <span className="text-slate-500">vs T.LALU:</span>
                 <span className="text-white font-bold">{vsThn}%</span>
               </div>
            </div>
          </div>
        </div>

        {/* Data Absensi & Status YL < 250 Divider */}
        {(() => {
          const ylUnder250 = Object.values(dashboardData?.perYL || {}).filter((y: any) => {
            const r = Number(y?.rata2) || 0;
            return r < 250;
          }).length;

          return (
            <div className="mt-4 pt-4 border-t border-slate-700/50 relative z-10">
              <div className="grid grid-cols-3 gap-2 sm:gap-4 divide-x divide-slate-700/50">
                <div className="px-1 sm:px-2 flex flex-col">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold tracking-widest uppercase">YL Absen</span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-white">{dashboardData?.ylAbsen || 0}</p>
                </div>
                <div className="px-2 sm:px-3 flex flex-col">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Activity className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold tracking-widest uppercase">Frekuensi</span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-white">{dashboardData?.frekuensiAbsen || 0} Kali</p>
                </div>
                <div className="px-2 sm:px-3 flex flex-col">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                    <span className="text-[9px] sm:text-[10px] text-rose-400 font-black tracking-widest uppercase">YL &lt; 250</span>
                  </div>
                  <p className="text-base sm:text-lg font-black text-rose-400">{ylUnder250} <span className="text-xs font-bold text-slate-400">YL</span></p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Bento Grid Menu */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-5 landscape:grid-cols-5 gap-2 sm:gap-3 relative z-10">
        {[
          { id: "evaluasi", label: "Evaluasi", icon: ClipboardCheck, from: "from-rose-500/20", to: "to-rose-900/40", border: "border-rose-500/20", iconBg: "bg-rose-500/20 text-rose-300" },
          { id: "input_realisasi", label: "LHPP & LPPBJ", icon: Calculator, from: "from-blue-500/20", to: "to-blue-900/40", border: "border-blue-500/20", iconBg: "bg-blue-500/20 text-blue-300" },
          { id: "product_knowledge", label: "Produk Knowledge", icon: Store, from: "from-purple-500/20", to: "to-purple-900/40", border: "border-purple-500/20", iconBg: "bg-purple-500/20 text-purple-300" },
          { id: "target_kompensasi", label: "Target & Kompensasi", icon: CircleDollarSign, from: "from-rose-500/20", to: "to-pink-900/40", border: "border-pink-500/20", iconBg: "bg-pink-500/20 text-pink-300" },
          { id: "seragam", label: "Seragam", icon: Shirt, from: "from-blue-500/20", to: "to-indigo-900/40", border: "border-indigo-500/20", iconBg: "bg-indigo-500/20 text-indigo-300" },
          { id: "breakdown", label: "Breakdown & Realisasi", icon: PieChart, from: "from-rose-500/20", to: "to-red-900/40", border: "border-red-500/20", iconBg: "bg-red-500/20 text-red-300" },
          { id: "plg_pjl", label: "PLG & PJL", icon: BookOpen, from: "from-amber-500/20", to: "to-amber-900/40", border: "border-amber-500/20", iconBg: "bg-amber-500/20 text-amber-300" },
          { id: "tautan", label: "Link", icon: Globe, from: "from-indigo-500/20", to: "to-indigo-900/40", border: "border-indigo-500/20", iconBg: "bg-indigo-500/20 text-indigo-300" },
          { id: "attention", label: "Attention", icon: Pin, from: "from-violet-500/20", to: "to-violet-900/40", border: "border-violet-500/20", iconBg: "bg-violet-500/20 text-violet-300" },
          { id: "ai_chat", label: "Tanya AI", icon: Sparkles, from: "from-rose-600/30", to: "to-red-900/50", border: "border-rose-500/30", iconBg: "bg-rose-500/30 text-yellow-300" },
          { id: "setting", label: "Pengaturan", icon: Link2, from: "from-purple-500/20", to: "to-fuchsia-900/40", border: "border-fuchsia-500/20", iconBg: "bg-fuchsia-500/20 text-fuchsia-300" },
          { id: "grafik", label: "Grafik Dasbor", icon: BarChart3, from: "from-emerald-500/20", to: "to-emerald-900/40", border: "border-emerald-500/20", iconBg: "bg-emerald-500/20 text-emerald-300" },
          { id: "lady", label: "Profil YL", icon: Users, from: "from-cyan-500/20", to: "to-cyan-900/40", border: "border-cyan-500/20", iconBg: "bg-cyan-500/20 text-cyan-300" },
          { id: "presentasi", label: "Presentasi", icon: BarChart3, from: "from-orange-500/20", to: "to-amber-900/40", border: "border-amber-500/20", iconBg: "bg-amber-500/20 text-amber-300" },
          { id: "archive", label: "Arsip", icon: Archive, from: "from-fuchsia-500/20", to: "to-fuchsia-900/40", border: "border-fuchsia-500/20", iconBg: "bg-fuchsia-500/20 text-fuchsia-300" },
        ].map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === "ai_chat") {
                  window.dispatchEvent(new CustomEvent("open-ai-chat"));
                } else {
                  setActiveTab(item.id);
                }
              }}
              className={`flex flex-col items-center justify-center p-2 sm:p-3 rounded-2xl bg-gradient-to-br ${item.from} ${item.to} border ${item.border} aspect-square transition-all hover:scale-105 active:scale-95 shadow-lg relative overflow-hidden group cursor-pointer backdrop-blur-sm`}
            >
              {/* Internal glow hover */}
              <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl ${item.iconBg} flex items-center justify-center mb-1.5 shadow-inner border border-white/10 group-hover:scale-110 transition-transform`}>
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2} />
              </div>
              <span className="text-[9px] sm:text-[10px] font-black text-slate-100 tracking-tight text-center leading-tight drop-shadow-sm line-clamp-2 px-0.5">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  );
}
