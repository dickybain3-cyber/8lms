"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearJenjangCookie } from "@/lib/jenjang";

/**
 * Sesi 16 — belum pernah ada tombol logout sama sekali sejak Sesi 1
 * (celah nyata, ketahuan pas nulis fitur pilih-jenjang). Sekarang jadi
 * WAJIB, bukan cuma nice-to-have: cara paling aman untuk pindah jenjang
 * (mis. guru yang habis buka dashboard kelas 7, mau lihat kelas 8) atau
 * gonta-ganti siswa di satu komputer lab adalah logout dulu — signOut()
 * membersihkan sesi project yang lagi aktif, `clearJenjangCookie()`
 * membersihkan penanda project mana yang dituju, supaya orang
 * berikutnya yang pakai komputer itu mulai dari nol, bukan "mewarisi"
 * pilihan jenjang orang sebelumnya.
 *
 * `className` bisa dioper karena tampilannya beda di dua tempat: pil
 * merah di header siswa, dan tombol lebar di kaki sidebar admin.
 */
export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Kalau createClient() gagal (mis. cookie jenjang sudah hilang
      // duluan), tetap lanjut bersihkan & redirect — tidak ada gunanya
      // menahan orang tetap di halaman ini gara-gara logout "gagal".
    }
    clearJenjangCookie();
    setLoading(false);
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={className ?? "btn-logout"}
    >
      <i
        className={`fas ${loading ? "fa-circle-notch fa-spin" : "fa-power-off"}`}
        aria-hidden
      />
      {loading ? "Keluar…" : "Keluar"}
    </button>
  );
}
