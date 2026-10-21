/**
 * Generate soal dengan AI — bagian MURNI (tanpa jaringan, tanpa Supabase).
 *
 * Semua aturan yang bisa salah hitung dikumpulkan di sini supaya bisa
 * diuji tanpa memanggil Gemini (lihat `src/lib/__tests__/ai-soal.test.ts`):
 *
 *   1. `bagiSkor`        — skor otomatis per butir, totalnya PAS target.
 *   2. `alokasiGambar`   — berapa soal bergambar per bentuk soal.
 *   3. `pecahBatch`      — pesanan dipecah jadi beberapa panggilan kecil.
 *   4. `buatPromptBatch` — teks prompt untuk satu panggilan.
 *   5. `normalisasiItem` — jawaban mentah AI → bentuk `konten_jsonb` yang
 *                          PERSIS sama dengan buatan form manual.
 *
 * ── KENAPA DIPECAH PER BATCH, BUKAN SATU PANGGILAN BESAR ──
 *
 * Satu panggilan untuk 40 soal sering terpotong di tengah JSON (batas
 * token keluaran) dan memakan waktu lebih lama dari batas fungsi server.
 * Batch kecil per bentuk soal: (a) skemanya sederhana sehingga AI jarang
 * salah bentuk, (b) satu batch gagal tidak membuang batch lain, (c) guru
 * melihat kemajuan. Jumlah panggilan tetap kecil (40 soal ≈ 5 panggilan),
 * dan prompt-nya dirakit di kode — TIDAK ada panggilan AI tambahan hanya
 * untuk "membuatkan prompt". Itu yang membuatnya hemat.
 *
 * ── KENAPA TIDAK "FULL AI" ──
 *
 * Hasil AI tidak pernah langsung tersimpan. Semuanya masuk ke layar
 * tinjauan dulu: guru membaca, membetulkan, mencoret, dan — untuk soal
 * bergambar — memilih sendiri sumber gambarnya. Baru setelah itu soal
 * disimpan lewat jalur simpan yang sama dengan form manual (validasi,
 * Bank Soal, log aktivitas ikut berlaku).
 */

import type { TipeSoal } from "@/types";
import { TIPE_LABEL, TIPE_SOAL_LIST } from "@/lib/soal";
import { escapeAtribut, teksKeHtml } from "@/lib/html-soal";

export type JumlahPerTipe = Record<TipeSoal, number>;
export type Kesulitan = "mudah" | "sedang" | "sulit" | "campuran";
export type JenisGambar = "diagram" | "ilustrasi";

export const KESULITAN_LABEL: Record<Kesulitan, string> = {
  mudah: "Mudah (LOTS)",
  sedang: "Sedang (MOTS)",
  sulit: "Sulit (HOTS)",
  campuran: "Campuran (30% mudah, 50% sedang, 20% sulit)",
};

/** Batas wajar satu kali generate. Lebih dari ini, guru lebih baik
 *  generate dua kali — tinjauan 100 soal sekaligus melelahkan dan
 *  kesalahan AI mudah terlewat. */
export const MAKS_SOAL_SEKALI = 60;
export const MAKS_TOPIK = 8;

/**
 * Bobot relatif per bentuk soal untuk skor otomatis. Mengikuti beban
 * kerja siswa: Benar/Salah paling ringan (peluang tebak 50%), menjodohkan
 * paling berat (banyak pasangan dalam satu butir).
 */
export const BOBOT_TIPE: Record<TipeSoal, number> = {
  benar_salah: 1,
  pilgan_biasa: 2,
  uraian_singkat: 3,
  pilgan_kompleks: 3,
  multi_benar_salah: 3,
  menjodohkan: 4,
};

/** Bentuk soal yang gambarnya ditaruh di pertanyaan. Menjodohkan
 *  dikecualikan: gambarnya biasanya per item, dan itu lebih baik
 *  ditempel guru sendiri lewat form edit. */
export const TIPE_BISA_GAMBAR: TipeSoal[] = [
  "pilgan_biasa",
  "pilgan_kompleks",
  "uraian_singkat",
  "benar_salah",
  "multi_benar_salah",
];

/** Persentase soal bergambar kalau guru tidak menentukan. */
export const PERSEN_GAMBAR_OTOMATIS = 0.2;

