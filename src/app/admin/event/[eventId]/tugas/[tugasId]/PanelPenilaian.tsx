"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  simpanPenilaian,
  urlUnduhBerkas,
  type ActionState,
} from "../actions";
import {
  formatTenggat,
  formatUkuranBerkas,
  ringkasPengumpulan,
  type RingkasPengumpulan,
} from "@/lib/tugas";

export interface PengumpulanBaris {
  teks: string;
  berkas_path: string | null;
  berkas_nama: string | null;
  berkas_ukuran: number | null;
  submitted_at: string | null;
  nilai: number | null;
  catatan_guru: string | null;
  dinilai_at: string | null;
}

export interface BarisSiswa {
  siswaId: string;
  nama: string;
  username: string;
  kelasNama: string;
  pengumpulan: PengumpulanBaris | null;
}

const initialState: ActionState = { error: null };

type Saringan = "semua" | "belum_dinilai" | "belum_kumpul" | "terlambat";

const LABEL_SARINGAN: Record<Saringan, string> = {
  semua: "Semua",
  belum_dinilai: "Perlu dinilai",
  belum_kumpul: "Belum mengumpulkan",
  terlambat: "Terlambat",
};

/**
 * Daftar siswa + penilaian, satu baris per anak.
 *
 * ── KENAPA DIBUKA SATU PER SATU, BUKAN SEMUA FORM SEKALIGUS ──
 *
 * Godaannya adalah merender 32 form penilaian terbuka sekaligus supaya
 * guru bisa mengetik cepat ke bawah. Tapi tiap baris juga memuat isi
 * pengumpulan — teks esai yang bisa panjang — dan 32 esai terbuka
 * bersamaan membuat halaman ini tidak bisa dipindai sama sekali. Guru
 * kehilangan kemampuan menjawab pertanyaan pertamanya: "siapa yang belum?"
 *
 * Jadi baris tertutup menampilkan ringkasan saja (nama, kelas, status,
 * nilai), dan yang dibuka adalah yang sedang dibaca. Saringan
 * "Perlu dinilai" di atas menggantikan kebutuhan mengetik cepat ke bawah:
 * guru menekan sekali, dan yang tersisa hanya yang memang perlu disentuh.
 *
 * ── SETIAP BARIS PUNYA FORM SENDIRI, DAN ITU DISENGAJA ──
 *
 * Satu form besar berisi 32 nilai berarti satu tombol Simpan yang
 * mengirim semuanya. Satu kegagalan jaringan di tengah = seluruh
 * pekerjaan sore itu hilang, dan guru tidak tahu bagian mana yang sempat
 * tersimpan. Per baris, yang gagal cuma satu anak, dan pesan gagalnya
 * muncul tepat di sebelah namanya.
 */
