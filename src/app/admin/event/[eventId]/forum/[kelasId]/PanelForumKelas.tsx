"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { kirimPesanGuru, toggleBonusPesan, type ActionState } from "../actions";
import { POIN_BONUS_PER_KLIK } from "@/lib/forum";

export interface PesanForum {
  id: string;
  isi: string;
  jenisIsi: "teks" | "sticker" | "emoticon";
  createdAt: string;
  bonusDiberikan: boolean;
  dari: { tipe: "guru" | "siswa"; nama: string };
  /** null untuk pesan guru. */
  siswaId: string | null;
}

export interface BarisPoin {
  siswaId: string;
  nama: string;
  username: string;
  poinPesan: number;
  poinBonus: number;
  total: number;
}

const initialState: ActionState = { error: null };

/**
 * Jeda polling untuk melihat pesan/poin baru dari SISWA.
 *
 * ── KENAPA POLLING, BUKAN SUPABASE REALTIME ──
 *
 * Realtime butuh langganan channel per ruang, penanganan reconnect saat
 * koneksi putus, dan pembersihan langganan saat guru berpindah kelas —
 * kerumitan yang sepadan untuk ruang obrolan yang harus terasa hidup
 * detik itu juga. Polling `router.refresh()` tiap 5 detik lebih sederhana
 * dan sudah cukup untuk pola pakai sebenarnya: guru membuka satu ruang
 * kelas, membaca beberapa pesan, membalas atau memberi bonus — bukan
 * mengawasi dua puluh ruang sekaligus dalam satu layar. Kalau nanti pola
 * pakainya berubah (mis. guru piket yang memantau banyak kelas sekaligus
 * di satu layar), migrasi ke realtime adalah pekerjaan terpisah yang
 * pantas dipertimbangkan sendiri, bukan ditambal di sini.
 *
 * Aksi guru sendiri (kirim pesan, toggle bonus) memanggil
 * `router.refresh()` secara eksplisit begitu Server Action-nya selesai —
 * jadi guru tidak pernah menunggu sampai 5 detik untuk melihat efek
 * tindakannya sendiri. Yang menunggu polling hanya pesan BARU dari siswa.
 */
const JEDA_POLLING_MS = 5000;

