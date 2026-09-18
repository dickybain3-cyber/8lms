import { createClient } from "@/lib/supabase/server";
import type { LogAktivitas } from "@/types";

export const dynamic = "force-dynamic";

const ENTITAS_LIST = [
  { value: "event", label: "Event" },
  { value: "mapel", label: "Mapel" },
  { value: "soal", label: "Soal" },
  { value: "nilai", label: "Nilai" },
  { value: "siswa", label: "Siswa" },
  { value: "guru", label: "Guru" },
] as const;

const BATAS_BARIS = 100;

function formatWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Warna badge per entitas — murni kosmetik, tidak ada makna lain. */
function warnaEntitas(entitas: string): string {
  switch (entitas) {
    case "event":
      return "bg-ink/10 text-ink";
    case "mapel":
    case "siswa":
      return "bg-teal/10 text-teal";
    case "soal":
    case "guru":
      return "bg-gold/10 text-gold-dark";
    case "nilai":
      return "bg-ok/10 text-ok";
    default:
      return "bg-ink/10 text-ink/60";
  }
}

/** Warna badge per aksi — insert/import = hijau, update/override = emas, delete = merah. */
function warnaAksi(aksi: string): string {
  if (aksi === "delete") return "bg-danger/10 text-danger";
  if (aksi === "insert" || aksi.startsWith("import_")) return "bg-ok/10 text-ok";
  return "bg-gold/10 text-gold-dark";
}

/**
 * Terjemahkan satu baris log jadi kalimat manusiawi. Bergantung pada
 * bentuk `detail_jsonb` yang didokumentasikan per trigger/pemanggilan
 * manual di `0009_log_aktivitas.sql` — kalau bentuk itu berubah nanti,
 * fungsi ini yang perlu ikut disesuaikan.
 *
 * `namaSiswaMap` dipakai khusus baris `nilai`/`override_nilai`, yang cuma
 * menyimpan `siswa_id` mentah di detail_jsonb (lihat komentar trigger) —
 * di-lookup terpisah supaya tidak perlu join per baris.
 */
function ringkasanBaris(
  log: LogAktivitas,
  namaSiswaMap: Map<string, string>
): string {
  const d = log.detail_jsonb as Record<string, unknown>;
  const nama = (key: string) => String(d[key] ?? "");

  switch (log.entitas) {
    case "event": {
      const kata =
        log.aksi === "insert"
          ? "Membuat"
          : log.aksi === "delete"
            ? "Menghapus"
            : "Mengubah";
      return `${kata} event "${nama("nama")}"`;
    }
    case "mapel": {
      const kata =
        log.aksi === "insert"
          ? "Menambah"
          : log.aksi === "delete"
            ? "Menghapus"
            : "Mengubah";
      return `${kata} mapel "${nama("nama")}"`;
    }
    case "soal": {
      const tipe = nama("tipe");
      const preview = nama("preview");
      const cuplikan = preview ? `: "${preview}${preview.length >= 120 ? "…" : ""}"` : "";
      if (log.aksi === "insert") return `Menambah soal (${tipe})${cuplikan}`;
      if (log.aksi === "delete") return `Menghapus soal (${tipe})${cuplikan}`;
      const kontenBerubah = d.konten_berubah === true;
      return `Mengubah soal (${tipe})${cuplikan}${
        kontenBerubah ? " — isi/kunci jawaban berubah" : " — cuma skor"
      }`;
    }
    case "nilai": {
      if (log.aksi === "hitung_ulang_nilai") {
        return `Menghitung ulang nilai (${nama("jumlah_siswa")} siswa terpengaruh)`;
      }
      const siswaId = nama("siswa_id");
      const namaSiswa = namaSiswaMap.get(siswaId) ?? siswaId;
      return `Mengubah nilai ${namaSiswa} secara manual menjadi ${nama("total_skor")}`;
    }
    case "siswa":
      // Dua jenis aksi berbeda memakai entitas "siswa" yang sama (Sesi 11
      // menambah reset_password_siswa di samping import_siswa yang sudah
      // ada sejak Sesi 6) — dibedakan lewat log.aksi, bukan bentuk
      // detail_jsonb, karena keduanya sama-sama punya key "nama" tapi
      // maknanya beda (nama file batch vs nama satu siswa).
      if (log.aksi === "reset_password_siswa") {
        return `Reset password siswa "${nama("nama")}" (${nama("username")})`;
      }
      return `Import massal akun siswa: ${nama("jumlah_berhasil")} berhasil, ${nama(
        "jumlah_dilewati"
      )} dilewati (dari ${nama("jumlah_baris")} baris)`;
    case "guru":
      if (log.aksi === "reset_password_guru") {
        const email = nama("email");
        return `Reset password guru "${nama("nama")}"${email ? ` (${email})` : ""}`;
      }
      return `Import massal akun guru: ${nama("jumlah_berhasil")} berhasil, ${nama(
        "jumlah_dilewati"
      )} dilewati (dari ${nama("jumlah_baris")} baris)`;
    default:
      return `${log.aksi} ${log.entitas}`;
  }
}

