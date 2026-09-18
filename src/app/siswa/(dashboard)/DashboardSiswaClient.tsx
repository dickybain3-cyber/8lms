"use client";

import { useEffect, useMemo, useState } from "react";
import { formatWaktu } from "@/lib/ujian";
import TombolKerjakanUjian from "@/components/TombolKerjakanUjian";

export type MapelRow = {
  id: string;
  nama: string;
  waktu_mulai: string;
  waktu_selesai: string;
  durasi_menit: number | null;
  event: { nama: string } | null;
};

/**
 * ── KENAPA JAM BERDETAK DI SINI, BUKAN CUMA SEKALI SAAT MOUNT ──
 *
 * Kalau selisih jam server dihitung sekali lalu dipakai statis, dashboard
 * yang dibuka pukul 07.55 tidak akan pernah tahu bahwa pukul 08.00 sudah
 * lewat — kecuali di-refresh manual, persis masalah yang mau dihilangkan.
 * Jadi yang disimpan adalah OFFSET (selisih jam server - jam device),
 * dan "jam sekarang" dihitung ulang tiap detik dari `Date.now() + offset`.
 * Device yang jamnya meleset tetap dapat jam yang benar; yang berubah
 * cuma perlu tick tiap detik, bukan tiap render dari server.
 */
export default function DashboardSiswaClient({
  mapelList,
  submittedByMapel,
  waktuServer,
  pesan,
}: {
  mapelList: MapelRow[];
  submittedByMapel: Record<string, string | null>;
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
  // Jadwal mendatang diurutkan naik — yang paling dekat waktunya di atas,
  // supaya siswa yang menggulir sisi kanan tidak perlu mencari mana yang
  // paling mendesak.
  akanDatang.sort(
    (a, b) =>
      new Date(a.waktu_mulai).getTime() - new Date(b.waktu_mulai).getTime()
  );

  // Mapel paling dekat waktu bukanya — dipakai untuk hitung mundur kecil
  // di kartu "Jadwal Mendatang" teratas, supaya siswa tahu persis berapa
  // lama lagi tanpa harus menghitung sendiri dari jam.
  const berikutnya = akanDatang[0];
  const sisaMsBerikutnya = berikutnya
    ? new Date(berikutnya.waktu_mulai).getTime() - now
    : null;

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
              Ujian Hari Ini
            </JudulSeksi>

            {berlangsung.length === 0 ? (
              <div className="card-mewah px-5 py-12 text-center text-slate-500">
                <i
                  className="fas fa-mug-hot mb-4 block text-4xl opacity-40"
                  aria-hidden
                />
                <p className="text-[1.05rem] font-medium">
                  {sisaMsBerikutnya !== null && sisaMsBerikutnya > 0
                    ? `Ujian "${berikutnya!.nama}" akan terbuka dalam ${formatSisaSingkat(
                        sisaMsBerikutnya
                      )}.`
                    : riwayat.length > 0
                      ? "Tidak ada ujian yang perlu dikerjakan sekarang."
                      : "Belum ada ujian yang sedang berlangsung."}
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

          <section>
            <JudulSeksi ikon="fa-clock-rotate-left" warna="text-[--success]">
              Riwayat Ujian
            </JudulSeksi>

            <div className="card-mewah p-4">
              {riwayat.length === 0 ? (
                <div className="py-8 text-center">
                  <i
                    className="fas fa-folder-open mb-2 block text-3xl text-slate-300"
                    aria-hidden
                  />
                  <p className="text-sm text-slate-400">
                    Belum ada ujian yang selesai.
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
                          <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">
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
              {akanDatang.length === 0 ? (
                <p className="py-5 text-center text-sm font-medium text-slate-400">
                  Belum ada ujian yang dijadwalkan.
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
                </ul>
              )}
            </div>
          </section>

          <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50 p-5">
            <p className="mb-2 text-[0.8rem] font-extrabold uppercase tracking-wide text-sky-700">
              <i className="fas fa-lightbulb mr-1.5 text-amber-500" aria-hidden />
              Tips Ujian
            </p>
            <p className="text-[0.82rem] leading-relaxed text-sky-900">
              Halaman ini memakai jam server, bukan jam HP-mu — jadi kalau
              jam HP-mu sedikit meleset, kartu ujian tetap muncul di waktu
              yang tepat tanpa perlu kamu atur ulang.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** "3 jam 12 menit" / "45 menit" / "kurang dari semenit". */
function formatSisaSingkat(ms: number): string {
  if (ms <= 0) return "sebentar lagi";
  const totalMenit = Math.ceil(ms / 60000);
  const jam = Math.floor(totalMenit / 60);
  const menit = totalMenit % 60;
  if (jam === 0) return menit <= 0 ? "kurang dari semenit" : `${menit} menit`;
  return menit === 0 ? `${jam} jam` : `${jam} jam ${menit} menit`;
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
 * Kartu mapel di "Ujian Hari Ini". Tombolnya sekarang `TombolKerjakanUjian`
 * (bukan `<Link>` polos) — begitu diklik, tombol langsung berubah jadi
 * spinner + disabled, jadi siswa tahu ini "lagi memuat", bukan HP-nya
 * macet, dan nggak keburu spam klik "Kerjakan" berkali-kali sebelum
 * halaman ujian selesai dirender di server.
 */
function MapelCard({ mapel }: { mapel: MapelRow }) {
  return (
    <div className="card-mewah flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-[--primary] p-5">
      <div className="min-w-0">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">
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
            &ldquo;Mulai Ujian&rdquo;
          </p>
        )}
      </div>

      <TombolKerjakanUjian mapelId={mapel.id} />
    </div>
  );
}