import { createAdminClient } from "@/lib/supabase/admin";
import { analisisButir, nilai100, type ButirHasil } from "@/lib/statistik";
import type { Jenjang } from "@/lib/jenjang";
import { rincianJawaban, type RincianJawaban } from "@/lib/analisis-jawaban";

/**
 * Pemuat data halaman Statistik per kegiatan.
 *
 * Memakai service role (createAdminClient) — PEMANGGIL WAJIB sudah memeriksa
 * hak akses lebih dulu lewat `pastikanBolehKeJenjang` (lihat halaman). Pola
 * sama dengan fitur lintas jenjang lain di aplikasi ini.
 */

type Klien = ReturnType<typeof createAdminClient>;

export interface MapelStat {
  id: string;
  nama: string;
  waktuMulai: string;
  skorMaks: number;
  jumlahSoal: number;
}

export interface BarisSiswa {
  siswaId: string;
  nama: string;
  kelas: string;
  /** mapelId -> nilai 0–100 (hanya yang sudah mengumpulkan & sudah dinilai). */
  nilai: Record<string, number>;
  /** mapelId yang sudah dikumpulkan. */
  submit: Set<string>;
  /** mapelId yang menjadi target siswa ini (kelasnya terdaftar di mapel). */
  target: Set<string>;
}

export interface DataKegiatan {
  event: { id: string; nama: string; tglMulai: string; tglSelesai: string };
  mapel: MapelStat[];
  siswa: BarisSiswa[];
  kelas: string[];
}

