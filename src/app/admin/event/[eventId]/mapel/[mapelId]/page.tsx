import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TIPE_LABEL, ringkasanKonten } from "@/lib/soal";
import type { TipeSoal } from "@/types";
import { hitungDampakHapusMapel, cekMapelSudahDikerjakan } from "@/app/admin/event/actions";
import { getSesiGuru } from "@/lib/admin-guard";
import { parseJenjang, type Jenjang } from "@/lib/jenjang";
import JenjangSwitcher from "@/components/admin/JenjangSwitcher";
import BadgeJenjang from "@/components/admin/BadgeJenjang";
import DeleteMapelButton from "./DeleteMapelButton";
import DeleteSoalButton from "./DeleteSoalButton";
import SkorInline from "./SkorInline";
import {
  BarisStatistik,
  Info,
  KepalaHalaman,
  Kosong,
  Remah,
  Statistik,
  TOMBOL_BIASA,
  TOMBOL_NONAKTIF,
  TOMBOL_UTAMA,
} from "@/components/ui/Panel";

function formatWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type MapelRow = {
  id: string;
  nama: string;
  event_id: string;
  waktu_mulai: string;
  waktu_selesai: string;
  eventNama: string;
};

type SoalRow = {
  id: string;
  tipe: string;
  urutan: number;
  skor: string | number;
  konten_jsonb: Record<string, unknown>;
  gambar_url: string | null;
};

/**
 * Semua data yang dibutuhkan halaman ini, dibaca lewat SATU client
 * (dioper sebagai parameter) — bikin fungsi ini bisa dipakai untuk jalur
 * guru (client cookie-bound) maupun jalur admin (service_role) tanpa
 * ditulis dua kali. `dampak`/`jumlahSudahSubmit` DIHITUNG LANGSUNG di sini
 * lewat client yang sama (bukan lewat `hitungDampakHapusMapel()` /
 * `cekMapelSudahDikerjakan()` di admin/event/actions.ts), supaya jalur
 * admin lintas jenjang tidak diam-diam kembali cookie-bound lewat
 * pemanggilan fungsi itu — lihat `MapelDetailAdmin` di bawah untuk kenapa
 * ini penting.
 */
async function muatDataMapel(
  client: ReturnType<typeof createClient> | ReturnType<typeof createAdminClient>,
  eventId: string,
  mapelId: string
): Promise<{
  mapel: MapelRow;
  soalList: SoalRow[];
  totalSkor: number;
  jumlahSudahSubmit: number;
  dampakHapusMapel: { jumlahSoal: number; jumlahJawabanSiswa: number; jumlahNilai: number };
} | null> {
  const { data: mapel } = await client
    .from("mapel")
    .select("id, nama, event_id, waktu_mulai, waktu_selesai, event(nama)")
    .eq("id", mapelId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!mapel) return null;

  const eventNama =
    (mapel.event as unknown as { nama: string } | null)?.nama ?? "Event";

  const { data: soalList } = await client
    .from("soal")
    .select("id, tipe, urutan, skor, konten_jsonb, gambar_url")
    .eq("mapel_id", mapelId)
    .order("urutan");

  const totalSkor = (soalList ?? []).reduce(
    (sum: number, s: SoalRow) => sum + Number(s.skor),
    0
  );

  const { count: jumlahSudahSubmit } = await client
    .from("jawaban_siswa")
    .select("siswa_id", { count: "exact", head: true })
    .eq("mapel_id", mapelId)
    .not("submitted_at", "is", null);

  const { count: jumlahSoal } = await client
    .from("soal")
    .select("id", { count: "exact", head: true })
    .eq("mapel_id", mapelId);

  const { count: jumlahJawabanSiswa } = await client
    .from("jawaban_siswa")
    .select("siswa_id", { count: "exact", head: true })
    .eq("mapel_id", mapelId);

  const { count: jumlahNilai } = await client
    .from("nilai")
    .select("siswa_id", { count: "exact", head: true })
    .eq("mapel_id", mapelId);

  return {
    mapel: {
      id: mapel.id,
      nama: mapel.nama,
      event_id: mapel.event_id,
      waktu_mulai: mapel.waktu_mulai,
      waktu_selesai: mapel.waktu_selesai,
      eventNama,
    },
    soalList: (soalList ?? []) as SoalRow[],
    totalSkor,
    jumlahSudahSubmit: jumlahSudahSubmit ?? 0,
    dampakHapusMapel: {
      jumlahSoal: jumlahSoal ?? 0,
      jumlahJawabanSiswa: jumlahJawabanSiswa ?? 0,
      jumlahNilai: jumlahNilai ?? 0,
    },
  };
}

