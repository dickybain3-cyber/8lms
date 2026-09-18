"use client";

import GambarSoal from "./GambarSoal";
import KontenKaya from "./KontenKaya";
import type {
  JawabanPilganBiasa,
  JawabanPilganKompleks,
  KontenPilganSiswa,
} from "./types";

/**
 * Perubahan dibanding versi sebelumnya — logika pemilihan jawaban TIDAK
 * disentuh sama sekali:
 *
 *  - Teks pertanyaan & opsi lewat <KontenKaya>, jadi format (tebal,
 *    miring, rata tengah) dan gambar sebaris yang ditulis guru ikut
 *    tampil. Soal lama yang isinya teks polos tampil persis seperti
 *    sebelumnya.
 *  - Area ketuk opsi dinaikkan (min-h-[3.25rem], padding lebih lega).
 *  - Label huruf A/B/C/D ditambahkan.
 *
 * Satu hal yang perlu diperhatikan di sini: label <label> yang
 * membungkus opsi akan MENERUSKAN setiap klik di dalamnya ke input
 * radio/checkbox. Gambar yang ditempel guru di dalam teks opsi ada di
 * dalam <label> itu. Jadi mengetuk gambar opsi untuk memperbesarnya
 * akan SEKALIGUS memilih opsi tersebut — siswa yang cuma ingin melihat
 * gambar lebih jelas jadi tidak sengaja menjawab. Karena itu pembungkus
 * isi opsi menghentikan perambatan klik kalau yang diketuk adalah
 * gambar; memilih opsi tetap lewat mengetuk teks atau kotaknya.
 */
export default function PilganViewer({
  konten,
  kompleks,
  value,
  onChange,
  disabled,
}: {
  konten: KontenPilganSiswa;
  kompleks: boolean;
  value: JawabanPilganBiasa | JawabanPilganKompleks | undefined;
  onChange: (val: JawabanPilganBiasa | JawabanPilganKompleks) => void;
  disabled?: boolean;
}) {
  const dipilih: string[] = kompleks
    ? ((value as JawabanPilganKompleks | undefined) ?? [])
    : value
      ? [value as JawabanPilganBiasa]
      : [];

  function toggle(opsiId: string) {
    if (disabled) return;
    if (kompleks) {
      const sudahAda = dipilih.includes(opsiId);
      const next = sudahAda
        ? dipilih.filter((id) => id !== opsiId)
        : [...dipilih, opsiId];
      onChange(next);
    } else {
      onChange(opsiId);
    }
  }

  return (
    <div className="space-y-4">
      <KontenKaya
        html={konten.pertanyaan_html}
        teks={konten.pertanyaan}
      />
      {konten.gambar_pertanyaan_url && (
        <GambarSoal url={konten.gambar_pertanyaan_url} />
      )}

      {kompleks && (
        <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs font-medium text-ink/70">
          Jawaban benar boleh lebih dari satu — pilih semua yang tepat.
        </p>
      )}

      <div className="space-y-2.5">
        {konten.opsi.map((o, idx) => {
          const checked = dipilih.includes(o.id);
          return (
            <label
              key={o.id}
              className={`flex min-h-[3.25rem] cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors touch-manipulation ${
                checked
                  ? "border-gold bg-gold/10"
                  : "border-ink/15 bg-white active:bg-ink/[0.05] hover:bg-ink/[0.03]"
              } ${disabled ? "cursor-default opacity-90" : ""}`}
            >
              <input
                type={kompleks ? "checkbox" : "radio"}
                name={kompleks ? undefined : "pilgan_jawaban"}
                checked={checked}
                onChange={() => toggle(o.id)}
                disabled={disabled}
                className="mt-0.5 h-5 w-5 shrink-0 accent-gold"
                aria-label={`Opsi ${String.fromCharCode(65 + idx)}`}
              />
              {/*
                <div>, bukan <span>. Isi opsi sekarang bisa memuat
                paragraf, daftar, dan gambar — semuanya elemen blok, dan
                elemen blok di dalam <span> adalah HTML tidak sah yang
                membuat React memperbaiki struktur DOM sendiri saat
                hydration (isinya "melompat keluar" dari pembungkusnya).
                <label> boleh memuat konten blok, jadi ini aman.
              */}
              <div
                className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink"
                onClick={(e) => {
                  // Klik di dalam <label> diteruskan ke input-nya. Tanpa
                  // penahan ini, siswa yang mengetuk gambar opsi hanya
                  // untuk memperbesarnya akan SEKALIGUS memilih opsi itu
                  // — menjawab tanpa bermaksud menjawab. Memilih opsi
                  // tetap lewat mengetuk teks atau kotak pilihannya.
                  if ((e.target as HTMLElement).tagName === "IMG") {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                <span className="mr-1.5 font-bold text-ink/45">
                  {String.fromCharCode(65 + idx)}.
                </span>
                <KontenKaya
                  html={o.teks_html}
                  teks={o.teks}
                  kecil
                  className="inline-block w-full align-top"
                />
                {o.gambar_url && <GambarSoal url={o.gambar_url} kecil />}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
