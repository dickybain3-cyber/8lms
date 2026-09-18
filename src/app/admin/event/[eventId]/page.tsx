import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSesiGuru } from "@/lib/admin-guard";
import { JENJANG_LABEL, parseJenjang, type Jenjang } from "@/lib/jenjang";
import {
  detailEventAdmin,
  type MapelAdminRingkas,
} from "@/lib/supabase/admin-multi-event";
import { hitungDampakHapusEvent } from "../actions";
import DeleteEventButton from "./DeleteEventButton";
import {
  BarisStatistik,
  Info,
  KepalaHalaman,
  Kosong,
  Remah,
  Statistik,
  TOMBOL_BIASA,
  TOMBOL_UTAMA,
} from "@/components/ui/Panel";

/**
 * Detail satu event + daftar mapelnya.
 *
 * Sama polanya dengan daftar event: jalur guru tidak disentuh sama sekali,
 * jalur admin lintas jenjang ditambahkan sebagai cabang terpisah yang
 * dipilih lewat `sesi.isAdmin && ?jenjang=`.
 *
 * Tombol Edit/Hapus event SENGAJA tidak muncul di jalur admin lintas
 * jenjang — keduanya memakai server action cookie-bound yang akan menulis
 * ke project jenjang SESI, bukan jenjang yang sedang dilihat. Menampilkan
 * tombolnya berarti menyediakan cara menghapus event yang salah di
 * database yang salah; menyembunyikannya adalah pembatasan yang jujur.
 * Yang memang sudah aman lintas jenjang — menambah, mengedit, dan
 * menghapus SOAL — tetap tersedia penuh lewat tautan mapel di bawah.
 */
function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: { eventId: string };
  searchParams: { jenjang?: string };
}) {
  const sesi = await getSesiGuru();
  const jenjangQuery = parseJenjang(searchParams.jenjang);

  if (sesi.isAdmin && jenjangQuery !== null) {
    return (
      <DetailAdmin
        eventId={params.eventId}
        jenjang={jenjangQuery}
        isAdmin={sesi.isAdmin}
      />
    );
  }

  return (
    <DetailGuru
      eventId={params.eventId}
      isAdmin={sesi.isAdmin}
      jenjangSesi={sesi.jenjang}
    />
  );
}

// ---------------------------------------------------------------------------

async function DetailGuru({
  eventId,
  isAdmin,
  jenjangSesi,
}: {
  eventId: string;
  isAdmin: boolean;
  jenjangSesi: Jenjang | null;
}) {
  const supabase = createClient();

  const { data: event } = await supabase
    .from("event")
    .select("id, nama, tgl_mulai, tgl_selesai, kelas_utama")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    notFound();
  }

  const dampakHapus = await hitungDampakHapusEvent(event.id);

  const { data: mapelList } = await supabase
    .from("mapel")
    .select("id, nama, waktu_mulai, waktu_selesai, mapel_kelas(kelas(nama))")
    .eq("event_id", eventId)
    .order("waktu_mulai");

  const mapel: MapelAdminRingkas[] = (mapelList ?? []).map((m) => ({
    id: m.id,
    nama: m.nama,
    waktu_mulai: m.waktu_mulai,
    waktu_selesai: m.waktu_selesai,
    kelasNama: ((m.mapel_kelas ?? []) as unknown as {
      kelas: { nama: string } | null;
    }[])
      .map((mk) => mk.kelas?.nama)
      .filter((n): n is string => Boolean(n))
      .sort(),
  }));

  return (
    <IsiDetail
      event={{
        id: event.id,
        nama: event.nama,
        tgl_mulai: event.tgl_mulai,
        tgl_selesai: event.tgl_selesai,
        kelas_utama: Number(event.kelas_utama),
      }}
      mapel={mapel}
      jenjang={null}
      aksiEvent={
        <>
          <Link href={`/admin/event/${event.id}/edit`} className={TOMBOL_BIASA}>
            <i className="fas fa-pen" aria-hidden />
            Edit Kegiatan
          </Link>
          <DeleteEventButton
            eventId={event.id}
            eventNama={event.nama}
            dampak={dampakHapus}
          />
          {/*
            PEMBAGIAN RUANG UJIAN — admin-only, sama seperti /admin/denah.
            Perlu tahu jenjang ASAL event ini supaya halaman ruang bisa
            membaca ulang nama kegiatan dari database yang benar; untuk
            jalur guru (bukan tampilan lintas jenjang), itu jenjang sesi
            login guru itu sendiri, karena event guru selalu ada di
            project jenjangnya sendiri.
          */}
          {isAdmin && jenjangSesi && (
            <Link
              href={`/admin/event/${event.id}/ruang?jenjang=${jenjangSesi}`}
              className={TOMBOL_BIASA}
            >
              <i className="fas fa-chair" aria-hidden />
              Pembagian Ruang Ujian
            </Link>
          )}
          <Link href={`/admin/event/${event.id}/mapel/baru`} className={TOMBOL_UTAMA}>
            <i className="fas fa-plus" aria-hidden />
            Tambah Mapel
          </Link>
        </>
      }
    />
  );
}

