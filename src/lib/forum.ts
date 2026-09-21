/**
 * Aturan FORUM DISKUSI yang murni perhitungan — tanpa Supabase, tanpa
 * `next/headers`, tanpa React. Pola dan alasannya sama persis dengan
 * `src/lib/tugas.ts` (Tahap 4): dipusatkan di satu berkas supaya RLS,
 * Server Action, dan tombol di layar tidak bisa diam-diam saling
 * bertentangan, dan supaya bisa diuji tanpa database sama sekali
 * (lihat `src/lib/__tests__/forum.test.ts`).
 *
 * ── KENAPA FORUM TIDAK PUNYA "izinkan_terlambat" SEPERTI TUGAS ──
 *
 * Tugas sengaja punya jalur pengumpulan terlambat karena tugas itu hasil
 * kerja yang nilainya tidak berkurang cuma karena telat dikirim. Forum itu
 * OBROLAN — pesan yang "telat" ke ruang yang sudah ditutup tidak pernah
 * masuk akal untuk diterima, karena tidak ada lagi orang lain yang akan
 * membacanya di sana. Karena itu `faseForum` hanya tiga keadaan tegas dan
 * `bolehMengirimPesan` tidak punya jalur "boleh, tapi ditandai terlambat"
 * sama sekali — beda dengan `bolehMengumpulkan` di tugas.ts.
 *
 * ── SATU LAGI: WAKTU SELALU DIOPER, TIDAK PERNAH DIBACA SENDIRI ──
 *
 * Sama seperti tugas.ts: tidak ada fungsi di sini yang memanggil
 * `Date.now()` sendiri. `sekarang` selalu parameter, supaya jam yang
 * dipakai konsisten dengan jam server yang sudah dikoreksi (bukan jam HP
 * siswa), dan supaya semuanya bisa diuji tanpa menyentuh jam sistem.
 */

/** Bentuk minimal forum yang dibutuhkan perhitungan waktu di berkas ini. */
export interface ForumWaktu {
  dibuka_at: string;
  ditutup_at: string;
}

export type FaseForum = "belum_buka" | "berlangsung" | "ditutup";

/**
 * Fase forum menurut jam. Tidak ada status "lewat tenggat tapi masih
 * diterima" seperti `faseTugas` — begitu lewat `ditutup_at`, forum SELALU
 * `ditutup`, titik. Lihat penjelasan panjang di kepala berkas ini.
 */
export function faseForum(forum: ForumWaktu, sekarang: number): FaseForum {
  if (sekarang < new Date(forum.dibuka_at).getTime()) return "belum_buka";
  if (sekarang > new Date(forum.ditutup_at).getTime()) return "ditutup";
  return "berlangsung";
}

export function bolehMengirimPesan(
  forum: ForumWaktu,
  sekarang: number
): boolean {
  return faseForum(forum, sekarang) === "berlangsung";
}

/** Alasan kotak kirim terkunci, dalam kalimat yang bisa langsung ditempel
 *  di UI maupun dikembalikan Server Action. `null` = boleh mengirim. */
export function alasanTidakBolehMengirim(
  forum: ForumWaktu,
  sekarang: number
): string | null {
  const fase = faseForum(forum, sekarang);
  if (fase === "belum_buka") {
    return "Forum ini belum dibuka. Tunggu sampai waktu mulainya tiba.";
  }
  if (fase === "ditutup") {
    return "Forum ini sudah ditutup. Pesan baru tidak bisa dikirim lagi.";
  }
  return null;
}

/**
 * Jenis isi pesan. `teks` dihitung sebagai keaktifan (1 poin otomatis);
 * `sticker`/`emoticon` sengaja TIDAK dihitung — keduanya ada supaya siswa
 * yang tidak punya apa-apa untuk ditulis tetap bisa menunjukkan hadir
 * ("hadir tapi diam") tanpa ikut menaikkan poin cuma dengan mengirim
 * emoji berkali-kali.
 */
export type JenisIsiPesan = "teks" | "sticker" | "emoticon";

export function apakahPesanDihitungPoin(jenis: JenisIsiPesan): boolean {
  return jenis === "teks";
}

/**
 * Total poin seorang siswa di satu ruang forum. Fungsi ini SENGAJA cuma
 * penjumlahan sederhana, tidak ada logika lain di dalamnya — supaya kolom
 * `total` di tabel `forum_poin` (generated column, lihat 0020_forum.sql)
 * dan angka yang dipakai UI untuk perhitungan sisi klien (mis. urutan
 * optimistik sebelum `router.refresh()` selesai) tidak bisa punya rumus
 * yang diam-diam berbeda.
 */
export function hitungPoinTotal(
  poin_pesan: number,
  poin_bonus: number
): number {
  return poin_pesan + poin_bonus;
}

/** Kelipatan bonus yang diberikan/dibatalkan guru sekali klik. Toggle,
 *  bukan akumulasi — lihat komentar `bonus_diberikan` di 0020_forum.sql
 *  dan `PanelForumKelas.tsx` (Tahap 5 bagian admin) untuk alasan kenapa
 *  ini harus toggle, bukan tombol "+5" yang bisa ditekan berkali-kali. */
export const POIN_BONUS_PER_KLIK = 5;
