"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import type { TipeSoal } from "@/types";
import { TIPE_DESKRIPSI, TIPE_LABEL, TIPE_SOAL_LIST } from "@/lib/soal";
import {
  createSoal,
  updateSoal,
  createSoalAdmin,
  updateSoalAdmin,
  type ActionState,
} from "@/app/admin/event/[eventId]/mapel/[mapelId]/soal/actions";
import type { Jenjang } from "@/lib/jenjang";
import BadgeJenjang from "@/components/admin/BadgeJenjang";
import { adaGambarBelumSelesai } from "@/lib/html-soal";
import { TOMBOL_BIASA, TOMBOL_UTAMA } from "@/components/ui/Panel";
import PilganForm from "./PilganForm";
import UraianSingkatForm from "./UraianSingkatForm";
import BenarSalahForm from "./BenarSalahForm";
import MultiBenarSalahForm from "./MultiBenarSalahForm";
import MenjodohkanForm from "./MenjodohkanForm";

const initialState: ActionState = { error: null };

export type SoalAwal = {
  id: string;
  tipe: TipeSoal;
  skor: number;
  gambar_url: string | null;
  konten_jsonb: Record<string, unknown>;
};

/** Ikon per tipe — supaya pemilih bentuk soal bisa dikenali dari
 *  bentuknya, bukan hanya dari membaca enam label yang panjangnya mirip. */
const TIPE_IKON: Record<TipeSoal, string> = {
  pilgan_biasa: "fa-circle-dot",
  pilgan_kompleks: "fa-square-check",
  uraian_singkat: "fa-pen-to-square",
  benar_salah: "fa-toggle-on",
  multi_benar_salah: "fa-list-check",
  menjodohkan: "fa-link",
};

function SubmitButton({
  label,
  tertahan,
}: {
  label: string;
  tertahan: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || tertahan}
      className={`${TOMBOL_UTAMA} w-full sm:w-auto sm:px-7`}
    >
      {pending ? (
        <>
          <i className="fas fa-circle-notch fa-spin" aria-hidden />
          Menyimpan…
        </>
      ) : tertahan ? (
        <>
          <i className="fas fa-hourglass-half" aria-hidden />
          Menunggu gambar…
        </>
      ) : (
        <>
          <i className="fas fa-floppy-disk" aria-hidden />
          {label}
        </>
      )}
    </button>
  );
}

