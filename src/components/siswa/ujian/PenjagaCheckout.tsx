"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EVENT_CEK_CHECKOUT, jamWib } from "@/lib/checkout";
import { formatSisaWaktu } from "@/lib/ujian";

interface ItemCheckout {
  mapel_id: string;
  mapel_nama: string;
  buka_at: string;
  tutup_at: string;
  sudah_kumpul: boolean;
  server_now: string;
}

/** Dibuat acak dengan alasan yang sama seperti jeda ping ujian: 600 siswa
 *  tidak boleh bertanya ke server di detik yang sama. */
function jedaCekMs(): number {
  return 150_000 + Math.floor(Math.random() * 60_000);
}

/**
 * Jendela checkout, dipasang di layout /siswa (bukan di ExamClient) supaya
 * muncul di mana pun siswa berada: siswa yang sudah mengumpulkan lebih awal
 * ada di dashboard, siswa yang login ulang setelah restart HP juga di sana.
 *
 * Daftar diambil jarang (lihat `jedaCekMs`) dan jendela dibuka oleh jam
 * lokal yang sudah dikoreksi `server_now`, jadi jendela tetap buka tepat
 * waktu tanpa polling rapat dan walau sinyal sedang putus.
 *
 * Jendelanya sengaja tidak punya tombol tutup: siswa hanya bisa keluar dengan
 * checkout, atau jendela hilang sendiri saat jadwal mapel berakhir.
 */
export default function PenjagaCheckout() {
  const pathname = usePathname();
  const [daftar, setDaftar] = useState<ItemCheckout[]>([]);
  const [sekarangMs, setSekarangMs] = useState(0);
  const [berhasil, setBerhasil] = useState<ItemCheckout | null>(null);
  const offsetMsRef = useRef(0);

  const muat = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_checkout_siswa");
    // Gagal (sinyal putus, migrasi 0024 belum jalan): daftar lama dibiarkan.
    if (error) return;
    const baris = (data ?? []) as ItemCheckout[];
    if (baris[0]) {
      offsetMsRef.current =
        new Date(baris[0].server_now).getTime() - Date.now();
    }
    setDaftar(baris);
  }, []);

  useEffect(() => {
    void muat();
  }, [muat, pathname]);

  useEffect(() => {
    const cekSaatTerlihat = () => {
      if (document.visibilityState === "visible") void muat();
    };
    const cekSekarang = () => void muat();
    document.addEventListener("visibilitychange", cekSaatTerlihat);
    window.addEventListener(EVENT_CEK_CHECKOUT, cekSekarang);
    const id = setInterval(cekSaatTerlihat, jedaCekMs());
    return () => {
      document.removeEventListener("visibilitychange", cekSaatTerlihat);
      window.removeEventListener(EVENT_CEK_CHECKOUT, cekSekarang);
      clearInterval(id);
    };
  }, [muat]);

  const adaDaftar = daftar.length > 0;
  useEffect(() => {
    if (!adaDaftar) return;
    const detik = () => setSekarangMs(Date.now() + offsetMsRef.current);
    detik();
    const id = setInterval(detik, 1000);
    return () => clearInterval(id);
  }, [adaDaftar]);

  if (berhasil) {
    return (
      <KartuBerhasil item={berhasil} onTutup={() => setBerhasil(null)} />
    );
  }
  if (sekarangMs === 0) return null;

  const masihBerlaku = daftar.filter(
    (d) => sekarangMs < new Date(d.tutup_at).getTime()
  );
  const terbuka = masihBerlaku.find(
    (d) => sekarangMs >= new Date(d.buka_at).getTime()
  );

  if (terbuka) {
    return (
      <JendelaCheckout
        key={terbuka.mapel_id}
        item={terbuka}
        sisaMs={new Date(terbuka.tutup_at).getTime() - sekarangMs}
        onSelesai={() => {
          setDaftar((d) => d.filter((x) => x.mapel_id !== terbuka.mapel_id));
          setBerhasil(terbuka);
        }}
        onBatal={() =>
          setDaftar((d) => d.filter((x) => x.mapel_id !== terbuka.mapel_id))
        }
      />
    );
  }

  const menunggu = masihBerlaku.find((d) => d.sudah_kumpul);
  return menunggu ? (
    <PitaTunggu
      item={menunggu}
      sisaMs={new Date(menunggu.buka_at).getTime() - sekarangMs}
    />
  ) : null;
}

/** Siswa yang mengumpulkan lebih awal diberi tahu untuk tidak pergi dulu. */
function PitaTunggu({ item, sisaMs }: { item: ItemCheckout; sisaMs: number }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t-4 border-gold bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.15)]">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-lg font-black text-danger">JANGAN KELUAR DULU</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">
          Tetap buka halaman ini. Jam{" "}
          <strong>{jamWib(item.buka_at)}</strong> kamu harus menekan tombol{" "}
          <strong>CHECKOUT</strong> untuk ujian{" "}
          <strong>{item.mapel_nama}</strong>.
        </p>
        <p className="mt-1 text-sm font-bold tabular-nums text-gold-dark">
          Tunggu {formatSisaWaktu(sisaMs)} lagi
        </p>
      </div>
    </div>
  );
}

