"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Jenjang } from "@/lib/jenjang";
import { TIPE_LABEL } from "@/lib/soal";
import {
  PROMPT_IMPOR,
  TEMPLATE_IMPOR,
  adalahUrl,
  bacaJsonSoal,
  bagiRataSkor,
  bangunKonten,
  kunciGambar,
  kunciRujukan,
  type HasilBaca,
  type SoalSiapSimpan,
} from "@/lib/impor-soal-json";
import { bacaDocx, type HasilDocx } from "@/lib/docx-gambar";
import { ACCEPT_GAMBAR, prosesDanUnggah } from "@/lib/unggah-gambar";
import { imporSoalJson } from "@/app/admin/event/[eventId]/mapel/[mapelId]/soal/impor-actions";

/**
 * Dialog "Unggah JSON": dua pintu —
 *   1. Unduh Template  -> template JSON + prompt untuk Claude, plus
 *      (opsional) teks Word bertanda gambar.
 *   2. Unggah File JSON -> baca, pratinjau, cocokkan gambar, simpan.
 *
 * Gambar diunggah ke Cloudinary dari browser guru (jalur yang sama
 * dengan editor soal), baru setelah itu baris soal dikirim ke server.
 * URL yang sudah terunggah diingat selama dialog terbuka, jadi kalau
 * penyimpanan gagal lalu diulang, gambar tidak diunggah dua kali.
 */

const SEJAJAR = 3;

