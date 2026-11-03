/**
 * Stimulus soal ala TKA (Tes Kemampuan Akademik) — bagian MURNI.
 *
 * Setiap soal hasil AI punya stimulus: bacaan, tabel data, grafik,
 * infografis, atau gambar. AI hanya menulis DATA-nya (teks, angka, poin);
 * gambarnya dirender oleh kode, bukan oleh AI:
 *
 *   tabel      → SVG buatan sendiri (`svgTabel`)
 *   grafik     → Vega-Lite (github.com/vega/vega-lite, BSD-3) dari `specGrafik`
 *   infografis → AntV Infographic (github.com/antvis/Infographic, MIT) dari `opsiInfografis`
 *   bacaan     → teks HTML di atas pertanyaan (`htmlBacaan`)
 *   gambar     → jalur gambar lama (diagram / ilustrasi / foto Wikimedia)
 *
 * Alasannya: angka di grafik/tabel harus PERSIS sama dengan yang dipakai
 * kunci jawaban. Kalau AI yang "menggambar" grafik, angka di gambar dan
 * di soal sering tidak cocok. Bonusnya: tidak ada panggilan AI tambahan.
 *
 * Rendering SVG-nya di server (`stimulus-server.ts`, route
 * /api/ai/stimulus); di browser SVG diubah ke PNG lalu diunggah lewat
 * jalur gambar biasa (Cloudinary), sama seperti diagram.
 */

import { escapeAtribut, teksKeHtml } from "@/lib/html-soal";

export type JenisStimulus = "bacaan" | "tabel" | "grafik" | "infografis" | "gambar";
export type BentukGrafik = "batang" | "garis" | "lingkaran";
export type BentukInfografis = "proses" | "siklus" | "perbandingan" | "daftar" | "piramida";

export const JENIS_STIMULUS: { jenis: JenisStimulus; label: string; ikon: string }[] = [
  { jenis: "bacaan", label: "Bacaan / teks", ikon: "fa-book-open" },
  { jenis: "tabel", label: "Tabel data", ikon: "fa-table" },
  { jenis: "grafik", label: "Grafik", ikon: "fa-chart-column" },
  { jenis: "infografis", label: "Infografis", ikon: "fa-diagram-project" },
  { jenis: "gambar", label: "Gambar / foto", ikon: "fa-image" },
];
export const SEMUA_JENIS_STIMULUS: JenisStimulus[] = JENIS_STIMULUS.map((j) => j.jenis);

export const BENTUK_INFOGRAFIS: Record<BentukInfografis, { label: string; template: string }> = {
  proses: { label: "Urutan proses", template: "list-row-horizontal-icon-arrow" },
  siklus: { label: "Siklus", template: "sequence-circular-underline-text" },
  perbandingan: { label: "Perbandingan", template: "compare-hierarchy-row-letter-card-compact-card" },
  daftar: { label: "Daftar poin", template: "list-grid-badge-card" },
  piramida: { label: "Piramida/tingkatan", template: "list-pyramid-badge-card" },
};

export interface PoinInfografis {
  label: string;
  teks: string;
  /** Hanya untuk "perbandingan": ciri-ciri tiap kelompok. */
  anak: string[];
}

export interface DatumGrafik {
  label: string;
  nilai: number;
  /** Kosong = satu seri saja. */
  seri: string;
}

interface StimulusDasar {
  judul: string;
  /** Sumber data/bacaan, mis. "BPS 2024" atau URL bahan bacaan guru. */
  sumber: string;
}

export type Stimulus =
  | (StimulusDasar & { jenis: "bacaan"; teks: string })
  | (StimulusDasar & { jenis: "tabel"; kolom: string[]; baris: string[][] })
  | (StimulusDasar & {
      jenis: "grafik";
      bentuk: BentukGrafik;
      sumbuX: string;
      sumbuY: string;
      data: DatumGrafik[];
    })
  | (StimulusDasar & { jenis: "infografis"; bentuk: BentukInfografis; poin: PoinInfografis[] });

/** Stimulus yang harus dirender jadi gambar dulu sebelum soal disimpan. */
export function stimulusPerluRender(s: Stimulus | null | undefined): boolean {
  return !!s && s.jenis !== "bacaan";
}

