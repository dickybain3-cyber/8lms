"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import JadwalMapelFields from "@/components/admin/JadwalMapelFields";
import { createMapel, type ActionState } from "../../../actions";

const initialState: ActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-ink py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light disabled:opacity-50 sm:w-auto sm:px-6"
    >
      {pending ? "Menyimpan…" : "Simpan Mapel"}
    </button>
  );
}

export default function MapelForm({
  eventId,
  kelasList,
}: {
  eventId: string;
  kelasList: { id: string; nama: string }[];
}) {
  const createMapelWithEventId = createMapel.bind(null, eventId);
  const [state, formAction] = useFormState(
    createMapelWithEventId,
    initialState
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const allSelected = checked.size === kelasList.length && kelasList.length > 0;

  function toggleAll() {
    if (allSelected) {
      setChecked(new Set());
    } else {
      setChecked(new Set(kelasList.map((k) => k.id)));
    }
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
      <div>
        <label htmlFor="nama" className="mb-1.5 block text-sm text-ink/70">
          Nama mapel
        </label>
        <input
          id="nama"
          name="nama"
          type="text"
          required
          placeholder="mis. Matematika"
          className="w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink placeholder:text-ink/30 outline-none focus:border-gold"
        />
      </div>

      <JadwalMapelFields />

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
        {kelasList.length === 0 && (
          <p className="mt-2 text-sm text-ink/40">
            Tidak ada kelas untuk jenjang event ini.
          </p>
        )}
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
