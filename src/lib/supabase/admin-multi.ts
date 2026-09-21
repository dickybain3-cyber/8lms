import { createAdminClient } from "@/lib/supabase/admin";
import { JENJANG_LIST, type Jenjang } from "@/lib/jenjang";
import type { StatusPasswordGuru } from "@/lib/guru-password-status";
import type { Soal, TipeSoal } from "@/types";

/**
 * Fan-out lintas 3 project Supabase (kelas 7/8/9) — inti dari halaman
 * /admin/monitoring.
 *
 * KENAPA PERLU FILE INI
 * Arsitektur kita: satu sesi login = satu project (cookie `lms_jenjang`).
 * Itu tepat untuk guru dan siswa — mereka memang hanya bekerja di satu
 * jenjang. Tapi admin yang sedang mengawasi ujian berjalan butuh melihat
 * ketiganya sekaligus; memaksanya logout–ganti jenjang–login ulang di
 * tengah ujian berlangsung adalah kegagalan produk, bukan keamanan.
 *
 * KENAPA SERVICE ROLE, BUKAN SESI ADMIN
 * Akun admin di project 7 sama sekali tidak dikenal oleh project 8 dan 9
 * (`auth.users` terpisah total, RLS di sana tidak akan mengenalinya). Jadi
 * satu-satunya cara membaca ketiganya dari satu sesi adalah service_role,
 * yang memang melewati RLS. Konsekuensinya HARUS disadari:
 *
 *   Begitu kita memakai service_role, RLS berhenti menjadi penjaga. Yang
 *   menjaga adalah kode di file ini dan pemanggilnya. Karena itu:
 *   - SEMUA fungsi di sini WAJIB dipanggil hanya dari Server Component /
 *     Server Action. Tidak ada satu pun yang boleh masuk bundle browser.
 *   - Pemanggil WAJIB memverifikasi pemanggilnya admin lebih dulu lewat
 *     `pastikanAdmin()` di src/app/admin/monitoring/actions.ts.
 *   - Fungsi tulis (reset/hapus) di sini sengaja dibuat sempit: menerima
 *     id spesifik, bukan filter bebas, supaya tidak ada jalur "hapus semua
 *     yang cocok dengan X" yang bisa salah dipakai.
 *
 * KENAPA HASILNYA PER-JENJANG, BUKAN SATU ARRAY DATAR
 * Tiap baris yang keluar dari sini selalu membawa `jenjang` asalnya. Itu
 * bukan hiasan: id siswa/mapel hanya unik DI DALAM satu project, dua siswa
 * di project berbeda bisa punya UUID yang sama secara teori, dan setiap
 * aksi lanjutan (reset, paksa kumpulkan) harus tahu project mana yang
 * dituju. Menggabungkan tanpa menandai jenjang akan membuat aksi admin
 * mendarat di project yang salah.
 */

