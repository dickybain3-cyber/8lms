"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isJenjangValid, type Jenjang } from "@/lib/jenjang";
import { suffixEmailSiswa, passwordDariTanggalISO } from "@/lib/akun";

/**
 * ALUR LOGIN SISWA MODE UJI COBA (Sesi ini).
 *
 * Masalah versi sebelumnya: siswa baru bisa masuk kalau akun Supabase
 * Auth-nya SUDAH dibuat lebih dulu (lewat import CSV di /admin/siswa).
 * Kalau datanya dimasukkan langsung lewat SQL — seperti yang dilakukan
 * sekarang, `auth_id` = NULL — maka `signInWithPassword` di
 * `LoginForm.tsx` pasti gagal: akunnya memang tidak pernah ada. Itu
 * persis gejala "tanggal lahir sudah benar tapi tetap ditolak".
 *
 * Solusi di file ini: siswa cukup pilih nama + isi tanggal lahir.
 * Server mencocokkan tanggal lahir itu ke kolom `siswa.tanggal_lahir`,
 * lalu MEMBUATKAN akun auth-nya sendiri saat itu juga (service role)
 * kalau belum ada, dan menaut `siswa.auth_id`. Jadi tidak ada lagi
 * pekerjaan manual per siswa, tapi sesi yang terbentuk tetap sesi
 * Supabase Auth betulan.
 *
 * Kenapa TIDAK membuang Supabase Auth sama sekali (misalnya cukup simpan
 * cookie "siswa_id" sendiri): seluruh aplikasi ini — RLS di database
 * (`mapel_select_siswa`, `jawaban_select_own`, dst), middleware,
 * dashboard siswa, halaman ujian, monitoring — menentukan "ini siapa"
 * lewat `auth.uid()` / kolom `auth_id`. Membuang auth berarti menulis
 * ulang semua policy RLS plus setiap query di `/siswa/*`, dan selama itu
 * database jadi terbuka untuk siapa saja. Dengan cara di bawah, yang
 * berubah hanya halaman login; sisanya jalan apa adanya.
 *
 * CATATAN KEAMANAN (sengaja, karena ini untuk uji coba): tanggal lahir
 * itu rahasia yang lemah dan daftar nama per kelas bisa dibaca siapa pun
 * yang membuka halaman login. Untuk ujian sungguhan yang nilainya
 * dipakai, kembalikan ke password acak per siswa (import CSV yang sudah
 * ada) atau tambahkan token per kelas.
 */

/** Diteruskan ke helper terpusat — lihat `src/lib/akun.ts`. */
function emailSuffix(): string {
  return suffixEmailSiswa();
}

/**
 * Password akun auth diturunkan dari tanggal lahir supaya deterministik:
 * server tidak perlu menyimpan password di mana pun, cukup hitung ulang
 * setiap kali siswa login.
 *
 * ── DIPERBAIKI DI SESI REVISI INI ──
 *
 * Fungsi ini DULU mengembalikan "Lms#DDMMYYYY", sementara
 * `LoginForm.tsx` mengirim "DDMMYYYY" polos ke `signInWithPassword`.
 * Dua rumus berbeda untuk satu hal yang sama — dan karena `LoginForm`
 * belum pernah memanggil `siapkanLoginSiswa`, ketidakcocokan itu tidak
 * pernah terlihat. Begitu jalur ini dipakai (atau akun dibuat lewat
 * form "Tambah Siswa" yang baru), gejalanya adalah yang paling sulit
 * ditelusuri: akun ada, tanggal lahir diketik benar, tapi ditolak.
 *
 * Sekarang keduanya memanggil rumus yang SAMA dari `src/lib/akun.ts`.
 * Yang dipilih adalah format polos "DDMMYYYY", bukan varian berawalan
 * — karena itulah format yang dipakai akun siswa yang SUDAH terlanjur
 * ada di database; mengubah standarnya sekarang berarti setiap akun
 * lama harus direset dalam satu malam.
 *
 * PERINGATAN yang dibawa dari komentar lama (masih berlaku): kalau
 * project Supabase mengaktifkan syarat kompleksitas kata sandi di
 * Authentication > Providers > Password, delapan digit angka polos akan
 * DITOLAK, dan penolakannya muncul sebagai `createUser` gagal dengan
 * pesan yang tidak menyebut-nyebut kompleksitas sama sekali. Kalau
 * pembuatan akun siswa gagal dengan alasan yang tidak masuk akal,
 * periksa setelan itu lebih dulu sebelum menyalahkan kode ini.
 */
