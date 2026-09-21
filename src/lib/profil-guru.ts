import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCloudinaryConfig, getSupabaseConfig } from "@/lib/supabase/config";
import { emailGuruDariUsername } from "@/lib/akun";
import { JENJANG_LABEL, JENJANG_LIST, type Jenjang } from "@/lib/jenjang";

/**
 * Sinkronisasi profil guru lintas 3 project Supabase, dengan NIP sebagai
 * penanda "ini orang yang sama".
 *
 * SERVER-ONLY. Memakai service_role (melewati RLS), sama seperti
 * `admin-multi.ts`, dan aturan yang sama berlaku: pemanggil WAJIB sudah
 * memastikan siapa yang login, dan HANYA boleh menyentuh baris milik guru
 * itu sendiri. Fungsi di sini tidak memeriksa itu — mereka menerima daftar
 * `AkunGuru` yang sudah disusun `cariAkunTerhubung()` dari identitas sesi.
 *
 * ── KENAPA ADA FILE INI ──
 *
 * Seorang guru yang mengajar di kelas 7 dan 8 punya DUA baris `guru` dan DUA
 * akun `auth.users`, di dua project berbeda, yang tidak saling kenal. Kalau
 * dia mengganti username di satu project saja, besok dia login di kelas 8
 * dengan username baru dan ditolak. Yang menyatukan kedua baris itu hanya
 * NIP — bukan id, bukan auth_id, bukan username (yang justru mau diganti).
 *
 * ── TIGA CARA GAGAL YANG BERBEDA, TIGA PERLAKUAN YANG BERBEDA ──
 *
 * 1. USERNAME — semua-atau-tidak-sama-sekali. Username menentukan email
 *    login (`{username}@guru.lms-cbt.local`), jadi kalau berhasil di kelas 7
 *    tapi gagal di kelas 8, guru punya dua username yang berbeda antar
 *    jenjang dan harus mengingat mana yang berlaku di mana. Maka: cek
 *    bentrokan di SEMUA project dulu sebelum menulis apa pun, lalu tulis
 *    satu per satu, dan kalau ada yang gagal di tengah, PULIHKAN yang sudah
 *    berubah. Pemulihan itu bisa dilakukan karena nilai lamanya kita tahu.
 *
 * 2. PASSWORD — tidak bisa dipulihkan. Kata sandi lama di project lain
 *    belum tentu sama dengan yang di project sesi (akun dibuat terpisah,
 *    dan admin bisa mereset satu project saja), sedangkan kata sandi lama
 *    tidak pernah bisa dibaca dari Supabase Auth. Jadi tidak ada nilai
 *    untuk dipulihkan. Perlakuannya: project sesi wajib berhasil dulu
 *    (kalau gagal, batalkan seluruhnya sebelum menyentuh yang lain), lalu
 *    project lain dikerjakan sebisanya dan kegagalannya DILAPORKAN — guru
 *    tinggal mengulang dari halaman yang sama.
 *
 * 3. FOTO — sama dengan password (sebisanya + lapor), tapi lebih ringan:
 *    salah satu project tertinggal foto lamanya tidak merusak apa pun.
 *
 * Bagian yang membaca database menerima `buatKlien` sebagai parameter
 * (default: `createAdminClient`) supaya logika pemulihan di atas bisa diuji
 * dengan database palsu tanpa menyentuh Supabase sungguhan.
 */

export type KlienAdmin = ReturnType<typeof createAdminClient>;
export type PembuatKlien = (jenjang: Jenjang) => KlienAdmin;

const klienAsli: PembuatKlien = (jenjang) => createAdminClient(jenjang);

/** Satu baris guru + akun auth-nya, di satu project. */
export interface AkunGuru {
  jenjang: Jenjang;
  guruId: string;
  authId: string;
  nama: string;
  nip: string | null;
  username: string | null;
  fotoUrl: string | null;
  /** Email yang SEBENARNYA terpasang di auth.users. Null kalau tidak diminta/terbaca. */
  emailAuth: string | null;
}