/** Ukuran batch maksimal per bentuk soal (butir per panggilan AI). */
export const BATAS_BATCH: Record<TipeSoal, number> = {
  pilgan_biasa: 10,
  pilgan_kompleks: 8,
  uraian_singkat: 10,
  benar_salah: 15,
  multi_benar_salah: 6,
  menjodohkan: 5,
};

export interface RencanaGenerate {
  topik: string[];
  jumlah: JumlahPerTipe;
  /** null = otomatis (AI memilih, maksimal ±20% soal). */
  jumlahBergambar: number | null;
  kesulitan: Kesulitan;
  jumlahOpsi: 4 | 5;
  catatan: string;
  totalSkor: number;
}

export function jumlahKosong(): JumlahPerTipe {
  return Object.fromEntries(TIPE_SOAL_LIST.map((t) => [t, 0])) as JumlahPerTipe;
}

export function totalSoal(jumlah: JumlahPerTipe): number {
  return TIPE_SOAL_LIST.reduce((n, t) => n + (jumlah[t] || 0), 0);
}

// ---------------------------------------------------------------------------
// 1. Skor otomatis
// ---------------------------------------------------------------------------

/**
 * Bagi `totalTarget` ke semua butir sesuai bobot bentuk soalnya, dalam
 * kelipatan 0,5 (sama dengan `step` input skor di form), dan JUMLAHNYA
 * TEPAT `totalTarget`.
 *
 * Caranya "sisa terbesar" (largest remainder): hitung bagian ideal tiap
 * butir dalam satuan setengah poin, bulatkan ke bawah (minimal 1 satuan),
 * lalu bagikan sisa satuan ke butir yang pecahannya paling besar. Hasil
 * per bentuk soal jadi hampir seragam (mis. 2 atau 2,5), bukan acak.
 *
 * Kalau butirnya terlalu banyak untuk target (setiap butir minimal 0,5),
 * semua butir diberi 0,5 — totalnya memang tidak bisa pas, dan layar
 * tinjauan menampilkan selisihnya.
 */
export function bagiSkor(
  jumlah: JumlahPerTipe,
  totalTarget = 100
): Record<TipeSoal, number[]> {
  const hasil = Object.fromEntries(
    TIPE_SOAL_LIST.map((t) => [t, [] as number[]])
  ) as Record<TipeSoal, number[]>;

  const butir: { tipe: TipeSoal; bobot: number }[] = [];
  for (const t of TIPE_SOAL_LIST) {
    for (let i = 0; i < (jumlah[t] || 0); i++) {
      butir.push({ tipe: t, bobot: BOBOT_TIPE[t] });
    }
  }
  if (butir.length === 0) return hasil;

  const totalSatuan = Math.round(totalTarget * 2);
  if (totalSatuan < butir.length) {
    for (const b of butir) hasil[b.tipe].push(0.5);
    return hasil;
  }

  const sumBobot = butir.reduce((n, b) => n + b.bobot, 0);
  const ideal = butir.map((b) => (totalSatuan * b.bobot) / sumBobot);
  const satuan = ideal.map((x) => Math.max(1, Math.floor(x)));
  let sisa = totalSatuan - satuan.reduce((n, x) => n + x, 0);

  // Urutkan indeks menurut pecahan terbesar; seri dipecah menurut urutan
  // asli supaya hasilnya deterministik (penting untuk uji).
  const urut = ideal
    .map((x, i) => ({ i, pecahan: x - Math.floor(x) }))
    .sort((a, b) => b.pecahan - a.pecahan || a.i - b.i);

  let k = 0;
  while (sisa > 0) {
    satuan[urut[k % urut.length].i] += 1;
    sisa--;
    k++;
  }
  // Pembulatan ke bawah dengan minimal 1 bisa membuat total MELEBIHI
  // target (banyak butir berbobot kecil). Kurangi dari butir terbesar.
  while (sisa < 0) {
    let iMaks = 0;
    for (let i = 1; i < satuan.length; i++) {
      if (satuan[i] > satuan[iMaks]) iMaks = i;
    }
    if (satuan[iMaks] <= 1) break;
    satuan[iMaks] -= 1;
    sisa++;
  }

  butir.forEach((b, i) => hasil[b.tipe].push(satuan[i] / 2));
  return hasil;
}

