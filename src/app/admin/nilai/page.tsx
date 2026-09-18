import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getJenjangFromServerCookies } from "@/lib/jenjang-server";
import { getSesiGuru } from "@/lib/admin-guard";
import { parseJenjang, type Jenjang } from "@/lib/jenjang";
import {
  daftarMapelSemuaJenjang,
  detailNilaiMapelAdmin,
  type MapelMonitoring,
} from "@/lib/supabase/admin-multi";
import NilaiTable, {
  type BarisNilai,
  type SoalRingkas,
} from "@/components/admin/Nilai/NilaiTable";
import JenjangSwitcher from "@/components/admin/JenjangSwitcher";
import { tahunAjaranDariTanggal } from "@/lib/tahun-ajaran";

function formatWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function MapelPicker() {
  const supabase = createClient();

  const { data: mapelList } = await supabase
    .from("mapel")
    .select("id, nama, waktu_mulai, waktu_selesai, event(id, nama, tgl_mulai)")
    .order("waktu_mulai", { ascending: false });

  const events = new Map<
    string,
    {
      nama: string;
      mapel: { id: string; nama: string; waktu_mulai: string; waktu_selesai: string }[];
    }
  >();

  for (const m of mapelList ?? []) {
    const event = m.event as unknown as {
      id: string;
      nama: string;
      tgl_mulai: string;
    } | null;
    const eventId = event?.id ?? "tanpa-event";
    if (!events.has(eventId)) {
      events.set(eventId, { nama: event?.nama ?? "Tanpa event", mapel: [] });
    }
    events.get(eventId)!.mapel.push({
      id: m.id,
      nama: m.nama,
      waktu_mulai: m.waktu_mulai,
      waktu_selesai: m.waktu_selesai,
    });
  }

  return (
    <div>
      <h1 className="mb-1 font-serif text-2xl text-ink">Pengolahan Nilai</h1>
      <p className="mb-6 text-sm text-ink/60">
        Pilih mapel untuk melihat & mengolah nilai siswa.
      </p>

      {events.size === 0 && (
        <p className="text-sm text-ink/50">Belum ada mapel.</p>
      )}

      <div className="space-y-6">
        {Array.from(events.entries()).map(([eventId, ev]) => (
          <section key={eventId}>
            <h2 className="mb-2 font-serif text-base text-ink">{ev.nama}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ev.mapel.map((m) => (
                <Link
                  key={m.id}
                  href={`/admin/nilai?mapelId=${m.id}`}
                  className="block rounded-lg border border-ink/10 bg-white p-4 transition-colors hover:border-gold"
                >
                  <p className="font-serif text-sm text-ink">{m.nama}</p>
                  <p className="mt-1 text-xs text-ink/50">
                    {formatWaktu(m.waktu_mulai)} – {formatWaktu(m.waktu_selesai)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

async function DetailNilaiMapel({ mapelId }: { mapelId: string }) {
  // Jenjang sesi dibaca sekali di sini lalu dioper ke tabel — lihat
  // komentar di pemanggilan <NilaiTable> di bawah. Kalau cookie-nya
  // hilang, `createClient()` di bawah ini sudah melempar error duluan,
  // jadi fallback 7 di sini murni untuk menyenangkan tipe.
  const jenjang = getJenjangFromServerCookies() ?? 7;
  const supabase = createClient();

  const { data: mapel } = await supabase
    .from("mapel")
    .select("id, nama, event(nama, tgl_mulai)")
    .eq("id", mapelId)
    .maybeSingle();

  if (!mapel) {
    return (
      <div>
        <p className="text-sm text-ink/50">Mapel tidak ditemukan.</p>
        <Link href="/admin/nilai" className="text-sm text-teal hover:underline">
          ← Pilih mapel lain
        </Link>
      </div>
    );
  }

  const eventInfo = mapel.event as unknown as {
    nama: string;
    tgl_mulai: string;
  } | null;
  const eventNama = eventInfo?.nama ?? "Event";
  // Fallback ke hari ini kalau entah bagaimana event-nya tidak ketemu —
  // murni supaya kop Excel tidak pernah kosong; secara praktik mapel
  // selalu punya event karena keduanya dibuat lewat alur yang sama.
  const tahunAjaran = tahunAjaranDariTanggal(
    eventInfo?.tgl_mulai ?? new Date().toISOString()
  );

  const { data: soalData } = await supabase
    .from("soal")
    .select("id, urutan, skor")
    .eq("mapel_id", mapelId)
    .order("urutan");

  const soalList: SoalRingkas[] = (soalData ?? []).map((s) => ({
    id: s.id,
    urutan: s.urutan,
    skor: Number(s.skor),
  }));

  const { data: mapelKelas } = await supabase
    .from("mapel_kelas")
    .select("kelas_id")
    .eq("mapel_id", mapelId);

  const kelasIds = (mapelKelas ?? []).map((mk) => mk.kelas_id);

  const { data: siswaList } =
    kelasIds.length > 0
      ? await supabase
          .from("siswa")
          .select("id, nama, username, kelas(nama)")
          .in("kelas_id", kelasIds)
          .order("nama")
      : { data: [] as never[] };

  const { data: jawabanList } = await supabase
    .from("jawaban_siswa")
    .select("siswa_id, submitted_at")
    .eq("mapel_id", mapelId);

  const { data: nilaiList } = await supabase
    .from("nilai")
    .select("siswa_id, total_skor, detail_jsonb, is_override")
    .eq("mapel_id", mapelId);

  const submittedMap = new Map(
    (jawabanList ?? []).map((j) => [j.siswa_id, j.submitted_at !== null])
  );
  const nilaiMap = new Map(
    (nilaiList ?? []).map((n) => [
      n.siswa_id,
      {
        totalSkor: Number(n.total_skor),
        detailJsonb: (n.detail_jsonb ?? {}) as Record<string, number>,
        isOverride: n.is_override,
      },
    ])
  );

  const rows: BarisNilai[] = (siswaList ?? []).map((s) => {
    const nilai = nilaiMap.get(s.id);
    return {
      siswaId: s.id,
      nama: s.nama,
      username: s.username,
      kelasNama:
        (s.kelas as unknown as { nama: string } | null)?.nama ?? "-",
      submitted: submittedMap.get(s.id) ?? false,
      totalSkor: nilai?.totalSkor ?? null,
      isOverride: nilai?.isOverride ?? false,
      detailJsonb: nilai?.detailJsonb ?? {},
    };
  });

  return (
    <div>
      <div className="mb-1">
        <Link href="/admin/nilai" className="text-sm text-ink/50 hover:text-ink">
          ← Pilih mapel lain
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-ink">{mapel.nama}</h1>
        <p className="mt-1 text-sm text-ink/60">
          {eventNama} · {soalList.length} soal · {rows.length} siswa target
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink/50">
          Belum ada siswa yang ditarget ke mapel ini.
        </p>
      ) : (
        <NilaiTable
          mapelId={mapelId}
          mapelNama={mapel.nama}
          eventNama={eventNama}
          tahunAjaran={tahunAjaran}
          // Halaman ini selalu membaca satu project saja (lewat cookie
          // sesi), jadi jenjang semua barisnya sama: jenjang sesi. Nilai
          // itu tetap dioper eksplisit, bukan dibaca ulang di dalam
          // tabel, supaya aksi reset punya target yang jelas dan tabel
          // ini bisa dipakai apa adanya kalau nanti dipakai di daftar
          // gabungan lintas jenjang.
          jenjang={jenjang}
          // Guru biasa — bukan admin, jalur ini tidak pernah menerima
          // `?jenjang=` dari URL sama sekali (lihat routing di bawah).
          isAdmin={false}
          soalList={soalList}
          rows={rows}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jalur ADMIN — lintas jenjang, `jenjang` SELALU eksplisit dari `?jenjang=`
// di URL (bukan cookie sesi). Fungsi guru biasa di atas SENGAJA tidak
// disentuh; dua fungsi di bawah ini murni tambahan yang dipilih lewat
// `sesi.isAdmin` di `PengolahanNilaiPage`.
//
// Daftar mapel dibaca lewat `daftarMapelSemuaJenjang()` (SUDAH ADA di
// admin-multi.ts, dipakai juga oleh /admin/monitoring) — sengaja tidak
// dibuatkan RPC baru. Detail satu mapel dibaca lewat `detailNilaiMapelAdmin()`
// yang bentuk hasilnya SENGAJA meniru persis `BarisNilai`/`SoalRingkas` di
// atas, supaya bisa langsung dioper ke <NilaiTable> yang sama tanpa
// pemetaan ulang.
// ---------------------------------------------------------------------------

async function MapelPickerAdmin({ jenjangAktif }: { jenjangAktif: Jenjang }) {
  const hasilPerJenjang = await daftarMapelSemuaJenjang();
  const dataJenjang = hasilPerJenjang.find((h) => h.jenjang === jenjangAktif);

  const events = new Map<string, { nama: string; mapel: MapelMonitoring[] }>();
  for (const m of dataJenjang?.data ?? []) {
    if (!events.has(m.event_id)) {
      events.set(m.event_id, { nama: m.event_nama, mapel: [] });
    }
    events.get(m.event_id)!.mapel.push(m);
  }

  return (
    <div>
      <div className="mb-4">
        <JenjangSwitcher
          jenjangAktif={jenjangAktif}
          // Sengaja MEMBUANG `mapelId` saat pindah jenjang — mapel milik
          // satu project, tidak valid dipakai untuk project lain. Admin
          // yang pindah jenjang selalu mendarat di daftar mapel, bukan
          // mencoba memuat mapel yang sama di database yang salah.
          buatHref={(j) => `/admin/nilai?jenjang=${j}`}
        />
      </div>

      <h1 className="mb-1 font-serif text-2xl text-ink">Pengolahan Nilai</h1>
      <p className="mb-6 text-sm text-ink/60">
        Pilih mapel untuk melihat & mengolah nilai siswa — Kelas {jenjangAktif}.
      </p>

      {dataJenjang?.error && (
        <p className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm text-danger">
          Gagal memuat daftar mapel kelas {jenjangAktif}: {dataJenjang.error}
        </p>
      )}

      {!dataJenjang?.error && events.size === 0 && (
        <p className="text-sm text-ink/50">
          Belum ada mapel di kelas {jenjangAktif}.
        </p>
      )}

      <div className="space-y-6">
        {Array.from(events.entries()).map(([eventId, ev]) => (
          <section key={eventId}>
            <h2 className="mb-2 font-serif text-base text-ink">{ev.nama}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ev.mapel.map((m) => (
                <Link
                  key={m.mapel_id}
                  href={`/admin/nilai?jenjang=${jenjangAktif}&mapelId=${m.mapel_id}`}
                  className="block rounded-lg border border-ink/10 bg-white p-4 transition-colors hover:border-gold"
                >
                  <p className="font-serif text-sm text-ink">{m.mapel_nama}</p>
                  <p className="mt-1 text-xs text-ink/50">
                    {formatWaktu(m.waktu_mulai)} – {formatWaktu(m.waktu_selesai)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

async function DetailNilaiMapelAdminView({
  jenjang,
  mapelId,
}: {
  jenjang: Jenjang;
  mapelId: string;
}) {
  const detail = await detailNilaiMapelAdmin(jenjang, mapelId);

  if (!detail.mapel) {
    return (
      <div>
        <div className="mb-4">
          <JenjangSwitcher
            jenjangAktif={jenjang}
            buatHref={(j) => `/admin/nilai?jenjang=${j}`}
          />
        </div>
        <p className="text-sm text-ink/50">
          Mapel tidak ditemukan di kelas {jenjang}.
        </p>
        <Link
          href={`/admin/nilai?jenjang=${jenjang}`}
          className="text-sm text-teal hover:underline"
        >
          ← Pilih mapel lain
        </Link>
      </div>
    );
  }

  // Bentuk `detail.soalList`/`detail.siswaList` dari detailNilaiMapelAdmin()
  // SENGAJA identik dengan `SoalRingkas`/`BarisNilai` di atas — lihat
  // komentar di admin-multi.ts — jadi tidak perlu pemetaan ulang di sini.
  const soalList: SoalRingkas[] = detail.soalList;
  const rows: BarisNilai[] = detail.siswaList;

  return (
    <div>
      <div className="mb-4">
        <JenjangSwitcher
          jenjangAktif={jenjang}
          buatHref={(j) => `/admin/nilai?jenjang=${j}`}
        />
      </div>
      <div className="mb-1">
        <Link
          href={`/admin/nilai?jenjang=${jenjang}`}
          className="text-sm text-ink/50 hover:text-ink"
        >
          ← Pilih mapel lain
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-ink">{detail.mapel.nama}</h1>
        <p className="mt-1 text-sm text-ink/60">
          {detail.mapel.eventNama} · {soalList.length} soal · {rows.length}{" "}
          siswa target
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink/50">
          Belum ada siswa yang ditarget ke mapel ini.
        </p>
      ) : (
        <NilaiTable
          mapelId={mapelId}
          mapelNama={detail.mapel.nama}
          eventNama={detail.mapel.eventNama}
          tahunAjaran={tahunAjaranDariTanggal(detail.mapel.eventTglMulai)}
          jenjang={jenjang}
          isAdmin
          soalList={soalList}
          rows={rows}
        />
      )}
    </div>
  );
}

export default async function PengolahanNilaiPage({
  searchParams,
}: {
  searchParams: { mapelId?: string; jenjang?: string };
}) {
  const sesi = await getSesiGuru();

  if (sesi.isAdmin) {
    // Default ke jenjang sesi login admin sendiri kalau belum pernah pilih
    // — bukan selalu ke kelas 7, supaya admin yang login di kelas 9 tidak
    // "terlempar" ke kelas 7 di klik pertama.
    const jenjangAktif = parseJenjang(searchParams.jenjang) ?? sesi.jenjang ?? 7;

    if (!searchParams.mapelId) {
      return <MapelPickerAdmin jenjangAktif={jenjangAktif} />;
    }
    return (
      <DetailNilaiMapelAdminView
        jenjang={jenjangAktif}
        mapelId={searchParams.mapelId}
      />
    );
  }

  // Guru biasa: jalur lama sepenuhnya tidak berubah, terkunci ke jenjang
  // sesi (cookie) — `?jenjang=` di URL diabaikan sama sekali di sini.
  if (!searchParams.mapelId) {
    return <MapelPicker />;
  }

  return <DetailNilaiMapel mapelId={searchParams.mapelId} />;
}