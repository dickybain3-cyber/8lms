"use client";

import { useState } from "react";

/**
 * Bagian "jadwal" pada form mapel — dipakai bersama oleh form Tambah Mapel
 * dan form Edit Mapel supaya keduanya tidak pernah berbeda penjelasannya.
 *
 * ── KENAPA KOMPONEN INI ADA ──
 *
 * Sampai revisi ini, form mapel hanya punya "Waktu mulai" dan "Waktu
 * selesai", dan guru wajar mengiranya sebagai lama ujian ("07.30–09.00,
 * berarti 90 menit"). Padahal di sistem ini keduanya adalah JENDELA
 * ujian — kapan pintunya dibuka dan ditutup — sementara lama pengerjaan
 * tiap siswa adalah hal yang terpisah dan dihitung sejak dia menekan
 * "Mulai Ujian".
 *
 * Perbedaan itu penting justru di kasus yang paling sering terjadi:
 * siswa yang terlambat masuk. Dengan jendela saja, anak yang baru bisa
 * login 09.00 cuma kebagian sisa waktu. Dengan durasi, dia tetap dapat
 * 90 menit penuh — dibatasi jam tutup.
 *
 * Karena penjelasan itu sulit ditebak dari nama field-nya, ia ditulis
 * langsung di formnya, plus pratinjau hidup di bawah ("Ujian dibuka
 * ... , setiap siswa dapat ... menit") yang ikut berubah saat guru
 * mengetik. Pratinjau itu bukan hiasan: itu cara tercepat menangkap
 * salah ketik tanggal, yang di hari-H berakibat ujian tidak bisa dibuka
 * sama sekali.
 */

const inputCls =
  "w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink placeholder:text-ink/30 outline-none focus:border-gold";

/** Preset yang paling sering dipakai. Mengetik angka tetap bisa — ini
 *  cuma jalan pintas untuk tiga nilai yang menutupi hampir semua ujian. */
const PRESET_DURASI = [60, 90, 120];

