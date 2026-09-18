import { createClient } from "@/lib/supabase/server";
import ImportSiswaForm from "./ImportSiswaForm";
import TambahSiswaManualForm from "./TambahSiswaManualForm";
import AkunAksiButtons from "@/components/admin/AkunAksiButtons";
import {
  resetPasswordSiswa,
  hitungDampakHapusSiswa,
  deleteSiswa,
} from "./actions";
import { cursorKeysetOr, escapePostgrestValue } from "@/lib/postgrest-filter";
import ExportAkunCsvButton from "@/components/admin/ExportAkunCsvButton";

const BATAS_BARIS = 200;

function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function SiswaPage({
  searchParams,
}: {
  searchParams: {
    cari?: string;
    kelasId?: string;
    cursorNama?: string; // nama baris terakhir dari halaman sebelumnya
    cursorId?: string; // id baris terakhir — tie-breaker, karena nama BISA duplikat
  };
}) {
  const supabase = createClient();

  const { data: kelasList } = await supabase
    .from("kelas")
    .select("id, nama")
    .order("nama");

  const { count: totalSiswa } = await supabase
    .from("siswa")
    .select("id", { count: "exact", head: true });

  // Daftar akun yang sudah ada, dengan pagination keyset composite
  // `(nama, id)` (Sesi 12 — nunggak dari Sesi 11/PROMPT-SESI-11.md).
  //
  // Beda dari `/admin/log` (Sesi 10) yang cursor-nya `created_at`
  // tunggal: `nama` siswa BISA duplikat antar baris (dua siswa beda
  // kelas boleh sekelas nama), jadi `nama > cursor` saja bisa
  // melewati/mengulang baris yang nama-nya persis sama dengan cursor.
  // Solusinya tie-break pakai `id` (selalu unik): baris berikutnya
  // adalah `nama > cursorNama` ATAU (`nama = cursorNama` DAN
  // `id > cursorId`) — lihat `cursorKeysetOr` di
  // `src/lib/postgrest-filter.ts`.
  let daftarQuery = supabase
    .from("siswa")
    .select("id, nama, username, kelas_id, created_at")
    .order("nama", { ascending: true })
    .order("id", { ascending: true })
    .limit(BATAS_BARIS);

  if (searchParams.kelasId) {
    daftarQuery = daftarQuery.eq("kelas_id", searchParams.kelasId);
  }

  const kata = searchParams.cari?.trim();
  const hasCursor = Boolean(searchParams.cursorNama && searchParams.cursorId);

  // Pencarian (nama ATAU username) itu sendiri sudah butuh `.or()`. Kalau
  // cursor pagination JUGA aktif, itu juga butuh `.or()` (lihat komentar
  // di postgrest-filter.ts kenapa dua kondisi OR yang beda tidak
  // dipanggil lewat dua `.or()` terpisah) — jadi keduanya digabung jadi
  // SATU ekspresi `and(or(...),or(...))` lewat SATU pemanggilan `.or()`.
  if (kata && hasCursor) {
    const kataEsc = escapePostgrestValue(`%${kata}%`);
    const cariOr = `nama.ilike.${kataEsc},username.ilike.${kataEsc}`;
    const cursorOr = cursorKeysetOr(
      "nama",
      searchParams.cursorNama!,
      searchParams.cursorId!
    );
    daftarQuery = daftarQuery.or(`and(or(${cariOr}),or(${cursorOr}))`);
  } else if (kata) {
    const kataEsc = escapePostgrestValue(`%${kata}%`);
    daftarQuery = daftarQuery.or(`nama.ilike.${kataEsc},username.ilike.${kataEsc}`);
  } else if (hasCursor) {
    daftarQuery = daftarQuery.or(
      cursorKeysetOr("nama", searchParams.cursorNama!, searchParams.cursorId!)
    );
  }

  const { data: siswaListRaw, error } = await daftarQuery;
  const siswaList = siswaListRaw ?? [];
  const kelasNamaMap = new Map((kelasList ?? []).map((k) => [k.id, k.nama]));

  const adaFilter = Boolean(searchParams.cari || searchParams.kelasId);

  // Query string untuk link "Muat lebih banyak" — bawa filter aktif,
  // ganti cursorNama/cursorId ke baris terakhir yang sedang ditampilkan.
  const nextPageParams = new URLSearchParams();
  if (searchParams.cari) nextPageParams.set("cari", searchParams.cari);
  if (searchParams.kelasId) nextPageParams.set("kelasId", searchParams.kelasId);
  if (siswaList.length > 0) {
    const last = siswaList[siswaList.length - 1];
    nextPageParams.set("cursorNama", last.nama);
    nextPageParams.set("cursorId", last.id);
  }
  const nextPageQuery = nextPageParams.toString();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-ink">Akun Siswa</h1>
          <p className="mt-1 text-sm text-ink/60">
            {totalSiswa ?? 0} akun siswa sudah terdaftar saat ini.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <TambahSiswaManualForm kelasList={kelasList ?? []} />
        <ImportSiswaForm kelasList={kelasList ?? []} />
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg text-ink">Daftar akun terdaftar</h2>
            <p className="mt-1 text-sm text-ink/60">
              Cari atau saring per kelas untuk memeriksa akun yang sudah ada —
              mis. sebelum import ulang untuk menghindari baris yang dilewati
              karena username sudah dipakai.
            </p>
          </div>
          <ExportAkunCsvButton
            headers={["Nama", "Username", "Kelas", "Terdaftar"]}
            rows={siswaList.map((s) => [
              s.nama,
              s.username,
              kelasNamaMap.get(s.kelas_id) ?? "",
              formatTanggal(s.created_at),
            ])}
            filename="akun-siswa.csv"
          />
        </div>

        <form
          method="get"
          className="mb-4 mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-ink/10 bg-white p-4"
        >
          <div>
            <label className="mb-1 block text-xs text-ink/60">
              Cari nama/username
            </label>
            <input
              type="text"
              name="cari"
              defaultValue={searchParams.cari ?? ""}
              placeholder="mis. ahmad atau ahmad.fauzi"
              className="rounded-md border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink placeholder:text-ink/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink/60">Kelas</label>
            <select
              name="kelasId"
              defaultValue={searchParams.kelasId ?? ""}
              className="rounded-md border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink"
            >
              <option value="">Semua kelas</option>
              {(kelasList ?? []).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light"
          >
            Terapkan
          </button>
          {adaFilter && (
            <a
              href="/admin/siswa"
              className="text-sm text-ink/50 underline hover:text-ink"
            >
              Reset filter
            </a>
          )}
        </form>

        {error && (
          <p className="mb-4 text-sm text-danger">
            Gagal memuat daftar akun siswa.
          </p>
        )}

        {!error && siswaList.length === 0 && (
          <p className="text-sm text-ink/50">
            {adaFilter || hasCursor
              ? "Tidak ada akun yang cocok dengan filter ini."
              : "Belum ada akun siswa yang terdaftar."}
          </p>
        )}

        {siswaList.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-ink/10 bg-white">
            {/* overflow-x-auto di div terpisah (bukan di div rounded-lg
                luar) — Sesi 14, dicatat sebagai kandidat penghalusan sejak
                Sesi 13 karena kolom "Aksi" sekarang berisi dua tombol
                berdampingan. Kalau `overflow-x-auto` digabung ke div luar
                yang sama dengan `overflow-hidden` + `rounded-lg`, sudut
                membulat akan hilang begitu konten discroll (browser cuma
                menghormati satu nilai `overflow` per elemen secara
                konsisten di kedua sumbu) — jadi dipisah jadi dua layer:
                luar tetap `overflow-hidden` untuk sudut membulat, dalam
                yang baru ini `overflow-x-auto` untuk scroll horizontal di
                layar sempit. */}
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-paper-dark/40 text-xs text-ink/50">
                  <th className="px-4 py-2 font-medium">Nama</th>
                  <th className="px-4 py-2 font-medium">Username</th>
                  <th className="px-4 py-2 font-medium">Kelas</th>
                  <th className="px-4 py-2 font-medium">Terdaftar</th>
                  <th className="px-4 py-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {siswaList.map((s) => (
                  <tr key={s.id} className="border-b border-ink/5 last:border-0">
                    <td className="px-4 py-2 text-ink">{s.nama}</td>
                    <td className="px-4 py-2 text-ink/70">{s.username}</td>
                    <td className="px-4 py-2 text-ink/70">
                      {kelasNamaMap.get(s.kelas_id) ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-ink/70">
                      {formatTanggal(s.created_at)}
                    </td>
                    <td className="px-4 py-2">
                      <AkunAksiButtons
                        kind="siswa"
                        id={s.id}
                        label={`${s.nama} (${s.username})`}
                        nilaiKonfirmasi={s.username}
                        resetAction={resetPasswordSiswa}
                        deleteAction={deleteSiswa}
                        hitungDampakAction={hitungDampakHapusSiswa}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {hasCursor && (
          <p className="mt-3 text-xs text-ink/40">
            Menampilkan baris setelah &quot;{searchParams.cursorNama}&quot; —
            hasil dari klik &quot;Muat lebih banyak&quot;.
          </p>
        )}

        {siswaList.length === BATAS_BARIS && (
          <div className="mt-3 flex items-center gap-3">
            <a
              href={`/admin/siswa?${nextPageQuery}`}
              className="rounded-md border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink/30"
            >
              Muat lebih banyak →
            </a>
            <p className="text-xs text-ink/40">
              Menampilkan {BATAS_BARIS} akun di halaman ini (urut nama).
              Persempit dengan pencarian/kelas di atas, atau klik tombol ini
              untuk memuat akun berikutnya.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
