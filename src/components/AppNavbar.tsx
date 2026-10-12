import React from 'react';
import { LogOut, ArrowLeft, PanelLeft, ShieldCheck, Moon, Sun, RefreshCw, UserCheck, Calendar } from 'lucide-react';
import { JossLogo } from './JossLogo';

export interface AppNavbarProps {
  role: 'manager' | 'yl';
  title: string;
  subtitle: string;
  currentMenu: string;
  onSelectMenu: (menu: string) => void;
  // Drawer & Sidebar toggle
  onToggleSidebar: () => void;
  // Theme
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  // Refresh & Sync
  onRefresh?: () => void;
  isRefreshing?: boolean;
  // Logout & account switch
  onLogout: () => void;
  // Kalau true, tombol keluar tampil sebagai tombol "Kembali" (ikon panah)
  logoutAsBack?: boolean;
  ylAccounts?: string[];
  activeYlName?: string;
  onSwitchToYl?: (name: string) => void;
  onSwitchToManager?: () => void;
  // Historical / month selector
  globalMonth?: string;
  setGlobalMonth?: (m: string) => void;
  isViewingHistoricalMonth?: boolean;
  historicalMonthLabel?: string;
  onResetToLiveData?: () => void;
  // Slot untuk lonceng notifikasi (ultah & realisasi potensi)
  notificationSlot?: React.ReactNode;
}