/**
 * Isi halaman — dipakai APA ADANYA oleh jalur guru maupun jalur admin,
 * sekali lagi supaya markup-nya tidak ditulis dua kali. Bedanya cuma tiga
 * hal yang dioper sebagai parameter:
 *  - `jenjang`: kalau diisi, halaman dalam mode admin (JenjangSwitcher +
 *    badge ditampilkan, semua link soal membawa `?jenjang=`).
 *  - `bisaEditHapusMapel`: Edit Mapel / Hapus Mapel memanggil action lama
 *    yang COOKIE-BOUND (`deleteMapel()` di admin/event/actions.ts, dan
 *    halaman edit mapel yang juga tidak disentuh sesi ini) — itu hanya
 *    benar kalau target mapel ada di project yang SAMA dengan sesi login
 *    admin. Begitu admin pindah lihat ke jenjang lain, dua tombol ini
 *    DISEMBUNYIKAN (bukan diarahkan ke varian admin — varian admin untuk
 *    edit/hapus MAPEL di luar cakupan sesi ini, lihat catatan di prompt).
 *  - Link "+ Tambah Soal", "Edit" soal, dan `<DeleteSoalButton>` SELALU
 *    aman lintas jenjang (sudah punya varian admin sejak sesi
 *    sebelumnya), jadi tetap ditampilkan apa pun jenjangnya — cukup
 *    dibawakan `jenjang` supaya mendarat di action yang benar.
 */
