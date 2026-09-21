/**
 * Aturan berkas unggahan tugas. Murni perhitungan string & angka — tidak
 * mengimpor Supabase sama sekali, supaya bisa dipakai di komponen client
 * (untuk menolak berkas SEBELUM diunggah, jadi siswa tidak menunggu 4 MB
 * terkirim cuma untuk ditolak) dan di Server Action (yang tidak boleh
 * percaya begitu saja pada pengecekan di client).
 *
 * ── TIGA LAPIS YANG MENGECEK HAL YANG SAMA, DAN KENAPA PERLU KETIGANYA ──
 *
 *   1. Form di HP siswa  — `accept=` + `validasiBerkas()`. Tujuannya
 *      KENYAMANAN: gagal cepat, pesan jelas, kuota siswa tidak terbakar.
 *   2. `validasiBerkas()` lagi di Server Action. Tujuannya KEBENARAN:
 *      lapis 1 dijalankan di perangkat yang tidak kita kendalikan.
 *   3. `allowed_mime_types` + `file_size_limit` di bucket (0019).
 *      Tujuannya KEPASTIAN: ini yang benar-benar mengikat, dan yang tetap
 *      berlaku kalau suatu saat ada jalur unggah baru yang lupa lapis 2.
 *
 * Batas dan daftar tipenya ditulis SEKALI di sini dan HARUS sama dengan
 * yang ada di migrasi 0019. Kalau salah satunya diubah, ubah keduanya —
 * `MAKS_UKURAN_BERKAS` di bawah sengaja ditulis sebagai perkalian yang
 * terbaca (5 * 1024 * 1024) supaya angkanya bisa dicocokkan sekilas
 * dengan `5242880` di SQL.
 */

export const BUCKET_TUGAS = "tugas";

export const MAKS_UKURAN_BERKAS = 5 * 1024 * 1024; // 5 MB — sama dengan 0019

/**
 * Tipe yang diterima. Sengaja TIDAK memasukkan video: satu video HP bisa
 * puluhan MB, dan satu kelas berisi 32 anak yang semuanya mengunggah video
 * akan menghabiskan kuota storage sekolah dalam satu tugas. Kalau suatu
 * saat memang perlu, tambahkan di sini DAN di `allowed_mime_types` bucket,
 * lalu naikkan batas ukurannya secara sadar.
 *
 * HEIC ikut diterima karena itu format default kamera iPhone; menolaknya
 * berarti sebagian siswa harus mengonversi dulu, dan mereka tidak akan
 * tahu caranya.
 */
export const TIPE_BERKAS_DIIZINKAN: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

/** Untuk atribut `accept` di <input type="file">. */
export const ACCEPT_BERKAS = TIPE_BERKAS_DIIZINKAN.join(",");

export const KETERANGAN_BERKAS =
  "Foto (JPG/PNG/HEIC), PDF, Word, atau teks. Maksimal 5 MB.";

/**
 * Bersihkan nama berkas sebelum dipakai sebagai bagian path storage.
 *
 * Yang dibuang dan kenapa:
 *   - Segala hal yang bukan huruf/angka/titik/strip. Nama berkas dari HP
 *     sering mengandung spasi, tanda kurung, bahkan emoji; itu semua
 *     membuat path storage menyakitkan untuk ditangani dan mengacaukan
 *     `storage.foldername()` yang dipakai policy 0019.
 *   - `..` dan `/`. Ini bukan sekadar kerapian: path traversal adalah cara
 *     klasik untuk menulis ke folder milik orang lain, dan folder orang
 *     lain di sini berarti pengumpulan siswa lain.
 *
 * Nama aslinya TIDAK hilang — disimpan utuh di `pengumpulan_tugas.
 * berkas_nama` dan itu yang ditampilkan ke guru. Yang dibersihkan hanya
 * versi yang masuk ke path.
 */
export function bersihkanNamaBerkas(nama: string): string {
  const dasar = nama.split(/[\\/]/).pop() ?? "berkas";
  const bersih = dasar
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 80);
  return bersih === "" ? "berkas" : bersih;
}

/**
 * Path objek di bucket `tugas`. Bentuknya dikunci policy storage di 0019:
 * segmen kedua HARUS siswa_id pemilik sesi. Jangan mengubah urutannya
 * tanpa mengubah policy-nya juga — kalau tidak, unggahan siswa akan
 * ditolak dengan pesan yang sangat tidak informatif.
 */
export function pathBerkasTugas(
  tugasId: string,
  siswaId: string,
  namaBerkas: string
): string {
  return `${tugasId}/${siswaId}/${bersihkanNamaBerkas(namaBerkas)}`;
}

/** Pesan error, atau `null` kalau berkasnya sah. */
export function validasiBerkas(berkas: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (berkas.size <= 0) {
    return "Berkasnya kosong (0 byte). Coba pilih ulang.";
  }
  if (berkas.size > MAKS_UKURAN_BERKAS) {
    const mb = (berkas.size / (1024 * 1024)).toFixed(1);
    return `Berkas terlalu besar (${mb} MB). Maksimal 5 MB — kalau itu foto, coba kirim ulang dengan kualitas lebih kecil.`;
  }
  // `type` bisa string kosong kalau browser tidak mengenali berkasnya.
  // Menolaknya di sini lebih baik daripada membiarkannya lewat lalu
  // ditolak bucket dengan pesan mentah yang tidak dimengerti siswa.
  if (!TIPE_BERKAS_DIIZINKAN.includes(berkas.type)) {
    return `Jenis berkas ini tidak diterima${
      berkas.type ? ` (${berkas.type})` : ""
    }. ${KETERANGAN_BERKAS}`;
  }
  return null;
}
