import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSesiGuru } from "@/lib/admin-guard";
import { parseJenjang, JENJANG_LABEL, type Jenjang } from "@/lib/jenjang";
import { daftarEventAdmin, type EventAdmin } from "@/lib/supabase/admin-multi-event";
import {
  Info,
  KepalaHalaman,
  Kosong,
  TOMBOL_UTAMA,
} from "@/components/ui/Panel";

/**
 * Daftar event.
 *
 * Jalur GURU sepenuhnya tidak berubah: cookie-bound `createClient()`,
 * hanya melihat jenjang tempat dia login. `?jenjang=` di URL diabaikan
 * total untuknya — nilai dari browser tidak pernah menjadi hak akses.
 *
 * Jalur ADMIN (baru): kalau `?jenjang=` ada di URL dan `sesi.isAdmin`,
 * daftar dibaca lewat service_role ke project jenjang itu. Ini mata rantai
 * yang selama ini hilang — lihat catatan panjang di
 * `src/components/admin/JenjangSwitcherGlobal.tsx` soal kenapa tanpa
 * halaman ini, saklar jenjang di halaman input soal tidak pernah bisa
 * dijangkau.
 *
 * `?jenjang=` diteruskan ke tautan detail event supaya konteksnya tidak
 * hilang satu klik kemudian.
 */
function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function EventListPage({
  searchParams,
}: {
  searchParams: { jenjang?: string };
}) {
  const sesi = await getSesiGuru();
  const jenjangQuery = parseJenjang(searchParams.jenjang);

  if (sesi.isAdmin && jenjangQuery !== null) {
    return <DaftarEventAdmin jenjang={jenjangQuery} />;
  }

  return <DaftarEventGuru />;
}

// ---------------------------------------------------------------------------

async function DaftarEventGuru() {
  const supabase = createClient();
  const { data: events, error } = await supabase
    .from("event")
    .select("id, nama, tgl_mulai, tgl_selesai, kelas_utama, mapel(count)")
    .order("tgl_mulai", { ascending: false });

  const daftar: EventAdmin[] = (events ?? []).map((event) => ({
    id: event.id,
    nama: event.nama,
    tgl_mulai: event.tgl_mulai,
    tgl_selesai: event.tgl_selesai,
    kelas_utama: Number(event.kelas_utama),
    jumlah_mapel: Array.isArray(event.mapel)
      ? ((event.mapel[0] as { count: number } | undefined)?.count ?? 0)
      : 0,
  }));

  return (
    <IsiDaftarEvent
      daftar={daftar}
      error={error ? "Gagal memuat daftar event." : null}
      jenjang={null}
    />
  );
}

async function DaftarEventAdmin({ jenjang }: { jenjang: Jenjang }) {
  let daftar: EventAdmin[] = [];
  let error: string | null = null;

  try {
    daftar = await daftarEventAdmin(jenjang);
  } catch (e) {
    error =
      e instanceof Error
        ? `Gagal memuat event ${JENJANG_LABEL[jenjang]}: ${e.message}`
        : "Gagal memuat daftar event.";
  }

  return <IsiDaftarEvent daftar={daftar} error={error} jenjang={jenjang} />;
}

// ---------------------------------------------------------------------------

function IsiDaftarEvent({
  daftar,
  error,
  jenjang,
}: {
  daftar: EventAdmin[];
  error: string | null;
  /** null = jalur guru (satu jenjang, dari cookie). */
  jenjang: Jenjang | null;
}) {
  const suffix = jenjang ? `?jenjang=${jenjang}` : "";
  const sekarang = Date.now();

  return (
    <div>
      <KepalaHalaman
        judul="Kegiatan"
        ikon="fa-calendar-days"
        keterangan={
          jenjang
            ? `Menampilkan data ${JENJANG_LABEL[jenjang]} — ganti lewat saklar di bilah atas.`
            : "Ulangan, PTS, PAS, dan kegiatan penilaian lainnya."
        }
        aksi={
          /*
            Tombol buat kegiatan SENGAJA tidak muncul saat admin sedang
            melihat jenjang lain. Membuatnya butuh jalur tulis yang belum
            ada untuk lintas jenjang (form-nya memakai `createClient()`
            cookie-bound), jadi menampilkan tombolnya akan menjanjikan
            sesuatu yang berakhir menulis ke project yang salah.
          */
          !jenjang ? (
            <Link href="/admin/event/baru" className={TOMBOL_UTAMA}>
              <i className="fas fa-plus" aria-hidden />
              Buat Kegiatan
            </Link>
          ) : undefined
        }
      />

      {jenjang && (
        <Info nada="info">
          Kamu sedang melihat database {JENJANG_LABEL[jenjang]}. Menambah
          &amp; mengedit SOAL di sini sudah bisa. Membuat kegiatan atau
          mapel baru dilakukan sambil login di jenjang tersebut.
        </Info>
      )}

      {error && (
        <Info nada="peringatan">{error}</Info>
      )}

      {!error && daftar.length === 0 ? (
        <Kosong
          ikon="fa-calendar-plus"
          judul={`Belum ada kegiatan${jenjang ? ` di ${JENJANG_LABEL[jenjang].toLowerCase()}` : ""}`}
          keterangan="Kegiatan adalah wadah untuk satu rangkaian penilaian — misalnya 'PAS Ganjil 2025'. Di dalamnya baru ada mata pelajaran dan soal-soalnya."
          aksi={
            !jenjang ? (
              <Link href="/admin/event/baru" className={TOMBOL_UTAMA}>
                <i className="fas fa-plus" aria-hidden />
                Buat Kegiatan Pertama
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {daftar.map((event) => {
            const mulai = new Date(event.tgl_mulai).getTime();
            const selesai = new Date(event.tgl_selesai).getTime();
            const berjalan = mulai <= sekarang && selesai >= sekarang;
            const usai = selesai < sekarang;
            const kosong = event.jumlah_mapel === 0;

            return (
              <Link
                key={event.id}
                href={`/admin/event/${event.id}${suffix}`}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-[--primary] hover:shadow-lg hover:shadow-blue-600/10"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h2 className="min-w-0 font-serif text-lg font-bold leading-snug text-ink">
                    {event.nama}
                  </h2>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wide ${
                      berjalan
                        ? "bg-emerald-100 text-emerald-700"
                        : usai
                          ? "bg-slate-100 text-slate-500"
                          : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {berjalan ? "Berjalan" : usai ? "Selesai" : "Terjadwal"}
                  </span>
                </div>

                <p className="flex items-center gap-1.5 text-sm text-slate-500">
                  <i className="fas fa-calendar text-xs" aria-hidden />
                  {formatTanggal(event.tgl_mulai)} –{" "}
                  {formatTanggal(event.tgl_selesai)}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  <span className="rounded-full bg-teal/10 px-2.5 py-1 text-[0.68rem] font-semibold text-teal">
                    Kelas {event.kelas_utama}
                  </span>
                  {/*
                    Kegiatan tanpa mapel adalah kegiatan yang belum bisa
                    dipakai sama sekali. Versi lama menulisnya sebagai
                    "0 mapel" dengan warna abu redup — benar, tapi persis
                    sama tampilannya dengan kegiatan yang sudah siap.
                  */}
                  <span
                    className={`rounded-full px-2.5 py-1 text-[0.68rem] font-semibold ${
                      kosong
                        ? "bg-red-50 text-red-600"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {kosong ? (
                      <>
                        <i
                          className="fas fa-triangle-exclamation mr-1"
                          aria-hidden
                        />
                        Belum ada mapel
                      </>
                    ) : (
                      `${event.jumlah_mapel} mapel`
                    )}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
