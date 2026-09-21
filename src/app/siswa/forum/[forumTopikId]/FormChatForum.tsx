"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { kirimPesanSiswa, type ActionState } from "../actions";
import { faseForum } from "@/lib/forum";
import { formatTenggat, formatSisaSingkat } from "@/lib/tugas";

export interface PesanForumSiswa {
  id: string;
  isi: string;
  jenisIsi: "teks" | "sticker" | "emoticon";
  createdAt: string;
  punyaSendiri: boolean;
  dari: { tipe: "guru" | "siswa"; nama: string };
}

const initialState: ActionState = { error: null };

/** Emoticon cepat — dikirim sebagai `jenis_isi: "emoticon"`, TIDAK
 *  dihitung poin (lihat trigger di 0020_forum.sql, hanya menyala untuk
 *  `jenis_isi = 'teks'`). */
const EMOTICON_CEPAT = ["👍", "😂", "❤️", "😮", "🙏", "🎉"];

/** Sticker cepat — sama-sama TIDAK dihitung poin, bedanya dari emoticon
 *  cuma di isinya: frasa pendek siap pakai, bukan satu simbol. */
const STICKER_CEPAT = [
  "🙋 Ada pertanyaan",
  "👌 Sudah paham",
  "🎉 Mantap!",
  "🤔 Masih bingung",
];

const JEDA_POLLING_MS = 6000;

export default function FormChatForum({
  forumTopikId,
  kelasId,
  dibukaAt,
  ditutupAt,
  pesanAwal,
  namaSiswa,
}: {
  forumTopikId: string;
  kelasId: string;
  dibukaAt: string;
  ditutupAt: string;
  pesanAwal: PesanForumSiswa[];
  namaSiswa: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), JEDA_POLLING_MS);
    return () => clearInterval(id);
  }, [router]);

  const [sekarang, setSekarang] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setSekarang(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const fase = faseForum({ dibuka_at: dibukaAt, ditutup_at: ditutupAt }, sekarang);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [pesanAwal.length]);

  const action = kirimPesanSiswa.bind(null, forumTopikId, kelasId);
  const [state, formAction] = useFormState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs">
        {fase === "belum_buka" && (
          <span className="text-amber-700">
            <i className="fas fa-hourglass-start mr-1.5" aria-hidden />
            Forum dibuka {formatTenggat(dibukaAt)}
          </span>
        )}
        {fase === "berlangsung" && (
          <span className="text-emerald-700">
            <i className="fas fa-circle-play mr-1.5" aria-hidden />
            Ditutup dalam {formatSisaSingkat(new Date(ditutupAt).getTime() - sekarang)}
          </span>
        )}
        {fase === "ditutup" && (
          <span className="text-slate-500">
            <i className="fas fa-lock mr-1.5" aria-hidden />
            Forum sudah ditutup — kamu masih bisa membaca, tidak bisa
            mengirim pesan baru.
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="scroll-halus max-h-[60vh] min-h-[280px] space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4"
      >
        {pesanAwal.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">
            Belum ada obrolan. Jadilah yang pertama menyapa!
          </p>
        ) : (
          pesanAwal.map((p) => <Bubble key={p.id} pesan={p} />)
        )}
      </div>

      {fase === "belum_buka" && (
        <p className="border-t border-slate-100 px-4 py-3 text-center text-sm text-slate-400">
          Belum bisa mengirim pesan — forum belum dibuka.
        </p>
      )}

      {fase === "ditutup" && (
        <p className="border-t border-slate-100 px-4 py-3 text-center text-sm text-slate-400">
          Forum sudah ditutup. Kirim pesan tidak bisa lagi.
        </p>
      )}

      {fase === "berlangsung" && (
        <div className="border-t border-slate-100 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {EMOTICON_CEPAT.map((e) => (
              <TombolCepat
                key={e}
                isi={e}
                jenisIsi="emoticon"
                action={formAction}
                besar
              />
            ))}
          </div>
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {STICKER_CEPAT.map((s) => (
              <TombolCepat key={s} isi={s} jenisIsi="sticker" action={formAction} />
            ))}
          </div>
          <p className="mb-2 text-[0.68rem] text-slate-400">
            Sticker &amp; emoticon di atas cuma buat menyapa cepat — tidak
            dihitung poin. Ketik pesan sendiri untuk dapat{" "}
            <strong className="text-slate-500">1 poin keaktifan</strong>{" "}
            tiap kali mengirim.
          </p>

          <form
            ref={formRef}
            action={(fd: FormData) => {
              formAction(fd);
              formRef.current?.reset();
            }}
            className="flex items-end gap-2"
          >
            <input type="hidden" name="jenis_isi" value="teks" />
            <textarea
              name="isi"
              rows={1}
              required
              maxLength={2000}
              placeholder={`Tulis pesan sebagai ${namaSiswa}…`}
              className="min-h-[42px] flex-1 resize-none rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/30 outline-none focus:border-gold"
            />
            <TombolKirim />
          </form>
        </div>
      )}

      {state.error && (
        <p className="border-t border-danger/20 bg-danger/5 px-3.5 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}

function TombolCepat({
  isi,
  jenisIsi,
  action,
  besar,
}: {
  isi: string;
  jenisIsi: "sticker" | "emoticon";
  action: (formData: FormData) => void;
  besar?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="isi" value={isi} />
      <input type="hidden" name="jenis_isi" value={jenisIsi} />
      <button
        type="submit"
        className={`rounded-full border border-slate-200 bg-white px-3 py-1.5 transition-colors hover:border-gold hover:bg-gold/5 ${
          besar ? "text-lg" : "text-xs font-medium text-slate-600"
        }`}
      >
        {isi}
      </button>
    </form>
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

function Bubble({ pesan }: { pesan: PesanForumSiswa }) {
  const dariGuru = pesan.dari.tipe === "guru";
  // Milik sendiri ditaruh di kanan (pola chat pada umumnya), guru selalu
  // ditaruh di kiri supaya konsisten terlihat sebagai "yang lain",
  // termasuk kalau siswa membaca ulang pesannya sendiri.
  const diKanan = pesan.punyaSendiri && !dariGuru;
  const bukanTeks = pesan.jenisIsi !== "teks";

  return (
    <div className={`flex ${diKanan ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] ${diKanan ? "items-end" : "items-start"} flex flex-col`}>
        {!diKanan && (
          <p className="mb-0.5 px-1 text-[0.68rem] font-semibold text-slate-500">
            {pesan.dari.nama}
            {dariGuru && <span className="ml-1 text-slate-400">· Guru</span>}
          </p>
        )}

        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
            diKanan
              ? "rounded-tr-sm bg-[--primary] text-white"
              : dariGuru
                ? "rounded-tl-sm bg-amber-50 text-ink"
                : bukanTeks
                  ? "rounded-tl-sm border border-slate-200 bg-white text-2xl"
                  : "rounded-tl-sm border border-slate-200 bg-white text-ink"
          }`}
        >
          {pesan.isi}
        </div>

        <p className={`mt-0.5 px-1 text-[0.65rem] text-slate-400 ${diKanan ? "text-right" : "text-left"}`}>
          {formatJam(pesan.createdAt)}
        </p>
      </div>
    </div>
  );
}
