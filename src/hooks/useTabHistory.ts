import { useEffect, useRef } from 'react';

/**
 * Menyinkronkan tab aktif dengan riwayat browser (tombol/gestur kembali di HP).
 *
 * Struktur riwayat:   [dummy] -> [tab beranda] -> [tab lain] -> ...
 *  - "dummy" adalah jebakan: kalau pengguna menekan kembali dari beranda, aplikasi tidak keluar
 *    (tidak blank), melainkan tetap di beranda.
 *  - Setiap entri memuat `scope` (mis. "yl" / "manager") supaya entri sisa dari tampilan lain
 *    (login sebelumnya, tampilan admin, dll) tidak dianggap tab yang valid -> sebelumnya ini
 *    bisa membuat layar kosong karena tab-nya tidak dikenal.
 *  - Entri bertanda `overlay` (mis. chatbot) dikelola oleh pemiliknya, bukan oleh hook ini.
 */
export function useTabHistory<T extends string>(
  activeTab: T,
  setActiveTab: (tab: T) => void,
  defaultTab: T,
  scope: string = "app"
) {
  const setTabRef = useRef(setActiveTab);
  setTabRef.current = setActiveTab;

  // Inisialisasi riwayat sekali saat tampilan dibuka
  useEffect(() => {
    const st = window.history.state;
    if (st && st.scope === scope && st.tab) return; // sudah diinisialisasi (mis. StrictMode)
    window.history.replaceState({ dummy: true, scope }, "");
    window.history.pushState({ tab: activeTab, scope }, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab berubah lewat klik -> catat satu entri riwayat.
  // Setelah back/forward, state.tab sudah sama dengan activeTab sehingga tidak ada entri ganda
  // (tidak perlu flag yang bisa "nyangkut" seperti sebelumnya).
  useEffect(() => {
    const st = window.history.state;
    if (st && st.scope === scope && st.tab === activeTab) return;
    window.history.pushState({ tab: activeTab, scope }, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const st = e.state;

      // Entri milik overlay (chatbot dsb): bukan urusan hook ini
      if (st && st.overlay) return;

      if (st && st.scope === scope && st.tab) {
        setTabRef.current(st.tab as T);
        return;
      }

      // Entri dummy / kosong / sisa tampilan lain -> tahan di beranda, jangan keluar / blank
      window.history.pushState({ tab: defaultTab, scope }, "");
      setTabRef.current(defaultTab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [defaultTab, scope]);
}
