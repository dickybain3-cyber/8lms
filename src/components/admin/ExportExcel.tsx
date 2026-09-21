"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { unduhExcel, waktuExcel, type SheetExcel } from "@/lib/excel";
import { SEKOLAH } from "@/lib/branding";
import { JENJANG_LABEL, type Jenjang } from "@/lib/jenjang";
import {
  ambilDetailGuruSemuaJenjang,
} from "@/app/admin/actions-export";

/** Nama sekolah versi aman-nama-berkas (tanpa spasi/karakter aneh). */
const SLUG_SEKOLAH = SEKOLAH.namaPendek.replace(/[^a-zA-Z0-9]+/g, "_");

/**
 * Tiga tombol export Excel. Semuanya menarik datanya SENDIRI lewat RPC saat
 * diklik, bukan menerima baris dari halaman pemanggil.
 *
 * Alasannya: halaman /admin/siswa dan /admin/guru sengaja membatasi tampilan
 * 200 baris demi kecepatan render, dan export versi CSV yang lama ikut
 * terbatas 200 baris itu (didokumentasikan sendiri di
 * ExportAkunCsvButton.tsx sebagai utang yang belum dibayar). Untuk sekolah
 * dengan 600+ siswa, file yang isinya sepertiga data adalah jebakan: guru
 * tidak punya cara tahu bahwa yang terunduh tidak lengkap.
 *
 * RPC yang dipanggil (0012_statistik_lanjutan.sql) dijaga `is_guru_atau_
 * service()` dan dipanggil dengan anon key + sesi guru yang sedang login,
 * jadi tidak ada service_role yang menyentuh browser di sini.
 *
 * CSV lama sengaja TIDAK dihapus — masih berguna untuk impor balik ke
 * sistem lain, dan formatnya stabil. Excel ditambahkan di sebelahnya.
 */

