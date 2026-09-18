/**
 * Tahun ajaran Indonesia dari sebuah tanggal.
 *
 * Tahun ajaran sekolah di Indonesia dimulai bulan Juli. Jadi tanggal di
 * Juli 2026 sampai Juni 2027 sama-sama masuk tahun ajaran "2026/2027" —
 * bukan mengikuti tahun kalender begitu saja.
 *
 * Dipakai untuk kop rekap nilai yang diunduh ("Tahun Ajaran 2026/2027").
 * Tidak ada kolom `tahun_ajaran` di tabel `event`; ini dihitung dari
 * `tgl_mulai` kegiatan supaya tidak perlu migrasi skema atau field baru
 * yang harus diisi manual setiap kali guru membuat kegiatan.
 */
export function tahunAjaranDariTanggal(iso: string): string {
  const d = new Date(iso);
  const tahun = d.getFullYear();
  const bulan = d.getMonth(); // 0 = Januari … 6 = Juli
  return bulan >= 6 ? `${tahun}/${tahun + 1}` : `${tahun - 1}/${tahun}`;
}
