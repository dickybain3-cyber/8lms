import Link from "next/link";
import { notFound } from "next/navigation";
import { aksesHalamanTryout, muatRekapTryout } from "@/lib/tryout-admin";
import {
  daftarPaket,
  daftarSubtes,
  peringkat,
  profilSiswa,
  rataPerKelas,
  rataRata,
  ringkasSubtesPaket,
  trenSiswa,
  type PaketRingkas,
  type ProfilSiswaTryout,
} from "@/lib/tryout";
import { tahunAjaranDariTanggal } from "@/lib/tahun-ajaran";
import GrafikGaris, { LencanaPerubahan } from "@/components/tryout/GrafikGaris";
import { GrafikBatangMendatar, KartuNilai, fmt } from "@/components/admin/Statistik/Grafik";
import AnalisisButir from "@/components/admin/Statistik/AnalisisButir";
import UnduhExcelTryout from "@/components/admin/Tryout/UnduhExcelTryout";
import { Info, Kartu, KepalaHalaman, Kosong, Remah } from "@/components/ui/Panel";
import type { SheetExcel } from "@/lib/excel";

export const dynamic = "force-dynamic";

type Tab = "ringkasan" | "peringkat" | "kelas" | "siswa" | "butir";
const TAB: { id: Tab; label: string; ikon: string }[] = [
  { id: "ringkasan", label: "Ringkasan", ikon: "fa-chart-pie" },
  { id: "peringkat", label: "Peringkat", ikon: "fa-ranking-star" },
  { id: "kelas", label: "Per Kelas", ikon: "fa-people-group" },
  { id: "siswa", label: "Per Siswa", ikon: "fa-user-graduate" },
  { id: "butir", label: "Analisis Butir", ikon: "fa-magnifying-glass-chart" },
];

const SEL = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
const TD = "px-3 py-2 text-sm text-ink";

