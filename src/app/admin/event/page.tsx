import Link from "next/link";
import { getSesiGuru } from "@/lib/admin-guard";
import { parseJenjang, JENJANG_LABEL, type Jenjang } from "@/lib/jenjang";
import { daftarEventAdmin, type EventAdmin } from "@/lib/supabase/admin-multi-event";
import { muatEventSesi } from "@/lib/event-sesi";
import DaftarEventKelompok from "@/components/admin/DaftarEventKelompok";
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
  const { daftar, error } = await muatEventSesi();

  return <IsiDaftarEvent daftar={daftar} error={error} jenjang={null} />;
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
        <DaftarEventKelompok daftar={daftar} jenjang={jenjang} />
      )}
    </div>
  );
}
