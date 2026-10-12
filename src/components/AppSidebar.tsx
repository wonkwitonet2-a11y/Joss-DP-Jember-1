import React from 'react';
import { BarChart3, CalendarCheck, TrendingUp, Target, Users, Archive, Settings, GitCompare, LayoutGrid, FileSpreadsheet, Award, Shirt, BookOpen, Globe, Monitor, AlertCircle, Bot, X, ChevronRight } from 'lucide-react';

export interface AppMenuItem {
  id: string;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
}

export const MANAGER_MENUS: AppMenuItem[] = [
  // Pantau (sama dengan menu bawah)
  { id: 'dashboard', label: 'Dashboard', short: 'Dasbor', icon: BarChart3, group: 'Pantau' },
  { id: 'input_realisasi', label: 'Penjualan', short: 'Penjualan', icon: FileSpreadsheet, group: 'Pantau' },
  { id: 'breakdown', label: 'Breakdown & Realisasi', short: 'BD & Real', icon: GitCompare, group: 'Pantau' },
  { id: 'evaluasi', label: 'Evaluasi', short: 'Evaluasi', icon: Award, group: 'Pantau' },
  { id: 'seragam', label: 'Seragam & Logistik', short: 'Seragam', icon: Shirt, group: 'Pantau' },
  { id: 'product_knowledge', label: 'Product Knowledge', short: 'PK', icon: BookOpen, group: 'Pantau' },

  // Kelola
  { id: 'plg_pjl', label: 'Pelanggan & Penjualan', short: 'Pelanggan', icon: Users, group: 'Kelola' },
  { id: 'target_kompensasi', label: 'Target & Kompensasi', short: 'Target', icon: Target, group: 'Kelola' },
  { id: 'lady', label: 'Profil & Status YL', short: 'Profil YL', icon: Users, group: 'Kelola' },
  { id: 'tautan', label: 'Tautan Dokumen', short: 'Tautan', icon: Globe, group: 'Kelola' },
  { id: 'archive', label: 'Arsip Bulanan', short: 'Arsip', icon: Archive, group: 'Kelola' },
  { id: 'setting', label: 'Pengaturan', short: 'Setting', icon: Settings, group: 'Kelola' },

  // Fitur Tambahan
  { id: 'presentasi', label: 'Alat Presentasi', short: 'Presentasi', icon: Monitor, group: 'Fitur Tambahan' },
  { id: 'attention', label: 'Catatan Penting', short: 'Catatan', icon: AlertCircle, group: 'Fitur Tambahan' },
  { id: 'ai_chat', label: 'Tanya AI', short: 'Tanya AI', icon: Bot, group: 'Fitur Tambahan' },
];

export const YL_MENUS: AppMenuItem[] = [
  // Menu Utama YL
  { id: 'input', label: 'Entry Penjualan', short: 'Penjualan', icon: CalendarCheck, group: 'Menu Utama YL' },
  { id: 'ringkasan', label: 'Ringkasan Bulanan', short: 'Ringkasan', icon: BarChart3, group: 'Menu Utama YL' },
  { id: 'breakdown', label: 'Breakdown & Realisasi', short: 'Breakdown', icon: GitCompare, group: 'Menu Utama YL' },
  { id: 'realisasi_potensi', label: 'Realisasi Potensi', short: 'Potensi', icon: Target, group: 'Menu Utama YL' },
  { id: 'evaluasi', label: 'Evaluasi Penjualan', short: 'Evaluasi', icon: Award, group: 'Menu Utama YL' },

  // Kelola & Edukasi
  { id: 'potensi_tembus', label: 'Potensi Tembus', short: 'Tembus', icon: TrendingUp, group: 'Kelola & Edukasi' },
  { id: 'seragam', label: 'Seragam & Logistik', short: 'Seragam', icon: Shirt, group: 'Kelola & Edukasi' },
  { id: 'product_knowledge', label: 'Product Knowledge', short: 'Knowledge', icon: BookOpen, group: 'Kelola & Edukasi' },
  { id: 'tautan', label: 'Link Dokumen', short: 'Link', icon: Globe, group: 'Kelola & Edukasi' },
  { id: 'ai_chat', label: 'Tanya AI', short: 'Tanya AI', icon: Bot, group: 'Kelola & Edukasi' },
];

