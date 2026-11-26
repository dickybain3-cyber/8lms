import Link from "next/link";
import { aksesHalamanTryout } from "@/lib/tryout-admin";
import { FormTryout } from "@/components/admin/Tryout/FormTryout";
import { Info, Kartu, KepalaHalaman, Kosong, TOMBOL_BIASA } from "@/components/ui/Panel";

export const dynamic = "force-dynamic";

function tgl(iso: string) {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function HalamanDaftarTryout() {
  const akses = await aksesHalamanTryout();
  if (!akses.ok) {
    return (
      <div>
        <KepalaHalaman judul="Tryout Kelas 9" ikon="fa-flag-checkered" />
        <Info nada="peringatan">{akses.pesan}</Info>
      </div>
    );
  }

  const { data, error } = await akses.db
    .from("event")
    .select("id, nama, tgl_mulai, tgl_selesai, tryout_paket(count)")
    .eq("jenis", "tryout")
    .order("tgl_mulai", { ascending: false });

  const daftar = (data ?? []) as unknown as {
    id: string;
    nama: string;
    tgl_mulai: string;
    tgl_selesai: string;
    tryout_paket: { count: number }[];
  }[];

  return (
    <div>
      <KepalaHalaman
        judul="Tryout Kelas 9"
        ikon="fa-flag-checkered"
        keterangan="Siswa masuk lewat link + token paket, pilih kelas dan nama — tanpa password."
        aksi={
          <Link href="/admin/tryout/statistik/semua" className={TOMBOL_BIASA}>
            <i className="fas fa-chart-line" aria-hidden />
            Statistik Angkatan
          </Link>
        }
      />

      {error && (
        <Info nada="peringatan">
          Tabel tryout belum ada di database kelas 9. Jalankan migrasi <code>0029_tryout.sql</code> dulu.
        </Info>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          {daftar.length === 0 ? (
            <Kosong ikon="fa-flag-checkered" judul="Belum ada tryout" keterangan="Buat tryout pertama lewat formulir di samping." />
          ) : (
            daftar.map((e) => (
              <Link
                key={e.id}
                href={`/admin/tryout/${e.id}`}
                className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-navy-300"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                  <i className="fas fa-flag-checkered" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{e.nama}</span>
                  <span className="block text-xs text-slate-500">
                    {tgl(e.tgl_mulai)} – {tgl(e.tgl_selesai)}
                  </span>
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {e.tryout_paket?.[0]?.count ?? 0} paket
                </span>
              </Link>
            ))
          )}
        </div>

        <Kartu>
          <h2 className="mb-4 font-serif text-lg font-bold text-navy-900">Buat Tryout</h2>
          <FormTryout />
        </Kartu>
      </div>
    </div>
  );
}