// ---------------------------------------------------------------------------
// Prompt & skema Gemini
// ---------------------------------------------------------------------------

export function aturanStimulus(boleh: JenisStimulus[]): string {
  const jenis = boleh.length ? boleh : SEMUA_JENIS_STIMULUS;
  const baris = [
    "SETIAP soal WAJIB setara soal TKA (Tes Kemampuan Akademik) SMP: diawali STIMULUS, lalu pertanyaan yang hanya bisa dijawab dengan membaca/menganalisis stimulus itu. Soal LOTS tetap memakai stimulus, pertanyaannya saja yang lebih langsung.",
    `Bentuk stimulus yang boleh dipakai: ${jenis.join(", ")}. Variasikan bentuknya di antara soal; jangan semua bacaan.`,
    'Isi field "stimulus" (jenis, judul, sumber, dan field yang sesuai bentuknya). Teks "pertanyaan"/"instruksi" TIDAK mengulang isi stimulus; boleh diawali "Berdasarkan tabel/grafik/bacaan di atas, ...".',
  ];
  if (jenis.includes("bacaan")) {
    baris.push('- bacaan: "teks" 60-150 kata (teks informasi, berita singkat, kasus sehari-hari, atau dialog), faktual dan sesuai usia.');
  }
  if (jenis.includes("tabel")) {
    baris.push('- tabel: "kolom" 2-5 judul kolom, "baris" 3-7 baris (tiap baris = daftar sel, jumlahnya sama dengan kolom). Angka masuk akal dan konsisten dengan kunci.');
  }
  if (jenis.includes("grafik")) {
    baris.push(
      '- grafik: "bentuk" batang/garis/lingkaran, "sumbu_x" dan "sumbu_y" (judul sumbu + satuan), "data" 3-8 titik {label, nilai angka, seri}. Isi "seri" hanya bila membandingkan 2-3 kelompok (garis/batang); lingkaran tanpa seri dan nilainya persen/jumlah.'
    );
  }
  if (jenis.includes("infografis")) {
    baris.push(
      '- infografis: "bentuk" proses/siklus/perbandingan/daftar/piramida, "poin" 3-6 butir {label maks 4 kata, teks maks 12 kata}. Untuk perbandingan: tepat 2 poin, ciri-cirinya di "anak" (2-4 butir pendek).'
    );
  }
  if (jenis.includes("gambar")) {
    baris.push(
      '- gambar: stimulus.jenis = "gambar" dan isi field "gambar" (perlu = true) seperti aturan gambar. Pakai hanya bila gambar benar-benar perlu (bangun, alat, makhluk hidup, peta).'
    );
  }
  baris.push(
    'Isi "sumber" bila data/bacaan mengacu sumber nyata (mis. "BPS 2023", "Kemenkes"); data rekaan tulis "Data ilustrasi". Jangan mengarang kutipan tokoh nyata.'
  );
  return baris.join("\n");
}

const S_STR = { type: "STRING" };

export const SKEMA_STIMULUS = {
  type: "OBJECT",
  properties: {
    jenis: { type: "STRING", enum: SEMUA_JENIS_STIMULUS },
    judul: S_STR,
    sumber: S_STR,
    teks: S_STR,
    kolom: { type: "ARRAY", items: S_STR },
    baris: { type: "ARRAY", items: { type: "ARRAY", items: S_STR } },
    bentuk: S_STR,
    sumbu_x: S_STR,
    sumbu_y: S_STR,
    data: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { label: S_STR, nilai: { type: "NUMBER" }, seri: S_STR },
        required: ["label", "nilai"],
      },
    },
    poin: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { label: S_STR, teks: S_STR, anak: { type: "ARRAY", items: S_STR } },
        required: ["label"],
      },
    },
  },
  required: ["jenis", "judul"],
};

// ---------------------------------------------------------------------------
// Normalisasi
// ---------------------------------------------------------------------------

function teks(x: unknown, maks: number): string {
  return String(x ?? "")
    .replace(/<[^>]{0,200}>/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maks);
}

/**
 * Jawaban mentah AI → Stimulus yang aman dirender, atau null.
 * `jenis: "gambar"` mengembalikan null: gambarnya diurus field `gambar`.
 * Bentuk yang rusak (mis. tabel tanpa baris) diturunkan jadi bacaan
 * kalau masih ada teksnya, supaya soalnya tidak kehilangan konteks.
 */
