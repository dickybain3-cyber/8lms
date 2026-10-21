import type { Config } from "tailwindcss";

/**
 * Sesi ini — palet diselaraskan dengan desain LMS SMPN 8 (biru/slate,
 * font Poppins) menggantikan palet lama (navy/emas/krem "kertas").
 *
 * PENTING — NAMA TOKEN-nya SENGAJA TIDAK DIUBAH (`ink`, `paper`, `gold`,
 * `teal`, `ok`, `danger`). Nama-nama itu sudah dipakai di ±30 file
 * halaman admin & siswa (`text-ink/60`, `border-ink/10`, `bg-paper`,
 * dst). Dengan cuma mengganti NILAI hex-nya di sini, seluruh halaman
 * ikut berganti tampilan sekaligus tanpa perlu menyentuh satu per satu
 * file itu — jauh lebih kecil risikonya daripada find-and-replace nama
 * kelas di puluhan file. Jadi kalau di kode terbaca `text-ink`, artinya
 * sekarang "slate gelap", bukan lagi "navy tinta".
 *
 * ── TEMA BIRU TUA SEKOLAH (revisi UI berikutnya) ──
 *
 * Mengikuti desain acuan bergaya "kabinet guru" (sidebar mengambang
 * berwarna gelap, latar terang kebiruan, kepala tabel berwarna, label
 * pil berwarna), dengan warna khas SMPN 8 Probolinggo: biru tua.
 * Palet `navy` di bawah adalah SATU-SATUNYA sumber biru tua — kalau
 * sekolah punya kode warna resmi, cukup ganti angka-angka di `navy`
 * (dan --primary/--sidebar di globals.css).
 *
 * `gold`/`teal` (aksen & tombol utama lama) kini menunjuk ke nada navy
 * juga, supaya halaman lama yang memakai `focus:border-gold` atau
 * `text-teal` ikut berganti tanpa diubah satu per satu.
 *
 * Peta lama ke desain acuan (sebelum revisi biru tua):
 *   ink    -> #1e293b  (--text-main)
 *   paper  -> #f8fafc  (--bg)
 *   gold   -> #3b82f6  (--accent, dipakai sebagai warna aksen/aktif)
 *   teal   -> #2563eb  (--primary, tautan & tombol utama)
 *   ok     -> #10b981  (--success)
 *   danger -> #ef4444  (--danger)
 */

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Teks utama: biru sangat tua (turunan biru logo), bukan abu slate.
        ink: {
          DEFAULT: "#1a2154",
          light: "#2c3a8a",
          dark: "#0e1440",
        },
        paper: {
          DEFAULT: "#eef1f9",
          dark: "#e2e8f3",
        },
        navy: {
          // Diambil dari biru lingkaran logo SMPN 8 Probolinggo.
          50: "#eef1fb",
          100: "#dce2f7",
          200: "#b8c3ee",
          300: "#8b9ce0",
          400: "#5d72cf",
          500: "#3d52bd",
          600: "#2c3fa6",
          700: "#24338f",
          800: "#1d2a78",
          900: "#172060",
          950: "#0e1440",
          DEFAULT: "#1d2a78",
        },
        // Kuning pena/obor di logo — aksen hangat (penanda aktif, sorotan).
        kuning: {
          DEFAULT: "#facc15",
          light: "#fef08a",
          dark: "#ca8a04",
        },
        gold: {
          DEFAULT: "#2c3fa6",
          light: "#3d52bd",
          dark: "#1d2a78",
        },
        teal: {
          DEFAULT: "#24338f",
          light: "#2c3fa6",
        },
        ok: "#10b981",
        danger: "#ef4444",
        muted: "#64748b",
      },
      fontFamily: {
        // Variabel CSS-nya tetap --font-serif/--font-sans supaya kelas
        // `font-serif` yang sudah tersebar di banyak file tidak perlu
        // diganti; isinya sekarang Poppins (judul) & Inter (teks).
        // Fallback DI DALAM var(): kalau variabel font tidak terdefinisi
        // (pernah terjadi di build Vercel: hash kelas font di HTML beda
        // dengan di CSS), deklarasi tetap sah dan jatuh ke font sistem
        // sans — bukan Times New Roman bawaan browser.
        serif: ["var(--font-serif, Poppins)", "Poppins", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        sans: ["var(--font-sans, Inter)", "Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.01)",
        "card-hover":
          "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
