"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acakUlangToken,
  buatPaket,
  buatSubtes,
  buatTryout,
  hapusPaket,
  hapusSubtes,
  hapusTryout,
  resetSubtesSiswa,
  ubahPaket,
  ubahSubtes,
  ubahTryout,
  type StatusAksi,
} from "@/app/admin/tryout/actions";
import { SUBTES_BAWAAN } from "@/lib/tryout";
import { TOMBOL_BIASA, TOMBOL_UTAMA } from "@/components/ui/Panel";

const AWAL: StatusAksi = { error: null };
const INPUT =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-navy-500";
const LABEL = "mb-1.5 block text-sm font-medium text-slate-600";

function Pesan({ s }: { s: StatusAksi }) {
  if (s.error)
    return <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{s.error}</p>;
  if (s.sukses)
    return <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{s.sukses}</p>;
  return null;
}

// ---------------------------------------------------------------------------
// Kegiatan
// ---------------------------------------------------------------------------

export function FormTryout({
  awal,
  eventId,
}: {
  awal?: { nama: string; tgl_mulai: string; tgl_selesai: string };
  eventId?: string;
}) {
  const aksi = eventId ? ubahTryout.bind(null, eventId) : buatTryout;
  const [s, kirim, sibuk] = useActionState(aksi, AWAL);
  return (
    <form action={kirim} className="space-y-4">
      <div>
        <label htmlFor="nama" className={LABEL}>Nama tryout</label>
        <input id="nama" name="nama" required defaultValue={awal?.nama} placeholder="mis. Tryout TKA Semester Ganjil 2026" className={INPUT} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="tgl_mulai" className={LABEL}>Tanggal mulai</label>
          <input id="tgl_mulai" name="tgl_mulai" type="date" required defaultValue={awal?.tgl_mulai} className={INPUT} />
        </div>
        <div>
          <label htmlFor="tgl_selesai" className={LABEL}>Tanggal selesai</label>
          <input id="tgl_selesai" name="tgl_selesai" type="date" required defaultValue={awal?.tgl_selesai} className={INPUT} />
        </div>
      </div>
      <p className="text-xs text-slate-500">Peserta: seluruh siswa kelas 9.1–9.6. Jam pengerjaan diatur per paket.</p>
      <Pesan s={s} />
      <button type="submit" disabled={sibuk} className={TOMBOL_UTAMA}>
        {sibuk ? "Menyimpan…" : eventId ? "Simpan" : "Buat Tryout"}
      </button>
    </form>
  );
}

export function TombolHapusTryout({ eventId, nama }: { eventId: string; nama: string }) {
  return (
    <TombolKonfirmasi
      label="Hapus Tryout"
      pesan={`Hapus "${nama}" beserta SEMUA paket, soal, jawaban, dan nilai di dalamnya? Tidak bisa dibatalkan.`}
      aksi={() => hapusTryout(eventId)}
      bahaya
    />
  );
}

// ---------------------------------------------------------------------------
// Paket
// ---------------------------------------------------------------------------