export interface HasilJenjang<T> {
  jenjang: Jenjang;
  data: T[];
  /** Pesan error yang ramah dibaca; null kalau berhasil. */
  error: string | null;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Jalankan `kerja` di ketiga project SECARA PARALEL. Kegagalan satu project
 * TIDAK membatalkan dua lainnya — kalau project kelas 8 sedang bermasalah,
 * admin tetap harus bisa mengawasi kelas 7 dan 9 (justru saat itulah dia
 * paling butuh melihat yang masih jalan). Error per jenjang dikembalikan
 * sebagai data, bukan dilempar, supaya UI bisa menampilkan "kelas 8 gagal
 * dimuat" di tempatnya sendiri tanpa mengosongkan seluruh halaman.
 */
export async function untukSemuaJenjang<T>(
  kerja: (client: AdminClient, jenjang: Jenjang) => Promise<T[]>
): Promise<HasilJenjang<T>[]> {
  const hasil = await Promise.all(
    JENJANG_LIST.map(async (jenjang): Promise<HasilJenjang<T>> => {
      try {
        const client = createAdminClient(jenjang);
        const data = await kerja(client, jenjang);
        return { jenjang, data, error: null };
      } catch (e) {
        return {
          jenjang,
          data: [],
          error:
            e instanceof Error
              ? e.message
              : "Gagal menghubungi database jenjang ini.",
        };
      }
    })
  );

  return hasil;
}

/** Gabungkan hasil fan-out jadi satu array datar, tiap baris ditandai jenjangnya. */
export function ratakan<T>(
  hasil: HasilJenjang<T>[]
): (T & { jenjang: Jenjang })[] {
  return hasil.flatMap((h) => h.data.map((row) => ({ ...row, jenjang: h.jenjang })));
}

// ---------------------------------------------------------------------------
// Bentuk baris yang dikembalikan RPC (lihat 0011_ujian_pro.sql).
// ---------------------------------------------------------------------------

export interface MapelMonitoring {
  mapel_id: string;
  mapel_nama: string;
  event_id: string;
  event_nama: string;
  waktu_mulai: string;
  waktu_selesai: string;
  durasi_menit: number | null;
  jumlah_target: number;
  jumlah_mulai: number;
  jumlah_submit: number;
  sedang_aktif: boolean;
}

export interface BarisMonitoring {
  siswa_id: string;
  siswa_nama: string;
  siswa_username: string;
  kelas_nama: string;
  status: "belum_mulai" | "mengerjakan" | "waktu_habis" | "selesai";
  progress_persen: number;
  soal_aktif: number | null;
  mulai_at: string | null;
  deadline: string | null;
  last_seen_at: string | null;
  submitted_at: string | null;
  total_skor: number | null;
  skor_maksimal: number;
  is_online: boolean;
  server_now: string;
}

/**
 * Daftar semua ujian di ketiga jenjang, untuk pemilih di halaman monitoring.
 * Diurutkan: yang sedang berlangsung lebih dulu (itu yang dicari admin saat
 * membuka halaman ini di tengah hari ujian), lalu yang terbaru.
 */
export async function daftarMapelSemuaJenjang(): Promise<
  HasilJenjang<MapelMonitoring>[]
> {
  return untukSemuaJenjang<MapelMonitoring>(async (client) => {
    const { data, error } = await client.rpc("get_daftar_mapel_monitoring");
    if (error) throw new Error(error.message);
    return (data ?? []) as MapelMonitoring[];
  });
}

/**
 * Isi tabel monitoring untuk SATU mapel di SATU jenjang. Sengaja tidak
 * mengambil ketiga jenjang sekaligus: satu mapel hanya ada di satu project,
 * dan menarik data 600 siswa × 3 project tiap 15 detik akan membebani
 * database tanpa ada yang membacanya (admin cuma melihat satu tabel).
 */
export async function monitoringSatuMapel(
  jenjang: Jenjang,
  mapelId: string
): Promise<BarisMonitoring[]> {
  const client = createAdminClient(jenjang);
  const { data, error } = await client.rpc("get_monitoring_ujian", {
    p_mapel_id: mapelId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BarisMonitoring[];
}

// ---------------------------------------------------------------------------
// Aksi tulis. Semuanya menerima `jenjang` EKSPLISIT — diambil dari baris data
// yang diklik admin di UI, BUKAN dari cookie sesi. Inilah yang membuat admin
// bisa mereset siswa kelas 7 lalu kelas 9 berturut-turut tanpa ganti sesi.
// ---------------------------------------------------------------------------

export async function resetUjianSiswa(
  jenjang: Jenjang,
  siswaId: string,
  mapelId: string
): Promise<void> {
  const client = createAdminClient(jenjang);
  const { error } = await client.rpc("reset_ujian_siswa", {
    p_siswa_id: siswaId,
    p_mapel_id: mapelId,
  });
  if (error) throw new Error(error.message);
}

export async function paksaKumpulkanSiswa(
  jenjang: Jenjang,
  siswaId: string,
  mapelId: string
): Promise<void> {
  const client = createAdminClient(jenjang);
  const { error } = await client.rpc("paksa_kumpulkan", {
    p_siswa_id: siswaId,
    p_mapel_id: mapelId,
  });
  if (error) throw new Error(error.message);
}

export async function resetUjianSatuMapel(
  jenjang: Jenjang,
  mapelId: string
): Promise<number> {
  const client = createAdminClient(jenjang);
  const { data, error } = await client.rpc("reset_ujian_mapel", {
    p_mapel_id: mapelId,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// ---------------------------------------------------------------------------
// Export akun lintas jenjang.
//
// CATATAN PERBAIKAN: versi sebelumnya dari tombol export (ExportExcel.tsx)
// memanggil RPC lewat client BROWSER (anon key + sesi cookie), yang otomatis
// terikat ke SATU project sesuai jenjang tempat admin sedang login. Hasilnya
// tombol "Export semua siswa" diam-diam cuma mengekspor satu jenjang —
// bertentangan dengan permintaan admin bisa export tiap jenjang sekaligus.
//
// Fungsi di bawah ini memakai jalur yang sama seperti monitoring:
// service_role fan-out ke ketiga project, dipanggil HANYA dari server action
// yang sudah memverifikasi is_admin (lihat src/app/admin/actions-export.ts).
// ---------------------------------------------------------------------------

export interface BarisSiswaExport {
  siswa_id: string;
  nama: string;
  username: string;
  kelas_nama: string;
  tingkat: number;
  created_at: string;
}

export interface BarisGuruExport {
  guru_id: string;
  nama: string;
  email: string;
  is_admin: boolean;
  created_at: string;
}

export async function daftarSiswaSemuaJenjang(): Promise<
  HasilJenjang<BarisSiswaExport>[]
> {
  return untukSemuaJenjang<BarisSiswaExport>(async (client) => {
    const { data, error } = await client.rpc("get_daftar_siswa_export");
    if (error) throw new Error(error.message);
    return (data ?? []) as BarisSiswaExport[];
  });
}

export async function daftarGuruSemuaJenjang(): Promise<
  HasilJenjang<BarisGuruExport>[]
> {
  return untukSemuaJenjang<BarisGuruExport>(async (client) => {
    const { data, error } = await client.rpc("get_daftar_guru_export");
    if (error) throw new Error(error.message);
    return (data ?? []) as BarisGuruExport[];
  });
}

// ---------------------------------------------------------------------------
// Detail guru untuk unduhan (Tahap 2) — SENGAJA TIDAK memakai
// get_daftar_guru_export() (0012, dipanggil daftarGuruSemuaJenjang() di
// atas): RPC itu identitasnya berbasis EMAIL (peninggalan sebelum migrasi
// 0015) dan tidak membawa nip/username/status password sama sekali. Karena
// fungsi ini sudah jalan lewat service_role (RLS memang dilewati di sini),
// membuat RPC baru cuma untuk query yang sama persis tidak menambah apa-apa
// — langsung `select` ke tabel `guru` sudah cukup dan lebih mudah dirawat.
// ---------------------------------------------------------------------------

export interface BarisGuruDetailExport {
  guru_id: string;
  nama: string;
  nip: string | null;
  username: string | null;
  is_admin: boolean;
  /** null = migrasi 0017 belum jalan di project ini, BUKAN "tidak_diketahui"
   *  yang sudah pasti nilainya (beda arti: yang satu kolomnya belum ada,
   *  yang lain kolomnya ada tapi riwayatnya memang tak tercatat). Pemanggil
   *  yang membedakan keduanya di teks yang ditampilkan. */
  passwordStatus: StatusPasswordGuru | null;
  passwordDigantiAt: string | null;
  createdAt: string;
}

interface BarisGuruMentahLengkap {
  id: string;
  nama: string;
  nip: string | null;
  username: string | null;
  is_admin: boolean;
  password_status: StatusPasswordGuru;
  password_diganti_at: string | null;
  created_at: string;
}

type BarisGuruMentahLama = Omit<BarisGuruMentahLengkap, "password_status">;

/**
 * Bentuk minimal client Supabase yang dibutuhkan fungsi di bawah — BUKAN
 * `ReturnType<typeof createAdminClient>` penuh, supaya bisa diuji dengan
 * client palsu (`tsx` + `node:assert`, lihat
 * `src/lib/__tests__/guru-detail-export.test.ts`) tanpa memasang seluruh
 * `@supabase/supabase-js`.
 */
export interface KlienGuruMentah {
  from(tabel: "guru"): {
    select(kolom: string): {
      order(
        kolom: string,
        opsi: { ascending: boolean }
      ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

/**
 * Detail SATU project untuk unduhan detail guru. Dua tahap select, pola
 * yang sama dengan `getSesiGuru()` di admin-guard.ts: kolom
 * `password_status` (migrasi 0017) belum tentu ada di ketiga project pada
 * saat yang sama. Kalau select lengkap gagal, ulangi tanpa kolom itu —
 * supaya unduhan tetap jalan untuk project yang migrasinya belum
 * dijalankan, dengan status kolom itu ditandai `null` (bukan dianggap
 * error, dan bukan pula ditebak sebagai salah satu status yang valid).
 *
 * Diekspor terpisah dari `daftarGuruDetailSemuaJenjang()` (yang mengikat
 * ke `createAdminClient` sungguhan lewat `untukSemuaJenjang`) supaya
 * logika fallback-nya sendiri bisa diuji dengan client palsu.
 */
export async function ambilDetailGuruSatuProject(
  client: KlienGuruMentah
): Promise<BarisGuruDetailExport[]> {
  const kolomLengkap =
    "id, nama, nip, username, is_admin, password_status, password_diganti_at, created_at";
  const kolomLama =
    "id, nama, nip, username, is_admin, password_diganti_at, created_at";

  const lengkap = await client
    .from("guru")
    .select(kolomLengkap)
    .order("nama", { ascending: true });

  let baris: (BarisGuruMentahLengkap | BarisGuruMentahLama)[];
  let migrasi0017BelumJalan = false;

  if (lengkap.error) {
    const lama = await client
      .from("guru")
      .select(kolomLama)
      .order("nama", { ascending: true });
    if (lama.error) throw new Error(lama.error.message);
    baris = (lama.data ?? []) as BarisGuruMentahLama[];
    migrasi0017BelumJalan = true;
  } else {
    baris = (lengkap.data ?? []) as BarisGuruMentahLengkap[];
  }

  return baris.map((g) => ({
    guru_id: g.id,
    nama: g.nama,
    nip: g.nip,
    username: g.username,
    is_admin: g.is_admin,
    passwordStatus: migrasi0017BelumJalan
      ? null
      : (g as BarisGuruMentahLengkap).password_status,
    passwordDigantiAt: g.password_diganti_at,
    createdAt: g.created_at,
  }));
}

export async function daftarGuruDetailSemuaJenjang(): Promise<
  HasilJenjang<BarisGuruDetailExport>[]
> {
  return untukSemuaJenjang<BarisGuruDetailExport>((client) =>
    ambilDetailGuruSatuProject(client)
  );
}

// ---------------------------------------------------------------------------
// Soal & Nilai lintas jenjang — saklar admin di halaman input soal & cek
// nilai (lanjutan monitoring/export di atas, pola sama: `jenjang` eksplisit
// dari UI, bukan cookie; guru biasa tidak lewat sini sama sekali, tetap
// lewat createClient() cookie-bound seperti sebelumnya).
//
// SATU HAL PENTING YANG BEDA DARI monitoring/export DI ATAS: `soal` dan
// `nilai` (jalur override) punya trigger DB yang otomatis mencatat
// log_aktivitas (0009_log_aktivitas.sql), dan trigger itu memanggil
// `catat_log_aktivitas()` yang mensyaratkan `is_guru()` (auth.uid()-based).
// service_role tidak pernah punya auth.uid(), jadi TANPA migrasi
// 0013_admin_lintas_jenjang_soal_nilai.sql (lihat supabase/migrations-*),
// setiap INSERT/UPDATE/DELETE ke `soal` atau override ke `nilai` lewat
// fungsi-fungsi di bawah ini akan gagal total — bukan cuma logging yang
// gagal, transaksinya sendiri batal. Migrasi itu membuat trigger tersebut
// DIAM untuk pemanggil service_role, dan sebagai gantinya semua fungsi
// TULIS di bawah ini mencatat log_aktivitas secara MANUAL lewat
// `catatLogManual()` — persis pola `resetUjianSiswa()` di
// src/app/admin/nilai/actions.ts, sekarang dipusatkan di sini supaya tidak
// disalin ulang di lima tempat berbeda.
// ---------------------------------------------------------------------------

/**
 * Konteks "siapa admin yang melakukan ini" — diambil pemanggil dari
 * `getSesiGuru()` (src/lib/admin-guard.ts) SEBELUM memanggil fungsi tulis
 * mana pun di bawah. Sengaja diterima sebagai parameter biasa (bukan
 * meng-import `SesiGuru` dari admin-guard.ts ke file ini) supaya file ini
 * tetap murni lapisan akses data — pengambilan sesi & pengecekan
 * `pastikanBolehKeJenjang()` tetap jadi tanggung jawab Server Action
 * pemanggil, bukan file ini.
 */
export interface KonteksAdmin {
  guruId: string | null;
  nama: string | null;
  email: string | null;
  /** Jenjang sesi LOGIN admin (dari cookie) — bisa beda dari jenjang yang
   *  sedang ditulis (`jenjangTarget` di `catatLogManual`), itulah yang
   *  menentukan apakah aksi ini "lintas jenjang" atau tidak. */
  jenjangSesi: Jenjang | null;
}

/**
 * Satu-satunya jalur tulis ke `log_aktivitas` untuk semua fungsi admin di
 * bawah — dipusatkan di sini (bukan disalin per fungsi seperti
 * `resetUjianSiswa()` lama) karena sekarang ada 5 titik tulis (3 soal + 2
 * nilai), dan menyalin blok yang sama 5x adalah sumber bug kalau nanti
 * salah satu lupa di-update. Perilakunya identik dengan versi inline di
 * `resetUjianSiswa()`: `guru_id` hanya diisi kalau aksinya di jenjang
 * sesi sendiri (FK `guru_id` tidak berarti apa-apa di project jenjang
 * lain), pelakunya tetap terlacak lewat `oleh_nama`/`oleh_email` di
 * `detail_jsonb` untuk kasus lintas jenjang. Kegagalan menulis log TIDAK
 * membatalkan aksi utama (sudah lolos di titik ini) — cukup dicatat ke
 * console, konsisten dengan seluruh file lain di project ini.
 */
async function catatLogManual(
  client: AdminClient,
  konteks: KonteksAdmin,
  jenjangTarget: Jenjang,
  aksi: string,
  entitas: string,
  entitasId: string | null,
  detail: Record<string, unknown>
): Promise<void> {
  const lintasJenjang = jenjangTarget !== konteks.jenjangSesi;

  const { error } = await client.from("log_aktivitas").insert({
    guru_id: lintasJenjang ? null : konteks.guruId,
    aksi,
    entitas,
    entitas_id: entitasId,
    detail_jsonb: {
      oleh_nama: konteks.nama ?? konteks.email ?? "tidak diketahui",
      oleh_email: konteks.email,
      lintas_jenjang: lintasJenjang,
      jenjang_asal_sesi: konteks.jenjangSesi,
      jenjang_target: jenjangTarget,
      ...detail,
    },
  });

  if (error) {
    console.error(`Gagal mencatat log ${aksi} (${entitas}):`, error.message);
  }
}

// ---------------------------------------------------------------------------
// Soal — dipakai halaman input soal admin (saklar jenjang). Baca "daftar
// mapel untuk dipilih" TIDAK punya fungsi baru di sini — pakai ulang
// `daftarMapelSemuaJenjang()` di atas (event_id/mapel_id/nama sudah cukup
// untuk membangun link ke editor soal per jenjang).
//
// Validasi bentuk konten_jsonb per tipe soal (`validasiKonten` di
// src/app/admin/event/[eventId]/mapel/[mapelId]/soal/actions.ts) SENGAJA
// TIDAK diduplikasi di sini — tetap tanggung jawab Server Action pemanggil,
// supaya file ini murni "tulis apa yang sudah divalidasi", satu sumber
// kebenaran untuk aturan bentuk data.
// ---------------------------------------------------------------------------

export interface SoalAdminInput {
  mapelId: string;
  tipe: TipeSoal;
  skor: number;
  kontenJsonb: Record<string, unknown>;
  gambarUrl: string | null;
}

/** Daftar soal satu mapel di satu jenjang — untuk mengisi halaman detail
 *  mapel & form edit saat admin sedang berada di jenjang tersebut. */
export async function daftarSoalMapelAdmin(
  jenjang: Jenjang,
  mapelId: string
): Promise<Soal[]> {
  const client = createAdminClient(jenjang);
  const { data, error } = await client
    .from("soal")
    .select("id, mapel_id, tipe, urutan, skor, konten_jsonb, gambar_url")
    .eq("mapel_id", mapelId)
    .order("urutan");

  if (error) throw new Error(error.message);
  return (data ?? []) as Soal[];
}

/** Satu soal (untuk memuat form edit) — null kalau tidak ditemukan di
 *  jenjang tersebut, dibiarkan pemanggil yang memutuskan pesan errornya
 *  (konsisten dengan pola `.maybeSingle()` di tempat lain di project). */
export async function ambilSoalAdmin(
  jenjang: Jenjang,
  soalId: string
): Promise<Soal | null> {
  const client = createAdminClient(jenjang);
  const { data, error } = await client
    .from("soal")
    .select("id, mapel_id, tipe, urutan, skor, konten_jsonb, gambar_url")
    .eq("id", soalId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Soal) ?? null;
}

/**
 * `urutan` dihitung sama seperti jalur guru biasa: jumlah soal yang sudah
 * ada di mapel ini + 1 (lihat createSoal() lama di soal/actions.ts) — tidak
 * diisi manual dari client.
 */
export async function buatSoalAdmin(
  jenjang: Jenjang,
  input: SoalAdminInput,
  konteks: KonteksAdmin
): Promise<string> {
  const client = createAdminClient(jenjang);

  const { count } = await client
    .from("soal")
    .select("id", { count: "exact", head: true })
    .eq("mapel_id", input.mapelId);

  const { data, error } = await client
    .from("soal")
    .insert({
      mapel_id: input.mapelId,
      tipe: input.tipe,
      urutan: (count ?? 0) + 1,
      skor: input.skor,
      konten_jsonb: input.kontenJsonb,
      gambar_url: input.gambarUrl,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Gagal menyimpan soal.");
  }

  await catatLogManual(client, konteks, jenjang, "insert", "soal", data.id as string, {
    mapel_id: input.mapelId,
    tipe: input.tipe,
  });

  return data.id as string;
}

/** `urutan` sengaja tidak diubah di sini, sama seperti updateSoal() lama —
 *  edit tidak mengubah posisi soal, cuma isinya. */
export async function updateSoalAdmin(
  jenjang: Jenjang,
  soalId: string,
  input: SoalAdminInput,
  konteks: KonteksAdmin
): Promise<void> {
  const client = createAdminClient(jenjang);

  const { error } = await client
    .from("soal")
    .update({
      tipe: input.tipe,
      skor: input.skor,
      konten_jsonb: input.kontenJsonb,
      gambar_url: input.gambarUrl,
    })
    .eq("id", soalId)
    .eq("mapel_id", input.mapelId);

  if (error) throw new Error(error.message);

  await catatLogManual(client, konteks, jenjang, "update", "soal", soalId, {
    mapel_id: input.mapelId,
    tipe: input.tipe,
  });
}

/** Sama seperti deleteSoal() lama: `nilai.detail_jsonb` tidak punya FK ke
 *  soal (key JSON bebas), jadi nilai yang sudah dihitung TIDAK otomatis
 *  ikut berubah — pemanggil (UI) tetap perlu menyarankan "Hitung Ulang
 *  Nilai" kalau soal yang dihapus sudah pernah dikerjakan siswa. */
export async function hapusSoalAdmin(
  jenjang: Jenjang,
  soalId: string,
  mapelId: string,
  konteks: KonteksAdmin
): Promise<void> {
  const client = createAdminClient(jenjang);

  const { error } = await client
    .from("soal")
    .delete()
    .eq("id", soalId)
    .eq("mapel_id", mapelId);

  if (error) throw new Error(error.message);

  await catatLogManual(client, konteks, jenjang, "delete", "soal", soalId, {
    mapel_id: mapelId,
  });
}

// ---------------------------------------------------------------------------
// Nilai — dipakai halaman /admin/nilai saat admin memilih jenjang lain dari
// sesi login-nya. Bentuk data yang dikembalikan `detailNilaiMapelAdmin`
// SENGAJA meniru persis apa yang dirakit manual di `DetailNilaiMapel()`
// (src/app/admin/nilai/page.tsx) — supaya page.tsx tinggal pilih sumber
// datanya (cookie client biasa vs fungsi ini), tanpa mengubah bentuk yang
// dioper ke <NilaiTable>.
// ---------------------------------------------------------------------------

export interface BarisNilaiAdmin {
  siswaId: string;
  nama: string;
  username: string;
  kelasNama: string;
  submitted: boolean;
  totalSkor: number | null;
  isOverride: boolean;
  detailJsonb: Record<string, number>;
}

export interface DetailNilaiMapelAdmin {
  mapel: {
    id: string;
    nama: string;
    eventNama: string;
    /** ISO tgl_mulai kegiatan — dipakai halaman pemanggil untuk
     *  menghitung label "Tahun Ajaran 2026/2027" di kop rekap Excel
     *  (lihat src/lib/tahun-ajaran.ts). Dioper mentah, bukan dihitung di
     *  sini, supaya aturan "tahun ajaran mulai Juli" hanya hidup di satu
     *  tempat dan sama untuk jalur guru maupun admin. */
    eventTglMulai: string;
  } | null;
  soalList: { id: string; urutan: number; skor: number }[];
  siswaList: BarisNilaiAdmin[];
}

export async function detailNilaiMapelAdmin(
  jenjang: Jenjang,
  mapelId: string
): Promise<DetailNilaiMapelAdmin> {
  const client = createAdminClient(jenjang);

  const { data: mapelRow } = await client
    .from("mapel")
    .select("id, nama, event(nama, tgl_mulai)")
    .eq("id", mapelId)
    .maybeSingle();

  if (!mapelRow) {
    return { mapel: null, soalList: [], siswaList: [] };
  }

  const eventInfo = mapelRow.event as unknown as {
    nama: string;
    tgl_mulai: string;
  } | null;
  const eventNama = eventInfo?.nama ?? "Event";

  const { data: soalData } = await client
    .from("soal")
    .select("id, urutan, skor")
    .eq("mapel_id", mapelId)
    .order("urutan");

  const soalList = (soalData ?? []).map((s) => ({
    id: s.id,
    urutan: s.urutan,
    skor: Number(s.skor),
  }));

  const { data: mapelKelas } = await client
    .from("mapel_kelas")
    .select("kelas_id")
    .eq("mapel_id", mapelId);

  const kelasIds = (mapelKelas ?? []).map((mk) => mk.kelas_id);

  const { data: siswaData } =
    kelasIds.length > 0
      ? await client
          .from("siswa")
          .select("id, nama, username, kelas(nama)")
          .in("kelas_id", kelasIds)
          .order("nama")
      : { data: [] as never[] };

  const { data: jawabanData } = await client
    .from("jawaban_siswa")
    .select("siswa_id, submitted_at")
    .eq("mapel_id", mapelId);

  const { data: nilaiData } = await client
    .from("nilai")
    .select("siswa_id, total_skor, detail_jsonb, is_override")
    .eq("mapel_id", mapelId);

  const submittedMap = new Map(
    (jawabanData ?? []).map((j) => [j.siswa_id, j.submitted_at !== null])
  );
  const nilaiMap = new Map(
    (nilaiData ?? []).map((n) => [
      n.siswa_id,
      {
        totalSkor: Number(n.total_skor),
        detailJsonb: (n.detail_jsonb ?? {}) as Record<string, number>,
        isOverride: n.is_override,
      },
    ])
  );

  const siswaList: BarisNilaiAdmin[] = (siswaData ?? []).map((s) => {
    const nilai = nilaiMap.get(s.id);
    return {
      siswaId: s.id,
      nama: s.nama,
      username: s.username,
      kelasNama: (s.kelas as unknown as { nama: string } | null)?.nama ?? "-",
      submitted: submittedMap.get(s.id) ?? false,
      totalSkor: nilai?.totalSkor ?? null,
      isOverride: nilai?.isOverride ?? false,
      detailJsonb: nilai?.detailJsonb ?? {},
    };
  });

  return {
    mapel: {
      id: mapelRow.id,
      nama: mapelRow.nama,
      eventNama,
      eventTglMulai: eventInfo?.tgl_mulai ?? new Date().toISOString(),
    },
    soalList,
    siswaList,
  };
}

/**
 * Sama persis dengan `overrideNilai()` lama (validasi: sudah submit, tidak
 * melebihi skor maksimal) — hanya sumber client-nya diganti service_role +
 * ditambah log manual. Mengembalikan `{ error }` (bukan throw) supaya pola
 * pemanggilannya sama dengan Server Action lama, gampang dipetakan 1:1 di
 * src/app/admin/nilai/actions.ts.
 */
export async function overrideNilaiAdmin(
  jenjang: Jenjang,
  params: { mapelId: string; siswaId: string; totalSkor: number },
  konteks: KonteksAdmin
): Promise<{ error: string | null }> {
  const { mapelId, siswaId, totalSkor } = params;

  if (!Number.isFinite(totalSkor) || totalSkor < 0) {
    return { error: "Nilai harus berupa angka 0 atau lebih." };
  }

  const client = createAdminClient(jenjang);

  const { data: jawaban } = await client
    .from("jawaban_siswa")
    .select("submitted_at")
    .eq("siswa_id", siswaId)
    .eq("mapel_id", mapelId)
    .maybeSingle();

  if (!jawaban?.submitted_at) {
    return {
      error: "Siswa ini belum mengumpulkan ujian, belum bisa diberi nilai.",
    };
  }

  const { data: soalList } = await client
    .from("soal")
    .select("skor")
    .eq("mapel_id", mapelId);

  const skorMaksimal = (soalList ?? []).reduce(
    (sum, s) => sum + Number(s.skor),
    0
  );

  if (totalSkor > skorMaksimal) {
    return {
      error: `Nilai tidak boleh melebihi skor maksimal mapel ini (${skorMaksimal}).`,
    };
  }

  const { error } = await client.from("nilai").upsert(
    {
      siswa_id: siswaId,
      mapel_id: mapelId,
      total_skor: totalSkor,
      is_override: true,
      dihitung_at: new Date().toISOString(),
    },
    { onConflict: "siswa_id,mapel_id" }
  );

  if (error) {
    return { error: "Gagal menyimpan nilai. Coba lagi." };
  }

  await catatLogManual(client, konteks, jenjang, "override_nilai", "nilai", mapelId, {
    siswa_id: siswaId,
    mapel_id: mapelId,
    total_skor: totalSkor,
  });

  return { error: null };
}

/**
 * RPC `hitung_ulang_semua_nilai` sendiri SUDAH aman dipanggil lewat
 * service_role sejak 0011 (penjaganya `is_guru_atau_service()`, lihat
 * komentar di 0011_ujian_pro.sql § 11) — yang TIDAK aman adalah cara
 * `hitungUlangNilaiMapel()` lama mencatat lognya (RPC `catat_log_aktivitas`,
 * yang masih `is_guru()` murni). Makanya di sini lognya ditulis manual
 * lewat `catatLogManual()`, bukan memanggil RPC log itu.
 */
export async function hitungUlangNilaiMapelAdmin(
  jenjang: Jenjang,
  mapelId: string,
  konteks: KonteksAdmin
): Promise<number> {
  const client = createAdminClient(jenjang);

  const { data: jumlah, error } = await client.rpc(
    "hitung_ulang_semua_nilai",
    { p_mapel_id: mapelId }
  );

  if (error) throw new Error(error.message);

  await catatLogManual(client, konteks, jenjang, "hitung_ulang_nilai", "nilai", mapelId, {
    mapel_id: mapelId,
    jumlah_siswa: jumlah ?? 0,
  });

  return (jumlah as number) ?? 0;
}