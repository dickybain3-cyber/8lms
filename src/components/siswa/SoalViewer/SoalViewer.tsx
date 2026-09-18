"use client";

import type { SoalSiswa } from "@/types";
import BenarSalahViewer from "./BenarSalahViewer";
import GambarSoal from "./GambarSoal";
import MenjodohkanViewer from "./MenjodohkanViewer";
import MultiBenarSalahViewer from "./MultiBenarSalahViewer";
import PilganViewer from "./PilganViewer";
import UraianSingkatViewer from "./UraianSingkatViewer";
import type {
  KontenBenarSalahSiswa,
  KontenMenjodohkanSiswa,
  KontenMultiBenarSalahSiswa,
  KontenPilganSiswa,
  KontenUraianSingkatSiswa,
} from "./types";

/**
 * Dispatcher render per tipe soal — SATU-SATUNYA tempat yang perlu tahu
 * pemetaan tipe -> komponen. Komponen anak (PilganViewer, dst) hanya
 * render + capture jawaban, tidak pernah menerima apa pun dari
 * `konten_jsonb` selain yang sudah dijamin bersih dari kunci jawaban oleh
 * RPC `get_soal_untuk_siswa` (lihat komentar di src/types/index.ts).
 *
 * ── PERBAIKAN: `soal.gambar_url` yang selama ini tidak pernah muncul ──
 *
 * Form input soal (`SoalForm.tsx`) punya dua tempat unggah gambar yang
 * berbeda, dan hanya satu di antaranya yang pernah sampai ke layar siswa:
 *
 *   a. "Gambar soal umum (opsional)"  -> kolom `soal.gambar_url`
 *   b. Gambar di dalam sub-form tipe   -> `konten_jsonb.gambar_pertanyaan_url`
 *
 * Versi lama file ini hanya meneruskan `konten_jsonb` ke komponen anak,
 * dan komponen anak hanya membaca (b). Akibatnya setiap gambar yang
 * diunggah lewat kotak (a) tersimpan rapi di database tapi TIDAK PERNAH
 * ditampilkan ke siswa — soal yang mengandalkan gambar itu jadi mustahil
 * dijawab, dan tidak ada pesan error apa pun yang memberi tahu guru.
 *
 * Itu juga satu-satunya cara memasang gambar stimulus untuk tipe
 * "multi benar-salah" dan "menjodohkan" (sub-form keduanya memang tidak
 * punya kotak gambar tingkat soal), jadi untuk dua tipe itu bug ini
 * berarti gambar sama sekali tidak bisa dipakai.
 *
 * Sekarang gambar (a) dirender DI SINI, di atas komponen tipe apa pun,
 * sekali untuk semua tipe. Kalau sebuah soal kebetulan mengisi (a) dan
 * (b) sekaligus, keduanya tampil berurutan — itu perilaku yang benar,
 * karena guru memang sengaja mengisi dua-duanya.
 */
export default function SoalViewer({
  soal,
  value,
  onChange,
  disabled,
}: {
  soal: SoalSiswa;
  value: unknown;
  onChange: (val: unknown) => void;
  disabled?: boolean;
}) {
  const konten = soal.konten_jsonb;

  return (
    <div className="space-y-4">
      {soal.gambar_url && <GambarSoal url={soal.gambar_url} />}
      <IsiPerTipe
        soal={soal}
        konten={konten}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

function IsiPerTipe({
  soal,
  konten,
  value,
  onChange,
  disabled,
}: {
  soal: SoalSiswa;
  konten: Record<string, unknown>;
  value: unknown;
  onChange: (val: unknown) => void;
  disabled?: boolean;
}) {
  switch (soal.tipe) {
    case "pilgan_biasa":
      return (
        <PilganViewer
          konten={konten as unknown as KontenPilganSiswa}
          kompleks={false}
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "pilgan_kompleks":
      return (
        <PilganViewer
          konten={konten as unknown as KontenPilganSiswa}
          kompleks
          value={value as string[] | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "uraian_singkat":
      return (
        <UraianSingkatViewer
          konten={konten as unknown as KontenUraianSingkatSiswa}
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "benar_salah":
      return (
        <BenarSalahViewer
          konten={konten as unknown as KontenBenarSalahSiswa}
          value={value as boolean | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "multi_benar_salah":
      return (
        <MultiBenarSalahViewer
          konten={konten as unknown as KontenMultiBenarSalahSiswa}
          value={value as Record<string, boolean> | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "menjodohkan":
      return (
        <MenjodohkanViewer
          konten={konten as unknown as KontenMenjodohkanSiswa}
          value={value as Record<string, string> | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    default:
      return (
        <p className="text-sm text-danger">
          Tipe soal tidak dikenali: {soal.tipe}
        </p>
      );
  }
}
