"use client";

import { useEffect, useMemo, useState } from "react";
import { TIPE_LABEL, TIPE_SOAL_LIST, ringkasanKonten } from "@/lib/soal";
import type { TipeSoal, SoalSiswa } from "@/types";
import type { Jenjang } from "@/lib/jenjang";
import type { BarisBankSoal, MapelBank } from "@/lib/bank-soal";
import SoalViewer from "@/components/siswa/SoalViewer/SoalViewer";
import {
  Kosong,
  TOMBOL_BIASA,
  TOMBOL_UTAMA,
} from "@/components/ui/Panel";
import {
  cariSoalDiBank,
  daftarMapelTujuan,
  pakaiSoalDariBank,
  type TujuanMapel,
} from "./actions";

/**
 * Penjelajah Bank Soal.
 *
 * ── SUSUNAN LAYAR ──
 *
 * Kiri: daftar mapel yang ada isinya, sebagai penyaring. Kanan: butir
 * soalnya. Di HP keduanya menumpuk, mapel di atas sebagai deretan pil
 * yang bisa digeser mendatar — bukan daftar vertikal panjang yang
 * mendorong soalnya keluar layar.
 *
 * ── PENCARIAN DIKERJAKAN DI SERVER ──
 *
 * Bukan menyaring array di browser. Bank soal satu jenjang bisa berisi
 * ribuan butir setelah beberapa semester, dan masing-masing membawa
 * `konten_jsonb` lengkap dengan opsi serta URL gambarnya. Mengirim
 * semuanya ke browser hanya untuk disaring di sana berarti mengunduh
 * beberapa megabita setiap kali halaman dibuka — di jaringan sekolah,
 * itu halaman yang tidak pernah selesai memuat.
 *
 * Ketikan ditunda 350 ms sebelum dikirim. Tanpa penundaan, mengetik
 * "fotosintesis" mengirim 12 permintaan pencarian, dan jawaban yang
 * datang belakangan belum tentu jawaban untuk ketikan terakhir —
 * hasilnya daftar yang berkedip lalu berhenti pada hasil yang salah.
 */
