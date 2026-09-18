"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatSisaWaktu, formatWaktu, soalSudahTerjawab } from "@/lib/ujian";
import { TIPE_LABEL } from "@/lib/soal";
import type { SoalSiswa, TipeSoal } from "@/types";
import SoalViewer from "@/components/siswa/SoalViewer/SoalViewer";
import {
  simpanJawabanLokal,
  bacaJawabanLokal,
  hapusJawabanLokal,
  jedaSinkronAcakMs,
  jitterSubmitMs,
} from "@/lib/autosave-lokal";
import {
  unduhPaketSoal,
  bacaPaketSoal,
  hapusPaketSoal,
} from "@/lib/paket-soal-lokal";

type SaveStatus = "tersimpan" | "menyimpan" | "menunggu" | "gagal";
type StatusNavSoal = "terjawab" | "dilihat" | "belum-dilihat";

const AMBANG_WAKTU_KRITIS_MS = 5 * 60 * 1000;

/** Jeda detak monitoring ke server. Dibuat acak 50–80 detik per siswa dengan
 *  alasan yang sama seperti jeda autosave: 600 siswa yang ping di detik yang
 *  sama persis akan membuat lonjakan berkala yang tidak perlu. */
function jedaPingMs(): number {
  return 50_000 + Math.floor(Math.random() * 30_000);
}

/**
 * REVISI TIMER — inti perubahan sesi ini.
 *
 * Sebelumnya hitung mundur siswa = selisih jam BROWSER terhadap
 * `mapel.waktu_selesai`. Dua masalah serius di situ:
 *
 *   1. Jam browser bisa salah. Di lab sekolah ini bukan kasus langka, dan
 *      siswa yang jamnya meleset akan melihat sisa waktu yang salah — bisa
 *      merasa masih punya 20 menit padahal servernya sudah menolak tulisan.
 *      Sekarang server mengirim `server_now` bersama `deadline`; selisihnya
 *      terhadap jam lokal dipakai sebagai offset sepanjang sesi.
 *
 *   2. Jendela global tidak adil. Siswa yang masuk terlambat kehilangan
 *      waktu pengerjaan. Sekarang setiap siswa mendapat `durasi_menit`
 *      penuh sejak menekan "Mulai Ujian", tetap dibatasi jam tutup ujian.
 *
 * Deadline TIDAK PERNAH dihitung di sini — selalu datang dari RPC
 * `mulai_ujian` (lihat 0011_ujian_pro.sql), yang juga jadi satu-satunya
 * tempat `mulai_at` diisi, sehingga tidak ada jalur di client yang bisa
 * memperpanjang waktunya sendiri.
 */