/**
 * Ikon judul halaman — SAMA dengan ikon di menu samping (drawer/sidebar),
 * supaya judul tiap halaman selalu seragam dengan menunya.
 * Pakai: <MenuTitleIcon id="breakdown" />
 */
export const MenuTitleIcon: React.FC<{ id: string; role?: 'manager' | 'yl'; className?: string }> = ({
  id,
  role = 'manager',
  className = 'w-5 h-5 text-brand-600 dark:text-brand-400',
}) => {
  const list = role === 'yl' ? [...YL_MENUS, ...MANAGER_MENUS] : [...MANAGER_MENUS, ...YL_MENUS];
  const alias: Record<string, string> = { grafik: 'dashboard', lhpp_realisasi: 'input_realisasi' };
  const key = alias[id] || id;
  const found = list.find((m) => m.id === key);
  if (!found) return null;
  const Icon = found.icon;
  return <Icon className={`${className} shrink-0`} />;
};

const MANAGER_BOTTOM_IDS = ['dashboard', 'input_realisasi', 'breakdown', 'evaluasi', 'seragam', 'product_knowledge'];
const YL_BOTTOM_IDS = ['input', 'ringkasan', 'breakdown', 'evaluasi'];

interface AppSidebarProps {
  role: 'manager' | 'yl';
  currentMenu: string;
  onSelectMenu: (menu: string) => void;
  // Drawer state for mobile
  isDrawerOpen: boolean;
  onCloseDrawer: () => void;
  onOpenDrawer: () => void;
  // Collapsed state for tablet/desktop
  collapsed: boolean;
  onToggleCollapse: () => void;
  // Metadata
  itemCount?: number;
  userName?: string;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  role,
  currentMenu,
  onSelectMenu,
  isDrawerOpen,
  onCloseDrawer,
  onOpenDrawer,
  collapsed,
  onToggleCollapse,
  itemCount = 10,
  userName
}) => {
  const isManager = role === 'manager';
  const menus = isManager ? MANAGER_MENUS : YL_MENUS;
  const bottomIds = isManager ? MANAGER_BOTTOM_IDS : YL_BOTTOM_IDS;
  const inMore = !bottomIds.includes(currentMenu);

  const groups = Array.from(new Set(menus.map((m) => m.group)));

  const handlePick = (id: string) => {
    onSelectMenu(id);
    onCloseDrawer();
  };

  const renderNavList = () => (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      {groups.map((group) => (
        <div key={group}>
           <p className="px-3 mb-1.5 text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
            {group}
          </p>
          <div className="space-y-0.5">
            {menus
              .filter((m) => m.group === group)
              .map((item) => {
                const Icon = item.icon;
                const active = currentMenu === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handlePick(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs sm:text-sm text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-brand-50 text-brand-700 font-bold dark:bg-brand-950/50 dark:text-brand-300 shadow-2xs'
                        : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800/80 dark:hover:text-neutral-100 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 ${
                          active ? 'text-brand-600 dark:text-brand-400' : 'text-neutral-400 dark:text-neutral-500'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {active && <ChevronRight className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0" />}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </nav>
  );

  // Akun YL: tanpa sidebar, tanpa menu bawah, tanpa drawer (navigasi lewat menu tengah di beranda)
  if (!isManager) return null;

  return (
    <>
      {/* 1. TABLET & DESKTOP: Left Collapsible Sidebar */}
      <aside
        className={`${
          collapsed ? 'hidden' : 'hidden md:flex'
        } flex-col w-60 lg:w-64 shrink-0 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 h-[calc(100vh-3.5rem)] sticky top-14 transition-all shadow-2xs z-30`}
      >
        {/* Header Sidebar with Tutup (X) button for wide table screens */}
        <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">
              {isManager ? 'Admin' : 'Menu YL'}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 font-semibold">
              {isManager ? `${itemCount} Unit` : (userName || 'Online')}
            </span>
          </div>

          {/* Button Tutup (X) */}
          <button
            onClick={onToggleCollapse}
            aria-label="Tutup menu samping"
            title="Tutup menu (Lebarkan tampilan layar data)"
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100 transition-colors border border-neutral-200 dark:border-neutral-700 shadow-2xs shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span className="text-[11px]">Tutup</span>
          </button>
        </div>

        {/* Sidebar Nav List */}
        {renderNavList()}

        {/* Footer Sidebar */}
        <div className="px-4 py-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span className="truncate">{isManager ? 'Admin' : (userName || 'Yakult Lady')}</span>
          <button
            onClick={onToggleCollapse}
            title="Tutup menu samping"
            className="flex items-center gap-1 text-neutral-500 hover:text-brand-600 dark:text-neutral-400 dark:hover:text-brand-400 transition-colors font-medium cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Sembunyikan</span>
          </button>
        </div>
      </aside>

      {/* 2. MOBILE: Bottom Navigation Bar — hanya Admin (akun YL: tidak ada menu bawah) */}
      {isManager && (
        <nav
          aria-label="Menu navigasi mobile"
          className="md:hidden order-last w-full shrink-0 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className={`grid ${isManager ? 'grid-cols-7' : 'grid-cols-5'} h-16`}>
            {bottomIds.map((id) => {
              const item = menus.find((m) => m.id === id);
              if (!item) return null;
              const Icon = item.icon;
              const active = currentMenu === id;
              return (
                <button
                  key={id}
                  onClick={() => onSelectMenu(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-1 min-w-0 px-0.5 ${isManager ? 'text-[10px]' : 'text-[11px]'} leading-none font-semibold transition-colors cursor-pointer ${
                    active ? 'text-brand-600 dark:text-brand-400' : 'text-neutral-500 dark:text-neutral-400'
                  }`}
                >
                  <span className={`${isManager ? 'px-2' : 'px-3'} py-1 rounded-full transition-colors ${active ? 'bg-brand-50 dark:bg-brand-950/50' : ''}`}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="max-w-full truncate">{item.short}</span>
                </button>
              );
            })}

            {/* 5th Button: 'Lainnya' which slides open the full Drawer */}
            <button
              onClick={onOpenDrawer}
              className={`flex flex-col items-center justify-center gap-1 min-w-0 px-0.5 ${isManager ? 'text-[10px]' : 'text-[11px]'} leading-none font-semibold transition-colors cursor-pointer ${
                inMore ? 'text-brand-600 dark:text-brand-400' : 'text-neutral-500 dark:text-neutral-400'
              }`}
            >
              <span className={`${isManager ? 'px-2' : 'px-3'} py-1 rounded-full transition-colors ${inMore ? 'bg-brand-50 dark:bg-brand-950/50' : ''}`}>
                <LayoutGrid className="w-5 h-5" />
              </span>
              Lainnya
            </button>
          </div>
        </nav>
      )}

      {/* 3. MOBILE: Bottom Drawer (Sliding up from bottom when 'Lainnya' or Menu toggle is clicked) */}
      <>
        {/* Backdrop overlay */}
        <div
          onClick={onCloseDrawer}
          aria-hidden="true"
          className={`md:hidden fixed inset-0 bg-black/50 backdrop-blur-xs z-40 transition-opacity duration-200 ${
            isDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* Sliding Drawer Container */}
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Semua menu aplikasi"
          className={`md:hidden fixed bottom-0 inset-x-0 z-50 max-h-[85vh] bg-white dark:bg-neutral-900 rounded-t-3xl shadow-2xl flex flex-col transition-transform duration-200 ease-out border-t border-neutral-200 dark:border-neutral-800 ${
            isDrawerOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {/* Drawer Top Handle Bar & Header */}
          <div className="relative pt-3 pb-2 px-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div className="w-10 h-1 bg-neutral-300 dark:bg-neutral-700 rounded-full mx-auto absolute top-2.5 left-1/2 -translate-x-1/2" />
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-2">
              {isManager ? 'Semua Menu Admin' : 'Semua Menu YL'}
            </h2>
            <button
              onClick={onCloseDrawer}
              aria-label="Tutup menu"
              className="p-2 -mr-2 rounded-xl text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer mt-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Menu List */}
          <div className="flex-1 overflow-y-auto">
            {renderNavList()}
          </div>
        </aside>
      </>
    </>
  );
};
