"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  JENJANG_LIST,
  JENJANG_LABEL,
  clearJenjangCookie,
  setJenjangCookie,
  type Jenjang,
} from "@/lib/jenjang";
import {
  LayarAntrian,
  SapaanSukses,
  type SapaanData,
} from "@/components/ui/SwalPanel";

type Tab = "admin" | "siswa";

const SISWA_EMAIL_SUFFIX =
  process.env.NEXT_PUBLIC_SISWA_EMAIL_SUFFIX ?? "@siswa.lms-cbt.local";

/**
 * ALUR LOGIN SISWA (sementara, untuk uji coba — supaya tidak perlu
 * mencetak kertas username+password per siswa):
 *
 *   1. Kelas Utama (7 / 8 / 9)  -> menentukan PROJECT SUPABASE mana yang
 *      dihubungi. Ini langkah wajib pertama karena tiap jenjang punya
 *      databasenya sendiri (Sesi 16); tanpa ini kita bahkan tidak tahu
 *      harus menanyakan daftar nama ke server yang mana.
 *   2. Kelas (7.1-7.6 / 8.1-8.6 / 9.1-9.6) -> menyaring daftar nama.
 *   3. Pilih Nama lewat modal (bukan mengetik username).
 *   4. Tanggal lahir sebagai pengganti kata sandi.
 *
 * Beda dari versi sebelumnya: dulu jenjang 8 dan 9 TIDAK dipecah per
 * sub-kelas (satu pilihan "Kelas 8" saja, daftar namanya digabung satu
 * jenjang). Sekarang ketiga jenjang diperlakukan sama — dua dropdown
 * bertingkat — jadi daftar nama yang harus di-scroll siswa selalu
 * sepanjang satu kelas saja, bukan ±200 nama satu jenjang.
 *
 * Tanggal lahir dipakai LANGSUNG sebagai password akun Supabase Auth
 * dengan format digit "DDMMYYYY" (lahir 14 Mei 2012 -> "14052012"),
 * diset saat akun dibuat. TIDAK ADA kolom tanggal_lahir di database
 * mana pun, jadi tidak perlu migrasi skema untuk alur ini.
 *
 * Kalau nanti mau balik ke username+password biasa untuk siswa: ganti
 * isi blok `tab === "siswa"` di bawah dengan input identifier+password
 * polos (mirip blok "admin"), tambahkan SISWA_EMAIL_SUFFIX ke email yang
 * dikirim. RPC `get_siswa_untuk_pilih_nama` di database boleh dibiarkan
 * menganggur, tidak perlu dihapus.
 */

/** Sub-kelas per jenjang. Harus sama dengan isi tabel `kelas` tiap project. */
const KELAS_PER_JENJANG: Record<Jenjang, string[]> = {
  7: ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6"],
  8: ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6"],
  9: ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6"],
};

type SiswaPilihan = { id: string; nama: string; username: string };

/**
 * Tanggal & tahun diketik manual (bukan `<input type="date">`) karena
 * date picker bawaan browser sering bikin siswa bingung navigasinya
 * (klik-klik kalender, ganti tahun harus klik mundur puluhan kali).
 * Bulan tetap dropdown supaya tidak ada ambiguitas "05" itu Mei atau
 * Agustus. Value dropdown sudah dua digit ("01".."12") persis format
 * yang dibutuhkan `DDMMYYYY`, jadi tidak perlu konversi lagi di sini.
 */
