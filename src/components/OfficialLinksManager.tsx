import React, { useState, useEffect } from "react";
import { ExternalLink, LayoutTemplate, Plus, Trash2, Edit2 } from "lucide-react";

interface OfficialLink {
  id: string;
  title: string;
  url: string;
  mode: "iframe" | "new_tab";
}

export const OfficialLinksManager: React.FC = () => {
  const [links, setLinks] = useState<OfficialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveMsg, setSaveMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"iframe" | "new_tab">("new_tab");

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = () => {
    fetch("/api/getOfficialLinks")
      .then(res => res.json())
      .then(data => {
        setLinks(data.links || []);
        setLoading(false);
      })
      .catch(e => {
        console.error("Gagal load links", e);
        setLoading(false);
      });
  };

  const saveToBackend = async (newLinks: OfficialLink[]) => {
    try {
      const res = await fetch("/api/saveOfficialLinks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: newLinks })
      });
      if (res.ok) {
        setSaveMsg("Tautan berhasil disimpan!");
        setTimeout(() => setSaveMsg(""), 3000);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("Gagal menyimpan tautan");
      setTimeout(() => setErrorMsg(""), 3000);
    }
  };

  const handleSaveLink = () => {
    if (!title.trim() || !url.trim()) {
      setErrorMsg("Judul dan URL harus diisi.");
      setTimeout(() => setErrorMsg(""), 3000);
      return;
    }
    
    // Ensure URL has http/https
    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = "https://" + finalUrl;
    }

    let newLinks = [...links];
    if (isEditing) {
      newLinks = newLinks.map(l => l.id === editingId ? { ...l, title, url: finalUrl, mode } : l);
    } else {
      newLinks.push({
        id: "link_" + Date.now(),
        title,
        url: finalUrl,
        mode
      });
    }
    
    setLinks(newLinks);
    saveToBackend(newLinks);
    resetForm();
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      const newLinks = links.filter(l => l.id !== deleteConfirmId);
      setLinks(newLinks);
      saveToBackend(newLinks);
      setDeleteConfirmId(null);
    }
  };

  const handleEdit = (l: OfficialLink) => {
    setIsEditing(true);
    setEditingId(l.id);
    setTitle(l.title);
    setUrl(l.url);
    setMode(l.mode);
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditingId("");
    setTitle("");
    setUrl("");
    setMode("new_tab");
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
      <h2 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
        🔗 Kelola Tautan Eksternal (Link Yakult)
      </h2>
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed">
        Tambahkan link resmi Yakult yang bisa diakses langsung oleh Manager dan YL dari dasbor. Anda bisa mengatur apakah link dibuka langsung di dalam aplikasi (jika diizinkan oleh sistem pusat) atau di tab baru.
      </p>

      {/* Form Add/Edit */}
      <div className="bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 space-y-3">
        <h3 className="text-xs font-bold text-neutral-700 dark:text-neutral-300">{isEditing ? "Edit Tautan" : "Tambah Tautan Baru"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase">Judul Menu</label>
            <input 
              type="text" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              placeholder="Contoh: Portal Absensi"
              className="w-full text-xs text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800 p-2 rounded-lg border border-neutral-200 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase">URL / Link Web</label>
            <input 
              type="url" 
              value={url} 
              onChange={e => setUrl(e.target.value)} 
              placeholder="https://..."
              className="w-full text-xs text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-800 p-2 rounded-lg border border-neutral-200 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 uppercase">Mode Buka Link</label>
          <div className="flex flex-wrap gap-2">
            <label className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border cursor-pointer transition-colors ${mode === "iframe" ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300" : "bg-white border-neutral-200 text-neutral-600"}`}>
              <input type="radio" className="hidden" checked={mode === "iframe"} onChange={() => setMode("iframe")} />
              <LayoutTemplate className="w-4 h-4" /> Buka Dalam Aplikasi (Iframe)
            </label>
            <label className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border cursor-pointer transition-colors ${mode === "new_tab" ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300" : "bg-white border-neutral-200 text-neutral-600"}`}>
              <input type="radio" className="hidden" checked={mode === "new_tab"} onChange={() => setMode("new_tab")} />
              <ExternalLink className="w-4 h-4" /> Buka di Tab Lain
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button onClick={handleSaveLink} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors">
            {isEditing ? <Edit2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {isEditing ? "Simpan Perubahan" : "Tambahkan Link"}
          </button>
          {isEditing && (
            <button onClick={resetForm} className="bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 text-neutral-700 dark:text-neutral-300 font-bold text-xs px-4 py-2 rounded-lg transition-colors">
              Batal
            </button>
          )}
        </div>
        {saveMsg && <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-lg">{saveMsg}</p>}
        {errorMsg && <p className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg">{errorMsg}</p>}
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          <p className="text-xs text-neutral-400 font-medium">Memuat tautan...</p>
        ) : links.length === 0 ? (
          <p className="text-xs text-neutral-400 font-medium italic">Belum ada tautan yang ditambahkan.</p>
        ) : (
          links.map(l => (
            <div key={l.id} className="flex flex-col p-3 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3 overflow-hidden pr-2">
                  <div className="mt-0.5 text-indigo-500 shrink-0">
                    {l.mode === "new_tab" ? <ExternalLink className="w-4 h-4" /> : <LayoutTemplate className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 truncate">{l.title}</h4>
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">{l.url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleEdit(l)} className="p-1.5 rounded-lg text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Edit">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(l.id)} className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Hapus">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {deleteConfirmId === l.id && (
                <div className="flex items-center justify-between bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40 p-2 rounded-lg mt-3">
                   <p className="text-[10px] text-rose-700 dark:text-rose-300 font-bold ml-1">Yakin hapus tautan ini?</p>
                   <div className="flex items-center gap-2">
                      <button onClick={() => setDeleteConfirmId(null)} className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50">Batal</button>
                      <button onClick={confirmDelete} className="text-[10px] font-bold text-white bg-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-700 shadow-sm">Hapus</button>
                   </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
