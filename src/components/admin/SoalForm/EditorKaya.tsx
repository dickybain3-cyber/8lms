"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACCEPT_GAMBAR,
  gambarDariClipboard,
  prosesDanUnggah,
} from "@/lib/unggah-gambar";
import {
  bersihkanHtml,
  htmlKeTeks,
  LEBAR_GAMBAR_PILIHAN,
} from "@/lib/html-soal";

/**
 * Kolom isian kaya untuk pertanyaan & opsi jawaban — pengganti
 * `<textarea>` / `<input type="text">` yang lama.
 *
 * ── MASALAH YANG DIPECAHKAN ──
 *
 * Guru menyalin potongan layar (Snipping Tool, atau Ctrl+C dari PDF/Word)
 * lalu menekan Ctrl+V di kolom pertanyaan, dan TIDAK TERJADI APA-APA.
 * Bukan salah guru: `<textarea>` memang mustahil memuat gambar. Satu-
 * satunya jalur gambar yang berfungsi adalah kotak unggah terpisah di
 * bawah kolom teks — yang berarti (a) guru harus menyimpan tangkapan
 * layarnya jadi berkas dulu, dan (b) gambarnya SELALU muncul di bawah
 * seluruh pertanyaan, tidak pernah bisa disisipkan di tengah kalimat.
 * Untuk soal "Perhatikan gambar berikut. [gambar] Berapa luas daerah
 * yang diarsir?" itu berarti bentuk soalnya tidak bisa dibuat sama
 * sekali.
 *
 * ── KENAPA contentEditable, BUKAN PUSTAKA EDITOR ──
 *
 * Kebutuhannya sempit dan sudah pasti: tebal, miring, garis bawah, rata
 * kiri/tengah/kanan, daftar, dan gambar sebaris. TipTap/Slate/Quill
 * masing-masing menambah 40–120 KB JavaScript ke halaman admin dan
 * membawa model dokumennya sendiri, sementara yang dibutuhkan di sini
 * cukup dilayani `document.execCommand`. `execCommand` memang berstatus
 * deprecated di spesifikasi, tapi tidak ada browser yang berencana
 * menghapusnya (terlalu banyak web bergantung padanya) dan tidak ada
 * penggantinya yang sudah baku. Kalau suatu saat perlu diganti, yang
 * berubah hanya isi file ini — bentuk data yang keluar (HTML bersih)
 * tidak ikut berubah.
 *
 * ── KENAPA TIDAK DIKENDALIKAN REACT (uncontrolled) ──
 *
 * `contentEditable` dengan `dangerouslySetInnerHTML` yang diperbarui
 * setiap ketikan akan MEMINDAHKAN KURSOR KE AWAL setiap kali React
 * merender ulang — mengetik jadi mustahil. Jadi DOM-lah pemegang
 * kebenaran selama mengedit; `innerHTML` awal dipasang sekali saat
 * mount, lalu setiap perubahan dilaporkan ke atas lewat `onChange`.
 * `key` di pemanggil (lihat PilganForm) yang memastikan editor dibuat
 * ulang kalau soal yang diedit berganti.
 */

const LEBAR_LABEL: Record<string, string> = {
  "25": "25%",
  "50": "50%",
  "75": "75%",
  "100": "Penuh",
};

type Perintah = {
  nama: string;
  ikon: string;
  judul: string;
  perintah: string;
  /** `styleWithCSS`: true menghasilkan `style=`, false menghasilkan tag
   *  semantik (<b>/<i>/<u>). Lihat catatan di `jalankan()`. */
  pakaiCss: boolean;
};

const PERINTAH_TEKS: Perintah[] = [
  { nama: "bold", ikon: "fa-bold", judul: "Tebal (Ctrl+B)", perintah: "bold", pakaiCss: false },
  { nama: "italic", ikon: "fa-italic", judul: "Miring (Ctrl+I)", perintah: "italic", pakaiCss: false },
  { nama: "underline", ikon: "fa-underline", judul: "Garis bawah (Ctrl+U)", perintah: "underline", pakaiCss: false },
];

const PERINTAH_RATA: Perintah[] = [
  { nama: "justifyLeft", ikon: "fa-align-left", judul: "Rata kiri", perintah: "justifyLeft", pakaiCss: true },
  { nama: "justifyCenter", ikon: "fa-align-center", judul: "Rata tengah", perintah: "justifyCenter", pakaiCss: true },
  { nama: "justifyRight", ikon: "fa-align-right", judul: "Rata kanan", perintah: "justifyRight", pakaiCss: true },
];

