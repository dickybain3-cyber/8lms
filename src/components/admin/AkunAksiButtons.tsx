"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type ResetResult =
  | { success: true; password: string }
  | { success: false; error: string };

type HapusResult = { success: true } | { success: false; error: string };

type DampakSiswa = {
  jumlahJawabanSiswa: number;
  jumlahSudahSubmit: number;
  jumlahNilai: number;
};
type DampakGuru = { jumlahEventDibuat: number };

type Props =
  | {
      kind: "siswa";
      id: string;
      label: string;
      nilaiKonfirmasi: string;
      resetAction: (id: string) => Promise<ResetResult>;
      deleteAction: (id: string) => Promise<HapusResult>;
      hitungDampakAction: (id: string) => Promise<DampakSiswa>;
    }
  | {
      kind: "guru";
      id: string;
      label: string;
      nilaiKonfirmasi: string;
      resetAction: (id: string) => Promise<ResetResult>;
      deleteAction: (id: string) => Promise<HapusResult>;
      hitungDampakAction: (id: string) => Promise<DampakGuru>;
    };

/**
 * Dua aksi berbahaya (reset password & hapus akun) untuk satu baris akun
 * (siswa ATAU guru) — Sesi 13, kandidat #1 & #2 dari `PROMPT-SESI-13.md`
 * DIKERJAKAN BERSAMAAN dan sengaja disatukan jadi satu komponen (bukan
 * dua komponen terpisah seperti `ResetPasswordButton.tsx` Sesi 11 yang
 * sekarang digantikan file ini), sesuai saran eksplisit di
 * `PROMPT-SESI-13.md`: dua aksi berbahaya di baris yang sama sebaiknya
 * pakai SATU mekanisme konfirmasi yang konsisten, bukan dua yang beda
 * (sebelumnya reset password pakai `window.confirm()` browser native,
 * hapus akun — kalau dibuat terpisah — kemungkinan akan meniru pola
 * `DeleteEventButton.tsx` yang sudah modal custom; sekarang keduanya
 * modal custom yang sama gayanya).
 *
 * Pemisahan visual (supaya tidak salah klik antara dua aksi beda level
 * bahaya): DUA TOMBOL bersebelahan dengan warna kontras (reset = netral,
 * hapus = merah/`danger`) — BUKAN dropdown menu. Dropdown dipertimbangkan
 * tapi dihindari karena tabel pembungkusnya (`/admin/siswa`,
 * `/admin/guru`) pakai `overflow-hidden` untuk sudut membulat pada
 * container tabel; dropdown `position: absolute` yang terpotong ancestor
 * itu bisa membuat menu tidak kelihatan penuh untuk baris-baris dekat
 * bagian bawah tabel. Modal sendiri aman dari masalah ini karena
 * `position: fixed` (relatif ke viewport, tidak terpengaruh
 * `overflow-hidden` leluhur manapun di sini).
 *
 * Dua Server Action (`resetAction`, `deleteAction`, `hitungDampakAction`)
 * diterima sebagai prop dari Server Component (`page.tsx`) — pola yang
 * sama dengan `ResetPasswordButton.tsx` sebelumnya. `kind` (bukan fungsi
 * render) yang membedakan cara menampilkan dampak siswa vs guru, karena
 * Next.js TIDAK MENGIZINKAN closure/fungsi biasa (selain referensi Server
 * Action) dioper dari Server Component ke Client Component — makanya
 * logika `renderDampak` di bawah didefinisikan DI DALAM komponen ini
 * (bukan diterima lewat prop), dipilih lewat `props.kind` yang berupa
 * string biasa (serializable).
 */