export type StatusJenjang =
  | { jenjang: Jenjang; status: "terhubung"; akun: AkunGuru }
  | { jenjang: Jenjang; status: "tidak_ada" }
  | { jenjang: Jenjang; status: "gagal"; alasan: string };

export interface LaporanSinkron {
  jenjang: Jenjang;
  ok: boolean;
  pesan: string | null;
}

export interface HasilTerapan {
  sukses: boolean;
  /** Kalimat siap tampil untuk guru. */
  pesan: string;
  laporan: LaporanSinkron[];
}

function pesanError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return "Kesalahan tidak diketahui.";
}

/** Ubah pesan mentah Postgres/GoTrue jadi kalimat yang bisa ditindaklanjuti. */
function ramahkanPesan(mentah: string, jenjang: Jenjang): string {
  const m = mentah.toLowerCase();
  if (m.includes("foto_url") || m.includes("password_diganti_at")) {
    return `Migrasi 0016 belum dijalankan di database ${JENJANG_LABEL[jenjang]}.`;
  }
  if (
    (m.includes("already") && m.includes("registered")) ||
    m.includes("duplicate key") ||
    m.includes("already exists")
  ) {
    return `Username itu bentrok dengan akun lain di database ${JENJANG_LABEL[jenjang]}.`;
  }
  return mentah;
}

/**
 * Cari baris guru yang sama di ketiga project.
 *
 * - Project sesi dicari lewat `guruIdSesi` (id yang datang dari sesi login
 *   yang sudah diverifikasi RLS), BUKAN lewat NIP — NIP boleh kosong untuk
 *   guru honorer, dan mereka tetap harus bisa membuka halaman profilnya.
 * - Project lain dicari lewat NIP. Guru tanpa NIP hanya punya satu akun
 *   yang bisa dikenali, jadi project lain dilewati (status `tidak_ada`).
 * - Satu project yang bermasalah (env belum diisi, migrasi belum jalan,
 *   koneksi putus) tidak menggagalkan yang lain; ia muncul sebagai status
 *   `gagal` dengan alasannya.
 */
export async function cariAkunTerhubung(opts: {
  jenjangSesi: Jenjang;
  guruIdSesi: string;
  nip: string | null;
  /** true = ikut membaca email auth (dibutuhkan untuk mengganti username). */
  denganEmail: boolean;
  buatKlien?: PembuatKlien;
}): Promise<StatusJenjang[]> {
  const buatKlien = opts.buatKlien ?? klienAsli;

  return Promise.all(
    JENJANG_LIST.map(async (jenjang): Promise<StatusJenjang> => {
      const adalahSesi = jenjang === opts.jenjangSesi;
      try {
        if (!adalahSesi && !opts.nip) return { jenjang, status: "tidak_ada" };

        const klien = buatKlien(jenjang);
        const dasar = klien
          .from("guru")
          .select("id, auth_id, nama, nip, username, foto_url")
          .limit(2);
        const { data, error } = adalahSesi
          ? await dasar.eq("id", opts.guruIdSesi)
          : await dasar.eq("nip", opts.nip as string);

        if (error) {
          return {
            jenjang,
            status: "gagal",
            alasan: ramahkanPesan(error.message, jenjang),
          };
        }

        const baris = (data ?? []) as {
          id: string;
          auth_id: string;
          nama: string;
          nip: string | null;
          username: string | null;
          foto_url: string | null;
        }[];

        if (baris.length === 0) {
          return adalahSesi
            ? {
                jenjang,
                status: "gagal",
                alasan: "Baris guru untuk sesi ini tidak ditemukan.",
              }
            : { jenjang, status: "tidak_ada" };
        }
        if (baris.length > 1) {
          // Tidak mungkin terjadi selama indeks unik `idx_guru_nip_unik`
          // ada. Kalau terjadi, jangan menebak baris mana yang benar —
          // menulis ke orang yang salah lebih buruk daripada tidak menulis.
          return {
            jenjang,
            status: "gagal",
            alasan: "Ada lebih dari satu guru dengan NIP yang sama.",
          };
        }

        const b = baris[0];
        let emailAuth: string | null = null;
        if (opts.denganEmail) {
          const { data: u, error: eu } =
            await klien.auth.admin.getUserById(b.auth_id);
          if (eu || !u?.user) {
            return {
              jenjang,
              status: "gagal",
              alasan: `Akun login tidak terbaca (${eu?.message ?? "tidak ditemukan"}).`,
            };
          }
          emailAuth = u.user.email ?? null;
        }

        return {
          jenjang,
          status: "terhubung",
          akun: {
            jenjang,
            guruId: b.id,
            authId: b.auth_id,
            nama: b.nama,
            nip: b.nip,
            username: b.username,
            fotoUrl: b.foto_url,
            emailAuth,
          },
        };
      } catch (e) {
        return { jenjang, status: "gagal", alasan: pesanError(e) };
      }
    })
  );
}

