"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSesiGuru } from "@/lib/admin-guard";
import { JENJANG_LABEL } from "@/lib/jenjang";
import { validasiPasswordGuru, validasiUsernameGuru } from "@/lib/akun";
import {
  akunDari,
  cariAkunTerhubung,
  laporanTakTerjangkau,
  terapkanFoto,
  terapkanPassword,
  terapkanUsername,
  urlFotoValid,
  verifikasiPassword,
  type AkunGuru,
  type LaporanSinkron,
  type StatusJenjang,
} from "@/lib/profil-guru";
import type { Jenjang } from "@/lib/jenjang";

/**
 * Tiga aksi profil guru: ganti username, ganti password, ganti foto.
 *
 * ── SIAPA YANG BOLEH MENGUBAH APA ──
 *
 * Tabel `guru` tidak punya policy UPDATE untuk siapa pun (0005), jadi semua
 * perubahan di sini berjalan lewat service_role. Karena RLS tidak lagi
 * menjaga, penjaganya adalah struktur file ini:
 *
 *   - Tidak ada parameter "guru mana" atau "jenjang mana" yang diterima
 *     dari browser. Identitas SELALU diturunkan dari sesi login
 *     (`getSesiGuru`), lalu baris di jenjang lain dicari lewat NIP milik
 *     baris sesi itu sendiri. Guru tidak punya cara menunjuk akun orang
 *     lain, bahkan kalau dia memanggil action ini langsung dengan DevTools.
 *   - Satu-satunya masukan yang datang dari browser adalah nilai barunya
 *     (username / password / URL foto), dan semuanya divalidasi ulang di
 *     sini walaupun form sudah memeriksanya.
 *
 * Tidak ada pengecualian untuk admin (`is_admin`): mengganti profil ORANG
 * LAIN memang bukan fitur halaman ini. Untuk itu ada tombol reset password
 * di /admin/guru.
 */

export type HasilProfil = {
  sukses: boolean;
  pesan: string;
  laporan: LaporanSinkron[];
};

type Konteks =
  | { galat: string }
  | {
      galat: null;
      jenjang: Jenjang;
      guruId: string;
      nip: string | null;
      username: string | null;
      email: string | null;
      akun: AkunGuru[];
      status: StatusJenjang[];
    };

async function siapkan(denganEmail: boolean): Promise<Konteks> {
  const sesi = await getSesiGuru();
  if (!sesi.guruId || !sesi.jenjang) {
    return { galat: "Sesi guru tidak ditemukan. Keluar lalu login ulang." };
  }

  // NIP dibaca lewat client sesi (kena RLS), bukan dari argumen browser.
  const supabase = createClient();
  const { data: baris, error } = await supabase
    .from("guru")
    .select("nip")
    .eq("id", sesi.guruId)
    .maybeSingle();

  if (error || !baris) {
    return { galat: "Data guru kamu tidak terbaca. Coba muat ulang halaman." };
  }
  const nip = (baris.nip as string | null) ?? null;

  const status = await cariAkunTerhubung({
    jenjangSesi: sesi.jenjang,
    guruIdSesi: sesi.guruId,
    nip,
    denganEmail,
  });
  const akun = akunDari(status);

  if (!akun.some((a) => a.jenjang === sesi.jenjang)) {
    const s = status.find((x) => x.jenjang === sesi.jenjang);
    const alasan = s && s.status === "gagal" ? ` (${s.alasan})` : "";
    return {
      galat: `Akun kamu di database ${JENJANG_LABEL[sesi.jenjang]} tidak terbaca${alasan}.`,
    };
  }

  return {
    galat: null,
    jenjang: sesi.jenjang,
    guruId: sesi.guruId,
    nip,
    username: sesi.username,
    email: sesi.email,
    akun,
    status,
  };
}

async function catat(
  aksi: string,
  guruId: string,
  detail: Record<string, unknown>
) {
  try {
    const supabase = createClient();
    const { error } = await supabase.rpc("catat_log_aktivitas", {
      p_aksi: aksi,
      p_entitas: "guru",
      p_entitas_id: guruId,
      p_detail: detail,
    });
    if (error) console.error(`Gagal mencatat log ${aksi}:`, error);
  } catch (e) {
    console.error(`Gagal mencatat log ${aksi}:`, e);
  }
}

function gagal(pesan: string): HasilProfil {
  return { sukses: false, pesan, laporan: [] };
}

// ---------------------------------------------------------------------------

