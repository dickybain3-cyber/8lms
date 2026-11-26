import Link from "next/link";
import { notFound } from "next/navigation";
import {
  aksesHalamanTryout,
  muatSubtesPaket,
  urlTryout,
  type PaketAdmin,
} from "@/lib/tryout-admin";
import { formatTanggalJamWib } from "@/lib/tryout";
import {
  FormPaket,
  FormTryout,
  SalinTeks,
  TombolHapusTryout,
} from "@/components/admin/Tryout/FormTryout";
import { Info, Kartu, KepalaHalaman, Kosong, Remah, TOMBOL_BIASA } from "@/components/ui/Panel";

export const dynamic = "force-dynamic";

function statusPaket(p: PaketAdmin): { teks: string; kelas: string } {
  const now = Date.now();
  if (!p.aktif) return { teks: "Nonaktif", kelas: "bg-slate-100 text-slate-500" };
  if (now < new Date(p.waktu_mulai).getTime()) return { teks: "Terjadwal", kelas: "bg-blue-50 text-blue-700" };
  if (now > new Date(p.waktu_selesai).getTime()) return { teks: "Selesai", kelas: "bg-slate-100 text-slate-600" };
  return { teks: "Dibuka", kelas: "bg-emerald-50 text-emerald-700" };
}

export default async function HalamanDetailTryout(props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const akses = await aksesHalamanTryout();
  if (!akses.ok) return <Info nada="peringatan">{akses.pesan}</Info>;
  const db = akses.db;

  const { data: event } = await db
    .from("event")
    .select("id, nama, tgl_mulai, tgl_selesai, jenis")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || event.jenis !== "tryout") notFound();

  const { data: paketData } = await db
    .from("tryout_paket")
    .select("id, nama, urutan, token, waktu_mulai, waktu_selesai, aktif")
    .eq("event_id", eventId)
    .order("urutan");
  const paket = (paketData ?? []) as PaketAdmin[];
  const subtes = await muatSubtesPaket(db, paket.map((p) => p.id));

  // Peserta yang sudah mulai per paket.
  const mapelIds = Object.values(subtes).flat().map((s) => s.id);
  const { data: jawab } = mapelIds.length
    ? await db.from("jawaban_siswa").select("siswa_id, mapel_id, submitted_at").in("mapel_id", mapelIds)
    : { data: [] };
  const mapelKePaket = new Map<string, string>();
  for (const [pid, list] of Object.entries(subtes)) for (const s of list) mapelKePaket.set(s.id, pid);
  const peserta: Record<string, Set<string>> = {};
  for (const j of (jawab ?? []) as { siswa_id: string; mapel_id: string }[]) {
    const pid = mapelKePaket.get(j.mapel_id);
    if (pid) (peserta[pid] ??= new Set()).add(j.siswa_id);
  }

  const link = await urlTryout(eventId);

  return (
    <div>
      <Remah href="/admin/tryout" label="Semua tryout" />
      <KepalaHalaman
        judul={event.nama}
        ikon="fa-flag-checkered"
        keterangan={`${paket.length} paket · peserta kelas 9.1–9.6`}
        aksi={
          <>
            <Link href={`/admin/tryout/statistik/${eventId}`} className={TOMBOL_BIASA}>
              <i className="fas fa-chart-line" aria-hidden />
              Statistik
            </Link>
            <TombolHapusTryout eventId={eventId} nama={event.nama} />
          </>
        }
      />

      <Kartu className="mb-5">
        <p className="mb-2 text-sm font-semibold text-ink">Link untuk siswa (berlaku untuk semua paket)</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-slate-100 px-3 py-2.5 text-sm text-ink">{link}</code>
          <SalinTeks teks={link} label="Salin Link" />
          <a href={link} target="_blank" rel="noreferrer" className={TOMBOL_BIASA}>
            <i className="fas fa-arrow-up-right-from-square" aria-hidden />
            Buka
          </a>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Bagikan link ini bersama token paket. Siswa: masukkan token → pilih kelas → pilih nama → kerjakan subtes.
        </p>
      </Kartu>

      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-3">
          <h2 className="font-serif text-lg font-bold text-navy-900">Paket Tryout</h2>
          {paket.length === 0 ? (
            <Kosong ikon="fa-layer-group" judul="Belum ada paket" keterangan="Buat paket lewat formulir di samping. Tiap paket punya token sendiri." />
          ) : (
            paket.map((p) => {
              const st = statusPaket(p);
              const list = subtes[p.id] ?? [];
              return (
                <Link
                  key={p.id}
                  href={`/admin/tryout/${eventId}/paket/${p.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-navy-300"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{p.nama}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatTanggalJamWib(p.waktu_mulai)} – {formatTanggalJamWib(p.waktu_selesai)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-navy-900 px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-white">
                        {p.token}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.kelas}`}>{st.teks}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {list.length === 0 ? (
                      <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-600">Belum ada subtes</span>
                    ) : (
                      list.map((s) => (
                        <span
                          key={s.id}
                          className={`rounded-full px-2.5 py-1 font-semibold ${
                            s.jumlahSoal === 0 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {s.nama} · {s.jumlahSoal} soal · {s.durasi_menit}′
                        </span>
                      ))
                    )}
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                      {peserta[p.id]?.size ?? 0} peserta
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <div className="space-y-5">
          <Kartu>
            <h2 className="mb-4 font-serif text-lg font-bold text-navy-900">Buat Paket</h2>
            <FormPaket eventId={eventId} saranNama={`Paket Tryout ${paket.length + 1}`} />
          </Kartu>
          <Kartu>
            <h2 className="mb-4 font-serif text-lg font-bold text-navy-900">Ubah Tryout</h2>
            <FormTryout eventId={eventId} awal={{ nama: event.nama, tgl_mulai: event.tgl_mulai, tgl_selesai: event.tgl_selesai }} />
          </Kartu>
        </div>
      </div>
    </div>
  );
}
