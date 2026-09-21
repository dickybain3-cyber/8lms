"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatWaktu } from "@/lib/ujian";
import TombolKerjakanUjian from "@/components/TombolKerjakanUjian";
import {
  jenisEventValid,
  labelSiswaJenisEvent,
  type JenisEvent,
} from "@/lib/jenis-event";
import {
  bolehMengumpulkan,
  faseTugas,
  formatSisaSingkat,
  formatTenggat,
} from "@/lib/tugas";
import { faseForum } from "@/lib/forum";

export type MapelRow = {
  id: string;
  nama: string;
  waktu_mulai: string;
  waktu_selesai: string;
  durasi_menit: number | null;
  /** `jenis` opsional — kolom `event.jenis` (migrasi 0018) belum tentu
   *  ada di project ini (lihat fallback dua-tahap di page.tsx). Hilang
   *  atau tidak valid diperlakukan sebagai 'asesmen_akhir' ("Ujian"),
   *  bukan error — itu memang satu-satunya jenis yang mungkin ada
   *  sebelum migrasi 0018 jalan. */
  event: { nama: string; jenis?: unknown } | null;
};

export type TugasRow = {
  id: string;
  judul: string;
  dibuka_at: string;
  tenggat: string;
  izinkan_terlambat: boolean;
  minta_berkas: boolean;
  event: { nama: string } | null;
};

export type ForumRow = {
  id: string;
  dibuka_at: string;
  ditutup_at: string;
  event: { nama: string } | null;
};

export type PengumpulanRingkasRow = {
  submitted_at: string | null;
  nilai: number | null;
};

/** "Ujian" untuk asesmen_akhir (atau kalau jenisnya tidak diketahui),
 *  "Kuis" untuk kuis_harian — lihat `src/lib/jenis-event.ts`. */
function labelKerjakan(m: MapelRow): string {
  const jenis: JenisEvent = jenisEventValid(m.event?.jenis)
    ? m.event!.jenis
    : "asesmen_akhir";
  return labelSiswaJenisEvent(jenis);
}

/**
 * ── KENAPA JAM BERDETAK DI SINI, BUKAN CUMA SEKALI SAAT MOUNT ──
 *
 * Kalau selisih jam server dihitung sekali lalu dipakai statis, dashboard
 * yang dibuka pukul 07.55 tidak akan pernah tahu bahwa pukul 08.00 sudah
 * lewat — kecuali di-refresh manual, persis masalah yang mau dihilangkan.
 * Jadi yang disimpan adalah OFFSET (selisih jam server - jam device),
 * dan "jam sekarang" dihitung ulang tiap detik dari `Date.now() + offset`.
 *
 * ── TAHAP 4: TUGAS IKUT DI JAM YANG SAMA ──
 *
 * Tugas dikelompokkan dengan jam yang sama persis, bukan dengan
 * `Date.now()` sendiri. Dua sumber jam di satu layar berarti kartu ujian
 * dan kartu tugas bisa berpindah kolom pada detik yang berbeda — kecil,
 * tapi persis jenis ketidakkonsistenan yang membuat siswa tidak lagi
 * percaya pada apa yang dia lihat di layar.
 *
 * ── TAHAP 5: FORUM IKUT DI JAM YANG SAMA, TAPI TIDAK PUNYA "RIWAYAT
 *    PENGERJAAN" SEPERTI TUGAS/UJIAN ──
 *
 * Forum tidak dikerjakan atau dikumpulkan — dibuka, dibaca, dibalas.
 * Jadi pengelompokannya cuma dua sumbu waktu (`faseForum`: belum_buka /
 * berlangsung / ditutup), bukan tiga seperti tugas (yang juga melacak
 * "sudah dikumpulkan atau belum"). Forum yang ditutup tetap muncul di
 * Riwayat supaya siswa masih bisa membaca ulang obrolannya, tapi tidak
 * ada status "dikerjakan/tidak" untuk ditampilkan di situ.
 */
