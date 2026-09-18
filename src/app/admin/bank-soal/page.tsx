import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSesiGuru } from "@/lib/admin-guard";
import { JENJANG_LABEL, parseJenjang } from "@/lib/jenjang";
import JenjangSwitcher from "@/components/admin/JenjangSwitcher";
import BadgeJenjang from "@/components/admin/BadgeJenjang";
import { cariBankSoal, daftarMapelBank } from "@/lib/bank-soal";
import { Info, KepalaHalaman } from "@/components/ui/Panel";
import BankSoalClient from "./BankSoalClient";

/**
 * Bank Soal — arsip soal lintas kegiatan.
 *
 * ── SATU BANK PER JENJANG, BUKAN SATU BANK UNTUK SEMUA ──
 *
 * Tabel `bank_soal` hidup di dalam masing-masing dari tiga project
 * Supabase (kelas 7/8/9), sama seperti seluruh data lain sejak Sesi 16.
 * Artinya bank kelas 7 dan bank kelas 8 memang terpisah, dan itu yang
 * benar: soal kelas 7 tidak ada gunanya untuk kelas 9, dan mencampurnya
 * hanya membuat daftar pencarian penuh soal yang tidak relevan.
 *
 * Admin yang perlu melihat bank jenjang lain memakai pemilih jenjang di
 * atas, persis seperti di halaman lain — bukan satu daftar gabungan.
 *
 * Muatan awal (mapel + 200 soal terbaru) dirender di SERVER supaya
 * halaman langsung berisi saat dibuka. Penyaringan dan pencarian
 * berikutnya dikerjakan lewat server action dari komponen klien —
 * lihat alasannya di BankSoalClient.
 */
export default async function BankSoalPage({
  searchParams,
}: {
  searchParams: { jenjang?: string };
}) {
  const sesi = await getSesiGuru();
  const jenjangQuery = parseJenjang(searchParams.jenjang);

  // Ditulis sebagai satu nilai `Jenjang | null`, bukan boolean `modeAdmin`
  // terpisah: TypeScript tidak bisa menyempitkan `jenjangQuery` lewat
  // variabel boolean lain, jadi `createAdminClient(jenjangQuery)` akan
  // ditolak karena masih mungkin null. Bentuk ini menyempitkannya langsung.
  const jenjangAdmin = sesi.isAdmin ? jenjangQuery : null;
  const client = jenjangAdmin
    ? createAdminClient(jenjangAdmin)
    : createClient();

  const [mapelAwal, soalAwal] = await Promise.all([
    daftarMapelBank(client),
    cariBankSoal(client, { limit: 200 }),
  ]);

  const jenjangTampil = jenjangAdmin ?? sesi.jenjang;

  return (
    <div>
      {jenjangAdmin && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <JenjangSwitcher
            jenjangAktif={jenjangAdmin}
            buatHref={(j) => `/admin/bank-soal?jenjang=${j}`}
          />
          <BadgeJenjang jenjang={jenjangAdmin} />
        </div>
      )}

      <KepalaHalaman
        judul="Bank Soal"
        ikon="fa-box-archive"
        keterangan={
          <>
            Arsip semua soal yang pernah dibuat
            {jenjangTampil ? ` di ${JENJANG_LABEL[jenjangTampil]}` : ""} —
            bisa dipakai lagi di kegiatan mana pun.
          </>
        }
      />

      {mapelAwal.length === 0 ? (
        <Info nada="info">
          Bank masih kosong, dan akan terisi dengan sendirinya: setiap soal
          yang kamu simpan lewat menu Kegiatan otomatis diarsipkan ke sini.
          Tidak ada tombol yang perlu ditekan.
          <br />
          <span className="text-[0.78rem] opacity-80">
            Kalau kamu sudah membuat soal tapi halaman ini tetap kosong,
            kemungkinan besar migrasi <code>0014_bank_soal.sql</code> belum
            dijalankan di project jenjang ini.
          </span>
        </Info>
      ) : (
        <Info nada="info">
          Soal di sini adalah SALINAN. Memakainya di kegiatan lain, atau
          mengedit soal di kegiatan, tidak saling mengubah — jadi ujian
          yang sudah dinilai tidak akan pernah berubah isinya di belakang
          layar.
        </Info>
      )}

      <BankSoalClient
        jenjang={jenjangAdmin}
        mapelAwal={mapelAwal}
        soalAwal={soalAwal}
        bisaLintasJenjang={sesi.isAdmin}
      />
    </div>
  );
}
