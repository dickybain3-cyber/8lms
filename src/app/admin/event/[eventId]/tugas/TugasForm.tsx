"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createTugas, updateTugas, type ActionState } from "./actions";
import { KETERANGAN_BERKAS } from "@/lib/tugas-berkas";

const initialState: ActionState = { error: null };

const inputCls =
  "w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink placeholder:text-ink/30 outline-none focus:border-gold";

export interface KelasPilihan {
  id: string;
  nama: string;
}

export interface NilaiAwalTugas {
  judul: string;
  deskripsi: string;
  /** Sudah dalam bentuk "YYYY-MM-DDTHH:mm" — dikonversi di Server
   *  Component lewat `untukInputDatetime()`. JANGAN konversi di sini:
   *  di browser, zona lokalnya adalah zona HP guru, bukan zona server
   *  yang akan menafsirkan kembali string ini saat disimpan. */
  dibuka_at: string;
  tenggat: string;
  skor_maksimal: number;
  izinkan_terlambat: boolean;
  minta_teks: boolean;
  minta_berkas: boolean;
  kelasIds: string[];
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-ink py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light disabled:opacity-50 sm:w-auto sm:px-6"
    >
      {pending ? "Menyimpan…" : label}
    </button>
  );
}

/**
 * Satu form untuk membuat DAN mengedit tugas.
 *
 * Dipakai bersama, bukan disalin jadi dua berkas, karena aturan isinya
 * sama persis — dan aturan yang disalin adalah aturan yang cepat atau
 * lambat akan berbeda di satu tempat saja tanpa ada yang sadar (mis.
 * batas skor maksimal diperbaiki di form "baru" tapi tidak di form
 * "edit", lalu guru menemukan nilai 5000 di tugas hasil edit).
 */