export function normalisasiStimulus(raw: unknown, boleh: JenisStimulus[] = SEMUA_JENIS_STIMULUS): Stimulus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const judul = teks(r.judul, 120);
  const sumber = teks(r.sumber, 160);
  const isiTeks = teks(r.teks, 1500);
  const jadiBacaan = (): Stimulus | null =>
    isiTeks.length >= 20 ? { jenis: "bacaan", judul, sumber, teks: isiTeks } : null;

  const jenis = String(r.jenis ?? "");
  if (jenis === "gambar") return null;
  if (!boleh.includes(jenis as JenisStimulus) && jenis !== "bacaan") return jadiBacaan();

  switch (jenis) {
    case "bacaan":
      return jadiBacaan();

    case "tabel": {
      const kolom = (Array.isArray(r.kolom) ? r.kolom : []).map((k) => teks(k, 40)).filter(Boolean).slice(0, 6);
      if (kolom.length < 2) return jadiBacaan();
      const baris = (Array.isArray(r.baris) ? r.baris : [])
        .map((b) => {
          const sel = (Array.isArray(b) ? b : typeof b === "object" && b && Array.isArray((b as { sel?: unknown }).sel) ? (b as { sel: unknown[] }).sel : [])
            .map((x) => teks(x, 60));
          // Samakan jumlah sel dengan jumlah kolom.
          return kolom.map((_, i) => sel[i] ?? "");
        })
        .filter((b) => b.some(Boolean))
        .slice(0, 10);
      if (baris.length < 1) return jadiBacaan();
      return { jenis: "tabel", judul, sumber, kolom, baris };
    }

    case "grafik": {
      const bentuk: BentukGrafik = r.bentuk === "garis" ? "garis" : r.bentuk === "lingkaran" ? "lingkaran" : "batang";
      const data = (Array.isArray(r.data) ? r.data : [])
        .map((d) => {
          const o = (d ?? {}) as Record<string, unknown>;
          const nilai = Number(String(o.nilai ?? "").replace(",", "."));
          return { label: teks(o.label, 30), nilai, seri: bentuk === "lingkaran" ? "" : teks(o.seri, 30) };
        })
        .filter((d) => d.label && Number.isFinite(d.nilai))
        .slice(0, 24);
      if (data.length < 2) return jadiBacaan();
      if (bentuk === "lingkaran" && data.some((d) => d.nilai < 0)) return jadiBacaan();
      return { jenis: "grafik", judul, sumber, bentuk, sumbuX: teks(r.sumbu_x, 40), sumbuY: teks(r.sumbu_y, 40), data };
    }

    case "infografis": {
      const bentuk = (Object.keys(BENTUK_INFOGRAFIS) as BentukInfografis[]).includes(r.bentuk as BentukInfografis)
        ? (r.bentuk as BentukInfografis)
        : "daftar";
      const poin = (Array.isArray(r.poin) ? r.poin : [])
        .map((p) => {
          const o = (p ?? {}) as Record<string, unknown>;
          return {
            label: teks(o.label, 40),
            teks: teks(o.teks, 90),
            anak: (Array.isArray(o.anak) ? o.anak : []).map((a) => teks(a, 50)).filter(Boolean).slice(0, 5),
          };
        })
        .filter((p) => p.label)
        .slice(0, 7);
      if (bentuk === "perbandingan" ? poin.length < 2 : poin.length < 2) return jadiBacaan();
      return { jenis: "infografis", judul, sumber, bentuk, poin: bentuk === "perbandingan" ? poin.slice(0, 2) : poin };
    }
  }
  return jadiBacaan();
}

// ---------------------------------------------------------------------------
// Render (murni: hanya menyusun spesifikasi/teks)
// ---------------------------------------------------------------------------