export default function AkunAksiButtons(props: Props) {
  const { id, label, nilaiKonfirmasi, resetAction, deleteAction, hitungDampakAction } =
    props;
  const router = useRouter();

  // --- Reset password ---
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStatus, setResetStatus] = useState<"idle" | "loading" | "done">(
    "idle"
  );
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
  const [copied, setCopied] = useState(false);

  function bukaReset() {
    setResetOpen(true);
    setResetStatus("idle");
    setResetResult(null);
    setCopied(false);
  }

  async function konfirmasiReset() {
    setResetStatus("loading");
    const res = await resetAction(id);
    setResetResult(res);
    setResetStatus("done");
  }

  function salinPassword() {
    if (!resetResult?.success) return;
    navigator.clipboard.writeText(resetResult.password).then(() => {
      setCopied(true);
    });
  }

  function tutupReset() {
    setResetOpen(false);
    setResetStatus("idle");
    setResetResult(null);
    setCopied(false);
  }

  // --- Hapus akun ---
  const [hapusOpen, setHapusOpen] = useState(false);
  const [dampak, setDampak] = useState<DampakSiswa | DampakGuru | null>(null);
  const [loadingDampak, setLoadingDampak] = useState(false);
  const [ketikan, setKetikan] = useState("");
  const [hapusError, setHapusError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function bukaHapus() {
    setHapusOpen(true);
    setKetikan("");
    setHapusError(null);
    setDampak(null);
    setLoadingDampak(true);
    const d = await hitungDampakAction(id);
    setDampak(d);
    setLoadingDampak(false);
  }

  function tutupHapus() {
    setHapusOpen(false);
    setDampak(null);
    setKetikan("");
    setHapusError(null);
  }

  function konfirmasiHapus() {
    setHapusError(null);
    startTransition(async () => {
      const res = await deleteAction(id);
      if (!res.success) {
        setHapusError(res.error);
        return;
      }
      setHapusOpen(false);
      router.refresh(); // baris ini hilang dari tabel begitu server component re-render
    });
  }

  const cocok = ketikan.trim() === nilaiKonfirmasi;

  const rendered =
    dampak &&
    (props.kind === "siswa"
      ? renderDampakSiswa(dampak as DampakSiswa)
      : renderDampakGuru(dampak as DampakGuru));

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={bukaReset}
        className="rounded-md border border-ink/15 bg-white px-2.5 py-1 text-xs text-ink transition-colors hover:border-gold"
      >
        Reset password
      </button>
      <button
        type="button"
        onClick={() => void bukaHapus()}
        className="rounded-md border border-danger/30 bg-white px-2.5 py-1 text-xs text-danger transition-colors hover:bg-danger/10"
      >
        Hapus
      </button>

      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-paper p-5 shadow-xl">
            {resetStatus !== "done" ? (
              <>
                <h2 className="mb-2 font-serif text-lg text-ink">
                  Reset password akun &quot;{label}&quot;?
                </h2>
                <p className="mb-5 text-sm text-ink/70">
                  Password lama akan langsung tidak berlaku setelah ini —
                  pastikan kamu siap menyampaikan password baru ke yang
                  bersangkutan.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={tutupReset}
                    className="rounded-md border border-ink/15 px-4 py-2 text-sm text-ink hover:bg-ink/5"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={resetStatus === "loading"}
                    onClick={() => void konfirmasiReset()}
                    className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-light disabled:opacity-60"
                  >
                    {resetStatus === "loading" ? "Mereset…" : "Ya, reset"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-3 font-serif text-lg text-ink">
                  {resetResult?.success ? "Password baru dibuat" : "Gagal reset password"}
                </h2>
                {resetResult?.success ? (
                  <>
                    <p className="mb-2 text-sm text-ink/70">
                      Password baru (tampil sekali, salin sekarang):
                    </p>
                    <div className="mb-4 flex items-center gap-2">
                      <code className="flex-1 rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink">
                        {resetResult.password}
                      </code>
                      <button
                        type="button"
                        onClick={salinPassword}
                        className="rounded-md border border-ink/15 bg-white px-3 py-2 text-xs text-ink hover:border-gold"
                      >
                        {copied ? "Tersalin ✓" : "Salin"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                    {resetResult?.error}
                  </p>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={tutupReset}
                    className="rounded-md border border-ink/15 px-4 py-2 text-sm text-ink hover:bg-ink/5"
                  >
                    Tutup
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {hapusOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-paper p-6 shadow-xl">
            <h2 className="mb-2 font-serif text-lg text-ink">
              Hapus akun &quot;{label}&quot;?
            </h2>

            {loadingDampak && (
              <p className="mb-4 text-sm text-ink/50">Memeriksa data terkait…</p>
            )}
            {!loadingDampak && rendered && (
              <p
                className={`mb-4 rounded-md border px-3 py-2.5 text-sm ${
                  rendered.destruktif
                    ? "border-danger/20 bg-danger/5 text-danger"
                    : "border-ink/10 bg-ink/5 text-ink/70"
                }`}
              >
                {rendered.teks}
              </p>
            )}

            <label className="mb-1.5 block text-sm text-ink/70">
              Ketik ulang &quot;{nilaiKonfirmasi}&quot; untuk konfirmasi:
            </label>
            <input
              type="text"
              value={ketikan}
              onChange={(e) => setKetikan(e.target.value)}
              placeholder={nilaiKonfirmasi}
              disabled={loadingDampak}
              className="mb-4 w-full rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-ink outline-none focus:border-gold disabled:opacity-60"
            />

            {hapusError && (
              <p className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
                {hapusError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={tutupHapus}
                disabled={pending}
                className="rounded-md border border-ink/15 px-4 py-2 text-sm text-ink hover:bg-ink/5"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!cocok || pending || loadingDampak}
                onClick={konfirmasiHapus}
                className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-danger/90 disabled:opacity-40"
              >
                {pending ? "Menghapus…" : "Hapus Permanen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Definisi "destruktif" untuk siswa: SENGAJA true kalau siswa ini punya
 * jawaban_siswa ATAU nilai tersimpan (bukan cuma kalau sudah submit) —
 * bahkan draf jawaban yang belum dikumpulkan pun ikut terhapus permanen
 * lewat cascade, jadi tetap layak diberi peringatan merah walau siswa
 * itu belum pernah menekan "Kumpulkan".
 */
function renderDampakSiswa(d: DampakSiswa): { destruktif: boolean; teks: ReactNode } {
  const destruktif = d.jumlahJawabanSiswa > 0 || d.jumlahNilai > 0;
  if (!destruktif) {
    return {
      destruktif: false,
      teks: "Siswa ini belum punya jawaban ujian atau nilai tersimpan — tidak ada data ujian yang ikut terhapus.",
    };
  }
  return {
    destruktif: true,
    teks: (
      <>
        Siswa ini punya data di <strong>{d.jumlahJawabanSiswa} mapel</strong>{" "}
        ({d.jumlahSudahSubmit} di antaranya sudah dikumpulkan) dengan{" "}
        <strong>{d.jumlahNilai} baris nilai</strong> tersimpan. Menghapus
        akun ini akan ikut menghapus PERMANEN seluruh jawaban &amp; nilai
        tersebut. Tindakan ini tidak bisa dibatalkan.
      </>
    ),
  };
}

/**
 * Dampak guru SENGAJA tidak pernah ditandai `destruktif: true` — event
 * yang pernah dibuat guru ini TIDAK ikut terhapus (FK `on delete set
 * null`, lihat komentar `hitungDampakHapusGuru` di actions.ts), jadi
 * tidak ada data ujian yang lenyap. Bukan berarti aksinya tidak
 * berbahaya (kehilangan akses login guru tetap serius) — cuma dampak ke
 * DATA LAIN yang berbeda level dari versi siswa, makanya kotak
 * peringatannya netral, bukan merah.
 */
function renderDampakGuru(d: DampakGuru): { destruktif: boolean; teks: ReactNode } {
  if (d.jumlahEventDibuat === 0) {
    return { destruktif: false, teks: "Guru ini belum pernah membuat event." };
  }
  return {
    destruktif: false,
    teks: (
      <>
        Guru ini tercatat membuat <strong>{d.jumlahEventDibuat} event</strong>.
        Event-event itu TIDAK ikut terhapus — hanya kaitan &quot;dibuat
        oleh&quot;-nya yang dikosongkan. Riwayat log aktivitas guru ini
        (import, reset password, dst) juga tetap ada, nama disnapshot di
        detail log.
      </>
    ),
  };
}