export function akunDari(status: StatusJenjang[]): AkunGuru[] {
  return status.flatMap((s) => (s.status === "terhubung" ? [s.akun] : []));
}

/** Jenjang yang ada tapi tak bisa dibaca, dalam bentuk laporan gagal. */
export function laporanTakTerjangkau(status: StatusJenjang[]): LaporanSinkron[] {
  return status.flatMap((s) =>
    s.status === "gagal"
      ? [{ jenjang: s.jenjang, ok: false, pesan: s.alasan }]
      : []
  );
}

function urutkanSesiDulu(akun: AkunGuru[], jenjangSesi: Jenjang): AkunGuru[] {
  return [...akun].sort(
    (a, b) =>
      Number(b.jenjang === jenjangSesi) - Number(a.jenjang === jenjangSesi) ||
      a.jenjang - b.jenjang
  );
}

function ringkas(laporan: LaporanSinkron[]): {
  berhasil: string[];
  gagal: LaporanSinkron[];
} {
  return {
    berhasil: laporan.filter((l) => l.ok).map((l) => JENJANG_LABEL[l.jenjang]),
    gagal: laporan.filter((l) => !l.ok),
  };
}

function kalimatHasil(aksi: string, laporan: LaporanSinkron[]): string {
  const { berhasil, gagal } = ringkas(laporan);
  let teks = `${aksi} — berlaku di ${berhasil.join(", ")}.`;
  if (gagal.length > 0) {
    teks +=
      " Belum tersinkron ke " +
      gagal
        .map((g) => `${JENJANG_LABEL[g.jenjang]} (${g.pesan ?? "gagal"})`)
        .join("; ") +
      ". Ulangi dari halaman ini untuk mencoba lagi.";
  }
  return teks;
}

// ---------------------------------------------------------------------------
// USERNAME — semua atau tidak sama sekali
// ---------------------------------------------------------------------------

async function gantiUsernameSatu(
  klien: KlienAdmin,
  a: AkunGuru,
  usernameBaru: string,
  emailBaru: string
): Promise<string | null> {
  try {
    const { error: e1 } = await klien.auth.admin.updateUserById(a.authId, {
      email: emailBaru,
      email_confirm: true,
    });
    if (e1) return ramahkanPesan(e1.message, a.jenjang);

    const { error: e2 } = await klien
      .from("guru")
      .update({ username: usernameBaru })
      .eq("id", a.guruId);
    if (e2) {
      // Email sudah terlanjur berubah tapi barisnya tidak. Kembalikan
      // sekarang juga, sebelum pemulihan tingkat atas mengira akun ini
      // "belum disentuh" dan melewatkannya.
      await klien.auth.admin
        .updateUserById(a.authId, {
          email: a.emailAuth as string,
          email_confirm: true,
        })
        .catch(() => undefined);
      return ramahkanPesan(e2.message, a.jenjang);
    }
    return null;
  } catch (e) {
    return ramahkanPesan(pesanError(e), a.jenjang);
  }
}