const BULAN_LIST: { value: string; label: string }[] = [
  { value: "01", label: "Januari" },
  { value: "02", label: "Februari" },
  { value: "03", label: "Maret" },
  { value: "04", label: "April" },
  { value: "05", label: "Mei" },
  { value: "06", label: "Juni" },
  { value: "07", label: "Juli" },
  { value: "08", label: "Agustus" },
  { value: "09", label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Desember" },
];

/** Tanggal ("5" atau "05") + bulan ("05") + tahun ("2012") -> "DDMMYYYY". */
function tanggalLahirKePassword(
  tanggal: string,
  bulan: string,
  tahun: string
): string {
  return `${tanggal.padStart(2, "0")}${bulan}${tahun}`;
}

export default function LoginForm() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("siswa");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Tahap proses masuk, ditampilkan di layar antrian.
   *
   * Disimpan sebagai TEKS, bukan angka tahap, supaya setiap titik
   * tunggu bisa menuliskan sendiri apa yang sedang ditunggu. Yang
   * penting bagi orang yang menunggu bukan "tahap 2 dari 4", tapi
   * "sedang apa" — dan tiap tahap di sini punya penyebab kelambatan
   * yang berbeda.
   */
  const [tahap, setTahap] = useState("");

  /** Kalau terisi, sapaan sukses sedang tampil dan halaman tujuan
   *  sudah ditentukan — tinggal menunggu orangnya menutup sapaan. */
  const [sapaan, setSapaan] = useState<SapaanData | null>(null);
  const [tujuan, setTujuan] = useState<string | null>(null);

  // --- Tab Admin/Guru ---
  const [jenjangAdmin, setJenjangAdmin] = useState<"" | Jenjang>("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [lihatPassword, setLihatPassword] = useState(false);

  // --- Tab Siswa ---
  const [jenjangSiswa, setJenjangSiswa] = useState<"" | Jenjang>("");
  const [kelasNama, setKelasNama] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [daftarSiswa, setDaftarSiswa] = useState<SiswaPilihan[] | null>(null);
  const [loadingDaftar, setLoadingDaftar] = useState(false);
  const [errorDaftar, setErrorDaftar] = useState<string | null>(null);
  const [cariNama, setCariNama] = useState("");
  const [siswaTerpilih, setSiswaTerpilih] = useState<SiswaPilihan | null>(null);
  const [tglTanggal, setTglTanggal] = useState("");
  const [tglBulan, setTglBulan] = useState("");
  const [tglTahun, setTglTahun] = useState("");

  const daftarKelas = jenjangSiswa ? KELAS_PER_JENJANG[jenjangSiswa] : [];

  function handleJenjangSiswaChange(value: string) {
    const j = value ? (Number(value) as Jenjang) : "";
    setJenjangSiswa(j);
    // Ganti jenjang berarti ganti database — pilihan kelas/nama
    // sebelumnya berasal dari project lain dan sudah tidak berlaku.
    setKelasNama("");
    setDaftarSiswa(null);
    setSiswaTerpilih(null);
    setTglTanggal("");
    setTglBulan("");
    setTglTahun("");
    setError(null);
  }

  function handleKelasChange(value: string) {
    setKelasNama(value);
    setDaftarSiswa(null);
    setSiswaTerpilih(null);
    setTglTanggal("");
    setTglBulan("");
    setTglTahun("");
    setError(null);
  }

  async function bukaModalPilihNama() {
    if (!jenjangSiswa || !kelasNama) return;
    setModalOpen(true);
    setCariNama("");
    setLoadingDaftar(true);
    setErrorDaftar(null);
    try {
      // Set cookie jenjang dulu, lalu override eksplisit ke createClient
      // supaya tidak bergantung timing baca-ulang cookie di render yang
      // sama — pola sama seperti submit login di bawah (lihat client.ts).
      setJenjangCookie(jenjangSiswa);
      const supabase = createClient(jenjangSiswa);
      const { data, error: rpcError } = await supabase.rpc(
        "get_siswa_untuk_pilih_nama",
        { p_kelas_nama: kelasNama }
      );
      if (rpcError) throw rpcError;
      setDaftarSiswa((data as SiswaPilihan[]) ?? []);
    } catch {
      setErrorDaftar(
        "Gagal memuat daftar nama. Coba tutup lalu buka lagi, atau hubungi guru/admin."
      );
      setDaftarSiswa(null);
    } finally {
      setLoadingDaftar(false);
    }
  }

  function pilihSiswa(s: SiswaPilihan) {
    setSiswaTerpilih(s);
    setModalOpen(false);
    setError(null);
  }

  const daftarTersaring = (daftarSiswa ?? []).filter((s) =>
    s.nama.toLowerCase().includes(cariNama.trim().toLowerCase())
  );

  /**
   * Dipanggil setelah signInWithPassword berhasil, untuk KEDUA tab.
   *
   * Kenapa tidak `router.push("/")` saja seperti sebelumnya: halaman "/"
   * cuma meneruskan ke /login, dan yang memutuskan admin-atau-siswa
   * adalah middleware. Kalau akun berhasil login TAPI auth_id-nya tidak
   * punya baris di tabel `guru` maupun `siswa` di project jenjang itu,
   * middleware tidak bisa menentukan role, halaman "/" melempar balik ke
   * /login, dan orangnya lihat form login lagi tanpa pesan apa pun —
   * persis gejala "sudah benar tapi dilempar balik" yang dilaporkan.
   *
   * Sekarang role ditentukan di sini, sebelum pindah halaman: kalau
   * ketemu, langsung ke dashboard yang tepat; kalau tidak ketemu,
   * sesinya dibatalkan lagi dan penyebabnya ditulis jelas ke layar.
   */
  async function lanjutkanSetelahLogin(
    supabase: SupabaseClient,
    jenjang: Jenjang
  ) {
    setTahap("Memastikan sesi kamu…");
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Sesi gagal dibuat. Coba lagi.");
      return;
    }

    setTahap("Mencocokkan akun dengan data sekolah…");

    // `nama` & `is_admin` ikut diambil (versi lama hanya `id`) supaya
    // sapaan bisa menyebut nama guru dan membedakan Guru dari
    // Administrator. Satu kolom tambahan di query yang memang sudah
    // jalan — bukan permintaan jaringan baru.
    const { data: guruRow } = await supabase
      .from("guru")
      .select("id, nama, is_admin")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (guruRow) {
      setSapaan({
        nama: guruRow.nama ?? user.email ?? "Guru",
        // Admin SENGAJA tidak menampilkan kelas: akun admin memang
        // tidak terikat satu kelas, dan menampilkan jenjang sesinya
        // sebagai "kelas" justru menyesatkan — dia bisa berpindah ke
        // jenjang mana pun setelah masuk.
        peran: guruRow.is_admin ? "Administrator" : "Guru",
        kelas: null,
        jenjangLabel: guruRow.is_admin ? null : JENJANG_LABEL[jenjang],
      });
      setTujuan("/admin");
      return;
    }

    const { data: siswaRow } = await supabase
      .from("siswa")
      .select("id, nama, kelas(nama)")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (siswaRow) {
      const kelasSiswa =
        (siswaRow.kelas as unknown as { nama: string } | null)?.nama ??
        // Cadangan: kelas yang dipilih sendiri di form. Dipakai kalau
        // join ke tabel `kelas` terhalang RLS — sapaan tidak boleh
        // gagal tampil cuma karena kelasnya tidak terbaca.
        kelasNama ??
        null;

      setSapaan({
        nama: siswaRow.nama ?? siswaTerpilih?.nama ?? "Siswa",
        peran: "Siswa",
        kelas: kelasSiswa,
      });
      setTujuan("/siswa");
      return;
    }

    // Akun auth valid, tapi belum didaftarkan sebagai guru/siswa DI
    // PROJECT INI. Dibatalkan supaya tidak meninggalkan sesi setengah
    // jadi yang bikin halaman lain error aneh-aneh.
    await supabase.auth.signOut();
    clearJenjangCookie();
    setError(
      `Email & kata sandi benar, tapi akun ini belum terdaftar sebagai guru maupun siswa di database ${JENJANG_LABEL[jenjang]}. ` +
        "Kalau akunmu dibuat untuk jenjang lain, ganti pilihan jenjang di atas. Kalau memang baru dibuat lewat Authentication, barisnya di tabel guru/siswa masih perlu ditambahkan."
    );
  }

  async function handleSubmitAdmin(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!jenjangAdmin) {
      setError("Pilih jenjang kelas dulu.");
      return;
    }

    setLoading(true);
    setTahap("Menghubungi server kelas " + jenjangAdmin + "…");
    setJenjangCookie(jenjangAdmin);
    const supabase = createClient(jenjangAdmin);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: adminEmail.trim(),
      password: adminPassword,
    });

    if (signInError) {
      setLoading(false);
      setTahap("");
      setError(
        "Email atau kata sandi salah — atau jenjang yang dipilih tidak sesuai dengan project akun ini."
      );
      return;
    }

    await lanjutkanSetelahLogin(supabase, jenjangAdmin);
    // Layar antrian sengaja TIDAK dimatikan kalau sapaan berhasil
    // dipasang — `setSapaan` sudah menggantikan lapisannya, dan
    // mematikan `loading` di sini akan membuat form di belakang
    // berkedip sesaat sebelum halaman berpindah.
    setLoading(false);
    setTahap("");
  }

  async function handleSubmitSiswa(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!jenjangSiswa) {
      setError("Pilih kelas utama dulu (7, 8, atau 9).");
      return;
    }
    if (!kelasNama) {
      setError("Pilih kelasmu dulu.");
      return;
    }
    if (!siswaTerpilih) {
      setError('Pilih nama kamu dulu lewat tombol "Pilih Nama".');
      return;
    }
    if (!tglTanggal || !tglBulan || !tglTahun) {
      setError("Masukkan tanggal lahir kamu lengkap (tanggal, bulan, tahun).");
      return;
    }
    const tanggalAngka = Number(tglTanggal);
    if (!Number.isInteger(tanggalAngka) || tanggalAngka < 1 || tanggalAngka > 31) {
      setError("Tanggal lahir tidak valid — isi angka 1 sampai 31.");
      return;
    }
    if (!/^\d{4}$/.test(tglTahun)) {
      setError("Tahun lahir harus 4 digit, contoh: 2012.");
      return;
    }

    setLoading(true);
    setTahap("Memeriksa tanggal lahir…");
    setJenjangCookie(jenjangSiswa);
    const supabase = createClient(jenjangSiswa);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: `${siswaTerpilih.username}${SISWA_EMAIL_SUFFIX}`,
      password: tanggalLahirKePassword(tglTanggal, tglBulan, tglTahun),
    });

    if (signInError) {
      setLoading(false);
      setTahap("");
      setError(
        "Tanggal lahir tidak sesuai — atau kelas/nama yang dipilih salah. Coba periksa lagi, atau hubungi guru/admin."
      );
      return;
    }

    await lanjutkanSetelahLogin(supabase, jenjangSiswa);
    setLoading(false);
    setTahap("");
  }

  /**
   * Pindah halaman setelah sapaan ditutup (atau hitungannya habis).
   *
   * `router.replace`, bukan `push`: halaman login tidak boleh tersisa
   * di riwayat. Kalau tersisa, siswa yang menekan tombol kembali HP di
   * tengah ujian mendarat di form login dalam keadaan sudah login —
   * layar yang mustahil dipahami, dan godaan besar untuk login ulang
   * sebagai orang lain.
   */
  function selesaikanSapaan() {
    if (!tujuan) return;
    router.replace(tujuan);
    router.refresh();
  }

  return (
    <div className="w-full">
      {/*
        Dua lapisan ini saling menggantikan, tidak pernah tampil
        bersamaan: antrian selama menunggu, sapaan setelah berhasil.
      */}
      {sapaan && <SapaanSukses data={sapaan} onSelesai={selesaikanSapaan} />}
      {!sapaan && loading && <LayarAntrian tahap={tahap} />}

      {/* Tab */}
      <div className="mb-6 flex gap-1 rounded-xl bg-slate-100/80 p-1">
        {(
          [
            { key: "siswa", label: "Siswa", ikon: "fa-user-graduate" },
            { key: "admin", label: "Admin / Guru", ikon: "fa-chalkboard-user" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key);
              setError(null);
            }}
            className={`flex-1 rounded-lg px-3 py-2 text-[0.82rem] font-semibold transition-colors ${
              tab === t.key
                ? "bg-white text-ink shadow-sm"
                : "text-slate-500 hover:text-ink"
            }`}
          >
            <i className={`fas ${t.ikon} mr-1.5`} aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "siswa" ? (
        <form onSubmit={handleSubmitSiswa} className="space-y-4">
          <div>
            <label htmlFor="jenjangSiswa" className="label-field">
              Kelas Utama
            </label>
            <select
              id="jenjangSiswa"
              required
              value={jenjangSiswa}
              onChange={(e) => handleJenjangSiswaChange(e.target.value)}
              className="field cursor-pointer"
            >
              <option value="">Pilih kelas utama…</option>
              {JENJANG_LIST.map((j) => (
                <option key={j} value={j}>
                  {JENJANG_LABEL[j]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="kelasSiswa" className="label-field">
              Kelas
            </label>
            <select
              id="kelasSiswa"
              required
              disabled={!jenjangSiswa}
              value={kelasNama}
              onChange={(e) => handleKelasChange(e.target.value)}
              className="field cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">
                {jenjangSiswa ? "Pilih kelas…" : "Pilih kelas utama dulu…"}
              </option>
              {daftarKelas.map((k) => (
                <option key={k} value={k}>
                  Kelas {k}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="label-field">Nama</span>
            <button
              type="button"
              disabled={!kelasNama}
              onClick={bukaModalPilihNama}
              className="field flex items-center justify-between text-left disabled:cursor-not-allowed disabled:bg-slate-50"
            >
              {siswaTerpilih ? (
                <span className="font-semibold text-ink">
                  {siswaTerpilih.nama}
                </span>
              ) : (
                <span className="text-slate-400">
                  {kelasNama ? "Pilih Nama…" : "Pilih kelas dulu…"}
                </span>
              )}
              <i className="fas fa-chevron-down text-xs text-slate-400" aria-hidden />
            </button>
          </div>

          {siswaTerpilih && (
            <div className="animasi-muncul">
              <span className="label-field">Tanggal lahir</span>
              <div className="grid grid-cols-[0.8fr_1.3fr_1fr] gap-2">
                <input
                  id="tglTanggal"
                  type="number"
                  inputMode="numeric"
                  required
                  min={1}
                  max={31}
                  placeholder="Tgl"
                  aria-label="Tanggal lahir"
                  value={tglTanggal}
                  onChange={(e) => setTglTanggal(e.target.value)}
                  className="field text-center"
                />
                <select
                  id="tglBulan"
                  required
                  aria-label="Bulan lahir"
                  value={tglBulan}
                  onChange={(e) => setTglBulan(e.target.value)}
                  className="field cursor-pointer"
                >
                  <option value="">Bulan</option>
                  {BULAN_LIST.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <input
                  id="tglTahun"
                  type="number"
                  inputMode="numeric"
                  required
                  placeholder="Tahun"
                  aria-label="Tahun lahir"
                  value={tglTahun}
                  onChange={(e) => setTglTahun(e.target.value)}
                  className="field text-center"
                />
              </div>
              <p className="mt-1.5 text-[0.72rem] text-slate-500">
                Masukkan tanggal hari ini (19 September 2026)
              </p>
            </div>
          )}

          {error && <PesanError>{error}</PesanError>}

          <TombolMasuk loading={loading} disabled={!siswaTerpilih} />
        </form>
      ) : (
        <form onSubmit={handleSubmitAdmin} className="space-y-4">
          <div>
            <label htmlFor="jenjangAdmin" className="label-field">
              Jenjang
            </label>
            <select
              id="jenjangAdmin"
              required
              value={jenjangAdmin}
              onChange={(e) =>
                setJenjangAdmin(
                  e.target.value ? (Number(e.target.value) as Jenjang) : ""
                )
              }
              className="field cursor-pointer"
            >
              <option value="">Pilih jenjang…</option>
              {JENJANG_LIST.map((j) => (
                <option key={j} value={j}>
                  {JENJANG_LABEL[j]}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[0.72rem] text-slate-500">
              Data kelas 7, 8, dan 9 disimpan terpisah — pilih dulu jenjang
              akunmu sebelum masuk.
            </p>
          </div>

          <div>
            <label htmlFor="adminEmail" className="label-field">
              Email
            </label>
            <input
              id="adminEmail"
              type="email"
              required
              autoComplete="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="field"
              placeholder="guru@sekolah.sch.id"
            />
          </div>

          <div>
            <label htmlFor="adminPassword" className="label-field">
              Kata sandi
            </label>
            <div className="relative">
              <input
                id="adminPassword"
                type={lihatPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="field pr-12"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setLihatPassword((v) => !v)}
                aria-label={
                  lihatPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"
                }
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-[--primary]"
              >
                <i
                  className={`fas ${lihatPassword ? "fa-eye-slash" : "fa-eye"}`}
                  aria-hidden
                />
              </button>
            </div>
          </div>

          {error && <PesanError>{error}</PesanError>}

          <TombolMasuk loading={loading} disabled={false} />
        </form>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-[2px]"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-sm animasi-muncul flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 p-4">
              <p className="mb-2 font-serif text-sm font-semibold text-ink">
                Pilih nama kamu{kelasNama ? ` — Kelas ${kelasNama}` : ""}
              </p>
              <div className="relative">
                <i
                  className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400"
                  aria-hidden
                />
                <input
                  type="text"
                  autoFocus
                  placeholder="Cari nama…"
                  value={cariNama}
                  onChange={(e) => setCariNama(e.target.value)}
                  className="field py-2.5 pl-9 text-sm"
                />
              </div>
            </div>

            <div className="scroll-halus flex-1 overflow-y-auto">
              {loadingDaftar && (
                <p className="p-5 text-center text-sm text-slate-500">
                  <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden />
                  Memuat daftar nama…
                </p>
              )}
              {errorDaftar && (
                <p className="p-4 text-sm text-danger">{errorDaftar}</p>
              )}
              {!loadingDaftar && !errorDaftar && daftarTersaring.length === 0 && (
                <p className="p-5 text-center text-sm text-slate-500">
                  Nama tidak ditemukan.
                </p>
              )}
              {!loadingDaftar &&
                !errorDaftar &&
                daftarTersaring.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pilihSiswa(s)}
                    className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left text-sm text-ink transition-colors last:border-0 hover:bg-blue-50"
                  >
                    <i
                      className="fas fa-user-graduate text-xs text-slate-400"
                      aria-hidden
                    />
                    {s.nama}
                  </button>
                ))}
            </div>

            <div className="border-t border-slate-200 p-3 text-right">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-2 text-sm font-semibold text-slate-500 hover:text-ink"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PesanError({ children }: { children: React.ReactNode }) {
  return (
    <p className="animasi-muncul rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[0.82rem] leading-relaxed text-red-700">
      <i className="fas fa-circle-exclamation mr-2" aria-hidden />
      {children}
    </p>
  );
}

function TombolMasuk({
  loading,
  disabled,
}: {
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full rounded-xl bg-[#004e92] py-3 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[#0066cc] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <>
          <i className="fas fa-circle-notch fa-spin mr-2" aria-hidden />
          Memeriksa…
        </>
      ) : (
        "Masuk"
      )}
    </button>
  );
}