import { createAdminClient } from "@/lib/supabase/admin";
import { untukSemuaJenjang, type HasilJenjang } from "@/lib/supabase/admin-multi";
import type { Jenjang } from "@/lib/jenjang";
import { jenisEventValid, type JenisEvent } from "@/lib/jenis-event";

/**
 * Lanjutan `admin-multi.ts` khusus untuk halaman KEGIATAN (event, mapel,
 * dan — sejak Tahap 4 — tugas) dan untuk pengacakan tempat duduk.
 *
 * KENAPA FILE BARU, BUKAN MENAMBAH DI admin-multi.ts
 * `admin-multi.ts` sudah 700 baris dan sudah dipakai monitoring, export,
 * soal, dan nilai. Menambah di sana berarti kamu harus menimpa berkas
 * yang isinya sudah teruji jalan. File terpisah ini cukup disalin masuk;
 * kalau nanti ada masalah, menghapusnya juga tidak membatalkan apa pun
 * yang sudah ada.
 *
 * ATURAN KEAMANAN DI SINI SAMA PERSIS dengan admin-multi.ts, dan wajib
 * dibaca sebelum menambah fungsi:
 *   - Fungsi yang memakai `createAdminClient()` memakai service_role
 *     (melewati RLS sepenuhnya). Karena itu HANYA boleh dipanggil dari
 *     Server Component / Server Action, dan pemanggilnya WAJIB sudah
 *     memastikan `sesi.isAdmin` lebih dulu lewat `getSesiGuru()`.
 *   - Fungsi di sini hanya MEMBACA. Tidak ada satu pun yang menulis, jadi
 *     tidak ada urusan log_aktivitas di berkas ini.
 *
 * KENAPA BANYAK FUNGSI DI SINI MENERIMA `client` SEBAGAI PARAMETER
 * Supaya logika pembacaan yang sama bisa dipakai dua jalur sekaligus:
 * jalur guru (client cookie-bound, kena RLS) dan jalur admin lintas
 * jenjang (service role). Kalau keduanya punya query sendiri-sendiri,
 * cepat atau lambat salah satunya akan diperbaiki dan yang lain tidak —
 * dan bedanya baru ketahuan saat admin melihat angka yang berbeda dari
 * yang dilihat guru untuk kegiatan yang sama.
 */

export interface EventAdmin {
  id: string;
  nama: string;
  tgl_mulai: string;
  tgl_selesai: string;
  kelas_utama: number;
  jumlah_mapel: number;
  /** Jumlah tugas (Tahap 4). 0 kalau migrasi 0019 belum jalan di project
   *  ini — sama alasannya dengan fallback `jenis` di bawah. */
  jumlah_tugas: number;
  /** Fallback `'asesmen_akhir'` kalau migrasi 0018 belum jalan di project
   *  ini — lihat `ambilDaftarEventMentah()`. Bukan tebakan: itu memang
   *  DEFAULT kolomnya dan satu-satunya jenis yang mungkin ada sebelum
   *  migrasi itu. */
  jenis: JenisEvent;
}

/**
 * Bentuk minimal client yang dibutuhkan `ambilDaftarEventMentah` — supaya
 * bisa dipakai baik oleh `createClient()` (RLS, jalur guru di
 * `event-sesi.ts`) maupun `createAdminClient()` (service role, jalur admin
 * lintas jenjang di bawah), dan supaya bisa diuji dengan client palsu
 * (lihat `src/lib/__tests__/event-jenis.test.ts`).
 */
