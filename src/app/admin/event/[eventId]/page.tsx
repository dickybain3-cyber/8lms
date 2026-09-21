import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSesiGuru } from "@/lib/admin-guard";
import { JENJANG_LABEL, parseJenjang, type Jenjang } from "@/lib/jenjang";
import {
  ambilRingkasTugas,
  daftarTugasAdmin,
  detailEventAdmin,
  type KlienTugasMentah,
  type MapelAdminRingkas,
  type TugasRingkas,
} from "@/lib/supabase/admin-multi-event";
import { statusEvent } from "@/lib/event-status";
import {
  definisiJenisEvent,
  jenisEventValid,
  pakaiMesinUjian,
  pakaiMesinTugas,
  type JenisEvent,
} from "@/lib/jenis-event";
import { faseTugas, formatTenggat } from "@/lib/tugas";
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
 * Detail satu event + daftar isinya.
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
 *
 * ── PERUBAHAN TAHAP 4 ──
 *
 * "Isi" sebuah event sekarang bisa berupa MAPEL (mesin ujian) atau TUGAS
 * (mesin tugas). Keduanya dimuat di cabang yang sama lalu dirender oleh
 * `IsiDetail` menurut `jenis`. Alasannya bukan penghematan baris: halaman
 * ini juga memuat tombol hapus event, peringatan kegiatan selesai, dan
 * remah navigasi — dan semua itu berlaku sama untuk kedua mesin. Memecah
 * jadi dua halaman berarti memelihara dua salinan dari bagian yang tidak
 * pernah berbeda.
 *
 * Aturan yang SAMA seperti mapel juga berlaku untuk tugas di jalur admin
 * lintas jenjang: DITAMPILKAN (baca saja, lewat service role) tapi tanpa
 * tombol tambah/edit/hapus, karena Server Action-nya cookie-bound.
 */
function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
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

  // Dua tahap: kolom `jenis` (migrasi 0018) belum tentu ada di project ini.
  const lengkap = await supabase
    .from("event")
    .select("id, nama, tgl_mulai, tgl_selesai, kelas_utama, jenis")
    .eq("id", eventId)
    .maybeSingle();

  const event = lengkap.error
    ? (
        await supabase
          .from("event")
          .select("id, nama, tgl_mulai, tgl_selesai, kelas_utama")
          .eq("id", eventId)
          .maybeSingle()
      ).data
    : lengkap.data;

  if (!event) {
    notFound();
  }

  const jenisMentah = (event as { jenis?: unknown }).jenis;
  const jenis: JenisEvent = jenisEventValid(jenisMentah)
    ? jenisMentah
    : "asesmen_akhir";

  const dampakHapus = await hitungDampakHapusEvent(event.id);

  // Hanya muat isi yang relevan dengan mesinnya. Event tugas tidak punya
  // mapel sama sekali (dijaga trigger 0018), dan sebaliknya — memuat
  // keduanya berarti satu query yang pasti kosong di tiap kunjungan.
  const mapel: MapelAdminRingkas[] = pakaiMesinUjian(jenis)
    ? await muatMapelGuru(supabase, eventId)
    : [];

  const tugas: TugasRingkas[] = pakaiMesinTugas(jenis)
    ? await ambilRingkasTugas(
        supabase as unknown as KlienTugasMentah,
        eventId
      )
    : [];

  return (
    <IsiDetail
      event={{
        id: event.id,
        nama: event.nama,
        tgl_mulai: event.tgl_mulai,
        tgl_selesai: event.tgl_selesai,
        kelas_utama: Number(event.kelas_utama),
        jenis,
      }}
      mapel={mapel}
      tugas={tugas}
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
            Hanya relevan untuk mesin ujian: tugas dikerjakan di rumah,
            tidak ada tempat duduk yang perlu dibagi.
          */}
          {isAdmin && jenjangSesi && pakaiMesinUjian(jenis) && (
            <Link
              href={`/admin/event/${event.id}/ruang?jenjang=${jenjangSesi}`}
              className={TOMBOL_BIASA}
            >
              <i className="fas fa-chair" aria-hidden />
              Pembagian Ruang Ujian
            </Link>
          )}
          {pakaiMesinUjian(jenis) && (
            <Link href={`/admin/event/${event.id}/mapel/baru`} className={TOMBOL_UTAMA}>
              <i className="fas fa-plus" aria-hidden />
              Tambah Mapel
            </Link>
          )}
          {pakaiMesinTugas(jenis) && (
            <Link href={`/admin/event/${event.id}/tugas/baru`} className={TOMBOL_UTAMA}>
              <i className="fas fa-plus" aria-hidden />
              Tambah Tugas
            </Link>
          )}
        </>
      }
    />
  );
}