function passwordDariTanggal(tanggalISO: string): string {
  return passwordDariTanggalISO(tanggalISO) ?? "";
}

/** "2012-05-14" atau "2012-05-14T00:00:00+00:00" -> "2012-05-14". */
function normalkanTanggal(nilai: unknown): string | null {
  if (!nilai) return null;
  const s = String(nilai).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function jenjangAman(jenjang: number): Jenjang {
  if (!isJenjangValid(jenjang)) {
    throw new Error("Jenjang tidak valid (harus 7, 8, atau 9).");
  }
  return jenjang;
}

export type KelasPilihan = { id: string; nama: string };
export type SiswaPilihan = { id: string; nama: string; username: string };

/**
 * Daftar kelas diambil dari tabel `kelas` project jenjang tersebut,
 * bukan dari konstanta di kode. Dulu daftarnya di-hardcode di
 * `LoginForm.tsx` ("9.1".."9.6"), dan kalau nama kelas di database
 * ternyata beda tipis (mis. "IX-1", atau ada spasi ikut ter-insert),
 * pencarian namanya gagal tanpa petunjuk apa pun. Sekarang yang muncul
 * di dropdown persis isi database.
 */
export async function ambilDaftarKelas(
  jenjang: number
): Promise<KelasPilihan[]> {
  const admin = createAdminClient(jenjangAman(jenjang));
  const { data, error } = await admin
    .from("kelas")
    .select("id, nama")
    .order("nama");

  if (error) throw new Error(error.message);
  return (data ?? []) as KelasPilihan[];
}

/**
 * Daftar nama per kelas. Dulu lewat RPC `get_siswa_untuk_pilih_nama`
 * dengan anon key — artinya bergantung pada RPC itu memang ada di ketiga
 * project DAN policy-nya mengizinkan anon membacanya. Sekarang dibaca
 * langsung dari sini dengan service role: satu sumber kegagalan hilang,
 * dan anon key di browser tidak perlu diberi akses baca tabel `siswa`
 * sama sekali. RPC lamanya boleh dibiarkan menganggur di database.
 */
export async function ambilDaftarSiswa(
  jenjang: number,
  kelasId: string
): Promise<SiswaPilihan[]> {
  const admin = createAdminClient(jenjangAman(jenjang));
  const { data, error } = await admin
    .from("siswa")
    .select("id, nama, username")
    .eq("kelas_id", kelasId)
    .order("nama");

  if (error) throw new Error(error.message);
  return (data ?? []) as SiswaPilihan[];
}

export type HasilSiapLogin =
  | { ok: true; email: string; password: string }
  | { ok: false; pesan: string };

/**
 * Cari user auth berdasarkan email. Supabase Admin API tidak punya
 * "getUserByEmail", jadi terpaksa menelusuri halaman `listUsers`. Hanya
 * dipanggil di jalur langka (baris `siswa.auth_id` kosong TAPI emailnya
 * sudah terdaftar — mis. siswa pernah diimpor lewat CSV lalu barisnya
 * dihapus/di-insert ulang lewat SQL), bukan di setiap login.
 */
async function cariUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error || !data?.users?.length) return null;
    const ketemu = data.users.find((u) => u.email?.toLowerCase() === target);
    if (ketemu) return ketemu.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/**
 * Inti alur baru. Dipanggil dari `LoginForm.tsx` SEBELUM
 * `signInWithPassword`:
 *
 *   1. Cocokkan `tanggalLahir` (format "YYYY-MM-DD") dengan kolom
 *      `siswa.tanggal_lahir` di project jenjang tersebut.
 *   2. Kalau cocok, pastikan akun auth-nya ada dan password-nya sama
 *      dengan turunan tanggal lahir hari ini (di-set ulang tiap login —
 *      idempoten, jadi akun lama hasil import CSV yang passwordnya acak
 *      pun ikut "dinormalkan" ke alur ini tanpa perlu dihapus dulu).
 *   3. Kembalikan email+password supaya browser yang melakukan
 *      `signInWithPassword` sendiri — ini penting: cookie sesi Supabase
 *      harus ditulis dari sisi browser lewat `createBrowserClient`,
 *      persis seperti alur admin, supaya middleware dan Server Component
 *      membacanya dengan cara yang sudah ada.
 *
 * Password yang dikembalikan bukan kebocoran informasi baru: isinya
 * murni turunan tanggal lahir yang barusan diketik siswa itu sendiri.
 */
