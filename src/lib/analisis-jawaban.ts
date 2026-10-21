/**
 * Analisis jawaban siswa per butir — pelengkap `analisisButir()` di
 * statistik.ts (yang hanya menghitung benar/salah).
 *
 * Murni (tanpa Supabase) supaya bisa diuji: lihat
 * `src/lib/__tests__/analisis-jawaban.test.ts`.
 *
 * Yang dihitung per soal:
 *
 *   1. SEBARAN JAWABAN — opsi/jawaban apa saja yang dipilih siswa dan
 *      berapa banyak. Untuk PG: tiap opsi (A, B, C…) beserta jumlah
 *      pemilih di kelompok atas & bawah. Untuk uraian singkat: jawaban
 *      yang paling sering diketik. Untuk B/S bertingkat & menjodohkan:
 *      pernyataan/pasangan yang paling sering keliru.
 *   2. DUGAAN MISKONSEPSI — jawaban salah yang paling banyak dipilih.
 *      Kalau dipilih ≥ 20% peserta, itu tanda kuat ada konsep yang keliru
 *      dipahami (atau kunci jawabannya salah — keduanya perlu dicek guru).
 *   3. DAYA PEMBEDA — selisih proporsi benar kelompok atas (27% nilai
 *      tertinggi) dan kelompok bawah (27% terendah). Negatif = siswa
 *      pintar justru lebih banyak salah → curigai kunci jawaban.
 *   4. EFEKTIVITAS PENGECOH (PG) — pengecoh "berfungsi" bila dipilih
 *      minimal 5% peserta. Pengecoh yang tidak dipilih siapa pun sebaiknya
 *      diganti.
 *
 * Huruf opsi (A, B, C…) mengikuti URUTAN DI EDITOR SOAL, bukan urutan
 * acak yang dilihat tiap siswa saat ujian.
 */

import { htmlKeTeks } from "@/lib/html-soal";

export const AMBANG_MISKONSEPSI = 0.2;
export const AMBANG_PENGECOH = 0.05;
export const PROPORSI_KELOMPOK = 0.27;

export interface BarisJawaban {
  label: string;
  teks: string;
  /** Opsi/jawaban ini benar (kunci)? */
  benar: boolean;
  jumlah: number;
  /** Persen dari seluruh peserta yang sudah submit. */
  persen: number;
  /** Pemilih dari kelompok atas / bawah (hanya PG & B/S). */
  atas?: number;
  bawah?: number;
}

export type KategoriDayaBeda = "sangat_baik" | "baik" | "cukup" | "jelek" | "negatif";

export interface RincianJawaban {
  soalId: string;
  urutan: number;
  tipe: string;
  pertanyaan: string;
  peserta: number;
  kosong: number;
  /** "pilihan" = tiap baris satu pilihan jawaban; "keliru" = tiap baris
   *  satu pernyataan/pasangan dan angkanya jumlah siswa yang KELIRU. */
  jenisBaris: "pilihan" | "keliru";
  baris: BarisJawaban[];
  dayaBeda: number | null;
  kategoriDayaBeda: KategoriDayaBeda | null;
  /** Jumlah pengecoh berfungsi / total pengecoh (PG biasa saja). */
  pengecoh: { berfungsi: number; total: number } | null;
  miskonsepsi: string | null;
}

export interface SoalAnalisis {
  id: string;
  urutan: number;
  tipe: string;
  skor: number;
  konten: Record<string, unknown>;
}

export interface PesertaAnalisis {
  jawaban: Record<string, unknown>;
  /** Skor per soal (`nilai.detail_jsonb`). */
  detail: Record<string, unknown>;
  totalSkor: number;
}

type Obj = Record<string, unknown>;

const huruf = (i: number) => String.fromCharCode(65 + i);
const pct = (n: number, d: number) => (d ? Math.round((n * 1000) / d) / 10 : 0);

function teksDari(o: Obj | undefined, maks = 120): string {
  if (!o) return "";
  const t = String(o.teks ?? "").trim() || htmlKeTeks(String(o.teks_html ?? ""));
  const hasil = t || (o.gambar_url || /<img/i.test(String(o.teks_html ?? "")) ? "(gambar)" : "");
  return hasil.length > maks ? `${hasil.slice(0, maks)}…` : hasil;
}

function pertanyaanDari(k: Obj): string {
  const t =
    String(k.pertanyaan ?? k.instruksi ?? "").trim() ||
    htmlKeTeks(String(k.pertanyaan_html ?? k.instruksi_html ?? ""));
  return t.length > 160 ? `${t.slice(0, 160)}…` : t || "(soal bergambar)";
}