export const AppNavbar: React.FC<AppNavbarProps> = ({
  role,
  title,
  subtitle,
  currentMenu,
  onSelectMenu,
  onToggleSidebar,
  theme,
  onToggleTheme,
  onRefresh,
  isRefreshing = false,
  onLogout,
  logoutAsBack = false,
  ylAccounts = [],
  activeYlName,
  onSwitchToYl,
  onSwitchToManager,
  globalMonth,
  setGlobalMonth,
  isViewingHistoricalMonth,
  historicalMonthLabel,
  onResetToLiveData,
  notificationSlot
}) => {
  const isManager = role === 'manager';

  const iconBtn =
    'p-2 rounded-xl text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer border border-neutral-200/80 dark:border-neutral-800 active:scale-95';

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 transition-colors">
      <div className="flex items-center justify-between h-14 px-3 sm:px-5 gap-2 max-w-[1700px] mx-auto">
        {/* Left: Brand Logo + Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Tombol Menu samping: hanya Admin & hanya tablet/desktop (HP & akun YL: dihapus agar logo mepet kiri) */}
          {isManager && (
            <button
              onClick={onToggleSidebar}
              aria-label="Buka atau tutup menu samping"
              title="Buka / Tutup menu samping"
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 transition-colors border border-neutral-200 dark:border-neutral-700 shadow-2xs cursor-pointer active:scale-95 shrink-0`}
            >
              <PanelLeft className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span className="hidden lg:inline">Menu</span>
            </button>
          )}

          {/* Logo */}
          <button
            onClick={() => onSelectMenu(isManager ? 'dashboard' : 'input')}
            aria-label="Ke Menu Utama"
            className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl overflow-hidden hover:opacity-90 transition-opacity cursor-pointer"
          >
            <JossLogo size={38} compact />
          </button>

          {/* Title & Subtitle */}
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-sm sm:text-[15px] font-bold text-neutral-900 dark:text-neutral-100 truncate">
                {title}
              </h1>
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 uppercase tracking-wider">
                {isManager ? 'Admin' : 'Lady'}
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Center / Right: Month Picker (Desktop) + Account Selector + Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Month Selector for Manager (Desktop view) */}
          {isManager && setGlobalMonth && (
            <div className="hidden md:flex items-center">
              {isViewingHistoricalMonth ? (
                <div className="h-8 px-2.5 flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate max-w-[120px]">{historicalMonthLabel || 'Arsip'}</span>
                  {onResetToLiveData && (
                    <button
                      onClick={onResetToLiveData}
                      className="ml-1 bg-brand-600 hover:bg-brand-700 text-white font-bold text-[10px] px-2 py-0.5 rounded-lg shadow-2xs cursor-pointer transition-all active:scale-95"
                    >
                      Live
                    </button>
                  )}
                </div>
              ) : (
                <div className="h-8 px-2.5 flex items-center gap-1.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-bold">
                  <Calendar className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
                  <input
                    type="month"
                    value={globalMonth}
                    onChange={(e) => setGlobalMonth(e.target.value)}
                    className="bg-transparent text-neutral-800 dark:text-neutral-200 font-bold text-xs outline-none cursor-pointer"
                    title="Pilih Bulan Data Aktif"
                  />
                </div>
              )}
            </div>
          )}

          {/* Account Switcher (Tablet/Desktop dropdown - KHUSUS ADMIN) */}
          {isManager && onSwitchToYl && ylAccounts.length > 0 && (
            <select
              value="manager"
              onChange={(e) => {
                const val = e.target.value;
                if (val !== 'manager' && onSwitchToYl) {
                  onSwitchToYl(val);
                }
              }}
              aria-label="Pilih Akun"
              className="text-xs font-bold py-1.5 px-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 cursor-pointer hidden sm:inline-block max-w-[140px] md:max-w-[180px] truncate shadow-2xs hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              <option value="manager">Admin</option>
              {ylAccounts.map((name) => (
                <option key={name} value={name}>
                  {name.replace(/\b(Pusat|Center|DP|Jember|1)\b/gi, '').trim() || name}
                </option>
              ))}
            </select>
          )}

          {/* Tombol kembali ke Admin: hanya muncul bila akun YL dibuka dari Admin (bukan login langsung) */}
          {!isManager && onSwitchToManager && (
            <button
              onClick={onSwitchToManager}
              aria-label="Kembali ke akun Admin"
              title="Kembali ke akun Admin"
              className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-xl bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/50 dark:hover:bg-brand-900/50 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 text-xs font-bold transition-colors cursor-pointer active:scale-95 shrink-0"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Admin</span>
            </button>
          )}

          {/* Lonceng Notifikasi */}
          {notificationSlot}

          {/* Refresh Data Button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Perbarui data"
              title="Perbarui & sinkronkan data"
              className={iconBtn}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-brand-600 dark:text-brand-400' : ''}`} />
            </button>
          )}

          {/* Mode Gelap / Terang Toggle Button */}
          <button
            onClick={onToggleTheme}
            aria-label="Ganti tema gelap atau terang"
            title={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            className={iconBtn}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 animate-fade-in" />
            ) : (
              <Moon className="w-4 h-4 text-neutral-700 dark:text-neutral-300 animate-fade-in" />
            )}
          </button>

          {/* Logout Button */}
          <button
            onClick={onLogout}
            aria-label={logoutAsBack ? "Kembali" : "Keluar"}
            title={logoutAsBack ? "Kembali ke Beranda" : "Keluar dari akun"}
            className={`${iconBtn} hover:!text-rose-600 dark:text-rose-400 hover:!bg-rose-50 dark:bg-rose-950/40 dark:hover:!bg-rose-950/40`}
          >
            {logoutAsBack ? <ArrowLeft className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Baris Mobile: Dropdown Ganti Akun & Bulan (Muncul di layar kecil bawah header KHUSUS ADMIN) */}
      {isManager && (
        <div className="sm:hidden px-3 py-1.5 bg-neutral-50 dark:bg-neutral-950/60 border-t border-neutral-200/70 dark:border-neutral-800/70 flex items-center justify-between gap-2">
          {onSwitchToYl && ylAccounts.length > 0 && (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <UserCheck className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
              <select
                value="manager"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val !== 'manager' && onSwitchToYl) {
                    onSwitchToYl(val);
                  }
                }}
                aria-label="Pilih Akun di HP"
                className="w-full py-1 px-2 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs font-bold text-neutral-900 dark:text-neutral-100 shadow-2xs cursor-pointer"
              >
                <option value="manager">Admin</option>
                {ylAccounts.map((name) => (
                  <option key={name} value={name}>
                    {name.replace(/\b(Pusat|Center|DP|Jember|1)\b/gi, '').trim() || name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {setGlobalMonth && (
            <div className="shrink-0 flex items-center">
              <input
                type="month"
                value={globalMonth}
                onChange={(e) => setGlobalMonth(e.target.value)}
                className="py-1 px-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-bold text-neutral-900 dark:text-neutral-100 cursor-pointer w-[145px] max-w-none shrink-0"
              />
            </div>
          )}
        </div>
      )}
    </header>
  );
};
