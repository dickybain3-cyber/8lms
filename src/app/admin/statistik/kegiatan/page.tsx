import type { Metadata } from "next";
import Link from "next/link";
import { getSesiGuru, pastikanBolehKeJenjang } from "@/lib/admin-guard";
import { JENJANG_LABEL, parseJenjang, type Jenjang } from "@/lib/jenjang";
import { histogram, predikat, ringkas, ringkasPerKelompok, bulat1 } from "@/lib/statistik";
import { muatAnalisisButirMapel, muatDataKegiatan, muatRincianJawabanMapel, type BarisSiswa } from "@/lib/statistik-kegiatan";
import PanelJawaban, { GAYA_DAYA_BEDA } from "@/components/admin/Statistik/PanelJawaban";
import { LABEL_DAYA_BEDA } from "@/lib/analisis-jawaban";
import { Info, Remah } from "@/components/ui/Panel";
import BadgeJenjang from "@/components/admin/BadgeJenjang";
import {
  BilahKesukaran,
  GrafikBatangMendatar,
  GrafikSebaran,
  KartuNilai,
  fmt,
  warnaNilai,
} from "@/components/admin/Statistik/Grafik";
import TombolUnduhPdf from "@/components/admin/Statistik/TombolUnduhPdf";

export const metadata: Metadata = { title: "Statistik Kegiatan | LMS SMPN 8 Probolinggo" };
export const dynamic = "force-dynamic";

type Urut = "nilai" | "kelas" | "nama";
type Cari = { jenjang?: string; event?: string; kelas?: string; mapel?: string; urut?: string };

function tanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Statistik satu kegiatan: kartu ringkas, sebaran nilai, rata-rata per kelas &
 * per mapel, analisis butir (mudah/sedang/sulit), dan peringkat siswa yang
 * bisa disaring per kelas dan diurutkan. Semua filter lewat URL (?kelas=…)
 * sehingga halaman tetap server-rendered — ringan di HP — dan bisa dicetak
 * ke PDF persis seperti yang sedang dilihat.
 */