export function normalisasiUraian(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function kategoriDayaBeda(d: number): KategoriDayaBeda {
  if (d < 0) return "negatif";
  if (d >= 0.4) return "sangat_baik";
  if (d >= 0.3) return "baik";
  if (d >= 0.2) return "cukup";
  return "jelek";
}

export const LABEL_DAYA_BEDA: Record<KategoriDayaBeda, string> = {
  sangat_baik: "Sangat baik",
  baik: "Baik",
  cukup: "Cukup (perlu diperbaiki)",
  jelek: "Jelek (revisi/ganti)",
  negatif: "Negatif (cek kunci!)",
};

function dijawab(j: unknown): boolean {
  if (j === undefined || j === null) return false;
  if (typeof j === "string") return j.trim() !== "";
  if (Array.isArray(j)) return j.length > 0;
  if (typeof j === "object") return Object.keys(j as Obj).length > 0;
  return true;
}

/** Bagi peserta jadi kelompok atas & bawah (27%) menurut total skor. */
export function kelompokAtasBawah<T extends { totalSkor: number }>(
  peserta: readonly T[]
): { atas: T[]; bawah: T[] } | null {
  if (peserta.length < 4) return null;
  const k = Math.max(1, Math.round(peserta.length * PROPORSI_KELOMPOK));
  const urut = [...peserta].sort((a, b) => b.totalSkor - a.totalSkor);
  return { atas: urut.slice(0, k), bawah: urut.slice(-k) };
}

export function rincianJawaban(
  soalList: readonly SoalAnalisis[],
  peserta: readonly PesertaAnalisis[]
): RincianJawaban[] {
  const kelompok = kelompokAtasBawah(peserta);
  const setAtas = new Set(kelompok?.atas ?? []);
  const setBawah = new Set(kelompok?.bawah ?? []);
  const n = peserta.length;

  return [...soalList]
    .sort((a, b) => a.urutan - b.urutan)
    .map((s) => {
      const k = s.konten ?? {};
      const kosong = peserta.filter((p) => !dijawab(p.jawaban?.[s.id])).length;
      const benarPenuh = (p: PesertaAnalisis) =>
        s.skor > 0 && (Number(p.detail?.[s.id] ?? 0) || 0) >= s.skor;

      let dayaBeda: number | null = null;
      if (kelompok) {
        const pa = kelompok.atas.filter(benarPenuh).length / kelompok.atas.length;
        const pb = kelompok.bawah.filter(benarPenuh).length / kelompok.bawah.length;
        dayaBeda = Math.round((pa - pb) * 100) / 100;
      }

      let baris: BarisJawaban[] = [];
      let jenisBaris: RincianJawaban["jenisBaris"] = "pilihan";
      let pengecoh: RincianJawaban["pengecoh"] = null;

      const hitungKelompok = (cocok: (p: PesertaAnalisis) => boolean) => ({
        jumlah: peserta.filter(cocok).length,
        atas: kelompok ? peserta.filter((p) => setAtas.has(p) && cocok(p)).length : undefined,
        bawah: kelompok ? peserta.filter((p) => setBawah.has(p) && cocok(p)).length : undefined,
      });

      switch (s.tipe) {
        case "pilgan_biasa":
        case "pilgan_kompleks": {
          const opsi = (Array.isArray(k.opsi) ? k.opsi : []) as Obj[];
          const kompleks = s.tipe === "pilgan_kompleks";
          baris = opsi.map((o, i) => {
            const id = String(o.id);
            const h = hitungKelompok((p) => {
              const j = p.jawaban?.[s.id];
              return kompleks ? Array.isArray(j) && j.map(String).includes(id) : String(j ?? "") === id;
            });
            return {
              label: huruf(i),
              teks: teksDari(o),
              benar: o.benar === true,
              jumlah: h.jumlah,
              persen: pct(h.jumlah, n),
              atas: h.atas,
              bawah: h.bawah,
            };
          });
          if (!kompleks) {
            const salah = baris.filter((b) => !b.benar);
            pengecoh = {
              total: salah.length,
              berfungsi: salah.filter((b) => n > 0 && b.jumlah / n >= AMBANG_PENGECOH).length,
            };
          }
          break;
        }

        case "benar_salah": {
          const kunci = k.jawaban_benar === true;
          baris = [true, false].map((v) => {
            const h = hitungKelompok((p) => {
              const j = p.jawaban?.[s.id];
              return j === v || String(j) === String(v);
            });
            return {
              label: v ? "B" : "S",
              teks: v ? "Benar" : "Salah",
              benar: v === kunci,
              jumlah: h.jumlah,
              persen: pct(h.jumlah, n),
              atas: h.atas,
              bawah: h.bawah,
            };
          });
          break;
        }

        case "uraian_singkat": {
          const kunci = ((Array.isArray(k.kunci_jawaban) ? k.kunci_jawaban : []) as unknown[])
            .map(normalisasiUraian)
            .filter(Boolean);
          const hitung = new Map<string, number>();
          for (const p of peserta) {
            const j = normalisasiUraian(p.jawaban?.[s.id]);
            if (j) hitung.set(j, (hitung.get(j) ?? 0) + 1);
          }
          baris = Array.from(hitung.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 8)
            .map(([teks, jumlah], i) => ({
              label: `#${i + 1}`,
              teks: teks.length > 120 ? `${teks.slice(0, 120)}…` : teks,
              // Aturan yang SAMA dengan fungsi koreksi (0007): benar bila
              // jawaban memuat salah satu kunci.
              benar: kunci.some((kw) => teks.includes(kw)),
              jumlah,
              persen: pct(jumlah, n),
            }));
          break;
        }

        case "multi_benar_salah": {
          jenisBaris = "keliru";
          const pernyataan = (Array.isArray(k.pernyataan) ? k.pernyataan : []) as Obj[];
          baris = pernyataan.map((pr, i) => {
            const id = String(pr.id);
            const kunci = pr.jawaban_benar === true;
            const keliru = peserta.filter((p) => {
              const j = p.jawaban?.[s.id] as Obj | undefined;
              if (!j || typeof j !== "object" || !(id in j)) return false;
              return (j[id] === true || String(j[id]) === "true") !== kunci;
            }).length;
            return {
              label: `P${i + 1}`,
              teks: `${teksDari(pr)} (kunci: ${kunci ? "Benar" : "Salah"})`,
              benar: false,
              jumlah: keliru,
              persen: pct(keliru, n),
            };
          });
          break;
        }

        case "menjodohkan": {
          jenisBaris = "keliru";
          const kiri = (Array.isArray(k.soal) ? k.soal : []) as Obj[];
          const kanan = new Map(
            ((Array.isArray(k.jawaban) ? k.jawaban : []) as Obj[]).map((j) => [String(j.id), teksDari(j, 60)])
          );
          const kunci = (k.pasangan_benar ?? {}) as Record<string, string>;
          const salahPasang = new Map<string, { teks: string; jumlah: number }>();
          for (const p of peserta) {
            const j = p.jawaban?.[s.id] as Record<string, string> | undefined;
            if (!j || typeof j !== "object") continue;
            for (const item of kiri) {
              const kid = String(item.id);
              const pilih = j[kid];
              if (!pilih || pilih === kunci[kid]) continue;
              const kunciMap = `${kid}→${pilih}`;
              const ada = salahPasang.get(kunciMap) ?? {
                teks: `${teksDari(item, 60)} → ${kanan.get(pilih) ?? "?"} (seharusnya: ${kanan.get(kunci[kid]) ?? "?"})`,
                jumlah: 0,
              };
              ada.jumlah++;
              salahPasang.set(kunciMap, ada);
            }
          }
          baris = Array.from(salahPasang.values())
            .sort((a, b) => b.jumlah - a.jumlah)
            .slice(0, 6)
            .map((x, i) => ({
              label: `#${i + 1}`,
              teks: x.teks,
              benar: false,
              jumlah: x.jumlah,
              persen: pct(x.jumlah, n),
            }));
          break;
        }
      }

      return {
        soalId: s.id,
        urutan: s.urutan,
        tipe: s.tipe,
        pertanyaan: pertanyaanDari(k),
        peserta: n,
        kosong,
        jenisBaris,
        baris,
        dayaBeda,
        kategoriDayaBeda: dayaBeda === null ? null : kategoriDayaBeda(dayaBeda),
        pengecoh,
        miskonsepsi: susunMiskonsepsi(s.tipe, baris, jenisBaris, n),
      };
    });
}

function susunMiskonsepsi(
  tipe: string,
  baris: BarisJawaban[],
  jenis: RincianJawaban["jenisBaris"],
  n: number
): string | null {
  if (n === 0) return null;
  const salah = baris.filter((b) => !b.benar).sort((a, b) => b.jumlah - a.jumlah)[0];
  if (!salah || salah.jumlah / n < AMBANG_MISKONSEPSI) return null;

  if (jenis === "keliru") {
    return `${salah.persen}% siswa keliru pada ${tipe === "menjodohkan" ? "pasangan" : "pernyataan"} "${salah.teks}". Bahas ulang konsep ini.`;
  }
  const kunciTerbanyak = Math.max(0, ...baris.filter((b) => b.benar).map((b) => b.jumlah));
  const label = tipe === "uraian_singkat" ? `"${salah.teks}"` : `${salah.label} ("${salah.teks}")`;
  if (salah.jumlah > kunciTerbanyak) {
    return `${salah.persen}% siswa memilih ${label} — lebih banyak dari yang menjawab benar. Cek kunci jawaban, atau ada miskonsepsi kuat di sini.`;
  }
  return `${salah.persen}% siswa memilih ${label}. Kemungkinan miskonsepsi — bahas mengapa jawaban ini keliru.`;
}
