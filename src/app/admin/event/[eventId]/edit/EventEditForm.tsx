"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateEvent, type ActionState } from "../../actions";
import { definisiJenisEvent, type JenisEvent } from "@/lib/jenis-event";

const initialState: ActionState = { error: null };

const inputCls =
  "w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink placeholder:text-ink/30 outline-none focus:border-gold";

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

export default function EventEditForm({
  event,
  jenis,
}: {
  event: {
    id: string;
    nama: string;
    tgl_mulai: string;
    tgl_selesai: string;
    kelas_utama: 7 | 8 | 9;
  };
  jenis: JenisEvent;
}) {
  const updateEventWithId = updateEvent.bind(null, event.id);
  const [state, formAction] = useFormState(updateEventWithId, initialState);
  const def = definisiJenisEvent(jenis);

  return (
    <form action={formAction} className="max-w-lg space-y-5">
      {/*
        Jenis kegiatan SENGAJA tidak bisa diubah dari sini — event
        berjenis assignment/forum akan (mulai Tahap 4/5) punya tabel
        sendiri yang menaut ke event_id, dan mengizinkan ganti jenis
        setelah dibuat berarti event bisa "berpindah mesin" sementara
        datanya sendiri tertinggal di tabel yang lain. Kalau nanti
        memang perlu, pastikan hanya boleh dipindah selama event masih
        kosong (belum ada mapel/tugas/topik forum sama sekali).
      */}
      <div>
        <span className="mb-1.5 block text-sm text-ink/70">
          Jenis kegiatan
        </span>
        <div className="flex items-center gap-2 rounded-md border border-ink/10 bg-ink/[0.03] px-3.5 py-2.5 text-sm text-ink/70">
          <i className={`fas fa-${def.ikon} text-ink/40`} aria-hidden />
          {def.label}
          <span className="ml-auto text-xs text-ink/40">Tidak bisa diubah</span>
        </div>
      </div>

      <div>
        <label htmlFor="nama" className="mb-1.5 block text-sm text-ink/70">
          Nama event
        </label>
        <input
          id="nama"
          name="nama"
          type="text"
          required
          defaultValue={event.nama}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="tgl_mulai"
            className="mb-1.5 block text-sm text-ink/70"
          >
            Tanggal mulai
          </label>
          <input
            id="tgl_mulai"
            name="tgl_mulai"
            type="date"
            required
            defaultValue={event.tgl_mulai}
            className={inputCls}
          />
        </div>
        <div>
          <label
            htmlFor="tgl_selesai"
            className="mb-1.5 block text-sm text-ink/70"
          >
            Tanggal selesai
          </label>
          <input
            id="tgl_selesai"
            name="tgl_selesai"
            type="date"
            required
            defaultValue={event.tgl_selesai}
            className={inputCls}
          />
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm text-ink/70">
          Jenjang kelas utama
        </legend>
        <div className="flex gap-3">
          {[7, 8, 9].map((tingkat) => (
            <label
              key={tingkat}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-ink/15 bg-white py-2.5 text-sm text-ink has-[:checked]:border-gold has-[:checked]:bg-gold/10"
            >
              <input
                type="radio"
                name="kelas_utama"
                value={tingkat}
                required
                defaultChecked={event.kelas_utama === tingkat}
                className="accent-gold"
              />
              Kelas {tingkat}
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