export function FormPaket({
  eventId,
  paket,
  saranNama,
}: {
  eventId: string;
  paket?: {
    id: string;
    nama: string;
    token: string;
    waktu_mulai_lokal: string;
    waktu_selesai_lokal: string;
    aktif: boolean;
  };
  saranNama?: string;
}) {
  const aksi = paket ? ubahPaket.bind(null, eventId, paket.id) : buatPaket.bind(null, eventId);
  const [s, kirim, sibuk] = useActionState(aksi, AWAL);
  return (
    <form action={kirim} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
        <div>
          <label htmlFor="nama-paket" className={LABEL}>Nama paket</label>
          <input id="nama-paket" name="nama" required defaultValue={paket?.nama ?? saranNama} className={INPUT} />
        </div>
        <div>
          <label htmlFor="token" className={LABEL}>Token</label>
          <input
            id="token"
            name="token"
            defaultValue={paket?.token}
            required={!!paket}
            placeholder="kosong = otomatis"
            maxLength={12}
            className={`${INPUT} font-mono uppercase tracking-widest`}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="waktu_mulai" className={LABEL}>Dibuka (WIB)</label>
          <input id="waktu_mulai" name="waktu_mulai" type="datetime-local" required defaultValue={paket?.waktu_mulai_lokal} className={INPUT} />
        </div>
        <div>
          <label htmlFor="waktu_selesai" className={LABEL}>Ditutup (WIB)</label>
          <input id="waktu_selesai" name="waktu_selesai" type="datetime-local" required defaultValue={paket?.waktu_selesai_lokal} className={INPUT} />
        </div>
      </div>
      {paket ? (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="aktif" defaultChecked={paket.aktif} className="accent-navy-700" />
          Aktif (token bisa dipakai)
        </label>
      ) : (
        <fieldset>
          <legend className={LABEL}>Langsung buat subtes</legend>
          <div className="flex flex-wrap gap-3">
            {SUBTES_BAWAAN.map((b) => (
              <label key={b.kode} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-ink">
                <input type="checkbox" name="subtes_bawaan" value={b.kode} defaultChecked className="accent-navy-700" />
                {b.nama} ({b.durasi} menit)
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Durasi dan subtes lain bisa diatur di halaman paket.</p>
        </fieldset>
      )}
      <p className="text-xs text-slate-500">
        Siswa bisa masuk selama paket dibuka. Waktu pengerjaan dihitung per subtes sejak siswa menekan Mulai.
      </p>
      <Pesan s={s} />
      <button type="submit" disabled={sibuk} className={TOMBOL_UTAMA}>
        {sibuk ? "Menyimpan…" : paket ? "Simpan Paket" : "Buat Paket"}
      </button>
    </form>
  );
}

export function TombolAcakToken({ eventId, paketId }: { eventId: string; paketId: string }) {
  const [s, setS] = useState<StatusAksi>(AWAL);
  const [sibuk, mulai] = useTransition();
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={sibuk}
        onClick={() =>
          confirm("Buat token baru? Token lama langsung tidak berlaku (siswa yang sudah masuk tidak terganggu).") &&
          mulai(async () => setS(await acakUlangToken(eventId, paketId)))
        }
        className={TOMBOL_BIASA}
      >
        <i className="fas fa-arrows-rotate" aria-hidden />
        Token Baru
      </button>
      {s.error && <span className="text-xs text-red-600">{s.error}</span>}
    </span>
  );
}

export function TombolHapusPaket({ eventId, paketId, nama }: { eventId: string; paketId: string; nama: string }) {
  return (
    <TombolKonfirmasi
      label="Hapus Paket"
      pesan={`Hapus "${nama}" beserta semua subtes, soal, jawaban, dan nilainya? Tidak bisa dibatalkan.`}
      aksi={() => hapusPaket(eventId, paketId)}
      bahaya
    />
  );
}

// ---------------------------------------------------------------------------
// Subtes
// ---------------------------------------------------------------------------

export function FormSubtesBaru({ eventId, paketId, sudahAda }: { eventId: string; paketId: string; sudahAda: string[] }) {
  const [s, kirim, sibuk] = useActionState(buatSubtes.bind(null, eventId, paketId), AWAL);
  const tersedia = SUBTES_BAWAAN.filter((b) => !sudahAda.includes(b.kode));
  const [pilihan, setPilihan] = useState(tersedia[0]?.kode ?? "lainnya");
  const bawaan = SUBTES_BAWAAN.find((b) => b.kode === pilihan);
  return (
    <form action={kirim} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr_8rem]">
        <div>
          <label htmlFor="pilihan" className={LABEL}>Subtes</label>
          <select id="pilihan" name="pilihan" value={pilihan} onChange={(e) => setPilihan(e.target.value)} className={INPUT}>
            {tersedia.map((b) => (
              <option key={b.kode} value={b.kode}>{b.nama}</option>
            ))}
            <option value="lainnya">Lainnya…</option>
          </select>
        </div>
        <div>
          <label htmlFor="nama-subtes" className={LABEL}>Nama tampil</label>
          <input
            key={pilihan}
            id="nama-subtes"
            name="nama"
            required={!bawaan}
            defaultValue={bawaan?.nama ?? ""}
            placeholder="mis. Bahasa Inggris"
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="durasi" className={LABEL}>Durasi (menit)</label>
          <input key={`d-${pilihan}`} id="durasi" name="durasi_menit" type="number" min={1} max={600} required defaultValue={bawaan?.durasi ?? 60} className={INPUT} />
        </div>
      </div>
      <Pesan s={s} />
      <button type="submit" disabled={sibuk} className={TOMBOL_UTAMA}>
        <i className="fas fa-plus" aria-hidden />
        {sibuk ? "Menambah…" : "Tambah Subtes"}
      </button>
    </form>
  );
}

export function EditSubtesInline({
  eventId,
  paketId,
  mapelId,
  nama,
  durasi,
  adaPeserta,
}: {
  eventId: string;
  paketId: string;
  mapelId: string;
  nama: string;
  durasi: number;
  adaPeserta: boolean;
}) {
  const [buka, setBuka] = useState(false);
  const [s, kirim, sibuk] = useActionState(ubahSubtes.bind(null, eventId, paketId, mapelId), AWAL);
  const [sibukHapus, mulai] = useTransition();
  const router = useRouter();
  if (!buka) {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setBuka(true)} className={TOMBOL_BIASA}>
          <i className="fas fa-pen" aria-hidden />
          Ubah
        </button>
        <button
          type="button"
          disabled={sibukHapus}
          onClick={() =>
            confirm(
              `Hapus subtes "${nama}"?${adaPeserta ? " Sudah ada siswa yang mengerjakan — jawaban & nilainya ikut terhapus." : ""}`
            ) &&
            mulai(async () => {
              const h = await hapusSubtes(eventId, paketId, mapelId);
              if (h.error) alert(h.error);
              router.refresh();
            })
          }
          className={`${TOMBOL_BIASA} text-red-600`}
        >
          <i className="fas fa-trash" aria-hidden />
          Hapus
        </button>
      </div>
    );
  }
  return (
    <form action={kirim} className="mt-2 grid w-full grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem_auto_auto]">
      <input name="nama" defaultValue={nama} required className={INPUT} aria-label="Nama subtes" />
      <input name="durasi_menit" type="number" min={1} max={600} defaultValue={durasi} required className={INPUT} aria-label="Durasi menit" />
      <button type="submit" disabled={sibuk} className={TOMBOL_UTAMA}>Simpan</button>
      <button type="button" onClick={() => setBuka(false)} className={TOMBOL_BIASA}>Tutup</button>
      <div className="sm:col-span-4">
        <Pesan s={s} />
      </div>
    </form>
  );
}