export default function TugasForm({
  eventId,
  tugasId,
  kelasList,
  awal,
  adaPengumpulan,
}: {
  eventId: string;
  /** Ada = mode edit. */
  tugasId?: string;
  kelasList: KelasPilihan[];
  awal?: NilaiAwalTugas;
  /** Jumlah siswa yang SUDAH mengumpulkan — cuma relevan di mode edit. */
  adaPengumpulan?: number;
}) {
  const action = tugasId
    ? updateTugas.bind(null, eventId, tugasId)
    : createTugas.bind(null, eventId);
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {/*
        Peringatan ini muncul SEBELUM guru menyentuh apa pun, bukan
        sebagai konfirmasi setelah menekan Simpan. Mengubah tenggat tugas
        yang sudah dikerjakan 20 anak adalah tindakan yang sah dan sering
        perlu — yang tidak boleh adalah melakukannya tanpa sadar bahwa
        tanda "terlambat" mereka ikut dihitung ulang.
      */}
      {adaPengumpulan !== undefined && adaPengumpulan > 0 && (
        <p className="rounded-md border border-gold/30 bg-gold/5 px-3.5 py-3 text-sm text-ink/75">
          <i className="fas fa-triangle-exclamation mr-2 text-gold" aria-hidden />
          <strong>{adaPengumpulan} siswa</strong> sudah mengumpulkan tugas ini.
          Mengubah <strong>tenggat</strong> akan menghitung ulang tanda
          &ldquo;terlambat&rdquo; mereka: memajukan tenggat bisa membuat
          pengumpulan yang tadinya tepat waktu jadi terlambat, memundurkannya
          memaafkan yang terlanjur lewat. Mengubah <strong>bentuk
          pengumpulan</strong> tidak menghapus apa pun yang sudah masuk.
        </p>
      )}

      <div>
        <label htmlFor="judul" className="mb-1.5 block text-sm text-ink/70">
          Judul tugas
        </label>
        <input
          id="judul"
          name="judul"
          type="text"
          required
          maxLength={200}
          defaultValue={awal?.judul}
          placeholder="mis. Laporan Praktikum Fotosintesis"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="deskripsi" className="mb-1.5 block text-sm text-ink/70">
          Instruksi untuk siswa
        </label>
        <textarea
          id="deskripsi"
          name="deskripsi"
          rows={6}
          defaultValue={awal?.deskripsi}
          placeholder={
            "Tulis langkah-langkah yang harus dilakukan siswa.\n\nBaris baru dipertahankan, jadi kamu bisa menulis poin per baris."
          }
          className={`${inputCls} leading-relaxed`}
        />
        <p className="mt-1 text-xs text-ink/45">
          Teks biasa. Baris baru dipertahankan saat ditampilkan ke siswa.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="dibuka_at"
            className="mb-1.5 block text-sm text-ink/70"
          >
            Dibuka
          </label>
          <input
            id="dibuka_at"
            name="dibuka_at"
            type="datetime-local"
            required
            defaultValue={awal?.dibuka_at}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-ink/45">
            Siswa sudah bisa melihat tugas ini sebelum jam tersebut, tapi
            belum bisa mengumpulkan.
          </p>
        </div>
        <div>
          <label htmlFor="tenggat" className="mb-1.5 block text-sm text-ink/70">
            Tenggat
          </label>
          <input
            id="tenggat"
            name="tenggat"
            type="datetime-local"
            required
            defaultValue={awal?.tenggat}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="skor_maksimal"
          className="mb-1.5 block text-sm text-ink/70"
        >
          Skor maksimal
        </label>
        <input
          id="skor_maksimal"
          name="skor_maksimal"
          type="number"
          min={1}
          max={1000}
          step="any"
          required
          defaultValue={awal?.skor_maksimal ?? 100}
          className={`${inputCls} sm:max-w-[10rem]`}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm text-ink/70">
          Bentuk pengumpulan
        </legend>
        <div className="space-y-2.5">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-ink/15 bg-white p-3.5 has-[:checked]:border-gold has-[:checked]:bg-gold/10">
            <input
              type="checkbox"
              name="minta_teks"
              defaultChecked={awal?.minta_teks ?? true}
              className="mt-0.5 accent-gold"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                Tulisan langsung di aplikasi
              </span>
              <span className="block text-xs text-ink/50">
                Siswa mengetik jawabannya di kolom. Cocok untuk ringkasan,
                refleksi, atau jawaban esai pendek.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-ink/15 bg-white p-3.5 has-[:checked]:border-gold has-[:checked]:bg-gold/10">
            <input
              type="checkbox"
              name="minta_berkas"
              defaultChecked={awal?.minta_berkas ?? false}
              className="mt-0.5 accent-gold"
            />
            <span>
              <span className="block text-sm font-medium text-ink">
                Unggah berkas atau foto
              </span>
              <span className="block text-xs text-ink/50">
                {KETERANGAN_BERKAS} Cocok untuk foto tulisan tangan, laporan
                PDF, atau lembar kerja.
              </span>
            </span>
          </label>
        </div>
        <p className="mt-1.5 text-xs text-ink/45">
          Boleh dicentang dua-duanya. Minimal satu harus dipilih.
        </p>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-ink/15 bg-white p-3.5 has-[:checked]:border-gold has-[:checked]:bg-gold/10">
        <input
          type="checkbox"
          name="izinkan_terlambat"
          defaultChecked={awal?.izinkan_terlambat ?? true}
          className="mt-0.5 accent-gold"
        />
        <span>
          <span className="block text-sm font-medium text-ink">
            Terima pengumpulan terlambat
          </span>
          <span className="block text-xs text-ink/50">
            Pengumpulan setelah tenggat tetap diterima, tapi ditandai
            &ldquo;terlambat&rdquo; di daftarmu. Kalau dimatikan, pintunya
            benar-benar tertutup pada jam tenggat.
          </span>
        </span>
      </label>

      <fieldset>
        <legend className="mb-1.5 block text-sm text-ink/70">
          Kelas target
        </legend>
        {kelasList.length === 0 ? (
          <p className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
            Belum ada kelas terdaftar di jenjang ini. Tambahkan kelas dulu
            lewat menu Kelas — tugas tanpa kelas target tidak akan terlihat
            oleh siswa mana pun.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {kelasList.map((k) => (
              <label
                key={k.id}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-ink/15 bg-white py-2.5 text-sm text-ink has-[:checked]:border-gold has-[:checked]:bg-gold/10"
              >
                <input
                  type="checkbox"
                  name="kelas_id"
                  value={k.id}
                  defaultChecked={awal?.kelasIds.includes(k.id)}
                  className="accent-gold"
                />
                {k.nama}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {state.error && (
        <p className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <SubmitButton label={tugasId ? "Simpan Perubahan" : "Simpan Tugas"} />
    </form>
  );
}
