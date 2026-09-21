"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  simpanPengumpulan,
  tarikKembaliPengumpulan,
  hapusBerkasPengumpulan,
  urlBerkasSaya,
  type ActionState,
} from "../actions";
import {
  alasanTidakBolehMengumpulkan,
  bolehMengumpulkan,
  formatSisaSingkat,
  formatTenggat,
  formatUkuranBerkas,
} from "@/lib/tugas";
import {
  ACCEPT_BERKAS,
  KETERANGAN_BERKAS,
  validasiBerkas,
} from "@/lib/tugas-berkas";

const initialState: ActionState = { error: null, pesan: null };

export interface TugasUntukSiswa {
  id: string;
  judul: string;
  dibuka_at: string;
  tenggat: string;
  izinkan_terlambat: boolean;
  minta_teks: boolean;
  minta_berkas: boolean;
  skor_maksimal: number;
}

export interface PengumpulanSaya {
  teks: string;
  berkas_path: string | null;
  berkas_nama: string | null;
  berkas_ukuran: number | null;
  submitted_at: string | null;
  nilai: number | null;
  catatan_guru: string | null;
}

/**
 * Form pengumpulan tugas.
 *
 * ── JAM YANG DIPAKAI DI SINI ADALAH JAM SERVER, BUKAN JAM HP ──
 *
 * Pola yang sama persis dengan dashboard dan timer ujian: server mengirim
 * `waktuServer`, client menghitung OFFSET sekali, lalu "sekarang"
 * diturunkan dari `Date.now() + offset` dan berdetak tiap detik. HP yang
 * jamnya meleset sepuluh menit ke depan akan menampilkan tombol kumpulkan
 * sebagai terkunci sepuluh menit terlalu cepat — dan siswa itu tidak
 * punya cara tahu bahwa yang salah adalah HP-nya.
 *
 * Yang berdetak di sini cuma TAMPILAN (hitung mundur & keadaan tombol).
 * Yang menentukan diterima atau tidak tetap RLS di database, yang memakai
 * `now()` Postgres. Jadi kalaupun ada HP yang berhasil menampilkan tombol
 * aktif di luar jadwal, yang terjadi adalah penolakan dengan pesan yang
 * jelas — bukan pengumpulan yang lolos.
 */
