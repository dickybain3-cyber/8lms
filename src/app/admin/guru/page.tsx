import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ImportGuruForm from "./ImportGuruForm";
import AkunAksiButtons from "@/components/admin/AkunAksiButtons";
import {
  resetPasswordGuru,
  hitungDampakHapusGuru,
  deleteGuru,
} from "./actions";
import { cursorKeysetOr } from "@/lib/postgrest-filter";
import ExportAkunCsvButton from "@/components/admin/ExportAkunCsvButton";

const BATAS_BARIS = 200;

function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Ambil map auth_id -> email lewat service role client (email guru
 * disimpan di `auth.users`, bukan di tabel `guru` — lihat penjelasan
 * "guru pakai email asli" di docs/skema-database.md). Dipaginasi lewat
 * `listUsers` (bukan `getUserById` satu-satu per guru) supaya cuma
 * beberapa panggilan API walau daftar guru sudah ratusan baris.
 *
 * Gagal-lunak: kalau service role key belum diset di environment ini
 * (mis. environment build/preview tanpa akses Supabase sungguhan),
 * daftar tetap tampil tanpa kolom email alih-alih error total —
 * konsisten dengan pola "jangan diblokir kalau environment tidak
 * punya akses" di PROMPT-SESI-*.md.
 */
async function ambilEmailMap(): Promise<Map<string, string> | null> {
  try {
    const admin = createAdminClient();
    const emailMap = new Map<string, string>();
    const perPage = 200;
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error || !data) break;
      for (const u of data.users) {
        if (u.email) emailMap.set(u.id, u.email);
      }
      if (data.users.length < perPage) break;
    }
    return emailMap;
  } catch {
    return null;
  }
}

