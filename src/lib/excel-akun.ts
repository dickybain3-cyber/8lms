/**
 * Unduhan Excel untuk akun siswa & guru (template, hasil generate/impor,
 * daftar akun). Dijalankan di browser lewat `unduhExcel`.
 *
 * Akun siswa: SATU SHEET PER KELAS (7.1, 7.2, ...), kelas terurut alami,
 * siswa terurut nama — bentuk yang biasa dicetak jadi kartu login.
 */

import { unduhExcel, type KolomExcel, type SheetExcel } from "@/lib/excel";
import { DAFTAR_MAPEL, kelompokPerKelas } from "@/lib/akun-impor";

const tanggal = () => new Date().toISOString().slice(0, 10);

export interface BarisAkunSiswa {
  nama: string;
  kelas: string;
  username: string;
  password?: string | null;
}

/**
 * Akun siswa per kelas. `denganPassword` hanya untuk hasil generate/impor
 * (password baru saja dibuat) — password lama tidak bisa dibaca ulang
 * dari database karena hanya tersimpan sebagai hash.
 */
export async function unduhExcelAkunSiswa(
  baris: BarisAkunSiswa[],
  opsi: { namaFile: string; denganPassword: boolean; judul?: string }
): Promise<void> {
  const kolom: KolomExcel[] = [
    { header: "No", key: "no", lebar: 6, tengah: true },
    { header: "Nama", key: "nama", lebar: 34 },
    { header: "Kelas", key: "kelas", lebar: 9, tengah: true },
    { header: "Username", key: "username", lebar: 18, teks: true },
    ...(opsi.denganPassword ? [{ header: "Password", key: "password", lebar: 14, tengah: true }] : []),
  ];
  const kelompok = kelompokPerKelas(baris);
  const sheets: SheetExcel[] = kelompok.map((k) => ({
    nama: k.kelas,
    judul: `${opsi.judul ?? "Akun LMS Siswa"} — Kelas ${k.kelas}`,
    subjudul: opsi.denganPassword
      ? `${k.baris.length} siswa · RAHASIA: simpan baik-baik, password tidak bisa dilihat lagi di aplikasi`
      : `${k.baris.length} siswa · password tidak ikut (hanya tersimpan sebagai hash; pakai Reset password bila lupa)`,
    kolom,
    baris: k.baris.map((b, i) => ({ no: i + 1, ...b, password: b.password ?? "" })),
  }));
  if (sheets.length === 0) {
    sheets.push({ nama: "Kosong", judul: "Belum ada akun siswa", kolom, baris: [] });
  }
  await unduhExcel(`${opsi.namaFile}-${tanggal()}.xlsx`, sheets);
}

/** Template impor siswa. `lengkap` = dengan kolom Username & Password. */
export async function unduhTemplateSiswa(lengkap: boolean, contohKelas: string): Promise<void> {
  const kolom: KolomExcel[] = [
    { header: "No", key: "no", lebar: 6, tengah: true },
    { header: "Nama", key: "nama", lebar: 32 },
    { header: "Kelas", key: "kelas", lebar: 10, tengah: true },
    ...(lengkap
      ? [
          { header: "Username", key: "username", lebar: 18, teks: true },
          { header: "Password", key: "password", lebar: 14, teks: true },
        ]
      : []),
  ];
  await unduhExcel(lengkap ? "template_import_akun_siswa.xlsx" : "template_generate_akun_siswa.xlsx", [
    {
      nama: "Siswa",
      judul: lengkap ? "Template Import Akun Siswa" : "Template Generate Akun Siswa",
      subjudul: lengkap
        ? `Kelas harus PERSIS sama dengan kelas di sistem (mis. ${contohKelas}). Username/Password boleh dikosongkan — dibuatkan otomatis.`
        : `Cukup No, Nama, Kelas (mis. ${contohKelas}). Username & password dibuatkan aplikasi.`,
      kolom,
      baris: [
        { no: 1, nama: "Ahmad Fauzi", kelas: contohKelas, username: lengkap ? "fauzi" : "", password: lengkap ? "kmr482" : "" },
        { no: 2, nama: "Siti Nurhaliza", kelas: contohKelas, username: "", password: "" },
      ],
    },
  ]);
}

export interface BarisAkunGuru {
  nama: string;
  nip: string;
  mapel: string;
  username: string;
  password?: string | null;
}

export async function unduhExcelAkunGuru(
  baris: BarisAkunGuru[],
  opsi: { namaFile: string; denganPassword: boolean }
): Promise<void> {
  const urut = [...baris].sort(
    (a, b) => (a.mapel || "~").localeCompare(b.mapel || "~", "id") || a.nama.localeCompare(b.nama, "id")
  );
  await unduhExcel(`${opsi.namaFile}-${tanggal()}.xlsx`, [
    {
      nama: "Guru",
      judul: "Akun LMS Guru",
      subjudul: opsi.denganPassword
        ? `${baris.length} guru · RAHASIA: password tidak bisa dilihat lagi di aplikasi`
        : `${baris.length} guru · password tidak ikut (hanya tersimpan sebagai hash)`,
      kolom: [
        { header: "No", key: "no", lebar: 6, tengah: true },
        { header: "Nama", key: "nama", lebar: 34 },
        { header: "NIP", key: "nip", lebar: 22, teks: true },
        { header: "Mapel", key: "mapel", lebar: 40 },
        { header: "Username", key: "username", lebar: 22, teks: true },
        ...(opsi.denganPassword ? [{ header: "Password", key: "password", lebar: 14, tengah: true }] : []),
      ],
      baris: urut.map((b, i) => ({ no: i + 1, ...b, password: b.password ?? "" })),
    },
  ]);
}

/** Template impor guru; kolom Mapel berupa dropdown dari DAFTAR_MAPEL. */
export async function unduhTemplateGuru(lengkap: boolean): Promise<void> {
  await unduhExcel(lengkap ? "template_import_akun_guru.xlsx" : "template_generate_akun_guru.xlsx", [
    {
      nama: "Guru",
      judul: lengkap ? "Template Import Akun Guru" : "Template Generate Akun Guru",
      subjudul: lengkap
        ? "Mapel: pilih dari dropdown. Username kosong = NIP. Password kosong = guru123456. Ketik NIP sebagai teks (bukan angka)."
        : "Cukup No, Nama, NIP, Mapel (pilih dari dropdown). Username = NIP, password dibuatkan aplikasi.",
      kolom: [
        { header: "No", key: "no", lebar: 6, tengah: true },
        { header: "Nama", key: "nama", lebar: 32 },
        { header: "NIP", key: "nip", lebar: 22, teks: true },
        { header: "Mapel", key: "mapel", lebar: 42 },
        ...(lengkap
          ? [
              { header: "Username", key: "username", lebar: 20, teks: true },
              { header: "Password", key: "password", lebar: 14, teks: true },
            ]
          : []),
      ],
      baris: [{ no: 1, nama: "Budi Santoso, S.Pd.", nip: "198001012005011001", mapel: "Matematika", username: "", password: "" }],
      dropdown: [{ key: "mapel", daftar: [...DAFTAR_MAPEL] }],
    },
  ]);
}
