/**
 * Satu-satunya tempat yang boleh memutuskan HTML apa yang aman disimpan &
 * ditampilkan untuk isi soal.
 *
 * ── KENAPA FILE INI ADA ──
 *
 * Sebelum ini, pertanyaan dan opsi jawaban adalah `<textarea>` / `<input>`
 * teks polos. Konsekuensinya bukan cuma "tidak bisa tebal/miring": guru
 * yang menyalin potongan layar (Snipping Tool → Ctrl+V) ke kolom
 * pertanyaan TIDAK MENDAPAT APA-APA — textarea memang tidak bisa memuat
 * gambar, dan tidak ada pesan error apa pun yang memberi tahu. Guru
 * mengira aplikasinya rusak. Satu-satunya jalur gambar yang benar-benar
 * jalan adalah kotak unggah terpisah di bawah kolom teks, dan gambarnya
 * selalu muncul DI BAWAH seluruh pertanyaan — tidak bisa disisipkan di
 * tengah kalimat, yang justru bentuk paling umum di soal matematika/IPA
 * ("Perhatikan gambar berikut. [gambar] Berapa luas …").
 *
 * Begitu kolom pertanyaan jadi `contentEditable`, isinya HTML. Dan HTML
 * dari clipboard adalah HTML yang TIDAK BOLEH DIPERCAYA: menempel dari
 * Word/Google Docs/halaman web membawa serta `<script>`, `<iframe>`,
 * `onerror=`, `<style>` global yang bisa merusak seluruh tata letak
 * halaman ujian, dan ratusan `<span style>` sampah. Isi itu lalu
 * disimpan ke database dan dirender ke 600 HP siswa. Tanpa penyaring,
 * satu tempelan ceroboh dari guru = XSS di halaman ujian semua siswa.
 *
 * ── KENAPA PENYARINGNYA DITULIS SENDIRI, BUKAN DOMPurify ──
 *
 * Penyaring ini murni manipulasi string, tanpa `document` sama sekali,
 * jadi hasilnya SAMA PERSIS di server (render awal Next.js) dan di
 * browser. Kalau memakai penyaring berbasis DOM, server akan mengirim
 * HTML mentah/kosong lalu browser menggantinya — itu hydration mismatch,
 * dan di halaman ujian artinya soal sempat berkedip atau kosong. Selain
 * itu aplikasi ini tidak punya dependensi tambahan, dan menambah satu
 * paket hanya untuk ini tidak sepadan.
 *
 * ATURAN EMAS: penyaring bekerja dengan DAFTAR IZIN (allowlist), bukan
 * daftar larangan. Apa pun yang tidak disebut di bawah akan dibuang.
 * Kalau suatu saat perlu tag baru, tambahkan di sini — jangan pernah
 * melewati fungsi ini di tempat lain.
 */

/** Tag yang boleh lewat. Sengaja pendek: semua yang dibutuhkan toolbar
 *  (tebal/miring/garis bawah/rata/daftar/gambar), tidak lebih. */
const TAG_DIIZINKAN = new Set([
  "p",
  "div",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "sub",
  "sup",
  "ul",
  "ol",
  "li",
  "span",
  "img",
]);

/** Tag yang tidak punya penutup. */
const TAG_TUNGGAL = new Set(["br", "img"]);

/** Lebar gambar yang boleh dipilih guru, dalam persen kolom soal. */
export const LEBAR_GAMBAR_PILIHAN = ["25", "50", "75", "100"] as const;

/**
 * Escape teks biasa. `&` hanya di-escape kalau BUKAN awal entity yang
 * sudah valid — kalau tidak, `&amp;` yang sudah benar akan berubah jadi
 * `&amp;amp;` setiap kali soal dibuka & disimpan ulang, dan setelah lima
 * kali edit guru melihat deretan "amp;amp;amp;" di soalnya.
 */