export default async function StatistikKegiatanPage({ searchParams }: { searchParams: Cari }) {
  const sesi = await getSesiGuru();
  const jenjang: Jenjang = parseJenjang(searchParams.jenjang) ?? sesi.jenjang ?? 7;
  const eventId = searchParams.event ?? "";
  const urut: Urut = searchParams.urut === "kelas" || searchParams.urut === "nama" ? searchParams.urut : "nilai";

  const tolak = await pastikanBolehKeJenjang(sesi, jenjang);
  if (tolak || !/^[0-9a-f-]{36}$/i.test(eventId)) {
    return (
      <div>
        <Remah href="/admin/statistik" label="Semua statistik" />
        <Info nada="peringatan">{tolak ?? "Kegiatan tidak dikenali."}</Info>
      </div>
    );
  }

  let data;
  try {
    data = await muatDataKegiatan(jenjang, eventId);
  } catch (e) {
    return (
      <div>
        <Remah href="/admin/statistik" label="Semua statistik" />
        <Info nada="peringatan">Gagal memuat data: {e instanceof Error ? e.message : "kesalahan tidak diketahui"}</Info>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <Remah href="/admin/statistik" label="Semua statistik" />
        <Info nada="peringatan">Kegiatan tidak ditemukan di database {JENJANG_LABEL[jenjang]}.</Info>
      </div>
    );
  }

  const mapelTerpilih = data.mapel.find((m) => m.id === searchParams.mapel) ?? null;
  const kelasTerpilih = data.kelas.includes(searchParams.kelas ?? "") ? searchParams.kelas! : null;

  const href = (ubah: Partial<Cari>) => {
    const p = new URLSearchParams({ jenjang: String(jenjang), event: eventId });
    const gabung = { kelas: kelasTerpilih ?? undefined, mapel: mapelTerpilih?.id, urut, ...ubah };
    for (const [k, v] of Object.entries(gabung)) if (v && !(k === "urut" && v === "nilai")) p.set(k, v);
    return `/admin/statistik/kegiatan?${p.toString()}`;
  };

  // Nilai yang dipakai per siswa: satu mapel, atau rata-rata semua mapel yang dikumpulkan.
  const nilaiSiswa = (s: BarisSiswa): number | null => {
    if (mapelTerpilih) return s.nilai[mapelTerpilih.id] ?? null;
    const v = Object.values(s.nilai);
    return v.length ? bulat1(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const targetSiswa = (s: BarisSiswa) => (mapelTerpilih ? s.target.has(mapelTerpilih.id) : s.target.size > 0);

  const siswaSaring = data.siswa.filter((s) => targetSiswa(s) && (!kelasTerpilih || s.kelas === kelasTerpilih));
  const berNilai = siswaSaring
    .map((s) => ({ s, n: nilaiSiswa(s) }))
    .filter((x): x is { s: BarisSiswa; n: number } => x.n !== null);
  const r = ringkas(berNilai.map((x) => x.n));
  const tertinggi = berNilai.reduce<{ s: BarisSiswa; n: number } | null>((a, b) => (!a || b.n > a.n ? b : a), null);
  const terendah = berNilai.reduce<{ s: BarisSiswa; n: number } | null>((a, b) => (!a || b.n < a.n ? b : a), null);
  const perKelas = ringkasPerKelompok(siswaSaring, (s) => s.kelas, nilaiSiswa);
  const perMapel = data.mapel.map((m) => ({
    m,
    r: ringkas(
      data.siswa
        .filter((s) => s.target.has(m.id) && (!kelasTerpilih || s.kelas === kelasTerpilih))
        .map((s) => s.nilai[m.id])
        .filter((x): x is number => x !== undefined)
    ),
  }));

  const peringkat = [...berNilai].sort((a, b) =>
    urut === "nama"
      ? a.s.nama.localeCompare(b.s.nama, "id")
      : urut === "kelas"
        ? a.s.kelas.localeCompare(b.s.kelas, "id", { numeric: true }) || b.n - a.n
        : b.n - a.n
  );
  const rankNilai = new Map([...berNilai].sort((a, b) => b.n - a.n).map((x, i) => [x.s.siswaId, i + 1]));
  const belum = siswaSaring.length - berNilai.length;

  const [butir, rincianMentah] = mapelTerpilih
    ? await Promise.all([
        muatAnalisisButirMapel(jenjang, mapelTerpilih.id),
        muatRincianJawabanMapel(jenjang, mapelTerpilih.id),
      ])
    : [null, null];
  const rincian = Array.isArray(rincianMentah) ? rincianMentah : [];
  const rincianPer = new Map(rincian.map((r) => [r.soalId, r]));
  const hitungKategori = Array.isArray(butir)
    ? butir.reduce(
        (a, b) => {
          if (b.kategori) a[b.kategori]++;
          return a;
        },
        { mudah: 0, sedang: 0, sulit: 0 }
      )
    : null;

  const cakupan = `${mapelTerpilih ? mapelTerpilih.nama : "Semua mapel"} · ${kelasTerpilih ? `Kelas ${kelasTerpilih}` : JENJANG_LABEL[jenjang]}`;
  const namaBerkas = `Statistik ${data.event.nama} - ${cakupan}`.replace(/[\\/:*?"<>|]/g, "-");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="print:hidden">
        <Remah href="/admin/statistik" label="Semua statistik" />
      </div>

      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-[1.5rem] font-bold leading-tight text-ink">{data.event.nama}</h1>
            <BadgeJenjang jenjang={jenjang} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {tanggal(data.event.tglMulai)} – {tanggal(data.event.tglSelesai)} · {data.mapel.length} mapel
          </p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{cakupan}</p>
        </div>
        <TombolUnduhPdf namaBerkas={namaBerkas} />
      </header>

      {/* ── Filter (tidak ikut dicetak) ── */}
      <section className="mb-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden" aria-label="Saring">
        <PilihanChip
          label="Mapel"
          pilihan={[{ teks: "Semua mapel", href: href({ mapel: undefined }), aktif: !mapelTerpilih }].concat(
            data.mapel.map((m) => ({ teks: m.nama, href: href({ mapel: m.id }), aktif: mapelTerpilih?.id === m.id }))
          )}
        />
        <PilihanChip
          label="Kelas"
          pilihan={[{ teks: "Semua", href: href({ kelas: undefined }), aktif: !kelasTerpilih }].concat(
            data.kelas.map((k) => ({ teks: k, href: href({ kelas: k }), aktif: kelasTerpilih === k }))
          )}
        />
      </section>

      {data.mapel.length === 0 ? (
        <Info>Kegiatan ini belum punya mata pelajaran.</Info>
      ) : (
        <>
          {/* ── Kartu ringkas ── */}
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Ringkasan nilai">
            <KartuNilai label="Rata-rata" nilai={fmt(r.rata)} sub={`median ${fmt(r.median)} · simpangan ${fmt(r.simpangan)}`} aksen="border-l-violet-500" />
            <KartuNilai
              label="Peserta dinilai"
              nilai={<>{r.jumlah}<span className="text-sm font-semibold text-slate-400"> / {siswaSaring.length}</span></>}
              sub={belum > 0 ? `${belum} belum mengumpulkan` : "semua sudah mengumpulkan"}
              aksen="border-l-blue-500"
            />
            <KartuNilai label="Tertinggi" nilai={fmt(tertinggi?.n)} sub={tertinggi ? `${tertinggi.s.nama} · ${tertinggi.s.kelas}` : undefined} aksen="border-l-emerald-500" />
            <KartuNilai label="Terendah" nilai={fmt(terendah?.n)} sub={terendah ? `${terendah.s.nama} · ${terendah.s.kelas}` : undefined} aksen="border-l-red-400" />
            <KartuNilai
              label="Nilai ≥ 75"
              nilai={r.jumlah ? `${Math.round((berNilai.filter((x) => x.n >= 75).length / r.jumlah) * 100)}%` : "—"}
              sub={`${berNilai.filter((x) => x.n >= 75).length} siswa`}
              aksen="border-l-amber-400"
            />
            <KartuNilai
              label="Predikat"
              nilai={
                <span className="flex flex-wrap gap-x-2.5 gap-y-1 font-sans text-[0.95rem]">
                  {(["A", "B", "C", "D"] as const).map((p) => (
                    <span key={p} className="whitespace-nowrap">
                      <b>{p}</b> {berNilai.filter((x) => predikat(x.n) === p).length}
                    </span>
                  ))}
                </span>
              }
              sub="A ≥90 · B ≥80 · C ≥70 · D <70"
              aksen="border-l-slate-400"
            />
          </section>

          {/* ── Grafik ── */}
          <section className="mb-6 grid gap-4 lg:grid-cols-2 print:break-inside-avoid">
            <Kotak judul="Sebaran nilai">
              <GrafikSebaran data={histogram(berNilai.map((x) => x.n))} />
            </Kotak>
            {!kelasTerpilih && perKelas.length > 1 ? (
              <Kotak judul="Rata-rata per kelas">
                <GrafikBatangMendatar
                  baris={perKelas.map((k) => ({ label: `Kelas ${k.kunci}`, nilai: k.ringkasan.rata, catatan: `${k.ringkasan.jumlah} siswa` }))}
                />
              </Kotak>
            ) : (
              <Kotak judul={mapelTerpilih ? "Ringkasan mapel" : "Rata-rata per mapel"}>
                <GrafikBatangMendatar
                  baris={perMapel
                    .filter((x) => !mapelTerpilih || x.m.id === mapelTerpilih.id)
                    .map((x) => ({ label: x.m.nama, nilai: x.r.rata, catatan: `${x.r.jumlah} siswa` }))}
                />
              </Kotak>
            )}
          </section>

          {!mapelTerpilih && !kelasTerpilih && perKelas.length > 1 && (
            <section className="mb-6 print:break-inside-avoid">
              <Kotak judul="Rata-rata per mapel">
                <GrafikBatangMendatar baris={perMapel.map((x) => ({ label: x.m.nama, nilai: x.r.rata, catatan: `${x.r.jumlah} siswa` }))} />
              </Kotak>
            </section>
          )}

          {/* ── Analisis butir soal ── */}
          {mapelTerpilih ? (
            <section className="mb-6 print:break-before-page">
              <Kotak judul={`Analisis butir soal — ${mapelTerpilih.nama}`}>
                {typeof butir === "string" ? (
                  <Info nada="peringatan">{butir}</Info>
                ) : butir && butir.length > 0 && hitungKategori ? (
                  <>
                    <p className="mb-3 text-[0.78rem] text-slate-500">
                      Tingkat kesukaran = persentase siswa yang menjawab benar penuh (semua kelas, hanya yang sudah
                      mengumpulkan): <b>mudah</b> &gt; 70%, <b>sedang</b> 30–70%, <b>sulit</b> &lt; 30%.
                    </p>
                    <BilahKesukaran {...hitungKategori} />
                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full min-w-[520px] text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-[0.7rem] uppercase tracking-wide text-slate-500">
                            <th className="py-2 pr-2">No</th>
                            <th className="py-2 pr-2">% benar</th>
                            <th className="py-2 pr-2">Kategori</th>
                            <th className="py-2 pr-2 text-right">Benar</th>
                            <th className="py-2 pr-2 text-right">Sebagian</th>
                            <th className="py-2 pr-2 text-right">Salah</th>
                            <th className="py-2 pr-2 text-right">Kosong</th>
                            <th className="py-2 text-right">Daya beda</th>
                          </tr>
                        </thead>
                        <tbody>
                          {butir.map((b, i) => {
                            const kat = b.kategori;
                            return (
                              <tr key={b.soalId} className="border-b border-slate-100 last:border-0">
                                <td className="py-2 pr-2 font-semibold tabular-nums">{i + 1}</td>
                                <td className="py-2 pr-2">
                                  <span className="flex items-center gap-2">
                                    <span className="relative h-2.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                      <span className={`absolute inset-y-0 left-0 ${kat ? WARNA_KESUKARAN[kat] : "bg-slate-300"}`} style={{ width: `${b.persenBenar}%` }} />
                                    </span>
                                    <span className="tabular-nums">{fmt(b.persenBenar)}%</span>
                                  </span>
                                </td>
                                <td className="py-2 pr-2">{kat ? <BadgeKesukaran k={kat} /> : <span className="text-slate-400">—</span>}</td>
                                <td className="py-2 pr-2 text-right tabular-nums">{b.benar}</td>
                                <td className="py-2 pr-2 text-right tabular-nums">{b.sebagian}</td>
                                <td className="py-2 pr-2 text-right tabular-nums">{b.salah}</td>
                                <td className="py-2 pr-2 text-right tabular-nums">{b.kosong}</td>
                                <td className="py-2 text-right">
                                  {(() => {
                                    const r = rincianPer.get(b.soalId);
                                    if (!r || r.dayaBeda == null || !r.kategoriDayaBeda) return <span className="text-slate-400">—</span>;
                                    return (
                                      <span title={LABEL_DAYA_BEDA[r.kategoriDayaBeda]} className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums ${GAYA_DAYA_BEDA[r.kategoriDayaBeda]}`}>
                                        {r.dayaBeda.toFixed(2)}
                                      </span>
                                    );
                                  })()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {rincian.length > 0 && (
                      <div className="mt-6">
                        <h3 className="mb-1 font-serif text-base font-bold text-navy-900">
                          Sebaran jawaban &amp; dugaan miskonsepsi
                        </h3>
                        <p className="mb-3 text-[0.75rem] text-slate-500">
                          Jawaban salah yang dipilih ≥ 20% siswa ditandai. Soal bertanda dibuka otomatis.
                          Daya beda: ≥ 0,40 sangat baik · 0,30–0,39 baik · 0,20–0,29 cukup · &lt; 0,20 jelek · negatif = cek kunci.
                        </p>
                        <div className="space-y-2">
                          {rincian.map((r) => {
                            const tandai = !!r.miskonsepsi || r.kategoriDayaBeda === "negatif";
                            return (
                              <details key={r.soalId} open={tandai} className={`rounded-xl border bg-white px-3 py-2 ${tandai ? "border-amber-200" : "border-slate-200"}`}>
                                <summary className="cursor-pointer text-[0.8rem] font-semibold text-ink">
                                  {tandai && <i className="fas fa-triangle-exclamation mr-1.5 text-amber-500" aria-hidden />}
                                  Soal no {r.urutan}
                                  <span className="ml-2 font-normal text-slate-500">{r.pertanyaan}</span>
                                </summary>
                                <div className="pt-2">
                                  <PanelJawaban r={r} />
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Belum ada jawaban yang dikumpulkan untuk mapel ini.</p>
                )}
              </Kotak>
            </section>
          ) : (
            <p className="mb-6 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 print:hidden">
              <i className="fas fa-circle-info mr-1.5" aria-hidden />
              Pilih satu mapel di atas untuk melihat analisis butir soal (mudah / sedang / sulit).
            </p>
          )}

          {/* ── Peringkat siswa ── */}
          <section className="print:break-before-page">
            <Kotak
              judul={`Nilai siswa (${berNilai.length})`}
              aksi={
                <div className="print:hidden">
                  <PilihanChip
                    label="Urutkan"
                    pilihan={[
                      { teks: "Nilai", href: href({ urut: "nilai" }), aktif: urut === "nilai" },
                      { teks: "Per kelas", href: href({ urut: "kelas" }), aktif: urut === "kelas" },
                      { teks: "Nama", href: href({ urut: "nama" }), aktif: urut === "nama" },
                    ]}
                  />
                </div>
              }
            >
              {peringkat.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada nilai.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[0.7rem] uppercase tracking-wide text-slate-500">
                        <th className="w-10 py-2 pr-2">#</th>
                        <th className="py-2 pr-2">Nama</th>
                        <th className="py-2 pr-2">Kelas</th>
                        <th className="py-2 pr-2 text-right">Nilai</th>
                        <th className="py-2 text-center">Pred.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {peringkat.map(({ s, n }, i) => {
                        const kelasBaru = urut === "kelas" && (i === 0 || peringkat[i - 1].s.kelas !== s.kelas);
                        return (
                          <tr key={s.siswaId} className={`border-b border-slate-100 last:border-0 ${kelasBaru && i > 0 ? "border-t-2 border-t-slate-300" : ""}`}>
                            <td className="py-2 pr-2 tabular-nums text-slate-500">{rankNilai.get(s.siswaId)}</td>
                            <td className="py-2 pr-2 font-medium text-ink">{s.nama}</td>
                            <td className="py-2 pr-2 text-slate-600">{s.kelas}</td>
                            <td className="py-2 pr-2 text-right font-bold tabular-nums">{fmt(n)}</td>
                            <td className="py-2 text-center">
                              <span className={`inline-block min-w-[1.6rem] rounded px-1.5 py-0.5 text-xs font-bold text-white ${warnaNilai(n)}`}>{predikat(n)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {belum > 0 && (
                <p className="mt-3 text-[0.75rem] text-slate-500">
                  {belum} siswa belum mengumpulkan / belum dinilai dan tidak ikut dihitung.
                </p>
              )}
            </Kotak>
          </section>

          {mapelTerpilih && (
            <p className="mt-4 text-sm print:hidden">
              <Link
                href={sesi.isAdmin ? `/admin/nilai?jenjang=${jenjang}&mapelId=${mapelTerpilih.id}` : `/admin/nilai?mapelId=${mapelTerpilih.id}`}
                className="font-semibold text-[--primary] hover:underline"
              >
                <i className="fas fa-file-excel mr-1.5" aria-hidden />
                Rekap nilai lengkap &amp; unduh Excel →
              </Link>
            </p>
          )}
          <p className="mt-6 hidden text-[0.7rem] text-slate-500 print:block">
            Dicetak dari LMS SMPN 8 Probolinggo · nilai dinormalkan ke skala 0–100 (skor ÷ skor maksimal × 100).
          </p>
        </>
      )}
    </div>
  );
}

function Kotak({ judul, aksi, children }: { judul: string; aksi?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-serif text-base font-bold text-ink">{judul}</h2>
        {aksi}
      </div>
      {children}
    </div>
  );
}

function PilihanChip({ label, pilihan }: { label: string; pilihan: { teks: string; href: string; aktif: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {pilihan.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          scroll={false}
          aria-current={p.aktif ? "true" : undefined}
          className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-[0.8rem] font-semibold transition-colors ${
            p.aktif ? "bg-ink text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-[--accent]"
          }`}
        >
          {p.teks}
        </Link>
      ))}
    </div>
  );
}

const WARNA_KESUKARAN = { mudah: "bg-emerald-500", sedang: "bg-amber-400", sulit: "bg-red-400" } as const;

function BadgeKesukaran({ k }: { k: "mudah" | "sedang" | "sulit" }) {
  const gaya = { mudah: "bg-emerald-50 text-emerald-700 ring-emerald-200", sedang: "bg-amber-50 text-amber-700 ring-amber-200", sulit: "bg-red-50 text-red-700 ring-red-200" }[k];
  return <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold capitalize ring-1 ${gaya}`}>{k}</span>;
}
