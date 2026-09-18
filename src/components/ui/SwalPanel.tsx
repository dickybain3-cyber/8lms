"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Layar antrian + sapaan sukses saat login.
 *
 * ── KENAPA TIDAK MEMAKAI SweetAlert2 ──
 *
 * Bentuk tampilannya memang meniru SweetAlert2, tapi ditulis sendiri —
 * tanpa menambah dependensi. Tiga alasan:
 *
 *   1. SweetAlert2 menyuntikkan DOM-nya sendiri ke <body> lewat efek
 *      samping imperatif (`Swal.fire()`). Di React Server Components
 *      milik Next.js App Router, pola itu sering tidak sinkron dengan
 *      transisi rute — modal sempat muncul sesaat lalu hilang ketika
 *      `router.replace()` mengganti halaman, atau justru tertinggal di
 *      layar setelah pindah halaman.
 *   2. Paketnya ±45 KB, dan halaman login adalah halaman yang dibuka
 *      600 siswa bersamaan lewat jaringan sekolah dalam lima menit yang
 *      sama. Itu satu-satunya halaman yang beban unduhnya benar-benar
 *      berarti.
 *   3. Tidak perlu `npm install` — kode ini bisa langsung dipakai.
 *
 * Kalau nanti tetap ingin memakai SweetAlert2, komponen ini bisa
 * diganti isinya tanpa mengubah pemanggilnya di LoginForm.
 */

/**
 * ── PERBAIKAN: SAPAAN YANG "KEPOTONG" ──
 *
 * `LayarAntrian` dan `SapaanSukses` dulu dirender `position: fixed`
 * langsung di tempat mereka dipanggil — di dalam kartu login
 * (`LoginPage`) yang punya `backdrop-blur-[5px]` di elemen pembungkusnya.
 *
 * Itu masalahnya. `backdrop-filter` (juga `filter`, `transform`,
 * `will-change: transform`) pada sebuah elemen membuatnya jadi
 * *containing block* baru untuk keturunan yang `position: fixed` —
 * aturan CSS yang mudah tidak disadari karena namanya "fixed" terdengar
 * seperti selalu relatif ke viewport. Begitu ada nenek moyang yang
 * memakai salah satu properti itu, `inset-0` pada elemen fixed di
 * dalamnya berarti "penuhi kartu login yang blur itu", BUKAN "penuhi
 * layar" — persis kenapa sapaannya terlihat terjepit/terpotong di
 * dalam kartu kecil, bukan menutupi seluruh layar seperti yang dituju
 * className-nya.
 *
 * Perbaikannya: kedua komponen ini di-render lewat React Portal
 * langsung ke `document.body`, keluar dari pohon DOM manapun yang
 * memakai backdrop-blur. Pemanggilnya (`LoginForm.tsx`) tidak perlu
 * berubah sama sekali — cara memanggilnya tetap sama, cuma tempat
 * akhirnya di DOM yang pindah.
 */
function usePortalTarget(): HTMLElement | null {
  const [siap, setSiap] = useState(false);
  useEffect(() => setSiap(true), []);
  return siap ? document.body : null;
}

/**
 * Layar penuh selama proses masuk.
 *
 * ── KENAPA ADA TAHAPAN, BUKAN SEKADAR SPINNER ──
 *
 * Login di sini bukan satu panggilan, tapi rangkaian: verifikasi ke
 * Supabase Auth → cari baris guru → kalau bukan guru, cari baris siswa
 * → baru pindah halaman. Di jaringan sekolah saat 600 siswa masuk
 * bersamaan, rangkaian itu bisa memakan belasan detik.
 *
 * Spinner tanpa keterangan selama belasan detik membuat siswa menekan
 * tombol Masuk berulang kali — yang mengirim permintaan login
 * bertumpuk dan justru memperlambat antrian untuk semua orang. Dengan
 * tahapan yang bergerak, layarnya terlihat sedang bekerja, bukan macet.
 */