export interface KlienEventMentah {
  from(tabel: "event"): {
    select(kolom: string): {
      order(
        kolom: string,
        opsi: { ascending: boolean }
      ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

interface BarisEventMentah {
  id: string;
  nama: string;
  tgl_mulai: string;
  tgl_selesai: string;
  kelas_utama: number | string;
  jenis?: unknown;
  mapel: { count: number }[] | { count: number } | null;
  tugas?: { count: number }[] | { count: number } | null;
}

function jumlahDariJoin(
  relasi: { count: number }[] | { count: number } | null | undefined
): number {
  if (!relasi) return 0;
  if (Array.isArray(relasi)) return relasi[0]?.count ?? 0;
  return relasi.count ?? 0;
}

/**
 * Daftar event + jumlah mapel & tugasnya, dipakai bersama oleh
 * `event-sesi.ts` (jalur guru) dan `daftarEventAdmin()` (jalur admin
 * lintas jenjang).
 *
 * ── TIGA TAHAP SELECT, DAN KENAPA BUKAN SATU ──
 *
 * Aplikasi ini berjalan di TIGA project Supabase terpisah (kelas 7, 8, 9)
 * yang migrasinya dijalankan manual satu per satu. Di sela-sela pekerjaan
 * itu — kadang berhari-hari, kalau satu project bermasalah — project
 * dengan skema berbeda hidup berdampingan. Halaman daftar kegiatan tidak
 * boleh kosong di project yang tertinggal hanya karena satu kolom untuk
 * badge belum ada.
 *
 *   Tahap 1: jenis + mapel(count) + tugas(count)   (0018 & 0019 jalan)
 *   Tahap 2: jenis + mapel(count)                  (0019 belum)
 *   Tahap 3: mapel(count)                          (0018 juga belum)
 *
 * Kegagalan SELAIN "kolom/relasi tidak ada" — koneksi putus, kredensial
 * salah — tetap dilempar dari tahap terakhir, supaya masalah nyata tidak
 * menyamar jadi "daftar kosong". Itu yang diuji
 * `testKegagalanLainTetapDilempar`.
 */
export async function ambilDaftarEventMentah(
  client: KlienEventMentah
): Promise<EventAdmin[]> {
  const dasar = "id, nama, tgl_mulai, tgl_selesai, kelas_utama";
  const kolomTahap1 = `${dasar}, jenis, mapel(count), tugas(count)`;
  const kolomTahap2 = `${dasar}, jenis, mapel(count)`;
  const kolomTahap3 = `${dasar}, mapel(count)`;

  const ambil = (kolom: string) =>
    client.from("event").select(kolom).order("tgl_mulai", { ascending: false });

  let data: unknown[] | null;
  let adaKolomJenis = true;

  const tahap1 = await ambil(kolomTahap1);
  if (!tahap1.error) {
    data = tahap1.data;
  } else {
    const tahap2 = await ambil(kolomTahap2);
    if (!tahap2.error) {
      data = tahap2.data;
    } else {
      const tahap3 = await ambil(kolomTahap3);
      if (tahap3.error) throw new Error(tahap3.error.message);
      data = tahap3.data;
      adaKolomJenis = false;
    }
  }

  return ((data ?? []) as unknown as BarisEventMentah[]).map((e) => ({
    id: e.id,
    nama: e.nama,
    tgl_mulai: e.tgl_mulai,
    tgl_selesai: e.tgl_selesai,
    kelas_utama: Number(e.kelas_utama),
    jumlah_mapel: jumlahDariJoin(e.mapel),
    jumlah_tugas: jumlahDariJoin(e.tugas),
    jenis:
      adaKolomJenis && jenisEventValid(e.jenis) ? e.jenis : "asesmen_akhir",
  }));
}

/** Daftar event di SATU jenjang. Dipakai /admin/event saat admin memilih
 *  jenjang lewat saklar. */
export async function daftarEventAdmin(
  jenjang: Jenjang
): Promise<EventAdmin[]> {
  const client = createAdminClient(jenjang);
  return ambilDaftarEventMentah(client);
}

export interface MapelAdminRingkas {
  id: string;
  nama: string;
  waktu_mulai: string;
  waktu_selesai: string;
  kelasNama: string[];
}

export interface EventDetailAdmin {
  event: {
    id: string;
    nama: string;
    tgl_mulai: string;
    tgl_selesai: string;
    kelas_utama: number;
    jenis: JenisEvent;
  } | null;
  mapel: MapelAdminRingkas[];
}

/** Satu event + daftar mapelnya di SATU jenjang. `event` null kalau id-nya
 *  tidak ada di project jenjang itu — itu kondisi normal (admin menekan
 *  saklar jenjang sambil membuka event milik jenjang lain), jadi pemanggil
 *  menampilkannya sebagai pesan biasa, bukan notFound(). */
export async function detailEventAdmin(
  jenjang: Jenjang,
  eventId: string
): Promise<EventDetailAdmin> {
  const client = createAdminClient(jenjang);

  const lengkap = await client
    .from("event")
    .select("id, nama, tgl_mulai, tgl_selesai, kelas_utama, jenis")
    .eq("id", eventId)
    .maybeSingle();

  const event = lengkap.error
    ? (
        await client
          .from("event")
          .select("id, nama, tgl_mulai, tgl_selesai, kelas_utama")
          .eq("id", eventId)
          .maybeSingle()
      ).data
    : lengkap.data;

  if (!event) return { event: null, mapel: [] };

  const jenisMentah = (event as { jenis?: unknown }).jenis;
  const jenis: JenisEvent = jenisEventValid(jenisMentah)
    ? jenisMentah
    : "asesmen_akhir";

  const { data: mapelList } = await client
    .from("mapel")
    .select("id, nama, waktu_mulai, waktu_selesai, mapel_kelas(kelas(nama))")
    .eq("event_id", eventId)
    .order("waktu_mulai");

  const mapel: MapelAdminRingkas[] = (mapelList ?? []).map((m) => ({
    id: m.id as string,
    nama: m.nama as string,
    waktu_mulai: m.waktu_mulai as string,
    waktu_selesai: m.waktu_selesai as string,
    kelasNama: ((m.mapel_kelas ?? []) as unknown as {
      kelas: { nama: string } | null;
    }[])
      .map((mk) => mk.kelas?.nama)
      .filter((n): n is string => Boolean(n))
      .sort(),
  }));

  return {
    event: {
      id: event.id as string,
      nama: event.nama as string,
      tgl_mulai: event.tgl_mulai as string,
      tgl_selesai: event.tgl_selesai as string,
      kelas_utama: Number(event.kelas_utama),
      jenis,
    },
    mapel,
  };
}

// ---------------------------------------------------------------------------
// Tahap 4 — ringkasan tugas dalam sebuah event
// ---------------------------------------------------------------------------

export interface TugasRingkas {
  id: string;
  judul: string;
  dibuka_at: string;
  tenggat: string;
  skor_maksimal: number;
  izinkan_terlambat: boolean;
  kelasNama: string[];
  /** Jumlah siswa di seluruh kelas target. */
  jumlahTarget: number;
  /** Yang `submitted_at`-nya terisi (draf tidak dihitung). */
  jumlahTerkumpul: number;
  jumlahDinilai: number;
}

type HasilBaca = {
  data: unknown[] | null;
  error: { message: string } | null;
};

interface PembangunBaca extends PromiseLike<HasilBaca> {
  eq(kolom: string, nilai: string): PembangunBaca;
  in(kolom: string, nilai: string[]): PembangunBaca;
  order(kolom: string, opsi?: { ascending: boolean }): PembangunBaca;
}

/**
 * Bentuk minimal client untuk `ambilRingkasTugas`. Sama polanya dengan
 * `KlienEventMentah`: nama tabelnya dibatasi ke literal yang benar-benar
 * dipakai (bukan `string` lepas) supaya salah ketik nama tabel tertangkap
 * compiler, bukan baru ketahuan sebagai daftar kosong di layar.
 */
export interface KlienTugasMentah {
  from(
    tabel: "tugas" | "tugas_kelas" | "pengumpulan_tugas" | "siswa"
  ): { select(kolom: string): PembangunBaca };
}

interface BarisTugasMentah {
  id: string;
  judul: string;
  dibuka_at: string;
  tenggat: string;
  skor_maksimal: number | string;
  izinkan_terlambat: boolean;
  tugas_kelas:
    | { kelas_id: string; kelas: { nama: string } | null }[]
    | null;
}

/**
 * Daftar tugas sebuah event beserta papan angkanya.
 *
 * ── KENAPA EMPAT QUERY, BUKAN SATU DENGAN BANYAK AGGREGATE ──
 *
 * Yang dibutuhkan per tugas ada tiga angka: berapa siswa sasarannya,
 * berapa yang mengumpulkan, berapa yang sudah dinilai. Dua yang terakhir
 * butuh FILTER di dalam hitungan (`submitted_at is not null`,
 * `nilai is not null`), dan embedded count PostgREST tidak bisa
 * memfilternya — `pengumpulan_tugas(count)` menghitung semua baris,
 * termasuk draf kosong dan baris yang cuma berisi nilai. Angkanya akan
 * terlihat benar dan salah diam-diam.
 *
 * Yang pertama bahkan tidak bisa dijawab dari tabel tugas sama sekali:
 * jumlah siswa sasaran hidup di `siswa`, lewat `tugas_kelas`.
 *
 * Jadi: tarik barisnya apa adanya, hitung di JavaScript. Volumenya kecil
 * dan terbatas — satu event berisi belasan tugas, satu jenjang beberapa
 * ratus siswa. Membayar empat query untuk angka yang benar jauh lebih
 * murah daripada satu query untuk angka yang meyakinkan tapi keliru.
 */
export async function ambilRingkasTugas(
  client: KlienTugasMentah,
  eventId: string
): Promise<TugasRingkas[]> {
  const hasilTugas = await client
    .from("tugas")
    .select(
      "id, judul, dibuka_at, tenggat, skor_maksimal, izinkan_terlambat, tugas_kelas(kelas_id, kelas(nama))"
    )
    .eq("event_id", eventId)
    .order("tenggat", { ascending: true });

  // Relasi/tabel `tugas` belum ada (migrasi 0019 belum jalan di project
  // ini) -> daftar kosong, BUKAN error. Halaman detail event harus tetap
  // terbuka; pesan "migrasi belum jalan" disampaikan di sana, bukan lewat
  // halaman yang gagal dirender.
  if (hasilTugas.error) return [];

  const tugasList = (hasilTugas.data ?? []) as unknown as BarisTugasMentah[];
  if (tugasList.length === 0) return [];

  const tugasIds = tugasList.map((t) => t.id);
  const semuaKelasId = [
    ...new Set(
      tugasList.flatMap((t) => (t.tugas_kelas ?? []).map((tk) => tk.kelas_id))
    ),
  ];

  const [hasilPengumpulan, hasilSiswa] = await Promise.all([
    client
      .from("pengumpulan_tugas")
      .select("tugas_id, submitted_at, nilai")
      .in("tugas_id", tugasIds),
    semuaKelasId.length === 0
      ? Promise.resolve({ data: [], error: null } as HasilBaca)
      : client.from("siswa").select("id, kelas_id").in("kelas_id", semuaKelasId),
  ]);

  const pengumpulan = (hasilPengumpulan.error
    ? []
    : hasilPengumpulan.data ?? []) as unknown as {
    tugas_id: string;
    submitted_at: string | null;
    nilai: number | null;
  }[];

  const siswa = (hasilSiswa.error ? [] : hasilSiswa.data ?? []) as unknown as {
    id: string;
    kelas_id: string;
  }[];

  const siswaPerKelas = new Map<string, number>();
  for (const s of siswa) {
    siswaPerKelas.set(s.kelas_id, (siswaPerKelas.get(s.kelas_id) ?? 0) + 1);
  }

  const terkumpulPerTugas = new Map<string, number>();
  const dinilaiPerTugas = new Map<string, number>();
  for (const p of pengumpulan) {
    if (p.submitted_at) {
      terkumpulPerTugas.set(
        p.tugas_id,
        (terkumpulPerTugas.get(p.tugas_id) ?? 0) + 1
      );
    }
    if (p.nilai !== null && p.nilai !== undefined) {
      dinilaiPerTugas.set(
        p.tugas_id,
        (dinilaiPerTugas.get(p.tugas_id) ?? 0) + 1
      );
    }
  }

  return tugasList.map((t) => {
    const kelasTarget = t.tugas_kelas ?? [];
    return {
      id: t.id,
      judul: t.judul,
      dibuka_at: t.dibuka_at,
      tenggat: t.tenggat,
      skor_maksimal: Number(t.skor_maksimal),
      izinkan_terlambat: Boolean(t.izinkan_terlambat),
      kelasNama: kelasTarget
        .map((tk) => tk.kelas?.nama)
        .filter((n): n is string => Boolean(n))
        .sort(),
      jumlahTarget: kelasTarget.reduce(
        (total, tk) => total + (siswaPerKelas.get(tk.kelas_id) ?? 0),
        0
      ),
      jumlahTerkumpul: terkumpulPerTugas.get(t.id) ?? 0,
      jumlahDinilai: dinilaiPerTugas.get(t.id) ?? 0,
    };
  });
}

/** Ringkasan tugas satu event di SATU jenjang (jalur admin lintas
 *  jenjang). Read-only, seperti seluruh isi berkas ini. */
export async function daftarTugasAdmin(
  jenjang: Jenjang,
  eventId: string
): Promise<TugasRingkas[]> {
  const client = createAdminClient(jenjang);
  return ambilRingkasTugas(client as unknown as KlienTugasMentah, eventId);
}

// ---------------------------------------------------------------------------
// Siswa lintas jenjang untuk pengacakan tempat duduk.
// ---------------------------------------------------------------------------

export interface SiswaLintasJenjang {
  id: string;
  nama: string;
  username: string;
  kelasNama: string;
  tingkat: 7 | 8 | 9;
  jenjang: Jenjang;
}

/**
 * Tarik SELURUH siswa dari ketiga project sekaligus. Inilah satu-satunya
 * fitur di aplikasi ini yang secara hakiki butuh ketiga database dalam
 * SATU keluaran: denah tempat duduk memasangkan kelas 7 dengan kelas 8,
 * dan kedua siswa itu hidup di database yang berbeda. Tidak ada cara
 * menjawabnya dari satu project saja.
 *
 * Membaca `siswa` + `kelas` langsung lewat tabel, BUKAN lewat RPC
 * `get_daftar_siswa_export` yang sudah ada, karena RPC itu belum tentu
 * terpasang di ketiga project (ia datang dari migrasi belakangan). Query
 * tabel biasa hanya bergantung pada skema dasar dari 0001_init.sql, jadi
 * fitur denah tetap bisa dipakai meskipun ada project yang migrasinya
 * ketinggalan satu-dua nomor.
 *
 * `tingkat` diambil dari `kelas.tingkat`, bukan dari jenjang project.
 * Keduanya memang seharusnya sama, tapi kalau suatu saat ada siswa yang
 * salah masuk project, yang benar adalah kelasnya — dan denah harus
 * mengikuti kelas, karena itu yang tertulis di kartu peserta.
 */
export async function siswaSemuaJenjangUntukDenah(): Promise<
  HasilJenjang<SiswaLintasJenjang>[]
> {
  return untukSemuaJenjang<SiswaLintasJenjang>(async (client, jenjang) => {
    const { data, error } = await client
      .from("siswa")
      .select("id, nama, username, kelas(nama, tingkat)")
      .order("nama");

    if (error) throw new Error(error.message);

    return (data ?? []).map((s) => {
      const kelas = s.kelas as unknown as {
        nama: string;
        tingkat: number;
      } | null;
      const tingkat = (kelas?.tingkat ?? jenjang) as 7 | 8 | 9;
      return {
        id: s.id as string,
        nama: s.nama as string,
        username: s.username as string,
        kelasNama: kelas?.nama ?? `Kelas ${tingkat}`,
        tingkat,
        jenjang,
      };
    });
  });
}

// ---------------------------------------------------------------------------
// fanOutRpc — PERBAIKAN BUG BUILD.
//
// `src/app/admin/statistik/page.tsx` mengimpor `fanOutRpc` dari
// `@/lib/supabase/admin-multi`, tetapi fungsi dengan nama itu TIDAK PERNAH
// ada di sana. Akibatnya `npx tsc --noEmit` dan `next build` gagal:
//
//   error TS2305: Module '"@/lib/supabase/admin-multi"' has no exported
//   member 'fanOutRpc'.
//
// Selama halaman hanya dijalankan lewat `next dev`, kesalahan ini tidak
// pernah terlihat — dev server mengompilasi per halaman dan tidak
// menghentikan apa pun karena galat tipe. Baru saat build produksi
// dijalankan, SELURUH aplikasi gagal dibangun, bukan cuma halaman
// statistiknya. Itu jenis kegagalan yang paling buruk waktunya: muncul
// saat kamu mencoba menaikkan versi menjelang hari-H.
//
// Fungsinya sendiri sepele: memanggil satu RPC yang sama di ketiga project
// lalu mengembalikan hasilnya per jenjang — persis pola
// `daftarMapelSemuaJenjang()` di admin-multi.ts, hanya saja nama RPC-nya
// jadi parameter. Ditaruh di sini, bukan disisipkan ke admin-multi.ts,
// supaya kamu tidak perlu menimpa berkas 700 baris yang sudah teruji.
// ---------------------------------------------------------------------------

export async function fanOutRpc<T>(
  namaRpc: string,
  params?: Record<string, unknown>
): Promise<HasilJenjang<T>[]> {
  return untukSemuaJenjang<T>(async (client) => {
    const { data, error } = await client.rpc(namaRpc, params ?? {});
    if (error) throw new Error(error.message);
    return (data ?? []) as T[];
  });
}
