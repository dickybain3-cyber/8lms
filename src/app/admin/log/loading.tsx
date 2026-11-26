import SkeletonTabelAdmin from "@/components/admin/SkeletonTabelAdmin";

/** Kerangka langsung tampil saat menu diklik, selagi data diambil (lihat `admin/siswa/loading.tsx`). */
export default function Loading() {
  return <SkeletonTabelAdmin judul="Memuat log aktivitas…" />;
}