const WARNA = ["#1e3a8a", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#0ea5e9", "#ec4899", "#84cc16"];

/** Spesifikasi Vega-Lite untuk stimulus grafik. */
export function specGrafik(s: Extract<Stimulus, { jenis: "grafik" }>): Record<string, unknown> {
  const adaSeri = s.data.some((d) => d.seri);
  const dasar = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width: 560,
    height: 300,
    background: "#ffffff",
    padding: 16,
    title: { text: s.judul || " ", fontSize: 16, font: "Arial", anchor: "middle" },
    config: {
      font: "Arial",
      axis: { labelFontSize: 12, titleFontSize: 13, grid: true, gridColor: "#e5e7eb" },
      legend: { labelFontSize: 12, titleFontSize: 12 },
      range: { category: WARNA },
      view: { stroke: null },
    },
    data: { values: s.data.map((d) => ({ label: d.label, nilai: d.nilai, seri: d.seri || "Data" })) },
  };
  const sumbuX = { field: "label", type: "nominal", sort: null, title: s.sumbuX || null, axis: { labelAngle: s.data.length > 6 ? -30 : 0 } };
  const sumbuY = { field: "nilai", type: "quantitative", title: s.sumbuY || null };

  if (s.bentuk === "lingkaran") {
    return {
      ...dasar,
      width: 360,
      height: 300,
      layer: [
        { mark: { type: "arc", outerRadius: 120, stroke: "#fff" } },
        { mark: { type: "text", radius: 145, fontSize: 12, fontWeight: "bold" }, encoding: { text: { field: "nilai", type: "quantitative" } } },
      ],
      encoding: {
        theta: { field: "nilai", type: "quantitative", stack: true },
        color: { field: "label", type: "nominal", sort: null, title: null },
      },
    };
  }
  if (s.bentuk === "garis") {
    return {
      ...dasar,
      layer: [
        { mark: { type: "line", point: { size: 60 }, strokeWidth: 3 } },
        { mark: { type: "text", dy: -12, fontSize: 11 }, encoding: { text: { field: "nilai", type: "quantitative" } } },
      ],
      encoding: { x: sumbuX, y: sumbuY, ...(adaSeri ? { color: { field: "seri", type: "nominal", title: null } } : {}) },
    };
  }
  return {
    ...dasar,
    layer: [
      { mark: { type: "bar", cornerRadiusEnd: 3 } },
      {
        mark: { type: "text", dy: -8, fontSize: 11 },
        encoding: { text: { field: "nilai", type: "quantitative" }, ...(adaSeri ? { xOffset: { field: "seri" } } : {}) },
      },
    ],
    encoding: {
      x: sumbuX,
      y: sumbuY,
      ...(adaSeri ? { color: { field: "seri", type: "nominal", title: null }, xOffset: { field: "seri" } } : { color: { value: WARNA[0] } }),
    },
  };
}

