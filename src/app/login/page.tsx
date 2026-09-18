import Image from "next/image";
import LoginForm from "./LoginForm";
import { BG_LOGIN_URL, LOGO_URL, SEKOLAH } from "@/lib/branding";

/**
 * Halaman login dirombak mengikuti desain acuan sekolah: foto gedung
 * sebagai latar satu layar penuh, kartu putih semi-transparan di
 * tengah, logo di atas, judul huruf kapital tiga baris.
 *
 * Latar dipasang sebagai `background-image` CSS (bukan `next/image`)
 * karena dia memang dekorasi halaman, bukan konten — dengan begitu
 * tidak ada elemen <img> yang perlu diatur posisinya, dan `fixed`
 * membuat fotonya tidak ikut bergeser saat kartu form memanjang di
 * layar HP.
 */
export default function LoginPage() {
  return (
    <main
      className="relative flex min-h-screen items-center justify-center bg-ink px-4 py-10"
      style={{
        backgroundImage: `url('${BG_LOGIN_URL}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Lapisan gelap tipis: foto gedungnya terang, tanpa ini teks di
          dalam kartu ikut "silau" dan kontrasnya turun. */}
      <div className="absolute inset-0 bg-slate-900/35" aria-hidden />

      <div className="relative w-full max-w-[400px] animasi-muncul rounded-[15px] bg-white/90 px-8 py-10 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-[5px]">
        <div className="mb-7 text-center">
          <Image
            src={LOGO_URL}
            alt={`Logo ${SEKOLAH.nama} ${SEKOLAH.kota}`}
            width={100}
            height={100}
            priority
            className="mx-auto h-[100px] w-auto object-contain"
          />
          <h1 className="mt-5 font-serif text-[1.4rem] font-semibold uppercase leading-tight text-ink">
            Login LMS
            <br />
            {SEKOLAH.nama}
            <br />
            {SEKOLAH.kota}
          </h1>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-[0.78rem] leading-relaxed text-slate-500">
          &copy; {SEKOLAH.tahun} SMP Negeri 8 Probolinggo
          <br />
          Created with{" "}
          <i className="fas fa-heart text-[#ff4d4d]" aria-hidden /> by{" "}
          {SEKOLAH.pembuat}
        </p>
      </div>
    </main>
  );
}
