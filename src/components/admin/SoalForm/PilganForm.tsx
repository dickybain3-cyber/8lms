"use client";

import { useCallback, useEffect, useState } from "react";
import EditorKaya from "./EditorKaya";
import { teksKeHtml } from "@/lib/html-soal";
/**
 * ── KOTAK UNGGAH GAMBAR TERPISAH SUDAH DIHAPUS DARI FORM INI ──
 *
 * Sebelumnya ada dua tempat memasang gambar yang membingungkan: kotak
 * unggah di bawah kolom teks, DAN (sejak editor kaya) tempel langsung di
 * dalam teks. Dua jalur untuk satu tujuan berarti guru harus memilih
 * tanpa tahu bedanya, dan gambar dari kotak unggah selalu mendarat di
 * bawah seluruh pertanyaan — tidak pernah bisa disisipkan di tengah
 * kalimat, yang justru bentuk paling umum ("Perhatikan gambar berikut.
 * [gambar] Berapa luas …").
 *
 * Sekarang satu jalur saja: tempel/sisipkan gambar di dalam kolomnya.
 *
 * PENTING — data lama tidak ikut hilang. Field `gambar_pertanyaan_url`
 * dan `gambar_url` per opsi TETAP dibaca dari soal yang sudah ada dan
 * TETAP dikirim ulang saat disimpan (lihat `gambarLama` di bawah), dan
 * sisi siswa tetap merendernya. Yang hilang cuma cara MEMBUAT yang baru.
 * Kalau nilai itu dibuang di sini, gambar pada ratusan soal lama akan
 * lenyap diam-diam begitu gurunya membuka lalu menyimpan ulang soalnya.
 */

import { buatId, type KontenPilgan, type OpsiPilgan } from "./types";

/**
 * Pertanyaan DAN setiap opsi jawaban kini memakai `EditorKaya`.
 *
 * Opsi jawaban sengaja ikut diberi editor, bukan cuma pertanyaannya.
 * Bentuk soal yang paling sering menghadang guru adalah pilihan ganda
 * yang opsinya BERUPA GAMBAR — empat potongan grafik, empat bangun
 * datar, empat kutipan yang dipotret dari buku. Sebelumnya itu hanya
 * bisa lewat kotak unggah kecil terpisah di bawah tiap opsi, yang
 * berarti guru harus menyimpan empat berkas dulu. Sekarang: potong
 * layar, klik opsi, Ctrl+V.
 *
 * Kotak unggah gambar terpisah sudah dihapus dari form ini — lihat
 * catatan di bawah blok ini.
 */

export default function PilganForm({
  kompleks,
  onContentChange,
  initial,
}: {
  kompleks: boolean;
  onContentChange: (konten: KontenPilgan) => void;
  initial?: Record<string, unknown>;
}) {
  const awal = initial as Partial<KontenPilgan> | undefined;

  const [pertanyaan, setPertanyaan] = useState(awal?.pertanyaan ?? "");
  const [pertanyaanHtml, setPertanyaanHtml] = useState(
    // Soal lama tidak punya `_html`. Teks polosnya diubah jadi HTML
    // sekali di sini supaya editor bisa memuatnya; hasilnya identik
    // secara visual, cuma baris barunya jadi <br>.
    awal?.pertanyaan_html ?? teksKeHtml(awal?.pertanyaan)
  );
  // Nilai gambar lama dipertahankan apa adanya (read-only) — lihat
  // catatan di kepala file soal kenapa ini tidak boleh dibuang.
  const gambarPertanyaan = awal?.gambar_pertanyaan_url ?? null;
  const [opsi, setOpsi] = useState<OpsiPilgan[]>(
    awal?.opsi && awal.opsi.length > 0
      ? awal.opsi
      : [
          { id: buatId("o"), teks: "", teks_html: "", gambar_url: null, benar: false },
          { id: buatId("o"), teks: "", teks_html: "", gambar_url: null, benar: false },
        ]
  );

  useEffect(() => {
    onContentChange({
      pertanyaan,
      pertanyaan_html: pertanyaanHtml,
      gambar_pertanyaan_url: gambarPertanyaan,
      opsi,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pertanyaan, pertanyaanHtml, gambarPertanyaan, opsi]);

  const ubahPertanyaan = useCallback(
    ({ html, teks }: { html: string; teks: string }) => {
      setPertanyaanHtml(html);
      setPertanyaan(teks);
    },
    []
  );

  function tambahOpsi() {
    setOpsi((prev) => [
      ...prev,
      { id: buatId("o"), teks: "", teks_html: "", gambar_url: null, benar: false },
    ]);
  }

  function hapusOpsi(id: string) {
    setOpsi((prev) => prev.filter((o) => o.id !== id));
  }

  function ubahOpsi(id: string, html: string, teks: string) {
    setOpsi((prev) =>
      prev.map((o) => (o.id === id ? { ...o, teks, teks_html: html } : o))
    );
  }

  function toggleBenar(id: string) {
    setOpsi((prev) =>
      prev.map((o) => {
        if (kompleks) {
          return o.id === id ? { ...o, benar: !o.benar } : o;
        }
        // pilgan_biasa: radio — hanya satu opsi benar
        return { ...o, benar: o.id === id };
      })
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm text-ink/70">Pertanyaan</label>
        <EditorKaya
          nilaiAwal={pertanyaanHtml}
          onChange={ubahPertanyaan}
          placeholder="Tulis pertanyaan… (bisa tempel gambar dengan Ctrl+V)"
          minTinggi="7rem"
        />
        <p className="mt-1.5 text-xs text-ink/40">
          Potong layar dengan Snipping Tool lalu tekan Ctrl+V di kolom ini —
          gambarnya masuk tepat di posisi kursor.
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm text-ink/70">
            Opsi jawaban{" "}
            <span className="text-ink/40">
              (
              {kompleks ? "centang semua yang benar" : "pilih satu yang benar"}
              )
            </span>
          </label>
          <button
            type="button"
            onClick={tambahOpsi}
            className="text-xs font-medium text-teal hover:text-teal-light"
          >
            + Tambah opsi
          </button>
        </div>

        <div className="space-y-3">
          {opsi.map((o, idx) => (
            <div
              key={o.id}
              className="rounded-md border border-ink/15 bg-white p-3"
            >
              <div className="flex items-start gap-3">
                <label className="mt-2.5 flex cursor-pointer items-center">
                  <input
                    type={kompleks ? "checkbox" : "radio"}
                    name={kompleks ? undefined : "opsi_benar_radio"}
                    checked={o.benar}
                    onChange={() => toggleBenar(o.id)}
                    className="h-4 w-4 accent-gold"
                    aria-label={`Opsi ${idx + 1} benar`}
                  />
                </label>
                <div className="flex-1 space-y-2">
                  <span className="text-xs font-bold text-ink/40">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  <EditorKaya
                    nilaiAwal={o.teks_html ?? teksKeHtml(o.teks)}
                    onChange={({ html, teks }) => ubahOpsi(o.id, html, teks)}
                    placeholder={`Teks opsi ${String.fromCharCode(65 + idx)} — boleh tempel gambar`}
                    minTinggi="3rem"
                    ringkas
                  />
                </div>
                {opsi.length > 2 && (
                  <button
                    type="button"
                    onClick={() => hapusOpsi(o.id)}
                    aria-label={`Hapus opsi ${idx + 1}`}
                    className="mt-1 text-ink/30 hover:text-danger"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
