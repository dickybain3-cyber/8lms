import { LOGO_URL, SEKOLAH } from "@/lib/branding";
import { barisPresensi, type HasilDenah, type Kursi, type RuangHasil } from "@/lib/denah";

/**
 * LEMBAR CETAK: kartu peserta, daftar hadir, dan denah ruang.
 *
 * ── KENAPA DIPISAH KE BERKAS SENDIRI ──
 *
 * Markup cetakan ini semula tinggal di dalam `app/admin/denah/DenahClient.tsx`
 * sebagai fungsi lokal. Begitu halaman "Pembagian Ruang Ujian" (di dalam
 * kegiatan) juga perlu mencetak kartu dan daftar hadir yang SAMA, menyalin
 * markup-nya ke sana akan melahirkan dua versi kartu peserta yang lambat
 * laun berbeda — dan bedanya baru ketahuan setelah 600 lembar tercetak,
 * saat kartu yang dipegang siswa tidak cocok dengan daftar hadir yang
 * dipegang pengawas. Satu berkas bersama menutup kemungkinan itu.
 *
 * Semua ukuran di kelas CSS-nya (lihat bagian bawah `globals.css`) dalam
 * milimeter, karena keluarannya memang kertas, bukan layar.
 *
 * Desainnya sengaja "resmi tapi sunyi": satu hal saja yang dibuat besar,
 * yaitu KODE KURSI. Itu satu-satunya informasi yang dicari siswa sambil
 * berdiri di depan pintu ruang dengan kartu di tangan — nama dan kelasnya
 * sudah dia tahu. Sisanya kecil dan rata supaya tidak berebut perhatian.
 */

export function KartuPeserta({
  kursi,
  ruangNama,
  namaKegiatan,
}: {
  kursi: Kursi;
  ruangNama: string;
  namaKegiatan: string;
}) {
  return (
    <div className="kartu-peserta">
      <div className="kartu-kepala">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_URL} alt="" className="kartu-logo" />
        <div>
          <p className="kartu-sekolah">
            {SEKOLAH.nama} {SEKOLAH.kota}
          </p>
          <p className="kartu-kegiatan">{namaKegiatan}</p>
        </div>
      </div>

      <div className="kartu-isi">
        <div className="kartu-identitas">
          <p className="kartu-label">Nama peserta</p>
          <p className="kartu-nama">{kursi.siswa.nama}</p>
          <table className="kartu-tabel">
            <tbody>
              <tr>
                <td>Kelas</td>
                <td>{kursi.siswa.kelasNama}</td>
              </tr>
              <tr>
                <td>Username</td>
                <td className="kartu-mono">{kursi.siswa.username}</td>
              </tr>
              <tr>
                <td>Ruang</td>
                <td>{ruangNama}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="kartu-kursi">
          <p className="kartu-label">Kursi</p>
          <p className="kartu-kode">{kursi.kode}</p>
          <p className="kartu-nomor">No. urut {kursi.nomorUrut}</p>
        </div>
      </div>

      <p className="kartu-kaki">
        Bawa kartu ini setiap sesi · Duduk hanya di kursi yang tertulis ·
        Kehilangan kartu lapor ke pengawas
      </p>
    </div>
  );
}

export function LembarKartu({
  hasil,
  namaKegiatan,
}: {
  hasil: HasilDenah;
  namaKegiatan: string;
}) {
  return (
    <div className="lembar-kartu">
      {hasil.ruang.flatMap((r) =>
        r.kursi.map((k) => (
          <KartuPeserta
            key={k.kode + k.siswa.id}
            kursi={k}
            ruangNama={r.nama}
            namaKegiatan={namaKegiatan}
          />
        ))
      )}
    </div>
  );
}

export function TabelPresensi({
  ruang,
  namaKegiatan,
}: {
  ruang: RuangHasil;
  namaKegiatan: string;
}) {
  const baris = barisPresensi(ruang);
  return (
    <section className="lembar-presensi">
      <header className="presensi-kepala">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_URL} alt="" className="presensi-logo" />
        <div>
          <p className="presensi-judul">Daftar Hadir Peserta</p>
          <p className="presensi-sub">
            {namaKegiatan} · {SEKOLAH.nama} {SEKOLAH.kota}
          </p>
        </div>
        <p className="presensi-ruang">{ruang.nama}</p>
      </header>

      <table className="presensi-tabel">
        <thead>
          <tr>
            <th className="w-10">No</th>
            <th className="w-20">Kursi</th>
            <th>Nama</th>
            <th className="w-20">Kelas</th>
            <th className="w-32">Username</th>
            <th className="w-32">Tanda tangan</th>
          </tr>
        </thead>
        <tbody>
          {baris.map((k, i) => (
            <tr key={k.kode + k.siswa.id}>
              <td className="tengah">{k.nomorUrut}</td>
              <td className="tengah mono">{k.kode}</td>
              <td>{k.siswa.nama}</td>
              <td className="tengah">{k.siswa.kelasNama}</td>
              <td className="mono">{k.siswa.username}</td>
              <td className="ttd">{i % 2 === 0 ? "" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="presensi-kaki">
        <div>
          <p>Jumlah hadir: ............ dari {baris.length} peserta</p>
          <p>Catatan pengawas: ................................................</p>
        </div>
        <div className="presensi-ttd">
          <p>Pengawas ruang</p>
          <div className="presensi-garis" />
          <p>Nama &amp; NIP</p>
        </div>
      </footer>
    </section>
  );
}

export function LembarPresensi({
  hasil,
  namaKegiatan,
}: {
  hasil: HasilDenah;
  namaKegiatan: string;
}) {
  return (
    <div>
      {hasil.ruang.map((r) => (
        <TabelPresensi key={r.nama} ruang={r} namaKegiatan={namaKegiatan} />
      ))}
    </div>
  );
}

export function LembarDenah({
  hasil,
  namaKegiatan,
}: {
  hasil: HasilDenah;
  namaKegiatan: string;
}) {
  return (
    <div>
      {hasil.ruang.map((r) => (
        <section key={r.nama} className="lembar-presensi">
          <header className="presensi-kepala">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="" className="presensi-logo" />
            <div>
              <p className="presensi-judul">Denah Tempat Duduk</p>
              <p className="presensi-sub">
                {namaKegiatan} · {SEKOLAH.nama} {SEKOLAH.kota}
              </p>
            </div>
            <p className="presensi-ruang">{r.nama}</p>
          </header>

          <div className="denah-grid">
            {r.meja.map((m) => (
              <div key={m.nomor} className="denah-meja">
                <p className="denah-nomor">Meja {m.nomor}</p>
                {m.kursi.map((k) => (
                  <p key={k.kode} className="denah-siswa">
                    <b>{k.posisi}</b> {k.siswa.nama}{" "}
                    <span className="denah-kelas">{k.siswa.kelasNama}</span>
                  </p>
                ))}
              </div>
            ))}
          </div>

          <p className="denah-kaki">Papan tulis / meja pengawas di depan</p>
        </section>
      ))}
    </div>
  );
}
