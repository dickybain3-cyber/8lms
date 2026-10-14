import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type HasilJenjang } from "@/lib/supabase/admin-multi";
// `fanOutRpc` ada di admin-multi-event.ts, BUKAN admin-multi.ts.
import { fanOutRpc } from "@/lib/supabase/admin-multi-event";
import { getSesiGuru } from "@/lib/admin-guard";
import { JENJANG_LABEL, type Jenjang } from "@/lib/jenjang";
import { bulat1 } from "@/lib/statistik";
import BadgeJenjang from "@/components/admin/BadgeJenjang";
import { GrafikBatangMendatar, KartuNilai, fmt } from "@/components/admin/Statistik/Grafik";
import TombolUnduhPdf from "@/components/admin/Statistik/TombolUnduhPdf";
import type { StatistikMapel } from "@/types";

export const dynamic = "force-dynamic";

/** Skor mentah -> skala 0–100 terhadap skor maksimal mapel. */
function ke100(n: number | null, maks: number): number | null {
  if (n === null || !(maks > 0)) return null;
  return bulat1(Math.min(100, Math.max(0, (Number(n) / maks) * 100)));
}

interface RingkasKegiatan {
  id: string;
  nama: string;
  mulai: string;
  mapel: { id: string; nama: string; rata: number | null; submit: number; target: number }[];
  rata: number | null;
  tertinggi: number | null;
  terendah: number | null;
  submit: number;
  target: number;
}

/** Gabungkan baris per-mapel dari RPC menjadi ringkasan per kegiatan. */
function kelompokkan(baris: StatistikMapel[]): RingkasKegiatan[] {
  const peta = new Map<string, RingkasKegiatan>();
  for (const m of baris) {
    const maks = Number(m.skor_maksimal);
    if (!peta.has(m.event_id)) {
      peta.set(m.event_id, { id: m.event_id, nama: m.event_nama, mulai: m.waktu_mulai, mapel: [], rata: null, tertinggi: null, terendah: null, submit: 0, target: 0 });
    }
    const k = peta.get(m.event_id)!;
    const rata = ke100(m.rata_rata, maks);
    const tinggi = ke100(m.skor_max, maks);
    const rendah = ke100(m.skor_min, maks);
    k.mapel.push({ id: m.mapel_id, nama: m.mapel_nama, rata, submit: Number(m.jumlah_submit), target: Number(m.jumlah_target) });
    k.submit += Number(m.jumlah_submit);
    k.target += Number(m.jumlah_target);
    if (tinggi !== null) k.tertinggi = k.tertinggi === null ? tinggi : Math.max(k.tertinggi, tinggi);
    if (rendah !== null) k.terendah = k.terendah === null ? rendah : Math.min(k.terendah, rendah);
    if (m.waktu_mulai < k.mulai) k.mulai = m.waktu_mulai;
  }
  for (const k of peta.values()) {
    // Rata-rata kegiatan = rata-rata mapel ditimbang jumlah pengumpul.
    const bobot = k.mapel.filter((m) => m.rata !== null && m.submit > 0);
    const total = bobot.reduce((a, m) => a + m.submit, 0);
    k.rata = total ? bulat1(bobot.reduce((a, m) => a + m.rata! * m.submit, 0) / total) : null;
  }
  return Array.from(peta.values()).sort((a, b) => b.mulai.localeCompare(a.mulai));
}

/**
 * Ringkasan statistik semua kegiatan. Admin: ketiga database sekaligus
 * (fan-out service role); guru: jenjangnya sendiri lewat RLS. Tiap kegiatan
 * tampil sebagai kartu "nilai keseluruhan" + grafik rata-rata per mapel,
 * dengan tautan ke statistik lengkap (grafik, per kelas, analisis butir).
 */
