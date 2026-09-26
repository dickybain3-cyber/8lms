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
 * `sticker`/`emoticon`/`gambar` sengaja TIDAK dihitung — sticker/emoticon
 * ada supaya siswa yang tidak punya apa-apa untuk ditulis tetap bisa
 * menunjukkan hadir ("hadir tapi diam") tanpa ikut menaikkan poin cuma
 * dengan mengirim emoji berkali-kali; `gambar` tidak dihitung dengan
 * alasan yang sama persis — kalau foto dihitung poin, mengirim 20 foto
 * kosong/acak jadi cara termudah mengerek poin tanpa benar-benar aktif
 * berdiskusi. Lihat 0021_forum_gambar_balas_reaksi.sql untuk sisi
 * database (trigger poin tidak diubah sama sekali oleh migrasi itu,
 * karena sudah dibatasi `when (new.jenis_isi = 'teks' ...)`).
 */
export type JenisIsiPesan = "teks" | "sticker" | "emoticon" | "gambar";

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

/**
 * ── FOTO DI FORUM ──
 *
 * Batas ukuran AKHIR (setelah dikecilkan di browser) untuk pesan
 * `jenis_isi = "gambar"`. Angka ini jauh lebih ketat daripada
 * `BATAS_UNGGAH_BYTE` (5 MB) di `unggah-gambar.ts`, yang dipakai guru
 * untuk gambar soal — di sana gambarnya sedikit dan dilihat sekali per
 * ujian. Forum sebaliknya: satu ruang kelas bisa berisi puluhan foto dari
 * puluhan siswa dalam satu sesi, dibuka ulang setiap kali forum
 * displuling, jadi ukuran per foto harus ditekan jauh lebih agresif supaya
 * satu ruang chat yang penuh foto tetap ringan dibuka di HP siswa dengan
 * kuota terbatas.
 *
 * Ini BATAS AKHIR yang harus dicapai kompresi (lihat `kecilkanGambarChat`
 * di `unggah-gambar.ts`), bukan ambang penolakan berkas asli — sesuai
 * permintaan produk: siswa boleh unggah berkas sebesar apa pun dari
 * kamera/galerinya, sisi klien yang wajib menekannya sampai di bawah
 * angka ini sebelum sempat menyentuh jaringan.
 */
export const BATAS_UKURAN_GAMBAR_BYTE = 200 * 1024;

/**
 * Emoji reaksi yang guru bisa pilih untuk satu bubble pesan (0021,
 * `forum_reaksi`). Daftar pendek dan tetap, bukan emoji picker bebas —
 * konsisten dengan filosofi EMOTICON_CEPAT di FormChatForum.tsx (siswa):
 * pilihan cepat siap pakai, bukan input bebas yang perlu divalidasi.
 */
export const REAKSI_TERSEDIA = ["👍", "❤️", "😂", "🎉", "👏", "🤔"] as const;

export type EmojiReaksi = (typeof REAKSI_TERSEDIA)[number];

/**
 * ── VALIDASI PESAN YANG DIPAKAI SERVER ACTION (Part 4) ──
 *
 * Semua di bawah ini murni (tanpa Supabase, tanpa `next/headers`) supaya
 * bisa diuji tanpa database — pola yang sama dengan fungsi di atas. Server
 * Action (`siswa/forum/actions.ts`, `admin/event/[eventId]/forum/
 * actions.ts`) yang memanggilnya; RLS tetap jaring pengaman terakhir, tapi
 * RLS TIDAK memeriksa isi `gambar_url` maupun kecocokan ruang untuk
 * `balas_ke_id` (lihat catatan di 0021), jadi dua hal itu ditegakkan di
 * sini.
 */

export const JENIS_ISI_PESAN = ["teks", "sticker", "emoticon", "gambar"] as const;

export function jenisIsiValid(nilai: unknown): nilai is JenisIsiPesan {
  return (
    typeof nilai === "string" &&
    (JENIS_ISI_PESAN as readonly string[]).includes(nilai)
  );
}

/** Isi bawaan untuk foto tanpa keterangan. Kolom `isi` `not null` sejak
 *  0020, jadi pesan foto tetap butuh teks. Klien (FormChatForum) sudah
 *  mengirim nilai ini juga; server menormalkannya sendiri supaya tidak
 *  bergantung pada klien. */
export const ISI_FOTO_TANPA_CAPTION = "[Foto]";

export const BATAS_PANJANG_PESAN = 2000;

/**
 * Rapikan `isi` mentah dari form. Kembalian:
 *  - string  : isi final yang siap disimpan
 *  - null    : isi kosong dan jenisnya bukan gambar -> tolak
 * Hanya `gambar` yang boleh kosong (diganti placeholder); teks/sticker/
 * emoticon kosong tetap ditolak.
 */
export function rapikanIsiPesan(jenis: JenisIsiPesan, isiMentah: string): string | null {
  const isi = isiMentah.trim();
  if (isi) return isi;
  return jenis === "gambar" ? ISI_FOTO_TANPA_CAPTION : null;
}

/**
 * Apakah `url` benar-benar hasil unggahan ke Cloudinary MILIK jenjang ini?
 *
 * Tanpa pengecekan ini, siswa bisa mengirim `gambar_url` apa saja lewat
 * Server Action (klien tidak bisa dipercaya) — mis. gambar dari situs
 * lain yang tak bisa kita kendalikan, atau pelacak pihak ketiga — dan
 * URL itu akan dimuat otomatis di HP seluruh kelas. Syaratnya ketat:
 * https, host persis `res.cloudinary.com`, path diawali
 * `/<cloudName>/image/upload/`, tanpa query/fragment, panjang wajar.
 * `URL` dipakai untuk mengurai (bukan `startsWith` pada string mentah)
 * supaya trik seperti `https://res.cloudinary.com@situs-lain.com/...`
 * tidak lolos.
 */
export function urlGambarForumSah(url: string, cloudName: string): boolean {
  if (!url || url.length > 500 || !cloudName) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    u.hostname === "res.cloudinary.com" &&
    u.port === "" &&
    u.username === "" &&
    u.password === "" &&
    u.search === "" &&
    u.hash === "" &&
    u.pathname.startsWith(`/${cloudName}/image/upload/`) &&
    u.pathname.length > `/${cloudName}/image/upload/`.length
  );
}

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Format UUID saja. Dicek sebelum query supaya nilai ngawur dari form
 *  menghasilkan kalimat manusiawi, bukan error `invalid input syntax for
 *  type uuid` dari Postgres. */
export function apakahUuid(nilai: unknown): nilai is string {
  return typeof nilai === "string" && POLA_UUID.test(nilai);
}

/** Emoji reaksi harus persis salah satu `REAKSI_TERSEDIA`. Kolom
 *  `forum_reaksi.emoji` bertipe `text` bebas dan RLS tidak memeriksa
 *  isinya, jadi Server Action `toggleReaksiPesan` memvalidasinya di sini. */
export function emojiReaksiValid(nilai: unknown): nilai is EmojiReaksi {
  return (
    typeof nilai === "string" &&
    (REAKSI_TERSEDIA as readonly string[]).includes(nilai)
  );
}