/** Opsi AntV Infographic untuk stimulus infografis. */
export function opsiInfografis(s: Extract<Stimulus, { jenis: "infografis" }>): {
  template: string;
  data: Record<string, unknown>;
} {
  const items = s.poin.map((p) => ({
    label: p.label,
    desc: p.teks,
    ...(s.bentuk === "perbandingan" ? { children: p.anak.map((a) => ({ label: a })) } : {}),
  }));
  return {
    template: BENTUK_INFOGRAFIS[s.bentuk].template,
    data: { title: s.judul, items, lists: items, sequences: items, compares: items },
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Pecah teks jadi baris berdasarkan perkiraan jumlah huruf per baris. */
export function bungkusTeks(t: string, maksHuruf: number): string[] {
  const kata = t.split(/\s+/).filter(Boolean);
  const hasil: string[] = [];
  let baris = "";
  for (const k of kata) {
    const calon = baris ? `${baris} ${k}` : k;
    if (calon.length > maksHuruf && baris) {
      hasil.push(baris);
      baris = k;
    } else baris = calon;
  }
  if (baris) hasil.push(baris);
  return hasil.length ? hasil : [""];
}

/** Tabel data sebagai SVG (tabel HTML tidak lolos penyaring soal). */
export function svgTabel(s: Extract<Stimulus, { jenis: "tabel" }>): string {
  const LEBAR = 800;
  const PAD = 24;
  const n = s.kolom.length;
  // Lebar kolom sebanding panjang isi terpanjangnya (min 1).
  const bobot = s.kolom.map((k, i) =>
    Math.max(4, Math.min(30, Math.max(k.length, ...s.baris.map((b) => (b[i] ?? "").length))))
  );
  const total = bobot.reduce((a, b) => a + b, 0);
  const lebarKolom = bobot.map((b) => ((LEBAR - PAD * 2) * b) / total);
  const hurufPer = lebarKolom.map((w) => Math.max(4, Math.floor((w - 16) / 7.6)));
  const TINGGI_BARIS_TEKS = 18;

  let y = PAD;
  const isi: string[] = [];
  if (s.judul) {
    isi.push(
      `<text x="${LEBAR / 2}" y="${y + 18}" text-anchor="middle" font-size="18" font-weight="bold" fill="#0f172a">${esc(s.judul)}</text>`
    );
    y += 34;
  }

  const barisSemua = [s.kolom, ...s.baris];
  barisSemua.forEach((sel, r) => {
    const pecah = sel.map((t, i) => bungkusTeks(t, hurufPer[i]));
    const tinggi = Math.max(...pecah.map((p) => p.length)) * TINGGI_BARIS_TEKS + 14;
    let x = PAD;
    for (let i = 0; i < n; i++) {
      const w = lebarKolom[i];
      const kepala = r === 0;
      isi.push(
        `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${tinggi}" fill="${
          kepala ? "#1e3a8a" : r % 2 === 0 ? "#f1f5f9" : "#ffffff"
        }" stroke="#94a3b8" stroke-width="1"/>`
      );
      const angka = !kepala && /^[-+]?[\d.,]+\s*%?$/.test((sel[i] ?? "").trim());
      pecah[i].forEach((ln, j) => {
        const tx = angka ? x + w / 2 : x + 8;
        isi.push(
          `<text x="${tx.toFixed(1)}" y="${y + 20 + j * TINGGI_BARIS_TEKS}" font-size="14" ${
            angka ? 'text-anchor="middle" ' : ""
          }${kepala ? 'font-weight="bold" fill="#ffffff"' : 'fill="#0f172a"'}>${esc(ln)}</text>`
        );
      });
      x += w;
    }
    y += tinggi;
  });

  if (s.sumber) {
    isi.push(`<text x="${PAD}" y="${y + 20}" font-size="12" font-style="italic" fill="#475569">Sumber: ${esc(s.sumber)}</text>`);
    y += 26;
  }
  const tinggiTotal = y + PAD;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LEBAR} ${tinggiTotal}" width="${LEBAR}" height="${tinggiTotal}" font-family="Arial, Helvetica, sans-serif"><rect width="100%" height="100%" fill="#ffffff"/>${isi.join("")}</svg>`;
}

function angkaAtr(atr: string, nama: string): number {
  const m = new RegExp(`\\s${nama}\\s*=\\s*["']?(-?[\\d.]+)`, "i").exec(atr);
  return m ? Number(m[1]) : 0;
}

function gaya(style: string, prop: string): string {
  return new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(style)?.[1].trim() ?? "";
}

function dekode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * AntV Infographic menulis teksnya di `<foreignObject>` (HTML di dalam
 * SVG). Elemen itu dibuang `bersihkanSvg` — di sebagian browser ia membuat
 * canvas "tercemar" sehingga ekspor PNG gagal. Jadi tiap foreignObject
 * diganti `<text>` SVG biasa di posisi yang sama: warna, ukuran, tebal,
 * rata kiri/tengah/kanan, dan rata tengah vertikal ikut dibawa; teks
 * panjang dipecah per baris dengan perkiraan lebar huruf.
 */
export function foreignObjectKeTeks(svg: string): string {
  return svg.replace(/<foreignObject\b([^>]*)>([\s\S]*?)<\/foreignObject\s*>/gi, (_m, atr: string, isi: string) => {
    const x = angkaAtr(atr, "x");
    const y = angkaAtr(atr, "y");
    const w = angkaAtr(atr, "width") || 200;
    const h = angkaAtr(atr, "height");
    const style = /style\s*=\s*"([^"]*)"/i.exec(isi)?.[1] ?? "";
    const teksMentah = dekode(isi.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!teksMentah) return "";
    const fs = Number.parseFloat(gaya(style, "font-size")) || 14;
    const tebal = /bold|[6-9]00/.test(gaya(style, "font-weight"));
    const warna = gaya(style, "color") || "#1f2937";
    const rata = gaya(style, "text-align") || (gaya(style, "justify-content").includes("center") ? "center" : "left");
    const tengahV = gaya(style, "align-items").includes("center") || gaya(style, "align-content").includes("center");
    const lh = fs * (Number.parseFloat(gaya(style, "line-height")) || 1.4);
    const baris = bungkusTeks(teksMentah, Math.max(3, Math.floor(w / (fs * (tebal ? 0.6 : 0.55)))));
    const anchor = rata === "center" ? "middle" : rata === "right" || rata === "end" ? "end" : "start";
    const tx = anchor === "middle" ? x + w / 2 : anchor === "end" ? x + w : x;
    const atas = tengahV && h ? y + (h - baris.length * lh) / 2 : y;
    const tspan = baris
      .map((b, i) => `<tspan x="${tx.toFixed(1)}" y="${(atas + fs * 0.95 + i * lh).toFixed(1)}">${esc(b)}</tspan>`)
      .join("");
    return `<text font-size="${fs}" fill="${esc(warna)}" text-anchor="${anchor}"${tebal ? ' font-weight="bold"' : ""}>${tspan}</text>`;
  });
}

