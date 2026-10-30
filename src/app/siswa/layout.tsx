import PenjagaCheckout from "@/components/siswa/ujian/PenjagaCheckout";

/**
 * Layout paling luar untuk seluruh /siswa/*. Sengaja dibuat transparan
 * (tanpa header/nav) — dashboard (`(dashboard)/layout.tsx`) dan halaman
 * ujian (`ujian/[mapelId]/page.tsx` lewat `ExamClient`) punya kebutuhan
 * chrome yang beda (dashboard: header + navigasi; ujian: bar fokus
 * dengan timer, tanpa navigasi besar supaya siswa tidak terdistraksi),
 * jadi masing-masing mengatur wrapper-nya sendiri lewat route group.
 *
 * `PenjagaCheckout` dipasang di sini karena jendela checkout harus muncul
 * di kedua jenis halaman itu.
 */
export default function SiswaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PenjagaCheckout />
    </>
  );
}
