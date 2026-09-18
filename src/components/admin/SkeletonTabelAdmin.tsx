/**
 * Skeleton isi halaman — dipakai sebagai `loading.tsx` di rute admin yang
 * datanya paling sering terasa "diam" (tabel besar: daftar siswa, daftar
 * guru, bank soal, dsb).
 *
 * SENGAJA TIDAK dipasang di SEMUA rute admin. Halaman yang isinya kecil
 * (mis. form tambah satu guru) pindah-tampil begitu cepat sehingga
 * skeleton yang sempat terlihat selama 80ms hanya menambah kesan
 * "berkedip", bukan mengurangi. `NavigasiProgress` (bilah atas) sudah
 * cukup untuk kasus itu; skeleton ini khusus untuk yang datanya memang
 * butuh waktu diambil dari Supabase.
 *
 * Bentuknya generik (baris tabel) karena dipakai lintas halaman lewat
 * re-export `loading.tsx` masing-masing folder — lihat komentar di
 * `admin/siswa/loading.tsx`.
 */
export default function SkeletonTabelAdmin({
  judul = "Memuat data…",
}: {
  judul?: string;
}) {
  return (
    <div className="animasi-muncul">
      <div className="mb-5 flex items-center justify-between">
        <div className="h-6 w-40 skeleton-kilau rounded-md" />
        <div className="h-9 w-28 skeleton-kilau rounded-md" />
      </div>

      <div className="mb-4 flex gap-3">
        <div className="h-9 w-48 skeleton-kilau rounded-md" />
        <div className="h-9 w-32 skeleton-kilau rounded-md" />
      </div>

      <div className="overflow-hidden rounded-lg border border-ink/10 bg-white">
        <div className="border-b border-ink/10 bg-paper-dark/40 px-4 py-2.5">
          <div className="h-3 w-full max-w-md skeleton-kilau rounded" />
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-ink/5 px-4 py-3 last:border-0"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="h-3.5 w-1/4 rounded skeleton-kilau" />
            <div className="h-3.5 w-1/6 skeleton-kilau rounded" />
            <div className="h-3.5 w-1/6 skeleton-kilau rounded" />
            <div className="ml-auto h-3.5 w-16 skeleton-kilau rounded" />
          </div>
        ))}
      </div>

      <p className="sr-only">{judul}</p>
    </div>
  );
}
