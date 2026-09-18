import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatWaktu } from "@/lib/ujian";

type MapelRow = {
  id: string;
  nama: string;
  waktu_mulai: string;
  waktu_selesai: string;
  durasi_menit: number | null;
  event: { nama: string } | null;
};

/**
 * Dashboard siswa.
 *
 * ── REVISI: MAPEL YANG SUDAH DIKUMPULKAN PINDAH KE RIWAYAT ──
 *
 * Versi sebelumnya mengelompokkan mapel MURNI berdasarkan jam: selama
 * jam tutup belum lewat, mapel tetap duduk di "Ujian Hari Ini" walau
 * siswa sudah mengumpulkan jawabannya — hanya tombol "Kerjakan"-nya yang
 * berganti jadi label. Akibatnya siswa yang sudah selesai masih melihat
 * mapelnya di daftar pekerjaan hari ini, dan bagian "Ujian Telah
 * Diselesaikan" di bawahnya tetap kosong sampai jam ujian berakhir. Dua
 * hal yang saling bertentangan di satu layar, dan keduanya tampak resmi.
 *
 * Sekarang penentunya ada dua, dengan urutan yang jelas:
 *
 *   1. Sudah punya `submitted_at`?  -> RIWAYAT, apa pun jamnya. Ini yang
 *      paling menentukan, karena bagi siswa pekerjaan itu memang sudah
 *      betul-betul selesai.
 *   2. Kalau belum: jam yang menentukan (belum dibuka / sedang dibuka /
 *      sudah ditutup). Yang sudah ditutup tanpa pernah dikumpulkan tetap
 *      masuk riwayat, tapi ditandai "Tidak dikerjakan" — bedanya harus
 *      terlihat, bukan disamarkan.
 */
export default async function SiswaDashboardPage({
  searchParams,
}: {
  searchParams: { pesan?: string };
}) {
  const supabase = createClient();

  // `mapel_select_siswa` sudah memfilter query ini ke mapel yang ditarget
  // ke kelas siswa yang login, terlepas dari jam mulai (lihat
  // docs/skema-database.md) — jadi aman ambil semua tanpa filter waktu di
  // sini, pengelompokan status dilakukan di bawah.
  const { data: mapelListRaw } = await supabase
    .from("mapel")
    .select("id, nama, waktu_mulai, waktu_selesai, durasi_menit, event(nama)")
    .order("waktu_mulai");

  const mapelList = (mapelListRaw ?? []) as unknown as MapelRow[];

  // RLS `jawaban_select_own` otomatis membatasi ke baris siswa yang login
  // sendiri, jadi tidak perlu filter siswa_id manual di sini.
  const { data: jawabanListRaw } = await supabase
    .from("jawaban_siswa")
    .select("mapel_id, submitted_at");

  const submittedByMapel = new Map(
    (jawabanListRaw ?? []).map((j) => [
      j.mapel_id,
      j.submitted_at as string | null,
    ])
  );

  const now = Date.now();
  const berlangsung: MapelRow[] = [];
  const akanDatang: MapelRow[] = [];
  const riwayat: MapelRow[] = [];

  for (const m of mapelList) {
    const mulai = new Date(m.waktu_mulai).getTime();
    const habis = new Date(m.waktu_selesai).getTime();
    const sudahKumpul = Boolean(submittedByMapel.get(m.id));

    if (sudahKumpul) riwayat.push(m);
    else if (now < mulai) akanDatang.push(m);
    else if (now > habis) riwayat.push(m);
    else berlangsung.push(m);
  }

  // Riwayat diurutkan dari yang paling baru — yang baru saja dikumpulkan
  // harus berada di baris paling atas, karena itulah yang dicari siswa
  // begitu dia mendarat di sini sesudah menekan Kumpulkan.
  riwayat.sort(
    (a, b) =>
      new Date(b.waktu_mulai).getTime() - new Date(a.waktu_mulai).getTime()
  );

  return (
    <div className="space-y-6">
      {searchParams.pesan && (
        <div className="animasi-muncul rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <i className="fas fa-circle-check mr-2" aria-hidden />
          {searchParams.pesan}
        </div>
      )}

      {/* Dua kolom di layar lebar (isi utama + sisi kanan), menumpuk di HP. */}
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
                  {riwayat.length > 0
                    ? "Tidak ada ujian yang perlu dikerjakan sekarang."
                    : "Belum ada ujian yang sedang berlangsung."}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Santai dulu — nanti muncul sendiri kalau waktunya tiba.
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
                    const submittedAt = submittedByMapel.get(m.id) ?? null;
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
                  {akanDatang.map((m) => (
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
              Kalau ujian belum muncul di daftar &ldquo;Ujian Hari Ini&rdquo;,
              coba segarkan halaman dan pastikan jam di perangkatmu sudah sesuai
              dengan waktu internet.
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
 * Kartu mapel di "Ujian Hari Ini". Sekarang hanya pernah dipakai untuk
 * mapel yang BELUM dikumpulkan (yang sudah, pindah ke riwayat), jadi
 * tombolnya tidak lagi punya cabang "sudah dikumpulkan" — cabang yang
 * dulu ada di sini justru yang membuat mapel selesai betah menetap di
 * daftar pekerjaan hari ini.
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

      <Link href={`/siswa/ujian/${mapel.id}`} className="btn-primary">
        <i className="fas fa-pen-to-square" aria-hidden />
        Kerjakan
      </Link>
    </div>
  );
}