export async function ubahUsername(usernameMentah: string): Promise<HasilProfil> {
  const cek = validasiUsernameGuru(usernameMentah);
  if (!cek.ok) return gagal(cek.pesan);
  const usernameBaru = cek.nilai;

  const k = await siapkan(true);
  if (k.galat !== null) return gagal(k.galat);

  // Username harus berubah di SEMUA jenjang sekaligus (alasannya di
  // `profil-guru.ts`). Kalau ada jenjang yang bahkan tidak terbaca,
  // mengubah sisanya berarti meninggalkan satu jenjang dengan username
  // lama tanpa ada yang tahu — lebih baik berhenti dan bilang terus terang.
  const tidakTerbaca = k.status.filter((s) => s.status === "gagal");
  if (tidakTerbaca.length > 0) {
    const rincian = tidakTerbaca
      .map((s) => s.status === "gagal" && `${JENJANG_LABEL[s.jenjang]}: ${s.alasan}`)
      .filter(Boolean)
      .join("; ");
    return gagal(
      `Username belum bisa diganti karena ada database yang tidak terjangkau (${rincian}). Username harus berubah di semua jenjang sekaligus, jadi tidak ada yang diubah. Hubungi admin.`
    );
  }

  const hasil = await terapkanUsername({
    akun: k.akun,
    jenjangSesi: k.jenjang,
    usernameBaru,
  });

  if (hasil.sukses) {
    await catat("ubah_username_guru", k.guruId, {
      username_lama: k.username,
      username_baru: usernameBaru,
      jenjang: hasil.laporan.filter((l) => l.ok).map((l) => l.jenjang),
    });
    revalidatePath("/admin", "layout");
  }
  return hasil;
}

export async function ubahPassword(
  passwordLama: string,
  passwordBaru: string,
  konfirmasi: string
): Promise<HasilProfil> {
  if (!passwordLama) return gagal("Isi password kamu yang sekarang.");
  if (passwordBaru !== konfirmasi) {
    return gagal("Konfirmasi tidak sama dengan password baru.");
  }

  const k = await siapkan(false);
  if (k.galat !== null) return gagal(k.galat);

  const aturan = validasiPasswordGuru(passwordBaru, {
    username: k.username,
    nip: k.nip,
  });
  if (!aturan.ok) return gagal(aturan.pesan);

  if (!k.email) {
    return gagal(
      "Email login akunmu tidak terbaca, jadi password lama belum bisa diperiksa. Coba keluar lalu login ulang."
    );
  }

  // Password lama diperiksa sungguhan ke Supabase Auth. Tanpa ini, siapa
  // pun yang menemukan komputer guru yang sedang login (sesi masih hidup)
  // bisa mengunci pemiliknya keluar hanya dengan dua kali mengetik.
  let cocok = false;
  try {
    cocok = await verifikasiPassword(k.jenjang, k.email, passwordLama);
  } catch {
    return gagal("Gagal memeriksa password lama. Coba lagi sebentar lagi.");
  }
  if (!cocok) return gagal("Password yang sekarang salah.");

  const hasil = await terapkanPassword({
    akun: k.akun,
    jenjangSesi: k.jenjang,
    passwordBaru: aturan.nilai,
    belumTerjangkau: laporanTakTerjangkau(k.status),
  });

  if (hasil.sukses) {
    // Password TIDAK PERNAH ikut dicatat — hanya fakta bahwa ia berubah.
    await catat("ganti_password_guru", k.guruId, {
      jenjang: hasil.laporan.filter((l) => l.ok).map((l) => l.jenjang),
    });
    revalidatePath("/admin/profil");
  }
  return hasil;
}

export async function ubahFoto(fotoUrl: string | null): Promise<HasilProfil> {
  if (fotoUrl !== null && !urlFotoValid(fotoUrl)) {
    return gagal(
      "Alamat foto tidak dikenali. Unggah ulang fotonya lewat tombol Pilih foto."
    );
  }

  const k = await siapkan(false);
  if (k.galat !== null) return gagal(k.galat);

  const hasil = await terapkanFoto({
    akun: k.akun,
    jenjangSesi: k.jenjang,
    fotoUrl,
    belumTerjangkau: laporanTakTerjangkau(k.status),
  });

  if (hasil.sukses) {
    await catat(fotoUrl ? "ganti_foto_guru" : "hapus_foto_guru", k.guruId, {
      jenjang: hasil.laporan.filter((l) => l.ok).map((l) => l.jenjang),
    });
    revalidatePath("/admin", "layout");
  }
  return hasil;
}