function JendelaCheckout({
  item,
  sisaMs,
  onSelesai,
  onBatal,
}: {
  item: ItemCheckout;
  sisaMs: number;
  onSelesai: () => void;
  onBatal: () => void;
}) {
  const [jawaban, setJawaban] = useState<boolean | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function kirim() {
    if (jawaban === null || mengirim) return;
    setMengirim(true);
    setGalat(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("checkout_ujian_siswa", {
      p_mapel_id: item.mapel_id,
      p_masih_di_ruang: jawaban,
    });
    setMengirim(false);

    if (!error) {
      onSelesai();
      return;
    }
    if (error.message.includes("sudah habis")) {
      onBatal();
      return;
    }
    setGalat("Gagal terkirim. Periksa sinyal, lalu tekan CHECKOUT lagi.");
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-ink/80 p-3">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="judul-checkout"
        className="my-auto w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="bg-danger px-5 py-4 text-center text-white">
          <h2 id="judul-checkout" className="text-2xl font-black tracking-wide">
            WAKTUNYA CHECKOUT
          </h2>
          <p className="mt-1 text-base font-semibold">
            Ujian {item.mapel_nama} selesai jam {jamWib(item.tutup_at)}
          </p>
          <p className="mt-1 text-sm font-bold tabular-nums">
            Sisa waktu checkout: {formatSisaWaktu(sisaMs)}
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <p className="mb-1 text-sm font-bold text-teal">LANGKAH 1</p>
            <p className="mb-3 text-lg font-bold leading-snug text-ink">
              Apakah kamu masih ada di ruang ujian?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <TombolJawab
                label="YA"
                ikon="fa-check"
                dipilih={jawaban === true}
                onPilih={() => setJawaban(true)}
              />
              <TombolJawab
                label="TIDAK"
                ikon="fa-xmark"
                dipilih={jawaban === false}
                onPilih={() => setJawaban(false)}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-teal">LANGKAH 2</p>
            {jawaban === null ? (
              <div className="flex h-16 w-full items-center justify-center rounded-xl bg-ink/5 px-3 text-center text-base font-semibold text-ink/50">
                Pilih YA atau TIDAK dulu
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void kirim()}
                disabled={mengirim}
                className="animasi-muncul h-16 w-full rounded-xl bg-ok text-xl font-black text-white shadow-sm transition-colors active:bg-ok/90 disabled:opacity-60 touch-manipulation"
              >
                {mengirim ? "Mengirim…" : "CHECKOUT"}
              </button>
            )}
            {galat && (
              <p className="mt-2 text-sm font-semibold text-danger">{galat}</p>
            )}
          </div>

          <p className="rounded-lg bg-paper-dark p-3 text-sm leading-relaxed text-ink/80">
            {item.sudah_kumpul ? (
              <>Jawabanmu sudah terkumpul. Tinggal tekan CHECKOUT.</>
            ) : (
              <>
                CHECKOUT <strong>bukan</strong> mengumpulkan jawaban. Setelah
                ini kamu bisa lanjut mengerjakan soal.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function TombolJawab({
  label,
  ikon,
  dipilih,
  onPilih,
}: {
  label: string;
  ikon: string;
  dipilih: boolean;
  onPilih: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPilih}
      aria-pressed={dipilih}
      className={`flex h-16 items-center justify-center gap-2 rounded-xl border-2 text-xl font-black transition-colors touch-manipulation ${
        dipilih
          ? "border-ink bg-ink text-paper"
          : "border-ink/20 bg-white text-ink active:bg-ink/5"
      }`}
    >
      <i className={`fas ${ikon}`} aria-hidden />
      {label}
    </button>
  );
}

function KartuBerhasil({
  item,
  onTutup,
}: {
  item: ItemCheckout;
  onTutup: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/80 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="judul-checkout-berhasil"
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
      >
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-ok/15">
          <i className="fas fa-check text-3xl text-ok" aria-hidden />
        </div>
        <h2
          id="judul-checkout-berhasil"
          className="mb-2 text-2xl font-black text-ink"
        >
          CHECKOUT BERHASIL
        </h2>
        <p className="mb-5 text-base leading-relaxed text-ink/80">
          {item.sudah_kumpul
            ? `Checkout ujian ${item.mapel_nama} sudah tercatat.`
            : "Kalau masih ada waktu, lanjutkan soalmu lalu tekan Kumpulkan."}
        </p>
        <button
          type="button"
          onClick={onTutup}
          autoFocus
          className="h-14 w-full rounded-xl bg-ink text-lg font-bold text-paper transition-colors active:bg-ink-light touch-manipulation"
        >
          OK
        </button>
      </div>
    </div>
  );
}