export default async function HalamanStatistikTryout(props: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ tab?: string; paket?: string; kelas?: string; subtes?: string }>;
}) {
  const { eventId } = await props.params;
  const sp = await props.searchParams;
  const semua = eventId === "semua";
  const akses = await aksesHalamanTryout();
  if (!akses.ok) return <Info nada="peringatan">{akses.pesan}</Info>;
  const db = akses.db;

  let judul = "Statistik Angkatan — Semua Tryout";
  let tglAcuan = new Date().toISOString();
  if (!semua) {
    const { data: ev } = await db.from("event").select("id, nama, jenis, tgl_mulai").eq("id", eventId).maybeSingle();
    if (!ev || ev.jenis !== "tryout") notFound();
    judul = `Statistik — ${ev.nama}`;
    tglAcuan = ev.tgl_mulai;
  }

  const rekap = await muatRekapTryout(db, semua ? null : eventId);
  if (!rekap.ok) return <Info nada="peringatan">{rekap.pesan}</Info>;
  const rows = rekap.baris;
  const paketUrut = daftarPaket(rows);
  const subtesSemua = daftarSubtes(rows);
  const profil = profilSiswa(rows);
  const kelasSemua = [...new Set(profil.map((p) => p.kelas))].sort((a, b) => a.localeCompare(b, "id", { numeric: true }));

  const tab: Tab = (TAB.some((t) => t.id === sp.tab) ? sp.tab : "ringkasan") as Tab;
  // Paket terpilih: dari query, atau paket terakhir yang sudah punya nilai.
  const adaNilai = (p: PaketRingkas) => rows.some((r) => r.paket_id === p.id && r.status === "selesai");
  const paketDipilih =
    paketUrut.find((p) => p.id === sp.paket) ?? [...paketUrut].reverse().find(adaNilai) ?? paketUrut[paketUrut.length - 1];
  const kelasDipilih = kelasSemua.includes(sp.kelas ?? "") ? (sp.kelas as string) : null;
  const subtesDipilih = paketDipilih?.subtes.some((s) => s.kode === sp.subtes) ? (sp.subtes as string) : null;

  const dasar = `/admin/tryout/statistik/${eventId}`;
  const href = (ubah: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const nilai = { tab, paket: paketDipilih?.id ?? null, kelas: kelasDipilih, subtes: subtesDipilih, ...ubah };
    for (const [k, v] of Object.entries(nilai)) if (v) q.set(k, v);
    return `${dasar}?${q.toString()}`;
  };
  const labelPaket = (p: PaketRingkas) => (semua ? `${p.nama} (${p.eventNama})` : p.nama);

  // ----- Excel -----
  const kolomExcel: SheetExcel["kolom"] = [
    { header: "Kelas", key: "kelas", lebar: 8, tengah: true },
    { header: "Nama", key: "nama", lebar: 32 },
  ];
  for (const p of paketUrut) {
    for (const s of p.subtes) kolomExcel.push({ header: `${p.nama} - ${s.nama}`, key: `${p.id}:${s.kode}`, lebar: 14, tengah: true });
    kolomExcel.push({ header: `${p.nama} - Rata-rata`, key: `${p.id}:rata`, lebar: 14, tengah: true });
  }
  kolomExcel.push({ header: "Perubahan awal→akhir", key: "tren", lebar: 16, tengah: true });
  const barisExcel = profil.map((s) => {
    const b: Record<string, string | number | null> = { kelas: s.kelas, nama: s.nama };
    for (const p of paketUrut) {
      const n = s.paket[p.id];
      for (const st of p.subtes) b[`${p.id}:${st.kode}`] = n?.subtes[st.kode] ?? null;
      b[`${p.id}:rata`] = n?.rata ?? null;
    }
    b.tren = trenSiswa(s, paketUrut).awalAkhir?.selisih ?? null;
    return b;
  });

  return (
    <div>
      <Remah href={semua ? "/admin/tryout" : `/admin/tryout/${eventId}`} label={semua ? "Semua tryout" : "Kembali ke tryout"} />
      <KepalaHalaman
        judul={judul}
        ikon="fa-chart-line"
        keterangan={`${paketUrut.length} paket · ${profil.length} siswa kelas 9 · nilai 0–100 per subtes`}
        aksi={
          <>
            {!semua && (
              <Link href="/admin/tryout/statistik/semua" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                <i className="fas fa-layer-group" aria-hidden />
                Semua Tryout
              </Link>
            )}
            <UnduhExcelTryout
              namaFile={`Rekap_Tryout_${semua ? "Angkatan" : judul.replace(/^Statistik — /, "")}`.replace(/[^\w-]+/g, "_")}
              sheets={[{ nama: "Nilai per siswa", judul, kolom: kolomExcel, baris: barisExcel }]}
            />
          </>
        }
      />

      {paketUrut.length === 0 ? (
        <Kosong ikon="fa-chart-line" judul="Belum ada data" keterangan="Buat paket dan subtes dulu, lalu tunggu siswa mengerjakan." />
      ) : (
        <>
          <nav className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1">
            {TAB.map((t) => (
              <Link
                key={t.id}
                href={href({ tab: t.id })}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold ${
                  t.id === tab ? "bg-navy-800 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <i className={`fas ${t.ikon}`} aria-hidden />
                {t.label}
              </Link>
            ))}
          </nav>

          {tab !== "ringkasan" && tab !== "siswa" && (
            <Saring
              judul="Paket"
              pilihan={paketUrut.map((p) => ({ id: p.id, label: labelPaket(p) }))}
              aktif={paketDipilih?.id ?? null}
              href={(id) => href({ paket: id, subtes: null })}
            />
          )}

          {tab === "ringkasan" && (
            <TabRingkasan rows={rows} paketUrut={paketUrut} subtesSemua={subtesSemua} profil={profil} labelPaket={labelPaket} />
          )}

          {tab === "peringkat" && paketDipilih && (
            <>
              <Saring
                judul="Nilai"
                pilihan={[{ id: "", label: "Rata-rata paket" }, ...paketDipilih.subtes.map((s) => ({ id: s.kode, label: s.nama }))]}
                aktif={subtesDipilih ?? ""}
                href={(id) => href({ subtes: id || null })}
              />
              <Saring
                judul="Kelas"
                pilihan={[{ id: "", label: "Seluruh angkatan" }, ...kelasSemua.map((k) => ({ id: k, label: k }))]}
                aktif={kelasDipilih ?? ""}
                href={(id) => href({ kelas: id || null })}
              />
              <TabPeringkat profil={profil} paket={paketDipilih} kode={subtesDipilih} kelas={kelasDipilih} eventId={eventId} />
            </>
          )}

          {tab === "kelas" && paketDipilih && (
            <>
              <Saring
                judul="Nilai"
                pilihan={[{ id: "", label: "Rata-rata paket" }, ...paketDipilih.subtes.map((s) => ({ id: s.kode, label: s.nama }))]}
                aktif={subtesDipilih ?? ""}
                href={(id) => href({ subtes: id || null })}
              />
              <TabKelas profil={profil} paketUrut={paketUrut} paket={paketDipilih} kode={subtesDipilih} labelPaket={labelPaket} />
            </>
          )}

          {tab === "siswa" && (
            <>
              <Saring
                judul="Kelas"
                pilihan={[{ id: "", label: "Semua" }, ...kelasSemua.map((k) => ({ id: k, label: k }))]}
                aktif={kelasDipilih ?? ""}
                href={(id) => href({ kelas: id || null })}
              />
              <TabSiswa profil={profil} paketUrut={paketUrut} kelas={kelasDipilih} eventId={eventId} labelPaket={labelPaket} />
            </>
          )}

          {tab === "butir" && paketDipilih && (
            <div className="space-y-5">
              {paketDipilih.subtes.map((s) => (
                <Kartu key={s.mapelId}>
                  <h3 className="mb-3 font-semibold text-ink">
                    {s.nama} — {labelPaket(paketDipilih)}
                  </h3>
                  <AnalisisButir
                    mapelId={s.mapelId}
                    jenjang={9}
                    mapelNama={s.nama}
                    eventNama={`${paketDipilih.eventNama} - ${paketDipilih.nama}`}
                    tahunAjaran={tahunAjaranDariTanggal(tglAcuan)}
                  />
                </Kartu>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Saring({
  judul,
  pilihan,
  aktif,
  href,
}: {
  judul: string;
  pilihan: { id: string; label: string }[];
  aktif: string | null;
  href: (id: string) => string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{judul}:</span>
      {pilihan.map((p) => (
        <Link
          key={p.id || "semua"}
          href={href(p.id)}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            p.id === aktif ? "bg-navy-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TabRingkasan({
  rows,
  paketUrut,
  subtesSemua,
  profil,
  labelPaket,
}: {
  rows: Parameters<typeof ringkasSubtesPaket>[0];
  paketUrut: PaketRingkas[];
  subtesSemua: { kode: string; nama: string }[];
  profil: ProfilSiswaTryout[];
  labelPaket: (p: PaketRingkas) => string;
}) {
  // Rata-rata angkatan per subtes antar paket (+ rata paket bagi yang lengkap).
  const seri = [
    ...subtesSemua.map((s) => ({
      nama: s.nama,
      nilai: paketUrut.map((p) => {
        const st = p.subtes.find((x) => x.kode === s.kode);
        if (!st) return null;
        return rataRata(rows.filter((r) => r.mapel_id === st.mapelId && r.status === "selesai").map((r) => r.nilai_100));
      }),
    })),
    {
      nama: "Rata-rata paket",
      tebal: true,
      warna: "#0f172a",
      nilai: paketUrut.map((p) => rataRata(profil.map((s) => (s.paket[p.id]?.lengkap ? s.paket[p.id].rata : null)))),
    },
  ];

  // Naik/turun dari paket sebelumnya (siswa yang lengkap di dua paket berurutan).
  const naikTurun = paketUrut.slice(1).map((p, i) => {
    const sebelum = paketUrut[i];
    let naik = 0;
    let turun = 0;
    let tetap = 0;
    for (const s of profil) {
      const a = s.paket[sebelum.id];
      const b = s.paket[p.id];
      if (!a?.lengkap || !b?.lengkap || a.rata === null || b.rata === null) continue;
      if (b.rata - a.rata >= 0.05) naik++;
      else if (a.rata - b.rata >= 0.05) turun++;
      else tetap++;
    }
    return { label: `${sebelum.nama} → ${p.nama}`, naik, turun, tetap };
  });

  return (
    <div className="space-y-5">
      <Kartu>
        <GrafikGaris
          judul="Perkembangan rata-rata angkatan antar paket"
          kategori={paketUrut.map((p) => p.nama)}
          seri={seri}
        />
      </Kartu>

      {naikTurun.length > 0 && (
        <Kartu>
          <h3 className="mb-3 font-semibold text-ink">Siswa naik / turun dibanding paket sebelumnya</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {naikTurun.map((n) => (
              <div key={n.label} className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 truncate text-xs font-semibold text-slate-500">{n.label}</p>
                <div className="flex gap-3 text-sm">
                  <span className="font-bold text-emerald-700"><i className="fas fa-arrow-up mr-1" aria-hidden />{n.naik}</span>
                  <span className="font-bold text-red-700"><i className="fas fa-arrow-down mr-1" aria-hidden />{n.turun}</span>
                  <span className="font-bold text-slate-500"><i className="fas fa-minus mr-1" aria-hidden />{n.tetap}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Dihitung dari rata-rata paket, hanya siswa yang lengkap mengerjakan kedua paket.</p>
        </Kartu>
      )}

      {paketUrut.map((p) => {
        const ring = ringkasSubtesPaket(rows, p);
        const rataPaket = rataRata(profil.map((s) => (s.paket[p.id]?.lengkap ? s.paket[p.id].rata : null)));
        const lengkap = profil.filter((s) => s.paket[p.id]?.lengkap).length;
        return (
          <Kartu key={p.id}>
            <h3 className="mb-3 font-serif text-lg font-bold text-navy-900">{labelPaket(p)}</h3>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KartuNilai label="Rata-rata paket" nilai={fmt(rataPaket)} sub={`${lengkap} siswa lengkap`} />
              {ring.map((r) => (
                <KartuNilai
                  key={r.mapelId}
                  label={r.label}
                  nilai={fmt(r.rata)}
                  sub={`${r.peserta} selesai · min ${fmt(r.min)} · maks ${fmt(r.max)}`}
                  aksen="border-l-amber-500"
                />
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem]">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className={SEL}>Subtes</th>
                    <th className={SEL}>Selesai</th>
                    <th className={SEL}>Sedang</th>
                    <th className={SEL}>Belum</th>
                    <th className={SEL}>Rata</th>
                    <th className={SEL}>Min</th>
                    <th className={SEL}>Maks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ring.map((r) => (
                    <tr key={r.mapelId}>
                      <td className={`${TD} font-semibold`}>{r.label}</td>
                      <td className={TD}>{r.peserta}</td>
                      <td className={TD}>{r.mengerjakan}</td>
                      <td className={TD}>{r.belum}</td>
                      <td className={`${TD} font-bold`}>{fmt(r.rata)}</td>
                      <td className={TD}>{fmt(r.min)}</td>
                      <td className={TD}>{fmt(r.max)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Kartu>
        );
      })}
    </div>
  );
}

function TabPeringkat({
  profil,
  paket,
  kode,
  kelas,
  eventId,
}: {
  profil: ProfilSiswaTryout[];
  paket: PaketRingkas;
  kode: string | null;
  kelas: string | null;
  eventId: string;
}) {
  const daftar = peringkat(profil, paket.id, { kode, kelas });
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {paket.subtes.map((s) => {
          const top = peringkat(profil, paket.id, { kode: s.kode, kelas }).slice(0, 3);
          return (
            <Kartu key={s.kode}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Tertinggi {s.nama} {kelas ? `· ${kelas}` : "· angkatan"}
              </p>
              {top.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada nilai.</p>
              ) : (
                <ol className="space-y-1.5">
                  {top.map((t) => (
                    <li key={t.siswaId} className="flex items-center gap-2 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                        {t.peringkat}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink">{t.nama}</span>
                      <span className="text-xs text-slate-500">{t.kelas}</span>
                      <span className="font-bold tabular-nums text-navy-900">{fmt(t.nilai)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Kartu>
          );
        })}
      </div>

      <Kartu padat>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={SEL}>#</th>
                <th className={SEL}>Nama</th>
                <th className={SEL}>Kelas</th>
                <th className={SEL}>{kode ? paket.subtes.find((s) => s.kode === kode)?.nama : "Rata-rata"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {daftar.map((d) => (
                <tr key={d.siswaId}>
                  <td className={`${TD} font-bold`}>{d.peringkat}</td>
                  <td className={TD}>
                    <Link href={`/admin/tryout/statistik/${eventId}/siswa/${d.siswaId}`} className="hover:text-navy-700 hover:underline">
                      {d.nama}
                    </Link>
                    {!d.lengkap && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-700">belum lengkap</span>}
                  </td>
                  <td className={TD}>{d.kelas}</td>
                  <td className={`${TD} font-bold tabular-nums`}>{fmt(d.nilai)}</td>
                </tr>
              ))}
              {daftar.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">Belum ada nilai.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Kartu>
    </div>
  );
}

function TabKelas({
  profil,
  paketUrut,
  paket,
  kode,
  labelPaket,
}: {
  profil: ProfilSiswaTryout[];
  paketUrut: PaketRingkas[];
  paket: PaketRingkas;
  kode: string | null;
  labelPaket: (p: PaketRingkas) => string;
}) {
  const ring = rataPerKelas(profil, paket.id, kode);
  const kelasSemua = ring.map((r) => r.label);
  const seri = kelasSemua.map((k) => ({
    nama: k,
    nilai: paketUrut.map((p) => rataPerKelas(profil, p.id, kode).find((r) => r.label === k)?.rata ?? null),
  }));
  const namaNilai = kode ? paket.subtes.find((s) => s.kode === kode)?.nama : "rata-rata paket";
  return (
    <div className="space-y-5">
      <Kartu>
        <h3 className="mb-3 font-semibold text-ink">
          Rata-rata {namaNilai} per kelas — {labelPaket(paket)}
        </h3>
        <GrafikBatangMendatar
          baris={ring.map((r) => ({ label: r.label, nilai: r.rata, catatan: r.peserta ? `${r.peserta} siswa` : "belum ada" }))}
        />
      </Kartu>
      <Kartu>
        <GrafikGaris judul={`Perkembangan ${namaNilai} per kelas antar paket`} kategori={paketUrut.map((p) => p.nama)} seri={seri} />
      </Kartu>
      <Kartu padat>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={SEL}>Kelas</th>
                <th className={SEL}>Siswa dinilai</th>
                <th className={SEL}>Rata</th>
                <th className={SEL}>Min</th>
                <th className={SEL}>Maks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ring.map((r) => (
                <tr key={r.label}>
                  <td className={`${TD} font-semibold`}>{r.label}</td>
                  <td className={TD}>{r.peserta}</td>
                  <td className={`${TD} font-bold`}>{fmt(r.rata)}</td>
                  <td className={TD}>{fmt(r.min)}</td>
                  <td className={TD}>{fmt(r.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!kode && <p className="px-4 pb-3 text-xs text-slate-500">Rata-rata paket hanya dari siswa yang mengerjakan semua subtes paket.</p>}
      </Kartu>
    </div>
  );
}

function TabSiswa({
  profil,
  paketUrut,
  kelas,
  eventId,
  labelPaket,
}: {
  profil: ProfilSiswaTryout[];
  paketUrut: PaketRingkas[];
  kelas: string | null;
  eventId: string;
  labelPaket: (p: PaketRingkas) => string;
}) {
  const daftar = profil.filter((s) => !kelas || s.kelas === kelas);
  return (
    <Kartu padat>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={SEL}>Kelas</th>
              <th className={SEL}>Nama</th>
              {paketUrut.map((p) => (
                <th key={p.id} className={SEL} title={labelPaket(p)}>
                  {p.nama}
                </th>
              ))}
              <th className={SEL}>Terakhir</th>
              <th className={SEL}>Awal→Akhir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {daftar.map((s) => {
              const t = trenSiswa(s, paketUrut);
              return (
                <tr key={s.siswaId}>
                  <td className={TD}>{s.kelas}</td>
                  <td className={TD}>
                    <Link href={`/admin/tryout/statistik/${eventId}/siswa/${s.siswaId}`} className="font-semibold hover:text-navy-700 hover:underline">
                      {s.nama}
                    </Link>
                  </td>
                  {paketUrut.map((p) => {
                    const n = s.paket[p.id];
                    const isi = p.subtes.map((st) => `${st.nama}: ${fmt(n?.subtes[st.kode] ?? null)}`).join(" · ");
                    return (
                      <td key={p.id} className={`${TD} tabular-nums`} title={isi}>
                        {n?.rata === null || n === undefined ? (
                          <span className="text-slate-300">{n?.sedang ? "sedang" : "—"}</span>
                        ) : (
                          <span className={n.lengkap ? "font-bold" : "text-amber-700"}>{fmt(n.rata)}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={TD}>{t.terakhir ? <LencanaPerubahan {...t.terakhir} /> : <span className="text-slate-300">—</span>}</td>
                  <td className={TD}>{t.awalAkhir ? <LencanaPerubahan {...t.awalAkhir} /> : <span className="text-slate-300">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 pb-3 pt-2 text-xs text-slate-500">
        Angka = rata-rata subtes paket (arahkan kursor untuk rincian). Oranye = belum semua subtes dikerjakan. Klik nama untuk grafik per siswa.
      </p>
    </Kartu>
  );
}