/** Ringkasan "2 ×15, 2,5 ×5" untuk ditampilkan di jendela petunjuk. */
export function ringkasSkor(skor: number[]): string {
  if (skor.length === 0) return "–";
  const hitung = new Map<number, number>();
  for (const s of skor) hitung.set(s, (hitung.get(s) ?? 0) + 1);
  return Array.from(hitung.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([s, n]) => `${formatAngka(s)}${hitung.size > 1 ? ` ×${n}` : ""}`)
    .join(", ");
}

export function formatAngka(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

// ---------------------------------------------------------------------------
// 2. Alokasi gambar
// ---------------------------------------------------------------------------

export interface AlokasiGambar {
  perTipe: JumlahPerTipe;
  /** "tepat" = guru menentukan angkanya, AI WAJIB memenuhi.
   *  "maksimal" = otomatis, AI boleh kurang kalau gambar tidak membantu. */
  mode: "tepat" | "maksimal";
  total: number;
}

export function alokasiGambar(
  jumlah: JumlahPerTipe,
  jumlahBergambar: number | null
): AlokasiGambar {
  const perTipe = jumlahKosong();
  const layak = TIPE_BISA_GAMBAR.reduce((n, t) => n + (jumlah[t] || 0), 0);

  const mode = jumlahBergambar === null ? "maksimal" : "tepat";
  const target =
    jumlahBergambar === null
      ? layak >= 3
        ? Math.max(1, Math.round(layak * PERSEN_GAMBAR_OTOMATIS))
        : 0
      : Math.max(0, Math.min(Math.floor(jumlahBergambar), layak));

  if (target === 0 || layak === 0) return { perTipe, mode, total: 0 };

  // Sisa terbesar lagi, proporsional terhadap jumlah soal tiap bentuk.
  const ideal = TIPE_BISA_GAMBAR.map((t) => ({
    t,
    x: ((jumlah[t] || 0) * target) / layak,
  }));
  let terbagi = 0;
  for (const { t, x } of ideal) {
    perTipe[t] = Math.floor(x);
    terbagi += perTipe[t];
  }
  const urut = [...ideal].sort(
    (a, b) => b.x - Math.floor(b.x) - (a.x - Math.floor(a.x))
  );
  for (const { t } of urut) {
    if (terbagi >= target) break;
    if (perTipe[t] < (jumlah[t] || 0)) {
      perTipe[t] += 1;
      terbagi += 1;
    }
  }
  return { perTipe, mode, total: terbagi };
}

// ---------------------------------------------------------------------------
// 3. Batch
// ---------------------------------------------------------------------------

export interface BatchGenerate {
  tipe: TipeSoal;
  jumlah: number;
  jumlahBergambar: number;
  modeGambar: "tepat" | "maksimal";
  /** Skor per butir di batch ini, panjangnya = `jumlah`. */
  skor: number[];
}

export function pecahBatch(rencana: RencanaGenerate): BatchGenerate[] {
  const skor = bagiSkor(rencana.jumlah, rencana.totalSkor);
  const gambar = alokasiGambar(rencana.jumlah, rencana.jumlahBergambar);
  const batch: BatchGenerate[] = [];

  for (const t of TIPE_SOAL_LIST) {
    const n = rencana.jumlah[t] || 0;
    if (n <= 0) continue;
    const ukuran = BATAS_BATCH[t];
    const jumlahBatch = Math.ceil(n / ukuran);
    let sisaGambar = gambar.perTipe[t];
    let posisi = 0;

    for (let b = 0; b < jumlahBatch; b++) {
      // Bagi rata (mis. 23 PG -> 8, 8, 7), bukan 10, 10, 3: batch kecil
      // di ujung menghasilkan soal yang lebih mirip satu sama lain.
      const isi = Math.floor(n / jumlahBatch) + (b < n % jumlahBatch ? 1 : 0);
      const batchTersisa = jumlahBatch - b;
      const g = Math.min(isi, Math.ceil(sisaGambar / batchTersisa));
      sisaGambar -= g;
      batch.push({
        tipe: t,
        jumlah: isi,
        jumlahBergambar: g,
        modeGambar: gambar.mode,
        skor: skor[t].slice(posisi, posisi + isi),
      });
      posisi += isi;
    }
  }
  return batch;
}

// ---------------------------------------------------------------------------
// 4. Prompt
// ---------------------------------------------------------------------------

export interface KonteksPrompt {
  mapel: string;
  jenjang: 7 | 8 | 9;
  topik: string[];
  kesulitan: Kesulitan;
  jumlahOpsi: 4 | 5;
  catatan: string;
  /** Cuplikan soal yang sudah dibuat batch sebelumnya — supaya tidak
   *  ada soal kembar antar-batch. */
  hindari: string[];
}

const ATURAN_BENTUK: Record<TipeSoal, (k: KonteksPrompt) => string> = {
  pilgan_biasa: (k) =>
    `Pilihan ganda: tepat ${k.jumlahOpsi} opsi, TEPAT SATU benar (isi "indeks_benar" dengan satu angka, mulai 0). Pengecoh harus masuk akal (miskonsepsi umum), panjang opsi seimbang. Jangan pakai opsi "semua benar"/"semua salah".`,
  pilgan_kompleks: (k) =>
    `Pilihan ganda kompleks: ${k.jumlahOpsi} opsi, 2 atau 3 opsi benar (isi "indeks_benar" dengan daftar angka, mulai 0). Kalimat pertanyaan menyebut "pilih semua jawaban yang benar".`,
  uraian_singkat: () =>
    `Uraian singkat: jawabannya SATU kata/angka/frasa pendek (maks 3 kata). "kunci_jawaban" berisi 1-4 variasi penulisan yang sama-sama benar (mis. ["fotosintesis"], ["25 cm","25cm"]). Penilaian: jawaban siswa dianggap benar bila MEMUAT salah satu kunci (tidak peka huruf besar), jadi jangan pakai kunci yang terlalu pendek/umum (mis. "a", "ya").`,
  benar_salah: () =>
    `Benar/Salah: satu pernyataan tegas yang jelas benar atau jelas salah. Seimbangkan jumlah pernyataan benar dan salah.`,
  multi_benar_salah: () =>
    `Benar/Salah bertingkat: satu "instruksi"/stimulus singkat, lalu 3-5 "pernyataan" yang masing-masing punya kunci benar/salah sendiri. Campur benar dan salah.`,
  menjodohkan: () =>
    `Menjodohkan: satu "instruksi", 4-5 "pasangan" {kiri, kanan} yang saling unik, plus 0-2 "pengecoh" (teks kolom kanan yang tidak punya pasangan).`,
};

export const INSTRUKSI_SISTEM = [
  "Kamu adalah guru SMP berpengalaman di Indonesia yang menyusun soal asesmen Kurikulum Merdeka.",
  "Tulis dalam Bahasa Indonesia baku yang mudah dipahami siswa SMP.",
  "Soal harus akurat secara fakta, satu kunci jawaban tidak boleh diperdebatkan, dan sesuai tingkat kelas.",
  "Konten aman untuk anak: tanpa kekerasan, SARA, politik praktis, merek dagang, tokoh/karakter berhak cipta, atau data pribadi orang nyata (kecuali tokoh sejarah/ilmuwan dalam konteks pelajaran).",
  "Teks polos saja: JANGAN pakai Markdown, HTML, atau LaTeX. Untuk matematika pakai simbol Unicode (², ³, √, ×, ÷, π, ≤, ≥, °) dan pecahan seperti 3/4.",
  "Jangan menulis huruf opsi (A., B.) di dalam teks opsi.",
].join("\n");

export function buatPromptBatch(batch: BatchGenerate, k: KonteksPrompt): string {
  const baris: string[] = [];
  baris.push(
    `Buat ${batch.jumlah} soal bentuk "${TIPE_LABEL[batch.tipe]}" untuk mata pelajaran ${k.mapel}, kelas ${k.jenjang} SMP.`
  );
  baris.push(
    `Topik/materi (sebar soal merata ke semua topik, isi field "topik" dengan topik yang dipakai): ${k.topik
      .map((t) => `"${t}"`)
      .join(", ")}.`
  );
  baris.push(`Tingkat kesulitan: ${KESULITAN_LABEL[k.kesulitan]}.`);
  baris.push(ATURAN_BENTUK[batch.tipe](k));

  if (batch.jumlahBergambar > 0) {
    baris.push(
      batch.modeGambar === "tepat"
        ? `TEPAT ${batch.jumlahBergambar} dari ${batch.jumlah} soal WAJIB memakai gambar (gambar.perlu = true); sisanya gambar.perlu = false.`
        : `Paling banyak ${batch.jumlahBergambar} soal boleh memakai gambar, HANYA bila gambar benar-benar membantu (grafik, bangun, diagram, peta, alat, makhluk hidup). Sisanya gambar.perlu = false.`
    );
    baris.push(
      [
        "Untuk soal bergambar: gambar ditampilkan DI ATAS teks pertanyaan, jadi teks boleh diawali \"Perhatikan gambar berikut!\".",
        'gambar.jenis = "diagram" untuk grafik/bangun/tabel/skema yang butuh angka atau label tepat; "ilustrasi" untuk benda, hewan, tumbuhan, suasana.',
        "gambar.deskripsi = uraian lengkap Bahasa Indonesia tentang isi gambar, termasuk SEMUA angka/label yang harus terlihat (guru dan generator diagram memakai ini).",
        'gambar.prompt_en = prompt singkat Bahasa Inggris untuk generator ilustrasi, tanpa teks di gambar, gaya "simple flat educational illustration, white background".',
        "Soal harus bisa dijawab dengan gambar itu — jangan menyebut detail yang tidak ada di deskripsi.",
      ].join("\n")
    );
  } else {
    baris.push('Semua soal tanpa gambar: isi gambar.perlu = false dan field gambar lain dengan string kosong.');
  }

  baris.push('Isi "pembahasan" dengan penjelasan singkat (1-2 kalimat) mengapa kuncinya benar — ini hanya untuk guru.');

  if (k.catatan.trim()) {
    baris.push(`Catatan tambahan dari guru: ${k.catatan.trim()}`);
  }
  if (k.hindari.length > 0) {
    baris.push(
      `Jangan mengulang atau memparafrasakan soal yang sudah ada berikut:\n${k.hindari
        .slice(-40)
        .map((h) => `- ${h}`)
        .join("\n")}`
    );
  }
  baris.push('Keluarkan JSON {"soal": [...]} sesuai skema.');
  return baris.join("\n\n");
}

// ---------------------------------------------------------------------------
// Skema respons (format OpenAPI-subset yang dipakai Gemini responseSchema)
// ---------------------------------------------------------------------------

type Skema = Record<string, unknown>;

const S_STR: Skema = { type: "STRING" };
const S_BOOL: Skema = { type: "BOOLEAN" };
const S_INT: Skema = { type: "INTEGER" };

const SKEMA_GAMBAR: Skema = {
  type: "OBJECT",
  properties: {
    perlu: S_BOOL,
    jenis: { type: "STRING", enum: ["diagram", "ilustrasi"] },
    deskripsi: S_STR,
    prompt_en: S_STR,
  },
  required: ["perlu", "jenis", "deskripsi", "prompt_en"],
};

const FIELD_UMUM: Record<string, Skema> = {
  topik: S_STR,
  pembahasan: S_STR,
  gambar: SKEMA_GAMBAR,
};

function skemaItem(tipe: TipeSoal): Skema {
  switch (tipe) {
    case "pilgan_biasa":
      return {
        type: "OBJECT",
        properties: {
          pertanyaan: S_STR,
          opsi: { type: "ARRAY", items: S_STR },
          indeks_benar: S_INT,
          ...FIELD_UMUM,
        },
        required: ["pertanyaan", "opsi", "indeks_benar", "topik", "pembahasan", "gambar"],
      };
    case "pilgan_kompleks":
      return {
        type: "OBJECT",
        properties: {
          pertanyaan: S_STR,
          opsi: { type: "ARRAY", items: S_STR },
          indeks_benar: { type: "ARRAY", items: S_INT },
          ...FIELD_UMUM,
        },
        required: ["pertanyaan", "opsi", "indeks_benar", "topik", "pembahasan", "gambar"],
      };
    case "uraian_singkat":
      return {
        type: "OBJECT",
        properties: {
          pertanyaan: S_STR,
          kunci_jawaban: { type: "ARRAY", items: S_STR },
          ...FIELD_UMUM,
        },
        required: ["pertanyaan", "kunci_jawaban", "topik", "pembahasan", "gambar"],
      };
    case "benar_salah":
      return {
        type: "OBJECT",
        properties: {
          pertanyaan: S_STR,
          jawaban_benar: S_BOOL,
          ...FIELD_UMUM,
        },
        required: ["pertanyaan", "jawaban_benar", "topik", "pembahasan", "gambar"],
      };
    case "multi_benar_salah":
      return {
        type: "OBJECT",
        properties: {
          instruksi: S_STR,
          pernyataan: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { teks: S_STR, benar: S_BOOL },
              required: ["teks", "benar"],
            },
          },
          ...FIELD_UMUM,
        },
        required: ["instruksi", "pernyataan", "topik", "pembahasan", "gambar"],
      };
    case "menjodohkan":
      return {
        type: "OBJECT",
        properties: {
          instruksi: S_STR,
          pasangan: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { kiri: S_STR, kanan: S_STR },
              required: ["kiri", "kanan"],
            },
          },
          pengecoh: { type: "ARRAY", items: S_STR },
          topik: S_STR,
          pembahasan: S_STR,
        },
        required: ["instruksi", "pasangan", "topik", "pembahasan"],
      };
  }
}