async function DetailAdmin({
  eventId,
  jenjang,
  isAdmin,
}: {
  eventId: string;
  jenjang: Jenjang;
  isAdmin: boolean;
}) {
  const { event, mapel } = await detailEventAdmin(jenjang, eventId);

  if (!event) {
    return (
      <div>
        <Link
          href={`/admin/event?jenjang=${jenjang}`}
          className="text-sm text-ink/50 hover:text-ink"
        >
          ← Semua kegiatan {JENJANG_LABEL[jenjang].toLowerCase()}
        </Link>
        <p className="mt-4 text-sm text-ink/60">
          Event ini tidak ada di database {JENJANG_LABEL[jenjang]}. Event
          adalah milik satu jenjang — pilih event yang memang ada di sini.
        </p>
      </div>
    );
  }

  return (
    <IsiDetail
      event={event}
      mapel={mapel}
      jenjang={jenjang}
      aksiEvent={
        isAdmin ? (
          <Link
            href={`/admin/event/${event.id}/ruang?jenjang=${jenjang}`}
            className={TOMBOL_BIASA}
          >
            <i className="fas fa-chair" aria-hidden />
            Pembagian Ruang Ujian
          </Link>
        ) : null
      }
    />
  );
}

// ---------------------------------------------------------------------------

function IsiDetail({
  event,
  mapel,
  jenjang,
  aksiEvent,
}: {
  event: {
    id: string;
    nama: string;
    tgl_mulai: string;
    tgl_selesai: string;
    kelas_utama: number;
  };
  mapel: MapelAdminRingkas[];
  jenjang: Jenjang | null;
  aksiEvent: React.ReactNode;
}) {
  const suffix = jenjang ? `?jenjang=${jenjang}` : "";

  // Mapel yang jadwalnya belum lewat — dipakai untuk kartu ringkas di
  // atas. Dihitung di sini, bukan di query, karena datanya sudah ada di
  // memori dan jumlahnya paling banyak belasan.
  const sekarang = Date.now();
  const sedangBerjalan = mapel.filter(
    (m) =>
      new Date(m.waktu_mulai).getTime() <= sekarang &&
      new Date(m.waktu_selesai).getTime() >= sekarang
  ).length;
  const belumMulai = mapel.filter(
    (m) => new Date(m.waktu_mulai).getTime() > sekarang
  ).length;
  const totalKelasTarget = new Set(
    mapel.flatMap((m) => m.kelasNama)
  ).size;

  return (
    <div>
      <Remah href={`/admin/event${suffix}`} label="Semua kegiatan" />

      <KepalaHalaman
        judul={event.nama}
        ikon="fa-calendar-check"
        keterangan={
          <>
            {formatTanggal(event.tgl_mulai)} – {formatTanggal(event.tgl_selesai)}{" "}
            · Kelas {event.kelas_utama}
          </>
        }
        aksi={aksiEvent}
      />

      <BarisStatistik>
        <Statistik
          label="Mata pelajaran"
          nilai={mapel.length}
          ikon="fa-book"
          warna="biru"
        />
        <Statistik
          label="Sedang berjalan"
          nilai={sedangBerjalan}
          ikon="fa-circle-play"
          warna={sedangBerjalan > 0 ? "hijau" : "abu"}
        />
        <Statistik
          label="Belum mulai"
          nilai={belumMulai}
          ikon="fa-clock"
          warna="emas"
        />
        <Statistik
          label="Kelas terlibat"
          nilai={totalKelasTarget}
          ikon="fa-users-rectangle"
          warna="abu"
        />
      </BarisStatistik>

      {jenjang && (
        <Info nada="info">
          Database {JENJANG_LABEL[jenjang]}. Klik mapel di bawah untuk
          menambah atau mengedit soalnya — semua tersimpan ke database
          jenjang ini.
        </Info>
      )}

      {mapel.length === 0 ? (
        <Kosong
          ikon="fa-book-medical"
          judul="Belum ada mata pelajaran"
          keterangan="Satu kegiatan bisa memuat beberapa mapel, masing-masing dengan jadwal dan kelas targetnya sendiri. Tambahkan yang pertama."
          aksi={
            jenjang ? undefined : (
              <Link
                href={`/admin/event/${event.id}/mapel/baru`}
                className={TOMBOL_UTAMA}
              >
                <i className="fas fa-plus" aria-hidden />
                Tambah Mapel
              </Link>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mapel.map((m) => {
            const mulai = new Date(m.waktu_mulai).getTime();
            const selesai = new Date(m.waktu_selesai).getTime();
            const berjalan = mulai <= sekarang && selesai >= sekarang;
            const usai = selesai < sekarang;

            return (
              <Link
                key={m.id}
                href={`/admin/event/${event.id}/mapel/${m.id}${suffix}`}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-[--primary] hover:shadow-lg hover:shadow-blue-600/10"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h2 className="min-w-0 font-serif text-lg font-bold leading-snug text-ink">
                    {m.nama}
                  </h2>
                  {/*
                    Penanda status memakai kata, bukan cuma warna. Titik
                    berwarna saja tidak terbaca oleh guru yang buta warna
                    — dan status "sedang berjalan" adalah justru informasi
                    yang paling tidak boleh salah dibaca di halaman ini.
                  */}
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

                <p className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
                  <i className="fas fa-clock text-xs" aria-hidden />
                  {formatWaktu(m.waktu_mulai)} – {formatWaktu(m.waktu_selesai)}
                </p>

                <div className="mt-auto flex flex-wrap gap-1.5">
                  {m.kelasNama.length === 0 ? (
                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-[0.68rem] font-semibold text-red-600">
                      <i className="fas fa-triangle-exclamation mr-1" aria-hidden />
                      Belum ada kelas target
                    </span>
                  ) : (
                    m.kelasNama.map((nama) => (
                      <span
                        key={nama}
                        className="rounded-full bg-teal/10 px-2.5 py-1 text-[0.68rem] font-semibold text-teal"
                      >
                        {nama}
                      </span>
                    ))
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
