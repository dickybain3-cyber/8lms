/**
 * Parser CSV minimal, cukup untuk kebutuhan import akun siswa (kolom
 * nama/username/kelas, tanpa nested quote yang rumit). Sengaja tidak
 * menambah dependency (mis. papaparse) untuk satu kebutuhan kecil ini —
 * kalau kebutuhan CSV berkembang, pertimbangkan mengganti dengan library.
 *
 * Mendukung: header baris pertama, koma sebagai delimiter, field yang
 * dibungkus tanda kutip ganda (boleh mengandung koma di dalamnya), escape
 * kutip ganda dengan "" (standar CSV/RFC 4180). Baris kosong dilewati.
 */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const records: string[][] = [];

  for (const line of lines) {
    if (line.trim() === "") continue;
    records.push(parseLine(line));
  }

  const header = (records[0] ?? []).map((h) => h.trim().toLowerCase());
  const rows = records.slice(1);
  return { header, rows };
}

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/**
 * Ambil baris CSV sebagai array of object { nama, username, kelas },
 * memetakan kolom lewat header (urutan kolom bebas selama nama header
 * cocok). Baris yang lebih pendek dari header diisi string kosong.
 */
export function csvToSiswaRows(
  text: string
): { nama: string; username: string; kelas: string }[] {
  const { header, rows } = parseCsv(text);
  const idxNama = header.indexOf("nama");
  const idxUsername = header.indexOf("username");
  const idxKelas = header.indexOf("kelas");

  return rows.map((row) => ({
    nama: idxNama >= 0 ? row[idxNama] ?? "" : "",
    username: idxUsername >= 0 ? row[idxUsername] ?? "" : "",
    kelas: idxKelas >= 0 ? row[idxKelas] ?? "" : "",
  }));
}

/**
 * Sama seperti `csvToSiswaRows`, tapi untuk import guru: kolom `nama` +
 * `email` (guru login pakai email asli, bukan username sintetis seperti
 * siswa — lihat `LoginForm.tsx` tab Admin/Guru dan komentar di
 * `docs/skema-database.md`). Tidak ada kolom `kelas` karena guru tidak
 * terikat ke satu kelas.
 */
export function csvToGuruRows(
  text: string
): { nama: string; email: string }[] {
  const { header, rows } = parseCsv(text);
  const idxNama = header.indexOf("nama");
  const idxEmail = header.indexOf("email");

  return rows.map((row) => ({
    nama: idxNama >= 0 ? row[idxNama] ?? "" : "",
    email: idxEmail >= 0 ? row[idxEmail] ?? "" : "",
  }));
}
