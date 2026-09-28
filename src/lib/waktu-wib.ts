/**
 * Konversi antara nilai `<input type="datetime-local">` (jam dinding WIB,
 * TANPA info zona waktu) dan ISO UTC yang tersimpan di database — dua-
 * duanya SELALU eksplisit Asia/Jakarta (WIB, UTC+7), TIDAK PERNAH
 * bergantung pada zona waktu tempat proses ini kebetulan berjalan.
 *
 * ── BUG YANG DIPERBAIKI FUNGSI INI ──
 *
 * Sebelum ada berkas ini, Server Action (createMapel, createTugas,
 * createForumTopik, dkk) menulis `new Date(nilaiDatetimeLocal).toISOString()`
 * langsung. `nilaiDatetimeLocal` ("2026-09-26T07:00") tidak membawa info
 * zona, dan spesifikasi JavaScript mengharuskan string seperti itu
 * ditafsirkan sebagai WAKTU LOKAL PROSES YANG MENJALANKANNYA — di server
 * produksi (mis. Vercel), itu UTC, BUKAN WIB. Jadi admin yang mengetik
 * "07.00" (maksudnya 07.00 WIB) tersimpan sebagai 07.00 UTC, lalu saat
 * ditampilkan lagi dalam WIB (UTC+7) terbaca **14.00** — persis laporan
 * "saya isi jam 07.00, kok tertulis jam 14.00". Beda 7 jam = beda UTC+7,
 * bukan kebetulan.
 *
 * `tugas.ts` (fungsi `untukInputDatetime` versi lama) sudah menuliskan
 * masalah ini secara eksplisit di komentarnya, dan sengaja memilih jalan
 * "proses server WAJIB diset `TZ=Asia/Jakarta`" supaya arah baca & tulis
 * konsisten satu sama lain. Itu solusi yang sah SELAMA env var itu benar-
 * benar terpasang di semua tempat kode ini berjalan (produksi, staging,
 * laptop tiap developer, CI) — sekali saja lupa di satu tempat, bug ini
 * muncul lagi persis seperti yang baru saja dilaporkan. Fungsi-fungsi di
 * bawah ini TIDAK bergantung env var itu sama sekali: WIB ditulis eksplisit
 * lewat offset `+07:00` (menulis) dan `timeZone: "Asia/Jakarta"` eksplisit
 * (membaca), jadi hasilnya sama persis di server mana pun, disetel
 * `TZ` atau tidak.
 *
 * KEDUA ARAH HARUS DIPAKAI BERSAMAAN — memperbaiki cuma arah tulis tanpa
 * arah baca (dipakai form Edit untuk mengisi ulang nilai datetime-local)
 * akan membuat form Edit menampilkan jam yang salah 7 jam ke arah
 * sebaliknya. Ini justru bug baru yang lebih halus karena cuma muncul di
 * halaman Edit, bukan Buat.
 */

const OFFSET_WIB = "+07:00";
const ZONA_WIB = "Asia/Jakarta";

/**
 * `<input type="datetime-local">` ("2026-09-26T07:00", jam dinding WIB)
 * → ISO UTC untuk disimpan ke database ("2026-09-26T00:00:00.000Z").
 *
 * Mengembalikan `null` kalau bentuknya tidak sesuai `<input
 * type="datetime-local">` sama sekali — pemanggil yang sudah memvalidasi
 * "wajib diisi" di tempat lain cukup memperlakukan `null` sebagai galat
 * bentuk data, bukan galat pengisian.
 */
export function datetimeLocalKeIsoWib(nilai: string): string | null {
  // <input type="datetime-local">.value SELALU "YYYY-MM-DDTHH:mm" (tanpa
  // detik) kecuali atribut `step` mengaktifkan detik ("YYYY-MM-DDTHH:mm:ss").
  // Dua-duanya ditangani; bentuk lain ditolak di sini supaya salah bentuk
  // gagal jelas, bukan diam-diam menghasilkan tanggal yang salah.
  const cocok = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(nilai.trim());
  if (!cocok) return null;

  const [, tanggalJam, detik] = cocok;
  const d = new Date(`${tanggalJam}${detik ?? ":00"}${OFFSET_WIB}`);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString();
}

/**
 * ISO UTC dari database → nilai untuk `<input type="datetime-local">`,
 * ditampilkan sebagai jam dinding WIB — dipakai form Edit supaya jam yang
 * tampil sama persis dengan jam yang diketik admin waktu membuatnya.
 *
 * Sengaja TIDAK memakai `d.getHours()`/`d.getMonth()` dkk (itu zona
 * PROSES, sumber bug ini) — dibaca lewat `Intl.DateTimeFormat` dengan
 * `timeZone: "Asia/Jakarta"` eksplisit, seperti `formatTenggat` di
 * `tugas.ts`.
 *
 * Boleh dipanggil dari Server Component MAUPUN Client Component — beda
 * dari versi lama (`untukInputDatetime`) yang mewajibkan Server Component
 * karena bergantung zona proses. Itu memang keunggulan utama pendekatan
 * eksplisit ini.
 */
export function isoKeDatetimeLocalWib(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const bagian = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_WIB,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23", // tanpa ini, tengah malam kadang keluar sebagai "24:00"
  }).formatToParts(d);

  const ambil = (tipe: string) =>
    bagian.find((b) => b.type === tipe)?.value ?? "00";

  return `${ambil("year")}-${ambil("month")}-${ambil("day")}T${ambil("hour")}:${ambil("minute")}`;
}
