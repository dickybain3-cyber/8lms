"use client";

/**
 * Kotak kirim pesan siswa + opsi cepat sticker/emoticon. Perbedaan poin
 * antara "chat teks" dan "sticker/emoticon" sengaja DITULISKAN di layar
 * (bukan cuma didiamkan di belakang layar) -- lihat `apakahPesanDihitungPoin`
 * di forum.ts: siswa perlu tahu bedanya supaya sticker/emoticon benar-benar
 * dipakai sebagai "hadir tapi tidak punya apa-apa untuk ditulis", bukan
 * disangka cara curang menambah poin dengan spam.
 *
 * Polling ringan yang sama seperti sisi admin (lihat penjelasan panjang
 * di `PanelForumKelas.tsx`) dipakai di sini juga, dengan alasan yang
 * sama: supaya pesan baru dari GURU atau teman sekelas muncul tanpa
 * siswa perlu me-refresh manual.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kirimPesanSiswa } from "../actions";
import { faseForum, alasanTidakBolehMengirim, type JenisIsiPesan } from "@/lib/forum";
import { formatTenggat } from "@/lib/tugas";
import { TOMBOL_UTAMA, Kosong, Info } from "@/components/ui/Panel";

export interface PesanAwal {
  id: string;
  isi: string;
  jenisIsi: JenisIsiPesan;
  createdAt: string;
  dariSayaSendiri: boolean;
  dariGuru: boolean;
  namaPengirim: string;
}

const INTERVAL_POLLING_MS = 4000;

/** Opsi cepat sticker/emoticon. Daftar pendek dan tetap (bukan picker
 *  emoji bebas) supaya jelas kontras dengan "chat teks" -- ini pilihan
 *  produk, bukan keterbatasan teknis; bisa diperluas nanti kalau
 *  dibutuhkan tanpa mengubah skema (jenis_isi tetap 'sticker'/'emoticon',
 *  cuma `isi`-nya yang beda karakter). */
const OPSI_CEPAT: { isi: string; jenis: JenisIsiPesan; label: string }[] = [
  { isi: "👍", jenis: "emoticon", label: "Setuju" },
  { isi: "🙋", jenis: "emoticon", label: "Tanya" },
  { isi: "😂", jenis: "emoticon", label: "Lucu" },
  { isi: "🎉", jenis: "sticker", label: "Rayakan" },
  { isi: "🤔", jenis: "emoticon", label: "Mikir" },
];

export default function FormPengirimPesan({
  forumTopikId,
  kelasId,
  dibukaAt,
  ditutupAt,
  pesanAwal,
}: {
  forumTopikId: string;
  kelasId: string;
  dibukaAt: string;
  ditutupAt: string;
  pesanAwal: PesanAwal[];
}) {
  const router = useRouter();
  const [isiPesan, setIsiPesan] = useState("");
  const [mengirim, startMengirim] = useTransition();
  const [errorKirim, setErrorKirim] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVAL_POLLING_MS);
    return () => clearInterval(id);
  }, [router]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [pesanAwal.length]);

  const forumWaktu = { dibuka_at: dibukaAt, ditutup_at: ditutupAt };
  const alasanTerkunci = alasanTidakBolehMengirim(forumWaktu, Date.now());

  function kirim(jenis: JenisIsiPesan, isi: string) {
    if (!isi.trim()) return;
    setErrorKirim(null);
    startMengirim(async () => {
      const hasil = await kirimPesanSiswa(forumTopikId, kelasId, isi, jenis);
      if (!hasil.ok) {
        setErrorKirim(hasil.pesan ?? "Gagal mengirim pesan.");
        return;
      }
      if (jenis === "teks") setIsiPesan("");
      router.refresh();
    });
  }

  return (
    <div className="kolom-chat">
      <div ref={chatRef} className="daftar-bubble">
        {pesanAwal.length === 0 && <Kosong>Belum ada pesan di sini. Mulai obrolannya!</Kosong>}
        {pesanAwal.map((p) => (
          <div
            key={p.id}
            className={
              p.dariGuru
                ? "bubble bubble-guru"
                : p.dariSayaSendiri
                  ? "bubble bubble-saya"
                  : "bubble bubble-siswa"
            }
          >
            <div className="bubble-header">
              <span className="bubble-nama">{p.namaPengirim}</span>
              <span className="bubble-waktu">{formatTenggat(p.createdAt)}</span>
            </div>
            <div className="bubble-isi">{p.isi}</div>
          </div>
        ))}
      </div>

      {alasanTerkunci ? (
        <Info>{alasanTerkunci}</Info>
      ) : (
        <div className="kotak-kirim-siswa">
          {errorKirim && (
            <div className="kotak-error" role="alert">
              {errorKirim}
            </div>
          )}

          <div className="baris-opsi-cepat">
            {OPSI_CEPAT.map((opsi) => (
              <button
                key={opsi.isi}
                type="button"
                title={opsi.label}
                disabled={mengirim}
                onClick={() => kirim(opsi.jenis, opsi.isi)}
              >
                {opsi.isi}
              </button>
            ))}
          </div>
          <p className="teks-bantuan">
            Chat teks bernilai 1 poin keaktifan. Sticker/emoticon di atas
            TIDAK dihitung poin -- pakai kalau cuma mau menunjukkan kamu
            hadir tanpa perlu menulis apa-apa.
          </p>

          <textarea
            value={isiPesan}
            onChange={(e) => setIsiPesan(e.target.value)}
            placeholder="Tulis pesanmu..."
            rows={2}
          />
          <button
            type="button"
            className={TOMBOL_UTAMA}
            onClick={() => kirim("teks", isiPesan)}
            disabled={mengirim || !isiPesan.trim()}
          >
            {mengirim ? "Mengirim..." : "Kirim"}
          </button>
        </div>
      )}
    </div>
  );
}