/** Kembalikan satu akun ke keadaan sebelum username diganti. null = berhasil. */
async function pulihkanUsernameSatu(
  klien: KlienAdmin,
  a: AkunGuru
): Promise<string | null> {
  const galat: string[] = [];
  try {
    const { error } = await klien
      .from("guru")
      .update({ username: a.username })
      .eq("id", a.guruId);
    if (error) galat.push(error.message);
  } catch (e) {
    galat.push(pesanError(e));
  }
  try {
    const { error } = await klien.auth.admin.updateUserById(a.authId, {
      email: a.emailAuth as string,
      email_confirm: true,
    });
    if (error) galat.push(error.message);
  } catch (e) {
    galat.push(pesanError(e));
  }
  return galat.length ? galat.join("; ") : null;
}

/**
 * Ganti username di semua akun terhubung — atau tidak sama sekali.
 *
 * Wajib dipanggil dengan `akun` yang dibaca `denganEmail: true`.
 */
export async function terapkanUsername(opts: {
  akun: AkunGuru[];
  jenjangSesi: Jenjang;
  usernameBaru: string;
  buatKlien?: PembuatKlien;
}): Promise<HasilTerapan> {
  const buatKlien = opts.buatKlien ?? klienAsli;
  const { usernameBaru } = opts;
  const emailBaru = emailGuruDariUsername(usernameBaru);
  const akun = urutkanSesiDulu(opts.akun, opts.jenjangSesi);

  const gagal = (pesan: string, laporan: LaporanSinkron[] = []): HasilTerapan => ({
    sukses: false,
    pesan,
    laporan,
  });

  const tanpaEmail = akun.find((a) => !a.emailAuth);
  if (tanpaEmail) {
    return gagal(
      `Akun login di database ${JENJANG_LABEL[tanpaEmail.jenjang]} tidak terbaca, jadi username belum bisa diganti. Coba lagi sebentar lagi.`
    );
  }

  // Akun yang sudah memakai username & email itu tidak perlu disentuh
  // (mis. percobaan ulang setelah sebagian akun sempat berhasil).
  const perlu = akun.filter(
    (a) =>
      a.username !== usernameBaru ||
      (a.emailAuth as string).toLowerCase() !== emailBaru.toLowerCase()
  );
  if (perlu.length === 0) {
    return gagal("Username itu sudah kamu pakai di semua jenjang.");
  }

  // 1. Periksa bentrokan di SEMUA project sebelum menulis apa pun.
  for (const a of perlu) {
    try {
      const { data, error } = await buatKlien(a.jenjang)
        .from("guru")
        .select("id")
        .eq("username", usernameBaru)
        .neq("id", a.guruId)
        .limit(1);
      if (error) {
        return gagal(
          `Gagal memeriksa username di database ${JENJANG_LABEL[a.jenjang]}: ${ramahkanPesan(error.message, a.jenjang)}`
        );
      }
      if ((data ?? []).length > 0) {
        return gagal(
          `Username "${usernameBaru}" sudah dipakai guru lain di database ${JENJANG_LABEL[a.jenjang]}. Pilih username lain.`
        );
      }
    } catch (e) {
      return gagal(
        `Gagal menghubungi database ${JENJANG_LABEL[a.jenjang]}: ${pesanError(e)}`
      );
    }
  }

  // 2. Tulis satu per satu. Berurutan, bukan paralel: kalau yang kedua
  //    gagal, daftar "yang sudah berubah" harus pasti dan tidak berlomba.
  const selesai: AkunGuru[] = [];
  const laporan: LaporanSinkron[] = [];

  for (const a of perlu) {
    const galat = await gantiUsernameSatu(
      buatKlien(a.jenjang),
      a,
      usernameBaru,
      emailBaru
    );

    if (!galat) {
      selesai.push(a);
      laporan.push({ jenjang: a.jenjang, ok: true, pesan: null });
      continue;
    }

    // 3. Ada yang gagal: pulihkan yang sudah berubah.
    laporan.push({ jenjang: a.jenjang, ok: false, pesan: galat });
    const gagalPulih: string[] = [];
    for (const b of selesai.reverse()) {
      const g = await pulihkanUsernameSatu(buatKlien(b.jenjang), b);
      if (g) gagalPulih.push(`${JENJANG_LABEL[b.jenjang]} (${g})`);
    }

    let pesan = `Username tidak diganti: gagal di database ${JENJANG_LABEL[a.jenjang]} — ${galat}`;
    pesan += gagalPulih.length
      ? ` PERHATIAN: pemulihan otomatis gagal di ${gagalPulih.join("; ")}. Username di sana mungkin sudah berubah — hubungi admin untuk memeriksanya.`
      : " Semua perubahan sebelumnya sudah dibatalkan, jadi username kamu tetap yang lama di semua jenjang.";
    return { sukses: false, pesan, laporan };
  }

  return {
    sukses: true,
    pesan: kalimatHasil(
      `Username diganti menjadi "${usernameBaru}"`,
      laporan
    ),
    laporan,
  };
}

