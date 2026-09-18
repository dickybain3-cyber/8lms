/**
 * Pembaca file .xlsx di sisi browser — pasangan `excel.ts` (yang MENULIS
 * .xlsx untuk ekspor) tapi untuk arah sebaliknya: MEMBACA .xlsx yang
 * diunggah admin saat mengimpor data guru/siswa.
 *
 * ── KENAPA EXCEL, BUKAN CSV, UNTUK IMPOR ──
 *
 * Import versi sebelumnya (baik guru maupun siswa) memakai CSV yang
 * ditempel/​diunggah sebagai teks — cukup untuk data yang rapi, tapi
 * merepotkan di lapangan: staf TU biasanya sudah punya data siswa/guru
 * dalam bentuk Excel (dari Dapodik, dari rekap manual bertahun-tahun),
 * dan mengonversinya ke CSV dulu (lewat "Save As", yang di Excel
 * Indonesia defaultnya berpemisah titik-koma bukan koma) adalah langkah
 * ekstra yang gampang salah. Permintaannya eksplisit: "bisa tambahkan
 * dari excel juga yaa, jangan dari csv" — jadi CSV untuk IMPOR dibuang,
 * bukan cuma ditambah alternatif.
 *
 * ── KENAPA DIBACA DI BROWSER, BUKAN DIKIRIM MENTAH KE SERVER ACTION ──
 *
 * Server Action Next.js punya batas ukuran payload (defaultnya 1MB
 * untuk body request biasa). File .xlsx ratusan siswa dengan formatting
 * bisa melebihi itu kalau dikirim sebagai file mentah. Dengan membaca
 * dan mem-parsing di browser, yang dikirim ke server cuma array objek
 * JSON kecil (nama, NIP/username, kelas) — persis seperti alur CSV yang
 * lama, cuma sumber datanya beralih dari `textarea` ke file `.xlsx`.
 */

export interface HasilBacaExcel<T> {
  rows: T[];
  error: string | null;
}

/** Baca sel apa pun (string/angka/objek formula ExcelJS) jadi string bersih. */
function selKeString(nilai: unknown): string {
  if (nilai === null || nilai === undefined) return "";
  if (typeof nilai === "object") {
    // ExcelJS mengembalikan { result, formula } untuk sel berformula,
    // dan { text } atau { richText } untuk beberapa jenis teks kaya.
    const obj = nilai as Record<string, unknown>;
    if ("result" in obj) return selKeString(obj.result);
    if ("text" in obj) return String(obj.text);
    if ("richText" in obj && Array.isArray(obj.richText)) {
      return (obj.richText as { text: string }[]).map((r) => r.text).join("");
    }
    return "";
  }
  return String(nilai).trim();
}

/**
 * Cari indeks kolom dari baris header, cocok longgar (tanpa spasi/tanda
 * baca, case-insensitive) — supaya "No." vs "no" vs "NO" semuanya
 * dianggap sama, karena staf TU jarang konsisten menulis header.
 */
function cariKolom(headerRow: string[], kandidat: string[]): number {
  const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const headerNormal = headerRow.map(normal);
  for (const k of kandidat) {
    const idx = headerNormal.indexOf(normal(k));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Baca file Excel berisi data GURU. Kolom yang dicari (nama header
 * longgar, urutan kolom bebas): No (opsional), Nama, NIP.
 */
export async function bacaExcelGuru(
  file: File
): Promise<HasilBacaExcel<{ nomorBaris: number; no?: string; nama: string; nip: string }>> {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return { rows: [], error: "File Excel tidak berisi sheet apa pun." };

    const headerRowNum = cariBarisHeader(ws, ["nama"]);
    if (headerRowNum === -1) {
      return {
        rows: [],
        error:
          "Tidak menemukan baris header dengan kolom 'Nama'. Pastikan memakai template yang disediakan.",
      };
    }

    const headerRow = (ws.getRow(headerRowNum).values as unknown[])
      .slice(1)
      .map(selKeString);
    const idxNo = cariKolom(headerRow, ["no", "nomor"]);
    const idxNama = cariKolom(headerRow, ["nama", "namaguru", "namalengkap"]);
    const idxNip = cariKolom(headerRow, ["nip", "nuptk", "niy"]);

    if (idxNama === -1 || idxNip === -1) {
      return {
        rows: [],
        error: "Kolom 'Nama' dan/atau 'NIP' tidak ditemukan di header.",
      };
    }

    const rows: { nomorBaris: number; no?: string; nama: string; nip: string }[] = [];
    let nomorBaris = 0;
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowNum) return;
      const values = (row.values as unknown[]).slice(1).map(selKeString);
      const nama = values[idxNama] ?? "";
      const nip = values[idxNip] ?? "";
      if (!nama && !nip) return; // baris kosong total — lewati diam-diam
      nomorBaris++;
      rows.push({
        nomorBaris,
        no: idxNo !== -1 ? values[idxNo] : undefined,
        nama,
        nip,
      });
    });

    return { rows, error: null };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? `Gagal membaca file Excel: ${err.message}` : "Gagal membaca file Excel.",
    };
  }
}

