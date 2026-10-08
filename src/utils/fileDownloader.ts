/**
 * Universal file downloader that works seamlessly on desktop browsers,
 * mobile browsers, and Android WebViews / Kodular apps.
 */

export interface DownloadOptions {
  filename: string;
  mimeType?: string;
  directUrl?: string;
  allowShareApi?: boolean;
}


function isAndroidWebView(): boolean {
  const ua = navigator.userAgent || "";
  if (!/Android/i.test(ua)) return false;
  if ((window as any).AndroidClipboard) return true;
  if (/; wv\)/.test(ua)) return true;
  // WebView lama: "Version/4.0 Chrome/..." tanpa "Mobile Safari" browser sungguhan
  return /Version\/\d+\.\d+/.test(ua) && /Chrome\//.test(ua);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function showWebViewHint(absUrl: string, filename: string) {
  const old = document.getElementById("wv-download-hint");
  if (old) old.remove();
  const box = document.createElement("div");
  box.id = "wv-download-hint";
  box.style.cssText =
    "position:fixed;left:12px;right:12px;bottom:16px;z-index:99999;background:#111827;color:#fff;" +
    "border-radius:14px;padding:12px 14px;font:13px/1.4 sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4)";
  box.innerHTML =
    `<div style="font-weight:700;margin-bottom:4px">Mengunduh ${filename}…</div>` +
    `<div style="opacity:.85;margin-bottom:8px">Jika unduhan tidak mulai, salin tautan lalu buka di Chrome.</div>`;
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px";
  const mk = (label: string, bg: string, fn: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `flex:1;padding:8px;border:0;border-radius:10px;font-weight:700;color:#fff;background:${bg}`;
    b.onclick = fn;
    return b;
  };
  row.appendChild(
    mk("Salin Tautan", "#b91c1c", async () => {
      try {
        await navigator.clipboard.writeText(absUrl);
        alert("Tautan disalin. Tempel di Chrome untuk mengunduh (berlaku 5 menit).");
      } catch {
        prompt("Salin tautan ini:", absUrl);
      }
    })
  );
  row.appendChild(mk("Tutup", "#374151", () => box.remove()));
  box.appendChild(row);
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 20000);
}

// Android WebView tidak mendukung unduh blob:/data:. Titipkan file ke server,
// lalu unduh lewat URL http biasa (ditangani DownloadListener aplikasi).
async function downloadViaServer(blob: Blob, filename: string, mime: string): Promise<boolean> {
  try {
    const base64 = await blobToBase64(blob);
    const res = await fetch("/api/tempDownload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, mimeType: mime, base64 })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok || !json.url) return false;

    const absUrl = new URL(json.url, window.location.origin).toString();
    // iframe tersembunyi: halaman aplikasi tidak ikut berpindah
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = absUrl;
    document.body.appendChild(iframe);
    setTimeout(() => iframe.remove(), 60000);
    showWebViewHint(absUrl, filename);
    return true;
  } catch (e) {
    console.warn("Server download fallback failed:", e);
    return false;
  }
}

export async function downloadBlob(blob: Blob, options: DownloadOptions): Promise<void> {
  const { filename, mimeType, allowShareApi = true } = options;
  const actualMime = mimeType || blob.type || "application/octet-stream";

  // 0. Aplikasi Android resmi (APK v1.1+): kirim langsung ke jembatan AndroidDownload
  // -> file disimpan ke folder Download HP. Ini jalur paling andal di WebView.
  const nativeDl = (window as any).AndroidDownload;
  if (nativeDl && typeof nativeDl.postMessage === "function") {
    try {
      const data = await blobToBase64(blob);
      nativeDl.postMessage(JSON.stringify({ op: "save", name: filename, mime: actualMime, data }));
      return;
    } catch (nativeErr) {
      console.warn("AndroidDownload bridge failed, trying fallbacks:", nativeErr);
    }
  }

  // 1. Check for Web Share API on mobile / Android WebView (if supported)
  // This allows Android / Kodular users to immediately save to device storage, Google Drive, WhatsApp, etc.
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  if (allowShareApi && isMobile && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: actualMime });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: `Unduh file: ${filename}`
        });
        return;
      }
    } catch (shareErr: any) {
      // User cancelled share or share failed; continue to standard download fallback
      if (shareErr.name === "AbortError") {
        return;
      }
    }
  }

  // 1b. Android WebView: blob URL tidak bisa diunduh -> lewat server
  if (isAndroidWebView()) {
    if (await downloadViaServer(blob, filename, actualMime)) return;
  }

  // 2. Standard Blob URL download
  try {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    return;
  } catch (blobErr) {
    console.warn("Blob URL download failed, trying Base64 data URL fallback:", blobErr);
  }

  // 3. Fallback: Base64 Data URL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = reader.result as string;
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