// ---------------------------------------------------------------------------
// PASSWORD dan FOTO — project sesi wajib berhasil, sisanya sebisanya + lapor
// ---------------------------------------------------------------------------

async function terapkanSebisanya(opts: {
  akun: AkunGuru[];
  jenjangSesi: Jenjang;
  aksi: string;
  kerja: (klien: KlienAdmin, a: AkunGuru) => Promise<string | null>;
  /** Jenjang yang bahkan tidak bisa dibaca (env/migrasi/koneksi) — ikut dilaporkan sebagai gagal. */
  belumTerjangkau?: LaporanSinkron[];
  buatKlien?: PembuatKlien;
}): Promise<HasilTerapan> {
  const buatKlien = opts.buatKlien ?? klienAsli;
  const akun = urutkanSesiDulu(opts.akun, opts.jenjangSesi);
  const sesi = akun.find((a) => a.jenjang === opts.jenjangSesi);

  if (!sesi) {
    return {
      sukses: false,
      pesan: "Akun untuk jenjang sesi ini tidak ditemukan. Coba keluar lalu login ulang.",
      laporan: [],
    };
  }

  const jalankan = async (a: AkunGuru): Promise<LaporanSinkron> => {
    try {
      const galat = await opts.kerja(buatKlien(a.jenjang), a);
      return {
        jenjang: a.jenjang,
        ok: galat === null,
        pesan: galat ? ramahkanPesan(galat, a.jenjang) : null,
      };
    } catch (e) {
      return {
        jenjang: a.jenjang,
        ok: false,
        pesan: ramahkanPesan(pesanError(e), a.jenjang),
      };
    }
  };

  // Project sesi lebih dulu. Kalau ini gagal, project lain TIDAK disentuh —
  // supaya guru tidak berakhir dengan perubahan yang berlaku di jenjang
  // lain tapi tidak di jenjang tempat dia sedang login.
  const laporanSesi = await jalankan(sesi);
  if (!laporanSesi.ok) {
    return {
      sukses: false,
      pesan: `${opts.aksi} gagal di database ${JENJANG_LABEL[sesi.jenjang]}: ${laporanSesi.pesan}. Tidak ada yang berubah.`,
      laporan: [laporanSesi],
    };
  }

  const lainnya = await Promise.all(
    akun.filter((a) => a !== sesi).map((a) => jalankan(a))
  );
  const laporan = [laporanSesi, ...lainnya, ...(opts.belumTerjangkau ?? [])];

  return {
    sukses: true,
    pesan: kalimatHasil(opts.aksi, laporan),
    laporan,
  };
}

