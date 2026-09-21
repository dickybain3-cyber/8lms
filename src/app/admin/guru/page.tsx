import { createClient } from "@/lib/supabase/server";
import { getSesiGuru } from "@/lib/admin-guard";
import ImportGuruForm from "./ImportGuruForm";
import TambahGuruManualForm from "./TambahGuruManualForm";
import AkunAksiButtons from "@/components/admin/AkunAksiButtons";
import {
  resetPasswordGuru,
  hitungDampakHapusGuru,
  deleteGuru,
} from "./actions";
import { cursorKeysetOr } from "@/lib/postgrest-filter";
import ExportAkunCsvButton from "@/components/admin/ExportAkunCsvButton";
import { UnduhDetailGuruButton } from "@/components/admin/ExportExcel";

const BATAS_BARIS = 200;

function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * ── REVISI: TIDAK PERLU `ambilEmailMap` / `listUsers` LAGI ──
 *
 * Versi sebelumnya harus memanggil `admin.auth.admin.listUsers` halaman
 * demi halaman untuk menampilkan kolom "Email", karena guru login pakai
 * email asli yang cuma tersimpan di `auth.users`. Sejak migrasi 0015,
 * identitas guru yang relevan (NIP/username) ada LANGSUNG di kolom
 * tabel `guru`, jadi halaman ini sekarang murni satu query `select`
 * biasa — lebih cepat dan tidak lagi butuh service role key hanya
 * untuk menampilkan daftar.
 */
export default async function GuruPage({
  searchParams,
}: {
  searchParams: {
    cari?: string;
    cursorNama?: string;
    cursorId?: string;
  };
}) {
  const supabase = createClient();
  // Tombol "Unduh detail guru" (Tahap 2) khusus is_admin — kolomnya berisi
  // status password, jadi disembunyikan untuk guru biasa. Ini cuma soal
  // TAMPILAN; penjaga sungguhan ada di server action `ambilDetailGuruSemuaJenjang()`
  // (src/app/admin/actions-export.ts), bukan di sini.
  const sesi = await getSesiGuru();

  const { count: totalGuru } = await supabase
    .from("guru")
    .select("id", { count: "exact", head: true });

  let daftarQuery = supabase
    .from("guru")
    .select("id, nama, nip, username, created_at")
    .order("nama", { ascending: true })
    .order("id", { ascending: true })
    .limit(BATAS_BARIS);

  if (searchParams.cari) {
    const cari = searchParams.cari.trim();
    // `.or()` dua kolom: nama ATAU nip/username — pencarian yang
    // sengaja longgar karena admin di lapangan kadang mengetik NIP,
    // kadang nama, jarang keduanya sekaligus untuk siswa/guru yang sama.
    daftarQuery = daftarQuery.or(
      `nama.ilike.%${cari}%,username.ilike.%${cari}%,nip.ilike.%${cari}%`
    );
  }

  const hasCursor = Boolean(searchParams.cursorNama && searchParams.cursorId);
  if (hasCursor) {
    daftarQuery = daftarQuery.or(
      cursorKeysetOr("nama", searchParams.cursorNama!, searchParams.cursorId!)
    );
  }

  const { data: guruListRaw, error } = await daftarQuery;
  const guruList = guruListRaw ?? [];

  const adaFilter = Boolean(searchParams.cari);

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
            {totalGuru ?? 0} akun guru sudah terdaftar. Login memakai{" "}
            <b>username</b> — awalnya sama dengan NIP, dan guru bisa
            menggantinya sendiri di menu Profil Saya. Password awal untuk
            akun baru selalu{" "}
            <code className="rounded bg-ink/5 px-1">guru123456</code>.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <TambahGuruManualForm />
        <ImportGuruForm />
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg text-ink">Daftar akun terdaftar</h2>
            <p className="mt-1 text-sm text-ink/60">
              Cari nama atau NIP untuk memeriksa akun yang sudah ada.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportAkunCsvButton
              headers={["Nama", "NIP", "Username", "Terdaftar"]}
              rows={guruList.map((g) => [
                g.nama,
                g.nip ?? "",
                g.username ?? "",
                formatTanggal(g.created_at),
              ])}
              filename="akun-guru.csv"
            />
            {sesi.isAdmin && <UnduhDetailGuruButton />}
          </div>
        </div>

        <form
          method="get"
          className="mb-4 mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-ink/10 bg-white p-4"
        >
          <div>
            <label className="mb-1 block text-xs text-ink/60">
              Cari nama / NIP
            </label>
            <input
              type="text"
              name="cari"
              defaultValue={searchParams.cari ?? ""}
              placeholder="mis. sari atau 1965..."
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-paper-dark/40 text-xs text-ink/50">
                    <th className="px-4 py-2 font-medium">Nama</th>
                    <th className="px-4 py-2 font-medium">NIP</th>
                    <th className="px-4 py-2 font-medium">Username</th>
                    <th className="px-4 py-2 font-medium">Terdaftar</th>
                    <th className="px-4 py-2 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {guruList.map((g) => (
                    <tr key={g.id} className="border-b border-ink/5 last:border-0">
                      <td className="px-4 py-2 text-ink">{g.nama}</td>
                      <td className="px-4 py-2 text-ink/70">
                        {g.nip ?? <span className="text-ink/30">—</span>}
                      </td>
                      <td className="px-4 py-2 text-ink/70">
                        {g.username ?? (
                          <span className="text-ink/30" title="Akun lama, masih login pakai email asli">
                            (pakai email)
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-ink/70">
                        {formatTanggal(g.created_at)}
                      </td>
                      <td className="px-4 py-2">
                        <AkunAksiButtons
                          kind="guru"
                          id={g.id}
                          label={`${g.nama} (${g.username ?? "email lama"})`}
                          nilaiKonfirmasi={g.username ?? g.nama}
                          resetAction={resetPasswordGuru}
                          deleteAction={deleteGuru}
                          hitungDampakAction={hitungDampakHapusGuru}
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
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
