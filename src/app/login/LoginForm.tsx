"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { emailGuruDariUsername, emailSiswaDariUsername } from "@/lib/akun";
import {
  JENJANG_LABEL,
  clearJenjangCookie,
  getJenjangFromDocumentCookie,
  setJenjangCookie,
  type Jenjang,
} from "@/lib/jenjang";
import {
  LayarAntrian,
  SapaanSukses,
  type SapaanData,
} from "@/components/ui/SwalPanel";

type Tab = "admin" | "siswa";

/**
 * ALUR LOGIN SISWA: username + password dari kartu yang dibagikan guru.
 *
 * Username dibentuk dari nama (mis. "rizki", "rizkip", "rizki2") dan
 * password acak 3 huruf + 3 angka (mis. "kmr482") — aturannya di
 * `src/lib/akun.ts`, akunnya dibuat lewat panel admin atau SQL
 * `siapkan_akun_siswa()` (migrasi 0023).
 *
 * Menggantikan alur lama "pilih kelas -> pilih nama -> ketik tanggal":
 * daftar nama sekelas terbuka untuk siapa saja yang membuka halaman ini,
 * dan tanggal lahir mudah ditebak teman sendiri.
 */

/**
 * Jenjang TIDAK lagi dipilih di form: ditentukan oleh alamat halaman
 * (/kelas7, /kelas8, /kelas9) dan dioper sebagai prop. Satu alamat = satu
 * database, jadi siswa tidak mungkin salah pilih kelas utama.
 */