export default function PanelPenilaian({
  eventId,
  tugasId,
  tenggat,
  skorMaksimal,
  mintaBerkas,
  baris,
}: {
  eventId: string;
  tugasId: string;
  tenggat: string;
  skorMaksimal: number;
  mintaBerkas: boolean;
  baris: BarisSiswa[];
}) {
  const [saringan, setSaringan] = useState<Saringan>("semua");
  const [dibuka, setDibuka] = useState<string | null>(null);

  const denganStatus = useMemo(
    () =>
      baris.map((b) => ({
        ...b,
        ringkas: ringkasPengumpulan(b.pengumpulan, tenggat),
      })),
    [baris, tenggat]
  );

  const jumlah = useMemo(
    () => ({
      semua: denganStatus.length,
      belum_dinilai: denganStatus.filter((b) => b.ringkas.status === "terkumpul")
        .length,
      belum_kumpul: denganStatus.filter(
        (b) => b.ringkas.status === "belum" || b.ringkas.status === "draf"
      ).length,
      terlambat: denganStatus.filter((b) => b.ringkas.terlambat).length,
    }),
    [denganStatus]
  );

  const tersaring = denganStatus.filter((b) => {
    switch (saringan) {
      case "belum_dinilai":
        return b.ringkas.status === "terkumpul";
      case "belum_kumpul":
        return b.ringkas.status === "belum" || b.ringkas.status === "draf";
      case "terlambat":
        return b.ringkas.terlambat;
      default:
        return true;
    }
  });

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(Object.keys(LABEL_SARINGAN) as Saringan[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSaringan(s)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              saringan === s
                ? "bg-ink text-paper"
                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {LABEL_SARINGAN[s]}
            <span
              className={`ml-1.5 ${
                saringan === s ? "text-paper/60" : "text-slate-400"
              }`}
            >
              {jumlah[s]}
            </span>
          </button>
        ))}
      </div>

      {tersaring.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
          {saringan === "belum_dinilai"
            ? "Tidak ada yang menunggu dinilai. Semua pengumpulan yang masuk sudah kamu beri nilai."
            : saringan === "belum_kumpul"
              ? "Semua siswa sasaran sudah mengumpulkan."
              : saringan === "terlambat"
                ? "Tidak ada pengumpulan yang melewati tenggat."
                : "Tidak ada siswa untuk ditampilkan."}
        </p>
      ) : (
        <ul className="space-y-2">
          {tersaring.map((b) => (
            <BarisPenilaian
              key={b.siswaId}
              eventId={eventId}
              tugasId={tugasId}
              skorMaksimal={skorMaksimal}
              mintaBerkas={mintaBerkas}
              baris={b}
              ringkas={b.ringkas}
              terbuka={dibuka === b.siswaId}
              onToggle={() =>
                setDibuka((s) => (s === b.siswaId ? null : b.siswaId))
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function BarisPenilaian({
  eventId,
  tugasId,
  skorMaksimal,
  mintaBerkas,
  baris,
  ringkas,
  terbuka,
  onToggle,
}: {
  eventId: string;
  tugasId: string;
  skorMaksimal: number;
  mintaBerkas: boolean;
  baris: BarisSiswa;
  ringkas: RingkasPengumpulan;
  terbuka: boolean;
  onToggle: () => void;
}) {
  const action = simpanPenilaian.bind(null, eventId, tugasId, baris.siswaId);
  const [state, formAction] = useFormState(action, initialState);

  const p = baris.pengumpulan;

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={terbuka}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-sm font-semibold text-ink">
            {baris.nama}
          </span>
          <span className="block text-[0.72rem] text-slate-500">
            {baris.kelasNama} · {baris.username}
          </span>
        </span>

        <LencanaStatus ringkas={ringkas} />

        <span className="w-16 shrink-0 text-right text-sm font-bold tabular-nums text-ink">
          {p?.nilai === null || p?.nilai === undefined ? (
            <span className="text-slate-300">—</span>
          ) : (
            <>
              {p.nilai}
              <span className="text-[0.65rem] font-normal text-slate-400">
                /{skorMaksimal}
              </span>
            </>
          )}
        </span>

        <i
          className={`fas fa-chevron-down shrink-0 text-xs text-slate-400 transition-transform ${
            terbuka ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {terbuka && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
          <div className="mb-4">
            <h3 className="mb-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">
              Yang dikumpulkan
            </h3>

            {!p || !p.submitted_at ? (
              <p className="text-sm italic text-slate-500">
                {p && (p.teks.trim() !== "" || p.berkas_path)
                  ? "Siswa ini punya draf tersimpan tapi belum menekan Kumpulkan, jadi isinya belum final dan tidak ditampilkan di sini."
                  : "Belum mengumpulkan apa pun."}
                {/*
                  Isi draf sengaja TIDAK ditampilkan ke guru. Draf adalah
                  ruang kerja siswa — dia berhak menghapus, mengubah
                  pikiran, dan menulis hal setengah jadi tanpa merasa
                  sedang diawasi. Yang menjadi pernyataan resmi adalah
                  yang dia kumpulkan.
                */}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-[0.72rem] text-slate-500">
                  Dikumpulkan {formatTenggat(p.submitted_at)}
                  {ringkas.terlambat && (
                    <span className="ml-1.5 font-semibold text-amber-700">
                      · setelah tenggat
                    </span>
                  )}
                </p>

                {p.teks.trim() !== "" && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
                      {p.teks}
                    </p>
                  </div>
                )}

                {p.berkas_path ? (
                  <TombolUnduh
                    path={p.berkas_path}
                    nama={p.berkas_nama ?? "berkas"}
                    ukuran={p.berkas_ukuran}
                  />
                ) : (
                  mintaBerkas && (
                    <p className="text-sm text-amber-700">
                      <i className="fas fa-circle-exclamation mr-1.5" aria-hidden />
                      Tugas ini meminta berkas, tapi siswa mengumpulkan tanpa
                      melampirkan apa pun.
                    </p>
                  )
                )}
              </div>
            )}
          </div>

          <form action={formAction} className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label
                  htmlFor={`nilai-${baris.siswaId}`}
                  className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500"
                >
                  Nilai (dari {skorMaksimal})
                </label>
                <input
                  id={`nilai-${baris.siswaId}`}
                  name="nilai"
                  type="number"
                  min={0}
                  max={skorMaksimal}
                  step="any"
                  defaultValue={p?.nilai ?? ""}
                  placeholder="—"
                  className="w-28 rounded-md border border-ink/15 bg-white px-3 py-2 text-ink outline-none focus:border-gold"
                />
              </div>
              <div className="min-w-[14rem] flex-1">
                <label
                  htmlFor={`catatan-${baris.siswaId}`}
                  className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500"
                >
                  Catatan untuk siswa
                </label>
                <input
                  id={`catatan-${baris.siswaId}`}
                  name="catatan_guru"
                  type="text"
                  maxLength={500}
                  defaultValue={p?.catatan_guru ?? ""}
                  placeholder="mis. Bagus, tapi kesimpulannya kurang lengkap."
                  className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-ink placeholder:text-ink/30 outline-none focus:border-gold"
                />
              </div>
              <TombolSimpan />
            </div>

            <p className="text-[0.72rem] text-slate-500">
              Kosongkan kolom nilai lalu simpan untuk{" "}
              <strong>membatalkan penilaian</strong> — itu juga yang membuka
              kembali kunci pengumpulan, sehingga siswa bisa memperbaiki dan
              mengumpulkan ulang.
            </p>

            {state.error && (
              <p className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {state.error}
              </p>
            )}
          </form>
        </div>
      )}
    </li>
  );
}

function TombolSimpan() {
  const { pending } = useFormStatus();
  // `pending` yang baru saja berubah dari true ke false tanpa error berarti
  // penyimpanan selesai. Ditandai sebentar supaya guru yang menilai 32 anak
  // berturut-turut tidak perlu menebak apakah tekanan tombolnya masuk.
  const [baruTersimpan, setBaruTersimpan] = useState(false);
  const sebelumnya = useRef(false);

  useEffect(() => {
    // Ref-nya diperbarui LEBIH DULU, sebelum percabangan. Kalau
    // pembaruannya ditaruh di dalam `else` (atau sesudah `return`), nilai
    // sebelumnya tidak pernah ikut turun kembali ke false dan tombolnya
    // hanya pernah menampilkan "Tersimpan" satu kali seumur halaman.
    const sebelumPending = sebelumnya.current;
    sebelumnya.current = pending;

    if (sebelumPending && !pending) {
      setBaruTersimpan(true);
      const id = setTimeout(() => setBaruTersimpan(false), 2000);
      return () => clearTimeout(id);
    }
  }, [pending]);

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-ink px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-light disabled:opacity-50"
    >
      {pending ? (
        <>
          <i className="fas fa-circle-notch fa-spin mr-1.5" aria-hidden />
          Menyimpan…
        </>
      ) : baruTersimpan ? (
        <>
          <i className="fas fa-check mr-1.5" aria-hidden />
          Tersimpan
        </>
      ) : (
        "Simpan Nilai"
      )}
    </button>
  );
}

/**
 * Berkas ada di bucket private, jadi tidak ada URL yang bisa ditempel di
 * `href`. Tautannya dibuat saat tombol ditekan (signed URL 5 menit) lalu
 * dibuka di tab baru — lihat `urlUnduhBerkas` di actions.ts.
 */
function TombolUnduh({
  path,
  nama,
  ukuran,
}: {
  path: string;
  nama: string;
  ukuran: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [galat, setGalat] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setGalat(null);
            const hasil = await urlUnduhBerkas(path);
            if (hasil.url) {
              window.open(hasil.url, "_blank", "noopener,noreferrer");
            } else {
              setGalat(hasil.error);
            }
          })
        }
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-teal hover:text-teal disabled:opacity-50"
      >
        <i
          className={`fas ${pending ? "fa-circle-notch fa-spin" : "fa-paperclip"} text-slate-400`}
          aria-hidden
        />
        <span className="max-w-[16rem] truncate">{nama}</span>
        <span className="text-xs text-slate-400">
          {formatUkuranBerkas(ukuran)}
        </span>
      </button>
      {galat && <p className="mt-1 text-xs text-danger">{galat}</p>}
    </div>
  );
}

function LencanaStatus({ ringkas }: { ringkas: RingkasPengumpulan }) {
  const { status, terlambat } = ringkas;

  const gaya =
    status === "dinilai"
      ? "bg-blue-100 text-blue-700"
      : status === "terkumpul"
        ? "bg-emerald-100 text-emerald-700"
        : status === "draf"
          ? "bg-slate-100 text-slate-500"
          : "bg-amber-100 text-amber-700";

  const label =
    status === "dinilai"
      ? "Dinilai"
      : status === "terkumpul"
        ? "Perlu dinilai"
        : status === "draf"
          ? "Draf"
          : "Belum";

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span
        className={`rounded-full px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wide ${gaya}`}
      >
        {label}
      </span>
      {/*
        Terlambat adalah lencana KEDUA, bukan pengganti lencana status.
        Pengumpulan bisa sekaligus sudah dinilai dan terlambat, dan guru
        yang sedang merekap perlu melihat keduanya sekaligus.
      */}
      {terlambat && (
        <span className="rounded-full bg-amber-100 px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-amber-700">
          Telat
        </span>
      )}
    </span>
  );
}
