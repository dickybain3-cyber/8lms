"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AvatarGuru from "@/components/AvatarGuru";
import {
  Info,
  Kartu,
  TOMBOL_BIASA,
  TOMBOL_UTAMA,
} from "@/components/ui/Panel";
import {
  PASSWORD_MIN,
  USERNAME_MAKS,
  USERNAME_MIN,
  validasiUsernameGuru,
} from "@/lib/akun";
import { JENJANG_LABEL, type Jenjang } from "@/lib/jenjang";
import { ACCEPT_GAMBAR } from "@/lib/unggah-gambar";
import {
  siapkanFotoProfil,
  unggahFotoProfil,
  type FotoProfilSiap,
} from "@/lib/foto-profil";
import { ubahFoto, ubahPassword, ubahUsername } from "./actions";

export interface ProfilData {
  nama: string;
  nip: string | null;
  username: string | null;
  email: string | null;
  fotoUrl: string | null;
  passwordDigantiAt: string | null;
  peran: "Administrator" | "Guru";
  jenjangSesi: Jenjang;
  terhubung: {
    jenjang: Jenjang;
    status: "terhubung" | "tidak_ada" | "gagal";
    nama?: string;
    alasan?: string;
  }[];
  /** Migrasi 0016 belum jalan di project sesi: tombol simpan dimatikan. */
  nonaktif: boolean;
}

type Umpan = { nada: "sukses" | "galat"; pesan: string } | null;

const INPUT =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-slate-400 focus:border-[--accent] focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50 disabled:text-slate-400";