export default function LoginForm({ jenjang }: { jenjang: Jenjang }) {
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
  // Diisi NIP (paling umum) atau, untuk akun lama yang belum punya NIP
  // di database (lihat migrasi 0015), email asli — dibedakan di
  // `handleSubmitAdmin` lewat ada-tidaknya "@". Nama variabelnya sengaja
  // "Identifier", bukan "Email" seperti sebelumnya, supaya jelas isinya
  // bukan cuma email lagi.
  const [adminIdentifier, setAdminIdentifier] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  // --- Tab Siswa ---
  const [siswaUsername, setSiswaUsername] = useState("");
  const [siswaPassword, setSiswaPassword] = useState("");

  /**
   * Dipanggil tepat sebelum signInWithPassword. Kalau browser ini masih
   * memegang sesi jenjang LAIN (mis. komputer lab yang tadi dipakai kelas
   * 7, sekarang dibuka di /kelas8), sesi lama ditutup dulu di project-nya
   * sendiri, baru penanda jenjang diganti. Dengan begitu tidak pernah ada
   * dua sesi yang bisa tertukar.
   */
  async function siapkanJenjang() {
    const lama = getJenjangFromDocumentCookie();
    if (lama && lama !== jenjang) {
      try {
        await createClient(lama).auth.signOut();
      } catch {
        // Sesi lama mungkin sudah kedaluwarsa — tidak menghalangi login baru.
      }
    }
    setJenjangCookie(jenjang);
  }

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
    const { data: guruRow, error: errGuru } = await supabase
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

    const { data: siswaRow, error: errSiswa } = await supabase
      .from("siswa")
      .select("id, nama, kelas_id")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (siswaRow) {
      // Nama kelas hanya untuk sapaan — kegagalan di sini (RLS, relasi
      // ganda, jaringan) TIDAK boleh menggagalkan login.
      let namaKelasDb: string | undefined;
      try {
        if (siswaRow.kelas_id) {
          const { data: kelasRow } = await supabase
            .from("kelas")
            .select("nama")
            .eq("id", siswaRow.kelas_id)
            .maybeSingle();
          namaKelasDb = kelasRow?.nama as string | undefined;
        }
      } catch {
        namaKelasDb = undefined;
      }
      setSapaan({
        nama: siswaRow.nama ?? "Siswa",
        peran: "Siswa",
        kelas: namaKelasDb ?? null,
      });
      setTujuan("/siswa");
      return;
    }

    // Akun auth valid, tapi belum didaftarkan sebagai guru/siswa DI
    // PROJECT INI. Dibatalkan supaya tidak meninggalkan sesi setengah
    // jadi yang bikin halaman lain error aneh-aneh.
    await supabase.auth.signOut();
    clearJenjangCookie();
    if (errGuru || errSiswa) {
      // Query GAGAL (bukan "barisnya tidak ada"): tampilkan pesan aslinya
      // supaya tidak salah dikira akun belum terdaftar.
      setError(
        "Login berhasil, tetapi data akun gagal dibaca dari database: " +
          [
            errGuru && `guru: ${errGuru.message}`,
            errSiswa && `siswa: ${errSiswa.message}`,
          ]
            .filter(Boolean)
            .join(" · ")
      );
      return;
    }
    setError(
      `Email & kata sandi benar, tapi akun ini belum terdaftar sebagai guru maupun siswa di database ${JENJANG_LABEL[jenjang]}. ` +
        "Kalau akunmu dibuat untuk jenjang lain, buka halaman login kelas yang sesuai (/kelas7, /kelas8, atau /kelas9). Kalau memang baru dibuat lewat Authentication, barisnya di tabel guru/siswa masih perlu ditambahkan."
    );
  }

  async function handleSubmitAdmin(e: FormEvent) {
    e.preventDefault();
    setError(null);

    setLoading(true);
    setTahap("Menghubungi server kelas " + jenjang + "…");
    await siapkanJenjang();
    const supabase = createClient(jenjang);

    /**
     * Username/NIP -> email sintetis lewat rumus yang SAMA dipakai
     * server saat membuat akun (`emailGuruDariUsername`, satu sumber
     * kebenaran di `src/lib/akun.ts`) — bukan menebak-nebak di sini.
     * Kalau yang diketik mengandung "@", diperlakukan sebagai email
     * ASLI apa adanya, supaya akun lama yang masih login dengan email
     * (belum dimigrasi username-nya, lihat migrasi 0015) tetap bisa
     * masuk tanpa perubahan apa pun di sisi mereka.
     */
    const identifier = adminIdentifier.trim();
    const email = identifier.includes("@")
      ? identifier
      : emailGuruDariUsername(identifier);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: adminPassword,
    });

    if (signInError) {
      setLoading(false);
      setTahap("");
      setError(
        `Username/NIP atau kata sandi salah — atau akun ini bukan akun ${JENJANG_LABEL[jenjang]}.`
      );
      return;
    }

    await lanjutkanSetelahLogin(supabase, jenjang);
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

    // Spasi yang ikut tersalin dari chat WhatsApp sering menempel di ujung
    // password; password siswa tidak pernah berisi spasi (lihat akun.ts).
    const password = siswaPassword.trim();
    if (!siswaUsername.trim() || !password) {
      setError("Isi username dan password dari kartu login kamu.");
      return;
    }

    setLoading(true);
    setTahap("Menghubungi server kelas " + jenjang + "…");
    await siapkanJenjang();
    const supabase = createClient(jenjang);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailSiswaDariUsername(siswaUsername),
      password,
    });

    if (signInError) {
      setLoading(false);
      setTahap("");
      setError(
        `Username atau password salah — atau akun ini bukan akun ${JENJANG_LABEL[jenjang]}. ` +
          "Periksa lagi kartu login kamu, atau hubungi guru/admin."
      );
      return;
    }

    await lanjutkanSetelahLogin(supabase, jenjang);
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
            <label htmlFor="siswaUsername" className="label-field">
              Username
            </label>
            <input
              id="siswaUsername"
              type="text"
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={siswaUsername}
              onChange={(e) => setSiswaUsername(e.target.value)}
              className="field"
              placeholder="mis. rizki"
            />
          </div>

          <div>
            <label htmlFor="siswaPassword" className="label-field">
              Password
            </label>
            <InputPassword
              id="siswaPassword"
              value={siswaPassword}
              onChange={setSiswaPassword}
              placeholder="mis. kmr482"
            />
            <p className="mt-1.5 text-[0.72rem] text-slate-500">
              Username dan password ada di kartu login dari guru.
            </p>
          </div>

          {error && <PesanError>{error}</PesanError>}

          <TombolMasuk loading={loading} disabled={false} />
        </form>
      ) : (
        <form onSubmit={handleSubmitAdmin} className="space-y-4">
          <div>
            <label htmlFor="adminIdentifier" className="label-field">
              Username / NIP
            </label>
            <input
              id="adminIdentifier"
              type="text"
              required
              autoComplete="username"
              value={adminIdentifier}
              onChange={(e) => setAdminIdentifier(e.target.value)}
              className="field"
              placeholder="mis. 196504121990031005"
            />
            <p className="mt-1.5 text-[0.72rem] text-slate-500">
              Akun lama yang belum punya NIP di sistem masih bisa
              mengetikkan email seperti biasa di kolom ini.
            </p>
          </div>

          <div>
            <label htmlFor="adminPassword" className="label-field">
              Kata sandi
            </label>
            <InputPassword
              id="adminPassword"
              value={adminPassword}
              onChange={setAdminPassword}
              placeholder="••••••••"
            />
          </div>

          {error && <PesanError>{error}</PesanError>}

          <TombolMasuk loading={loading} disabled={false} />
        </form>
      )}
    </div>
  );
}

/** Kolom password dengan tombol lihat/sembunyikan — dipakai kedua tab. */
function InputPassword({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [lihat, setLihat] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={lihat ? "text" : "password"}
        required
        autoComplete="current-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field pr-12"
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setLihat((v) => !v)}
        aria-label={lihat ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-[--primary]"
      >
        <i className={`fas ${lihat ? "fa-eye-slash" : "fa-eye"}`} aria-hidden />
      </button>
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
      className="w-full rounded-xl bg-gradient-to-br from-navy-600 to-navy-800 py-3 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:from-navy-700 hover:to-navy-900 disabled:cursor-not-allowed disabled:opacity-50"
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