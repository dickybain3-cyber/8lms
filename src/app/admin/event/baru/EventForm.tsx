"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createEvent, type ActionState } from "../actions";
import { DAFTAR_JENIS_EVENT } from "@/lib/jenis-event";

const initialState: ActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-ink py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light disabled:opacity-50 sm:w-auto sm:px-6"
    >
      {pending ? "Menyimpan…" : "Simpan Event"}
    </button>
  );
}

export default function EventForm() {
  const [state, formAction] = useFormState(createEvent, initialState);

  return (
    <form action={formAction} className="max-w-lg space-y-5">
      <fieldset>
        <legend className="mb-1.5 block text-sm text-ink/70">
          Jenis kegiatan
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DAFTAR_JENIS_EVENT.map((j, i) => (
            <label
              key={j.value}
              className="flex cursor-pointer flex-col gap-1 rounded-md border border-ink/15 bg-white p-3.5 has-[:checked]:border-gold has-[:checked]:bg-gold/10"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="radio"
                  name="jenis"
                  value={j.value}
                  required
                  defaultChecked={i === 0}
                  className="accent-gold"
                />
                <i className={`fas fa-${j.ikon} text-ink/40`} aria-hidden />
                {j.label}
                {!j.pakaiMesinUjian && (
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-700">
                    Segera
                  </span>
                )}
              </span>
              <span className="pl-6 text-xs text-ink/50">{j.deskripsi}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="nama" className="mb-1.5 block text-sm text-ink/70">
          Nama event
        </label>
        <input
          id="nama"
          name="nama"
          type="text"
          required
          placeholder="mis. PTS Ganjil 2026"
          className="w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink placeholder:text-ink/30 outline-none focus:border-gold"
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
            className="w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink outline-none focus:border-gold"
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
            className="w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink outline-none focus:border-gold"
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