export function skemaRespons(tipe: TipeSoal): Skema {
  return {
    type: "OBJECT",
    properties: { soal: { type: "ARRAY", items: skemaItem(tipe) } },
    required: ["soal"],
  };
}

// ---------------------------------------------------------------------------
// 5. Normalisasi
// ---------------------------------------------------------------------------

export interface PermintaanGambar {
  jenis: JenisGambar;
  deskripsi: string;
  promptEn: string;
}

export interface DraftSoal {
  /** Id lokal di layar tinjauan, bukan id database. */
  idLokal: string;
  tipe: TipeSoal;
  skor: number;
  topik: string;
  /** Bentuk persis `konten_jsonb` (tanpa gambar — gambar disisipkan saat
   *  menyimpan lewat `kontenSiapSimpan`). */
  konten: Record<string, unknown>;
  /** Hanya untuk guru. SENGAJA tidak ikut ke `konten_jsonb`: RPC
   *  `get_soal_untuk_siswa` hanya membuang field kunci yang dikenalnya,
   *  jadi pembahasan yang tersimpan akan terkirim ke HP siswa. */
  pembahasan: string;
  gambar: PermintaanGambar | null;
}

let urutId = 0;
function idAcak(prefix: string): string {
  urutId = (urutId + 1) % 1_000_000;
  return `${prefix}${Math.random().toString(36).slice(2, 7)}${urutId.toString(36)}`;
}