export default function FormPengumpulan({
  tugas,
  awal,
  waktuServer,
}: {
  tugas: TugasUntukSiswa;
  awal: PengumpulanSaya | null;
  waktuServer: string;
}) {
  const offsetMs = useMemo(
    () => new Date(waktuServer).getTime() - Date.now(),
    [waktuServer]
  );
  const [now, setNow] = useState(() => Date.now() + offsetMs);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offsetMs), 1000);
    return () => clearInterval(id);
  }, [offsetMs]);

  const action = simpanPengumpulan.bind(null, tugas.id);
  const [state, formAction] = useFormState(action, initialState);

  const [galatBerkasLokal, setGalatBerkasLokal] = useState<string | null>(null);
  const [namaBerkasDipilih, setNamaBerkasDipilih] = useState<string | null>(null);

  const sudahDinilai = awal?.nilai !== null && awal?.nilai !== undefined;
  const sudahDikumpulkan = Boolean(awal?.submitted_at);
  const pintuTerbuka = bolehMengumpulkan(tugas, now) && !sudahDinilai;
  const alasanTertutup = sudahDinilai
    ? "Tugas ini sudah dinilai gurumu, jadi isinya dikunci."
    : alasanTidakBolehMengumpulkan(tugas, now);

  const sisaMs = new Date(tugas.tenggat).getTime() - now;
  const terlambatSekarang = sisaMs < 0;

  return (
    <div className="space-y-5">
      {/* ── Status & hitung mundur ── */}
      <div
        className={`rounded-2xl border p-5 ${
          sudahDinilai
            ? "border-blue-200 bg-blue-50"
            : sudahDikumpulkan
              ? "border-emerald-200 bg-emerald-50"
              : terlambatSekarang
                ? "border-amber-200 bg-amber-50"
                : "border-slate-200 bg-white"
        }`}
      >
        {sudahDinilai ? (
          <>
            <p className="font-serif text-lg font-bold text-ink">
              Nilaimu: {awal!.nilai} / {tugas.skor_maksimal}
            </p>
            {awal!.catatan_guru && (
              <p className="mt-1.5 text-sm leading-relaxed text-ink/75">
                <i className="fas fa-comment-dots mr-1.5 text-blue-500" aria-hidden />
                {awal!.catatan_guru}
              </p>
            )}
          </>
        ) : sudahDikumpulkan ? (
          <p className="text-sm font-medium text-emerald-800">
            <i className="fas fa-circle-check mr-1.5" aria-hidden />
            Sudah dikumpulkan {formatTenggat(awal!.submitted_at!)}. Menunggu
            dinilai gurumu.
          </p>
        ) : terlambatSekarang ? (
          <p className="text-sm font-medium text-amber-800">
            <i className="fas fa-triangle-exclamation mr-1.5" aria-hidden />
            Tenggat sudah lewat{" "}
            {tugas.izinkan_terlambat
              ? "— kamu masih bisa mengumpulkan, tapi akan ditandai terlambat."
              : "dan pengumpulan sudah ditutup."}
          </p>
        ) : (
          <p className="text-sm font-medium text-ink">
            <i className="fas fa-hourglass-half mr-1.5 text-slate-400" aria-hidden />
            Sisa waktu <strong>{formatSisaSingkat(sisaMs)}</strong> · tenggat{" "}
            {formatTenggat(tugas.tenggat)}
          </p>
        )}
      </div>

      {state.pesan && (
        <div className="animasi-muncul rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <i className="fas fa-circle-check mr-2" aria-hidden />
          {state.pesan}
        </div>
      )}

      {state.error && (
        <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          <i className="fas fa-circle-exclamation mr-2" aria-hidden />
          {state.error}
        </div>
      )}

      {!pintuTerbuka && alasanTertutup && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <i className="fas fa-lock mr-2 text-slate-400" aria-hidden />
          {alasanTertutup}
        </div>
      )}

      <form action={formAction} className="space-y-5">
        {tugas.minta_teks && (
          <div>
            <label
              htmlFor="teks"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Jawabanmu
            </label>
            <textarea
              id="teks"
              name="teks"
              rows={10}
              disabled={!pintuTerbuka}
              defaultValue={awal?.teks ?? ""}
              placeholder="Tulis jawabanmu di sini…"
              className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 leading-relaxed text-ink placeholder:text-ink/30 outline-none focus:border-gold disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
        )}

        {tugas.minta_berkas && (
          <div>
            <label
              htmlFor="berkas"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Lampiran
            </label>

            {awal?.berkas_path && (
              <BerkasTersimpan
                tugasId={tugas.id}
                path={awal.berkas_path}
                nama={awal.berkas_nama ?? "berkas"}
                ukuran={awal.berkas_ukuran}
                bisaHapus={pintuTerbuka}
              />
            )}

            <input
              id="berkas"
              name="berkas"
              type="file"
              accept={ACCEPT_BERKAS}
              disabled={!pintuTerbuka}
              onChange={(e) => {
                const file = e.target.files?.[0];
                setNamaBerkasDipilih(file?.name ?? null);
                // Ditolak DI SINI, sebelum apa pun terkirim. Siswa yang
                // memakai kuota HP tidak perlu membakar 12 MB cuma untuk
                // diberi tahu bahwa berkasnya terlalu besar. Pengecekan
                // yang sama diulang di server — lihat komentar di
                // `src/lib/tugas-berkas.ts`.
                setGalatBerkasLokal(
                  file
                    ? validasiBerkas({
                        name: file.name,
                        size: file.size,
                        type: file.type,
                      })
                    : null
                );
              }}
              className="w-full rounded-xl border border-dashed border-ink/20 bg-white px-4 py-3 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-paper disabled:bg-slate-50"
            />
            <p className="mt-1.5 text-xs text-ink/45">
              {KETERANGAN_BERKAS}
              {awal?.berkas_path &&
                " Memilih berkas baru akan menggantikan lampiran di atas."}
            </p>

            {galatBerkasLokal && (
              <p className="mt-1.5 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {galatBerkasLokal}
              </p>
            )}
            {namaBerkasDipilih && !galatBerkasLokal && (
              <p className="mt-1.5 text-xs font-medium text-emerald-700">
                <i className="fas fa-paperclip mr-1" aria-hidden />
                {namaBerkasDipilih} siap dikirim.
              </p>
            )}
          </div>
        )}

        {pintuTerbuka && (
          <div className="flex flex-wrap items-center gap-3">
            {/*
              DUA TOMBOL, DAN URUTANNYA DISENGAJA.

              "Simpan draf" di kiri sebagai tombol sekunder, "Kumpulkan"
              di kanan sebagai tombol utama. Yang paling sering ditekan
              adalah Kumpulkan, dan itu yang harus paling menonjol — tapi
              draf harus tetap ada dan mudah dijangkau, karena anak yang
              mengetik di HP sambil menunggu jemputan perlu cara menyimpan
              tanpa merasa sudah menyerahkan pekerjaannya.

              Keduanya `type="submit"` dengan `name="aksi"` berbeda; yang
              ditekanlah yang nilainya ikut terkirim.
            */}
            <SubmitDraf />
            <SubmitKumpul
              sudahDikumpulkan={sudahDikumpulkan}
              terlambat={terlambatSekarang}
              adaGalatBerkas={Boolean(galatBerkasLokal)}
            />
            {sudahDikumpulkan && <TombolTarikKembali tugasId={tugas.id} />}
          </div>
        )}
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SubmitDraf() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="aksi"
      value="draf"
      disabled={pending}
      className="rounded-lg border border-ink/15 bg-white px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink/30 disabled:opacity-50"
    >
      Simpan draf
    </button>
  );
}