function TombolDasar({
  onClick,
  sibuk,
  label,
  error,
}: {
  onClick: () => void;
  sibuk: boolean;
  label: string;
  error: string | null;
}) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={sibuk}
        className="rounded-md border border-ok/40 bg-ok/5 px-3 py-1.5 text-xs font-medium text-ok transition-colors hover:bg-ok hover:text-white disabled:opacity-50"
      >
        {sibuk ? "Menyiapkan…" : label}
      </button>
      {error && <span className="text-[0.7rem] text-danger">{error}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 1. Akun siswa — satu sheet per kelas
// ---------------------------------------------------------------------------
interface BarisSiswaExport {
  siswa_id: string;
  nama: string;
  username: string;
  kelas_nama: string;
  tingkat: number;
  created_at: string;
}

export function ExportSiswaExcelButton() {
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function jalankan() {
    setSibuk(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "get_daftar_siswa_export"
      );
      if (rpcError) throw new Error(rpcError.message);

      const baris = (data ?? []) as BarisSiswaExport[];
      if (baris.length === 0) {
        setError("Belum ada data siswa.");
        return;
      }

      // Satu sheet per kelas, meniru format rekap akun di sistem lama supaya
      // wali kelas bisa langsung mencetak tab miliknya sendiri tanpa
      // menyaring baris orang lain.
      const perKelas = new Map<string, BarisSiswaExport[]>();
      for (const b of baris) {
        const kunci = b.kelas_nama || "Tanpa Kelas";
        if (!perKelas.has(kunci)) perKelas.set(kunci, []);
        perKelas.get(kunci)!.push(b);
      }

      const sheets: SheetExcel[] = [...perKelas.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([kelas, isi]) => ({
          nama: `Kelas ${kelas}`,
          judul: `DAFTAR AKUN SISWA — KELAS ${kelas.toUpperCase()}`,
          subjudul: `${SEKOLAH.nama} · ${SEKOLAH.kota} · ${isi.length} siswa`,
          kolom: [
            { header: "No", key: "no", lebar: 6, tengah: true },
            { header: "Nama Siswa", key: "nama", lebar: 32 },
            { header: "Username", key: "username", lebar: 22 },
            { header: "Kelas", key: "kelas", lebar: 10, tengah: true },
            { header: "Dibuat", key: "dibuat", lebar: 18, tengah: true },
          ],
          baris: isi.map((s, i) => ({
            no: i + 1,
            nama: s.nama,
            username: s.username,
            kelas: s.kelas_nama,
            dibuat: waktuExcel(s.created_at),
          })),
        }));

      // Sheet rekap di depan supaya pembaca melihat gambaran seluruh sekolah
      // lebih dulu sebelum menelusuri per kelas.
      sheets.unshift({
        nama: "Rekap",
        judul: "REKAP JUMLAH SISWA PER KELAS",
        subjudul: `${SEKOLAH.nama} · total ${baris.length} siswa`,
        kolom: [
          { header: "Kelas", key: "kelas", lebar: 14, tengah: true },
          { header: "Jumlah Siswa", key: "jumlah", lebar: 16, tengah: true },
        ],
        baris: [...perKelas.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([kelas, isi]) => ({ kelas, jumlah: isi.length })),
      });

      await unduhExcel(`Data_Siswa_${SLUG_SEKOLAH}`, sheets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyiapkan file.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <TombolDasar
      onClick={() => void jalankan()}
      sibuk={sibuk}
      error={error}
      label="Export Excel (semua siswa)"
    />
  );
}

// ---------------------------------------------------------------------------
// 2. Unduh detail guru (Tahap 2) — khusus is_admin, lintas 3 jenjang
// ---------------------------------------------------------------------------
//
// BEDA dari export akun lain di file ini: tidak memanggil RPC langsung dari
// browser (anon key + sesi). Baris yang dibawa pulang (status password,
// NIP) lebih sensitif daripada sekadar "nama + email", jadi pengambilan
// datanya lewat Server Action `ambilDetailGuruSemuaJenjang()`
// (src/app/admin/actions-export.ts) yang mengecek `is_admin` di SERVER
// sebelum membaca apa pun lewat service_role. Tombol ini sendiri juga
// hanya dirender kalau pemanggil halaman (`page.tsx`) sudah tahu
// `sesi.isAdmin` — tapi itu cuma soal tampilan; penjaga yang sungguhan ada
// di server action-nya, sesuai bagian 2 & 8 prompt Tahap 2.

/** Sinkron dengan enum di migrasi 0017 (`guru.password_status`). */
type StatusPasswordGuru =
  | "awal"
  | "direset_admin"
  | "diganti_guru"
  | "tidak_diketahui";

const PASSWORD_AWAL_GURU_LABEL = "guru123456";

function labelStatusPassword(status: StatusPasswordGuru | null): string {
  switch (status) {
    case "awal":
      return "Awal (belum pernah diganti)";
    case "direset_admin":
      return "Direset admin";
    case "diganti_guru":
      return "Sudah diganti guru";
    case "tidak_diketahui":
      return "Tidak diketahui (akun lama, riwayat sebelum migrasi 0017 tidak tercatat)";
    case null:
      return "Tidak diketahui (migrasi 0017 belum dijalankan di jenjang ini)";
  }
}

/**
 * Isi kolom "Password". HANYA menuliskan password awal yang sungguhan kalau
 * statusnya memang `'awal'` — di semua kasus lain (termasuk null / migrasi
 * belum jalan) ditulis keterangan, bukan menebak passwordnya. Aturan ini
 * persis permintaan di bagian 6 prompt Tahap 2: jangan mengklaim `'awal'`
 * untuk akun yang riwayatnya tidak diketahui.
 */
function isiKolomPassword(status: StatusPasswordGuru | null): string {
  switch (status) {
    case "awal":
      return PASSWORD_AWAL_GURU_LABEL;
    case "direset_admin":
      return "Sudah diganti — password baru hanya tampil saat direset";
    case "diganti_guru":
      return "Sudah diganti guru (tidak bisa dibaca sistem)";
    case "tidak_diketahui":
    case null:
      return "Tidak diketahui — reset untuk memastikan";
  }
}

interface BarisGuruDetailExport {
  guru_id: string;
  nama: string;
  nip: string | null;
  username: string | null;
  is_admin: boolean;
  passwordStatus: StatusPasswordGuru | null;
  passwordDigantiAt: string | null;
  createdAt: string;
  jenjang: Jenjang;
}

export function UnduhDetailGuruButton() {
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peringatan, setPeringatan] = useState<string | null>(null);

  async function jalankan() {
    setSibuk(true);
    setError(null);
    setPeringatan(null);
    try {
      const { baris, jenjangGagal } = await ambilDetailGuruSemuaJenjang();

      if (baris.length === 0) {
        setError(
          jenjangGagal.length > 0
            ? `Tidak ada data yang berhasil ditarik. Gagal: ${jenjangGagal
                .map((j) => `${JENJANG_LABEL[j.jenjang]} (${j.pesan})`)
                .join("; ")}`
            : "Belum ada data guru."
        );
        return;
      }

      if (jenjangGagal.length > 0) {
        setPeringatan(
          `File tetap dibuat, tapi data dari ${jenjangGagal
            .map((j) => `${JENJANG_LABEL[j.jenjang]} (${j.pesan})`)
            .join("; ")} tidak ikut — coba lagi untuk melengkapinya.`
        );
      }

      const data: BarisGuruDetailExport[] = baris;
      const jumlahTidakDiketahui = data.filter(
        (g) => g.passwordStatus === "tidak_diketahui" || g.passwordStatus === null
      ).length;

      await unduhExcel(`Data_Guru_${SLUG_SEKOLAH}`, [
        {
          nama: "Data Guru",
          judul: "DETAIL AKUN GURU",
          subjudul:
            `${SEKOLAH.nama} · ${SEKOLAH.kota} · ${data.length} akun` +
            (jumlahTidakDiketahui > 0
              ? ` · ${jumlahTidakDiketahui} status password tidak diketahui`
              : ""),
          kolom: [
            { header: "No", key: "no", lebar: 6, tengah: true },
            { header: "Nama", key: "nama", lebar: 30 },
            { header: "NIP", key: "nip", lebar: 20, tengah: true },
            { header: "Username", key: "username", lebar: 20 },
            { header: "Peran", key: "peran", lebar: 12, tengah: true },
            { header: "Jenjang Terdaftar", key: "jenjangTerdaftar", lebar: 16, tengah: true },
            { header: "Password", key: "password", lebar: 34 },
            { header: "Status Password", key: "statusPassword", lebar: 40 },
            { header: "Terdaftar", key: "terdaftar", lebar: 18, tengah: true },
            { header: "Terakhir Ganti Password", key: "terakhirGanti", lebar: 20, tengah: true },
          ],
          baris: data
            .sort(
              (a, b) => a.nama.localeCompare(b.nama) || a.jenjang - b.jenjang
            )
            .map((g, i) => ({
              no: i + 1,
              nama: g.nama,
              nip: g.nip ?? "",
              username: g.username ?? "(pakai email lama)",
              peran: g.is_admin ? "Admin" : "Guru",
              jenjangTerdaftar: JENJANG_LABEL[g.jenjang],
              password: isiKolomPassword(g.passwordStatus),
              statusPassword: labelStatusPassword(g.passwordStatus),
              terdaftar: waktuExcel(g.createdAt),
              terakhirGanti: waktuExcel(g.passwordDigantiAt),
            })),
          // Baris yang statusnya tidak diketahui disorot — itulah yang perlu
          // ditindaklanjuti admin (verifikasi manual / minta guru ganti
          // password), bukan baris admin biasa.
          sorotBaris: (r) =>
            typeof r.statusPassword === "string" &&
            r.statusPassword.startsWith("Tidak diketahui"),
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyiapkan file.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <TombolDasar
        onClick={() => void jalankan()}
        sibuk={sibuk}
        error={error}
        label="Unduh detail guru"
      />
      {peringatan && (
        <span className="text-[0.7rem] text-amber-600">{peringatan}</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 3. Rekap nilai + analisis butir soal satu mapel
// ---------------------------------------------------------------------------
interface BarisRekap {
  siswa_id: string;
  siswa_nama: string;
  siswa_username: string;
  kelas_nama: string;
  total_skor: number | null;
  skor_maksimal: number;
  nilai_100: number | null;
  jumlah_benar: number;
  jumlah_soal: number;
  status: "selesai" | "sedang_mengerjakan" | "belum_mengerjakan";
  is_override: boolean;
  submitted_at: string | null;
}

interface BarisAnalisis {
  soal_id: string;
  urutan: number;
  tipe: string;
  skor_maks: number;
  jumlah_peserta: number;
  jumlah_benar: number;
  jumlah_sebagian: number;
  jumlah_salah: number;
  jumlah_kosong: number;
  rata_skor: number;
  persen_benar: number;
  kategori: string;
}

const LABEL_STATUS_REKAP: Record<BarisRekap["status"], string> = {
  selesai: "Selesai",
  sedang_mengerjakan: "Sedang mengerjakan",
  belum_mengerjakan: "Belum mengerjakan",
};

export function ExportNilaiExcelButton({
  mapelId,
  mapelNama,
  eventNama,
}: {
  mapelId: string;
  mapelNama: string;
  eventNama?: string;
}) {
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function jalankan() {
    setSibuk(true);
    setError(null);
    try {
      const supabase = createClient();

      // Dua RPC ditembak paralel — keduanya independen, tidak ada alasan
      // menunggu yang satu selesai dulu.
      const [rekapRes, analisisRes] = await Promise.all([
        supabase.rpc("get_rekap_nilai_mapel", { p_mapel_id: mapelId }),
        supabase.rpc("get_analisis_butir_soal", { p_mapel_id: mapelId }),
      ]);

      if (rekapRes.error) throw new Error(rekapRes.error.message);
      if (analisisRes.error) throw new Error(analisisRes.error.message);

      const rekap = (rekapRes.data ?? []) as BarisRekap[];
      const analisis = (analisisRes.data ?? []) as BarisAnalisis[];

      if (rekap.length === 0) {
        setError("Belum ada peserta pada ujian ini.");
        return;
      }

      const selesai = rekap.filter((r) => r.status === "selesai");
      const nilaiList = selesai
        .map((r) => r.nilai_100)
        .filter((n): n is number => n !== null);
      const rata =
        nilaiList.length > 0
          ? (nilaiList.reduce((a, b) => a + b, 0) / nilaiList.length).toFixed(1)
          : "—";

      const judulUmum = `${eventNama ? `${eventNama} — ` : ""}${mapelNama}`;

      const sheets: SheetExcel[] = [
        {
          nama: "Rekap Nilai",
          judul: `REKAP NILAI — ${judulUmum.toUpperCase()}`,
          subjudul: `${SEKOLAH.nama} · ${selesai.length}/${rekap.length} siswa selesai · rata-rata ${rata}`,
          kolom: [
            { header: "No", key: "no", lebar: 6, tengah: true },
            { header: "Nama Siswa", key: "nama", lebar: 32 },
            { header: "Kelas", key: "kelas", lebar: 10, tengah: true },
            { header: "Skor", key: "skor", lebar: 10, tengah: true },
            { header: "Skor Maks", key: "maks", lebar: 11, tengah: true },
            { header: "Nilai (0-100)", key: "nilai", lebar: 14, tengah: true },
            { header: "Benar", key: "benar", lebar: 9, tengah: true },
            { header: "Jml Soal", key: "jml", lebar: 10, tengah: true },
            { header: "Status", key: "status", lebar: 20, tengah: true },
            { header: "Dikumpulkan", key: "waktu", lebar: 18, tengah: true },
            { header: "Catatan", key: "catatan", lebar: 18 },
          ],
          baris: rekap.map((r, i) => ({
            no: i + 1,
            nama: r.siswa_nama,
            kelas: r.kelas_nama,
            skor: r.total_skor ?? "",
            maks: Number(r.skor_maksimal),
            nilai: r.nilai_100 ?? "",
            benar: r.status === "selesai" ? r.jumlah_benar : "",
            jml: r.jumlah_soal,
            status: LABEL_STATUS_REKAP[r.status],
            waktu: waktuExcel(r.submitted_at),
            catatan: r.is_override ? "Nilai diubah manual" : "",
          })),
          // Baris kuning = belum mengerjakan, jadi daftar ujian susulan bisa
          // dibaca sekilas tanpa menyaring kolom status.
          sorotBaris: (r) => r.status === LABEL_STATUS_REKAP.belum_mengerjakan,
        },
      ];

      if (analisis.length > 0) {
        sheets.push({
          nama: "Analisis Butir",
          judul: `ANALISIS BUTIR SOAL — ${judulUmum.toUpperCase()}`,
          subjudul:
            "Tingkat kesukaran empiris dari siswa yang sudah mengumpulkan. " +
            ">70% benar = mudah, 30-70% = sedang, <30% = sulit.",
          kolom: [
            { header: "No Soal", key: "no", lebar: 9, tengah: true },
            { header: "Tipe", key: "tipe", lebar: 20 },
            { header: "Skor Maks", key: "maks", lebar: 11, tengah: true },
            { header: "Peserta", key: "peserta", lebar: 10, tengah: true },
            { header: "Benar", key: "benar", lebar: 9, tengah: true },
            { header: "Sebagian", key: "sebagian", lebar: 11, tengah: true },
            { header: "Salah", key: "salah", lebar: 9, tengah: true },
            { header: "Kosong", key: "kosong", lebar: 9, tengah: true },
            { header: "Rata Skor", key: "rata", lebar: 11, tengah: true },
            { header: "% Benar", key: "persen", lebar: 10, tengah: true },
            { header: "Kategori", key: "kategori", lebar: 12, tengah: true },
          ],
          baris: analisis.map((a) => ({
            no: a.urutan,
            tipe: a.tipe,
            maks: Number(a.skor_maks),
            peserta: a.jumlah_peserta,
            benar: a.jumlah_benar,
            sebagian: a.jumlah_sebagian,
            salah: a.jumlah_salah,
            kosong: a.jumlah_kosong,
            rata: Number(a.rata_skor),
            persen: Number(a.persen_benar),
            kategori: a.kategori,
          })),
          sorotBaris: (r) => r.kategori === "sulit",
        });
      }

      await unduhExcel(
        `Rekap_${mapelNama.replace(/[^a-zA-Z0-9]/g, "_")}`,
        sheets
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyiapkan file.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <TombolDasar
      onClick={() => void jalankan()}
      sibuk={sibuk}
      error={error}
      label="Unduh Excel (nilai + analisis butir)"
    />
  );
}