/** Teks polos aman: buang tag/markdown yang kadang tetap keluar dari AI,
 *  rapikan spasi, batasi panjang. */
export function rapikanTeks(x: unknown, maks = 2000): string {
  return String(x ?? "")
    .replace(/<[^>]{0,200}>/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\$\$?([^$]{1,200})\$\$?/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maks);
}

function acak<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function bacaGambar(raw: unknown): PermintaanGambar | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (g.perlu !== true) return null;
  const deskripsi = rapikanTeks(g.deskripsi, 800);
  if (!deskripsi) return null;
  return {
    jenis: g.jenis === "diagram" ? "diagram" : "ilustrasi",
    deskripsi,
    promptEn: rapikanTeks(g.prompt_en, 400) || deskripsi,
  };
}

/**
 * Ubah satu item mentah dari AI jadi DraftSoal, atau `null` kalau
 * bentuknya tidak bisa diselamatkan (item itu dibuang, batch lain jalan).
 * Opsi diacak di sini karena AI cenderung menaruh jawaban benar di opsi
 * pertama.
 */
export function normalisasiItem(
  tipe: TipeSoal,
  raw: unknown,
  skor: number,
  jumlahOpsi: 4 | 5
): DraftSoal | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const topik = rapikanTeks(r.topik, 120);
  const pembahasan = rapikanTeks(r.pembahasan, 1000);
  const gambar = tipe === "menjodohkan" ? null : bacaGambar(r.gambar);
  const dasar = { idLokal: idAcak("d"), tipe, skor, topik, pembahasan, gambar };

  switch (tipe) {
    case "pilgan_biasa":
    case "pilgan_kompleks": {
      const pertanyaan = rapikanTeks(r.pertanyaan);
      const teksOpsi = Array.isArray(r.opsi)
        ? r.opsi
            // AI kadang tetap menulis "A. " di depan opsi walau dilarang.
            .map((o) => rapikanTeks(String(o ?? "").replace(/^\s*[A-Ea-e][.)]\s+/, ""), 500))
            .filter(Boolean)
        : [];
      if (!pertanyaan || teksOpsi.length < 2) return null;
      const opsiDipakai = teksOpsi.slice(0, Math.max(jumlahOpsi, 2));

      const indeksBenar = new Set<number>(
        (Array.isArray(r.indeks_benar) ? r.indeks_benar : [r.indeks_benar])
          .map((x) => Number(x))
          .filter((x) => Number.isInteger(x) && x >= 0 && x < opsiDipakai.length)
      );
      if (tipe === "pilgan_biasa" && indeksBenar.size !== 1) return null;
      if (tipe === "pilgan_kompleks" && indeksBenar.size < 1) return null;

      const opsi = acak(
        opsiDipakai.map((teks, i) => ({
          id: idAcak("o"),
          teks,
          teks_html: teksKeHtml(teks),
          gambar_url: null,
          benar: indeksBenar.has(i),
        }))
      );
      return {
        ...dasar,
        konten: { pertanyaan, pertanyaan_html: teksKeHtml(pertanyaan), opsi },
      };
    }

    case "uraian_singkat": {
      const pertanyaan = rapikanTeks(r.pertanyaan);
      const kunci = Array.isArray(r.kunci_jawaban)
        ? Array.from(
            new Set(
              r.kunci_jawaban
                .map((k) => rapikanTeks(k, 100))
                .filter((k) => k.length >= 2 || /^\d$/.test(k))
            )
          ).slice(0, 6)
        : [];
      if (!pertanyaan || kunci.length === 0) return null;
      return {
        ...dasar,
        konten: {
          pertanyaan,
          pertanyaan_html: teksKeHtml(pertanyaan),
          kunci_jawaban: kunci,
        },
      };
    }

    case "benar_salah": {
      const pertanyaan = rapikanTeks(r.pertanyaan);
      if (!pertanyaan || typeof r.jawaban_benar !== "boolean") return null;
      return {
        ...dasar,
        konten: {
          pertanyaan,
          pertanyaan_html: teksKeHtml(pertanyaan),
          jawaban_benar: r.jawaban_benar,
        },
      };
    }

    case "multi_benar_salah": {
      const instruksi = rapikanTeks(r.instruksi);
      const pernyataan = Array.isArray(r.pernyataan)
        ? r.pernyataan
            .map((p) => {
              const o = (p ?? {}) as Record<string, unknown>;
              const teks = rapikanTeks(o.teks, 500);
              if (!teks || typeof o.benar !== "boolean") return null;
              return {
                id: idAcak("p"),
                teks,
                teks_html: teksKeHtml(teks),
                jawaban_benar: o.benar,
              };
            })
            .filter((p): p is NonNullable<typeof p> => p !== null)
            .slice(0, 6)
        : [];
      if (!instruksi || pernyataan.length < 2) return null;
      return {
        ...dasar,
        konten: {
          instruksi,
          instruksi_html: teksKeHtml(instruksi),
          pernyataan,
        },
      };
    }

    case "menjodohkan": {
      const instruksi = rapikanTeks(r.instruksi);
      const pasanganMentah = Array.isArray(r.pasangan) ? r.pasangan : [];
      const soal: { id: string; teks: string; teks_html: string; gambar_url: null }[] = [];
      const jawaban: { id: string; teks: string; teks_html: string }[] = [];
      const pasangan_benar: Record<string, string> = {};
      const kananDipakai = new Set<string>();

      for (const p of pasanganMentah.slice(0, 8)) {
        const o = (p ?? {}) as Record<string, unknown>;
        const kiri = rapikanTeks(o.kiri, 300);
        const kanan = rapikanTeks(o.kanan, 300);
        if (!kiri || !kanan || kananDipakai.has(kanan.toLowerCase())) continue;
        kananDipakai.add(kanan.toLowerCase());
        const s = { id: idAcak("s"), teks: kiri, teks_html: teksKeHtml(kiri), gambar_url: null };
        const j = { id: idAcak("j"), teks: kanan, teks_html: teksKeHtml(kanan) };
        soal.push(s);
        jawaban.push(j);
        pasangan_benar[s.id] = j.id;
      }
      const pengecoh = Array.isArray(r.pengecoh) ? r.pengecoh : [];
      for (const x of pengecoh.slice(0, 3)) {
        const teks = rapikanTeks(x, 300);
        if (!teks || kananDipakai.has(teks.toLowerCase())) continue;
        kananDipakai.add(teks.toLowerCase());
        jawaban.push({ id: idAcak("j"), teks, teks_html: teksKeHtml(teks) });
      }
      if (!instruksi || soal.length < 2) return null;
      return {
        ...dasar,
        konten: {
          instruksi,
          instruksi_html: teksKeHtml(instruksi),
          soal,
          jawaban: acak(jawaban),
          pasangan_benar,
        },
      };
    }
  }
}