/**
 * Baca file Excel berisi data SISWA. Kolom yang dicari: No (opsional),
 * Nama, Username, Kelas, Tanggal Lahir (format bebas — dinormalkan ke
 * ISO oleh pemanggil lewat `normalkanTanggalExcel`).
 */
export async function bacaExcelSiswa(
  file: File
): Promise<
  HasilBacaExcel<{
    nomorBaris: number;
    no?: string;
    nama: string;
    username: string;
    kelas: string;
    tanggalLahir: string;
  }>
> {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return { rows: [], error: "File Excel tidak berisi sheet apa pun." };

    const headerRowNum = cariBarisHeader(ws, ["nama"]);
    if (headerRowNum === -1) {
      return {
        rows: [],
        error:
          "Tidak menemukan baris header dengan kolom 'Nama'. Pastikan memakai template yang disediakan.",
      };
    }

    const headerRow = (ws.getRow(headerRowNum).values as unknown[])
      .slice(1)
      .map(selKeString);
    const idxNo = cariKolom(headerRow, ["no", "nomor"]);
    const idxNama = cariKolom(headerRow, ["nama", "namasiswa", "namalengkap"]);
    const idxUsername = cariKolom(headerRow, ["username", "usernam"]);
    const idxKelas = cariKolom(headerRow, ["kelas"]);
    const idxTanggal = cariKolom(headerRow, [
      "tanggallahir",
      "tgllahir",
      "tanggallahirsiswa",
    ]);

    if (idxNama === -1 || idxUsername === -1 || idxKelas === -1) {
      return {
        rows: [],
        error:
          "Kolom 'Nama', 'Username', dan/atau 'Kelas' tidak ditemukan di header.",
      };
    }

    const rows: {
      nomorBaris: number;
      no?: string;
      nama: string;
      username: string;
      kelas: string;
      tanggalLahir: string;
    }[] = [];
    let nomorBaris = 0;

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowNum) return;
      const values = (row.values as unknown[]).slice(1);
      const stringValues = values.map(selKeString);
      const nama = stringValues[idxNama] ?? "";
      const username = stringValues[idxUsername] ?? "";
      if (!nama && !username) return;
      nomorBaris++;

      // Tanggal lahir: sel Excel bisa berupa objek Date ASLI (kalau
      // kolomnya diformat sebagai tanggal) atau teks "14-05-2012" /
      // "14/05/2012" — ditangani di `normalkanTanggalExcel`, bukan di
      // sini, supaya logikanya satu tempat dan dites sendiri.
      const rawTanggal =
        idxTanggal !== -1 ? values[idxTanggal] : undefined;

      rows.push({
        nomorBaris,
        no: idxNo !== -1 ? stringValues[idxNo] : undefined,
        nama,
        username,
        kelas: stringValues[idxKelas] ?? "",
        tanggalLahir: normalkanTanggalExcel(rawTanggal),
      });
    });

    return { rows, error: null };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? `Gagal membaca file Excel: ${err.message}` : "Gagal membaca file Excel.",
    };
  }
}

/**
 * Cari baris pertama yang mengandung SEMUA kata kunci wajib (biasanya
 * cuma "nama") di antara sel-selnya — mengizinkan admin menambahkan
 * baris judul/logo di atas tabel (pola yang umum di file Excel sekolah)
 * tanpa file-nya ditolak. Membatasi pencarian ke 10 baris pertama
 * supaya file yang memang tidak punya header valid gagal cepat,
 * bukan memindai ribuan baris data sampai akhir.
 */
function cariBarisHeader(
  ws: import("exceljs").Worksheet,
  wajib: string[]
): number {
  const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wajibNormal = wajib.map(normal);

  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const nilai = (ws.getRow(r).values as unknown[])
      .slice(1)
      .map((v) => normal(selKeString(v)));
    if (wajibNormal.every((w) => nilai.includes(w))) return r;
  }
  return -1;
}

/**
 * Sel tanggal Excel -> "YYYY-MM-DD". Menangani tiga bentuk yang
 * kemungkinan muncul:
 *   - objek `Date` asli (kolom diformat sebagai tanggal di Excel)
 *   - teks "DD-MM-YYYY" atau "DD/MM/YYYY" (paling umum ditulis manual)
 *   - teks yang sudah "YYYY-MM-DD"
 * Mengembalikan string kosong kalau tidak bisa dikenali — pemanggil
 * (`ImportSiswaForm`) yang memutuskan bagaimana menampilkan baris
 * dengan tanggal kosong ini ke admin.
 */
export function normalkanTanggalExcel(nilai: unknown): string {
  if (nilai instanceof Date && !isNaN(nilai.getTime())) {
    const y = nilai.getFullYear();
    const m = String(nilai.getMonth() + 1).padStart(2, "0");
    const d = String(nilai.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const s = selKeString(nilai);
  if (!s) return "";

  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return "";
}
