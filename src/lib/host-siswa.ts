/**
 * Domain "khusus guru": siswa TIDAK boleh login/membuka halaman siswa
 * lewat domain ini (mis. `8lms.vercel.app` yang sudah tersebar). Siswa
 * memakai domain lain yang hanya tertanam di ExamSafer.
 *
 * Diatur lewat env `NEXT_PUBLIC_HOST_KHUSUS_GURU` (boleh beberapa,
 * dipisah koma), mis. `8lms.vercel.app`. Kosong = fitur mati, perilaku
 * sama seperti sebelumnya. Bukan rahasia: hanya nama domain lama.
 *
 * NEXT_PUBLIC_ karena dibaca juga di browser (LoginForm) — nilainya
 * ditanam saat build, jadi setelah mengubah env WAJIB redeploy.
 */

function normalHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function daftarHostKhususGuru(env: string | undefined): string[] {
  if (!env) return [];
  return env
    .split(",")
    .map(normalHost)
    .filter((h) => h.length > 0);
}

/** true = host ini tertutup untuk siswa. */
export function hostTertutupUntukSiswa(
  host: string | null | undefined,
  env: string | undefined = process.env.NEXT_PUBLIC_HOST_KHUSUS_GURU
): boolean {
  if (!host) return false;
  const daftar = daftarHostKhususGuru(env);
  if (daftar.length === 0) return false;
  return daftar.includes(normalHost(host));
}

export const PESAN_SISWA_DITOLAK =
  "Siswa tidak bisa masuk lewat alamat ini. Buka LMS lewat aplikasi ExamSafer.";
