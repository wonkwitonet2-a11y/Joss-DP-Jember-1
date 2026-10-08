export interface YlItem {
  area: string;
  nama: string;
  pin: string;
  kodeYl?: string;
  tanggalMasuk?: string;
  status: string;
  tanggalDaftar?: string;
  tanggalResign?: string;
  nik?: string;
  tglLahir?: string;
  ikutJht?: boolean;
  iuranJht?: number;
}

export const INITIAL_YL_LIST: YlItem[] = [
  { area: "201", nama: "Gusrina", pin: "201", kodeYl: "YL-201", status: "Aktif", tanggalMasuk: "2026-01-01", tanggalDaftar: "2026-01-01" },
  { area: "202", nama: "Dewi Ati Ani", pin: "202", kodeYl: "YL-202", status: "Aktif", tanggalMasuk: "2026-01-01", tanggalDaftar: "2026-01-01" },
  { area: "203", nama: "Gusrini", pin: "203", kodeYl: "YL-203", status: "Aktif", tanggalMasuk: "2026-01-01", tanggalDaftar: "2026-01-01" },
  { area: "204", nama: "Umi Maisaroh", pin: "204", kodeYl: "YL-204", status: "Aktif", tanggalMasuk: "2026-01-01", tanggalDaftar: "2026-01-01" },
  { area: "205", nama: "Suyik Rahmawati", pin: "205", kodeYl: "YL-205", status: "Aktif", tanggalMasuk: "2026-01-01", tanggalDaftar: "2026-01-01" },
  { area: "206", nama: "Ria Resti W", pin: "206", kodeYl: "YL-206", status: "Aktif", tanggalMasuk: "2026-01-01", tanggalDaftar: "2026-01-01" },
  { area: "207", nama: "Endang Setiowati", pin: "207", kodeYl: "YL-207", status: "Aktif", tanggalMasuk: "2026-01-01", tanggalDaftar: "2026-01-01" },
  { area: "208", nama: "Wakiah", pin: "208", kodeYl: "YL-208", status: "Aktif", tanggalMasuk: "2026-01-01", tanggalDaftar: "2026-01-01" },
  { area: "209", nama: "Titis", pin: "209", kodeYl: "YL-209", status: "Aktif", tanggalMasuk: "2026-01-01", tanggalDaftar: "2026-01-01" },
  { area: "210", nama: "Eni", pin: "210", kodeYl: "YL-210", status: "Aktif", tanggalMasuk: "2026-01-01", tanggalDaftar: "2026-01-01" }
];

export const DEFAULT_MANAGER_PIN = "1111";

export function deriveYlPins(ylList: YlItem[]): Record<string, string> {
  const pins: Record<string, string> = {};
  (ylList || []).forEach(y => {
    if (y.pin && y.nama && y.status !== "Resign") {
      pins[y.pin] = y.nama;
    }
  });
  return pins;
}

export function getStoredYlList(): YlItem[] {
  try {
    const raw = localStorage.getItem("yakult_yl_list");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Gagal membaca LocalStorage yakult_yl_list", e);
  }
  // Auto-initialize jika kosong/invalid
  try {
    localStorage.setItem("yakult_yl_list", JSON.stringify(INITIAL_YL_LIST));
  } catch (e) {}
  return INITIAL_YL_LIST;
}

export function getStoredYlPins(): Record<string, string> {
  try {
    const raw = localStorage.getItem("yakult_yl_pins");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Gagal membaca LocalStorage yakult_yl_pins", e);
  }
  const ylList = getStoredYlList();
  const derived = deriveYlPins(ylList);
  try {
    localStorage.setItem("yakult_yl_pins", JSON.stringify(derived));
  } catch (e) {}
  return derived;
}

export function getStoredManagerPin(): string {
  try {
    const stored = localStorage.getItem("yakult_manager_pin");
    if (stored && stored.trim()) {
      return stored.trim();
    }
  } catch (e) {
    console.warn("Gagal membaca LocalStorage yakult_manager_pin", e);
  }
  try {
    localStorage.setItem("yakult_manager_pin", DEFAULT_MANAGER_PIN);
  } catch (e) {}
  return DEFAULT_MANAGER_PIN;
}

export function saveStoredYlData(newList: YlItem[], managerPin?: string): { ylList: YlItem[]; ylPins: Record<string, string>; managerPin: string } {
  const ylPins = deriveYlPins(newList);
  const pinMgr = managerPin || getStoredManagerPin();

  try {
    const listToStore = newList.map(y => {
      const { foto, ...rest } = y as any;
      return rest;
    });
    localStorage.setItem("yakult_yl_list", JSON.stringify(listToStore));
    localStorage.setItem("yakult_yl_pins", JSON.stringify(ylPins));
    localStorage.setItem("yakult_manager_pin", pinMgr);
  } catch (e) {
    console.error("Gagal menyimpan data YL ke LocalStorage", e);
  }

  return { ylList: newList, ylPins, managerPin: pinMgr };
}

export function resetToDefaultData(): { ylList: YlItem[]; ylPins: Record<string, string>; managerPin: string } {
  try {
    localStorage.setItem("yakult_yl_list", JSON.stringify(INITIAL_YL_LIST));
    const derivedPins = deriveYlPins(INITIAL_YL_LIST);
    localStorage.setItem("yakult_yl_pins", JSON.stringify(derivedPins));
    localStorage.setItem("yakult_manager_pin", DEFAULT_MANAGER_PIN);
    return { ylList: INITIAL_YL_LIST, ylPins: derivedPins, managerPin: DEFAULT_MANAGER_PIN };
  } catch (e) {
    console.error("Gagal reset data ke LocalStorage", e);
    return { ylList: INITIAL_YL_LIST, ylPins: deriveYlPins(INITIAL_YL_LIST), managerPin: DEFAULT_MANAGER_PIN };
  }
}