function escapeTeks(s: string): string {
  return s
    .replace(/&(?!(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape untuk dipakai di dalam nilai atribut ber-tanda-kutip-ganda. */
export function escapeAtribut(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Hanya URL gambar yang benar-benar aman yang disimpan.
 *
 * `blob:` dan `data:` SENGAJA ditolak. Saat guru menempel gambar, editor
 * memasang `blob:` sementara supaya gambarnya langsung terlihat sebelum
 * unggahannya selesai. Kalau `blob:` ikut tersimpan, hasilnya adalah soal
 * yang tampak baik-baik saja di layar guru saat itu juga, lalu berubah
 * jadi ikon gambar rusak untuk SEMUA siswa — karena `blob:` hanya hidup
 * di tab browser yang membuatnya. Menolaknya di sini membuat kegagalan
 * unggah terlihat saat guru masih di depan form, bukan saat ujian
 * berlangsung.
 */
function urlGambarAman(url: string): boolean {
  return /^https:\/\/[^\s"'<>]+$/i.test(url);
}

function saringAtribut(tag: string, mentah: string): string {
  const hasil: string[] = [];
  const re =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(mentah)) !== null) {
    const nama = m[1].toLowerCase();
    const nilai = (m[2] ?? m[3] ?? m[4] ?? "").trim();

    // `style` disaring sampai ke properti-nya, bukan diterima utuh.
    // Perataan teks adalah SATU-SATUNYA properti yang dibutuhkan toolbar,
    // dan membiarkan style lain lewat berarti membiarkan `position:fixed`
    // atau `display:none` masuk ke halaman ujian.
    if (nama === "style") {
      const rata = /text-align\s*:\s*(left|center|right|justify)/i.exec(nilai);
      if (rata) hasil.push(` style="text-align:${rata[1].toLowerCase()}"`);
      continue;
    }

    if (tag === "img") {
      if (nama === "src" && urlGambarAman(nilai)) {
        hasil.push(` src="${escapeAtribut(nilai)}"`);
      } else if (nama === "alt") {
        hasil.push(` alt="${escapeAtribut(nilai)}"`);
      } else if (
        nama === "data-lebar" &&
        (LEBAR_GAMBAR_PILIHAN as readonly string[]).includes(nilai)
      ) {
        hasil.push(` data-lebar="${nilai}"`);
      }
    }
    // Atribut lain (onclick, onerror, class, id, srcset, …) dibuang diam-diam.
  }

  return hasil.join("");
}

/**
 * Saring HTML sembarang jadi HTML yang aman disimpan & dirender.
 *
 * Dipanggil DUA KALI di sepanjang umur satu soal: sekali sebelum
 * disimpan, sekali lagi sebelum dirender ke siswa. Terlihat mubazir,
 * tapi disengaja — data yang sudah terlanjur ada di database (dari versi
 * aplikasi mana pun, atau dari orang yang menulis langsung ke tabel)
 * tetap harus lewat penyaring sebelum menyentuh layar siswa.
 */
export function bersihkanHtml(kotor: string | null | undefined): string {
  if (!kotor) return "";

  // Komentar HTML dibuang lebih dulu supaya `<!-- <script> -->` tidak
  // membingungkan pemindai tag di bawah.
  const sumber = kotor.replace(/<!--[\s\S]*?-->/g, "");

  const keluaran: string[] = [];
  const tumpukan: string[] = [];
  const re = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;

  let posisi = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(sumber)) !== null) {
    if (m.index > posisi) {
      keluaran.push(escapeTeks(sumber.slice(posisi, m.index)));
    }
    posisi = re.lastIndex;

    const penutup = m[1] === "/";
    const nama = m[2].toLowerCase();

    // Tag di luar daftar izin dibuang, TAPI isinya tetap dipertahankan
    // sebagai teks. Menempel satu paragraf dari halaman web yang
    // kebetulan dibungkus <article> tidak boleh membuat teksnya hilang.
    // Pengecualian: isi <script>/<style> memang harus ikut hilang.
    if (!TAG_DIIZINKAN.has(nama)) {
      if (!penutup && (nama === "script" || nama === "style")) {
        const tutup = new RegExp(`</${nama}\\s*>`, "i");
        const sisa = sumber.slice(posisi);
        const cocok = tutup.exec(sisa);
        posisi = cocok ? posisi + cocok.index + cocok[0].length : sumber.length;
        re.lastIndex = posisi;
      }
      continue;
    }

    if (penutup) {
      const idx = tumpukan.lastIndexOf(nama);
      if (idx === -1) continue; // penutup tanpa pembuka — buang
      for (let k = tumpukan.length - 1; k >= idx; k--) {
        keluaran.push(`</${tumpukan[k]}>`);
      }
      tumpukan.length = idx;
      continue;
    }

    const atribut = saringAtribut(nama, m[3] ?? "");

    if (TAG_TUNGGAL.has(nama)) {
      // <img> tanpa src yang lolos penyaring tidak ada gunanya —
      // hasilnya cuma ikon gambar rusak di layar siswa.
      if (nama === "img" && !atribut.includes(" src=")) continue;
      keluaran.push(`<${nama}${atribut} />`);
      continue;
    }

    keluaran.push(`<${nama}${atribut}>`);
    tumpukan.push(nama);
  }

  if (posisi < sumber.length) {
    keluaran.push(escapeTeks(sumber.slice(posisi)));
  }

  // Tag yang dibuka tapi tidak pernah ditutup (lazim pada tempelan
  // setengah jadi) ditutup di sini. Kalau dibiarkan, satu <b> yang
  // menggantung akan menebalkan SISA HALAMAN ujian, bukan cuma soalnya.
  for (let k = tumpukan.length - 1; k >= 0; k--) {
    keluaran.push(`</${tumpukan[k]}>`);
  }

  return keluaran.join("");
}

const ENTITY: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Turunkan teks polos dari HTML.
 *
 * Ini yang membuat seluruh sisa aplikasi tidak perlu tahu-menahu soal
 * HTML: hasilnya disimpan ke field `pertanyaan` / `teks` yang lama,
 * persis seperti sebelumnya. Jadi validasi server, preview di daftar
 * soal, ekspor Excel, dan pencocokan kunci jawaban tetap bekerja tanpa
 * satu baris pun diubah, dan soal lama yang belum punya HTML tetap
 * tampil apa adanya. Tidak ada migrasi data yang perlu dijalankan.
 */
export function htmlKeTeks(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|ul|ol)\s*>/gi, "\n")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-zA-Z#0-9]+;/g, (e) => ENTITY[e.toLowerCase()] ?? e)
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Ubah teks polos (soal lama) jadi HTML awal untuk editor. */
export function teksKeHtml(teks: string | null | undefined): string {
  if (!teks) return "";
  return escapeTeks(teks).replace(/\r?\n/g, "<br />");
}

/**
 * Apakah isi ini dianggap "terisi"?
 *
 * Soal yang HANYA berisi gambar tempelan — tanpa satu huruf pun — adalah
 * kasus yang sah dan justru sering: guru memotret satu soal utuh dari
 * buku lalu menempelkannya. Memakai `teks.trim().length > 0` saja akan
 * menolak soal seperti itu dengan pesan "Pertanyaan wajib diisi" padahal
 * gambarnya jelas-jelas ada di layar.
 */
export function htmlAdaIsinya(html: string | null | undefined): boolean {
  if (!html) return false;
  if (/<img\b/i.test(html)) return true;
  return htmlKeTeks(html).length > 0;
}

/**
 * Apakah masih ada gambar yang belum selesai diunggah?
 *
 * Editor menandai gambar sementara dengan `blob:`. Kalau guru menekan
 * Simpan saat unggahan masih jalan, gambar itu akan dibuang penyaring
 * dan soalnya tersimpan tanpa gambar — diam-diam. Form memakai fungsi
 * ini untuk menahan tombol Simpan sampai semuanya beres.
 */
export function adaGambarBelumSelesai(html: string | null | undefined): boolean {
  return !!html && /<img[^>]+src="blob:/i.test(html);
}