export async function siapkanLoginSiswa(
  jenjang: number,
  siswaId: string,
  tanggalLahir: string
): Promise<HasilSiapLogin> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient(jenjangAman(jenjang));
  } catch (err) {
    return {
      ok: false,
      pesan:
        err instanceof Error
          ? err.message
          : "Konfigurasi server belum lengkap.",
    };
  }

  const tanggalDiketik = normalkanTanggal(tanggalLahir);
  if (!tanggalDiketik) {
    return { ok: false, pesan: "Tanggal lahir belum lengkap atau tidak valid." };
  }

  const { data: siswa, error: siswaError } = await admin
    .from("siswa")
    .select("id, nama, username, auth_id, tanggal_lahir")
    .eq("id", siswaId)
    .maybeSingle();

  if (siswaError) {
    // Pesan mentah sengaja ikut ditampilkan: kalau kolom
    // `tanggal_lahir` belum ada di project ini, error-nya berbunyi
    // "column siswa.tanggal_lahir does not exist" — itu justru petunjuk
    // paling berguna, jangan ditelan jadi "terjadi kesalahan".
    return {
      ok: false,
      pesan: `Gagal membaca data siswa: ${siswaError.message}`,
    };
  }
  if (!siswa) {
    return { ok: false, pesan: "Data siswa tidak ditemukan. Pilih ulang nama." };
  }

  const tanggalDb = normalkanTanggal(siswa.tanggal_lahir);
  if (!tanggalDb) {
    return {
      ok: false,
      pesan: `Tanggal lahir ${siswa.nama} belum diisi di database, jadi belum bisa dipakai untuk masuk. Hubungi guru/admin.`,
    };
  }
  if (tanggalDb !== tanggalDiketik) {
    return {
      ok: false,
      pesan:
        "Tanggal lahir tidak cocok dengan data di database. Periksa lagi tanggal, bulan, dan tahunnya.",
    };
  }

  const username = String(siswa.username ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  if (!username) {
    return {
      ok: false,
      pesan: `Kolom username untuk ${siswa.nama} kosong di database — akun tidak bisa dibuat. Hubungi guru/admin.`,
    };
  }

  const email = `${username}${emailSuffix()}`;
  const password = passwordDariTanggal(tanggalDb);

  // --- Pastikan akun auth ada, lalu samakan password-nya. ---
  let authId: string | null = siswa.auth_id ?? null;

  if (authId) {
    // Baris siswa mengaku punya akun. Verifikasi dulu akunnya memang
    // masih ada (bisa saja dihapus manual dari dashboard Supabase);
    // kalau tidak, perlakukan seperti belum punya akun.
    const { data: adaUser } = await admin.auth.admin.getUserById(authId);
    if (adaUser?.user) {
      const { error: updateError } = await admin.auth.admin.updateUserById(
        authId,
        { password, email_confirm: true }
      );
      if (updateError) {
        return {
          ok: false,
          pesan: `Gagal menyiapkan akun: ${updateError.message}`,
        };
      }
      // Pakai email yang benar-benar terpasang di akun itu, bukan hasil
      // tebakan dari username — kalau keduanya beda, yang dipakai
      // signInWithPassword harus yang asli.
      return { ok: true, email: adaUser.user.email ?? email, password };
    }
    authId = null;
  }

  const { data: dibuat, error: createError } = await admin.auth.admin.createUser(
    { email, password, email_confirm: true }
  );

  if (dibuat?.user) {
    authId = dibuat.user.id;
  } else {
    // Email sudah terpakai oleh akun lain (sisa import lama) — pakai
    // akun itu dan set ulang password-nya, jangan bikin akun kembar.
    const idLama = await cariUserByEmail(admin, email);
    if (!idLama) {
      return {
        ok: false,
        pesan: `Gagal membuat akun untuk ${siswa.nama}: ${
          createError?.message ?? "penyebab tidak diketahui"
        }`,
      };
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(
      idLama,
      { password, email_confirm: true }
    );
    if (updateError) {
      return {
        ok: false,
        pesan: `Gagal menyiapkan akun lama: ${updateError.message}`,
      };
    }
    authId = idLama;
  }

  // Taut balik ke baris siswa — inilah yang membuat RLS (`auth.uid()`
  // vs `siswa.auth_id`) dan `lanjutkanSetelahLogin` di LoginForm bisa
  // mengenali orang ini sebagai siswa di login-login berikutnya.
  const { error: tautError } = await admin
    .from("siswa")
    .update({ auth_id: authId })
    .eq("id", siswa.id);

  if (tautError) {
    return {
      ok: false,
      pesan: `Akun berhasil dibuat tapi gagal ditautkan ke data siswa: ${tautError.message}`,
    };
  }

  return { ok: true, email, password };
}