import Link from "next/link";
import { getSesiGuru } from "@/lib/admin-guard";
import { parseJenjang } from "@/lib/jenjang";
import {
  detailEventAdmin,
  siswaSemuaJenjangUntukDenah,
} from "@/lib/supabase/admin-multi-event";
import type { SiswaDenah } from "@/lib/denah";
import RuangClient from "./RuangClient";

/**
 * /admin/event/[eventId]/ruang — "PEMBAGIAN RUANG UJIAN".
 *
 * Berbeda dari /admin/denah (yang berdiri sendiri, tidak terikat event
 * mana pun), halaman ini dibuka DARI dalam satu kegiatan, jadi nama
 * kegiatannya sudah terisi otomatis di kartu peserta dan daftar hadir —
 * panitia tidak perlu mengetik ulang nama yang sudah ada di halaman
 * sebelumnya.
 *
 * KENAPA TETAP BUTUH ?jenjang= DI URL
 * Event hidup di SATU project jenjang. Untuk membaca namanya kembali
 * (dan memverifikasi eventnya memang ada), halaman ini perlu tahu
 * project mana yang dituju — sama seperti /admin/event/[eventId]?jenjang=
 * yang sudah ada. Siswa yang DIACAK di halaman ini tetap datang dari
 * KETIGA project (lihat siswaSemuaJenjangUntukDenah), karena maksud
 * fitur ini justru memasangkan siswa lintas tingkat/lintas project.
 *
 * KENAPA ADMIN-ONLY
 * Sama seperti /admin/denah: memasangkan siswa lintas jenjang berarti
 * membaca 3 database sekaligus lewat service_role, yang cuma boleh
 * dipanggil setelah `sesi.isAdmin` diverifikasi.
 */
export default async function RuangEventPage({
  params,
  searchParams,
}: {
  params: { eventId: string };
  searchParams: { jenjang?: string };
}) {
  const sesi = await getSesiGuru();

  if (!sesi.isAdmin) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-2 font-serif text-2xl text-ink">
          Pembagian Ruang Ujian
        </h1>
        <p className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm text-ink/70">
          Menu ini menyusun tempat duduk dari ketiga jenjang sekaligus, jadi
          hanya bisa dibuka akun admin. Kamu login sebagai guru
          {sesi.jenjang ? ` kelas ${sesi.jenjang}` : ""}.
        </p>
        <Link
          href={`/admin/event/${params.eventId}`}
          className="mt-4 inline-block text-sm font-medium text-teal hover:underline"
        >
          ← Kembali ke kegiatan
        </Link>
      </div>
    );
  }

  const jenjangEvent = parseJenjang(searchParams.jenjang);
  let namaEventAwal = "Ujian";
  let eventTidakDitemukan = false;

  if (jenjangEvent) {
    const { event } = await detailEventAdmin(jenjangEvent, params.eventId);
    if (event) {
      namaEventAwal = event.nama;
    } else {
      eventTidakDitemukan = true;
    }
  }

  const hasil = await siswaSemuaJenjangUntukDenah();

  const siswa: SiswaDenah[] = hasil.flatMap((h) =>
    h.data.map((s) => ({
      id: `${h.jenjang}:${s.id}`,
      nama: s.nama,
      username: s.username,
      kelasNama: s.kelasNama,
      tingkat: s.tingkat,
    }))
  );

  const gagal = hasil
    .filter((h) => h.error)
    .map((h) => ({ jenjang: h.jenjang, pesan: h.error as string }));

  return (
    <div className="space-y-4">
      <Link
        href={
          jenjangEvent
            ? `/admin/event/${params.eventId}?jenjang=${jenjangEvent}`
            : `/admin/event/${params.eventId}`
        }
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-ink"
      >
        <i className="fas fa-arrow-left text-xs" aria-hidden />
        Kembali ke kegiatan
      </Link>

      {eventTidakDitemukan && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          Kegiatan ini tidak ditemukan di database yang diminta — nama
          kegiatan di bawah tidak terisi otomatis, tapi kamu tetap bisa
          mengisinya sendiri.
        </div>
      )}

      <RuangClient
        eventId={params.eventId}
        namaEventAwal={namaEventAwal}
        siswa={siswa}
        gagal={gagal}
      />
    </div>
  );
}
