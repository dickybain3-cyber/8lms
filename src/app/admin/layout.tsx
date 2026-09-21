import { getSesiGuru } from "@/lib/admin-guard";
import AdminShell from "./AdminShell";

/**
 * Semua info identitas/hak akses diambil sekali di sini lalu dioper ke
 * `AdminShell` (Client Component) sebagai props — bukan dibaca ulang di
 * tiap halaman. Selain hemat query, ini juga menjaga satu sumber
 * kebenaran untuk "jenjang mana yang aktif", yang sekarang ditampilkan
 * besar-besar di banner supaya guru tidak salah input ke jenjang lain.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesi = await getSesiGuru();

  return (
    <AdminShell
      userEmail={sesi.email}
      namaGuru={sesi.nama}
      jenjang={sesi.jenjang}
      isAdmin={sesi.isAdmin}
      fotoUrl={sesi.fotoUrl}
    >
      {children}
    </AdminShell>
  );
}
