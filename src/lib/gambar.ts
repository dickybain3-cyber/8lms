/**
 * Satu-satunya tempat yang tahu cara membentuk URL gambar Cloudinary.
 *
 * MASALAH YANG DIPECAHKAN FILE INI
 * Sebelum ini, `secure_url` mentah dari Cloudinary disimpan apa adanya ke
 * `soal.gambar_url` / `konten_jsonb.*.gambar_url`, lalu dipasang langsung
 * ke `<img src>`. Artinya: foto 4 MB hasil jepretan HP guru dikirim utuh
 * 4 MB ke HP setiap siswa. Dengan 600 siswa × beberapa soal bergambar,
 * itu puluhan GB lalu lintas dan halaman yang berat dibuka di jaringan
 * sekolah — persis kondisi hari Sabtu.
 *
 * Cloudinary bisa melakukan transformasi on-the-fly lewat URL: cukup
 * menyisipkan segmen transformasi setelah `/upload/`. Jadi satu gambar
 * yang sama bisa dilayani kecil untuk HP dan besar untuk mode perbesar,
 * tanpa upload ulang dan tanpa mengubah data yang sudah tersimpan di
 * database.
 *
 *   asli   : https://res.cloudinary.com/<cloud>/image/upload/v123/abc.jpg
 *   hasil  : https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto,c_limit,w_720/v123/abc.jpg
 *
 * `f_auto` memilih format terbaik yang didukung browser (WebP/AVIF di HP
 * modern), `q_auto` memilih kualitas kompresi otomatis, `c_limit` hanya
 * MENGECILKAN kalau gambar aslinya lebih besar — tidak pernah memperbesar
 * gambar kecil jadi buram.
 *
 * SEMUA fungsi di sini aman dipanggil dengan URL apa pun: kalau URL-nya
 * bukan Cloudinary (misalnya gambar lama yang di-host di tempat lain),
 * URL itu dikembalikan apa adanya. Tidak ada jalur yang bisa memutus
 * gambar yang sudah tersimpan.
 */

/** Lebar-lebar yang dipakai `srcset`. Dipilih mengikuti lebar layar HP
 *  yang nyata dipakai siswa (360–430 CSS px, dikali DPR 2–3), bukan
 *  kelipatan bulat yang enak dilihat di kode. */
const LEBAR_SRCSET = [360, 540, 720, 1080, 1440] as const;

/** Lebar maksimal untuk mode perbesar (lightbox). Di atas ini praktis
 *  tidak ada bedanya di layar HP, tapi ukuran filenya naik terus. */
const LEBAR_ZOOM = 1600;

const PENANDA_UPLOAD = "/image/upload/";

function isCloudinary(url: string): boolean {
  return url.includes("res.cloudinary.com") && url.includes(PENANDA_UPLOAD);
}

/**
 * Sisipkan segmen transformasi tepat setelah `/image/upload/`.
 *
 * Kalau URL-nya SUDAH punya transformasi (misalnya gambar yang di-paste
 * guru dari tab Cloudinary sendiri), segmen lama dibiarkan dan segmen
 * baru ditambahkan di depannya — Cloudinary menerapkan berantai kiri ke
 * kanan, jadi hasilnya tetap benar dan tidak pernah menimpa niat awal.
 */
function denganTransformasi(url: string, transformasi: string): string {
  if (!isCloudinary(url)) return url;
  const [depan, belakang] = url.split(PENANDA_UPLOAD);
  if (belakang === undefined) return url;
  return `${depan}${PENANDA_UPLOAD}${transformasi}/${belakang}`;
}

/**
 * URL untuk dipasang di `src` — ukuran "cukup" untuk tampilan normal di
 * dalam kartu soal. 720 px dipilih karena itu kira-kira lebar penuh
 * kartu soal di HP dengan DPR 2; lebih besar dari itu hanya menambah
 * unduhan tanpa perbedaan yang terlihat.
 */
export function gambarTampil(url: string, lebar = 720): string {
  return denganTransformasi(url, `f_auto,q_auto,c_limit,w_${lebar}`);
}

/**
 * `srcset` supaya browser sendiri yang memilih ukuran sesuai lebar layar
 * & kerapatan piksel perangkat. Ini yang membuat HP murah dengan layar
 * 360 px tidak ikut mengunduh berkas untuk layar 1440 px.
 */
export function gambarSrcSet(url: string): string | undefined {
  if (!isCloudinary(url)) return undefined;
  return LEBAR_SRCSET.map((w) => `${gambarTampil(url, w)} ${w}w`).join(", ");
}

/** Versi resolusi tinggi untuk mode perbesar. */
export function gambarZoom(url: string): string {
  return denganTransformasi(url, `f_auto,q_auto,c_limit,w_${LEBAR_ZOOM}`);
}

/**
 * Pratinjau kecil untuk panel admin (daftar soal, kotak opsi di form).
 * `c_fill` + `g_auto` memotong ke kotak dengan titik berat isi gambar,
 * supaya deretan pratinjau rapi sejajar — beda dari tampilan siswa yang
 * memakai `c_limit` karena di sana gambar TIDAK BOLEH terpotong sedikit
 * pun (bisa memotong bagian soal).
 */
export function gambarPratinjau(url: string, sisi = 160): string {
  return denganTransformasi(
    url,
    `f_auto,q_auto,c_fill,g_auto,w_${sisi},h_${sisi}`
  );
}