/** Ambil semua baris melewati batas 1000 baris PostgREST. */
async function ambilSemua<T>(
  buat: (dari: number, sampai: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const UKURAN = 1000;
  const hasil: T[] = [];
  for (let dari = 0; ; dari += UKURAN) {
    const { data, error } = await buat(dari, dari + UKURAN - 1);
    if (error) throw new Error(error.message);
    hasil.push(...(data ?? []));
    if (!data || data.length < UKURAN) return hasil;
  }
}

export async function muatDataKegiatan(jenjang: Jenjang, eventId: string): Promise<DataKegiatan | null> {
  const db: Klien = createAdminClient(jenjang);

  const { data: ev, error: errEv } = await db
    .from("event")
    .select("id, nama, tgl_mulai, tgl_selesai")
    .eq("id", eventId)
    .maybeSingle();
  if (errEv) throw new Error(errEv.message);
  if (!ev) return null;

  const { data: mapelRows, error: errMapel } = await db
    .from("mapel")
    .select("id, nama, waktu_mulai")
    .eq("event_id", eventId)
    .order("waktu_mulai");
  if (errMapel) throw new Error(errMapel.message);
  const mapelIds = (mapelRows ?? []).map((m) => m.id as string);

  const kosong = { event: { id: ev.id, nama: ev.nama, tglMulai: ev.tgl_mulai, tglSelesai: ev.tgl_selesai }, mapel: [], siswa: [], kelas: [] };
  if (mapelIds.length === 0) return kosong;

  const [soal, mapelKelas, jawaban, nilai] = await Promise.all([
    ambilSemua<{ mapel_id: string; skor: number }>((a, b) =>
      db.from("soal").select("mapel_id, skor").in("mapel_id", mapelIds).range(a, b)
    ),
    ambilSemua<{ mapel_id: string; kelas_id: string }>((a, b) =>
      db.from("mapel_kelas").select("mapel_id, kelas_id").in("mapel_id", mapelIds).range(a, b)
    ),
    ambilSemua<{ siswa_id: string; mapel_id: string; submitted_at: string | null }>((a, b) =>
      db.from("jawaban_siswa").select("siswa_id, mapel_id, submitted_at").in("mapel_id", mapelIds).range(a, b)
    ),
    ambilSemua<{ siswa_id: string; mapel_id: string; total_skor: number }>((a, b) =>
      db.from("nilai").select("siswa_id, mapel_id, total_skor").in("mapel_id", mapelIds).range(a, b)
    ),
  ]);

  const skorMaks = new Map<string, number>();
  const jumlahSoal = new Map<string, number>();
  for (const s of soal) {
    skorMaks.set(s.mapel_id, (skorMaks.get(s.mapel_id) ?? 0) + Number(s.skor));
    jumlahSoal.set(s.mapel_id, (jumlahSoal.get(s.mapel_id) ?? 0) + 1);
  }

  const kelasIds = Array.from(new Set(mapelKelas.map((mk) => mk.kelas_id)));
  const [kelasRows, siswaRows] = await Promise.all([
    kelasIds.length
      ? ambilSemua<{ id: string; nama: string }>((a, b) => db.from("kelas").select("id, nama").in("id", kelasIds).range(a, b))
      : Promise.resolve([]),
    kelasIds.length
      ? ambilSemua<{ id: string; nama: string; kelas_id: string }>((a, b) =>
          db.from("siswa").select("id, nama, kelas_id").in("kelas_id", kelasIds).order("nama").range(a, b)
        )
      : Promise.resolve([]),
  ]);
  const namaKelas = new Map(kelasRows.map((k) => [k.id, k.nama]));
  const mapelPerKelas = new Map<string, string[]>();
  for (const mk of mapelKelas) {
    if (!mapelPerKelas.has(mk.kelas_id)) mapelPerKelas.set(mk.kelas_id, []);
    mapelPerKelas.get(mk.kelas_id)!.push(mk.mapel_id);
  }

  const peta = new Map<string, BarisSiswa>();
  for (const s of siswaRows) {
    peta.set(s.id, {
      siswaId: s.id,
      nama: s.nama,
      kelas: namaKelas.get(s.kelas_id) ?? "-",
      nilai: {},
      submit: new Set(),
      target: new Set(mapelPerKelas.get(s.kelas_id) ?? []),
    });
  }
  for (const j of jawaban) if (j.submitted_at) peta.get(j.siswa_id)?.submit.add(j.mapel_id)
  for (const n of nilai) {
    const b = peta.get(n.siswa_id);
    if (!b || !b.submit.has(n.mapel_id)) continue; // hanya yang sudah mengumpulkan
    const v = nilai100(Number(n.total_skor), skorMaks.get(n.mapel_id) ?? 0);
    if (v !== null) b.nilai[n.mapel_id] = v;
  }

  return {
    event: kosong.event,
    mapel: (mapelRows ?? []).map((m) => ({
      id: m.id,
      nama: m.nama,
      waktuMulai: m.waktu_mulai,
      skorMaks: skorMaks.get(m.id) ?? 0,
      jumlahSoal: jumlahSoal.get(m.id) ?? 0,
    })),
    siswa: Array.from(peta.values()),
    kelas: kelasRows.map((k) => k.nama).sort((a, b) => a.localeCompare(b, "id", { numeric: true })),
  };
}

/**
 * Analisis butir satu mapel, dihitung di aplikasi (lihat `analisisButir`):
 * fungsi SQL `get_analisis_butir_soal` (migrasi 0012) belum terpasang di
 * database mana pun, sehingga versi RPC selalu gagal.
 */
export async function muatAnalisisButirMapel(jenjang: Jenjang, mapelId: string): Promise<ButirHasil[] | string> {
  const db = createAdminClient(jenjang);
  try {
    const [soal, jawaban, nilai] = await Promise.all([
      ambilSemua<{ id: string; urutan: number; tipe: string; skor: number }>((a, b) =>
        db.from("soal").select("id, urutan, tipe, skor").eq("mapel_id", mapelId).range(a, b)
      ),
      ambilSemua<{ siswa_id: string; jawaban_jsonb: Record<string, unknown> | null; submitted_at: string | null }>((a, b) =>
        db.from("jawaban_siswa").select("siswa_id, jawaban_jsonb, submitted_at").eq("mapel_id", mapelId).not("submitted_at", "is", null).range(a, b)
      ),
      ambilSemua<{ siswa_id: string; detail_jsonb: Record<string, unknown> | null }>((a, b) =>
        db.from("nilai").select("siswa_id, detail_jsonb").eq("mapel_id", mapelId).range(a, b)
      ),
    ]);
    const detail = new Map(nilai.map((n) => [n.siswa_id, n.detail_jsonb ?? {}]));
    return analisisButir(
      soal.map((s) => ({ ...s, urutan: Number(s.urutan), skor: Number(s.skor) })),
      jawaban.map((j) => ({ jawaban: j.jawaban_jsonb ?? {}, detail: detail.get(j.siswa_id) ?? {} }))
    );
  } catch (e) {
    return "Gagal memuat analisis butir soal: " + (e instanceof Error ? e.message : "kesalahan tidak diketahui");
  }
}

/**
 * Sebaran jawaban, daya pembeda, dan dugaan miskonsepsi per butir — lihat
 * `rincianJawaban()` di analisis-jawaban.ts. Dimuat terpisah dari
 * `muatAnalisisButirMapel` karena butuh `konten_jsonb` (opsi & kunci) dan
 * total skor tiap siswa, yang tidak dibutuhkan halaman lain.
 */
export async function muatRincianJawabanMapel(
  jenjang: Jenjang,
  mapelId: string
): Promise<RincianJawaban[] | string> {
  const db = createAdminClient(jenjang);
  try {
    const [soal, jawaban, nilai] = await Promise.all([
      ambilSemua<{ id: string; urutan: number; tipe: string; skor: number; konten_jsonb: Record<string, unknown> | null }>((a, b) =>
        db.from("soal").select("id, urutan, tipe, skor, konten_jsonb").eq("mapel_id", mapelId).range(a, b)
      ),
      ambilSemua<{ siswa_id: string; jawaban_jsonb: Record<string, unknown> | null }>((a, b) =>
        db.from("jawaban_siswa").select("siswa_id, jawaban_jsonb").eq("mapel_id", mapelId).not("submitted_at", "is", null).range(a, b)
      ),
      ambilSemua<{ siswa_id: string; detail_jsonb: Record<string, unknown> | null; total_skor: number | null }>((a, b) =>
        db.from("nilai").select("siswa_id, detail_jsonb, total_skor").eq("mapel_id", mapelId).range(a, b)
      ),
    ]);
    const nilaiPer = new Map(nilai.map((n) => [n.siswa_id, n]));
    return rincianJawaban(
      soal.map((s) => ({
        id: s.id,
        urutan: Number(s.urutan),
        tipe: s.tipe,
        skor: Number(s.skor),
        konten: s.konten_jsonb ?? {},
      })),
      jawaban.map((j) => {
        const nv = nilaiPer.get(j.siswa_id);
        return {
          jawaban: j.jawaban_jsonb ?? {},
          detail: nv?.detail_jsonb ?? {},
          totalSkor: Number(nv?.total_skor ?? 0) || 0,
        };
      })
    );
  } catch (e) {
    return "Gagal memuat sebaran jawaban: " + (e instanceof Error ? e.message : "kesalahan tidak diketahui");
  }
}