function formatTanggalJam(nilaiLokal: string): string | null {
  if (!nilaiLokal) return null;
  const d = new Date(nilaiLokal);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function JadwalMapelFields({
  defaultMulai = "",
  defaultSelesai = "",
  defaultDurasi = null,
}: {
  defaultMulai?: string;
  defaultSelesai?: string;
  defaultDurasi?: number | null;
}) {
  const [mulai, setMulai] = useState(defaultMulai);
  const [selesai, setSelesai] = useState(defaultSelesai);
  const [durasi, setDurasi] = useState(
    defaultDurasi === null || defaultDurasi === undefined
      ? ""
      : String(defaultDurasi)
  );

  const mulaiTeks = formatTanggalJam(mulai);
  const selesaiTeks = formatTanggalJam(selesai);

  const rentangMenit =
    mulai && selesai
      ? Math.round(
          (new Date(selesai).getTime() - new Date(mulai).getTime()) / 60000
        )
      : null;

  const durasiAngka = durasi.trim() === "" ? null : Number(durasi);
  const durasiLebihPanjang =
    durasiAngka !== null &&
    Number.isFinite(durasiAngka) &&
    rentangMenit !== null &&
    rentangMenit > 0 &&
    durasiAngka > rentangMenit;

  return (
    <div className="space-y-5">
      <fieldset className="rounded-xl border border-ink/10 bg-paper/60 p-4">
        <legend className="px-1.5 text-sm font-semibold text-ink">
          Jadwal ujian dibuka &amp; ditutup
        </legend>
        <p className="mb-3.5 text-xs leading-relaxed text-ink/55">
          Siswa hanya bisa membuka ujian ini di antara dua waktu berikut. Di
          luar rentang itu, mapelnya tidak muncul sebagai &ldquo;Kerjakan&rdquo;
          di dashboard siswa.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="waktu_mulai"
              className="mb-1.5 block text-sm text-ink/70"
            >
              Ujian dibuka
            </label>
            <input
              id="waktu_mulai"
              name="waktu_mulai"
              type="datetime-local"
              required
              value={mulai}
              onChange={(e) => setMulai(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label
              htmlFor="waktu_selesai"
              className="mb-1.5 block text-sm text-ink/70"
            >
              Ujian ditutup
            </label>
            <input
              id="waktu_selesai"
              name="waktu_selesai"
              type="datetime-local"
              required
              value={selesai}
              onChange={(e) => setSelesai(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {rentangMenit !== null && rentangMenit <= 0 && (
          <p className="mt-3 rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
            Jam tutup berada sebelum (atau sama dengan) jam buka. Ujian ini
            tidak akan pernah bisa dibuka siswa.
          </p>
        )}
      </fieldset>

      <fieldset className="rounded-xl border border-ink/10 bg-paper/60 p-4">
        <legend className="px-1.5 text-sm font-semibold text-ink">
          Lama pengerjaan (timer siswa)
        </legend>
        <p className="mb-3.5 text-xs leading-relaxed text-ink/55">
          Hitung mundur di layar siswa mengikuti angka ini, dan mulai berjalan
          saat dia menekan <strong>Mulai Ujian</strong> — bukan saat ujian
          dibuka. Jadi siswa yang terlambat masuk tetap mendapat jatah waktu
          yang sama, selama jam tutup belum lewat.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="durasi_menit"
              className="mb-1.5 block text-sm text-ink/70"
            >
              Durasi (menit)
            </label>
            <input
              id="durasi_menit"
              name="durasi_menit"
              type="number"
              min={1}
              max={600}
              inputMode="numeric"
              placeholder="mis. 90"
              value={durasi}
              onChange={(e) => setDurasi(e.target.value)}
              className={`${inputCls} w-40 tabular-nums`}
            />
          </div>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {PRESET_DURASI.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDurasi(String(m))}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  durasi === String(m)
                    ? "border-gold bg-gold/15 text-ink"
                    : "border-ink/15 bg-white text-ink/60 hover:bg-ink/5"
                }`}
              >
                {m} menit
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDurasi("")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                durasi.trim() === ""
                  ? "border-gold bg-gold/15 text-ink"
                  : "border-ink/15 bg-white text-ink/60 hover:bg-ink/5"
              }`}
            >
              Sampai ditutup
            </button>
          </div>
        </div>

        {durasiLebihPanjang && (
          <p className="mt-3 rounded-md border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-ink/70">
            Durasi {durasiAngka} menit lebih panjang daripada jendela ujiannya
            sendiri ({rentangMenit} menit). Siswa tetap akan terhenti saat jam
            tutup — periksa lagi apakah angkanya memang disengaja.
          </p>
        )}
      </fieldset>

      {/* Pratinjau kalimat utuh. Guru membaca ini sekali dan langsung tahu
          apakah tanggalnya salah ketik — jauh lebih cepat daripada
          memeriksa dua kotak datetime satu per satu. */}
      {(mulaiTeks || selesaiTeks) && (
        <div className="rounded-xl border border-dashed border-teal/40 bg-teal/[0.04] px-4 py-3 text-sm leading-relaxed text-ink/75">
          <p className="mb-1 text-[0.7rem] font-bold uppercase tracking-wide text-teal">
            Ringkasan jadwal
          </p>
          <p>
            Ujian dibuka <strong>{mulaiTeks ?? "—"}</strong> dan ditutup{" "}
            <strong>{selesaiTeks ?? "—"}</strong>.{" "}
            {durasiAngka !== null && Number.isFinite(durasiAngka)
              ? `Setiap siswa mendapat ${durasiAngka} menit pengerjaan sejak menekan Mulai Ujian.`
              : "Setiap siswa bisa mengerjakan sampai jam tutup (tanpa timer pribadi)."}
          </p>
        </div>
      )}
    </div>
  );
}
