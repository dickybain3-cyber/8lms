"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { kirimPesanSiswa, type ActionState } from "../actions";
import { faseForum, ISI_FOTO_TANPA_CAPTION } from "@/lib/forum";
import { formatTenggat, formatSisaSingkat } from "@/lib/tugas";
import {
  ACCEPT_GAMBAR_CHAT,
  prosesDanUnggahGambarChat,
  gambarDariClipboard,
} from "@/lib/unggah-gambar";
import { KutipanDiBubble, type PesanKutipan } from "@/components/forum/KutipanBalas";
import { LencanaReaksi, type KelompokReaksi } from "@/components/forum/ReaksiPesan";

export interface PesanForumSiswa {
  id: string;
  isi: string;
  jenisIsi: "teks" | "sticker" | "emoticon" | "gambar";
  gambarUrl: string | null;
  createdAt: string;
  punyaSendiri: boolean;
  dari: { tipe: "guru" | "siswa"; nama: string };
  /** Pesan yang dikutip pesan ini (gestur geser-kanan guru), kalau ada.
   *  Siswa tidak punya gestur untuk MEMBUAT balasan (itu khusus guru,
   *  lihat PanelForumKelas), tapi tetap perlu MELIHAT kutipannya kalau
   *  guru membalas pesan di ruang ini — tanpa ini, pesan guru yang
   *  membalas terlihat seperti pesan biasa yang lepas konteks. */
  balasKe: PesanKutipan | null;
  /** Reaksi emoji guru pada pesan ini — tampil-saja di sisi siswa (lihat
   *  RLS forum_reaksi_select_siswa di 0021: siswa BOLEH baca, siswa
   *  TIDAK BOLEH memberi reaksi, jadi tidak ada <PemilihReaksi> di sini). */
  reaksi: KelompokReaksi[];
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

type StatusFoto = "kosong" | "mengompres" | "siap" | "gagal";

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

  // ── Lightbox: dipakai bareng oleh semua bubble bergambar ──
  const [fotoDilihat, setFotoDilihat] = useState<string | null>(null);

