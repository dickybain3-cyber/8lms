import { notFound } from "next/navigation";
import { aksesHalamanTryout, muatRekapTryout } from "@/lib/tryout-admin";
import {
  daftarPaket,
  daftarSubtes,
  formatTanggalJamWib,
  peringkat,
  profilSiswa,
  trenSiswa,
} from "@/lib/tryout";
import GrafikGaris, { LencanaPerubahan } from "@/components/tryout/GrafikGaris";
import { KartuNilai, fmt } from "@/components/admin/Statistik/Grafik";
import { TombolResetSubtes } from "@/components/admin/Tryout/FormTryout";
import { Info, Kartu, KepalaHalaman, Remah } from "@/components/ui/Panel";

export const dynamic = "force-dynamic";

const SEL = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
const TD = "px-3 py-2 text-sm text-ink";

export default async function HalamanStatistikSiswa(props: {
  params: Promise<{ eventId: string; siswaId: string }>;
}) {
  const { eventId, siswaId } = await props.params;
  const semua = eventId === "semua";
  const akses = await aksesHalamanTryout();
  if (!akses.ok) return <Info nada="peringatan">{akses.pesan}</Info>;

  const rekap = await muatRekapTryout(akses.db, semua ? null : eventId);
  if (!rekap.ok) return <Info nada="peringatan">{rekap.pesan}</Info>;
  const rows = rekap.baris;
  const paketUrut = daftarPaket(rows);
  const semuaProfil = profilSiswa(rows);
  const s = semuaProfil.find((p) => p.siswaId === siswaId);
  if (!s) notFound();
  const subtes = daftarSubtes(rows);
  const barisSiswa = rows.filter((r) => r.siswa_id === siswaId);

  const tren = trenSiswa(s, paketUrut);
  const seri = [
    ...subtes.map((st) => ({ nama: st.nama, nilai: trenSiswa(s, paketUrut, st.kode).titik.map((t) => t.nilai) })),
    { nama: "Rata-rata paket", tebal: true, warna: "#0f172a", nilai: tren.titik.map((t) => t.nilai) },
  ];
  const terakhir = [...tren.titik].reverse().find((t) => t.nilai !== null);

  return (
    <div>
      <Remah href={`/admin/tryout/statistik/${eventId}?tab=siswa`} label="Statistik per siswa" />
      <KepalaHalaman judul={s.nama} ikon="fa-user-graduate" keterangan={`Kelas ${s.kelas} · ${paketUrut.length} paket`} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KartuNilai label="Nilai paket terakhir" nilai={fmt(terakhir?.nilai ?? null)} />
        <KartuNilai
          label="Dibanding paket sebelumnya"
          nilai={tren.terakhir ? <LencanaPerubahan {...tren.terakhir} /> : "—"}
          aksen="border-l-amber-500"
        />
        <KartuNilai
          label="Paket pertama → terakhir"
          nilai={tren.awalAkhir ? <LencanaPerubahan {...tren.awalAkhir} /> : "—"}
          aksen="border-l-emerald-500"
        />
        <KartuNilai
          label="Paket dikerjakan"
          nilai={`${paketUrut.filter((p) => s.paket[p.id]?.rata !== null && s.paket[p.id] !== undefined).length}/${paketUrut.length}`}
          aksen="border-l-slate-400"
        />
      </div>

      <Kartu className="mb-5">
        <GrafikGaris judul="Grafik peningkatan nilai" kategori={paketUrut.map((p) => p.nama)} seri={seri} />
      </Kartu>

      <Kartu padat>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={SEL}>Paket</th>
                <th className={SEL}>Subtes</th>
                <th className={SEL}>Status</th>
                <th className={SEL}>Nilai</th>
                <th className={SEL}>Skor</th>
                <th className={SEL}>Peringkat angkatan</th>
                <th className={SEL}>Dikumpulkan</th>
                <th className={SEL}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paketUrut.map((p) =>
                p.subtes.map((st, i) => {
                  const r = barisSiswa.find((b) => b.mapel_id === st.mapelId);
                  const rank = peringkat(semuaProfil, p.id, { kode: st.kode }).find((x) => x.siswaId === siswaId);
                  const total = peringkat(semuaProfil, p.id, { kode: st.kode }).length;
                  return (
                    <tr key={st.mapelId}>
                      <td className={`${TD} font-semibold`}>{i === 0 ? (semua ? `${p.nama} (${p.eventNama})` : p.nama) : ""}</td>
                      <td className={TD}>{st.nama}</td>
                      <td className={TD}>
                        {r?.status === "selesai" ? (
                          <span className="text-emerald-700">Selesai</span>
                        ) : r?.status === "mengerjakan" ? (
                          <span className="text-amber-700">Sedang</span>
                        ) : (
                          <span className="text-slate-400">Belum</span>
                        )}
                      </td>
                      <td className={`${TD} font-bold tabular-nums`}>{fmt(r?.nilai_100 ?? null)}</td>
                      <td className={`${TD} tabular-nums text-slate-500`}>
                        {r?.total_skor === null || r?.total_skor === undefined ? "—" : `${fmt(r.total_skor)} / ${fmt(r.skor_maks)}`}
                      </td>
                      <td className={TD}>{rank ? `${rank.peringkat} dari ${total}` : "—"}</td>
                      <td className={`${TD} text-xs text-slate-500`}>{r?.submitted_at ? formatTanggalJamWib(r.submitted_at) : "—"}</td>
                      <td className={TD}>
                        {r && r.status !== "belum" && (
                          <TombolResetSubtes eventId={p.eventId} mapelId={st.mapelId} siswaId={siswaId} label={`${st.nama} ${p.nama} milik ${s.nama}`} />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Kartu>
    </div>
  );
}