function unduh(nama: string, isi: string, mime: string) {
  const url = URL.createObjectURL(new Blob([isi], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const isiTemplate = () => JSON.stringify(TEMPLATE_IMPOR, null, 2);
const isiPrompt = () => `${PROMPT_IMPOR}\n${isiTemplate()}\n`;

export default function ImporSoalJson({
  eventId,
  mapelId,
  mapelNama,
  jenjang,
  renderPemicu,
}: {
  eventId: string;
  mapelId: string;
  mapelNama: string;
  jenjang?: Jenjang;
  renderPemicu?: (buka: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [panel, setPanel] = useState<"pilih" | "template" | "unggah">("pilih");

  const [docx, setDocx] = useState<{ nama: string; hasil: HasilDocx } | null>(null);
  const [gambarManual, setGambarManual] = useState<Map<string, File>>(new Map());
  const [json, setJson] = useState<{ nama: string; hasil: HasilBaca } | null>(null);
  const [tempel, setTempel] = useState("");
  const [modeSkor, setModeSkor] = useState<"json" | "rata">("json");
  const [keBank, setKeBank] = useState(true);
  const [proses, setProses] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const terunggah = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!buka) return;
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = lama;
    };
  }, [buka]);

  /** kunci nama -> berkas. Gambar pilihan manual menimpa gambar dari Word. */
  const kolam = useMemo(() => {
    const m = new Map<string, File>();
    for (const g of docx?.hasil.gambar ?? []) if (g.berkas) m.set(kunciGambar(g.nama), g.berkas);
    for (const [k, f] of gambarManual) m.set(k, f);
    return m;
  }, [docx, gambarManual]);

  const tidakDidukung = useMemo(
    () => new Set((docx?.hasil.gambar ?? []).filter((g) => !g.didukung).map((g) => kunciGambar(g.nama))),
    [docx]
  );

  const daftar = json?.hasil.soal ?? [];
  const skorAkhir = useMemo(
    () => (modeSkor === "rata" ? bagiRataSkor(daftar.length) : daftar.map((s) => s.skor)),
    [modeSkor, daftar]
  );
  const hilangPerSoal = daftar.map((s) =>
    s.rujukanGambar.filter((r) => !adalahUrl(r) && !kolam.has(kunciGambar(r)) && !terunggah.current.has(kunciGambar(r)))
  );
  const jumlahGalat = daftar.filter((s) => s.galat).length;
  const jumlahHilang = new Set(hilangPerSoal.flat().map(kunciGambar)).size;
  const jumlahGambar = new Set(daftar.flatMap((s) => s.rujukanGambar.map(kunciRujukan))).size;
  const totalSkor = Math.round(skorAkhir.reduce((a, b) => a + b, 0) * 100) / 100;
  const bisaSimpan = daftar.length > 0 && jumlahGalat === 0 && jumlahHilang === 0 && !proses;

  function tutup() {
    if (proses) return;
    setBuka(false);
    setPanel("pilih");
    setPesan(null);
  }

  async function pilihDocx(f: File | undefined) {
    if (!f) return;
    setPesan(null);
    setProses("Membaca dokumen Word…");
    try {
      const hasil = await bacaDocx(f);
      setDocx({ nama: f.name, hasil });
    } catch (e) {
      setPesan({ ok: false, teks: e instanceof Error ? e.message : "Dokumen Word tidak terbaca." });
    } finally {
      setProses(null);
    }
  }

  function pilihGambar(files: FileList | null) {
    if (!files?.length) return;
    setGambarManual((lama) => {
      const b = new Map(lama);
      for (const f of Array.from(files)) b.set(kunciGambar(f.name), f);
      return b;
    });
  }

  function muatJson(nama: string, teks: string) {
    setPesan(null);
    const hasil = bacaJsonSoal(teks);
    if (hasil.galatBerkas) {
      setJson(null);
      setPesan({ ok: false, teks: hasil.galatBerkas });
      return;
    }
    setJson({ nama, hasil });
  }

  async function pilihJson(f: File | undefined) {
    if (!f) return;
    muatJson(f.name, await f.text());
  }

  async function simpan() {
    if (!json || !bisaSimpan) return;
    setPesan(null);

    // 1) Unggah gambar yang belum terunggah.
    const perlu = Array.from(
      new Set(daftar.flatMap((s) => s.rujukanGambar.filter((r) => !adalahUrl(r)).map(kunciGambar)))
    ).filter((k) => !terunggah.current.has(k));

    let selesai = 0;
    try {
      const antre = [...perlu];
      const pekerja = async () => {
        for (let k = antre.shift(); k !== undefined; k = antre.shift()) {
          const berkas = kolam.get(k);
          if (!berkas) throw new Error(`Gambar "${k}" belum dipilih.`);
          setProses(`Mengunggah gambar ${selesai + 1}/${perlu.length}…`);
          const f = berkas instanceof File ? berkas : new File([berkas], `${k}.png`, { type: "image/png" });
          try {
            const { url } = await prosesDanUnggah(f);
            terunggah.current.set(k, url);
          } catch (e) {
            throw new Error(`${f.name}: ${e instanceof Error ? e.message : "gagal diunggah"}`);
          }
          selesai++;
        }
      };
      await Promise.all(Array.from({ length: Math.min(SEJAJAR, perlu.length) }, pekerja));
    } catch (e) {
      setProses(null);
      setPesan({ ok: false, teks: e instanceof Error ? e.message : "Gagal mengunggah gambar." });
      return;
    }

    // 2) Bangun konten final dengan URL asli.
    const siap: SoalSiapSimpan[] = [];
    for (let i = 0; i < daftar.length; i++) {
      const b = bangunKonten({ ...daftar[i], skor: skorAkhir[i] }, terunggah.current);
      if ("galat" in b) {
        setProses(null);
        setPesan({ ok: false, teks: `Soal ${daftar[i].nomor}: ${b.galat}` });
        return;
      }
      siap.push(b);
    }

    // 3) Simpan.
    setProses(`Menyimpan ${siap.length} soal…`);
    const r = await imporSoalJson(jenjang ?? null, eventId, mapelId, siap, keBank);
    setProses(null);
    if (r.error) {
      setPesan({ ok: false, teks: r.error });
      return;
    }
    setPesan({
      ok: true,
      teks: `${r.jumlah} soal ditambahkan ke ${mapelNama}${r.keBank ? " (sekaligus disalin ke Bank Soal)" : ""}.`,
    });
    setJson(null);
    setTempel("");
    terunggah.current = new Map();
    router.refresh();
  }

  const kartu =
    "group flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-md";

  return (
    <>
      {renderPemicu ? (
        renderPemicu(() => setBuka(true))
      ) : (
        <button type="button" onClick={() => setBuka(true)} className="btn-navy-outline">
          <i className="fas fa-file-code" aria-hidden />
          Unggah JSON
        </button>
      )}

      {buka && (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-navy-950/60 backdrop-blur-sm sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Unggah soal dari JSON"
            className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden bg-paper shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
          >
            <div className="flex items-center gap-3 bg-navy-800 px-5 py-3.5 text-white">
              {panel !== "pilih" && (
                <button
                  type="button"
                  onClick={() => !proses && setPanel("pilih")}
                  aria-label="Kembali"
                  className="rounded-lg p-2 text-white/80 hover:bg-white/10"
                >
                  <i className="fas fa-arrow-left" aria-hidden />
                </button>
              )}
              <i className="fas fa-file-code" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-serif font-bold leading-tight">
                  {panel === "template" ? "Unduh Template" : panel === "unggah" ? "Unggah File JSON" : "Unggah Soal dari JSON"}
                </p>
                <p className="truncate text-xs text-white/70">Tujuan: {mapelNama}</p>
              </div>
              <button type="button" onClick={tutup} aria-label="Tutup" className="rounded-lg p-2 text-white/80 hover:bg-white/10">
                <i className="fas fa-xmark" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {pesan && (
                <p
                  className={`mb-3 rounded-xl px-4 py-2.5 text-sm font-medium ${
                    pesan.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {pesan.teks}
                </p>
              )}

              {panel === "pilih" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => setPanel("template")} className={kartu}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                      <i className="fas fa-download" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-serif font-bold text-navy-900">Unduh Template</span>
                      <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                        Format JSON + prompt untuk Claude. Bawa Word soal ke Claude, minta diubah jadi JSON.
                      </span>
                    </span>
                  </button>
                  <button type="button" onClick={() => setPanel("unggah")} className={kartu}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <i className="fas fa-upload" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-serif font-bold text-navy-900">Unggah File JSON</span>
                      <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                        Pilih soal.json hasil Claude, cek pratinjau, lalu simpan semua sekaligus.
                      </span>
                    </span>
                  </button>
                </div>
              )}

              {panel === "template" && (
                <div className="space-y-4 text-sm text-slate-700">
                  <section className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="mb-2 font-bold text-navy-900">1. Unduh dua berkas ini</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-navy"
                        onClick={() => unduh("prompt-word-ke-json-sipandu.txt", isiPrompt(), "text/plain;charset=utf-8")}
                      >
                        <i className="fas fa-file-lines" aria-hidden />
                        Prompt untuk Claude
                      </button>
                      <button
                        type="button"
                        className="btn-navy-outline"
                        onClick={() => unduh("template-soal-sipandu.json", isiTemplate(), "application/json")}
                      >
                        <i className="fas fa-file-code" aria-hidden />
                        Template JSON
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Prompt sudah memuat contoh format lengkap — cukup prompt saja kalau ingin ringkas.
                    </p>
                  </section>

                  <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                    <p className="mb-1 font-bold text-navy-900">2. Soal ada gambarnya? Siapkan Word dulu</p>
                    <p className="mb-2 text-xs leading-relaxed text-slate-600">
                      Pilih file Word (.docx). Aplikasi mengambil semua gambar dan menulis penanda{" "}
                      <code className="rounded bg-white px-1">[[gambar:gambar-1.png]]</code> di posisi tiap gambar. Kirim{" "}
                      <b>teks bertanda</b> ini ke Claude (bukan file Word-nya), supaya posisi gambar tidak hilang. Saat
                      mengunggah JSON nanti, gambar diambil otomatis dari Word yang sama.
                    </p>
                    <label className="btn-ghost cursor-pointer">
                      <i className="fas fa-file-word" aria-hidden />
                      {docx ? "Ganti file Word" : "Pilih file Word (.docx)"}
                      <input
                        type="file"
                        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        onChange={(e) => {
                          pilihDocx(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {docx && <RingkasanDocx docx={docx} />}
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600">
                    <p className="mb-1 text-sm font-bold text-navy-900">3. Di Claude</p>
                    <ol className="list-decimal space-y-0.5 pl-5">
                      <li>Tempel isi prompt, lalu lampirkan teks bertanda (atau Word-nya kalau tanpa gambar).</li>
                      <li>Minta: &ldquo;Ubah semua soal ini jadi JSON sesuai format.&rdquo;</li>
                      <li>Simpan jawabannya sebagai <b>soal.json</b> (atau salin teks JSON-nya).</li>
                      <li>Kembali ke sini → <b>Unggah File JSON</b>.</li>
                    </ol>
                    <p className="mt-2">
                      Tanpa Word? Gambar bisa diunggah manual: simpan tiap gambar dengan nama yang sama dengan penandanya
                      (mis. <code>gambar-4.png</code>), lalu pilih sekaligus di layar unggah.
                    </p>
                  </section>
                </div>
              )}

              {panel === "unggah" && (
                <div className="space-y-4 text-sm">
                  <section className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="btn-navy cursor-pointer">
                        <i className="fas fa-file-code" aria-hidden />
                        {json ? "Ganti file JSON" : "Pilih file JSON"}
                        <input
                          type="file"
                          accept=".json,application/json,.txt"
                          className="hidden"
                          onChange={(e) => {
                            pilihJson(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {json && <span className="truncate text-xs text-slate-500">{json.nama}</span>}
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-navy-700">atau tempel teks JSON</summary>
                      <textarea
                        value={tempel}
                        onChange={(e) => setTempel(e.target.value)}
                        rows={5}
                        placeholder='{ "soal": [ ... ] }'
                        className="mt-2 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs outline-none focus:border-navy-600"
                      />
                      <button
                        type="button"
                        className="btn-ghost mt-1"
                        disabled={!tempel.trim()}
                        onClick={() => muatJson("teks tempelan", tempel)}
                      >
                        Baca JSON
                      </button>
                    </details>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="mb-2 font-bold text-navy-900">
                      Gambar{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({kolam.size} berkas tersedia{jumlahGambar ? ` · ${jumlahGambar} dipakai soal` : ""})
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <label className="btn-ghost cursor-pointer">
                        <i className="fas fa-file-word" aria-hidden />
                        {docx ? "Ganti Word" : "Ambil dari Word (.docx)"}
                        <input
                          type="file"
                          accept=".docx"
                          className="hidden"
                          onChange={(e) => {
                            pilihDocx(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <label className="btn-ghost cursor-pointer">
                        <i className="fas fa-images" aria-hidden />
                        Pilih gambar (bisa banyak)
                        <input
                          type="file"
                          accept={ACCEPT_GAMBAR}
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            pilihGambar(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    {docx && (
                      <p className="mt-2 text-xs text-slate-500">
                        Dari {docx.nama}: {docx.hasil.gambar.filter((g) => g.didukung).length} gambar
                        {tidakDidukung.size > 0 && `, ${tidakDidukung.size} format lama (WMF/EMF) tidak bisa dipakai`}.
                      </p>
                    )}
                  </section>

                  {daftar.length > 0 && (
                    <section className="rounded-2xl border border-slate-200 bg-white">
                      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs">
                        <span className="pil bg-navy-50 text-navy-700">{daftar.length} soal</span>
                        <span className={`pil ${totalSkor === 100 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          Total skor {totalSkor}
                        </span>
                        {jumlahGalat > 0 && <span className="pil bg-rose-50 text-rose-700">{jumlahGalat} perlu diperbaiki</span>}
                        {jumlahHilang > 0 && <span className="pil bg-rose-50 text-rose-700">{jumlahHilang} gambar belum ada</span>}
                        <select
                          value={modeSkor}
                          onChange={(e) => setModeSkor(e.target.value as "json" | "rata")}
                          className="ml-auto rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none"
                        >
                          <option value="json">Skor ikuti JSON</option>
                          <option value="rata">Bagi rata jadi total 100</option>
                        </select>
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {daftar.map((s, i) => (
                          <li key={i} className="flex gap-3 px-4 py-3">
                            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                              {s.nomor}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                                <span className="pil bg-teal/10 text-teal">{TIPE_LABEL[s.tipe]}</span>
                                <span className="pil bg-amber-50 text-amber-700">Skor {skorAkhir[i]}</span>
                                {s.rujukanGambar.map((r) => {
                                  const k = kunciGambar(r);
                                  const ok = adalahUrl(r) || kolam.has(k) || terunggah.current.has(k);
                                  return (
                                    <span
                                      key={r}
                                      className={`pil ${ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                                      title={!ok && tidakDidukung.has(k) ? "Format WMF/EMF dari Word tidak bisa ditampilkan. Unggah tangkapan layar dengan nama ini." : undefined}
                                    >
                                      <i className={`fas ${ok ? "fa-image" : "fa-triangle-exclamation"}`} aria-hidden />
                                      {adalahUrl(r) ? "URL" : r}
                                    </span>
                                  );
                                })}
                              </div>
                              <p className="line-clamp-2 text-sm text-ink">
                                {s.pertanyaan.replace(/\[\[\s*gambar\s*:[^\]]*\]\]/gi, "🖼").trim() || "(hanya gambar)"}
                              </p>
                              {s.galat && <p className="mt-1 text-xs font-semibold text-rose-700">{s.galat}</p>}
                              {s.catatan && (
                                <p className="mt-1 text-xs text-amber-700">
                                  <i className="fas fa-note-sticky mr-1" aria-hidden />
                                  {s.catatan}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </div>

            {panel === "unggah" && (
              <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 sm:mr-auto">
                  <input type="checkbox" checked={keBank} onChange={(e) => setKeBank(e.target.checked)} className="accent-navy-700" />
                  Salin juga ke Bank Soal
                </label>
                {proses && (
                  <span className="text-xs text-slate-500">
                    <i className="fas fa-circle-notch fa-spin mr-1" aria-hidden />
                    {proses}
                  </span>
                )}
                <button type="button" onClick={tutup} className="btn-ghost" disabled={!!proses}>
                  Tutup
                </button>
                <button type="button" onClick={simpan} disabled={!bisaSimpan} className="btn-navy">
                  <i className={`fas ${proses ? "fa-circle-notch fa-spin" : "fa-floppy-disk"}`} aria-hidden />
                  Simpan {daftar.length || ""} Soal
                </button>
              </div>
            )}
            {panel === "template" && proses && (
              <p className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
                <i className="fas fa-circle-notch fa-spin mr-1" aria-hidden />
                {proses}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function RingkasanDocx({ docx }: { docx: { nama: string; hasil: HasilDocx } }) {
  const [tersalin, setTersalin] = useState(false);
  const { teks, gambar } = docx.hasil;
  const lama = gambar.filter((g) => !g.didukung);
  const namaTxt = docx.nama.replace(/\.docx$/i, "") + "-bertanda.txt";

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-white p-3 text-xs">
      <p className="mb-2 text-slate-600">
        <b className="text-ink">{docx.nama}</b>: {teks.length.toLocaleString("id-ID")} karakter, {gambar.length} gambar.
      </p>
      {lama.length > 0 && (
        <p className="mb-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-700">
          {lama.map((g) => g.nama).join(", ")} berformat lama ({Array.from(new Set(lama.map((g) => g.ext.toUpperCase()))).join("/")}
          , biasanya rumus Equation 3.0) dan tidak bisa tampil di browser. Buat tangkapan layar, simpan dengan nama yang sama
          (boleh .png), lalu pilih saat mengunggah.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-navy" onClick={() => unduh(namaTxt, teks, "text/plain;charset=utf-8")}>
          <i className="fas fa-download" aria-hidden />
          Unduh teks bertanda
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(teks);
              setTersalin(true);
              setTimeout(() => setTersalin(false), 2000);
            } catch {
              /* clipboard ditolak — tombol unduh tetap ada */
            }
          }}
        >
          <i className={`fas ${tersalin ? "fa-check" : "fa-copy"}`} aria-hidden />
          {tersalin ? "Tersalin" : "Salin teks"}
        </button>
      </div>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 font-mono text-[0.7rem] text-slate-600">
        {teks.slice(0, 1500)}
        {teks.length > 1500 && "\n…"}
      </pre>
    </div>
  );
}