function tanggalPanjang(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function PesanUmpan({ umpan }: { umpan: Umpan }) {
  if (!umpan) return null;
  return (
    <div role="status" className="mt-4">
      <Info nada={umpan.nada === "sukses" ? "sukses" : "peringatan"}>
        {umpan.pesan}
      </Info>
    </div>
  );
}

export default function ProfilClient({ data }: { data: ProfilData }) {
  const router = useRouter();

  // Nilai yang sedang tampil. Dipisah dari `data` supaya kartu langsung
  // berubah begitu aksi berhasil, tanpa menunggu `router.refresh()` selesai
  // mengambil ulang halaman.
  const [username, setUsername] = useState(data.username);
  const [fotoUrl, setFotoUrl] = useState(data.fotoUrl);
  const [passwordDigantiAt, setPasswordDigantiAt] = useState(
    data.passwordDigantiAt
  );

  // Kalau server mengirim data baru (setelah refresh), ikuti.
  useEffect(() => setUsername(data.username), [data.username]);
  useEffect(() => setFotoUrl(data.fotoUrl), [data.fotoUrl]);
  useEffect(
    () => setPasswordDigantiAt(data.passwordDigantiAt),
    [data.passwordDigantiAt]
  );

  const [sibuk, setSibuk] = useState<"foto" | "username" | "password" | null>(
    null
  );

  // ---- Foto ---------------------------------------------------------------
  const inputBerkas = useRef<HTMLInputElement>(null);
  const [pilihan, setPilihan] = useState<FotoProfilSiap | null>(null);
  const [yakinHapus, setYakinHapus] = useState(false);
  const [umpanFoto, setUmpanFoto] = useState<Umpan>(null);

  // Bebaskan URL sementara saat pilihan diganti/dibuang atau halaman ditutup.
  useEffect(() => {
    return () => {
      if (pilihan) URL.revokeObjectURL(pilihan.urlPratinjau);
    };
  }, [pilihan]);

  async function saatBerkasDipilih(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset supaya memilih berkas yang SAMA dua kali tetap memicu onChange.
    e.target.value = "";
    if (!file) return;

    setUmpanFoto(null);
    setYakinHapus(false);
    try {
      setPilihan(await siapkanFotoProfil(file));
    } catch (err) {
      setPilihan(null);
      setUmpanFoto({
        nada: "galat",
        pesan: err instanceof Error ? err.message : "Foto tidak bisa dipakai.",
      });
    }
  }

  async function simpanFoto() {
    if (!pilihan) return;
    setSibuk("foto");
    setUmpanFoto(null);
    try {
      const url = await unggahFotoProfil(pilihan.blob);
      const hasil = await ubahFoto(url);
      if (hasil.sukses) {
        setFotoUrl(url);
        setPilihan(null);
        router.refresh();
      }
      setUmpanFoto({
        nada: hasil.sukses ? "sukses" : "galat",
        pesan: hasil.pesan,
      });
    } catch (err) {
      // Kegagalan unggah ke Cloudinary muncul di sini dengan pesan yang
      // sudah berbahasa manusia (lihat `uploadKeCloudinary`).
      setUmpanFoto({
        nada: "galat",
        pesan: err instanceof Error ? err.message : "Gagal menyimpan foto.",
      });
    } finally {
      setSibuk(null);
    }
  }

  async function hapusFoto() {
    setSibuk("foto");
    setUmpanFoto(null);
    try {
      const hasil = await ubahFoto(null);
      if (hasil.sukses) {
        setFotoUrl(null);
        setYakinHapus(false);
        router.refresh();
      }
      setUmpanFoto({
        nada: hasil.sukses ? "sukses" : "galat",
        pesan: hasil.pesan,
      });
    } finally {
      setSibuk(null);
    }
  }

  // ---- Username -----------------------------------------------------------
  const [usernameInput, setUsernameInput] = useState(data.username ?? "");
  const [umpanUsername, setUmpanUsername] = useState<Umpan>(null);

  const cekUsername = validasiUsernameGuru(usernameInput);
  const usernameSama =
    cekUsername.ok && cekUsername.nilai === (username ?? "").toLowerCase();
  const tampilGalatUsername = usernameInput !== "" && !cekUsername.ok;

  async function simpanUsername(e: React.FormEvent) {
    e.preventDefault();
    if (!cekUsername.ok) return;
    setSibuk("username");
    setUmpanUsername(null);
    try {
      const hasil = await ubahUsername(usernameInput);
      if (hasil.sukses) {
        setUsername(cekUsername.nilai);
        setUsernameInput(cekUsername.nilai);
        router.refresh();
      }
      setUmpanUsername({
        nada: hasil.sukses ? "sukses" : "galat",
        pesan: hasil.pesan,
      });
    } finally {
      setSibuk(null);
    }
  }

  // ---- Password -----------------------------------------------------------
  const [passLama, setPassLama] = useState("");
  const [passBaru, setPassBaru] = useState("");
  const [passUlang, setPassUlang] = useState("");
  const [lihatPass, setLihatPass] = useState(false);
  const [umpanPass, setUmpanPass] = useState<Umpan>(null);

  const passPendek = passBaru !== "" && passBaru.length < PASSWORD_MIN;
  const passBeda = passUlang !== "" && passUlang !== passBaru;
  const passSiap =
    passLama !== "" &&
    passBaru.length >= PASSWORD_MIN &&
    passBaru === passUlang;

  async function simpanPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passSiap) return;
    setSibuk("password");
    setUmpanPass(null);
    try {
      const hasil = await ubahPassword(passLama, passBaru, passUlang);
      if (hasil.sukses) {
        setPassLama("");
        setPassBaru("");
        setPassUlang("");
        setLihatPass(false);
        setPasswordDigantiAt(new Date().toISOString());
        router.refresh();
      }
      setUmpanPass({
        nada: hasil.sukses ? "sukses" : "galat",
        pesan: hasil.pesan,
      });
    } finally {
      setSibuk(null);
    }
  }

  const terkunci = data.nonaktif || sibuk !== null;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* ------------------------------ kolom kiri ------------------------------ */}
      <div className="space-y-5">
        <Kartu>
          <div className="flex flex-col items-center text-center">
            {pilihan ? (
              <span className="inline-flex h-32 w-32 overflow-hidden rounded-full bg-slate-200 ring-4 ring-blue-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pilihan.urlPratinjau}
                  alt="Pratinjau foto baru"
                  className="h-full w-full object-cover"
                />
              </span>
            ) : (
              <AvatarGuru
                fotoUrl={fotoUrl}
                nama={data.nama}
                ukuran={128}
                className="ring-4 ring-slate-100"
              />
            )}

            <h2 className="mt-4 font-serif text-xl font-bold text-ink">
              {data.nama}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {data.peran}
              {data.nip ? ` · NIP ${data.nip}` : " · belum ada NIP"}
            </p>

            <input
              ref={inputBerkas}
              type="file"
              accept={ACCEPT_GAMBAR}
              onChange={saatBerkasDipilih}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
            />

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {pilihan ? (
                <>
                  <button
                    type="button"
                    onClick={simpanFoto}
                    disabled={terkunci}
                    className={TOMBOL_UTAMA}
                  >
                    <i
                      className={`fas ${sibuk === "foto" ? "fa-circle-notch fa-spin" : "fa-check"}`}
                      aria-hidden
                    />
                    {sibuk === "foto" ? "Menyimpan…" : "Simpan foto"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPilihan(null)}
                    disabled={sibuk === "foto"}
                    className={TOMBOL_BIASA}
                  >
                    Batal
                  </button>
                </>
              ) : yakinHapus ? (
                <>
                  <button
                    type="button"
                    onClick={hapusFoto}
                    disabled={terkunci}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                  >
                    {sibuk === "foto" ? "Menghapus…" : "Ya, hapus foto"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setYakinHapus(false)}
                    disabled={sibuk === "foto"}
                    className={TOMBOL_BIASA}
                  >
                    Batal
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => inputBerkas.current?.click()}
                    disabled={terkunci}
                    className={TOMBOL_UTAMA}
                  >
                    <i className="fas fa-camera" aria-hidden />
                    {fotoUrl ? "Ganti foto" : "Pilih foto"}
                  </button>
                  {fotoUrl && (
                    <button
                      type="button"
                      onClick={() => setYakinHapus(true)}
                      disabled={terkunci}
                      className={TOMBOL_BIASA}
                    >
                      Hapus foto
                    </button>
                  )}
                </>
              )}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Foto dipotong persegi dari bagian tengah. JPG, PNG, atau WebP.
            </p>
          </div>
          <PesanUmpan umpan={umpanFoto} />
        </Kartu>

        <Kartu>
          <h3 className="font-serif text-base font-semibold text-ink">
            Akun di setiap jenjang
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {data.nip
              ? "Akunmu dikenali lewat NIP. Perubahan di halaman ini ikut berlaku di jenjang yang bertanda centang."
              : "Akunmu belum punya NIP, jadi perubahan hanya berlaku di jenjang ini. Minta admin mengisi NIP-mu supaya bisa ikut berlaku di jenjang lain."}
          </p>

          <ul className="mt-3 divide-y divide-slate-100">
            {[7, 8, 9].map((j) => {
              const jenjang = j as Jenjang;
              const s = data.terhubung.find((t) => t.jenjang === jenjang);
              const sesi = jenjang === data.jenjangSesi;
              const ada = s?.status === "terhubung";
              return (
                <li key={jenjang} className="flex items-start gap-3 py-2.5">
                  <i
                    className={`fas mt-0.5 w-4 text-center text-sm ${
                      ada
                        ? "fa-circle-check text-emerald-500"
                        : s?.status === "gagal"
                          ? "fa-triangle-exclamation text-amber-500"
                          : "fa-circle-minus text-slate-300"
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink">
                      {JENJANG_LABEL[jenjang]}
                      {sesi && (
                        <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[0.68rem] font-semibold text-blue-600">
                          sedang dipakai
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {ada
                        ? s?.nama
                        : s?.status === "gagal"
                          ? `Tidak terjangkau: ${s.alasan}`
                          : sesi
                            ? "—"
                            : "Belum terdaftar"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Kartu>
      </div>

      {/* ------------------------------ kolom kanan ----------------------------- */}
      <div className="space-y-5">
        <Kartu>
          <form onSubmit={simpanUsername} noValidate>
            <h3 className="font-serif text-lg font-semibold text-ink">
              Username
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Dipakai untuk masuk. NIP tetap menjadi penanda datamu dan tidak
              ikut berubah.
            </p>

            {!username && (
              <div className="mt-4">
                <Info nada="info">
                  Akunmu masih masuk dengan email
                  {data.email ? ` (${data.email})` : ""}. Begitu kamu
                  menetapkan username, masuknya memakai username itu.
                </Info>
              </div>
            )}

            <label
              htmlFor="username"
              className="mt-5 block text-sm font-medium text-slate-700"
            >
              Username baru
            </label>
            <input
              id="username"
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              disabled={terkunci}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={USERNAME_MAKS + 10}
              aria-invalid={tampilGalatUsername}
              aria-describedby="username-bantuan"
              className={`${INPUT} mt-1.5`}
            />
            <p
              id="username-bantuan"
              className={`mt-1.5 text-xs ${
                tampilGalatUsername ? "text-red-600" : "text-slate-400"
              }`}
            >
              {tampilGalatUsername && !cekUsername.ok
                ? cekUsername.pesan
                : `${USERNAME_MIN}–${USERNAME_MAKS} karakter: huruf, angka, titik, garis bawah, atau strip.`}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={terkunci || !cekUsername.ok || usernameSama}
                className={TOMBOL_UTAMA}
              >
                <i
                  className={`fas ${sibuk === "username" ? "fa-circle-notch fa-spin" : "fa-floppy-disk"}`}
                  aria-hidden
                />
                {sibuk === "username" ? "Menyimpan…" : "Simpan username"}
              </button>
              <span className="text-xs text-slate-400">
                Berlaku di semua jenjang sekaligus.
              </span>
            </div>
            <PesanUmpan umpan={umpanUsername} />
          </form>
        </Kartu>

        <Kartu>
          <form onSubmit={simpanPassword} noValidate>
            <h3 className="font-serif text-lg font-semibold text-ink">
              Password
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              {passwordDigantiAt
                ? `Terakhir kamu ganti pada ${tanggalPanjang(passwordDigantiAt)}.`
                : "Kamu belum pernah menggantinya sendiri — passwordnya masih pemberian admin. Sebaiknya diganti."}
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="pass-lama"
                  className="block text-sm font-medium text-slate-700"
                >
                  Password yang sekarang
                </label>
                <input
                  id="pass-lama"
                  type={lihatPass ? "text" : "password"}
                  value={passLama}
                  onChange={(e) => setPassLama(e.target.value)}
                  disabled={terkunci}
                  autoComplete="current-password"
                  className={`${INPUT} mt-1.5`}
                />
              </div>

              <div>
                <label
                  htmlFor="pass-baru"
                  className="block text-sm font-medium text-slate-700"
                >
                  Password baru
                </label>
                <input
                  id="pass-baru"
                  type={lihatPass ? "text" : "password"}
                  value={passBaru}
                  onChange={(e) => setPassBaru(e.target.value)}
                  disabled={terkunci}
                  autoComplete="new-password"
                  aria-invalid={passPendek}
                  aria-describedby="pass-baru-bantuan"
                  className={`${INPUT} mt-1.5`}
                />
                <p
                  id="pass-baru-bantuan"
                  className={`mt-1.5 text-xs ${passPendek ? "text-red-600" : "text-slate-400"}`}
                >
                  Minimal {PASSWORD_MIN} karakter, dan bukan username atau NIP
                  kamu.
                </p>
              </div>

              <div>
                <label
                  htmlFor="pass-ulang"
                  className="block text-sm font-medium text-slate-700"
                >
                  Ulangi password baru
                </label>
                <input
                  id="pass-ulang"
                  type={lihatPass ? "text" : "password"}
                  value={passUlang}
                  onChange={(e) => setPassUlang(e.target.value)}
                  disabled={terkunci}
                  autoComplete="new-password"
                  aria-invalid={passBeda}
                  aria-describedby={passBeda ? "pass-ulang-galat" : undefined}
                  className={`${INPUT} mt-1.5`}
                />
                {passBeda && (
                  <p id="pass-ulang-galat" className="mt-1.5 text-xs text-red-600">
                    Belum sama dengan password baru di atas.
                  </p>
                )}
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={lihatPass}
                  onChange={(e) => setLihatPass(e.target.checked)}
                  className="h-4 w-4 accent-[--primary]"
                />
                Tampilkan password
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={terkunci || !passSiap}
                className={TOMBOL_UTAMA}
              >
                <i
                  className={`fas ${sibuk === "password" ? "fa-circle-notch fa-spin" : "fa-key"}`}
                  aria-hidden
                />
                {sibuk === "password" ? "Menyimpan…" : "Ganti password"}
              </button>
              <span className="text-xs text-slate-400">
                Berlaku di semua jenjang sekaligus.
              </span>
            </div>
            <PesanUmpan umpan={umpanPass} />
          </form>
        </Kartu>
      </div>
    </div>
  );
}
