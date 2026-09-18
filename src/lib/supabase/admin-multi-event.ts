import { createAdminClient } from "@/lib/supabase/admin";
import { untukSemuaJenjang, type HasilJenjang } from "@/lib/supabase/admin-multi";
import type { Jenjang } from "@/lib/jenjang";

/**
 * Lanjutan `admin-multi.ts` khusus untuk halaman KEGIATAN (event & mapel)
 * dan untuk pengacakan tempat duduk.
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
 *   - SEMUA fungsi di sini memakai service_role (melewati RLS sepenuhnya).
 *   - Karena itu semuanya HANYA boleh dipanggil dari Server Component /
 *     Server Action, dan pemanggilnya WAJIB sudah memastikan `sesi.isAdmin`
 *     lebih dulu lewat `getSesiGuru()`.
 *   - Fungsi di sini hanya MEMBACA. Tidak ada satu pun yang menulis, jadi
 *     tidak ada urusan log_aktivitas di berkas ini.
 *
 * KENAPA MASALAH INI PERLU DIPECAHKAN SAMA SEKALI
 * Sebelum ini, satu-satunya pintu masuk admin ke jenjang lain adalah
 * /admin/nilai. Halaman input soal memang sudah menerima `?jenjang=`,
 * tapi untuk sampai ke sana admin butuh `eventId` DAN `mapelId` milik
 * jenjang itu — sementara /admin/event masih terkunci ke jenjang sesi
 * login. Hasilnya: admin yang login di kelas 7 secara praktis tidak bisa
 * menambah soal kelas 8, meskipun seluruh mesin lintas jenjangnya sudah
 * ada dan berfungsi. Dua fungsi di bawah inilah mata rantai yang hilang.
 */

export interface EventAdmin {
  id: string;
  nama: string;
  tgl_mulai: string;
  tgl_selesai: string;
  kelas_utama: number;
  jumlah_mapel: number;
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
  } | null;
  mapel: MapelAdminRingkas[];
}

/** Daftar event di SATU jenjang. Dipakai /admin/event saat admin memilih
 *  jenjang lewat saklar. */
export async function daftarEventAdmin(
  jenjang: Jenjang
): Promise<EventAdmin[]> {
  const client = createAdminClient(jenjang);

  const { data, error } = await client
    .from("event")
    .select("id, nama, tgl_mulai, tgl_selesai, kelas_utama, mapel(count)")
    .order("tgl_mulai", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((e) => ({
    id: e.id as string,
    nama: e.nama as string,
    tgl_mulai: e.tgl_mulai as string,
    tgl_selesai: e.tgl_selesai as string,
    kelas_utama: Number(e.kelas_utama),
    jumlah_mapel: Array.isArray(e.mapel)
      ? ((e.mapel[0] as { count?: number } | undefined)?.count ?? 0)
      : 0,
  }));
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

  const { data: event } = await client
    .from("event")
    .select("id, nama, tgl_mulai, tgl_selesai, kelas_utama")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { event: null, mapel: [] };

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
    },
    mapel,
  };
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