export default function DashboardSiswaClient({
  mapelList,
  submittedByMapel,
  tugasList,
  pengumpulanByTugas,
  forumList,
  waktuServer,
  pesan,
}: {
  mapelList: MapelRow[];
  submittedByMapel: Record<string, string | null>;
  tugasList: TugasRow[];
  pengumpulanByTugas: Record<string, PengumpulanRingkasRow>;
  forumList: ForumRow[];
  waktuServer: string;
  pesan: string | null;
}) {
  const offsetMs = useMemo(
    () => new Date(waktuServer).getTime() - Date.now(),
    [waktuServer]
  );

  const [now, setNow] = useState(() => Date.now() + offsetMs);

  useEffect(() => {
    // Tick tiap detik cukup — yang dipantau adalah jendela buka/tutup
    // ujian (jam:menit), bukan animasi yang butuh presisi lebih halus.
    const id = setInterval(() => setNow(Date.now() + offsetMs), 1000);
    return () => clearInterval(id);
  }, [offsetMs]);

  const berlangsung: MapelRow[] = [];
  const akanDatang: MapelRow[] = [];
  const riwayat: MapelRow[] = [];

  for (const m of mapelList) {
    const mulai = new Date(m.waktu_mulai).getTime();
    const habis = new Date(m.waktu_selesai).getTime();
    const sudahKumpul = Boolean(submittedByMapel[m.id]);

    if (sudahKumpul) riwayat.push(m);
    else if (now < mulai) akanDatang.push(m);
    else if (now > habis) riwayat.push(m);
    else berlangsung.push(m);
  }

  riwayat.sort(
    (a, b) =>
      new Date(b.waktu_mulai).getTime() - new Date(a.waktu_mulai).getTime()
  );
  akanDatang.sort(
    (a, b) =>
      new Date(a.waktu_mulai).getTime() - new Date(b.waktu_mulai).getTime()
  );

  const berikutnya = akanDatang[0];
  const sisaMsBerikutnya = berikutnya
    ? new Date(berikutnya.waktu_mulai).getTime() - now
    : null;

  // ── Tugas ──
  //
  // Tiga kelompok, dan aturannya sengaja BERBEDA dari mapel di satu hal:
  // tugas yang sudah dikumpulkan TIDAK langsung pindah ke riwayat kalau
  // tenggatnya belum lewat. Siswa masih boleh memperbaikinya sampai
  // tenggat (dan sampai gurunya menilai), jadi menyembunyikannya dari
  // daftar aktif berarti menyembunyikan pekerjaan yang masih bisa
  // disentuh. Yang berubah cuma penandanya: "Sudah dikumpulkan".
  const tugasAktif: TugasRow[] = [];
  const tugasMendatang: TugasRow[] = [];
  const tugasSelesai: TugasRow[] = [];

  for (const t of tugasList) {
    const p = pengumpulanByTugas[t.id];
    const sudahDinilai = p?.nilai !== null && p?.nilai !== undefined;
    const fase = faseTugas(t, now);

    if (sudahDinilai) tugasSelesai.push(t);
    else if (fase === "belum_dibuka") tugasMendatang.push(t);
    else if (bolehMengumpulkan(t, now)) tugasAktif.push(t);
    else tugasSelesai.push(t);
  }

  tugasAktif.sort(
    (a, b) => new Date(a.tenggat).getTime() - new Date(b.tenggat).getTime()
  );
  tugasMendatang.sort(
    (a, b) => new Date(a.dibuka_at).getTime() - new Date(b.dibuka_at).getTime()
  );
  tugasSelesai.sort(
    (a, b) => new Date(b.tenggat).getTime() - new Date(a.tenggat).getTime()
  );

  const adaFiturTugas = tugasList.length > 0;

  // ── Forum ──
  //
  // Dua sumbu saja (bukan tiga seperti tugas) — lihat penjelasan di
  // kepala komponen ini.
  const forumAktif: ForumRow[] = [];
  const forumMendatang: ForumRow[] = [];
  const forumSelesai: ForumRow[] = [];

  for (const f of forumList) {
    const fase = faseForum(f, now);
    if (fase === "berlangsung") forumAktif.push(f);
    else if (fase === "belum_buka") forumMendatang.push(f);
    else forumSelesai.push(f);
  }

  forumAktif.sort(
    (a, b) => new Date(a.ditutup_at).getTime() - new Date(b.ditutup_at).getTime()
  );
  forumMendatang.sort(
    (a, b) => new Date(a.dibuka_at).getTime() - new Date(b.dibuka_at).getTime()
  );
  forumSelesai.sort(
    (a, b) => new Date(b.ditutup_at).getTime() - new Date(a.ditutup_at).getTime()
  );

  const adaFiturForum = forumList.length > 0;

  return (
    <div className="space-y-6">
      {pesan && (
        <div className="animasi-muncul rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <i className="fas fa-circle-check mr-2" aria-hidden />
          {pesan}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-8">
          <section>
            <JudulSeksi ikon="fa-file-signature" warna="text-[--primary]">
              Ujian &amp; Kuis Hari Ini
            </JudulSeksi>

            {berlangsung.length === 0 ? (
              <div className="card-mewah px-5 py-12 text-center text-slate-500">
                <i
                  className="fas fa-mug-hot mb-4 block text-4xl opacity-40"
                  aria-hidden
                />
                <p className="text-[1.05rem] font-medium">
                  {sisaMsBerikutnya !== null && sisaMsBerikutnya > 0
                    ? `${labelKerjakan(berikutnya!)} "${berikutnya!.nama}" akan terbuka dalam ${formatSisaSingkat(
                        sisaMsBerikutnya
                      )}.`
                    : riwayat.length > 0
                      ? "Tidak ada ujian atau kuis yang perlu dikerjakan sekarang."
                      : "Belum ada ujian atau kuis yang sedang berlangsung."}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Halaman ini memperbarui diri sendiri — begitu jadwalnya
                  tiba, kartu ujian langsung muncul di sini tanpa perlu
                  disegarkan.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {berlangsung.map((m) => (
                  <MapelCard key={m.id} mapel={m} />
                ))}
              </div>
            )}
          </section>

          {/*
            Seksi tugas hanya muncul kalau memang ADA tugas untuk siswa
            ini. Bukan sekadar kerapian: di jenjang yang migrasi 0019-nya
            belum jalan, daftarnya selalu kosong — dan judul seksi
            "Tugas" dengan keadaan kosong permanen di bawahnya membuat
            siswa mengira dia kehilangan sesuatu.
          */}
          {adaFiturTugas && (
            <section>
              <JudulSeksi ikon="fa-file-arrow-up" warna="text-[--primary]">
                Tugas
              </JudulSeksi>

              {tugasAktif.length === 0 ? (
                <div className="card-mewah px-5 py-8 text-center text-slate-500">
                  <p className="text-sm font-medium">
                    {tugasMendatang.length > 0
                      ? `Belum ada tugas yang perlu dikerjakan. "${tugasMendatang[0].judul}" dibuka ${formatTenggat(tugasMendatang[0].dibuka_at)}.`
                      : "Tidak ada tugas yang perlu dikumpulkan sekarang."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tugasAktif.map((t) => (
                    <TugasCard
                      key={t.id}
                      tugas={t}
                      pengumpulan={pengumpulanByTugas[t.id]}
                      now={now}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/*
            Sama alasannya dengan seksi Tugas: seksi ini hanya muncul kalau
            memang ada forum untuk siswa ini — di jenjang yang migrasi
            0020-nya belum jalan, daftarnya selalu kosong.
          */}
          {adaFiturForum && (
            <section>
              <JudulSeksi ikon="fa-comments" warna="text-[--primary]">
                Forum Diskusi
              </JudulSeksi>

              {forumAktif.length === 0 ? (
                <div className="card-mewah px-5 py-8 text-center text-slate-500">
                  <p className="text-sm font-medium">
                    {forumMendatang.length > 0
                      ? `Belum ada forum yang bisa dibuka. Forum "${forumMendatang[0].event?.nama ?? "Diskusi"}" dibuka ${formatTenggat(forumMendatang[0].dibuka_at)}.`
                      : "Tidak ada forum yang sedang berlangsung."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {forumAktif.map((f) => (
                    <ForumCard key={f.id} forum={f} now={now} />
                  ))}
                </div>
              )}
            </section>
          )}

          <section>
            <JudulSeksi ikon="fa-clock-rotate-left" warna="text-[--success]">
              Riwayat
            </JudulSeksi>

            <div className="card-mewah p-4">
              {riwayat.length === 0 &&
              tugasSelesai.length === 0 &&
              forumSelesai.length === 0 ? (
                <div className="py-8 text-center">
                  <i
                    className="fas fa-folder-open mb-2 block text-3xl text-slate-300"
                    aria-hidden
                  />
                  <p className="text-sm text-slate-400">
                    Belum ada yang selesai.
                  </p>
                </div>
              ) : (
                <div className="scroll-halus max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
                  {riwayat.map((m) => {
                    const submittedAt = submittedByMapel[m.id] ?? null;
                    return (
                      <div
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-paper px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                              {labelKerjakan(m)}
                            </span>
                            {m.event?.nama ?? "Event"}
                          </p>
                          <p className="font-serif text-sm font-semibold text-ink">
                            {m.nama}
                          </p>
                          <p className="text-[0.72rem] text-slate-500">
                            {submittedAt
                              ? `Dikumpulkan ${formatWaktu(submittedAt)}`
                              : formatWaktu(m.waktu_mulai)}
                          </p>
                        </div>
                        {submittedAt ? (
                          <span className="badge-ok">
                            <i className="fas fa-check" aria-hidden /> Sudah
                            dikerjakan
                          </span>
                        ) : (
                          <span className="badge-danger">
                            <i className="fas fa-xmark" aria-hidden /> Tidak
                            dikerjakan
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {tugasSelesai.map((t) => {
                    const p = pengumpulanByTugas[t.id];
                    const dinilai = p?.nilai !== null && p?.nilai !== undefined;
                    return (
                      <Link
                        key={t.id}
                        href={`/siswa/tugas/${t.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-paper px-4 py-3 transition-colors hover:border-slate-200"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                              Tugas
                            </span>
                            {t.event?.nama ?? "Kegiatan"}
                          </p>
                          <p className="font-serif text-sm font-semibold text-ink">
                            {t.judul}
                          </p>
                          <p className="text-[0.72rem] text-slate-500">
                            Tenggat {formatTenggat(t.tenggat)}
                          </p>
                        </div>
                        {dinilai ? (
                          <span className="badge-ok">
                            <i className="fas fa-star" aria-hidden /> Nilai{" "}
                            {p!.nilai}
                          </span>
                        ) : p?.submitted_at ? (
                          <span className="badge-ok">
                            <i className="fas fa-check" aria-hidden /> Sudah
                            dikumpulkan
                          </span>
                        ) : (
                          <span className="badge-danger">
                            <i className="fas fa-xmark" aria-hidden /> Tidak
                            dikumpulkan
                          </span>
                        )}
                      </Link>
                    );
                  })}

                  {forumSelesai.map((f) => (
                    <Link
                      key={f.id}
                      href={`/siswa/forum/${f.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-paper px-4 py-3 transition-colors hover:border-slate-200"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                            Forum
                          </span>
                          {f.event?.nama ?? "Kegiatan"}
                        </p>
                        <p className="text-[0.72rem] text-slate-500">
                          Ditutup {formatTenggat(f.ditutup_at)}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.7rem] font-semibold text-slate-500">
                        <i className="fas fa-book-open mr-1" aria-hidden />
                        Baca ulang
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section>
            <JudulSeksi ikon="fa-calendar-days" warna="text-[--primary]">
              Jadwal Mendatang
            </JudulSeksi>

            <div className="card-mewah p-5">
              {akanDatang.length === 0 &&
              tugasMendatang.length === 0 &&
              forumMendatang.length === 0 ? (
                <p className="py-5 text-center text-sm font-medium text-slate-400">
                  Belum ada yang dijadwalkan.
                </p>
              ) : (
                <ul className="space-y-3">
                  {akanDatang.map((m, idx) => (
                    <li
                      key={m.id}
                      className="border-b border-dashed border-slate-200 pb-3 last:border-0 last:pb-0"
                    >
                      <p className="font-serif text-sm font-semibold text-ink">
                        {m.nama}
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-slate-500">
                        <i
                          className="fas fa-clock mr-1.5 text-slate-400"
                          aria-hidden
                        />
                        {formatWaktu(m.waktu_mulai)}
                      </p>
                      {m.durasi_menit && (
                        <p className="mt-0.5 text-[0.75rem] text-slate-500">
                          <i
                            className="fas fa-hourglass-half mr-1.5 text-slate-400"
                            aria-hidden
                          />
                          {m.durasi_menit} menit pengerjaan
                        </p>
                      )}
                      {idx === 0 && (
                        <p className="mt-1 text-[0.72rem] font-semibold text-[--primary]">
                          Terbuka dalam {formatSisaSingkat(
                            new Date(m.waktu_mulai).getTime() - now
                          )}
                        </p>
                      )}
                    </li>
                  ))}

                  {tugasMendatang.map((t) => (
                    <li
                      key={t.id}
                      className="border-b border-dashed border-slate-200 pb-3 last:border-0 last:pb-0"
                    >
                      <p className="font-serif text-sm font-semibold text-ink">
                        {t.judul}
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-slate-500">
                        <i
                          className="fas fa-file-arrow-up mr-1.5 text-slate-400"
                          aria-hidden
                        />
                        Tugas · dibuka {formatTenggat(t.dibuka_at)}
                      </p>
                    </li>
                  ))}

                  {forumMendatang.map((f) => (
                    <li
                      key={f.id}
                      className="border-b border-dashed border-slate-200 pb-3 last:border-0 last:pb-0"
                    >
                      <p className="font-serif text-sm font-semibold text-ink">
                        {f.event?.nama ?? "Forum"}
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-slate-500">
                        <i
                          className="fas fa-comments mr-1.5 text-slate-400"
                          aria-hidden
                        />
                        Forum · dibuka {formatTenggat(f.dibuka_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50 p-5">
            <p className="mb-2 text-[0.8rem] font-extrabold uppercase tracking-wide text-sky-700">
              <i className="fas fa-lightbulb mr-1.5 text-amber-500" aria-hidden />
              Tips
            </p>
            <p className="text-[0.82rem] leading-relaxed text-sky-900">
              Halaman ini memakai jam server, bukan jam HP-mu — jadi kalau
              jam HP-mu sedikit meleset, kartu ujian dan tenggat tugas tetap
              muncul di waktu yang tepat tanpa perlu kamu atur ulang.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function JudulSeksi({
  ikon,
  warna,
  children,
}: {
  ikon: string;
  warna: string;
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-3.5 flex items-center gap-2.5 font-serif text-[1.05rem] font-bold text-ink">
      <i className={`fas ${ikon} ${warna}`} aria-hidden />
      {children}
    </h2>
  );
}

/**
 * Kartu mapel di "Ujian Hari Ini". Tombolnya `TombolKerjakanUjian`
 * (bukan `<Link>` polos) — begitu diklik, tombol langsung berubah jadi
 * spinner + disabled, jadi siswa tahu ini "lagi memuat", bukan HP-nya
 * macet, dan nggak keburu spam klik "Kerjakan" berkali-kali sebelum
 * halaman ujian selesai dirender di server.
 */
function MapelCard({ mapel }: { mapel: MapelRow }) {
  const label = labelKerjakan(mapel);
  return (
    <div className="card-mewah flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-[--primary] p-5">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
            {label}
          </span>
          {mapel.event?.nama ?? "Event"}
        </p>
        <p className="font-serif text-lg font-bold text-ink">{mapel.nama}</p>
        <p className="mt-1 text-[0.78rem] text-slate-500">
          <i className="fas fa-clock mr-1.5 text-slate-400" aria-hidden />
          Dibuka {formatWaktu(mapel.waktu_mulai)} – ditutup{" "}
          {formatWaktu(mapel.waktu_selesai)}
        </p>
        {mapel.durasi_menit && (
          <p className="mt-0.5 text-[0.78rem] font-medium text-slate-600">
            <i
              className="fas fa-hourglass-half mr-1.5 text-slate-400"
              aria-hidden
            />
            Waktu pengerjaan {mapel.durasi_menit} menit sejak kamu menekan
            &ldquo;Kerjakan&rdquo;
          </p>
        )}
      </div>

      <TombolKerjakanUjian mapelId={mapel.id} />
    </div>
  );
}

/**
 * Kartu tugas. Beda dari kartu ujian di satu hal yang disengaja:
 * tombolnya `<Link>` biasa, tanpa spinner.
 *
 * Alasannya bukan kemalasan. `TombolKerjakanUjian` menahan klik ganda
 * karena membuka ujian memicu RPC `mulai_ujian` — klik kedua bisa
 * memulai timer dua kali. Membuka halaman tugas tidak menulis apa pun;
 * klik ganda paling buruk memuat halaman yang sama dua kali. Memakai
 * komponen bertimer di sini berarti meminjam kerumitan yang tidak
 * menjawab masalah apa pun di sini.
 */
function TugasCard({
  tugas,
  pengumpulan,
  now,
}: {
  tugas: TugasRow;
  pengumpulan: PengumpulanRingkasRow | undefined;
  now: number;
}) {
  const sisaMs = new Date(tugas.tenggat).getTime() - now;
  const terlambat = sisaMs < 0;
  const sudahKumpul = Boolean(pengumpulan?.submitted_at);

  return (
    <div
      className={`card-mewah flex flex-wrap items-center justify-between gap-4 border-l-4 p-5 ${
        sudahKumpul
          ? "border-l-emerald-500"
          : terlambat
            ? "border-l-amber-500"
            : "border-l-[--primary]"
      }`}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
            Tugas
          </span>
          {tugas.event?.nama ?? "Kegiatan"}
        </p>
        <p className="font-serif text-lg font-bold text-ink">{tugas.judul}</p>

        <p className="mt-1 text-[0.78rem] text-slate-500">
          <i className="fas fa-hourglass-end mr-1.5 text-slate-400" aria-hidden />
          Tenggat {formatTenggat(tugas.tenggat)}
          {!terlambat && (
            <span className="ml-1 font-medium text-slate-600">
              · sisa {formatSisaSingkat(sisaMs)}
            </span>
          )}
        </p>

        {sudahKumpul ? (
          <p className="mt-0.5 text-[0.78rem] font-medium text-emerald-700">
            <i className="fas fa-circle-check mr-1.5" aria-hidden />
            Sudah dikumpulkan — masih bisa kamu perbaiki sampai tenggat.
          </p>
        ) : terlambat ? (
          <p className="mt-0.5 text-[0.78rem] font-medium text-amber-700">
            <i className="fas fa-triangle-exclamation mr-1.5" aria-hidden />
            Tenggat sudah lewat, tapi masih diterima dengan tanda terlambat.
          </p>
        ) : (
          tugas.minta_berkas && (
            <p className="mt-0.5 text-[0.78rem] text-slate-600">
              <i className="fas fa-paperclip mr-1.5 text-slate-400" aria-hidden />
              Perlu melampirkan berkas atau foto.
            </p>
          )
        )}
      </div>

      <Link
        href={`/siswa/tugas/${tugas.id}`}
        className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink-light"
      >
        {sudahKumpul ? "Lihat" : "Kerjakan"}
      </Link>
    </div>
  );
}

/**
 * Kartu forum. Tidak ada status "sudah/belum dikerjakan" seperti kartu
 * tugas — forum tidak punya keadaan selesai untuk SATU siswa, cuma
 * jendela waktu yang sama untuk sekelas. Yang ditonjolkan cuma satu
 * angka: berapa lama lagi sampai ditutup, supaya siswa tahu kapan
 * kesempatan bicaranya habis.
 */
function ForumCard({ forum, now }: { forum: ForumRow; now: number }) {
  const sisaMs = new Date(forum.ditutup_at).getTime() - now;

  return (
    <div className="card-mewah flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-[--primary] p-5">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
            Forum
          </span>
        </p>
        <p className="font-serif text-lg font-bold text-ink">
          {forum.event?.nama ?? "Forum Diskusi"}
        </p>
        <p className="mt-1 text-[0.78rem] text-slate-500">
          <i className="fas fa-hourglass-end mr-1.5 text-slate-400" aria-hidden />
          Ditutup {formatTenggat(forum.ditutup_at)}
          <span className="ml-1 font-medium text-slate-600">
            · sisa {formatSisaSingkat(sisaMs)}
          </span>
        </p>
      </div>

      <Link
        href={`/siswa/forum/${forum.id}`}
        className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink-light"
      >
        Buka
      </Link>
    </div>
  );
}
