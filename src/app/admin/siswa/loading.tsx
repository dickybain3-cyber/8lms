import SkeletonTabelAdmin from "@/components/admin/SkeletonTabelAdmin";

/**
 * File `loading.tsx` di sini terpasang OTOMATIS oleh Next.js App Router
 * — begitu ada di folder rute ini, dia ditampilkan sendiri sebagai
 * fallback Suspense saat `page.tsx` di folder yang sama masih menunggu
 * data (query Supabase-nya), tanpa perlu dipanggil manual di mana pun.
 * Lihat `SkeletonTabelAdmin.tsx` untuk alasan bentuknya.
 */
export default function Loading() {
  return <SkeletonTabelAdmin judul="Memuat data siswa…" />;
}
