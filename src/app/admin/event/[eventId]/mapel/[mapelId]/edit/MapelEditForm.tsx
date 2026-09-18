"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import JadwalMapelFields from "@/components/admin/JadwalMapelFields";
import { updateMapel, type ActionState } from "../../../../actions";

const initialState: ActionState = { error: null };

const inputCls =
  "w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink placeholder:text-ink/30 outline-none focus:border-gold";

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-ink py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light disabled:opacity-50 sm:w-auto sm:px-6"
    >
      {pending ? "Menyimpan…" : "Simpan Perubahan"}
    </button>
  );
}

export default function MapelEditForm({
  eventId,
  mapel,
  kelasList,
  kelasTerpilihAwal,
  jumlahSudahSubmit,
}: {
  eventId: string;
  mapel: {
    id: string;
    nama: string;
    waktu_mulai: string;
    waktu_selesai: string;
    durasi_menit?: number | null;
  };
  kelasList: { id: string; nama: string }[];
  kelasTerpilihAwal: string[];
  jumlahSudahSubmit: number;
}) {
  const updateMapelWithIds = updateMapel.bind(null, eventId, mapel.id);
  const [state, formAction] = useFormState(updateMapelWithIds, initialState);
  const [checked, setChecked] = useState<Set<string>>(
    new Set(kelasTerpilihAwal)
  );

  const allSelected = checked.size === kelasList.length && kelasList.length > 0;

  function toggleAll() {
    setChecked(allSelected ? new Set() : new Set(kelasList.map((k) => k.id)));
  }

  function toggleOne(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {jumlahSudahSubmit > 0 && (
        <p className="rounded-md border border-gold/30 bg-gold/5 px-3 py-2.5 text-sm text-ink/70">
          <strong>{jumlahSudahSubmit} siswa</strong> sudah mengumpulkan jawaban
          di mapel ini. Mengubah jadwal atau kelas target tetap diizinkan, tapi
          perhatikan dampaknya — mis. mempercepat jam tutup bisa membuat siswa
          yang belum submit kehilangan akses mendadak. Mengubah{" "}
          <strong>durasi</strong> hanya berlaku bagi siswa yang belum menekan
          &ldquo;Mulai Ujian&rdquo;; yang timernya sudah berjalan tetap memakai
          deadline yang sudah terlanjur dihitung.
        </p>
      )}

      <div>
        <label htmlFor="nama" className="mb-1.5 block text-sm text-ink/70">
          Nama mapel
        </label>
        <input
          id="nama"
          name="nama"
          type="text"
          required
          defaultValue={mapel.nama}
          className={inputCls}
        />
      </div>

      <JadwalMapelFields
        defaultMulai={toLocalInputValue(mapel.waktu_mulai)}
        defaultSelesai={toLocalInputValue(mapel.waktu_selesai)}
        defaultDurasi={mapel.durasi_menit ?? null}
      />

      <fieldset>
        <div className="mb-1.5 flex items-center justify-between">
          <legend className="text-sm text-ink/70">Kelas target</legend>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs font-medium text-teal hover:text-teal-light"
          >
            {allSelected ? "Batal pilih semua" : "Pilih semua"}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {kelasList.map((kelas) => (
            <label
              key={kelas.id}
              className="flex cursor-pointer items-center justify-center rounded-md border border-ink/15 bg-white py-2 text-sm text-ink has-[:checked]:border-gold has-[:checked]:bg-gold/10"
            >
              <input
                type="checkbox"
                name="kelas_id"
                value={kelas.id}
                checked={checked.has(kelas.id)}
                onChange={() => toggleOne(kelas.id)}
                className="sr-only"
              />
              {kelas.nama}
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && (
        <p className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
