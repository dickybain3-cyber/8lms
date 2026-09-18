import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type HasilJenjang } from "@/lib/supabase/admin-multi";
// `fanOutRpc` TIDAK pernah ada di admin-multi.ts — impor lama di sini
// membuat `next build` gagal untuk seluruh aplikasi, bukan cuma halaman
// ini. Fungsinya sekarang ada di admin-multi-event.ts; penjelasan lengkap
// ada di komentar fungsinya sendiri.
import { fanOutRpc } from "@/lib/supabase/admin-multi-event";
import { getSesiGuru } from "@/lib/admin-guard";
import { JENJANG_LABEL, type Jenjang } from "@/lib/jenjang";
import DistribusiNilai from "@/components/admin/Statistik/DistribusiNilai";
import BadgeJenjang from "@/components/admin/BadgeJenjang";
import type { StatistikMapel } from "@/types";

function formatWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtSkor(n: number | null) {
  if (n === null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Halaman ini punya DUA mode, ditentukan dari `guru.is_admin`:
 *
 *  - admin  -> data ketiga project ditarik paralel lewat service_role
 *              (fan-out), dikelompokkan per jenjang lalu per kegiatan.
 *  - guru   -> persis seperti sebelumnya: satu project saja, lewat RLS,
 *              tanpa service_role sama sekali.
 *
 * Yang membedakan cuma DARI MANA barisnya datang; bentuk datanya sama,
 * jadi sisa halaman punya satu jalur render saja. Guru yang belum
 * dijadikan admin tidak kehilangan apa pun — dia cuma melihat satu grup
 * jenjang, yaitu jenjangnya sendiri.
 */
export default async function StatistikPage() {
  const sesi = await getSesiGuru();

  let hasilPerJenjang: HasilJenjang<StatistikMapel>[];

  if (sesi.isAdmin) {
    hasilPerJenjang = await fanOutRpc<StatistikMapel>(
      "get_statistik_mapel_admin"
    );
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

  const errors = hasilPerJenjang.filter((h) => h.error).map((h) => h.error!);
  const adaIsi = hasilPerJenjang.some((h) => h.data.length > 0);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-7">
        <h1 className="flex items-center gap-2.5 font-serif text-[1.5rem] font-bold text-ink">
          <i className="fas fa-chart-pie text-[--primary]" aria-hidden />
          Analisis &amp; Statistik
        </h1>
        <p className="mt-1 text-[0.9rem] text-slate-500">
          {sesi.isAdmin ? (
            <>
              Ringkasan pengerjaan &amp; nilai dari{" "}
              <b>ketiga database (kelas 7, 8, dan 9)</b> sekaligus.
            </>
          ) : (
            <>
              Ringkasan pengerjaan &amp; nilai per mapel untuk{" "}
              {sesi.jenjang ? JENJANG_LABEL[sesi.jenjang] : "jenjang ini"}.
            </>
          )}
        </p>
      </div>

      {errors.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <i className="fas fa-triangle-exclamation mr-2" aria-hidden />
          Sebagian data tidak bisa dimuat: {errors.join(" ")} Data jenjang lain
          di bawah tetap ditampilkan apa adanya.
        </div>
      )}

      {!adaIsi && errors.length === 0 && (
        <div className="card-mewah px-5 py-14 text-center">
          <i
            className="fas fa-chart-simple mb-4 block text-4xl text-slate-300"
            aria-hidden
          />
          <p className="text-slate-500">
            Belum ada mapel untuk ditampilkan statistiknya.
          </p>
        </div>
      )}

      <div className="space-y-10">
        {hasilPerJenjang.map((hasil) => {
          if (hasil.data.length === 0) return null;

          // Kelompokkan per kegiatan DI DALAM jenjang. Dua project berbeda
          // bisa saja punya kegiatan bernama sama ("PAT 2026") dengan id
          // yang beda — karena itu pengelompokan tidak boleh mencampur
          // ketiganya jadi satu peta berdasarkan event_id saja.
          const events = new Map<
            string,
            { nama: string; mapel: StatistikMapel[] }
          >();
          for (const row of hasil.data) {
            if (!events.has(row.event_id)) {
              events.set(row.event_id, { nama: row.event_nama, mapel: [] });
            }
            events.get(row.event_id)!.mapel.push(row);
          }

          return (
            <section key={hasil.jenjang}>
              <div className="mb-4 flex items-center gap-3 border-b-2 border-slate-200 pb-2.5">
                <BadgeJenjang jenjang={hasil.jenjang} ukuran="besar" />
                <span className="text-[0.78rem] font-medium text-slate-400">
                  {hasil.data.length} mapel
                </span>
              </div>

              <div className="space-y-7">
                {Array.from(events.entries()).map(([eventId, ev]) => (
                  <div key={eventId}>
                    <h2 className="mb-3.5 border-l-4 border-[--primary] pl-3 font-serif text-[1.1rem] font-bold text-ink">
                      {ev.nama}
                    </h2>

                    <div className="space-y-4">
                      {ev.mapel.map((m) => {
                        const persenSubmit =
                          m.jumlah_target > 0
                            ? Math.round(
                                (m.jumlah_submit / m.jumlah_target) * 100
                              )
                            : 0;

                        return (
                          <div key={m.mapel_id} className="card-mewah p-5">
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-serif text-[1.05rem] font-bold text-ink">
                                    {m.mapel_nama}
                                  </h3>
                                  {/* Badge diulang di level baris, tidak
                                      cuma di judul grup: begitu daftarnya
                                      panjang dan halaman di-scroll, judul
                                      jenjang sudah keluar layar padahal
                                      tombol aksinya ada di sini. */}
                                  <BadgeJenjang jenjang={hasil.jenjang} />
                                </div>
                                <p className="mt-0.5 text-[0.78rem] text-slate-500">
                                  <i
                                    className="fas fa-clock mr-1.5 text-slate-400"
                                    aria-hidden
                                  />
                                  {formatWaktu(m.waktu_mulai)} –{" "}
                                  {formatWaktu(m.waktu_selesai)} · skor maksimal{" "}
                                  {fmtSkor(m.skor_maksimal)}
                                </p>
                              </div>

                              {/* Tautan pengolahan nilai cuma relevan untuk
                                  project yang sedang aktif di sesi ini —
                                  /admin/nilai membaca lewat cookie jenjang,
                                  jadi mapel dari jenjang lain akan tampil
                                  kosong di sana. Daripada memberi tautan
                                  yang menyesatkan, untuk jenjang lain
                                  ditampilkan keterangannya saja. */}
                              {hasil.jenjang === sesi.jenjang ? (
                                <Link
                                  href={`/admin/nilai?mapelId=${m.mapel_id}`}
                                  className="text-xs font-bold text-[--primary] hover:underline"
                                >
                                  Lihat pengolahan nilai →
                                </Link>
                              ) : (
                                <span className="text-[0.7rem] text-slate-400">
                                  Untuk mengolah nilainya, login di{" "}
                                  {JENJANG_LABEL[hasil.jenjang]}
                                </span>
                              )}
                            </div>

                            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                              <Tile
                                label="Submit"
                                warna="border-l-[--primary]"
                                nilai={
                                  <>
                                    {m.jumlah_submit}
                                    <span className="text-sm text-slate-400">
                                      {" "}
                                      / {m.jumlah_target}
                                    </span>
                                  </>
                                }
                              />
                              <Tile
                                label="Rata-rata"
                                warna="border-l-[#8b5cf6]"
                                nilai={fmtSkor(m.rata_rata)}
                              />
                              <Tile
                                label="Terendah"
                                warna="border-l-[--danger]"
                                nilai={fmtSkor(m.skor_min)}
                              />
                              <Tile
                                label="Tertinggi"
                                warna="border-l-[--success]"
                                nilai={fmtSkor(m.skor_max)}
                              />
                            </div>

                            <div className="mb-1 flex items-center justify-between text-[0.72rem] font-semibold text-slate-500">
                              <span>Progres pengumpulan</span>
                              <span>{persenSubmit}%</span>
                            </div>
                            <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#3b82f6] to-[#60a5fa] transition-[width] duration-500"
                                style={{ width: `${persenSubmit}%` }}
                              />
                            </div>

                            <DistribusiNilai
                              mapelId={m.mapel_id}
                              jenjang={hasil.jenjang}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Kotak angka ringkas — sama bentuknya dengan kartu ringkasan di desain acuan. */
function Tile({
  label,
  nilai,
  warna,
}: {
  label: string;
  nilai: React.ReactNode;
  warna: string;
}) {
  return (
    <div className={`rounded-xl border-l-4 bg-paper px-4 py-3 ${warna}`}>
      <p className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-serif text-[1.4rem] font-extrabold text-ink">
        {nilai}
      </p>
    </div>
  );
}
