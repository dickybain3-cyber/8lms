import Link from "next/link";
import type { EventAdmin } from "@/lib/supabase/admin-multi-event";
import type { Jenjang } from "@/lib/jenjang";
import { definisiJenisEvent } from "@/lib/jenis-event";
import {
  kelompokkanEvent,
  URUTAN_STATUS,
  type StatusEvent,
} from "@/lib/event-status";

/**
 * Daftar kegiatan yang dikelompokkan menurut status:
 *   Sedang berlangsung → Akan datang → Selesai
 *
 * Dipakai di halaman daftar kegiatan DAN di dashboard, supaya urutan dan
 * tampilannya tidak bisa berbeda antar halaman.
 *
 * Kegiatan yang sudah selesai TIDAK disembunyikan — hanya turun ke bawah.
 * Di jalur guru, kartunya diberi tombol "Buka ulang" yang langsung
 * membuka form edit tanggal, untuk keperluan ujian susulan.
 */

function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

const JUDUL_KELOMPOK: Record<StatusEvent, string> = {
  berjalan: "Sedang berlangsung",
  terjadwal: "Akan datang",
  selesai: "Selesai",
};

const BADGE_STATUS: Record<StatusEvent, { kelas: string; label: string }> = {
  berjalan: { kelas: "bg-emerald-100 text-emerald-700", label: "Berjalan" },
  terjadwal: { kelas: "bg-amber-100 text-amber-700", label: "Terjadwal" },
  selesai: { kelas: "bg-slate-100 text-slate-500", label: "Selesai" },
};

export default function DaftarEventKelompok({
  daftar,
  jenjang,
  batasSelesai,
}: {
  daftar: EventAdmin[];
  /** null = jalur guru (satu jenjang, dari cookie). */
  jenjang: Jenjang | null;
  /**
   * Batasi jumlah kegiatan SELESAI yang ditampilkan (yang terbaru dulu),
   * sisanya diarahkan ke halaman daftar penuh. Dipakai di dashboard supaya
   * tidak memanjang seiring bertambahnya riwayat. Kosong = tampilkan semua.
   */
  batasSelesai?: number;
}) {
  const suffix = jenjang ? `?jenjang=${jenjang}` : "";
  const bisaEdit = !jenjang; // tombol edit event hanya ada di jalur guru
  const kelompok = kelompokkanEvent(daftar);

  return (
    <div className="space-y-8">
      {URUTAN_STATUS.map((status) => {
        const semua = kelompok[status];
        if (semua.length === 0) return null;

        const dipotong =
          status === "selesai" &&
          batasSelesai !== undefined &&
          semua.length > batasSelesai;
        const tampil = dipotong ? semua.slice(0, batasSelesai) : semua;

        return (
          <section key={status} aria-labelledby={`kelompok-${status}`}>
            <div className="mb-3 flex items-center gap-2">
              <h2
                id={`kelompok-${status}`}
                className="text-sm font-bold uppercase tracking-wide text-slate-500"
              >
                {JUDUL_KELOMPOK[status]}
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-semibold text-slate-500">
                {semua.length}
              </span>
            </div>

            {status === "selesai" && bisaEdit && (
              <p className="mb-3 text-sm text-slate-500">
                Perlu ujian susulan atau perpanjangan tenggat? Klik{" "}
                <strong className="font-semibold text-slate-600">
                  Buka ulang
                </strong>{" "}
                untuk mengubah tanggalnya, lalu perpanjang juga jadwal mapel
                atau tenggat tugas di dalamnya.
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tampil.map((event) => (
                <KartuEvent
                  key={event.id}
                  event={event}
                  status={status}
                  suffix={suffix}
                  bisaBukaUlang={bisaEdit && status === "selesai"}
                />
              ))}
            </div>

            {dipotong && (
              <Link
                href={`/admin/event${suffix}`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-teal hover:text-teal-light"
              >
                Lihat semua {semua.length} kegiatan selesai
                <i className="fas fa-arrow-right text-xs" aria-hidden />
              </Link>
            )}
          </section>
        );
      })}
    </div>
  );
}

function KartuEvent({
  event,
  status,
  suffix,
  bisaBukaUlang,
}: {
  event: EventAdmin;
  status: StatusEvent;
  suffix: string;
  bisaBukaUlang: boolean;
}) {
  const def = definisiJenisEvent(event.jenis);
  const badge = BADGE_STATUS[status];

  /*
    Kartu ini bukan lagi satu <Link> besar, karena di dalamnya ada tombol
    "Buka ulang" — tautan di dalam tautan itu HTML tidak valid. Sebagai
    gantinya judul menjadi tautan yang ::after-nya direntangkan menutupi
    seluruh kartu (stretched link): seluruh kartu tetap bisa diklik, dan
    tombol Buka ulang berdiri di atasnya lewat `relative z-10`.
  */
  return (
    <div className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-[--primary] hover:shadow-lg hover:shadow-blue-600/10">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="min-w-0 font-serif text-lg font-bold leading-snug text-ink">
          <Link
            href={`/admin/event/${event.id}${suffix}`}
            className="after:absolute after:inset-0 after:rounded-2xl"
          >
            {event.nama}
          </Link>
        </h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wide ${badge.kelas}`}
        >
          {badge.label}
        </span>
      </div>

      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <i className={`fas fa-${def.ikon}`} aria-hidden />
        {def.label}
        {!def.siap && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.6rem] font-bold normal-case text-amber-700">
            Segera
          </span>
        )}
      </p>

      <p className="flex items-center gap-1.5 text-sm text-slate-500">
        <i className="fas fa-calendar text-xs" aria-hidden />
        {formatTanggal(event.tgl_mulai)} –{" "}
        {formatTanggal(event.tgl_selesai)}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <span className="rounded-full bg-teal/10 px-2.5 py-1 text-[0.68rem] font-semibold text-teal">
          Kelas {event.kelas_utama}
        </span>
        <LencanaIsi event={event} />
      </div>

      {bisaBukaUlang && (
        <div className="relative z-10 mt-3 border-t border-slate-100 pt-3">
          <Link
            href={`/admin/event/${event.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-teal hover:text-teal"
          >
            <i className="fas fa-rotate-left text-[0.65rem]" aria-hidden />
            Buka ulang
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Lencana "isi" kartu, satu per mesin.
 *
 * KEGIATAN KOSONG ADALAH PERINGATAN, TAPI CUMA UNTUK MESIN YANG SUDAH
 * SIAP. Event ujian tanpa mapel dan event tugas tanpa tugas sama-sama
 * tidak bisa dipakai siswa — keduanya pantas ditandai merah. Event forum
 * tanpa isi tidak: fiturnya memang belum dibangun, dan menuduhnya kosong
 * berarti menyuruh guru memperbaiki sesuatu yang belum bisa diperbaiki
 * siapa pun.
 */
function LencanaIsi({ event }: { event: EventAdmin }) {
  const def = definisiJenisEvent(event.jenis);

  if (!def.siap) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold text-slate-500">
        Menyusul di Tahap {def.tahapRencana}
      </span>
    );
  }

  const jumlah = def.mesin === "tugas" ? event.jumlah_tugas : event.jumlah_mapel;
  const satuan = def.mesin === "tugas" ? "tugas" : "mapel";
  const kosong = jumlah === 0;

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[0.68rem] font-semibold ${
        kosong ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"
      }`}
    >
      {kosong ? (
        <>
          <i className="fas fa-triangle-exclamation mr-1" aria-hidden />
          Belum ada {satuan}
        </>
      ) : (
        `${jumlah} ${satuan}`
      )}
    </span>
  );
}