export default async function GuruPage({
  searchParams,
}: {
  searchParams: {
    cari?: string;
    cursorNama?: string; // nama baris terakhir dari halaman sebelumnya
    cursorId?: string; // id baris terakhir — tie-breaker, karena nama BISA duplikat
  };
}) {
  const supabase = createClient();

  const { count: totalGuru } = await supabase
    .from("guru")
    .select("id", { count: "exact", head: true });

  // Daftar akun yang sudah ada, dengan pagination keyset composite
  // `(nama, id)` (Sesi 12 — nunggak dari Sesi 11/PROMPT-SESI-11.md, sama
  // seperti `/admin/siswa`). Beda dari `/admin/siswa`, pencarian di sini
  // cuma satu kolom (`nama`), jadi tidak perlu digabung jadi satu `.or()`
  // nested — cukup `.ilike()` biasa (AND-composable) ditambah SATU
  // `.or()` untuk cursor kalau cursor aktif. Lihat
  // `src/lib/postgrest-filter.ts` untuk penjelasan lengkap composite key
  // dan kenapa dua `.or()` terpisah dihindari.
  let daftarQuery = supabase
    .from("guru")
    .select("id, nama, auth_id, created_at")
    .order("nama", { ascending: true })
    .order("id", { ascending: true })
    .limit(BATAS_BARIS);

  if (searchParams.cari) {
    daftarQuery = daftarQuery.ilike("nama", `%${searchParams.cari.trim()}%`);
  }

  const hasCursor = Boolean(searchParams.cursorNama && searchParams.cursorId);
  if (hasCursor) {
    daftarQuery = daftarQuery.or(
      cursorKeysetOr("nama", searchParams.cursorNama!, searchParams.cursorId!)
    );
  }

  const { data: guruListRaw, error } = await daftarQuery;
  const guruList = guruListRaw ?? [];
  const emailMap = await ambilEmailMap();

  const adaFilter = Boolean(searchParams.cari);

  // Query string untuk link "Muat lebih banyak".
  const nextPageParams = new URLSearchParams();
  if (searchParams.cari) nextPageParams.set("cari", searchParams.cari);
  if (guruList.length > 0) {
    const last = guruList[guruList.length - 1];
    nextPageParams.set("cursorNama", last.nama);
    nextPageParams.set("cursorId", last.id);
  }
  const nextPageQuery = nextPageParams.toString();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-ink">Akun Guru</h1>
          <p className="mt-1 text-sm text-ink/60">
            {totalGuru ?? 0} akun guru sudah terdaftar saat ini. Siapa pun
            yang sudah punya akun guru boleh menjalankan import ini (lihat
            catatan keputusan di <code className="text-xs">actions.ts</code>).
          </p>
        </div>
      </div>

      <ImportGuruForm />

      <div className="mt-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg text-ink">Daftar akun terdaftar</h2>
            <p className="mt-1 text-sm text-ink/60">
              Cari untuk memeriksa akun yang sudah ada — mis. sebelum import
              ulang untuk menghindari baris yang gagal karena email sudah
              terdaftar.
            </p>
          </div>
          <ExportAkunCsvButton
            headers={["Nama", "Email", "Terdaftar"]}
            rows={guruList.map((g) => [
              g.nama,
              emailMap?.get(g.auth_id) ?? "",
              formatTanggal(g.created_at),
            ])}
            filename="akun-guru.csv"
          />
        </div>

        <form
          method="get"
          className="mb-4 mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-ink/10 bg-white p-4"
        >
          <div>
            <label className="mb-1 block text-xs text-ink/60">
              Cari nama
            </label>
            <input
              type="text"
              name="cari"
              defaultValue={searchParams.cari ?? ""}
              placeholder="mis. sari"
              className="rounded-md border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink placeholder:text-ink/30"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light"
          >
            Terapkan
          </button>
          {adaFilter && (
            <a
              href="/admin/guru"
              className="text-sm text-ink/50 underline hover:text-ink"
            >
              Reset filter
            </a>
          )}
        </form>

        {error && (
          <p className="mb-4 text-sm text-danger">
            Gagal memuat daftar akun guru.
          </p>
        )}

        {!error && guruList.length === 0 && (
          <p className="text-sm text-ink/50">
            {adaFilter || hasCursor
              ? "Tidak ada akun yang cocok dengan filter ini."
              : "Belum ada akun guru yang terdaftar."}
          </p>
        )}

        {guruList.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-ink/10 bg-white">
            {/* overflow-x-auto di div terpisah — lihat komentar identik di
                src/app/admin/siswa/page.tsx (Sesi 14) untuk alasan kenapa
                ini butuh dua layer div, bukan cuma tambah class ke div
                luar. */}
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-paper-dark/40 text-xs text-ink/50">
                  <th className="px-4 py-2 font-medium">Nama</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Terdaftar</th>
                  <th className="px-4 py-2 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {guruList.map((g) => {
                  const email = emailMap?.get(g.auth_id);
                  return (
                    <tr key={g.id} className="border-b border-ink/5 last:border-0">
                      <td className="px-4 py-2 text-ink">{g.nama}</td>
                      <td className="px-4 py-2 text-ink/70">
                        {email ?? (emailMap ? "—" : "(tidak tersedia)")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-ink/70">
                        {formatTanggal(g.created_at)}
                      </td>
                      <td className="px-4 py-2">
                        <AkunAksiButtons
                          kind="guru"
                          id={g.id}
                          label={`${g.nama} (${email ?? "email tidak tersedia"})`}
                          // Fallback ke `nama` kalau email tidak bisa dimuat
                          // (service role key belum diset di environment
                          // ini, lihat `ambilEmailMap`) — supaya kolom
                          // konfirmasi ketik-ulang tetap punya nilai yang
                          // valid untuk diketik, bukan string kosong yang
                          // otomatis "cocok" dengan apa pun.
                          nilaiKonfirmasi={email ?? g.nama}
                          resetAction={resetPasswordGuru}
                          deleteAction={deleteGuru}
                          hitungDampakAction={hitungDampakHapusGuru}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {emailMap === null && guruList.length > 0 && (
          <p className="mt-3 text-xs text-ink/40">
            Kolom email tidak bisa dimuat di environment ini
            (`SUPABASE_SERVICE_ROLE_KEY` belum diset) — daftar nama & tanggal
            tetap tampil.
          </p>
        )}

        {hasCursor && (
          <p className="mt-3 text-xs text-ink/40">
            Menampilkan baris setelah &quot;{searchParams.cursorNama}&quot; —
            hasil dari klik &quot;Muat lebih banyak&quot;.
          </p>
        )}

        {guruList.length === BATAS_BARIS && (
          <div className="mt-3 flex items-center gap-3">
            <a
              href={`/admin/guru?${nextPageQuery}`}
              className="rounded-md border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink/30"
            >
              Muat lebih banyak →
            </a>
            <p className="text-xs text-ink/40">
              Menampilkan {BATAS_BARIS} akun di halaman ini (urut nama).
              Persempit dengan pencarian di atas, atau klik tombol ini untuk
              memuat akun berikutnya.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