function SubmitKumpul({
  sudahDikumpulkan,
  terlambat,
  adaGalatBerkas,
}: {
  sudahDikumpulkan: boolean;
  terlambat: boolean;
  adaGalatBerkas: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="aksi"
      value="kumpul"
      disabled={pending || adaGalatBerkas}
      className={`rounded-lg px-6 py-2.5 text-sm font-semibold text-paper transition-colors disabled:opacity-50 ${
        terlambat ? "bg-amber-600 hover:bg-amber-700" : "bg-ink hover:bg-ink-light"
      }`}
    >
      {pending ? (
        <>
          <i className="fas fa-circle-notch fa-spin mr-1.5" aria-hidden />
          Mengirim…
        </>
      ) : sudahDikumpulkan ? (
        "Kumpulkan ulang"
      ) : terlambat ? (
        "Kumpulkan (terlambat)"
      ) : (
        "Kumpulkan"
      )}
    </button>
  );
}

function TombolTarikKembali({ tugasId }: { tugasId: string }) {
  const [pending, startTransition] = useTransition();
  const [galat, setGalat] = useState<string | null>(null);
  const [konfirmasi, setKonfirmasi] = useState(false);

  if (!konfirmasi) {
    return (
      <button
        type="button"
        onClick={() => setKonfirmasi(true)}
        className="text-sm font-medium text-slate-500 underline underline-offset-4 hover:text-slate-700"
      >
        Tarik kembali
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600">Tarik kembali? Isinya tetap tersimpan.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const hasil = await tarikKembaliPengumpulan(tugasId);
            if (hasil.error) setGalat(hasil.error);
            else setKonfirmasi(false);
          })
        }
        className="rounded-md bg-slate-700 px-3 py-1.5 font-medium text-white disabled:opacity-50"
      >
        {pending ? "…" : "Ya"}
      </button>
      <button
        type="button"
        onClick={() => setKonfirmasi(false)}
        className="text-slate-500 underline underline-offset-4"
      >
        Batal
      </button>
      {galat && <span className="text-danger">{galat}</span>}
    </span>
  );
}

function BerkasTersimpan({
  tugasId,
  path,
  nama,
  ukuran,
  bisaHapus,
}: {
  tugasId: string;
  path: string;
  nama: string;
  ukuran: number | null;
  bisaHapus: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [galat, setGalat] = useState<string | null>(null);

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
      <i className="fas fa-paperclip text-slate-400" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
        {nama}
      </span>
      <span className="text-xs text-slate-400">{formatUkuranBerkas(ukuran)}</span>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setGalat(null);
            const hasil = await urlBerkasSaya(path);
            if (hasil.url) window.open(hasil.url, "_blank", "noopener,noreferrer");
            else setGalat(hasil.error);
          })
        }
        className="text-xs font-semibold text-teal underline underline-offset-4 disabled:opacity-50"
      >
        Lihat
      </button>

      {bisaHapus && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setGalat(null);
              const hasil = await hapusBerkasPengumpulan(tugasId);
              if (hasil.error) setGalat(hasil.error);
            })
          }
          className="text-xs font-semibold text-red-600 underline underline-offset-4 disabled:opacity-50"
        >
          Hapus
        </button>
      )}

      {galat && <span className="w-full text-xs text-danger">{galat}</span>}
    </div>
  );
}
