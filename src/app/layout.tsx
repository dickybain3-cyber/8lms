import type { Metadata } from "next";
import { Poppins, Inter } from "next/font/google";
import "./globals.css";
import { SEKOLAH } from "@/lib/branding";

/**
 * Font diganti mengikuti desain acuan: Poppins untuk judul/penekanan,
 * Inter untuk teks panjang. Nama variabel CSS-nya SENGAJA tetap
 * `--font-serif` / `--font-sans` (lihat komentar di tailwind.config.ts)
 * supaya kelas `font-serif` yang sudah dipakai di banyak halaman tidak
 * perlu diubah satu per satu — sekarang kelas itu menghasilkan Poppins.
 */
const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: `LMS ${SEKOLAH.nama} ${SEKOLAH.kota}`,
  description: "Sistem ujian berbasis komputer (CBT) SMP Negeri 8 Probolinggo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        {/*
          Font Awesome dipakai untuk ikon di seluruh aplikasi, sama
          seperti desain acuan. Dimuat lewat CDN (bukan paket npm)
          supaya tidak menambah dependensi & ukuran bundle JS —
          ikonnya cuma butuh CSS + font file.
        */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body className={`${poppins.variable} ${inter.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
