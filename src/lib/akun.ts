/**
 * Satu tempat untuk aturan pembentukan identitas akun (guru & siswa).
 *
 * ── KENAPA FILE INI ADA ──
 *
 * Aturan "username X jadi email Y" sebelumnya ditulis ulang di empat
 * tempat: `LoginForm.tsx`, `Action.ts`, `admin/siswa/actions.ts`, dan
 * `admin/guru/actions.ts`. Selama keempatnya sepakat, tidak ada yang
 * kelihatan salah. Begitu satu di antaranya berubah — dan itu SUDAH
 * terjadi: `Action.ts` membentuk kata sandi siswa "Lms#DDMMYYYY"
 * sementara `LoginForm.tsx` memakai "DDMMYYYY" polos — yang muncul
 * adalah gejala paling melelahkan untuk ditelusuri: akun ada, kata
 * sandi diketik benar, tapi ditolak.
 *
 * Aturan di file ini adalah satu-satunya yang sah. Kalau perlu diubah,
 * ubah di sini, bukan di pemanggilnya.
 *
 * File ini TIDAK mengimpor apa pun yang khusus server, jadi aman
 * dipakai dari Client Component maupun Server Action.
 */

/** Suffix email sintetis siswa. Sama dengan yang dipakai sejak 0001_init.sql. */
export function suffixEmailSiswa(): string {
  return process.env.NEXT_PUBLIC_SISWA_EMAIL_SUFFIX ?? "@siswa.lms-cbt.local";
}

/**
 * Suffix email sintetis guru — BARU (migrasi 0015).
 *
 * Sengaja dibedakan dari suffix siswa. Kalau keduanya sama, seorang guru
 * ber-username "8123" dan seorang siswa ber-username "8123" akan
 * memperebutkan alamat email yang sama persis di `auth.users`, dan yang
 * kedua gagal dibuat dengan pesan "email sudah terdaftar" tanpa petunjuk
 * bahwa tabrakannya terjadi lintas peran.
 */
export function suffixEmailGuru(): string {
  return process.env.NEXT_PUBLIC_GURU_EMAIL_SUFFIX ?? "@guru.lms-cbt.local";
}

/**
 * Kata sandi awal semua akun guru yang dibuat lewat panel admin.
 *
 * SENGAJA seragam dan sengaja mudah diucapkan lewat telepon. Ini
 * keputusan sadar, bukan kelalaian: guru menerima akunnya dari admin
 * secara lisan atau lewat grup WhatsApp sekolah, dan kata sandi acak
 * 12 karakter di skenario itu berakhir dengan cara yang sama setiap
 * kali — ditulis di kertas yang ditempel di meja, atau dikirim ulang
 * berkali-kali karena salah ketik.
 *
 * Konsekuensinya harus dipahami: SIAPA PUN yang tahu NIP seorang guru
 * bisa masuk sebagai guru itu selama kata sandinya belum diganti. Jadi
 * tombol "Reset kata sandi" di /admin/guru tetap ada, dan admin
 * sebaiknya meminta guru menggantinya lewat halaman profil Supabase
 * setelah ujian pertama. Untuk akun yang boleh melihat data lintas
 * jenjang (`is_admin = true`), JANGAN pakai kata sandi ini — buat
 * akunnya lewat dashboard Supabase dengan kata sandi sendiri.
 */
export const PASSWORD_AWAL_GURU = "guru123456";

/**
 * Normalkan username jadi bentuk yang aman dipakai sebagai bagian lokal
 * alamat email: huruf kecil, angka, titik, garis bawah, dan strip.
 *
 * NIP (18 digit angka) lolos apa adanya. Yang dibuang adalah spasi dan
 * karakter yang membuat alamat emailnya tidak valid — mis. NIP yang
 * disalin dari Excel sering ikut membawa spasi di tengah
 * ("19650412 199003 1 005"), dan tanpa pembersihan ini akun yang
 * terbentuk punya alamat email yang tidak pernah bisa dipakai login.
 */
