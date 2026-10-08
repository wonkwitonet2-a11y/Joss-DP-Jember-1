// Jembatan clipboard untuk aplikasi Android (WebView).
//
// Di WebView, navigator.clipboard.readText() ditolak sehingga tombol "Tempel"
// selalu jatuh ke kotak manual "Tempel Data (Manual)". Aplikasi Android
// (proyek yakult-webview-android) menyediakan objek `window.AndroidClipboard`
// yang bisa membaca/menulis clipboard sistem. File ini memasang pengganti
// navigator.clipboard.readText/writeText yang memakai objek itu, sehingga
// SEMUA tempat yang sudah memanggil navigator.clipboard ikut berfungsi
// tanpa perubahan lain.
//
// Di browser biasa (Chrome, dll) objek itu tidak ada, jadi file ini tidak
// melakukan apa-apa dan perilaku lama tetap dipakai.

type BridgeReply = { id: number; text?: string; ok?: boolean };

interface NativeBridge {
  postMessage: (msg: string) => void;
  addEventListener: (type: "message", cb: (ev: MessageEvent) => void) => void;
}

const TIMEOUT_MS = 2000;

export function installNativeClipboard(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;

  const bridge = (window as unknown as { AndroidClipboard?: NativeBridge }).AndroidClipboard;
  if (!bridge || typeof bridge.postMessage !== "function") return;

  let nextId = 1;
  const pending = new Map<number, (reply: BridgeReply) => void>();

  bridge.addEventListener("message", (ev: MessageEvent) => {
    try {
      const reply = JSON.parse(String(ev.data)) as BridgeReply;
      const done = pending.get(reply.id);
      if (done) {
        pending.delete(reply.id);
        done(reply);
      }
    } catch {
      // abaikan pesan yang tidak dikenal
    }
  });

  const call = (payload: Record<string, unknown>): Promise<BridgeReply> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error("Clipboard Android tidak merespons"));
      }, TIMEOUT_MS);
      pending.set(id, (reply) => {
        window.clearTimeout(timer);
        resolve(reply);
      });
      bridge.postMessage(JSON.stringify({ id, ...payload }));
    });

  const nativeClipboard = {
    readText: async (): Promise<string> => {
      const reply = await call({ op: "read" });
      return typeof reply.text === "string" ? reply.text : "";
    },
    writeText: async (text: string): Promise<void> => {
      const reply = await call({ op: "write", text: String(text) });
      if (!reply.ok) throw new Error("Gagal menyalin ke clipboard Android");
    },
  };

  try {
    const existing = navigator.clipboard as unknown as object | undefined;
    if (existing) {
      Object.defineProperty(existing, "readText", {
        value: nativeClipboard.readText,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(existing, "writeText", {
        value: nativeClipboard.writeText,
        configurable: true,
        writable: true,
      });
    } else {
      Object.defineProperty(navigator, "clipboard", {
        value: nativeClipboard,
        configurable: true,
      });
    }
  } catch {
    // Kalau gagal dipasang, biarkan kotak manual lama yang jalan.
  }
}