const PERINTAH_DAFTAR: Perintah[] = [
  { nama: "insertUnorderedList", ikon: "fa-list-ul", judul: "Daftar butir", perintah: "insertUnorderedList", pakaiCss: false },
  { nama: "insertOrderedList", ikon: "fa-list-ol", judul: "Daftar bernomor", perintah: "insertOrderedList", pakaiCss: false },
];

export default function EditorKaya({
  nilaiAwal,
  onChange,
  placeholder = "Tulis di sini…",
  minTinggi = "6rem",
  ringkas = false,
  disabled = false,
}: {
  /** HTML awal. Untuk soal lama yang masih teks polos, pemanggil
   *  mengubahnya lewat `teksKeHtml()` dulu. */
  nilaiAwal: string;
  /** Dipanggil tiap perubahan dengan HTML yang SUDAH disaring dan teks
   *  polos turunannya — pemanggil menyimpan keduanya. */
  onChange: (hasil: { html: string; teks: string }) => void;
  placeholder?: string;
  minTinggi?: string;
  /** Mode sempit untuk baris opsi jawaban: toolbar lebih rapat. */
  ringkas?: boolean;
  disabled?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const inputBerkasRef = useRef<HTMLInputElement>(null);
  const rangeRef = useRef<Range | null>(null);

  const [kosong, setKosong] = useState(true);
  const [aktif, setAktif] = useState<Record<string, boolean>>({});
  const [jumlahUnggah, setJumlahUnggah] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [gambarTerpilih, setGambarTerpilih] = useState<HTMLImageElement | null>(
    null
  );

  // Isi awal dipasang SEKALI. Lihat catatan "uncontrolled" di atas.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = bersihkanHtml(nilaiAwal);
    setKosong(el.textContent?.trim() === "" && !el.querySelector("img"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const laporkan = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = bersihkanHtml(el.innerHTML);
    setKosong(el.textContent?.trim() === "" && !el.querySelector("img"));
    onChange({ html, teks: htmlKeTeks(html) });
  }, [onChange]);

  /** Simpan posisi kursor. Dibutuhkan karena mengklik tombol toolbar
   *  memindahkan fokus keluar dari editor, dan tanpa ini penyisipan
   *  gambar lewat tombol selalu mendarat di akhir teks, bukan di tempat
   *  kursor tadi berada. */
  const simpanRange = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    if (el.contains(r.commonAncestorContainer)) {
      rangeRef.current = r.cloneRange();
    }
  }, []);

  const pulihkanRange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const r = rangeRef.current;
    if (r && el.contains(r.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }
    const akhir = document.createRange();
    akhir.selectNodeContents(el);
    akhir.collapse(false);
    sel.removeAllRanges();
    sel.addRange(akhir);
  }, []);

  const perbaruiStatusTombol = useCallback(() => {
    const semua = [...PERINTAH_TEKS, ...PERINTAH_RATA, ...PERINTAH_DAFTAR];
    const next: Record<string, boolean> = {};
    for (const p of semua) {
      try {
        next[p.nama] = document.queryCommandState(p.perintah);
      } catch {
        next[p.nama] = false;
      }
    }
    setAktif(next);
  }, []);

  function jalankan(p: Perintah) {
    if (disabled) return;
    pulihkanRange();
    // `styleWithCSS` menentukan bentuk keluaran execCommand, dan ini
    // penting karena penyaring HTML hanya meloloskan daftar tertentu:
    //   false → <b>/<i>/<u>            (lolos penyaring)
    //   true  → style="text-align:…"   (satu-satunya style yang lolos)
    // Kalau tebal dijalankan dengan styleWithCSS=true, hasilnya
    // <span style="font-weight:bold"> yang akan DIBUANG penyaring —
    // guru menekan tombol Tebal, teksnya menebal di layar, lalu
    // ketebalannya hilang begitu soal disimpan. Diatur per perintah.
    try {
      document.execCommand("styleWithCSS", false, String(p.pakaiCss));
    } catch {
      // Sebagian browser lama melempar di sini; perintahnya tetap jalan.
    }
    document.execCommand(p.perintah);
    simpanRange();
    perbaruiStatusTombol();
    laporkan();
  }

  /**
   * Sisipkan gambar di posisi kursor.
   *
   * Gambar muncul SEKETIKA memakai URL `blob:` lokal, lalu `src`-nya
   * ditukar ke URL Cloudinary begitu unggahan selesai. Urutan ini
   * disengaja: di jaringan sekolah unggahan bisa memakan 10–30 detik,
   * dan editor yang diam saja selama itu membuat guru menekan Ctrl+V
   * berkali-kali — menghasilkan empat salinan gambar yang sama.
   */
  const sisipkanGambar = useCallback(
    async (file: File) => {
      const el = editorRef.current;
      if (!el || disabled) return;

      setError(null);
      const penanda = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const urlSementara = URL.createObjectURL(file);

      pulihkanRange();
      document.execCommand(
        "insertHTML",
        false,
        `<img src="${urlSementara}" data-penanda="${penanda}" alt="" />`
      );
      simpanRange();
      setJumlahUnggah((n) => n + 1);
      laporkan();

      try {
        const { url } = await prosesDanUnggah(file);
        const img = el.querySelector<HTMLImageElement>(
          `img[data-penanda="${penanda}"]`
        );
        if (img) {
          img.src = url;
          img.removeAttribute("data-penanda");
        }
      } catch (err) {
        // Gambar sementara DIHAPUS saat unggah gagal. Membiarkannya
        // berarti guru melihat gambarnya utuh di layar, menekan Simpan,
        // dan soalnya tersimpan tanpa gambar tanpa ada yang memberi tahu.
        const img = el.querySelector<HTMLImageElement>(
          `img[data-penanda="${penanda}"]`
        );
        img?.remove();
        setError(err instanceof Error ? err.message : "Upload gambar gagal.");
      } finally {
        URL.revokeObjectURL(urlSementara);
        setJumlahUnggah((n) => n - 1);
        laporkan();
      }
    },
    [disabled, laporkan, pulihkanRange, simpanRange]
  );

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;

    const berkas = gambarDariClipboard(e.clipboardData);
    if (berkas) {
      e.preventDefault();
      void sisipkanGambar(berkas);
      return;
    }

    // Tempelan teks dari Word/Google Docs membawa puluhan KB markup —
    // <style> global, kelas mso-*, tabel pembungkus. Kalau dibiarkan
    // masuk apa adanya, satu tempelan bisa mengacaukan tata letak
    // seluruh kartu soal di HP siswa. Disaring dulu di sini, bukan cuma
    // saat disimpan, supaya yang dilihat guru di editor sama dengan yang
    // nanti dilihat siswa.
    const html = e.clipboardData.getData("text/html");
    if (html) {
      e.preventDefault();
      document.execCommand("insertHTML", false, bersihkanHtml(html));
      simpanRange();
      laporkan();
    }
    // Teks polos dibiarkan ditangani browser seperti biasa.
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    const berkas = gambarDariClipboard(e.dataTransfer);
    if (!berkas) return;
    e.preventDefault();
    void sisipkanGambar(berkas);
  }

  function onKlik(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    setGambarTerpilih(
      target.tagName === "IMG" ? (target as HTMLImageElement) : null
    );
    simpanRange();
    perbaruiStatusTombol();
  }

  function ubahLebarGambar(lebar: string) {
    if (!gambarTerpilih) return;
    gambarTerpilih.setAttribute("data-lebar", lebar);
    gambarTerpilih.style.width = `${lebar}%`;
    laporkan();
  }

  function hapusGambarTerpilih() {
    if (!gambarTerpilih) return;
    gambarTerpilih.remove();
    setGambarTerpilih(null);
    laporkan();
  }

  const sedangUnggah = jumlahUnggah > 0;
  const paddingTombol = ringkas ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm";

  return (
    <div
      className={`overflow-hidden rounded-md border bg-white transition-colors ${
        disabled ? "border-ink/10 opacity-60" : "border-ink/15 focus-within:border-gold"
      }`}
    >
      <div
        className={`flex flex-wrap items-center gap-0.5 border-b border-ink/10 bg-paper-dark/40 ${
          ringkas ? "px-1 py-1" : "px-1.5 py-1.5"
        }`}
      >
        {PERINTAH_TEKS.map((p) => (
          <TombolToolbar
            key={p.nama}
            p={p}
            aktif={aktif[p.nama]}
            kelas={paddingTombol}
            disabled={disabled}
            onJalankan={jalankan}
          />
        ))}

        <Pemisah />

        {PERINTAH_RATA.map((p) => (
          <TombolToolbar
            key={p.nama}
            p={p}
            aktif={aktif[p.nama]}
            kelas={paddingTombol}
            disabled={disabled}
            onJalankan={jalankan}
          />
        ))}

        {!ringkas && (
          <>
            <Pemisah />
            {PERINTAH_DAFTAR.map((p) => (
              <TombolToolbar
                key={p.nama}
                p={p}
                aktif={aktif[p.nama]}
                kelas={paddingTombol}
                disabled={disabled}
                onJalankan={jalankan}
              />
            ))}
          </>
        )}

        <Pemisah />

        <button
          type="button"
          title="Sisipkan gambar (atau tempel langsung dengan Ctrl+V)"
          aria-label="Sisipkan gambar"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => inputBerkasRef.current?.click()}
          className={`flex items-center justify-center rounded text-ink/60 transition-colors hover:bg-ink/10 hover:text-ink disabled:opacity-40 ${paddingTombol}`}
        >
          <i className="fas fa-image" aria-hidden />
        </button>

        <button
          type="button"
          title="Hapus format (tebal/miring/garis bawah)"
          aria-label="Hapus format"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            jalankan({
              nama: "removeFormat",
              ikon: "",
              judul: "",
              perintah: "removeFormat",
              pakaiCss: false,
            })
          }
          className={`flex items-center justify-center rounded text-ink/60 transition-colors hover:bg-ink/10 hover:text-ink disabled:opacity-40 ${paddingTombol}`}
        >
          <i className="fas fa-eraser" aria-hidden />
        </button>

        {sedangUnggah && (
          <span className="ml-auto flex items-center gap-1.5 px-2 text-xs font-medium text-teal">
            <i className="fas fa-circle-notch fa-spin" aria-hidden />
            Mengunggah {jumlahUnggah} gambar…
          </span>
        )}
      </div>

      {/*
        `relative` + pseudo-placeholder: `contentEditable` tidak punya
        atribut `placeholder`, jadi teks bantuannya dipasang lewat CSS
        (lihat `.editor-kaya` di globals.css) yang hanya muncul saat
        kosong. Tidak memakai node teks asli karena node itu akan ikut
        terkirim sebagai isi soal kalau guru langsung menekan Simpan.
      */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-kosong={kosong ? "1" : "0"}
        data-placeholder={placeholder}
        onInput={laporkan}
        onBlur={() => {
          simpanRange();
          laporkan();
        }}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onKeyUp={() => {
          simpanRange();
          perbaruiStatusTombol();
        }}
        onMouseUp={() => {
          simpanRange();
          perbaruiStatusTombol();
        }}
        onClick={onKlik}
        className="editor-kaya isi-soal w-full px-3.5 py-2.5 text-ink outline-none"
        style={{ minHeight: minTinggi }}
      />

      {gambarTerpilih && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink/10 bg-gold/[0.06] px-3 py-2">
          <span className="text-xs font-medium text-ink/60">Lebar gambar:</span>
          {LEBAR_GAMBAR_PILIHAN.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => ubahLebarGambar(l)}
              className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                gambarTerpilih.getAttribute("data-lebar") === l
                  ? "border-gold bg-gold/20 text-ink"
                  : "border-ink/15 bg-white text-ink/60 hover:border-ink/30"
              }`}
            >
              {LEBAR_LABEL[l]}
            </button>
          ))}
          <button
            type="button"
            onClick={hapusGambarTerpilih}
            className="ml-auto rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
          >
            <i className="fas fa-trash-can mr-1" aria-hidden />
            Hapus gambar
          </button>
        </div>
      )}

      {error && (
        <p className="border-t border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <input
        ref={inputBerkasRef}
        type="file"
        accept={ACCEPT_GAMBAR}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void sisipkanGambar(f);
          // Direset supaya memilih BERKAS YANG SAMA dua kali berturut-turut
          // tetap memicu `change` — tanpa ini, mencoba ulang setelah unggah
          // gagal tidak melakukan apa pun.
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Pemisah() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-ink/15" aria-hidden />;
}

function TombolToolbar({
  p,
  aktif,
  kelas,
  disabled,
  onJalankan,
}: {
  p: Perintah;
  aktif?: boolean;
  kelas: string;
  disabled: boolean;
  onJalankan: (p: Perintah) => void;
}) {
  return (
    <button
      type="button"
      title={p.judul}
      aria-label={p.judul}
      aria-pressed={!!aktif}
      disabled={disabled}
      // `onMouseDown` di-preventDefault supaya menekan tombol TIDAK
      // menghapus seleksi teks di editor. Tanpa ini, menyorot kata lalu
      // menekan Tebal tidak menebalkan apa pun — seleksinya sudah hilang
      // sebelum perintahnya jalan.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onJalankan(p)}
      className={`flex items-center justify-center rounded transition-colors disabled:opacity-40 ${kelas} ${
        aktif
          ? "bg-gold/25 text-ink"
          : "text-ink/60 hover:bg-ink/10 hover:text-ink"
      }`}
    >
      <i className={`fas ${p.ikon}`} aria-hidden />
    </button>
  );
}