export function LayarAntrian({ tahap }: { tahap: string }) {
  const [detik, setDetik] = useState(0);
  const target = usePortalTarget();

  useEffect(() => {
    const t = setInterval(() => setDetik((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!target) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 px-5 backdrop-blur-sm">
      <div className="w-full max-w-[320px] animasi-muncul rounded-3xl bg-white px-7 py-9 text-center shadow-2xl">
        <div className="relative mx-auto mb-6 h-16 w-16">
          <span className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-2xl text-white shadow-lg shadow-blue-600/30">
            <i className="fas fa-circle-notch fa-spin" aria-hidden />
          </span>
        </div>

        <p className="font-serif text-lg font-bold text-ink">Sedang masuk…</p>
        <p className="mt-2 min-h-[2.5rem] text-sm leading-relaxed text-slate-500">
          {tahap}
        </p>

        {detik >= 6 && (
          <p className="animasi-muncul mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-[0.72rem] leading-relaxed text-amber-800">
            <i className="fas fa-hourglass-half mr-1.5" aria-hidden />
            Banyak yang masuk bersamaan. Tunggu sebentar — jangan tutup
            halaman atau menekan tombol lagi, nomor antreanmu sudah
            terdaftar.
          </p>
        )}
      </div>
    </div>,
    target
  );
}

export interface SapaanData {
  nama: string;
  /** "Siswa", "Guru", atau "Administrator". */
  peran: string;
  /** Kelas siswa (mis. "7.3"). Dikosongkan untuk guru & admin. */
  kelas?: string | null;
  jenjangLabel?: string | null;
}

/**
 * Sapaan setelah login berhasil.
 *
 * Ditampilkan SEBELUM pindah halaman, lalu menutup sendiri setelah
 * beberapa detik. Fungsinya bukan hiasan: ini satu-satunya titik di
 * seluruh aplikasi yang memberi tahu siswa bahwa dia masuk sebagai
 * ORANG YANG BENAR. Alur login siswa memakai pilih-nama dari daftar
 * sekelas, jadi salah pilih nama teman yang tanggal lahirnya kebetulan
 * sama bukan hal mustahil — dan kalau tidak ketahuan di sini, baru
 * ketahuan setelah ujiannya terlanjur dikerjakan atas nama orang lain.
 *
 * Kelas ikut ditampilkan untuk siswa dengan alasan yang sama. Untuk
 * guru dan admin, kelas tidak relevan (mereka tidak terikat satu
 * kelas), jadi hanya perannya yang disebut.
 */
export function SapaanSukses({
  data,
  onSelesai,
}: {
  data: SapaanData;
  onSelesai: () => void;
}) {
  const [sisa, setSisa] = useState(3);
  const target = usePortalTarget();

  useEffect(() => {
    if (sisa <= 0) {
      onSelesai();
      return;
    }
    const t = setTimeout(() => setSisa((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [sisa, onSelesai]);

  const inisial = data.nama.trim().charAt(0).toUpperCase() || "?";

  if (!target) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 px-5 backdrop-blur-sm">
      <div className="w-full max-w-[340px] animasi-muncul overflow-hidden rounded-3xl bg-white text-center shadow-2xl">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#3b82f6] via-[#2563eb] to-[#1d4ed8] px-6 pb-12 pt-8">
          {/* Dua lingkaran dekoratif setengah-transparan — pemanis murni
              CSS, tanpa gambar yang perlu diunduh, supaya kartunya terasa
              lebih "berkelas" tanpa menambah beban halaman login yang
              dibuka 600 HP sekaligus. */}
          <span
            className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute -bottom-12 -left-6 h-24 w-24 rounded-full bg-white/10"
            aria-hidden
          />
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/15 ring-4 ring-white/25 backdrop-blur-sm">
            <i
              className="fas fa-circle-check text-4xl text-white"
              aria-hidden
            />
          </div>
          <p className="relative mt-4 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-white/80">
            Berhasil masuk
          </p>
        </div>

        <div className="-mt-10 px-6 pb-7">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-amber-400 to-amber-500 font-serif text-3xl font-bold text-white shadow-lg">
            {inisial}
          </div>

          <p className="mt-4 text-sm text-slate-500">Selamat datang,</p>
          <p className="mt-0.5 break-words font-serif text-xl font-bold leading-tight text-ink">
            {data.nama}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[0.75rem] font-semibold text-blue-700">
              <i className="fas fa-id-badge" aria-hidden />
              {data.peran}
            </span>
            {data.kelas && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[0.75rem] font-semibold text-emerald-700">
                <i className="fas fa-users-rectangle" aria-hidden />
                Kelas {data.kelas}
              </span>
            )}
            {!data.kelas && data.jenjangLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[0.75rem] font-semibold text-slate-600">
                <i className="fas fa-layer-group" aria-hidden />
                {data.jenjangLabel}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onSelesai}
            className="mt-6 w-full rounded-xl bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink-light"
          >
            Lanjutkan
            <span className="ml-1.5 text-white/60">({sisa})</span>
          </button>
        </div>
      </div>
    </div>,
    target
  );
}
