/**
 * Helper untuk membangun filter `.or()`/`.and()` PostgREST secara manual
 * (dipakai saat perlu menggabungkan lebih dari satu kondisi OR dalam SATU
 * pemanggilan `.or()` — misalnya keyset pagination composite key
 * digabung dengan pencarian teks bebas, lihat pemakaian di
 * `src/app/admin/siswa/page.tsx` dan `src/app/admin/guru/page.tsx`).
 *
 * Kenapa tidak panggil `.or()` dua kali terpisah untuk dua kondisi yang
 * beda? supabase-js/PostgREST menaruh tiap `.or()` sebagai parameter URL
 * `or=...` sendiri-sendiri — perilaku query string dengan DUA key yang
 * sama (`or=A&or=B`) tidak didokumentasikan dengan jelas untuk kasus ini
 * (beda dari filter kolom biasa yang memang didesain AND-composable).
 * Supaya tidak bergantung pada perilaku yang belum diverifikasi itu,
 * kalau ada dua kondisi OR yang perlu digabung AND, gabungkan jadi SATU
 * ekspresion `and(or(...),or(...))` lewat helper ini, lalu kirim lewat
 * satu pemanggilan `.or()`.
 *
 * CATATAN JUJUR: fungsi escape di bawah mengikuti dokumentasi sintaks
 * filter PostgREST (bungkus nilai dengan karakter spesial pakai tanda
 * kutip ganda, escape backslash & tanda kutip di dalamnya) tapi BELUM
 * pernah diuji langsung ke instance PostgREST sungguhan (nunggak akses
 * Supabase — lihat README bagian status environment). Kalau nanti ada
 * akses, uji dulu dengan nama yang mengandung koma/kurung/tanda kutip
 * sebelum terlalu percaya diri pada helper ini.
 */
export function escapePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Bangun ekspresi cursor keyset untuk composite key `(kolomUrutan, id)`
 * menaik (ascending): baris dengan `kolomUrutan > cursorValue`, ATAU
 * (`kolomUrutan = cursorValue` DAN `id > cursorId`). Dipakai untuk kolom
 * urut yang BISA duplikat (mis. `nama`) — beda dari cursor sederhana
 * `created_at < cursor` di `/admin/log` yang kolomnya praktis unik.
 */
export function cursorKeysetOr(
  kolomUrutan: string,
  cursorValue: string,
  cursorId: string
): string {
  const v = escapePostgrestValue(cursorValue);
  return `${kolomUrutan}.gt.${v},and(${kolomUrutan}.eq.${v},id.gt.${cursorId})`;
}