export default async function StatistikPage() {
  const sesi = await getSesiGuru();

  let hasilPerJenjang: HasilJenjang<StatistikMapel>[];
  if (sesi.isAdmin) {
    hasilPerJenjang = await fanOutRpc<StatistikMapel>("get_statistik_mapel_admin");
  } else {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_statistik_mapel");
    hasilPerJenjang = [
      {
        jenjang: (sesi.jenjang ?? 7) as Jenjang,
        data: (data ?? []) as StatistikMapel[],
        error: error ? "Gagal memuat statistik. Coba muat ulang halaman." : null,
      },
    ];
  }

  const errors = hasilPerJenjang.filter((h) => h.error).map((h) => `${JENJANG_LABEL[h.jenjang]}: ${h.error}`);
  const adaIsi = hasilPerJenjang.some((h) => h.data.length > 0);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 font-serif text-[1.5rem] font-bold text-ink">
            <i className="fas fa-chart-pie text-[--primary] print:hidden" aria-hidden />
            Statistik Nilai
          </h1>
          <p className="mt-1 text-[0.9rem] text-slate-500">
            {sesi.isAdmin
              ? "Nilai keseluruhan per kegiatan dari ketiga database (kelas 7, 8, dan 9)."
              : `Nilai keseluruhan per kegiatan — ${sesi.jenjang ? JENJANG_LABEL[sesi.jenjang] : "jenjang ini"}.`}{" "}
            Semua nilai dalam skala 0–100.
          </p>
        </div>
        {adaIsi && <TombolUnduhPdf namaBerkas="Statistik Nilai Semua Kegiatan" />}
      </header>

      {errors.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <i className="fas fa-triangle-exclamation mr-2" aria-hidden />
          Sebagian data tidak bisa dimuat: {errors.join(" · ")}
        </div>
      )}

      {!adaIsi && errors.length === 0 && (
        <div className="card-mewah px-5 py-14 text-center">
          <i className="fas fa-chart-simple mb-4 block text-4xl text-slate-300" aria-hidden />
          <p className="text-slate-500">Belum ada mapel untuk ditampilkan statistiknya.</p>
        </div>
      )}

      <div className="space-y-10">
        {hasilPerJenjang.map((hasil) => {
          if (hasil.data.length === 0) return null;
          const kegiatan = kelompokkan(hasil.data);
          return (
            <section key={hasil.jenjang}>
              <div className="mb-4 flex items-center gap-3 border-b-2 border-slate-200 pb-2.5">
                <BadgeJenjang jenjang={hasil.jenjang} ukuran="besar" />
                <span className="text-[0.78rem] font-medium text-slate-500">{kegiatan.length} kegiatan</span>
              </div>

              <div className="space-y-5">
                {kegiatan.map((k) => {
                  const persen = k.target ? Math.round((k.submit / k.target) * 100) : 0;
                  return (
                    <article key={k.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:break-inside-avoid sm:p-5">
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h2 className="font-serif text-[1.1rem] font-bold leading-snug text-ink">{k.nama}</h2>
                          <p className="text-[0.78rem] text-slate-500">
                            {k.mapel.length} mapel · mulai{" "}
                            {new Date(k.mulai).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                        </div>
                        <Link
                          href={`/admin/statistik/kegiatan?jenjang=${hasil.jenjang}&event=${k.id}`}
                          className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 self-start rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-[--primary] transition-colors hover:border-[--accent] hover:bg-blue-50 print:hidden"
                        >
                          Statistik lengkap
                          <i className="fas fa-arrow-right text-xs" aria-hidden />
                        </Link>
                      </div>

                      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <KartuNilai label="Rata-rata keseluruhan" nilai={fmt(k.rata)} aksen="border-l-violet-500" />
                        <KartuNilai label="Tertinggi" nilai={fmt(k.tertinggi)} aksen="border-l-emerald-500" />
                        <KartuNilai label="Terendah" nilai={fmt(k.terendah)} aksen="border-l-red-400" />
                        <KartuNilai label="Pengumpulan" nilai={`${persen}%`} sub={`${k.submit} / ${k.target} lembar`} aksen="border-l-blue-500" />
                      </div>

                      <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-wide text-slate-500">Rata-rata per mapel</p>
                      <GrafikBatangMendatar
                        baris={k.mapel.map((m) => ({ label: m.nama, nilai: m.rata, catatan: `${m.submit}/${m.target}` }))}
                      />
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