/**
 * HTML stimulus yang disisipkan di atas pertanyaan. Untuk stimulus
 * bergambar, `url` = gambar hasil render (sudah di Cloudinary).
 */
export function htmlStimulus(s: Stimulus, url: string | null): string {
  const judul = s.judul ? `<p style="text-align:center"><b>${teksKeHtml(s.judul)}</b></p>` : "";
  const sumber = s.sumber ? `<p><i>Sumber: ${teksKeHtml(s.sumber)}</i></p>` : "";
  if (s.jenis === "bacaan") {
    const paragraf = s.teks
      .split(/\n{2,}/)
      .map((p) => `<p style="text-align:justify">${teksKeHtml(p)}</p>`)
      .join("");
    return `${judul}${paragraf}${sumber}`;
  }
  if (!url || !/^https:\/\//i.test(url)) return "";
  // Judul & sumber tabel sudah tergambar di SVG-nya; grafik & infografis
  // judulnya tergambar, sumbernya ditulis di bawah gambar.
  return `<p style="text-align:center"><img src="${escapeAtribut(url)}" alt="${escapeAtribut(
    s.judul || "Stimulus soal"
  )}" data-lebar="100" /></p>${s.jenis === "tabel" ? "" : sumber}`;
}

// ---------------------------------------------------------------------------
// Penyuntingan cepat (teks per baris) di kartu Edit
// ---------------------------------------------------------------------------

/** Isi stimulus sebagai teks yang bisa diedit guru, satu butir per baris. */
export function stimulusKeTeks(s: Stimulus): string {
  switch (s.jenis) {
    case "bacaan":
      return s.teks;
    case "tabel":
      return [s.kolom, ...s.baris].map((b) => b.join(" | ")).join("\n");
    case "grafik":
      return s.data.map((d) => [d.label, String(d.nilai), d.seri].filter((x, i) => i < 2 || x).join(" | ")).join("\n");
    case "infografis":
      return s.poin.map((p) => [p.label, p.teks, ...p.anak].join(" | ")).join("\n");
  }
}

/** Kebalikan `stimulusKeTeks`. Bentuk yang tidak valid → stimulus lama. */
export function teksKeStimulus(lama: Stimulus, isi: string): Stimulus {
  const baris = isi.split("\n").map((b) => b.trim()).filter(Boolean);
  const sel = (b: string) => b.split("|").map((x) => x.trim());
  const hasil = normalisasiStimulus(
    lama.jenis === "bacaan"
      ? { ...lama, teks: isi }
      : lama.jenis === "tabel"
        ? { ...lama, kolom: sel(baris[0] ?? ""), baris: baris.slice(1).map(sel) }
        : lama.jenis === "grafik"
          ? {
              ...lama,
              sumbu_x: lama.sumbuX,
              sumbu_y: lama.sumbuY,
              data: baris.map((b) => {
                const [label, nilai, seri] = sel(b);
                return { label, nilai, seri };
              }),
            }
          : {
              ...lama,
              poin: baris.map((b) => {
                const [label, t, ...anak] = sel(b);
                return { label, teks: t ?? "", anak };
              }),
            }
  );
  return hasil && hasil.jenis === lama.jenis ? hasil : lama;
}
