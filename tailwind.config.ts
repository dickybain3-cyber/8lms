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
 * Peta ke desain acuan:
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
        ink: {
          DEFAULT: "#1e293b",
          light: "#334155",
          dark: "#0f172a",
        },
        paper: {
          DEFAULT: "#f8fafc",
          dark: "#eef2f7",
        },
        gold: {
          DEFAULT: "#3b82f6",
          light: "#60a5fa",
          dark: "#2563eb",
        },
        teal: {
          DEFAULT: "#2563eb",
          light: "#3b82f6",
        },
        ok: "#10b981",
        danger: "#ef4444",
        muted: "#64748b",
      },
      fontFamily: {
        // Variabel CSS-nya tetap --font-serif/--font-sans supaya kelas
        // `font-serif` yang sudah tersebar di banyak file tidak perlu
        // diganti; isinya sekarang Poppins (judul) & Inter (teks).
        serif: ["var(--font-serif)", "Poppins", "sans-serif"],
        sans: ["var(--font-sans)", "Inter", "sans-serif"],
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