export default function SoalForm({
  eventId,
  mapelId,
  soalAwal,
  jumlahSudahSubmit = 0,
  jenjang,
  /** Nomor urut soal berikutnya, untuk pita "Soal ke-N". */
  nomorBerikutnya,
}: {
  eventId: string;
  mapelId: string;
  soalAwal?: SoalAwal;
  jumlahSudahSubmit?: number;
  jenjang?: Jenjang;
  nomorBerikutnya?: number;
}) {
  const mode = soalAwal ? "edit" : "tambah";
  const action = jenjang
    ? mode === "edit"
      ? updateSoalAdmin.bind(null, jenjang, eventId, mapelId, soalAwal!.id)
      : createSoalAdmin.bind(null, jenjang, eventId, mapelId)
    : mode === "edit"
      ? updateSoal.bind(null, eventId, mapelId, soalAwal!.id)
      : createSoal.bind(null, eventId, mapelId);
  const [state, formAction] = useFormState(action, initialState);

  const [tipe, setTipe] = useState<TipeSoal>(soalAwal?.tipe ?? "pilgan_biasa");
  const [skor, setSkor] = useState(String(soalAwal?.skor ?? 2));
  const [konten, setKonten] = useState<Record<string, unknown>>(
    soalAwal?.konten_jsonb ?? {}
  );

  /**
   * Kunci remount sub-form.
   *
   * Sub-form (PilganForm, dst) memuat isinya dari prop `initial` SEKALI
   * saat dipasang, dan editor kaya di dalamnya juga memasang isi awalnya
   * sekali saat mount — keduanya sengaja begitu supaya kursor tidak
   * melompat saat mengetik. Konsekuensinya: mengosongkan state `konten`
   * saja TIDAK mengosongkan apa yang terlihat di layar. Menaikkan kunci
   * ini memaksa React membuang seluruh pohon sub-form dan membuat yang
   * baru — satu-satunya cara form ini benar-benar bersih untuk soal
   * berikutnya.
   */
  const [kunciReset, setKunciReset] = useState(0);

  const [jumlahTersimpan, setJumlahTersimpan] = useState(0);
  const [pesanSukses, setPesanSukses] = useState<string | null>(null);
  const nonceTerakhir = useRef<number | undefined>(undefined);
  const puncakRef = useRef<HTMLDivElement>(null);

  const onContentChange = setKonten as (konten: object) => void;
  const kontenJson = JSON.stringify(konten);
  const masihMengunggah = adaGambarBelumSelesai(kontenJson);

  /**
   * Alur "input berantai".
   *
   * Setelah satu soal tersimpan, server action TIDAK lagi memindahkan
   * halaman (lihat komentar panjang di `createSoal`). Efek ini yang
   * menyelesaikan sisanya: kosongkan form, kembali ke pemilih bentuk
   * soal, dan gulirkan layar ke atas supaya pemilih itu benar-benar
   * terlihat — bukan tertinggal di atas layar sementara guru menatap
   * form kosong tanpa tahu soal barusan berhasil atau tidak.
   *
   * Dijaga `nonce`: dua soal berturut-turut bisa menghasilkan state
   * dengan isi yang sama persis, dan tanpa penanda yang selalu berubah
   * efek ini hanya jalan sekali lalu diam pada soal-soal berikutnya.
   */
  useEffect(() => {
    if (mode !== "tambah") return;
    if (!state.sukses || !state.nonce) return;
    if (nonceTerakhir.current === state.nonce) return;

    nonceTerakhir.current = state.nonce;
    setKonten({});
    setKunciReset((k) => k + 1);
    setJumlahTersimpan((n) => n + 1);
    setPesanSukses(state.sukses);
    // Skor SENGAJA tidak dikosongkan. Bobot butir dalam satu mapel
    // hampir selalu sama, dan mengetik ulang "2" lima puluh kali adalah
    // persis jenis pekerjaan berulang yang mau dihapus perubahan ini.
    puncakRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state, mode]);

  const nomorTampil =
    nomorBerikutnya !== undefined
      ? nomorBerikutnya + jumlahTersimpan
      : undefined;

  const kembaliHref = `/admin/event/${eventId}/mapel/${mapelId}${
    jenjang ? `?jenjang=${jenjang}` : ""
  }`;

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <input type="hidden" name="tipe" value={tipe} />
      <input type="hidden" name="konten_jsonb" value={kontenJson} />
      {/*
        Kotak unggah "Gambar soal umum" sudah dihapus dari form ini —
        gambar sekarang ditempel langsung di dalam kolom pertanyaan/opsi.
        Nilai lamanya tetap DIKIRIM ULANG apa adanya supaya soal lama yang
        memakainya tidak kehilangan gambarnya begitu dibuka lalu disimpan
        ulang oleh gurunya.
      */}
      <input
        type="hidden"
        name="gambar_url"
        value={soalAwal?.gambar_url ?? ""}
      />

      <div ref={puncakRef} className="scroll-mt-24" />

      <div className="flex flex-wrap items-center gap-3">
        {nomorTampil !== undefined && mode === "tambah" && (
          <span className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#2563eb] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/25">
            <i className="fas fa-hashtag text-xs" aria-hidden />
            Soal ke-{nomorTampil}
          </span>
        )}
        {jumlahTersimpan > 0 && (
          <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700">
            <i className="fas fa-circle-check" aria-hidden />
            {jumlahTersimpan} soal tersimpan sesi ini
          </span>
        )}
        {jenjang && (
          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
            Disimpan ke: <BadgeJenjang jenjang={jenjang} />
          </span>
        )}
      </div>

      {pesanSukses && mode === "tambah" && (
        <div className="animasi-muncul rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
          <p className="flex items-center gap-2.5 text-sm font-semibold text-emerald-800">
            <i className="fas fa-circle-check" aria-hidden />
            {pesanSukses} Form sudah dikosongkan — pilih bentuk soal
            berikutnya di bawah.
          </p>
          {state.keBank && (
            <p className="mt-1.5 pl-6 text-[0.78rem] text-emerald-700/80">
              <i className="fas fa-box-archive mr-1.5" aria-hidden />
              Salinannya juga masuk ke Bank Soal, bisa dipakai lagi di
              kegiatan lain kapan pun.
            </p>
          )}
        </div>
      )}

      {mode === "edit" && jumlahSudahSubmit > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm leading-relaxed text-amber-900">
          <i className="fas fa-triangle-exclamation mr-2" aria-hidden />
          <strong>{jumlahSudahSubmit} siswa</strong> sudah submit &amp;
          dinilai dengan versi soal ini. Kalau kamu mengubah kunci jawaban
          di bawah, klik &quot;Hitung Ulang Nilai&quot; di halaman
          Pengolahan Nilai setelah menyimpan supaya nilai mereka ikut
          ter-update.
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-xs font-bold text-white">
            1
          </span>
          <h2 className="font-serif text-lg font-bold text-ink">Bentuk soal</h2>
        </div>

        {mode === "edit" ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <i className={`fas ${TIPE_IKON[tipe]}`} aria-hidden />
              {TIPE_LABEL[tipe]}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Bentuk soal tidak bisa diganti saat mengedit — hapus lalu buat
              ulang kalau memang perlu ganti bentuk.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {TIPE_SOAL_LIST.map((t) => {
                const dipilih = tipe === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      if (t === tipe) return;
                      setTipe(t);
                      setKonten({});
                      // Ganti bentuk soal = isi sebelumnya tidak berlaku
                      // lagi (opsi pilgan tidak berarti apa-apa untuk
                      // uraian). Tanpa remount, sisa isian lama tetap
                      // tertinggal di DOM editor kaya walau state-nya
                      // sudah dikosongkan.
                      setKunciReset((k) => k + 1);
                    }}
                    className={`group flex flex-col items-start gap-1.5 rounded-xl border-2 p-3.5 text-left transition-all ${
                      dipilih
                        ? "border-[--primary] bg-blue-50/70 shadow-md shadow-blue-600/10"
                        : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors ${
                        dipilih
                          ? "bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-white"
                          : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                      }`}
                    >
                      <i className={`fas ${TIPE_IKON[t]}`} aria-hidden />
                    </span>
                    <span
                      className={`text-[0.82rem] font-semibold leading-snug ${
                        dipilih ? "text-ink" : "text-slate-600"
                      }`}
                    >
                      {TIPE_LABEL[t]}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600">
              <i
                className="fas fa-circle-info mt-0.5 text-slate-400"
                aria-hidden
              />
              {TIPE_DESKRIPSI[tipe]}
            </p>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-xs font-bold text-white">
            2
          </span>
          <h2 className="font-serif text-lg font-bold text-ink">Isi soal</h2>
        </div>

        <div key={kunciReset}>
          {(tipe === "pilgan_biasa" || tipe === "pilgan_kompleks") && (
            <PilganForm
              kompleks={tipe === "pilgan_kompleks"}
              onContentChange={onContentChange}
              initial={mode === "edit" ? soalAwal!.konten_jsonb : undefined}
            />
          )}
          {tipe === "uraian_singkat" && (
            <UraianSingkatForm
              onContentChange={onContentChange}
              initial={mode === "edit" ? soalAwal!.konten_jsonb : undefined}
            />
          )}
          {tipe === "benar_salah" && (
            <BenarSalahForm
              onContentChange={onContentChange}
              initial={mode === "edit" ? soalAwal!.konten_jsonb : undefined}
            />
          )}
          {tipe === "multi_benar_salah" && (
            <MultiBenarSalahForm
              onContentChange={onContentChange}
              initial={mode === "edit" ? soalAwal!.konten_jsonb : undefined}
            />
          )}
          {tipe === "menjodohkan" && (
            <MenjodohkanForm
              onContentChange={onContentChange}
              initial={mode === "edit" ? soalAwal!.konten_jsonb : undefined}
            />
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-xs font-bold text-white">
            3
          </span>
          <h2 className="font-serif text-lg font-bold text-ink">Bobot skor</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="skor"
            name="skor"
            type="number"
            min={0.5}
            step="0.5"
            required
            value={skor}
            onChange={(e) => setSkor(e.target.value)}
            aria-label="Bobot skor soal ini"
            className="w-32 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-lg font-bold tabular-nums text-ink outline-none focus:border-[--primary]"
          />
          <p className="max-w-sm text-xs leading-relaxed text-slate-500">
            Nilai ini bisa diubah kapan saja langsung dari daftar soal —
            tidak perlu membuka butirnya lagi. Total skor seluruh mapel
            terlihat di halaman daftar.
          </p>
        </div>
      </section>

      {masihMengunggah && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden />
          Masih ada gambar yang sedang diunggah. Tunggu sebentar — kalau
          disimpan sekarang, gambar itu tidak ikut tersimpan.
        </p>
      )}

      {state.error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <i className="fas fa-circle-exclamation mr-2" aria-hidden />
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-2.5 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
        <SubmitButton
          label={
            mode === "edit" ? "Simpan Perubahan" : "Simpan & Lanjut Soal Baru"
          }
          tertahan={masihMengunggah}
        />
        <Link href={kembaliHref} className={`${TOMBOL_BIASA} w-full sm:w-auto`}>
          <i className="fas fa-list-ul" aria-hidden />
          {mode === "edit" ? "Batal" : "Selesai, lihat daftar soal"}
        </Link>
      </div>
    </form>
  );
}