  // ── Unggah foto ──
  //
  // `fotoPreview.url` = object URL LOKAL (createObjectURL), dipakai untuk
  // pratinjau instan sebelum unggahan Cloudinary selesai — siswa tidak
  // perlu menunggu jaringan untuk melihat foto yang baru saja dipilih.
  // `fotoUrlAwan` baru terisi setelah `prosesDanUnggahGambarChat` (yang
  // di dalamnya memanggil `kecilkanGambarChat`, lihat unggah-gambar.ts)
  // selesai, dan itulah yang dikirim sebagai `gambar_url` ke Server Action
  // — bukan `fotoPreview.url`, yang cuma valid di peramban ini sendiri.
  const [fotoPreview, setFotoPreview] = useState<{ url: string } | null>(null);
  const [statusFoto, setStatusFoto] = useState<StatusFoto>("kosong");
  const [fotoUrlAwan, setFotoUrlAwan] = useState<string | null>(null);
  const [infoFoto, setInfoFoto] = useState<string | null>(null);
  const [galatFoto, setGalatFoto] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  function bersihkanFoto() {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview.url);
    setFotoPreview(null);
    setStatusFoto("kosong");
    setFotoUrlAwan(null);
    setInfoFoto(null);
    setGalatFoto(null);
    if (inputFotoRef.current) inputFotoRef.current.value = "";
  }

  async function prosesFoto(file: File) {
    bersihkanFoto();
    const urlLokal = URL.createObjectURL(file);
    setFotoPreview({ url: urlLokal });
    setStatusFoto("mengompres");
    try {
      const hasil = await prosesDanUnggahGambarChat(file);
      setFotoUrlAwan(hasil.url);
      setInfoFoto(hasil.info);
      setStatusFoto("siap");
    } catch (err) {
      setGalatFoto(err instanceof Error ? err.message : "Gagal memproses foto.");
      setStatusFoto("gagal");
    }
  }

  const action = kirimPesanSiswa.bind(null, forumTopikId, kelasId);
  const [state, formAction] = useFormState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const sedangKirimFoto = fotoPreview !== null;
  // Selama foto masih dikompres/gagal, tombol kirim dikunci — mengirim
  // `jenis_isi: "gambar"` tanpa `gambar_url` yang sah cuma akan ditolak
  // Server Action dengan pesan yang membingungkan untuk kasus ini
  // ("foto belum selesai diunggah"), lebih baik dicegah di sini dulu.
  const bolehKirim = !sedangKirimFoto || statusFoto === "siap";

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
          pesanAwal.map((p) => (
            <Bubble key={p.id} pesan={p} onLihatFoto={setFotoDilihat} />
          ))
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
            tiap kali mengirim. Foto juga tidak dihitung poin.
          </p>

          {fotoPreview && (
            <div className="mb-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <img
                src={fotoPreview.url}
                alt="Pratinjau foto yang akan dikirim"
                className="h-14 w-14 shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1 text-xs">
                {statusFoto === "mengompres" && (
                  <p className="text-slate-500">
                    <i className="fas fa-circle-notch fa-spin mr-1" aria-hidden />
                    Mengecilkan foto…
                  </p>
                )}
                {statusFoto === "siap" && (
                  <p className="text-emerald-700">
                    <i className="fas fa-check mr-1" aria-hidden />
                    Siap dikirim{infoFoto ? ` · ${infoFoto}` : ""}
                  </p>
                )}
                {statusFoto === "gagal" && (
                  <p className="text-danger">{galatFoto ?? "Gagal memproses foto."}</p>
                )}
              </div>
              <button
                type="button"
                onClick={bersihkanFoto}
                aria-label="Batalkan foto"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200"
              >
                <i className="fas fa-xmark" aria-hidden />
              </button>
            </div>
          )}

          <form
            ref={formRef}
            action={(fd: FormData) => {
              formAction(fd);
              formRef.current?.reset();
              bersihkanFoto();
            }}
            className="flex items-end gap-2"
          >
            <input
              type="hidden"
              name="jenis_isi"
              value={sedangKirimFoto ? "gambar" : "teks"}
            />
            <input type="hidden" name="gambar_url" value={fotoUrlAwan ?? ""} />

            <input
              ref={inputFotoRef}
              type="file"
              accept={ACCEPT_GAMBAR_CHAT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) prosesFoto(file);
              }}
            />
            <button
              type="button"
              onClick={() => inputFotoRef.current?.click()}
              disabled={sedangKirimFoto}
              aria-label="Kirim foto"
              title="Kirim foto"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md border border-ink/15 text-ink/60 transition-colors hover:border-gold hover:text-gold disabled:opacity-40"
            >
              <i className="fas fa-camera" aria-hidden />
            </button>

            <textarea
              name="isi"
              rows={1}
              required={!sedangKirimFoto}
              maxLength={2000}
              placeholder={
                sedangKirimFoto
                  ? "Tambahkan keterangan (opsional)…"
                  : `Tulis pesan sebagai ${namaSiswa}…`
              }
              onPaste={(e) => {
                const file = gambarDariClipboard(e.clipboardData);
                if (file) {
                  e.preventDefault();
                  prosesFoto(file);
                }
              }}
              className="min-h-[42px] flex-1 resize-none rounded-md border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/30 outline-none focus:border-gold"
            />
            <TombolKirim disabled={!bolehKirim} />
          </form>
        </div>
      )}

      {state.error && (
        <p className="border-t border-danger/20 bg-danger/5 px-3.5 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <Lightbox url={fotoDilihat} onClose={() => setFotoDilihat(null)} />
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

function TombolKirim({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
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

function Bubble({
  pesan,
  onLihatFoto,
}: {
  pesan: PesanForumSiswa;
  onLihatFoto: (url: string) => void;
}) {
  const dariGuru = pesan.dari.tipe === "guru";
  // Milik sendiri ditaruh di kanan (pola chat pada umumnya), guru selalu
  // ditaruh di kiri supaya konsisten terlihat sebagai "yang lain",
  // termasuk kalau siswa membaca ulang pesannya sendiri.
  const diKanan = pesan.punyaSendiri && !dariGuru;
  const isiBesar = pesan.jenisIsi === "sticker" || pesan.jenisIsi === "emoticon";
  const adaCaption =
    pesan.jenisIsi === "gambar" && pesan.isi.trim() !== ISI_FOTO_TANPA_CAPTION;

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
          className={`rounded-2xl text-sm leading-relaxed shadow-sm ${
            pesan.jenisIsi === "gambar" ? "overflow-hidden p-1.5" : "px-4 py-2.5"
          } ${
            diKanan
              ? "rounded-tr-sm bg-[--primary] text-white"
              : dariGuru
                ? "rounded-tl-sm bg-amber-50 text-ink"
                : isiBesar
                  ? "rounded-tl-sm border border-slate-200 bg-white text-2xl"
                  : "rounded-tl-sm border border-slate-200 bg-white text-ink"
          }`}
        >
          {pesan.balasKe && (
            <div className={pesan.jenisIsi === "gambar" ? "px-1 pt-0.5" : ""}>
              <KutipanDiBubble pesan={pesan.balasKe} />
            </div>
          )}

          {pesan.jenisIsi === "gambar" && pesan.gambarUrl ? (
            <>
              <button
                type="button"
                onClick={() => onLihatFoto(pesan.gambarUrl as string)}
                className="block w-full"
              >
                <img
                  src={pesan.gambarUrl}
                  alt={adaCaption ? pesan.isi : "Foto dari forum"}
                  loading="lazy"
                  className="max-h-72 w-full rounded-xl object-cover"
                />
              </button>
              {adaCaption && (
                <p
                  className={`px-2 pb-1 pt-1.5 text-sm ${
                    diKanan ? "text-white" : "text-ink"
                  }`}
                >
                  {pesan.isi}
                </p>
              )}
            </>
          ) : (
            pesan.isi
          )}
        </div>

        <LencanaReaksi kelompok={pesan.reaksi} />

        <p className={`mt-0.5 px-1 text-[0.65rem] text-slate-400 ${diKanan ? "text-right" : "text-left"}`}>
          {formatJam(pesan.createdAt)}
        </p>
      </div>
    </div>
  );
}

/** Lightbox sederhana: latar gelap penuh layar + foto ukuran penuh, tutup
 *  dengan klik latar, tombol X, atau Escape. */
function Lightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!url) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <i className="fas fa-xmark text-lg" aria-hidden />
      </button>
      <img
        src={url}
        alt="Foto ukuran penuh"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-full rounded-lg object-contain"
      />
    </div>
  );
}