export default async function LogAktivitasPage({
  searchParams,
}: {
  searchParams: {
    entitas?: string;
    guruId?: string;
    dari?: string;
    sampai?: string;
    cursor?: string; // ISO timestamp created_at baris terakhir dari halaman sebelumnya
  };
}) {
  const supabase = createClient();

  const { data: guruList } = await supabase
    .from("guru")
    .select("id, nama")
    .order("nama");

  let query = supabase
    .from("log_aktivitas")
    .select("id, guru_id, aksi, entitas, entitas_id, detail_jsonb, created_at")
    .order("created_at", { ascending: false })
    .limit(BATAS_BARIS);

  if (searchParams.entitas) {
    query = query.eq("entitas", searchParams.entitas);
  }
  if (searchParams.guruId) {
    query = query.eq("guru_id", searchParams.guruId);
  }
  if (searchParams.dari) {
    query = query.gte("created_at", new Date(searchParams.dari).toISOString());
  }
  if (searchParams.sampai) {
    // Akhir hari (23:59:59) supaya tanggal "sampai" ikut lengkap
    // termasuk, bukan cuma jam 00:00 di tanggal itu.
    const sampai = new Date(searchParams.sampai);
    sampai.setHours(23, 59, 59, 999);
    query = query.lte("created_at", sampai.toISOString());
  }
  // Pagination keyset (Sesi 10 — nunggak dari Sesi 9, sebelumnya dibatasi
  // 100 baris terbaru tanpa cara melihat baris yang lebih lama). Dipilih
  // keyset (`created_at < cursor`) alih-alih offset (`page * 100`) supaya
  // baris log baru yang masuk di antara dua klik "Muat lebih lama" tidak
  // menggeser/menduplikasi baris pada halaman berikutnya — offset
  // pagination rawan pergeseran itu kalau tabel terus bertambah (log
  // append-only, jadi ini realistis terjadi tepat saat guru sedang
  // menelusuri riwayat). Trade-off yang diterima: hanya bisa maju
  // ("lebih lama"), tidak ada tombol "kembali ke lebih baru" langsung —
  // guru yang perlu itu tinggal hapus parameter `cursor` dari URL atau
  // klik ulang salah satu link filter di atas untuk mulai dari awal lagi.
  if (searchParams.cursor) {
    const cursorDate = new Date(searchParams.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      query = query.lt("created_at", cursorDate.toISOString());
    }
  }

  const { data: logListRaw, error } = await query;
  const logList = (logListRaw ?? []) as LogAktivitas[];

  // Lookup nama siswa untuk baris nilai/override_nilai (lihat komentar
  // ringkasanBaris) — dikumpulkan dulu semua siswa_id yang relevan,
  // sekali query, bukan satu-satu per baris.
  const siswaIds = Array.from(
    new Set(
      logList
        .filter((l) => l.entitas === "nilai" && l.aksi === "override_nilai")
        .map((l) => String((l.detail_jsonb as Record<string, unknown>).siswa_id ?? ""))
        .filter(Boolean)
    )
  );
  const { data: siswaData } =
    siswaIds.length > 0
      ? await supabase.from("siswa").select("id, nama").in("id", siswaIds)
      : { data: [] as { id: string; nama: string }[] };
  const namaSiswaMap = new Map((siswaData ?? []).map((s) => [s.id, s.nama]));

  const guruNamaMap = new Map((guruList ?? []).map((g) => [g.id, g.nama]));

  // Query string untuk link "Muat riwayat lebih lama" — bawa semua filter
  // yang aktif, ganti `cursor` ke created_at baris terakhir yang sedang
  // ditampilkan.
  const nextPageParams = new URLSearchParams();
  if (searchParams.entitas) nextPageParams.set("entitas", searchParams.entitas);
  if (searchParams.guruId) nextPageParams.set("guruId", searchParams.guruId);
  if (searchParams.dari) nextPageParams.set("dari", searchParams.dari);
  if (searchParams.sampai) nextPageParams.set("sampai", searchParams.sampai);
  if (logList.length > 0) {
    nextPageParams.set("cursor", logList[logList.length - 1].created_at);
  }
  const nextPageQuery = nextPageParams.toString();

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-ink">Log Aktivitas</h1>
        <p className="mt-1 text-sm text-ink/60">
          Riwayat perubahan yang dilakukan guru/admin — event, mapel, soal,
          override nilai, dan import akun. Tidak mencatat aktivitas siswa
          (submit ujian dianggap di luar cakupan riwayat ini).
        </p>
      </div>

      {/* Filter murni GET query param, tanpa JS — konsisten dengan pola
          navigasi query-param di /admin/nilai (MapelPicker). */}
      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-ink/10 bg-white p-4"
      >
        <div>
          <label className="mb-1 block text-xs text-ink/60">Entitas</label>
          <select
            name="entitas"
            defaultValue={searchParams.entitas ?? ""}
            className="rounded-md border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink"
          >
            <option value="">Semua entitas</option>
            {ENTITAS_LIST.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-ink/60">Guru</label>
          <select
            name="guruId"
            defaultValue={searchParams.guruId ?? ""}
            className="rounded-md border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink"
          >
            <option value="">Semua guru</option>
            {(guruList ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.nama}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-ink/60">Dari tanggal</label>
          <input
            type="date"
            name="dari"
            defaultValue={searchParams.dari ?? ""}
            className="rounded-md border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-ink/60">Sampai tanggal</label>
          <input
            type="date"
            name="sampai"
            defaultValue={searchParams.sampai ?? ""}
            className="rounded-md border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light"
        >
          Terapkan
        </button>
        {(searchParams.entitas ||
          searchParams.guruId ||
          searchParams.dari ||
          searchParams.sampai) && (
          <a
            href="/admin/log"
            className="text-sm text-ink/50 underline hover:text-ink"
          >
            Reset filter
          </a>
        )}
      </form>

      {error && (
        <p className="mb-4 text-sm text-danger">
          Gagal memuat log aktivitas. Pastikan kamu login sebagai guru.
        </p>
      )}

      {!error && logList.length === 0 && (
        <p className="text-sm text-ink/50">
          Belum ada aktivitas yang cocok dengan filter ini.
        </p>
      )}

      {logList.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-paper-dark/40 text-xs text-ink/50">
                <th className="px-4 py-2 font-medium">Waktu</th>
                <th className="px-4 py-2 font-medium">Guru</th>
                <th className="px-4 py-2 font-medium">Entitas</th>
                <th className="px-4 py-2 font-medium">Aksi</th>
                <th className="px-4 py-2 font-medium">Ringkasan</th>
              </tr>
            </thead>
            <tbody>
              {logList.map((log) => {
                const olehNama =
                  (log.detail_jsonb as Record<string, unknown>).oleh_nama;
                const namaGuru =
                  (log.guru_id ? guruNamaMap.get(log.guru_id) : null) ??
                  (typeof olehNama === "string" ? olehNama : null) ??
                  "(guru tidak diketahui)";
                return (
                  <tr key={log.id} className="border-b border-ink/5 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-ink/70">
                      {formatWaktu(log.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-ink">
                      {namaGuru}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${warnaEntitas(
                          log.entitas
                        )}`}
                      >
                        {log.entitas}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${warnaAksi(
                          log.aksi
                        )}`}
                      >
                        {log.aksi}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-ink/80">
                      {ringkasanBaris(log, namaSiswaMap)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {searchParams.cursor && (
        <p className="mt-3 text-xs text-ink/40">
          Menampilkan baris sebelum{" "}
          {formatWaktu(searchParams.cursor)} — hasil dari klik &quot;Muat
          riwayat lebih lama&quot;.
        </p>
      )}

      {logList.length === BATAS_BARIS && (
        <div className="mt-3 flex items-center gap-3">
          <a
            href={`/admin/log?${nextPageQuery}`}
            className="rounded-md border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink/30"
          >
            Muat riwayat lebih lama →
          </a>
          <p className="text-xs text-ink/40">
            Menampilkan {BATAS_BARIS} baris yang cocok dengan filter ini.
            Persempit filter tanggal/entitas/guru di atas untuk pencarian
            lebih spesifik, atau klik tombol ini untuk melihat riwayat yang
            lebih lama.
          </p>
        </div>
      )}
    </div>
  );
}