export default function PanelForumKelas({
  eventId,
  forumTopikId,
  kelasId,
  pesanAwal,
  poinAwal,
}: {
  eventId: string;
  forumTopikId: string;
  kelasId: string;
  pesanAwal: PesanForum[];
  poinAwal: BarisPoin[];
}) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), JEDA_POLLING_MS);
    return () => clearInterval(id);
  }, [router]);

  /**
   * Bonus dioptimistikkan SEGERA saat diklik, dikunci per id pesan —
   * bukan disimpan sebagai satu boolean global — supaya mengklik satu
   * bubble tidak ikut mengubah tampilan bubble lain sebelum
   * `router.refresh()` berikutnya datang membawa data server yang benar.
   */
  const [bonusLokal, setBonusLokal] = useState<Record<string, boolean>>({});
  const [pendingBonusId, setPendingBonusId] = useState<string | null>(null);
  const [, startTransitionBonus] = useTransition();

  const pesanTampil = pesanAwal.map((p) => ({
    ...p,
    bonusDiberikan: bonusLokal[p.id] ?? p.bonusDiberikan,
  }));

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [pesanTampil.length]);

  function klikBonus(pesan: PesanForum) {
    // Cermin constraint `forum_pesan_bonus_hanya_teks_siswa` (0020) di
    // sisi UI: bubble guru dan bubble sticker/emoticon tidak punya
    // affordance bonus sama sekali, jadi klik di situ tidak melakukan
    // apa-apa alih-alih mengirim permintaan yang pasti ditolak server.
    if (pesan.dari.tipe !== "siswa" || pesan.jenisIsi !== "teks") return;
    if (pendingBonusId === pesan.id) return; // sudah diproses, tunggu

    const keadaanSaatIni = bonusLokal[pesan.id] ?? pesan.bonusDiberikan;
    const bonusBaruOptimistik = !keadaanSaatIni;
    setBonusLokal((s) => ({ ...s, [pesan.id]: bonusBaruOptimistik }));
    setPendingBonusId(pesan.id);

    startTransitionBonus(async () => {
      const hasil = await toggleBonusPesan(eventId, kelasId, pesan.id);
      setPendingBonusId(null);
      if (hasil.bonusDiberikan !== null) {
        setBonusLokal((s) => ({ ...s, [pesan.id]: hasil.bonusDiberikan! }));
      } else {
        // Gagal -> kembalikan ke keadaan SEBELUM diklik. Tidak dibiarkan
        // menyala palsu hanya karena permintaannya gagal di jaringan.
        setBonusLokal((s) => ({ ...s, [pesan.id]: keadaanSaatIni }));
      }
      router.refresh();
    });
  }

  const action = kirimPesanGuru.bind(null, eventId, forumTopikId, kelasId);
  const [state, formAction] = useFormState(action, initialState);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* ── Kolom chat ── */}
      <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div
          ref={scrollRef}
          className="scroll-halus max-h-[520px] min-h-[320px] space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4"
        >
          {pesanTampil.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">
              Belum ada pesan di ruang ini.
            </p>
          ) : (
            pesanTampil.map((p) => (
              <Bubble
                key={p.id}
                pesan={p}
                sedangDiproses={pendingBonusId === p.id}
                onKlik={() => klikBonus(p)}
              />
            ))
          )}
        </div>

        <FormKirimGuru formAction={formAction} error={state.error} />
      </div>

      {/* ── Kolom poin ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
          Poin Keaktifan
        </h2>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          1 poin tiap chat teks yang dikirim siswa · +{POIN_BONUS_PER_KLIK}{" "}
          kalau kamu klik bubble pesannya. Sticker &amp; emoticon tidak
          dihitung.
        </p>
        <div className="scroll-halus max-h-[460px] space-y-1.5 overflow-y-auto pr-1">
          {poinAwal.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Belum ada siswa di kelas ini.
            </p>
          ) : (
            poinAwal.map((b, idx) => (
              <BarisPoinItem key={b.siswaId} baris={b} peringkat={idx + 1} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FormKirimGuru({
  formAction,
  error,
}: {
  formAction: (formData: FormData) => void;
  error: string | null;
}) {
  return (
    <div className="border-t border-slate-100 bg-white">
      <form action={formAction} className="flex items-end gap-2 p-3">
        <textarea
          name="isi"
          rows={1}
          required
          maxLength={2000}
          placeholder="Tulis pesan sebagai guru…"
          className="min-h-[42px] flex-1 resize-none rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/30 outline-none focus:border-gold"
        />
        <TombolKirim />
      </form>
      {error && (
        <p className="border-t border-danger/20 bg-danger/5 px-3.5 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function TombolKirim() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink-light disabled:opacity-50"
    >
      {pending ? (
        <i className="fas fa-circle-notch fa-spin" aria-hidden />
      ) : (
        <>
          <i className="fas fa-paper-plane mr-1.5" aria-hidden />
          Kirim
        </>
      )}
    </button>
  );
}

function formatJam(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Satu bubble chat.
 *
 * ── KENAPA BUBBLE GURU DAN SISWA DIBEDAKAN LEWAT `dari.tipe`, BUKAN
 *    `siswaId === null` LANGSUNG DI JSX ──
 *
 * Constraint `forum_pesan_satu_pengirim` (0020) menjamin persis satu dari
 * `siswa_id`/`guru_id` terisi, tapi men-derive-nya lewat objek `dari` yang
 * sudah disiapkan di Server Component membuat komponen ini tidak perlu
 * tahu bentuk mentah baris `forum_pesan` sama sekali — kalau suatu saat
 * ada jenis pengirim ketiga, cukup ubah pemetaannya di `page.tsx`.
 */
function Bubble({
  pesan,
  sedangDiproses,
  onKlik,
}: {
  pesan: PesanForum & { bonusDiberikan: boolean };
  sedangDiproses: boolean;
  onKlik: () => void;
}) {
  const dariGuru = pesan.dari.tipe === "guru";
  const bisaDiklik = !dariGuru && pesan.jenisIsi === "teks";
  const bukanTeks = pesan.jenisIsi !== "teks";

  return (
    <div className={`flex ${dariGuru ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] ${dariGuru ? "items-end" : "items-start"} flex flex-col`}>
        <p
          className={`mb-0.5 px-1 text-[0.68rem] font-semibold text-slate-500 ${
            dariGuru ? "text-right" : "text-left"
          }`}
        >
          {pesan.dari.nama}
          {dariGuru && <span className="ml-1 text-slate-400">· Guru</span>}
        </p>

        <button
          type="button"
          onClick={onKlik}
          disabled={!bisaDiklik}
          title={
            bisaDiklik
              ? pesan.bonusDiberikan
                ? `Klik untuk membatalkan bonus +${POIN_BONUS_PER_KLIK}`
                : `Klik untuk memberi bonus +${POIN_BONUS_PER_KLIK}`
              : undefined
          }
          className={`relative rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed shadow-sm transition-all ${
            dariGuru
              ? "rounded-tr-sm bg-[--primary] text-white"
              : bukanTeks
                ? "rounded-tl-sm border border-slate-200 bg-white text-2xl"
                : "rounded-tl-sm border border-slate-200 bg-white text-ink"
          } ${
            bisaDiklik
              ? `cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${
                  pesan.bonusDiberikan ? "ring-2 ring-amber-400" : ""
                }`
              : "cursor-default"
          } ${sedangDiproses ? "opacity-60" : ""}`}
        >
          {pesan.isi}

          {pesan.bonusDiberikan && (
            <span className="absolute -right-2 -top-2 flex items-center gap-0.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[0.62rem] font-bold text-amber-950 shadow">
              <i className="fas fa-star" aria-hidden />+{POIN_BONUS_PER_KLIK}
            </span>
          )}
        </button>

        <p className={`mt-0.5 px-1 text-[0.65rem] text-slate-400 ${dariGuru ? "text-right" : "text-left"}`}>
          {formatJam(pesan.createdAt)}
        </p>
      </div>
    </div>
  );
}

function BarisPoinItem({
  baris,
  peringkat,
}: {
  baris: BarisPoin;
  peringkat: number;
}) {
  const belumPernahBicara = baris.poinPesan === 0 && baris.poinBonus === 0;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
        belumPernahBicara ? "opacity-50" : ""
      }`}
    >
      <span className="w-5 shrink-0 text-right text-xs font-bold text-slate-400">
        {peringkat}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">
          {baris.nama}
        </span>
        <span className="block text-[0.68rem] text-slate-400">
          {baris.poinPesan} chat
          {baris.poinBonus > 0 && ` · +${baris.poinBonus} bonus`}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-700">
        {baris.total}
      </span>
    </div>
  );
}