/** Ambil ringkasan teks pertanyaan untuk daftar "hindari". */
export function cuplikanDraft(d: DraftSoal): string {
  const t = String(d.konten.pertanyaan ?? d.konten.instruksi ?? "");
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

/**
 * `konten_jsonb` final siap kirim ke `createSoal`. Gambar (kalau ada)
 * disisipkan di AWAL pertanyaan/instruksi — prompt meminta AI menulis
 * teks yang mengandaikan gambar ada di atasnya. Lebar 75% supaya tidak
 * memenuhi layar HP; guru bisa mengubahnya lewat form edit.
 *
 * `teks` polos pertanyaan TIDAK diubah: sama seperti editor kaya,
 * `htmlKeTeks()` mengganti <img> dengan spasi.
 */
export function kontenSiapSimpan(
  d: DraftSoal,
  urlGambar: string | null
): Record<string, unknown> {
  const konten = { ...d.konten };
  const fieldHtml = "pertanyaan_html" in konten ? "pertanyaan_html" : "instruksi_html";
  const fieldTeks = fieldHtml === "pertanyaan_html" ? "pertanyaan" : "instruksi";

  // Teks yang diedit guru di layar tinjauan disimpan di field polos;
  // HTML-nya selalu diturunkan ulang dari situ supaya keduanya sinkron.
  const htmlTeks = teksKeHtml(String(konten[fieldTeks] ?? ""));
  konten[fieldHtml] =
    urlGambar && /^https:\/\//i.test(urlGambar)
      ? `<p style="text-align:center"><img src="${escapeAtribut(urlGambar)}" alt="${escapeAtribut(
          d.gambar?.deskripsi.slice(0, 150) ?? "Gambar soal"
        )}" data-lebar="75" /></p><p>${htmlTeks}</p>`
      : htmlTeks;

  for (const daftar of ["opsi", "pernyataan", "soal", "jawaban"] as const) {
    const arr = konten[daftar];
    if (Array.isArray(arr)) {
      konten[daftar] = arr.map((x) => {
        const o = x as Record<string, unknown>;
        return { ...o, teks_html: teksKeHtml(String(o.teks ?? "")) };
      });
    }
  }
  return konten;
}

/** Validasi rencana dari body request (dipakai server, jangan percaya client). */
export function validasiRencana(raw: unknown): RencanaGenerate | string {
  if (!raw || typeof raw !== "object") return "Data permintaan tidak valid.";
  const r = raw as Record<string, unknown>;

  const topik = Array.isArray(r.topik)
    ? r.topik.map((t) => rapikanTeks(t, 200)).filter(Boolean).slice(0, MAKS_TOPIK)
    : [];
  if (topik.length === 0) return "Isi minimal satu topik/materi.";

  const jumlah = jumlahKosong();
  const jMentah = (r.jumlah ?? {}) as Record<string, unknown>;
  for (const t of TIPE_SOAL_LIST) {
    const n = Math.floor(Number(jMentah[t] ?? 0));
    jumlah[t] = Number.isFinite(n) && n > 0 ? Math.min(n, MAKS_SOAL_SEKALI) : 0;
  }
  const total = totalSoal(jumlah);
  if (total === 0) return "Isi jumlah soal minimal pada satu bentuk soal.";
  if (total > MAKS_SOAL_SEKALI) {
    return `Maksimal ${MAKS_SOAL_SEKALI} soal sekali generate (sekarang ${total}). Generate dua kali saja.`;
  }

  const gRaw = r.jumlahBergambar;
  const jumlahBergambar =
    gRaw === null || gRaw === undefined || gRaw === ""
      ? null
      : Math.max(0, Math.floor(Number(gRaw)) || 0);

  const kesulitan: Kesulitan = (["mudah", "sedang", "sulit", "campuran"] as const).includes(
    r.kesulitan as Kesulitan
  )
    ? (r.kesulitan as Kesulitan)
    : "campuran";

  const totalSkor = Number(r.totalSkor);
  return {
    topik,
    jumlah,
    jumlahBergambar,
    kesulitan,
    jumlahOpsi: Number(r.jumlahOpsi) === 5 ? 5 : 4,
    catatan: rapikanTeks(r.catatan, 600),
    totalSkor: Number.isFinite(totalSkor) && totalSkor > 0 ? Math.min(totalSkor, 1000) : 100,
  };
}