async function muatMapelGuru(
  supabase: ReturnType<typeof createClient>,
  eventId: string
): Promise<MapelAdminRingkas[]> {
  const { data: mapelList } = await supabase
    .from("mapel")
    .select("id, nama, waktu_mulai, waktu_selesai, mapel_kelas(kelas(nama))")
    .eq("event_id", eventId)
    .order("waktu_mulai");

  return (mapelList ?? []).map((m) => ({
    id: m.id as string,
    nama: m.nama as string,
    waktu_mulai: m.waktu_mulai as string,
    waktu_selesai: m.waktu_selesai as string,
    kelasNama: ((m.mapel_kelas ?? []) as unknown as {
      kelas: { nama: string } | null;
    }[])
      .map((mk) => mk.kelas?.nama)
      .filter((n): n is string => Boolean(n))
      .sort(),
  }));
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

  const tugas = pakaiMesinTugas(event.jenis)
    ? await daftarTugasAdmin(jenjang, eventId)
    : [];

  return (
    <IsiDetail
      event={event}
      mapel={mapel}
      tugas={tugas}
      jenjang={jenjang}
      aksiEvent={
        isAdmin && pakaiMesinUjian(event.jenis) ? (
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
  tugas,
  jenjang,
  aksiEvent,
}: {
  event: {
    id: string;
    nama: string;
    tgl_mulai: string;
    tgl_selesai: string;
    kelas_utama: number;
    jenis: JenisEvent;
  };
  mapel: MapelAdminRingkas[];
  tugas: TugasRingkas[];
  jenjang: Jenjang | null;
  aksiEvent: React.ReactNode;
}) {
  const suffix = jenjang ? `?jenjang=${jenjang}` : "";
  const def = definisiJenisEvent(event.jenis);
  const sekarang = Date.now();
  const eventSelesai =
    statusEvent(event.tgl_mulai, event.tgl_selesai, sekarang) === "selesai";

  return (
    <div>
      <Remah href={`/admin/event${suffix}`} label="Semua kegiatan" />

      <KepalaHalaman
        judul={event.nama}
        ikon="fa-calendar-check"
        keterangan={
          <>
            <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              <i className={`fas fa-${def.ikon}`} aria-hidden />
              {def.label}
            </span>
            {formatTanggal(event.tgl_mulai)} – {formatTanggal(event.tgl_selesai)}{" "}
            · Kelas {event.kelas_utama}
          </>
        }
        aksi={aksiEvent}
      />

      {/*
        Event yang sudah lewat tetap bisa dibuka lagi (mis. ujian
        susulan). Dua hal yang perlu diubah, dan keduanya gampang
        terlewat: tanggal kegiatan (label & pengelompokan di daftar)
        DAN jadwal tiap isinya — jendela siswa ditentukan oleh jadwal
        mapel/tenggat tugas, bukan oleh tanggal kegiatan.
      */}
      {eventSelesai && !jenjang && (
        <Info nada="info">
          Kegiatan ini sudah selesai. Untuk membuka ulang: klik{" "}
          <strong>Edit Kegiatan</strong> untuk mengubah tanggal selesai, lalu
          perpanjang juga{" "}
          {def.mesin === "tugas" ? (
            <>
              <strong>tenggat</strong> tugas yang mau dibuka
            </>
          ) : (
            <>
              <strong>jam ujian dibuka &amp; ditutup</strong> di mapel yang mau
              dibuka
            </>
          )}{" "}
          — siswa hanya bisa masuk selama jadwal isinya masih berlaku.
        </Info>
      )}

      {def.mesin === "ujian" && (
        <BagianMapel
          eventId={event.id}
          mapel={mapel}
          jenjang={jenjang}
          suffix={suffix}
          sekarang={sekarang}
        />
      )}

      {def.mesin === "tugas" && (
        <BagianTugas
          eventId={event.id}
          tugas={tugas}
          jenjang={jenjang}
          suffix={suffix}
          sekarang={sekarang}
        />
      )}

      {/* Forum — Tahap 5. Satu-satunya jenis yang masih menunggu. */}
      {!def.siap && (
        <Kosong
          ikon={`fa-${def.ikon}`}
          judul={`Fitur ${def.label} menyusul`}
          keterangan={`Kegiatan ini sudah tersimpan sebagai "${def.label}", tapi halaman untuk mengisi kontennya belum dibangun — direncanakan Tahap ${def.tahapRencana}. Kegiatan ini tetap aman tersimpan, tidak perlu dibuat ulang nanti.`}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function BagianMapel({
  eventId,
  mapel,
  jenjang,
  suffix,
  sekarang,
}: {
  eventId: string;
  mapel: MapelAdminRingkas[];
  jenjang: Jenjang | null;
  suffix: string;
  sekarang: number;
}) {
  const sedangBerjalan = mapel.filter(
    (m) =>
      new Date(m.waktu_mulai).getTime() <= sekarang &&
      new Date(m.waktu_selesai).getTime() >= sekarang
  ).length;
  const belumMulai = mapel.filter(
    (m) => new Date(m.waktu_mulai).getTime() > sekarang
  ).length;
  const totalKelasTarget = new Set(mapel.flatMap((m) => m.kelasNama)).size;

  return (
    <>
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
                href={`/admin/event/${eventId}/mapel/baru`}
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
                href={`/admin/event/${eventId}/mapel/${m.id}${suffix}`}
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
    </>
  );
}

// ---------------------------------------------------------------------------

function BagianTugas({
  eventId,
  tugas,
  jenjang,
  suffix,
  sekarang,
}: {
  eventId: string;
  tugas: TugasRingkas[];
  jenjang: Jenjang | null;
  suffix: string;
  sekarang: number;
}) {
  const totalTarget = tugas.reduce((n, t) => n + t.jumlahTarget, 0);
  const totalKumpul = tugas.reduce((n, t) => n + t.jumlahTerkumpul, 0);
  const perluDinilai = tugas.reduce(
    (n, t) => n + Math.max(0, t.jumlahTerkumpul - t.jumlahDinilai),
    0
  );
  const masihBerjalan = tugas.filter(
    (t) =>
      faseTugas(
        { dibuka_at: t.dibuka_at, tenggat: t.tenggat, izinkan_terlambat: t.izinkan_terlambat },
        sekarang
      ) === "berjalan"
  ).length;

  return (
    <>
      <BarisStatistik>
        <Statistik label="Tugas" nilai={tugas.length} ikon="fa-file-lines" warna="biru" />
        <Statistik
          label="Masih berjalan"
          nilai={masihBerjalan}
          ikon="fa-circle-play"
          warna={masihBerjalan > 0 ? "hijau" : "abu"}
        />
        <Statistik
          label="Pengumpulan masuk"
          nilai={totalKumpul}
          ikon="fa-inbox"
          warna="abu"
        />
        {/*
          "Perlu dinilai" adalah satu-satunya angka di baris ini yang
          menuntut tindakan guru — karena itu diberi warna emas saat > 0,
          bukan abu seperti angka-angka kabar lainnya.
        */}
        <Statistik
          label="Perlu dinilai"
          nilai={perluDinilai}
          ikon="fa-pen-to-square"
          warna={perluDinilai > 0 ? "emas" : "abu"}
        />
      </BarisStatistik>

      {jenjang && (
        <Info nada="info">
          Database {JENJANG_LABEL[jenjang]}, tampilan baca saja. Menambah,
          mengedit, dan menilai tugas hanya bisa dilakukan dari akun guru
          jenjang ini — tombolnya sengaja disembunyikan di sini supaya
          perubahan tidak tersimpan ke database yang salah.
        </Info>
      )}

      {totalTarget === 0 && tugas.length > 0 && (
        <Info nada="info">
          Tugas di kegiatan ini belum punya siswa sasaran sama sekali —
          periksa kelas targetnya lewat halaman tugas masing-masing.
        </Info>
      )}

      {tugas.length === 0 ? (
        <Kosong
          ikon="fa-file-circle-plus"
          judul="Belum ada tugas"
          keterangan="Satu kegiatan bisa memuat beberapa tugas, masing-masing dengan tenggat dan kelas targetnya sendiri. Tambahkan yang pertama."
          aksi={
            jenjang ? undefined : (
              <Link
                href={`/admin/event/${eventId}/tugas/baru`}
                className={TOMBOL_UTAMA}
              >
                <i className="fas fa-plus" aria-hidden />
                Tambah Tugas
              </Link>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tugas.map((t) => (
            <KartuTugas
              key={t.id}
              eventId={eventId}
              tugas={t}
              suffix={suffix}
              sekarang={sekarang}
            />
          ))}
        </div>
      )}
    </>
  );
}

function KartuTugas({
  eventId,
  tugas,
  suffix,
  sekarang,
}: {
  eventId: string;
  tugas: TugasRingkas;
  suffix: string;
  sekarang: number;
}) {
  const fase = faseTugas(
    {
      dibuka_at: tugas.dibuka_at,
      tenggat: tugas.tenggat,
      izinkan_terlambat: tugas.izinkan_terlambat,
    },
    sekarang
  );

  const label =
    fase === "berjalan"
      ? "Berjalan"
      : fase === "belum_dibuka"
        ? "Terjadwal"
        : tugas.izinkan_terlambat
          ? "Lewat tenggat"
          : "Ditutup";

  const gaya =
    fase === "berjalan"
      ? "bg-emerald-100 text-emerald-700"
      : fase === "belum_dibuka"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-500";

  const perluDinilai = Math.max(0, tugas.jumlahTerkumpul - tugas.jumlahDinilai);

  return (
    <Link
      href={`/admin/event/${eventId}/tugas/${tugas.id}${suffix}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-[--primary] hover:shadow-lg hover:shadow-blue-600/10"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-serif text-lg font-bold leading-snug text-ink">
          {tugas.judul}
        </h2>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wide ${gaya}`}
        >
          {label}
        </span>
      </div>

      <p className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
        <i className="fas fa-hourglass-end text-xs" aria-hidden />
        Tenggat {formatTenggat(tugas.tenggat)}
      </p>

      {/*
        Angka pengumpulan ditulis sebagai "x dari y", bukan persentase.
        Guru yang melihat "38%" harus menghitung sendiri berapa anak yang
        belum — dan berapa anak yang belum adalah satu-satunya bentuk
        angka ini yang bisa langsung ditindaklanjuti.
      */}
      <p className="mb-3 text-sm text-slate-600">
        <strong className="text-ink">{tugas.jumlahTerkumpul}</strong> dari{" "}
        {tugas.jumlahTarget} siswa sudah mengumpulkan
        {perluDinilai > 0 && (
          <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[0.68rem] font-semibold text-amber-700">
            {perluDinilai} perlu dinilai
          </span>
        )}
      </p>

      <div className="mt-auto flex flex-wrap gap-1.5">
        {tugas.kelasNama.length === 0 ? (
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-[0.68rem] font-semibold text-red-600">
            <i className="fas fa-triangle-exclamation mr-1" aria-hidden />
            Belum ada kelas target
          </span>
        ) : (
          tugas.kelasNama.map((nama) => (
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
}
