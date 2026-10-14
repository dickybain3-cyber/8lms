import type { Metadata } from "next";
import HalamanLogin from "../login/HalamanLogin";

export const metadata: Metadata = { title: "Masuk Kelas 9 | LMS SMPN 8 Probolinggo" };

/** Login khusus database Kelas 9. */
export default function LoginKelas9() {
  return <HalamanLogin jenjang={9} />;
}
