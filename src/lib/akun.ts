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

/**
 * Kata sandi siswa dari tanggal lahir: "DDMMYYYY".
 *
 * Formatnya angka polos, MENGIKUTI apa yang sudah dipakai
 * `LoginForm.tsx` — bukan varian "Lms#DDMMYYYY" yang ada di
 * `Action.ts`. Dipilih yang ini karena inilah format yang dipakai akun
 * siswa yang sudah terlanjur ada di database; mengubah standarnya
 * sekarang berarti seluruh akun lama harus direset dalam satu malam.
 *
 * PERINGATAN kalau nanti mau mengganti formatnya: project Supabase yang
 * mengaktifkan syarat kompleksitas kata sandi (Authentication >
 * Providers > Password > Minimum requirements) akan MENOLAK delapan
 * digit angka polos, dan penolakannya muncul sebagai kegagalan
 * `createUser` yang pesannya tidak menyebut-nyebut kompleksitas. Kalau
 * penambahan siswa manual gagal dengan alasan yang tidak masuk akal,
 * periksa setelan itu lebih dulu.
 */
export function passwordDariTanggalLahir(
  tanggal: string,
  bulan: string,
  tahun: string
): string {
  return `${String(tanggal).padStart(2, "0")}${String(bulan).padStart(
    2,
    "0"
  )}${tahun}`;
}

/** "2012-05-14" -> "14052012". Mengembalikan null kalau formatnya bukan ISO. */
export function passwordDariTanggalISO(iso: string): string | null {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [tahun, bulan, tanggal] = s.split("-");
  return `${tanggal}${bulan}${tahun}`;
}

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