export function TombolResetSubtes({
  eventId,
  mapelId,
  siswaId,
  label,
}: {
  eventId: string;
  mapelId: string;
  siswaId: string;
  label: string;
}) {
  const router = useRouter();
  const [sibuk, mulai] = useTransition();
  return (
    <button
      type="button"
      disabled={sibuk}
      onClick={() =>
        confirm(`Reset ${label}? Jawaban dan nilainya dihapus, siswa bisa mengerjakan ulang dari awal.`) &&
        mulai(async () => {
          const h = await resetSubtesSiswa(eventId, mapelId, siswaId);
          if (h.error) alert(h.error);
          router.refresh();
        })
      }
      className="text-xs font-semibold text-red-600 underline disabled:opacity-50"
    >
      Reset
    </button>
  );
}

// ---------------------------------------------------------------------------
// Umum
// ---------------------------------------------------------------------------

function TombolKonfirmasi({
  label,
  pesan,
  aksi,
  bahaya,
}: {
  label: string;
  pesan: string;
  aksi: () => Promise<StatusAksi>;
  bahaya?: boolean;
}) {
  const [sibuk, mulai] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={sibuk}
        onClick={() =>
          confirm(pesan) &&
          mulai(async () => {
            const h = await aksi();
            if (h?.error) setErr(h.error);
          })
        }
        className={`${TOMBOL_BIASA} ${bahaya ? "text-red-600" : ""}`}
      >
        <i className="fas fa-trash" aria-hidden />
        {sibuk ? "Menghapus…" : label}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}

export function SalinTeks({ teks, label }: { teks: string; label: string }) {
  const [tersalin, setTersalin] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(teks);
          setTersalin(true);
          setTimeout(() => setTersalin(false), 1500);
        } catch {
          prompt("Salin manual:", teks);
        }
      }}
      className={TOMBOL_BIASA}
    >
      <i className={`fas ${tersalin ? "fa-check" : "fa-copy"}`} aria-hidden />
      {tersalin ? "Tersalin" : label}
    </button>
  );
}