export default function ExamClient({
  mapel,
  siswaId,
  soalList: soalListDariServer,
  jawabanAwal,
  submittedAtAwal,
  sudahMulai,
}: {
  mapel: {
    id: string;
    nama: string;
    waktu_mulai: string;
    waktu_selesai: string;
    durasi_menit: number | null;
  };
  siswaId: string;
  soalList: SoalSiswa[];
  jawabanAwal: Record<string, unknown>;
  submittedAtAwal: string | null;
  /** true kalau siswa pernah menekan Mulai Ujian (jawaban_siswa.mulai_at terisi). */
  sudahMulai: boolean;
}) {
  const router = useRouter();

  /**
   * SOAL: server dulu, paket lokal sebagai jaring pengaman.
   *
   * Nilai awalnya SELALU `soalListDariServer` — bukan hasil baca
   * localStorage. Kalau state awal dibaca dari localStorage, render
   * pertama di server (yang tidak punya localStorage) berbeda dari
   * render pertama di browser, dan React membuang seluruh pohonnya lalu
   * merender ulang: di halaman ujian itu terlihat sebagai soal yang
   * berkedip sesaat setelah terbuka. Paket lokal baru dipakai di efek
   * di bawah, dan hanya kalau server memang tidak mengirim apa-apa.
   */
  const [soalList, setSoalList] = useState<SoalSiswa[]>(soalListDariServer);
  const [dariPaketLokal, setDariPaketLokal] = useState(false);

  useEffect(() => {
    if (soalListDariServer.length > 0) {
      setSoalList(soalListDariServer);
      setDariPaketLokal(false);
      return;
    }
    // Server tidak mengirim soal — hampir selalu berarti RPC-nya gagal
    // karena koneksi putus di tengah ujian, tepat saat halaman dimuat
    // ulang. Paket yang diunduh saat menekan "Mulai Ujian" menyelamatkan
    // keadaan ini: ujiannya lanjut, jawabannya tetap tersimpan lokal,
    // dan tidak ada yang perlu memanggil pengawas.
    const paket = bacaPaketSoal(siswaId, mapel.id);
    if (paket && paket.length > 0) {
      setSoalList(paket);
      setDariPaketLokal(true);
    }
  }, [soalListDariServer, siswaId, mapel.id]);

  const [jawaban, setJawaban] = useState<Record<string, unknown>>(
    () => bacaJawabanLokal(siswaId, mapel.id) ?? jawabanAwal
  );
  const [submittedAt, setSubmittedAt] = useState<string | null>(submittedAtAwal);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("tersimpan");
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  /**
   * TAHAP PENGUMPULAN — lihat penjelasan panjang di dekat komponen
   * `DialogPengumpulan` di bawah. Ringkasnya: satu dialog "yakin?" ternyata
   * tidak cukup, karena tombol Kumpulkan berada di bilah bawah yang paling
   * sering tersenggol jempol.
   *
   *   null            -> tidak ada dialog
   *   "kosong"        -> belum menjawab apa pun; DITOLAK, hanya tombol OK
   *   "belum-lengkap" -> masih ada yang kosong; Lanjutkan / Kembali Kerjakan
   *   "final"         -> konfirmasi terakhir, tombolnya baru aktif setelah
   *                      hitung mundur 3 detik
   */
  const [tahapKumpul, setTahapKumpul] = useState<
    null | "kosong" | "belum-lengkap" | "peringatan" | "final"
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [waktuHabis, setWaktuHabis] = useState(false);

  // --- Waktu (baru) ---
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  /** serverNow - clientNow saat sinkronisasi. Ditambahkan ke Date.now() tiap tick. */
  const offsetMsRef = useRef(0);
  const [memulai, setMemulai] = useState(false);
  const [errorMulai, setErrorMulai] = useState<string | null>(null);

  /** Kemajuan pengunduhan paket soal di layar konfirmasi mulai. */
  const [unduhan, setUnduhan] = useState<{
    fase: "idle" | "mengunduh" | "selesai";
    selesai: number;
    total: number;
  }>({ fase: "idle", selesai: 0, total: 0 });

  const jawabanRef = useRef(jawaban);
  useEffect(() => {
    jawabanRef.current = jawaban;
  }, [jawaban]);

  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dirtyRef = useRef(false);
  const autoSubmittedRef = useRef(false);

  const readOnly = submittedAt !== null || waktuHabis;

  const [activeIndex, setActiveIndex] = useState(0);
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => new Set());
  const [navOpen, setNavOpen] = useState(false);

  const soalAktif = soalList[activeIndex] as SoalSiswa | undefined;

  useEffect(() => {
    const soal = soalList[activeIndex];
    if (!soal) return;
    setViewedIds((prev) => {
      if (prev.has(soal.id)) return prev;
      const next = new Set(prev);
      next.add(soal.id);
      return next;
    });
  }, [activeIndex, soalList]);

  /**
   * GULIR OTOMATIS KE SOAL — perbaikan utama sesi ini di sisi siswa.
   *
   * ── MASALAHNYA ──
   *
   * Tombol Sebelumnya/Berikutnya ada di bilah bawah yang melekat di
   * layar, dan navigasi nomor soal ada di panel yang juga di bawah.
   * Artinya setiap kali siswa berpindah soal, dia sedang berada di
   * BAGIAN BAWAH halaman. React mengganti isi soalnya, tapi posisi
   * gulir tidak ikut berpindah — jadi yang dilihat siswa setelah
   * menekan "Berikutnya" adalah bagian TENGAH atau AKHIR soal
   * berikutnya. Untuk soal pendek efeknya cuma membingungkan; untuk
   * soal dengan teks bacaan panjang, siswa mendarat entah di mana dan
   * harus menggulir ke atas dulu untuk tahu soal nomor berapa yang
   * sedang dibuka. Dikalikan 40 soal, itu 40 kali gulir manual yang
   * tidak perlu — dengan waktu yang sedang berjalan.
   *
   * ── KENAPA PAKAI ref + useEffect, BUKAN scroll LANGSUNG DI bukaSoal ──
   *
   * Saat `bukaSoal` berjalan, DOM masih memuat soal LAMA. Menggulir di
   * situ berarti menggulir ke posisi elemen yang sebentar lagi diganti
   * dan tingginya berbeda. Efek di bawah berjalan setelah React selesai
   * memasang soal baru, jadi yang diukur adalah tinggi yang sungguhan.
   *
   * ── KENAPA TIDAK scrollIntoView SAJA ──
   *
   * Header ujian (judul mapel + hitung mundur) `sticky` di atas.
   * `scrollIntoView` akan menempatkan soal tepat di batas atas viewport
   * — yang artinya baris pertama soal bersembunyi DI BALIK header.
   * Karena itu posisinya dihitung manual dan tinggi header dikurangkan.
   */
  const headerRef = useRef<HTMLElement>(null);
  const areaSoalRef = useRef<HTMLDivElement>(null);
  const perluGulirRef = useRef(false);

  function bukaSoal(idx: number) {
    if (idx < 0 || idx >= soalList.length) return;
    setActiveIndex(idx);
    setNavOpen(false);
    perluGulirRef.current = true;
  }

  useEffect(() => {
    if (!perluGulirRef.current) return;
    perluGulirRef.current = false;

    const el = areaSoalRef.current;
    if (!el) return;

    const tinggiHeader = headerRef.current?.offsetHeight ?? 0;
    // 12 px napas di bawah header supaya soal tidak menempel garis.
    const target = Math.max(
      0,
      el.getBoundingClientRect().top + window.scrollY - tinggiHeader - 12
    );

    // Animasi halus hanya kalau jaraknya masuk akal DAN siswa tidak
    // meminta pengurangan animasi di setelan perangkatnya. Untuk
    // lompatan jauh (mis. dari soal 40 ke soal 1 lewat panel nomor),
    // gulir animasi di HP kelas bawah bisa memakan lebih dari satu
    // detik penuh dan terasa seperti aplikasi yang macet — lompat
    // langsung justru terasa lebih cepat dan tidak ada yang hilang.
    const jarak = Math.abs(window.scrollY - target);
    const kurangiGerak =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({
      top: target,
      behavior: kurangiGerak || jarak > 2200 ? "auto" : "smooth",
    });
  }, [activeIndex]);

  function statusNavSoal(soal: SoalSiswa): StatusNavSoal {
    if (soalSudahTerjawab(soal, jawaban[soal.id])) return "terjawab";
    if (viewedIds.has(soal.id)) return "dilihat";
    return "belum-dilihat";
  }

  const jumlahTerjawab = useMemo(
    () => soalList.filter((s) => soalSudahTerjawab(s, jawaban[s.id])).length,
    [soalList, jawaban]
  );

  const persenProgress =
    soalList.length === 0
      ? 0
      : Math.round((jumlahTerjawab / soalList.length) * 100);

  // -------------------------------------------------------------------------
  // Mulai ujian / sinkronisasi waktu
  // -------------------------------------------------------------------------
  const sinkronWaktu = useCallback(async (): Promise<boolean> => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("mulai_ujian", {
      p_mapel_id: mapel.id,
    });

    if (error) {
      setErrorMulai(error.message);
      return false;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.deadline) {
      setErrorMulai("Server tidak mengembalikan batas waktu ujian.");
      return false;
    }

    offsetMsRef.current = new Date(row.server_now).getTime() - Date.now();
    setDeadlineMs(new Date(row.deadline).getTime());
    if (row.submitted_at) setSubmittedAt(row.submitted_at);
    setErrorMulai(null);
    return true;
  }, [mapel.id]);

  // Siswa yang sudah pernah mulai (mis. refresh halaman, atau pindah
  // perangkat) langsung disinkronkan tanpa layar konfirmasi lagi — timernya
  // memang sudah berjalan sejak tadi, menampilkan tombol "Mulai" di sini
  // justru menyesatkan seolah waktunya belum jalan.
  useEffect(() => {
    if (sudahMulai && submittedAt === null) {
      void sinkronWaktu();
    }
  }, [sudahMulai, submittedAt, sinkronWaktu]);

  /**
   * UNDUH SOAL SAAT MENEKAN "MULAI UJIAN".
   *
   * Urutannya penting dan sengaja dibuat begini:
   *
   *   1. Unduh dulu (soal ke localStorage, gambar ke cache browser).
   *   2. BARU panggil `mulai_ujian` — RPC yang mengisi `mulai_at` dan
   *      memulai hitung mundur.
   *
   * Kalau dibalik, siswa dengan koneksi lambat kehilangan 15-30 detik
   * waktu ujiannya hanya untuk menunggu gambar selesai terunduh. Dengan
   * urutan ini, waktu unduh ditanggung di luar jam ujian — persis
   * alasan kenapa layar konfirmasi "Mulai Ujian" ada sejak awal.
   *
   * Kegagalan unduh TIDAK membatalkan ujian. Kalau localStorage penuh
   * atau sebagian gambar gagal, ujiannya tetap dimulai seperti sebelum
   * fitur ini ada. Yang hilang cuma lapisan pengamannya, dan itu tidak
   * sebanding dengan menahan siswa di layar persiapan.
   */
  async function tekanMulai() {
    setMemulai(true);
    setErrorMulai(null);

    if (soalList.length > 0) {
      setUnduhan({ fase: "mengunduh", selesai: 0, total: 0 });
      try {
        const hasil = await unduhPaketSoal(
          siswaId,
          mapel.id,
          soalList,
          (selesai, total) => setUnduhan({ fase: "mengunduh", selesai, total })
        );
        setUnduhan({
          fase: "selesai",
          selesai: hasil.gambarBerhasil + hasil.gambarGagal,
          total: hasil.gambarBerhasil + hasil.gambarGagal,
        });
      } catch {
        setUnduhan({ fase: "selesai", selesai: 0, total: 0 });
      }
    }

    const ok = await sinkronWaktu();
    setMemulai(false);
    setUnduhan({ fase: "idle", selesai: 0, total: 0 });
    if (ok) router.refresh();
  }

  // -------------------------------------------------------------------------
  // Simpan jawaban
  // -------------------------------------------------------------------------
  const simpanSekarang = useCallback(
    async (retryKe = 0): Promise<boolean> => {
      setSaveStatus("menyimpan");
      const supabase = createClient();
      const { error } = await supabase.from("jawaban_siswa").upsert(
        {
          siswa_id: siswaId,
          mapel_id: mapel.id,
          jawaban_jsonb: jawabanRef.current,
        },
        { onConflict: "siswa_id,mapel_id" }
      );

      if (error) {
        const errorKeamanan =
          error.message.toLowerCase().includes("row-level security") ||
          error.code === "42501";

        if (!errorKeamanan && retryKe < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryKe === 0 ? 3000 : 9000)
          );
          return simpanSekarang(retryKe + 1);
        }

        setSaveStatus("gagal");
        setSaveErrorMsg(
          errorKeamanan
            ? "Waktu ujian sudah berakhir, jawaban terakhir tersimpan tetap dihitung."
            : "Gagal menyimpan ke server — jawabanmu tetap aman tersimpan di perangkat ini dan akan dicoba lagi otomatis."
        );
        return false;
      }
      dirtyRef.current = false;
      setSaveErrorMsg(null);
      setSaveStatus("tersimpan");
      return true;
    },
    [mapel.id, siswaId]
  );

  function ubahJawaban(soalId: string, val: unknown) {
    if (readOnly) return;
    setJawaban((prev) => {
      const next = { ...prev, [soalId]: val };
      simpanJawabanLokal(siswaId, mapel.id, next);
      return next;
    });
    dirtyRef.current = true;
    setSaveStatus("menunggu");
  }

  const jedaMsRef = useRef<number>(jedaSinkronAcakMs());

  useEffect(() => {
    if (readOnly || deadlineMs === null) return;

    syncIntervalRef.current = setInterval(() => {
      if (dirtyRef.current) void simpanSekarang();
    }, jedaMsRef.current);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, deadlineMs]);

  useEffect(() => {
    if (readOnly) return;
    function handleVisibility() {
      if (document.visibilityState === "hidden" && dirtyRef.current) {
        void simpanSekarang();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [readOnly, simpanSekarang]);

  // -------------------------------------------------------------------------
  // Detak monitoring (baru)
  // -------------------------------------------------------------------------
  // Dipisah dari autosave jawaban dengan sengaja: seorang siswa bisa saja 10
  // menit membaca teks bacaan panjang tanpa mengubah satu jawaban pun. Kalau
  // detaknya menumpang pada autosave, guru akan melihat siswa itu "terputus"
  // padahal dia baik-baik saja — persis kesalahan yang membuat pengawas
  // ujian panik tanpa alasan.
  const progressRef = useRef({ persen: 0, soalAktif: 1 });
  useEffect(() => {
    progressRef.current = { persen: persenProgress, soalAktif: activeIndex + 1 };
  }, [persenProgress, activeIndex]);

  useEffect(() => {
    if (readOnly || deadlineMs === null) return;

    const supabase = createClient();
    const kirim = () => {
      void supabase.rpc("ping_ujian", {
        p_mapel_id: mapel.id,
        p_progress: progressRef.current.persen,
        p_soal_aktif: progressRef.current.soalAktif,
      });
    };

    kirim(); // sekali di awal supaya siswa langsung tampil "online" di layar guru
    const id = setInterval(kirim, jedaPingMs());
    return () => clearInterval(id);
  }, [readOnly, deadlineMs, mapel.id]);

  // -------------------------------------------------------------------------
  // Hitung mundur + auto-submit
  // -------------------------------------------------------------------------
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const kumpulkan = useCallback(
    async (auto: boolean) => {
      if (auto) {
        await new Promise((resolve) => setTimeout(resolve, jitterSubmitMs()));
      }

      await simpanSekarang();
      const supabase = createClient();
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("jawaban_siswa")
        .update({ submitted_at: now })
        .eq("siswa_id", siswaId)
        .eq("mapel_id", mapel.id);

      if (error) {
        setSaveStatus("gagal");
        setSaveErrorMsg(
          auto
            ? "Waktu habis tapi pengumpulan otomatis gagal tersambung. Jawaban terakhir yang sempat tersimpan tetap dihitung — hubungi pengawas untuk memastikan."
            : "Gagal mengumpulkan jawaban. Coba lagi."
        );
        return;
      }

      hapusJawabanLokal(siswaId, mapel.id);
      // Paket soal ikut dibuang. Bukan untuk menghemat ruang (ukurannya
      // kecil), tapi supaya naskah soal tidak tertinggal di HP siswa
      // sesudah ujiannya selesai — di mana ia bisa dibaca ulang dan
      // dibagikan ke kelas yang ujiannya belum mulai.
      hapusPaketSoal(siswaId, mapel.id);
      setSubmittedAt(now);

      // Setelah terkumpul, siswa SELALU dikembalikan ke dashboard — baik
      // pengumpulan otomatis karena waktu habis maupun yang dia tekan
      // sendiri. Versi sebelumnya hanya mengganti tombol dengan spanduk
      // "sudah dikumpulkan" dan meninggalkan siswa di halaman soal;
      // akibatnya banyak yang mengira pengumpulannya belum masuk dan
      // memanggil pengawas untuk memastikan. Kembali ke dashboard adalah
      // bukti yang tidak perlu ditafsirkan: mapelnya sudah pindah ke
      // daftar riwayat dengan tanda "Sudah dikerjakan".
      //
      // `router.refresh()` dipanggil supaya dashboard yang dituju dirender
      // ulang di server dengan data terbaru, bukan diambil dari cache
      // router yang masih menganggap ujian ini belum dikumpulkan.
      router.push(
        `/siswa?pesan=${encodeURIComponent(
          auto
            ? `Waktu ujian "${mapel.nama}" sudah habis — jawabanmu otomatis dikumpulkan.`
            : `Jawaban "${mapel.nama}" berhasil dikumpulkan. Terima kasih.`
        )}`
      );
      router.refresh();
    },
    [mapel.id, mapel.nama, router, simpanSekarang, siswaId]
  );

  useEffect(() => {
    if (readOnly || deadlineMs === null) return;

    /** Jam server hasil koreksi offset — bukan Date.now() mentah. */
    const sekarangServer = () => Date.now() + offsetMsRef.current;

    const cek = () => {
      const rem = deadlineMs - sekarangServer();
      setRemainingMs(rem);
      if (rem <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        setWaktuHabis(true); // kunci input INSTAN, sebelum jitter/network
        void kumpulkan(true);
        return true;
      }
      return false;
    };

    if (cek()) return;

    const interval = setInterval(() => {
      if (cek()) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, deadlineMs]);

  /**
   * Tombol "Kumpulkan" di bilah bawah. Yang menentukan dialog mana yang
   * muncul adalah JUMLAH SOAL TERJAWAB, bukan urutan klik — jadi siswa
   * yang belum menjawab sama sekali tidak punya jalan apa pun menuju
   * pengumpulan, sekeras apa pun dia menekan tombolnya.
   */
  function tekanKumpulkan() {
    if (readOnly || submitting) return;
    if (jumlahTerjawab === 0) {
      setTahapKumpul("kosong");
      return;
    }
    setTahapKumpul(jumlahTerjawab < soalList.length ? "belum-lengkap" : "final");
  }

  async function konfirmasiSubmit() {
    // Palang terakhir. Dialog final secara teori hanya bisa dibuka lewat
    // `tekanKumpulkan`, tapi pemeriksaan ini tetap ditulis: kalau suatu
    // saat ada jalur baru menuju dialog itu, yang gagal adalah tombolnya
    // — bukan tersimpannya lembar jawaban kosong yang tidak bisa dibatalkan.
    if (jumlahTerjawab === 0) {
      setTahapKumpul("kosong");
      return;
    }
    setSubmitting(true);
    await kumpulkan(false);
    setSubmitting(false);
    setTahapKumpul(null);
  }

  const waktuKritis =
    !readOnly && remainingMs !== null && remainingMs <= AMBANG_WAKTU_KRITIS_MS;

  // -------------------------------------------------------------------------
  // Layar konfirmasi mulai
  // -------------------------------------------------------------------------
  // Timer baru berjalan setelah tombol ini ditekan, jadi siswa yang tidak
  // sengaja membuka halaman (atau membukanya lebih dulu untuk memastikan
  // koneksi) tidak kehilangan waktu. Ini juga momen terbaik memberi tahu
  // aturan mainnya — setelah masuk, layarnya sudah penuh soal.
  if (!sudahMulai && submittedAt === null && deadlineMs === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-4">
        <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-white p-6 text-center shadow-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-ink/40">
            Bersiap
          </p>
          <h1 className="mb-4 font-serif text-2xl text-ink">{mapel.nama}</h1>

          <dl className="mb-5 space-y-2 rounded-xl bg-paper-dark p-4 text-left text-sm">
            <div className="flex justify-between">
              <dt className="text-ink/50">Jumlah soal</dt>
              <dd className="font-medium text-ink">{soalList.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/50">Waktu pengerjaan</dt>
              <dd className="font-medium text-ink">
                {mapel.durasi_menit
                  ? `${mapel.durasi_menit} menit`
                  : "sampai ujian ditutup"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink/50">Ujian ditutup</dt>
              <dd className="font-medium text-ink">
                {formatWaktu(mapel.waktu_selesai)}
              </dd>
            </div>
          </dl>

          <ul className="mb-5 space-y-1.5 text-left text-xs text-ink/60">
            <li>
              • Semua soal diunduh dulu ke HP-mu saat tombol di bawah ditekan,
              jadi mengerjakannya tetap lancar walau sinyal naik-turun.
            </li>
            <li>• Hitung mundur baru berjalan setelah unduhan selesai.</li>
            <li>
              • Jawaban tersimpan otomatis, termasuk saat koneksi sempat
              terputus.
            </li>
            <li>
              • Menutup halaman tidak menghentikan waktu — buka kembali lewat
              dashboard untuk melanjutkan.
            </li>
          </ul>

          {errorMulai && (
            <p className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              {errorMulai}
            </p>
          )}

          {/*
            Bilah kemajuan unduhan. Ditampilkan HANYA saat proses berjalan —
            dan angkanya ditulis apa adanya ("gambar 7 dari 23"), bukan
            persentase saja. Siswa yang menunggu perlu bukti bahwa ada yang
            bergerak; persentase yang lompat dari 0 ke 100 di ujung tidak
            memberi bukti itu, dan layar yang tampak diam selama sepuluh
            detik adalah layar yang tombolnya ditekan berulang kali.
          */}
          {memulai && (
            <div className="mb-4 rounded-xl border border-teal/25 bg-teal/5 p-3.5 text-left">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <i className="fas fa-cloud-arrow-down text-teal" aria-hidden />
                {unduhan.fase === "mengunduh"
                  ? "Mengunduh soal ke perangkatmu…"
                  : "Menyiapkan waktu ujian…"}
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-teal transition-all duration-300"
                  style={{
                    width:
                      unduhan.total > 0
                        ? `${Math.round((unduhan.selesai / unduhan.total) * 100)}%`
                        : unduhan.fase === "mengunduh"
                          ? "12%"
                          : "100%",
                  }}
                />
              </div>
              <p className="mt-1.5 text-[0.7rem] text-ink/50">
                {unduhan.total > 0
                  ? `Gambar ${unduhan.selesai} dari ${unduhan.total} — jangan tutup halaman ini.`
                  : "Menyalin naskah soal — sebentar saja."}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void tekanMulai()}
            disabled={memulai}
            className="w-full rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-paper transition-colors hover:bg-ink-light disabled:opacity-60"
          >
            {memulai ? "Menyiapkan…" : "Mulai Ujian"}
          </button>

          <Link
            href="/siswa"
            className="mt-3 inline-block text-xs text-ink/50 hover:text-ink"
          >
            Kembali ke dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <header
        ref={headerRef}
        className="sticky top-0 z-10 border-b border-ink/10 bg-paper/95 px-4 py-3 backdrop-blur sm:px-6"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-serif text-base text-ink">{mapel.nama}</p>
            <p className="text-xs text-ink/50">
              {jumlahTerjawab}/{soalList.length} soal terjawab
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!readOnly && (
              <SaveIndicator status={saveStatus} errorMsg={saveErrorMsg} />
            )}
            {!readOnly ? (
              <span
                className={`rounded-lg px-3 py-1.5 text-base font-bold tabular-nums ${
                  waktuKritis
                    ? "bg-danger text-white"
                    : "bg-ink/5 text-ink"
                }`}
              >
                ⏱{" "}
                {remainingMs === null
                  ? "menyinkronkan…"
                  : formatSisaWaktu(remainingMs)}
              </span>
            ) : (
              <span className="rounded-md bg-ok/10 px-2.5 py-1 text-sm font-medium text-ok">
                Sudah dikumpulkan
              </span>
            )}
          </div>
        </div>

        {/* Bilah progress tipis — pengganti angka semata, lebih cepat dibaca
            sambil mengerjakan. */}
        {!readOnly && (
          <div className="mx-auto mt-2 h-1 max-w-5xl overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-teal transition-all"
              style={{ width: `${persenProgress}%` }}
            />
          </div>
        )}
      </header>

      <main className="mx-auto flex max-w-5xl gap-5 px-4 py-6 sm:px-6">
        {soalList.length === 0 ? (
          <div className="w-full">
            {readOnly && <StatusSubmittedBanner submittedAt={submittedAt} />}
            <p className="text-sm text-ink/50">Belum ada soal di ujian ini.</p>
          </div>
        ) : (
          <>
            <aside className="hidden shrink-0 lg:block lg:w-56">
              <div className="sticky top-24 rounded-lg border border-ink/10 bg-white p-3.5">
                <SoalNavPanel
                  soalList={soalList}
                  activeIndex={activeIndex}
                  statusNavSoal={statusNavSoal}
                  onPilih={bukaSoal}
                  layout="grid"
                />
              </div>
            </aside>

            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setNavOpen((o) => !o)}
                className="mb-3 flex min-h-[3rem] w-full items-center justify-between rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm font-medium text-ink touch-manipulation lg:hidden"
              >
                <span>
                  Nomor soal{" "}
                  <span className="text-ink/40">
                    ({jumlahTerjawab}/{soalList.length} terjawab)
                  </span>
                </span>
                <span className="text-ink/40">{navOpen ? "▲" : "▼"}</span>
              </button>
              {navOpen && (
                <div className="mb-4 rounded-lg border border-ink/10 bg-white p-3.5 lg:hidden">
                  <SoalNavPanel
                    soalList={soalList}
                    activeIndex={activeIndex}
                    statusNavSoal={statusNavSoal}
                    onPilih={bukaSoal}
                    layout="wrap"
                  />
                </div>
              )}

              {submittedAt !== null && (
                <StatusSubmittedBanner submittedAt={submittedAt} />
              )}

              {dariPaketLokal && !readOnly && (
                <div className="mb-4 rounded-lg border border-teal/30 bg-teal/5 p-3.5 text-sm text-ink/80">
                  <i className="fas fa-wifi mr-2 text-teal" aria-hidden />
                  Koneksi ke server sedang bermasalah, jadi soal diambil dari
                  salinan yang tadi sudah diunduh ke HP-mu. Kerjakan saja
                  seperti biasa — jawabanmu tetap tersimpan dan akan dikirim
                  begitu sinyalnya kembali.
                </div>
              )}

              {waktuHabis && submittedAt === null && (
                <div className="mb-6 rounded-lg border border-gold/30 bg-gold/5 p-4 text-sm text-ink/80">
                  Waktu ujian sudah habis — jawabanmu sedang dikumpulkan
                  otomatis, mohon tunggu sebentar (jangan tutup halaman ini).
                </div>
              )}

              {!readOnly && saveStatus === "gagal" && saveErrorMsg && (
                <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-3.5 text-sm text-danger">
                  {saveErrorMsg}
                </div>
              )}

              {soalAktif && (
                <div
                  ref={areaSoalRef}
                  className="rounded-lg border border-ink/10 bg-white p-4 sm:p-5"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper-dark text-xs font-medium text-ink/60">
                      {activeIndex + 1}
                    </span>
                    <span className="rounded-full bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal">
                      {TIPE_LABEL[soalAktif.tipe as TipeSoal]}
                    </span>
                    <span className="text-xs text-ink/40">
                      Skor {Number(soalAktif.skor)}
                    </span>
                  </div>
                  <SoalViewer
                    soal={soalAktif}
                    value={jawaban[soalAktif.id]}
                    onChange={(val) => ubahJawaban(soalAktif.id, val)}
                    disabled={readOnly}
                  />
                </div>
              )}

              {/*
                BILAH BAWAH — satu tempat untuk semua aksi.

                Sebelumnya tombol Sebelumnya/Berikutnya berada di tengah
                halaman (ikut tergulir, sering berada di luar jangkauan
                jempol setelah membaca soal panjang) sementara tombol
                Kumpulkan melayang sendiri di kanan bawah. Di HP itu
                berarti dua tempat berbeda yang harus dicari, dan tombol
                Kumpulkan justru yang paling gampang tersenggol — padahal
                itu satu-satunya aksi yang tidak bisa dibatalkan.

                Sekarang ketiganya di satu bilah lengket: navigasi di dua
                sisi yang mudah dijangkau jempol, Kumpulkan di tengah
                dengan ukuran lebih kecil dan warna berbeda supaya
                disengaja, bukan tersenggol. `env(safe-area-inset-bottom)`
                menjaga bilah tetap di atas garis gestur iPhone.
              */}
              <div className="h-24 lg:h-4" aria-hidden />

              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-paper/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:backdrop-blur-none">
                <div className="mx-auto flex max-w-5xl items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bukaSoal(activeIndex - 1)}
                    disabled={activeIndex === 0}
                    className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-white text-sm font-semibold text-ink transition-colors active:bg-ink/5 disabled:opacity-35 touch-manipulation"
                  >
                    <span aria-hidden>←</span> Sebelumnya
                  </button>

                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={tekanKumpulkan}
                      className="flex h-12 shrink-0 items-center justify-center rounded-xl bg-ok px-4 text-sm font-bold text-white shadow-sm transition-colors active:bg-ok/90 touch-manipulation"
                    >
                      Kumpulkan
                    </button>
                  ) : (
                    <span className="shrink-0 px-3 text-xs tabular-nums text-ink/40">
                      {activeIndex + 1}/{soalList.length}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => bukaSoal(activeIndex + 1)}
                    disabled={activeIndex === soalList.length - 1}
                    className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-white text-sm font-semibold text-ink transition-colors active:bg-ink/5 disabled:opacity-35 touch-manipulation"
                  >
                    Berikutnya <span aria-hidden>→</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

{tahapKumpul && (
  <DialogPengumpulan
    tahap={tahapKumpul}
    jumlahTerjawab={jumlahTerjawab}
    jumlahSoal={soalList.length}
    submitting={submitting}
    onTutup={() => setTahapKumpul(null)}
    onLanjut={() => setTahapKumpul("final")}
    onKumpulkan={() => setTahapKumpul("peringatan")}   // ← berubah
    onKirim={() => void konfirmasiSubmit()}            // ← baru
  />
)}
    </div>
  );
}

/**
 * DIALOG PENGUMPULAN BERTAHAP
 *
 * ── KENAPA SATU DIALOG TIDAK CUKUP ──
 *
 * Tombol "Kumpulkan" duduk di bilah bawah yang melekat di layar, persis
 * di jalur jempol yang sedang menggulir soal. Dengan satu dialog
 * konfirmasi, dua ketukan cepat yang tidak disengaja — satu menyenggol
 * tombolnya, satu lagi mendarat di "Ya, kumpulkan" yang kebetulan muncul
 * di bawah jari — sudah cukup untuk mengunci lembar jawaban secara
 * permanen di menit ke-10. Tidak ada jalan kembali dari situ; siswa itu
 * harus menghadap pengawas dan ujiannya praktis hangus.
 *
 * Yang lebih buruk: siswa yang salah membuka ujian lalu reflek menekan
 * tombol hijau bisa mengumpulkan lembar yang benar-benar KOSONG.
 *
 * ── TIGA TAHAP, MASING-MASING MENJAWAB SATU RISIKO ──
 *
 *  1. "kosong" — belum ada satu pun soal terjawab. Ini BUKAN pertanyaan,
 *     melainkan penolakan: hanya ada tombol OK. Tidak disediakan jalur
 *     "lanjutkan saja" sama sekali, karena tidak ada satu pun alasan sah
 *     seorang siswa mengumpulkan lembar kosong lewat tombol ini — kalau
 *     dia memang tidak bisa mengerjakan, waktu habis akan mengurusnya,
 *     dan itu keputusan pengawas, bukan keputusan yang boleh dia ambil
 *     dengan sekali ketuk.
 *
 *  2. "belum-lengkap" — masih ada yang kosong. Di sini siswa berhak
 *     memutuskan (banyak yang memang sengaja melewatkan soal sulit), jadi
 *     dua pilihannya setara: "Kembali Kerjakan" dan "Lanjutkan".
 *     "Kembali Kerjakan" sengaja ditaruh di kiri dan diberi bentuk tombol
 *     utama — pilihan yang aman harus yang paling mudah dikenali.
 *
 *  3. "final" — pertanyaan terakhir. Tombol pengumpulnya BARU MUNCUL
 *     setelah hitung mundur 3 detik. Jeda itu satu-satunya cara memutus
 *     rentetan ketukan refleks: selama tiga detik itu, apa pun yang
 *     diketuk di posisi tombol tidak melakukan apa-apa. "Batalkan" tetap
 *     tersedia sejak detik pertama, karena membatalkan tidak perlu
 *     diperlambat — hanya tindakan yang tidak bisa dibatalkan yang perlu.
 */
function DialogPengumpulan({
  tahap,
  jumlahTerjawab,
  jumlahSoal,
  submitting,
  onTutup,
  onLanjut,
  onKumpulkan,
  onKirim,
}: {
  tahap: "kosong" | "belum-lengkap" | "final" | "peringatan";
  jumlahTerjawab: number;
  jumlahSoal: number;
  submitting: boolean;
  onTutup: () => void;
  onLanjut: () => void;
  onKumpulkan: () => void;
  onKirim: () => void;
}) {
  const [sisaDetik, setSisaDetik] = useState(3);

  // Hitung mundur hanya berjalan di tahap final, dan selalu dimulai ulang
  // dari 3 setiap kali tahap itu dimasuki — termasuk kalau siswa
  // membatalkan lalu menekan Kumpulkan lagi. Jeda yang "sudah kepakai"
  // dari percobaan sebelumnya tidak boleh diwariskan.
  useEffect(() => {
    if (tahap !== "final") return;
    setSisaDetik(3);
    const id = setInterval(() => {
      setSisaDetik((d) => {
        if (d <= 1) {
          clearInterval(id);
          return 0;
        }
        return d - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [tahap]);

  const belumTerjawab = jumlahSoal - jumlahTerjawab;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        {tahap === "kosong" && (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
              <i className="fas fa-circle-exclamation text-xl text-danger" aria-hidden />
            </div>
            <h2 className="mb-2 font-serif text-lg font-bold text-ink">
              Kamu belum selesai menjawab
            </h2>
            <p className="mb-5 text-sm leading-relaxed text-ink/70">
              Belum ada satu pun soal yang kamu jawab, jadi jawaban belum bisa
              dikumpulkan. Kerjakan dulu soalnya ya.
            </p>
            <button
              type="button"
              onClick={onTutup}
              autoFocus
              className="h-12 w-full rounded-xl bg-ink text-sm font-bold text-paper transition-colors active:bg-ink-light touch-manipulation"
            >
              OK
            </button>
          </>
        )}

        {tahap === "belum-lengkap" && (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold/15">
              <i className="fas fa-triangle-exclamation text-xl text-gold-dark" aria-hidden />
            </div>
            <h2 className="mb-2 font-serif text-lg font-bold text-ink">
              Masih ada {belumTerjawab} soal yang kosong
            </h2>
            <p className="mb-5 text-sm leading-relaxed text-ink/70">
              Kamu baru menjawab {jumlahTerjawab} dari {jumlahSoal} soal. Kalau
              masih ada waktu, sebaiknya kamu kembali mengerjakannya dulu.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onTutup}
                autoFocus
                className="h-12 w-full rounded-xl bg-ink text-sm font-bold text-paper transition-colors active:bg-ink-light touch-manipulation"
              >
                Kembali Kerjakan
              </button>
              <button
                type="button"
                onClick={onLanjut}
                className="h-12 w-full rounded-xl border border-ink/15 bg-white text-sm font-semibold text-ink/70 transition-colors active:bg-ink/5 touch-manipulation"
              >
                Lanjutkan
              </button>
            </div>
          </>
        )}

        {tahap === "final" && (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ok/10">
              <i className="fas fa-paper-plane text-xl text-ok" aria-hidden />
            </div>
            <h2 className="mb-2 font-serif text-lg font-bold text-ink">
              Apa kamu yakin untuk mengumpulkan?
            </h2>
            <p className="mb-4 text-sm leading-relaxed text-ink/70">
              Terjawab {jumlahTerjawab} dari {jumlahSoal} soal. Setelah
              dikumpulkan, jawaban <strong>tidak bisa diubah lagi</strong> dan
              kamu akan kembali ke dashboard.
            </p>

            <div className="flex flex-col gap-2">
              {sisaDetik > 0 ? (
                // Placeholder, BUKAN tombol yang di-disable. Tombol
                // ter-disable tetap menempati posisi yang sama dan tetap
                // mengundang jempol untuk menekannya berulang kali; kotak
                // hitung mundur ini menjelaskan kenapa belum bisa ditekan.
                <div className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink/5 text-sm font-semibold text-ink/40">
                  <i className="fas fa-hourglass-half" aria-hidden />
                  Tunggu {sisaDetik} detik…
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onKumpulkan}
                  disabled={submitting}
                  autoFocus
                  className="animasi-muncul h-12 w-full rounded-xl bg-ok text-sm font-bold text-white shadow-sm transition-colors active:bg-ok/90 disabled:opacity-60 touch-manipulation"
                >
                  {submitting ? "Mengumpulkan…" : "Kumpulkan Sekarang"}
                </button>
              )}
              <button
                type="button"
                onClick={onTutup}
                disabled={submitting}
                className="h-12 w-full rounded-xl border border-ink/15 bg-white text-sm font-semibold text-ink/70 transition-colors active:bg-ink/5 disabled:opacity-50 touch-manipulation"
              >
                Batalkan
              </button>
            </div>
          </>
        )}

        {tahap === "peringatan" && (
  <div className="-m-5 overflow-hidden rounded-2xl" role="alertdialog" aria-labelledby="judul-peringatan">
    <div className="flex items-center gap-3 bg-danger px-5 py-4 text-white">
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-2xl font-bold"
      >
        !
      </span>
      <h2 id="judul-peringatan" className="font-serif text-lg font-bold leading-tight">
        Peringatan: ini tidak bisa dibatalkan
      </h2>
    </div>

    <div className="p-5">
      <ul className="mb-5 space-y-2.5 text-sm leading-relaxed text-ink/80">
        <li className="flex gap-2">
          <span className="font-bold text-danger" aria-hidden>✕</span>
          <span>
            Kamu <strong>tidak bisa kembali</strong> ke soal dan tidak bisa
            mengubah jawaban lagi.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-bold text-danger" aria-hidden>✕</span>
          <span>
            Jawabanmu <strong>langsung terkirim</strong> ke guru saat kamu
            menekan tombol merah di bawah.
          </span>
        </li>
      </ul>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onTutup}
          disabled={submitting}
          autoFocus
          className="h-12 w-full rounded-xl bg-ink text-sm font-bold text-paper transition-colors active:bg-ink-light disabled:opacity-50 touch-manipulation"
        >
          Kembali Kerjakan
        </button>
        <button
          type="button"
          onClick={onKirim}
          disabled={submitting}
          className="h-12 w-full rounded-xl border-2 border-danger bg-white text-sm font-bold text-danger transition-colors active:bg-danger/10 disabled:opacity-60 touch-manipulation"
        >
          {submitting ? "Mengirim…" : "Tetap Kumpulkan"}
        </button>
      </div>
    </div>
  </div>
)}

      </div>
    </div>
  );
}

function StatusSubmittedBanner({ submittedAt }: { submittedAt: string | null }) {
  return (
    <div className="mb-6 rounded-lg border border-ok/30 bg-ok/5 p-4 text-sm text-ink/80">
      Ujian ini sudah kamu kumpulkan
      {submittedAt && <> pada {formatWaktu(submittedAt)}</>}. Jawaban tidak bisa
      diubah lagi.{" "}
      <Link href="/siswa" className="font-medium text-teal hover:text-teal-light">
        Kembali ke dashboard
      </Link>
    </div>
  );
}

function SoalNavPanel({
  soalList,
  activeIndex,
  statusNavSoal,
  onPilih,
  layout,
}: {
  soalList: SoalSiswa[];
  activeIndex: number;
  statusNavSoal: (soal: SoalSiswa) => StatusNavSoal;
  onPilih: (idx: number) => void;
  layout: "grid" | "wrap";
}) {
  return (
    <div>
      <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-ink/40">
        Nomor Soal
      </p>
      <div
        className={
          layout === "grid"
            ? "grid grid-cols-5 gap-1.5 lg:grid-cols-4"
            : "grid grid-cols-6 gap-2 sm:grid-cols-8"
        }
      >
        {soalList.map((soal, idx) => (
          <button
            key={soal.id}
            type="button"
            onClick={() => onPilih(idx)}
            aria-current={idx === activeIndex ? "true" : undefined}
            className={navButtonClass(statusNavSoal(soal), idx === activeIndex)}
          >
            {idx + 1}
          </button>
        ))}
      </div>
      <div className="mt-3.5 space-y-1.5 border-t border-ink/10 pt-3 text-xs text-ink/50">
        <LegendItem dotClass="bg-ok" label="Sudah dijawab" />
        <LegendItem dotClass="bg-gold" label="Sudah dilihat" />
        <LegendItem dotClass="bg-ink/15" label="Belum dilihat" />
      </div>
    </div>
  );
}

function navButtonClass(status: StatusNavSoal, active: boolean): string {
  // 44 px adalah ukuran target sentuh minimum yang bisa diketuk andal
  // dengan jempol. Ukuran lama (36 px) membuat siswa sering meleset ke
  // nomor sebelah — dan karena meleset di sini berarti berpindah soal,
  // efeknya membingungkan, bukan sekadar mengganggu.
  const base =
    "flex h-11 w-11 items-center justify-center rounded-lg text-sm font-semibold transition-colors touch-manipulation lg:h-9 lg:w-9 lg:text-xs";
  const byStatus: Record<StatusNavSoal, string> = {
    terjawab: "bg-ok/15 text-ok hover:bg-ok/25",
    dilihat: "bg-gold/15 text-gold-dark hover:bg-gold/25",
    "belum-dilihat": "bg-ink/5 text-ink/40 hover:bg-ink/10",
  };
  const activeRing = active
    ? "ring-2 ring-teal ring-offset-1 ring-offset-white"
    : "";
  return `${base} ${byStatus[status]} ${activeRing}`;
}

function LegendItem({ dotClass, label }: { dotClass: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      <span>{label}</span>
    </div>
  );
}

function SaveIndicator({
  status,
  errorMsg,
}: {
  status: SaveStatus;
  errorMsg: string | null;
}) {
  const label: Record<SaveStatus, string> = {
    tersimpan: "Tersimpan",
    menyimpan: "Menyimpan ke server…",
    menunggu: "Tersimpan di perangkat",
    gagal: "Gagal ke server",
  };
  const cls: Record<SaveStatus, string> = {
    tersimpan: "text-ink/40",
    menyimpan: "text-ink/40",
    menunggu: "text-ink/40",
    gagal: "text-danger",
  };
  return (
    <span
      className={`hidden text-xs sm:inline ${cls[status]}`}
      title={status === "gagal" ? (errorMsg ?? undefined) : undefined}
    >
      {label[status]}
    </span>
  );
}
