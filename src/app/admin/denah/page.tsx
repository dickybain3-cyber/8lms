import Link from "next/link";
import { getSesiGuru } from "@/lib/admin-guard";
import { siswaSemuaJenjangUntukDenah } from "@/lib/supabase/admin-multi-event";
import type { SiswaDenah } from "@/lib/denah";
import DenahClient from "./DenahClient";

/**
 * /admin/denah — pengacakan tempat duduk lintas jenjang, kartu peserta,
 * dan presensi.
 *
 * KENAPA HALAMAN INI KHUSUS ADMIN
 * Berbeda dari halaman /admin lain yang bekerja di dalam satu jenjang,
 * halaman ini HARUS membaca ketiga project sekaligus — memasangkan siswa
 * kelas 7 dengan kelas 8 mustahil dilakukan dari satu database. Karena
 * pembacaannya lewat service_role (melewati RLS), pintunya dikunci di
 * sini dengan `sesi.isAdmin`, sama persis seperti /admin/monitoring.
 *
 * Guru biasa tidak kehilangan apa-apa yang pernah dia punya: fitur ini
 * memang baru, dan menyusun denah ujian se-sekolah bukan pekerjaan guru
 * mata pelajaran.
 *
 * KENAPA DATA SISWA DITARIK DI SERVER, LALU DIOPER SEKALIGUS
 * Sekitar 600 baris dengan lima kolom pendek — di bawah 100 KB. Menarik
 * semuanya sekali di server jauh lebih sederhana daripada memanggil
 * server berulang kali setiap admin menekan "Acak ulang", dan membuat
 * pengacakan berjalan seketika di browser tanpa menunggu jaringan.
 * Pengacakan itu sendiri murni perhitungan (lihat src/lib/denah.ts), jadi
 * tidak ada alasan menjalankannya di server.
 */
export default async function DenahPage() {
  const sesi = await getSesiGuru();

  if (!sesi.isAdmin) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-2 font-serif text-2xl text-ink">Tempat Duduk</h1>
        <p className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm text-ink/70">
          Menu ini menyusun tempat duduk dari ketiga jenjang sekaligus, jadi
          hanya bisa dibuka akun admin. Kamu login sebagai guru
          {sesi.jenjang ? ` kelas ${sesi.jenjang}` : ""}.
        </p>
        <Link
          href="/admin"
          className="mt-4 inline-block text-sm font-medium text-teal hover:underline"
        >
          ← Kembali ke dashboard
        </Link>
      </div>
    );
  }

  const hasil = await siswaSemuaJenjangUntukDenah();

  const siswa: SiswaDenah[] = hasil.flatMap((h) =>
    h.data.map((s) => ({
      id: `${h.jenjang}:${s.id}`, // id hanya unik DI DALAM satu project —
      // diberi awalan jenjang supaya dua siswa dari project berbeda tidak
      // pernah dianggap orang yang sama saat digabung di satu array.
      nama: s.nama,
      username: s.username,
      kelasNama: s.kelasNama,
      tingkat: s.tingkat,
    }))
  );

  const gagal = hasil
    .filter((h) => h.error)
    .map((h) => ({ jenjang: h.jenjang, pesan: h.error as string }));

  return <DenahClient siswa={siswa} gagal={gagal} />;
}
