"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createForumTopik, updateForumTopik, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

const inputCls =
  "w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink placeholder:text-ink/30 outline-none focus:border-gold";

export interface KelasPilihan {
  id: string;
  nama: string;
}

export interface NilaiAwalForum {
  /** Sudah dalam bentuk "YYYY-MM-DDTHH:mm" — dikonversi di Server
   *  Component lewat `untukInputDatetime()`, pola sama persis dengan
   *  `TugasForm`. JANGAN konversi di sini. */
  dibuka_at: string;
  ditutup_at: string;
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
 * Satu form untuk membuat DAN mengedit forum — pola sama persis dengan
 * `TugasForm` di Tahap 4, alasan yang sama: aturan isinya sama, dan
 * aturan yang disalin jadi dua berkas adalah aturan yang cepat atau
 * lambat berbeda diam-diam di satu tempat.
 *
 * ── LEBIH SEDIKIT FIELD DARIPADA TugasForm, DAN ITU DISENGAJA ──
 *
 * Tidak ada judul, deskripsi, skor maksimal, atau pilihan bentuk
 * pengumpulan — forum bukan sesuatu yang "dikumpulkan" dan tidak dinilai
 * per unit seperti tugas. Yang perlu diatur cuma DUA hal: kapan ruang
 * obrolannya buka/tutup, dan kelas mana yang ikut.
 */
export default function ForumTopikForm({
  eventId,
  forumTopikId,
  kelasList,
  awal,
  jumlahPesan,
}: {
  eventId: string;
  /** Ada = mode edit. */
  forumTopikId?: string;
  kelasList: KelasPilihan[];
  awal?: NilaiAwalForum;
  /** Jumlah pesan yang SUDAH ada di seluruh ruang forum ini — cuma
   *  relevan di mode edit, dipakai peringatan di bawah. */
  jumlahPesan?: number;
}) {
  const action = forumTopikId
    ? updateForumTopik.bind(null, eventId, forumTopikId)
    : createForumTopik.bind(null, eventId);
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {jumlahPesan !== undefined && jumlahPesan > 0 && (
        <p className="rounded-md border border-gold/30 bg-gold/5 px-3.5 py-3 text-sm text-ink/75">
          <i className="fas fa-triangle-exclamation mr-2 text-gold" aria-hidden />
          Sudah ada <strong>{jumlahPesan} pesan</strong> di forum ini. Mengubah
          jadwal <strong>tidak menghapus</strong> riwayat obrolan yang sudah
          ada — memundurkan waktu tutup membuka kembali pintu kirim pesan,
          memajukannya menutupnya lebih awal. Melepas kelas target tidak
          menghapus pesan kelas itu, hanya menyembunyikan ruangnya dari
          kartu kegiatan ini.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="dibuka_at" className="mb-1.5 block text-sm text-ink/70">
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
            Siswa bisa membaca ruangnya sebelum jam ini kalau kelasnya
            sudah ditautkan, tapi belum bisa mengirim pesan.
          </p>
        </div>
        <div>
          <label htmlFor="ditutup_at" className="mb-1.5 block text-sm text-ink/70">
            Ditutup
          </label>
          <input
            id="ditutup_at"
            name="ditutup_at"
            type="datetime-local"
            required
            defaultValue={awal?.ditutup_at}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-ink/45">
            Setelah jam ini, siswa tidak bisa mengirim pesan baru sama
            sekali — beda dari tugas, tidak ada jalur &ldquo;terlambat tapi
            diterima&rdquo; untuk obrolan.
          </p>
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm text-ink/70">
          Kelas target
        </legend>
        {kelasList.length === 0 ? (
          <p className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
            Belum ada kelas terdaftar di jenjang ini. Tambahkan kelas dulu
            lewat menu Kelas — forum tanpa kelas target tidak akan terlihat
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
        <p className="mt-1.5 text-xs text-ink/45">
          Satu forum boleh menaungi beberapa kelas — tiap kelas punya
          ruang obrolannya sendiri, siswa kelas satu tidak melihat obrolan
          kelas lain.
        </p>
      </fieldset>

      {state.error && (
        <p className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <SubmitButton label={forumTopikId ? "Simpan Perubahan" : "Buat Forum"} />
    </form>
  );
}