export default function BankSoalClient({
  jenjang,
  mapelAwal,
  soalAwal,
  bisaLintasJenjang,
}: {
  /** Null = jalur guru biasa (cookie-bound). */
  jenjang: Jenjang | null;
  mapelAwal: MapelBank[];
  soalAwal: BarisBankSoal[];
  bisaLintasJenjang: boolean;
}) {
  const [mapelNorm, setMapelNorm] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [tipe, setTipe] = useState<TipeSoal | "">("");
  const [soal, setSoal] = useState<BarisBankSoal[]>(soalAwal);
  // State biasa, bukan `useTransition` — lihat catatan yang sama di
  // SkorInline.tsx: React 18 tidak menjamin perilaku fungsi async di
  // dalam transition.
  const [memuat, setMemuat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const [lihatSoal, setLihatSoal] = useState<BarisBankSoal | null>(null);
  const [modalGunakan, setModalGunakan] = useState(false);

  // Penundaan ketikan — lihat alasannya di kepala komponen.
  useEffect(() => {
    let dibatalkan = false;
    const t = setTimeout(() => {
      setMemuat(true);
      void (async () => {
        const hasil = await cariSoalDiBank(jenjang, {
          mapelNorm,
          cari: cari.trim() || null,
          tipe: tipe || null,
        });
        // Penyaring sudah berubah lagi sejak permintaan ini dikirim —
        // hasilnya sudah usang. Tanpa penjaga ini, jawaban lambat untuk
        // ketikan lama bisa datang SESUDAH jawaban cepat untuk ketikan
        // baru, dan menimpanya.
        if (dibatalkan) return;
        setMemuat(false);
        if (hasil.error) {
          setError(hasil.error);
          return;
        }
        setError(null);
        setSoal(hasil.soal);
        // Pilihan yang sudah tidak ada di hasil baru dibuang, supaya
        // tombol "Gunakan 5 soal" tidak menghitung soal yang sudah tidak
        // terlihat di layar — guru akan mengira dia memilih lima soal
        // yang sedang dilihatnya.
        setDipilih((lama) => {
          const idBaru = new Set(hasil.soal.map((s) => s.id));
          const baru = new Set<string>();
          lama.forEach((id) => {
            if (idBaru.has(id)) baru.add(id);
          });
          return baru;
        });
      })();
    }, 350);
    return () => {
      dibatalkan = true;
      clearTimeout(t);
    };
  }, [jenjang, mapelNorm, cari, tipe]);

  const totalTerpilih = dipilih.size;

  function toggle(id: string) {
    setDipilih((s) => {
      const baru = new Set(s);
      if (baru.has(id)) baru.delete(id);
      else baru.add(id);
      return baru;
    });
  }

  function pilihSemuaTerlihat() {
    setDipilih(new Set(soal.map((s) => s.id)));
  }

  const mapelTampil = useMemo(
    () => mapelAwal.filter((m) => m.jumlah > 0),
    [mapelAwal]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_1fr]">
      {/* ── Penyaring mapel ── */}
      <aside className="min-w-0">
        <p className="mb-2.5 text-[0.72rem] font-bold uppercase tracking-wide text-slate-400">
          Mata Pelajaran
        </p>

        {mapelTampil.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-400">
            Bank soal masih kosong.
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            <PilMapel
              aktif={mapelNorm === null}
              label="Semua mapel"
              jumlah={mapelTampil.reduce((t, m) => t + Number(m.jumlah), 0)}
              onClick={() => setMapelNorm(null)}
            />
            {mapelTampil.map((m) => (
              <PilMapel
                key={m.mapel_nama_norm}
                aktif={mapelNorm === m.mapel_nama_norm}
                label={m.nama_tampil}
                jumlah={Number(m.jumlah)}
                onClick={() => setMapelNorm(m.mapel_nama_norm)}
              />
            ))}
          </div>
        )}

        <p className="mt-3 hidden rounded-xl bg-slate-50 px-3 py-2.5 text-[0.7rem] leading-relaxed text-slate-500 lg:block">
          <i className="fas fa-circle-info mr-1.5" aria-hidden />
          Penulisan &quot;MATEMATIKA&quot;, &quot;Matematika&quot;, dan
          &quot;matematika&quot; dianggap satu mapel yang sama, jadi soal
          dari semua guru berkumpul di satu tempat.
        </p>
      </aside>

      {/* ── Daftar soal ── */}
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <i
              className="fas fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari kata di dalam soal atau pilihan jawabannya…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-[--primary]"
            />
          </div>
          <select
            value={tipe}
            onChange={(e) => setTipe(e.target.value as TipeSoal | "")}
            aria-label="Saring bentuk soal"
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-[--primary]"
          >
            <option value="">Semua bentuk</option>
            {TIPE_SOAL_LIST.map((t) => (
              <option key={t} value={t}>
                {TIPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Baris aksi massal — hanya muncul kalau memang ada yang dipilih. */}
        {totalTerpilih > 0 && (
          <div className="animasi-muncul sticky top-16 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm">
            <p className="flex-1 text-sm font-semibold text-blue-900">
              <i className="fas fa-check-double mr-2" aria-hidden />
              {totalTerpilih} soal dipilih
            </p>
            <button
              type="button"
              onClick={() => setDipilih(new Set())}
              className="px-2 text-xs font-semibold text-blue-700 hover:underline"
            >
              Batal pilih
            </button>
            <button
              type="button"
              onClick={() => setModalGunakan(true)}
              className={TOMBOL_UTAMA}
            >
              <i className="fas fa-file-import" aria-hidden />
              Gunakan di kegiatan…
            </button>
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {memuat && (
          <p className="mb-3 text-sm text-slate-400">
            <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden />
            Mencari…
          </p>
        )}

        {!memuat && soal.length === 0 ? (
          <Kosong
            ikon="fa-box-open"
            judul={
              cari || mapelNorm || tipe
                ? "Tidak ada soal yang cocok"
                : "Bank soal masih kosong"
            }
            keterangan={
              cari || mapelNorm || tipe
                ? "Coba kata kunci lain, atau longgarkan penyaring mapel dan bentuk soalnya."
                : "Bank akan terisi sendiri: setiap soal yang kamu simpan di kegiatan mana pun otomatis diarsipkan ke sini."
            }
          />
        ) : (
          <>
            {soal.length > 1 && (
              <button
                type="button"
                onClick={pilihSemuaTerlihat}
                className="mb-2 text-xs font-semibold text-[--primary] hover:underline"
              >
                Pilih semua {soal.length} soal yang terlihat
              </button>
            )}

            <div className="space-y-2.5">
              {soal.map((s) => (
                <KartuBankSoal
                  key={s.id}
                  soal={s}
                  dipilih={dipilih.has(s.id)}
                  onToggle={() => toggle(s.id)}
                  onLihat={() => setLihatSoal(s)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {lihatSoal && (
        <ModalLihat soal={lihatSoal} onTutup={() => setLihatSoal(null)} />
      )}

      {modalGunakan && (
        <ModalGunakan
          jenjang={jenjang}
          bankIds={Array.from(dipilih)}
          bisaLintasJenjang={bisaLintasJenjang}
          onTutup={() => setModalGunakan(false)}
          onSelesai={() => {
            setModalGunakan(false);
            setDipilih(new Set());
          }}
        />
      )}
    </div>
  );
}

function PilMapel({
  aktif,
  label,
  jumlah,
  onClick,
}: {
  aktif: boolean;
  label: string;
  jumlah: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition-colors lg:w-full ${
        aktif
          ? "bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-white shadow-md shadow-blue-600/20"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      <span className="truncate">{label}</span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] tabular-nums ${
          aktif ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        {jumlah}
      </span>
    </button>
  );
}

function KartuBankSoal({
  soal,
  dipilih,
  onToggle,
  onLihat,
}: {
  soal: BarisBankSoal;
  dipilih: boolean;
  onToggle: () => void;
  onLihat: () => void;
}) {
  const ringkasan = ringkasanKonten(soal.konten_jsonb);

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border bg-white p-3.5 transition-colors ${
        dipilih
          ? "border-[--primary] bg-blue-50/50 ring-1 ring-blue-200"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <input
        type="checkbox"
        checked={dipilih}
        onChange={onToggle}
        aria-label={`Pilih soal: ${ringkasan.slice(0, 40)}`}
        className="mt-1 h-4 w-4 shrink-0 accent-[--primary]"
      />

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[0.65rem] font-semibold text-teal">
            {TIPE_LABEL[soal.tipe]}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-500">
            {soal.mapel_nama}
          </span>
          <span className="text-[0.65rem] text-slate-400">
            Skor {Number(soal.skor)}
          </span>
        </div>

        <p className="line-clamp-2 text-sm leading-relaxed text-slate-700">
          {ringkasan || (
            <span className="italic text-slate-400">
              (soal berupa gambar)
            </span>
          )}
        </p>

        <p className="mt-1.5 text-[0.68rem] text-slate-400">
          {soal.dibuat_oleh_nama ?? "Tanpa nama"}
          {soal.asal_event_nama ? ` · dari ${soal.asal_event_nama}` : ""}
        </p>
      </div>

      <button
        type="button"
        onClick={onLihat}
        className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-semibold text-[--primary] transition-colors hover:bg-blue-50"
      >
        <i className="fas fa-eye mr-1" aria-hidden />
        Lihat
      </button>
    </div>
  );
}

/**
 * Pratinjau satu soal dari bank.
 *
 * Memakai `SoalViewer` yang sama dengan halaman ujian — alasan yang sama
 * dengan pratinjau ujian: tampilan tiruan yang meleset sedikit saja
 * lebih berbahaya daripada tidak ada pratinjau.
 *
 * Kunci jawaban SENGAJA tidak dibuang di sini, berbeda dari pratinjau
 * ujian. Di sini gunanya justru memastikan "soal ini yang mana kuncinya"
 * sebelum dipakai ulang, dan yang membaca sudah pasti guru (RLS
 * `bank_soal_select_guru` tidak mengizinkan siswa membaca tabel ini sama
 * sekali). `SoalViewer` sendiri memang tidak menampilkan field kunci,
 * jadi yang terlihat tetap bentuk soal apa adanya.
 */
function ModalLihat({
  soal,
  onTutup,
}: {
  soal: BarisBankSoal;
  onTutup: () => void;
}) {
  const [jawaban, setJawaban] = useState<unknown>(undefined);

  const sebagaiSoalSiswa: SoalSiswa = {
    id: soal.id,
    tipe: soal.tipe,
    urutan: 1,
    skor: Number(soal.skor),
    konten_jsonb: soal.konten_jsonb,
    gambar_url: soal.gambar_url,
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onClick={onTutup}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="font-serif text-base font-bold text-ink">
              Pratinjau soal
            </p>
            <p className="truncate text-xs text-slate-500">
              {soal.mapel_nama} · {TIPE_LABEL[soal.tipe]}
            </p>
          </div>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink"
          >
            <i className="fas fa-xmark" aria-hidden />
          </button>
        </div>

        <div className="scroll-halus flex-1 overflow-y-auto p-5">
          <SoalViewer
            soal={sebagaiSoalSiswa}
            value={jawaban}
            onChange={setJawaban}
          />
        </div>

        <div className="border-t border-slate-200 px-5 py-3.5">
          <button type="button" onClick={onTutup} className={`${TOMBOL_BIASA} w-full`}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalGunakan({
  jenjang,
  bankIds,
  bisaLintasJenjang,
  onTutup,
  onSelesai,
}: {
  jenjang: Jenjang | null;
  bankIds: string[];
  bisaLintasJenjang: boolean;
  onTutup: () => void;
  onSelesai: () => void;
}) {
  const [mapel, setMapel] = useState<TujuanMapel[] | null>(null);
  const [terpilih, setTerpilih] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let batal = false;
    daftarMapelTujuan(jenjang).then((h) => {
      if (batal) return;
      if (h.error) setError(h.error);
      setMapel(h.mapel);
    });
    return () => {
      batal = true;
    };
  }, [jenjang]);

  function kirim() {
    setPending(true);
    void (async () => {
      try {
        const h = await pakaiSoalDariBank(jenjang, bankIds, terpilih);
        if (h.error) {
          setError(h.error);
          return;
        }
        setError(null);
        setSukses(
          `${h.jumlah} soal berhasil disalin. Soal masuk di urutan paling bawah mapel tujuan.`
        );
      } catch {
        setError("Gagal menyalin. Periksa koneksi lalu coba lagi.");
      } finally {
        setPending(false);
      }
    })();
  }

  const aktif = (mapel ?? []).filter((m) => m.sedangAktif);
  const lewat = (mapel ?? []).filter((m) => !m.sedangAktif);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 backdrop-blur-[2px] sm:items-center sm:p-5"
      onClick={onTutup}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="font-serif text-base font-bold text-ink">
            Gunakan {bankIds.length} soal
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Pilih mapel tujuan. Soal disalin — yang ada di bank tetap utuh.
          </p>
        </div>

        <div className="scroll-halus flex-1 overflow-y-auto px-5 py-4">
          {sukses ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
              <i
                className="fas fa-circle-check mb-2 text-3xl text-emerald-500"
                aria-hidden
              />
              <p className="text-sm font-semibold text-emerald-800">{sukses}</p>
            </div>
          ) : mapel === null ? (
            <p className="py-6 text-center text-sm text-slate-400">
              <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden />
              Memuat daftar mapel…
            </p>
          ) : mapel.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Belum ada mapel yang bisa jadi tujuan. Buat kegiatan dan
              mapelnya dulu.
            </p>
          ) : (
            <div className="space-y-4">
              {aktif.length > 0 && (
                <GrupTujuan
                  judul="Kegiatan yang masih berjalan"
                  mapel={aktif}
                  terpilih={terpilih}
                  onPilih={setTerpilih}
                />
              )}
              {lewat.length > 0 && (
                <GrupTujuan
                  judul="Kegiatan yang sudah lewat"
                  mapel={lewat}
                  terpilih={terpilih}
                  onPilih={setTerpilih}
                />
              )}
              {bisaLintasJenjang && (
                <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[0.7rem] leading-relaxed text-slate-500">
                  <i className="fas fa-circle-info mr-1.5" aria-hidden />
                  Daftar ini hanya memuat kegiatan pada jenjang yang sedang
                  kamu lihat. Untuk menyalin ke jenjang lain, ganti jenjang
                  dulu lewat pemilih di atas halaman.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-200 px-5 py-3.5">
          {sukses ? (
            <button
              type="button"
              onClick={onSelesai}
              className={`${TOMBOL_UTAMA} w-full`}
            >
              Selesai
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onTutup}
                className={`${TOMBOL_BIASA} flex-1`}
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!terpilih || pending}
                onClick={kirim}
                className={`${TOMBOL_UTAMA} flex-1`}
              >
                {pending ? (
                  <>
                    <i className="fas fa-circle-notch fa-spin" aria-hidden />
                    Menyalin…
                  </>
                ) : (
                  <>
                    <i className="fas fa-file-import" aria-hidden />
                    Salin ke sini
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GrupTujuan({
  judul,
  mapel,
  terpilih,
  onPilih,
}: {
  judul: string;
  mapel: TujuanMapel[];
  terpilih: string;
  onPilih: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-wide text-slate-400">
        {judul}
      </p>
      <div className="space-y-1.5">
        {mapel.map((m) => (
          <label
            key={m.mapelId}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
              terpilih === m.mapelId
                ? "border-[--primary] bg-blue-50"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="mapel_tujuan"
              checked={terpilih === m.mapelId}
              onChange={() => onPilih(m.mapelId)}
              className="h-4 w-4 accent-[--primary]"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">
                {m.mapelNama}
              </span>
              <span className="block truncate text-[0.7rem] text-slate-500">
                {m.eventNama}
              </span>
            </span>
            {m.sedangAktif && (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.62rem] font-bold text-emerald-700">
                AKTIF
              </span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
