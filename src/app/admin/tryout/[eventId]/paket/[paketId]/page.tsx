import Link from "next/link";
import { notFound } from "next/navigation";
import { getSesiGuru } from "@/lib/admin-guard";
import { aksesHalamanTryout, muatSubtesPaket, urlTryout } from "@/lib/tryout-admin";
import { formatTanggalJamWib } from "@/lib/tryout";
import { isoKeDatetimeLocalWib } from "@/lib/waktu-wib";
import {
  EditSubtesInline,
  FormPaket,
  FormSubtesBaru,
  SalinTeks,
  TombolAcakToken,
  TombolHapusPaket,
} from "@/components/admin/Tryout/FormTryout";
import {
  BarisStatistik,
  Info,
  Kartu,
  KepalaHalaman,
  Kosong,
  Remah,
  Statistik,
  TOMBOL_BIASA,
  TOMBOL_UTAMA,
} from "@/components/ui/Panel";

export const dynamic = "force-dynamic";

export default async function HalamanPaket(props: {
  params: Promise<{ eventId: string; paketId: string }>;
  searchParams: Promise<{ pesan?: string }>;
}) {
  const { eventId, paketId } = await props.params;
  const { pesan } = await props.searchParams;
  const akses = await aksesHalamanTryout();
  if (!akses.ok) return <Info nada="peringatan">{akses.pesan}</Info>;
  const db = akses.db;

  const [{ data: paket }, { data: event }, sesi] = await Promise.all([
    db
      .from("tryout_paket")
      .select("id, nama, urutan, token, waktu_mulai, waktu_selesai, aktif, event_id")
      .eq("id", paketId)
      .eq("event_id", eventId)
      .maybeSingle(),
    db.from("event").select("id, nama").eq("id", eventId).maybeSingle(),
    getSesiGuru(),
  ]);
  if (!paket || !event) notFound();

  const subtes = (await muatSubtesPaket(db, [paketId]))[paketId] ?? [];
  const { data: jawab } = subtes.length
    ? await db
        .from("jawaban_siswa")
        .select("siswa_id, mapel_id, submitted_at")
        .in("mapel_id", subtes.map((s) => s.id))
    : { data: [] };
  const { count: jumlahSiswa } = await db
    .from("siswa")
    .select("id, kelas!inner(tingkat)", { count: "exact", head: true })
    .eq("kelas.tingkat", 9);

  const perSubtes: Record<string, { selesai: number; mengerjakan: number }> = {};
  for (const j of (jawab ?? []) as { mapel_id: string; submitted_at: string | null }[]) {
    const p = (perSubtes[j.mapel_id] ??= { selesai: 0, mengerjakan: 0 });
    if (j.submitted_at) p.selesai++;
    else p.mengerjakan++;
  }
  const pesertaUnik = new Set(((jawab ?? []) as { siswa_id: string }[]).map((j) => j.siswa_id)).size;

  // Halaman soal memakai jalur mapel biasa; admin dari jenjang lain butuh ?jenjang=9.
  const qsJenjang = sesi.jenjang === 9 ? "" : "?jenjang=9";
  const link = await urlTryout(eventId);

  return (
    <div>
      <Remah href={`/admin/tryout/${eventId}`} label={event.nama} />
      <KepalaHalaman
        judul={paket.nama}
        ikon="fa-layer-group"
        keterangan={`${formatTanggalJamWib(paket.waktu_mulai)} – ${formatTanggalJamWib(paket.waktu_selesai)}${paket.aktif ? "" : " · NONAKTIF"}`}
        aksi={
          <>
            <Link href={`/admin/tryout/statistik/${eventId}?paket=${paketId}`} className={TOMBOL_BIASA}>
              <i className="fas fa-chart-line" aria-hidden />
              Statistik
            </Link>
            <TombolHapusPaket eventId={eventId} paketId={paketId} nama={paket.nama} />
          </>
        }
      />

      {pesan === "subtes-gagal" && (
        <Info nada="peringatan">Paket dibuat, tetapi subtes bawaan gagal dibuat. Tambahkan lewat formulir di bawah.</Info>
      )}

      <Kartu className="mb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Token paket</p>
            <p className="font-mono text-3xl font-extrabold tracking-[0.3em] text-navy-900">{paket.token}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SalinTeks teks={paket.token} label="Salin Token" />
            <SalinTeks teks={`${paket.nama}\nLink: ${link}\nToken: ${paket.token}`} label="Salin Pengumuman" />
            <TombolAcakToken eventId={eventId} paketId={paketId} />
          </div>
        </div>
      </Kartu>

      <BarisStatistik>
        <Statistik label="Subtes" nilai={subtes.length} ikon="fa-list-check" />
        <Statistik label="Total soal" nilai={subtes.reduce((a, s) => a + s.jumlahSoal, 0)} ikon="fa-circle-question" warna="emas" />
        <Statistik label="Siswa ikut" nilai={pesertaUnik} ikon="fa-users" warna="hijau" catatan={`dari ${jumlahSiswa ?? 0} siswa kelas 9`} />
        <Statistik label="Status" nilai={paket.aktif ? "Aktif" : "Nonaktif"} ikon="fa-toggle-on" warna="abu" />
      </BarisStatistik>

      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-3">
          <h2 className="font-serif text-lg font-bold text-navy-900">Subtes</h2>
          {subtes.length === 0 ? (
            <Kosong ikon="fa-list-check" judul="Belum ada subtes" keterangan="Tambahkan Bahasa Indonesia, Matematika, atau subtes lain." />
          ) : (
            subtes.map((s) => {
              const p = perSubtes[s.id] ?? { selesai: 0, mengerjakan: 0 };
              return (
                <Kartu key={s.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{s.nama}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {s.durasi_menit} menit · {s.jumlahSoal} soal · total skor {s.totalSkor.toLocaleString("id-ID")}
                        {" · "}
                        <span className="text-emerald-700">{p.selesai} selesai</span>
                        {p.mengerjakan > 0 && <span className="text-amber-700"> · {p.mengerjakan} sedang</span>}
                      </p>
                      {s.jumlahSoal === 0 && (
                        <p className="mt-1 text-xs font-semibold text-red-600">Belum ada soal — siswa belum bisa mulai.</p>
                      )}
                    </div>
                    <Link href={`/admin/event/${eventId}/mapel/${s.id}${qsJenjang}`} className={TOMBOL_UTAMA}>
                      <i className="fas fa-file-arrow-up" aria-hidden />
                      Kelola Soal / Unggah JSON
                    </Link>
                  </div>
                  <div className="mt-3">
                    <EditSubtesInline
                      eventId={eventId}
                      paketId={paketId}
                      mapelId={s.id}
                      nama={s.nama}
                      durasi={s.durasi_menit}
                      adaPeserta={p.selesai + p.mengerjakan > 0}
                    />
                  </div>
                </Kartu>
              );
            })
          )}

          <Kartu>
            <h3 className="mb-3 font-semibold text-ink">Tambah Subtes</h3>
            <FormSubtesBaru eventId={eventId} paketId={paketId} sudahAda={subtes.map((s) => s.tryout_subtes)} />
          </Kartu>
        </div>

        <Kartu>
          <h2 className="mb-4 font-serif text-lg font-bold text-navy-900">Pengaturan Paket</h2>
          <FormPaket
            eventId={eventId}
            paket={{
              id: paket.id,
              nama: paket.nama,
              token: paket.token,
              waktu_mulai_lokal: isoKeDatetimeLocalWib(paket.waktu_mulai),
              waktu_selesai_lokal: isoKeDatetimeLocalWib(paket.waktu_selesai),
              aktif: paket.aktif,
            }}
          />
        </Kartu>
      </div>
    </div>
  );
}