export function normalkanUsername(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

/** Username -> email sintetis guru. */
export function emailGuruDariUsername(username: string): string {
  return `${normalkanUsername(username)}${suffixEmailGuru()}`;
}

/** Username -> email sintetis siswa. */
export function emailSiswaDariUsername(username: string): string {
  return `${normalkanUsername(username)}${suffixEmailSiswa()}`;
}

// ---------------------------------------------------------------------------
// Akun siswa: username dari nama + password acak pendek (migrasi 0023)
// ---------------------------------------------------------------------------
// Menggantikan login "pilih nama + tanggal lahir". Tanggal lahir rahasia
// yang lemah: teman sekelas tahu, dan tercetak di banyak dokumen sekolah.
//
// Aturan di bawah DISALIN PERSIS di SQL
// `supabase/migrations-baru/0023_login_siswa_username.sql`
// (`lms_username_dasar`, `lms_password_siswa`). Kalau salah satu diubah,
// ubah keduanya — kalau tidak, akun dari panel admin dan akun dari SQL
// Editor punya bentuk username yang berbeda untuk nama yang sama.

/**
 * Kata depan nama yang dilompati supaya username tidak menumpuk di
 * "muhammad" / "siti". Hanya dilompati kalau masih ada kata sesudahnya:
 * siswa bernama "Muhammad" saja tetap jadi "muhammad".
 */
const AWALAN_NAMA = new Set([
  "muhammad", "muhamad", "muhammat", "mohammad", "mohamad", "mohammed",
  "muhammed", "mochammad", "mochamad", "mochamat", "moch", "moh", "muh",
  "mhd", "mohd", "md", "m", "siti",
]);

/** Panjang maksimal bagian nama di username (sebelum inisial/angka). */
export const USERNAME_SISWA_DASAR_MAKS = 8;

/**
 * Nama -> bagian dasar username + inisial kata sesudahnya.
 *
 *   "Muhammad Rizki Pratama" -> { dasar: "rizki",    inisial: "p"  }
 *   "Siti Nur Aisyah"        -> { dasar: "nur",      inisial: "a"  }
 *   "Al Fatih Ramadhan"      -> { dasar: "alfatih",  inisial: "r"  }
 *   "Ma'ruf Amin"            -> { dasar: "maruf",    inisial: "a"  }
 *   "Kurniawati Dwi Lestari" -> { dasar: "kurniawa", inisial: "dl" }
 *
 * Kata pertama yang pendek (< 3 huruf, mis. "Al") disambung kata
 * berikutnya. Nama tanpa huruf sama sekali jadi "siswa".
 */
export function usernameDasarDariNama(nama: string): {
  dasar: string;
  inisial: string;
} {
  const kata = String(nama ?? "")
    .toLowerCase()
    .replace(/['`’]/g, "")
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (kata.length === 0) return { dasar: "siswa", inisial: "" };

  let i = 0;
  while (i < kata.length - 1 && AWALAN_NAMA.has(kata[i])) i++;

  let dasar = "";
  while (i < kata.length && dasar.length < 3) dasar += kata[i++];
  dasar = dasar.slice(0, USERNAME_SISWA_DASAR_MAKS);

  let inisial = "";
  while (i < kata.length && inisial.length < 2) inisial += kata[i++][0];

  return { dasar, inisial };
}

/**
 * Urutan calon username untuk satu nama: "rizki", "rizkip", "rizki2",
 * "rizki3", ... Yang dipakai adalah calon pertama yang belum terpakai.
 */
export function* kandidatUsernameSiswa(nama: string): Generator<string> {
  const { dasar, inisial } = usernameDasarDariNama(nama);
  yield dasar;
  if (inisial) yield dasar + inisial;
  for (let n = 2; n <= 999; n++) yield `${dasar}${n}`;
}

/** Calon username pertama yang tidak ada di `terpakai` (huruf kecil). */
export function pilihUsernameSiswa(
  nama: string,
  terpakai: ReadonlySet<string>
): string {
  for (const calon of kandidatUsernameSiswa(nama)) {
    if (!terpakai.has(calon)) return calon;
  }
  throw new Error(`Tidak ada username tersisa untuk nama "${nama}".`);
}

/** Tanpa i, l, o — supaya tidak tertukar dengan 1 dan 0 saat dibaca dari kartu. */
const HURUF_PASSWORD = "abcdefghjkmnpqrstuvwxyz";
const ANGKA_PASSWORD = "0123456789";

/** Pola password siswa: 3 huruf kecil lalu 3 angka, mis. "kmr482". */
export const POLA_PASSWORD_SISWA = /^[a-z]{3}[0-9]{3}$/;

/**
 * Password siswa: 3 huruf kecil + 3 angka (mis. "kmr482"). Sengaja pendek
 * supaya bisa disalin anak SMP dari kartu tanpa salah ketik; tetap acak per
 * siswa (±12 juta kemungkinan) dan percobaan login dibatasi Supabase Auth.
 *
 * Panjang 6 = batas minimum bawaan Supabase Auth. Kalau project menaikkan
 * syarat password (Authentication > Providers > Email), `createUser` di
 * panel admin akan menolak password ini — jalur SQL (0023) tidak terkena
 * karena menulis hash langsung.
 */
export function buatPasswordSiswa(): string {
  const acak = crypto.getRandomValues(new Uint32Array(6));
  let out = "";
  for (let i = 0; i < 3; i++) out += HURUF_PASSWORD[acak[i] % HURUF_PASSWORD.length];
  for (let i = 3; i < 6; i++) out += ANGKA_PASSWORD[acak[i] % ANGKA_PASSWORD.length];
  return out;
}

/**
 * Penanda di `auth.users.raw_app_meta_data` bahwa akun siswa ini sudah
 * memakai login username + password baru. Dibaca oleh
 * `siapkan_akun_siswa()` (0023) supaya akun yang dibuat dari panel admin
 * tidak ikut direset saat SQL itu dijalankan ulang.
 */
export const PENANDA_AKUN_SISWA = { lms_login: "username" } as const;

/**
 * Validasi NIP longgar: 8-25 digit angka.
 *
 * NIP PNS resmi selalu 18 digit, tapi sekolah juga memakai NUPTK (16
 * digit) dan NIP sementara/NIY milik yayasan yang panjangnya
 * bermacam-macam. Menolak apa pun yang bukan 18 digit berarti admin
 * tidak bisa memasukkan sebagian gurunya sama sekali — kerugian yang
 * jauh lebih besar daripada manfaat validasi ketat di sini. Yang
 * ditolak cuma yang jelas-jelas salah ketik: huruf, dan panjang yang
 * tidak masuk akal.
 */
export function nipValid(nip: string): boolean {
  return /^\d{8,25}$/.test(String(nip ?? "").trim());
}

// ---------------------------------------------------------------------------
// Aturan profil guru (halaman /admin/profil)
// ---------------------------------------------------------------------------
// Ditaruh di sini, bukan di Server Action-nya, supaya form di browser dan
// server memakai aturan yang sama persis — satu-satunya cara mencegah kasus
// "form bilang boleh, server menolak" yang muncul begitu dua tempat menulis
// aturannya sendiri-sendiri.

export const USERNAME_MIN = 4;
export const USERNAME_MAKS = 30;
export const PASSWORD_MIN = 8;
/** bcrypt (yang dipakai Supabase Auth) hanya membaca 72 byte pertama. */
export const PASSWORD_MAKS = 72;

export type HasilValidasi<T> =
  | { ok: true; nilai: T }
  | { ok: false; pesan: string };

/**
 * Validasi username baru yang diketik guru.
 *
 * SENGAJA menolak karakter terlarang, bukan diam-diam membuangnya seperti
 * `normalkanUsername`: kalau guru mengetik "budi@sekolah", hasil pembuangan
 * diam-diam adalah "budisekolah" — username yang tidak pernah dia maksud dan
 * baru ketahuan saat login gagal. Yang dinormalkan diam-diam hanya hal yang
 * tidak mengubah maksud: spasi di ujung dan huruf besar.
 *
 * Angka murni diizinkan (memang begitulah username awal guru: NIP).
 */
export function validasiUsernameGuru(raw: string): HasilValidasi<string> {
  const username = String(raw ?? "").trim().toLowerCase();

  if (!username) return { ok: false, pesan: "Username tidak boleh kosong." };
  if (username.length < USERNAME_MIN) {
    return {
      ok: false,
      pesan: `Username minimal ${USERNAME_MIN} karakter.`,
    };
  }
  if (username.length > USERNAME_MAKS) {
    return {
      ok: false,
      pesan: `Username maksimal ${USERNAME_MAKS} karakter.`,
    };
  }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return {
      ok: false,
      pesan:
        "Username hanya boleh berisi huruf, angka, titik, garis bawah, dan strip — tanpa spasi atau simbol lain.",
    };
  }
  if (!/^[a-z0-9]/.test(username) || !/[a-z0-9]$/.test(username)) {
    return {
      ok: false,
      pesan: "Username harus diawali dan diakhiri huruf atau angka.",
    };
  }
  return { ok: true, nilai: username };
}

/**
 * Validasi kata sandi baru. Sengaja tidak menuntut huruf besar + simbol +
 * angka sekaligus: aturan seperti itu di lapangan berakhir dengan kata sandi
 * yang ditulis di kertas. Yang dijaga hanya hal yang benar-benar melemahkan:
 * terlalu pendek, sama dengan kata sandi awal yang diketahui semua orang,
 * atau sama dengan username/NIP yang tercetak di banyak dokumen.
 */
export function validasiPasswordGuru(
  password: string,
  konteks: { username?: string | null; nip?: string | null }
): HasilValidasi<string> {
  if (password.length < PASSWORD_MIN) {
    return {
      ok: false,
      pesan: `Password baru minimal ${PASSWORD_MIN} karakter.`,
    };
  }
  if (password.length > PASSWORD_MAKS) {
    return {
      ok: false,
      pesan: `Password baru maksimal ${PASSWORD_MAKS} karakter.`,
    };
  }
  if (password === PASSWORD_AWAL_GURU) {
    return {
      ok: false,
      pesan:
        "Password baru tidak boleh sama dengan password awal yang diberikan admin.",
    };
  }
  const lower = password.toLowerCase();
  if (
    (konteks.username && lower === konteks.username.toLowerCase()) ||
    (konteks.nip && lower === konteks.nip.toLowerCase())
  ) {
    return {
      ok: false,
      pesan: "Password baru tidak boleh sama dengan username atau NIP kamu.",
    };
  }
  return { ok: true, nilai: password };
}