export function terapkanPassword(opts: {
  akun: AkunGuru[];
  jenjangSesi: Jenjang;
  passwordBaru: string;
  belumTerjangkau?: LaporanSinkron[];
  buatKlien?: PembuatKlien;
}): Promise<HasilTerapan> {
  return terapkanSebisanya({
    akun: opts.akun,
    jenjangSesi: opts.jenjangSesi,
    aksi: "Password diganti",
    belumTerjangkau: opts.belumTerjangkau,
    buatKlien: opts.buatKlien,
    kerja: async (klien, a) => {
      const { error } = await klien.auth.admin.updateUserById(a.authId, {
        password: opts.passwordBaru,
      });
      if (error) return error.message;

      // Penanda "guru sudah mengganti sendiri" — dipakai unduhan detail
      // guru. Kegagalan MENULIS penanda ini (mis. kolomnya belum ada)
      // sengaja tidak dianggap kegagalan ganti password: passwordnya
      // sudah berubah, dan melaporkan "gagal" ke guru yang passwordnya
      // sebenarnya sudah baru hanya akan membuatnya mengulang tanpa guna.
      await klien
        .from("guru")
        .update({ password_diganti_at: new Date().toISOString() })
        .eq("id", a.guruId);
      return null;
    },
  });
}

export function terapkanFoto(opts: {
  akun: AkunGuru[];
  jenjangSesi: Jenjang;
  fotoUrl: string | null;
  belumTerjangkau?: LaporanSinkron[];
  buatKlien?: PembuatKlien;
}): Promise<HasilTerapan> {
  return terapkanSebisanya({
    akun: opts.akun,
    jenjangSesi: opts.jenjangSesi,
    aksi: opts.fotoUrl ? "Foto profil diganti" : "Foto profil dihapus",
    belumTerjangkau: opts.belumTerjangkau,
    buatKlien: opts.buatKlien,
    kerja: async (klien, a) => {
      const { error } = await klien
        .from("guru")
        .update({ foto_url: opts.fotoUrl })
        .eq("id", a.guruId);
      return error ? error.message : null;
    },
  });
}

// ---------------------------------------------------------------------------
// Verifikasi kata sandi lama & validasi URL foto
// ---------------------------------------------------------------------------

/**
 * Cek apakah `password` memang milik `email` di project `jenjang`.
 *
 * Memakai client anon SEMENTARA yang tidak menyimpan sesi — bukan client
 * dari `createClient()` (server.ts). Yang itu terhubung ke cookie sesi guru;
 * memanggil `signInWithPassword` lewat client itu akan menerbitkan sesi
 * baru dan menimpa cookie yang sedang dipakai, sebuah efek samping yang
 * tidak ada hubungannya dengan sekadar "memeriksa password".
 */
export async function verifikasiPassword(
  jenjang: Jenjang,
  email: string,
  password: string
): Promise<boolean> {
  const { url, anonKey } = getSupabaseConfig(jenjang);
  const sementara = createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { error } = await sementara.auth.signInWithPassword({ email, password });
  return !error;
}

/**
 * URL foto yang datang dari browser TIDAK boleh dipercaya begitu saja —
 * nilainya akan ditulis ke database dan dipasang di `<img src>` di setiap
 * halaman admin. Tanpa pemeriksaan ini, guru (atau siapa pun yang bisa
 * memanggil Server Action) bisa mengisinya dengan alamat pelacak atau
 * situs lain. Yang diterima hanya gambar di Cloudinary milik sekolah.
 */
export function urlFotoValid(url: string): boolean {
  if (url.length > 500) return false;

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.hostname !== "res.cloudinary.com") {
    return false;
  }

  const [cloud, jenis, tipe] = u.pathname.split("/").filter(Boolean);
  if (jenis !== "image" || tipe !== "upload") return false;

  // Batasi ke cloud name yang memang dikonfigurasi. Kalau satu jenjang
  // belum diisi env-nya, dilewati (bukan dianggap salah).
  const dikenal: string[] = [];
  for (const j of JENJANG_LIST) {
    try {
      dikenal.push(getCloudinaryConfig(j).cloudName);
    } catch {
      /* env jenjang ini belum diisi */
    }
  }
  return dikenal.length === 0 || dikenal.includes(cloud);
}