function IsiHalamanMapel({
  eventId,
  mapelId,
  data,
  jenjang,
  bisaEditHapusMapel,
}: {
  eventId: string;
  mapelId: string;
  data: NonNullable<Awaited<ReturnType<typeof muatDataMapel>>>;
  jenjang?: Jenjang;
  bisaEditHapusMapel: boolean;
}) {
  const { mapel, soalList, totalSkor, jumlahSudahSubmit, dampakHapusMapel } = data;
  const qs = jenjang ? `?jenjang=${jenjang}` : "";
  const adaSoal = soalList.length > 0;

  return (
    <div>
      {jenjang && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <JenjangSwitcher
            jenjangAktif={jenjang}
            buatHref={(j) =>
              `/admin/event/${eventId}/mapel/${mapelId}?jenjang=${j}`
            }
          />
          <BadgeJenjang jenjang={jenjang} />
        </div>
      )}

      <Remah href={`/admin/event/${eventId}${qs}`} label={mapel.eventNama} />

      <KepalaHalaman
        judul={mapel.nama}
        ikon="fa-book-open"
        keterangan={
          <>
            {formatWaktu(mapel.waktu_mulai)} – {formatWaktu(mapel.waktu_selesai)}
          </>
        }
        aksi={
          <>
            {/*
              ── Tombol Pratinjau ──
              Nonaktif selama belum ada soal, dan BUKAN disembunyikan.
              Tombol yang hilang-muncul membuat guru mengira fiturnya tidak
              ada; tombol abu-abu yang tetap di tempatnya mengajarkan bahwa
              fiturnya ada dan apa syaratnya. Judul (`title`) menjelaskan
              syarat itu saat disorot.
            */}
            {adaSoal ? (
              <Link
                href={`/admin/event/${eventId}/mapel/${mapelId}/preview${qs}`}
                className={TOMBOL_BIASA}
              >
                <i className="fas fa-eye" aria-hidden />
                Pratinjau Ujian
              </Link>
            ) : (
              <span
                className={TOMBOL_NONAKTIF}
                title="Tambahkan minimal satu soal untuk bisa melihat pratinjaunya"
                aria-disabled="true"
              >
                <i className="fas fa-eye" aria-hidden />
                Pratinjau Ujian
              </span>
            )}

            {bisaEditHapusMapel && (
              <>
                <Link
                  href={`/admin/event/${eventId}/mapel/${mapelId}/edit`}
                  className={TOMBOL_BIASA}
                >
                  <i className="fas fa-pen" aria-hidden />
                  Edit Mapel
                </Link>
                <DeleteMapelButton
                  eventId={eventId}
                  mapelId={mapelId}
                  mapelNama={mapel.nama}
                  dampak={dampakHapusMapel}
                />
              </>
            )}

            <Link
              href={`/admin/event/${eventId}/mapel/${mapelId}/soal/baru${qs}`}
              className={TOMBOL_UTAMA}
            >
              <i className="fas fa-plus" aria-hidden />
              Tambah Soal
            </Link>
          </>
        }
      />

      {/*
        ── Kenapa angka-angka ini dinaikkan jadi kartu ──
        Sebelumnya "12 soal · total skor 24" ditulis sebagai teks abu-abu
        kecil menempel di bawah judul. Padahal total skor adalah angka yang
        paling sering dicari guru di halaman ini: dia perlu tahu apakah
        bobot seluruh butir sudah pas 100 sebelum ujian dimulai. Angka yang
        harus dicari dulu sama saja dengan angka yang tidak ditampilkan.
      */}
      <BarisStatistik>
        <Statistik
          label="Butir soal"
          nilai={soalList.length}
          ikon="fa-list-ol"
          warna="biru"
        />
        <Statistik
          label="Total skor"
          nilai={totalSkor}
          ikon="fa-scale-balanced"
          warna={totalSkor === 100 ? "hijau" : "emas"}
          catatan={
            totalSkor === 100
              ? "sudah pas 100"
              : `${totalSkor > 100 ? "lebih" : "kurang"} ${Math.abs(100 - totalSkor)} dari 100`
          }
        />
        <Statistik
          label="Sudah submit"
          nilai={jumlahSudahSubmit}
          ikon="fa-user-check"
          warna={jumlahSudahSubmit > 0 ? "hijau" : "abu"}
        />
        <Statistik
          label="Status"
          nilai={adaSoal ? "Siap" : "Kosong"}
          ikon={adaSoal ? "fa-circle-check" : "fa-circle-exclamation"}
          warna={adaSoal ? "hijau" : "abu"}
        />
      </BarisStatistik>

      {!bisaEditHapusMapel && jenjang && (
        <Info nada="info">
          Kamu sedang melihat kelas {jenjang} lintas jenjang dari sesi
          login-mu sendiri — Edit/Hapus Mapel disembunyikan di sini karena
          aksi itu masih terikat sesi login. Tambah/Edit/Hapus Soal dan
          ubah skor di bawah tetap aman dipakai.
        </Info>
      )}

      {jumlahSudahSubmit > 0 && (
        <Info nada="peringatan">
          <strong>{jumlahSudahSubmit} siswa</strong> sudah submit &amp;
          dinilai di mapel ini. Kalau kamu mengubah kunci jawaban atau skor
          di bawah, nilai lama TIDAK otomatis ter-update — buka{" "}
          <Link
            href={`/admin/nilai${qs}`}
            className="font-semibold underline underline-offset-2"
          >
            Pengolahan Nilai
          </Link>{" "}
          lalu klik &quot;Hitung Ulang Nilai&quot; setelah selesai.
        </Info>
      )}

      {!adaSoal ? (
        <Kosong
          ikon="fa-file-circle-plus"
          judul="Belum ada soal di mapel ini"
          keterangan="Tambahkan soal pertama. Setelah tersimpan, form tidak menutup — kamu bisa langsung memilih bentuk soal berikutnya tanpa kembali ke halaman ini."
          aksi={
            <Link
              href={`/admin/event/${eventId}/mapel/${mapelId}/soal/baru${qs}`}
              className={TOMBOL_UTAMA}
            >
              <i className="fas fa-plus" aria-hidden />
              Tambah Soal Pertama
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          {soalList.map((soal, idx) => {
            const ringkasan = ringkasanKonten(
              soal.konten_jsonb as Record<string, unknown>
            );
            return (
              <div
                key={soal.id}
                className="flex flex-wrap items-start gap-4 border-b border-slate-100 p-4 transition-colors last:border-0 hover:bg-slate-50/70 sm:flex-nowrap"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold tabular-nums text-slate-500">
                  {idx + 1}
                </span>

                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <span className="mb-1.5 inline-block rounded-full bg-teal/10 px-2.5 py-1 text-[0.68rem] font-semibold text-teal">
                    {TIPE_LABEL[soal.tipe as TipeSoal]}
                  </span>
                  <p className="line-clamp-2 text-sm leading-relaxed text-slate-700">
                    {ringkasan || (
                      <span className="italic text-slate-400">
                        (belum ada teks pertanyaan)
                      </span>
                    )}
                  </p>
                </div>

                {soal.gambar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={soal.gambar_url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                )}

                {/*
                  Kolom skor bisa langsung diketik di sini — lihat komentar
                  di SkorInline.tsx kenapa membuka halaman edit hanya untuk
                  mengubah satu angka adalah beban yang tidak perlu.
                */}
                <SkorInline
                  eventId={eventId}
                  mapelId={mapelId}
                  soalId={soal.id}
                  skorAwal={Number(soal.skor)}
                  jenjang={jenjang}
                />

                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/admin/event/${eventId}/mapel/${mapelId}/soal/${soal.id}/edit${qs}`}
                    className="rounded-lg px-2.5 py-2 text-xs font-semibold text-teal transition-colors hover:bg-teal/10"
                  >
                    <i className="fas fa-pen mr-1" aria-hidden />
                    Edit
                  </Link>
                  <DeleteSoalButton
                    eventId={eventId}
                    mapelId={mapelId}
                    soalId={soal.id}
                    ringkasan={ringkasan || `Soal ${idx + 1}`}
                    jenjang={jenjang}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Jalur ADMIN — dipilih di bawah lewat `sesi.isAdmin`. SELALU memakai
 * `createAdminClient(jenjang)` (service_role) lewat `muatDataMapel()` di
 * atas, TERMASUK saat `jenjang` yang dilihat sama dengan jenjang sesi
 * login admin sendiri — konsisten dengan pola yang sudah dipakai
 * `<NilaiTable>` (lihat komentar `simpan()` di sana): satu jalur kode
 * admin, bukan dua jalur yang diam-diam berbeda tergantung kebetulan
 * jenjang yang sedang dilihat sama atau tidak dengan sesi login-nya.
 */
async function MapelDetailAdmin({
  jenjang,
  eventId,
  mapelId,
  jenjangSesi,
}: {
  jenjang: Jenjang;
  eventId: string;
  mapelId: string;
  jenjangSesi: Jenjang | null;
}) {
  const client = createAdminClient(jenjang);
  const data = await muatDataMapel(client, eventId, mapelId);

  if (!data) {
    return (
      <div>
        <div className="mb-4">
          <JenjangSwitcher
            jenjangAktif={jenjang}
            buatHref={(j) => `/admin/event/${eventId}/mapel/${mapelId}?jenjang=${j}`}
          />
        </div>
        <p className="text-sm text-ink/50">
          Mapel tidak ditemukan di kelas {jenjang}.
        </p>
      </div>
    );
  }

  return (
    <IsiHalamanMapel
      eventId={eventId}
      mapelId={mapelId}
      data={data}
      jenjang={jenjang}
      bisaEditHapusMapel={jenjang === jenjangSesi}
    />
  );
}

/** Jalur guru biasa — cookie-bound, TIDAK berubah dari sebelumnya. */
async function MapelDetailGuru({
  eventId,
  mapelId,
}: {
  eventId: string;
  mapelId: string;
}) {
  const supabase = createClient();
  const data = await muatDataMapel(supabase, eventId, mapelId);

  if (!data) {
    notFound();
  }

  // Guru biasa memang selalu memakai `hitungDampakHapusMapel()` /
  // `cekMapelSudahDikerjakan()` cookie-bound yang sudah ada — dipertahankan
  // di sini (bukan cuma hasil `muatDataMapel()`) supaya perilaku jalur
  // guru betul-betul identik bit demi bit dengan sebelum sesi ini, sesuai
  // permintaan "login TIDAK diubah". Hasilnya akan selalu sama karena
  // query di dalamnya identik, ini murni soal tidak menyentuh jalur guru
  // sama sekali.
  const dampakHapusMapel = await hitungDampakHapusMapel(mapelId);
  const jumlahSudahSubmit = await cekMapelSudahDikerjakan(mapelId);

  return (
    <IsiHalamanMapel
      eventId={eventId}
      mapelId={mapelId}
      data={{ ...data, dampakHapusMapel, jumlahSudahSubmit }}
      bisaEditHapusMapel
    />
  );
}

export default async function MapelDetailPage({
  params,
  searchParams,
}: {
  params: { eventId: string; mapelId: string };
  searchParams: { jenjang?: string };
}) {
  const sesi = await getSesiGuru();
  const jenjangQuery = parseJenjang(searchParams.jenjang);

  if (sesi.isAdmin && jenjangQuery !== null) {
    return (
      <MapelDetailAdmin
        jenjang={jenjangQuery}
        eventId={params.eventId}
        mapelId={params.mapelId}
        jenjangSesi={sesi.jenjang}
      />
    );
  }

  return <MapelDetailGuru eventId={params.eventId} mapelId={params.mapelId} />;
}