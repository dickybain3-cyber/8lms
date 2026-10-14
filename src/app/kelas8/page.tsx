import type { Metadata } from "next";
import HalamanLogin from "../login/HalamanLogin";

export const metadata: Metadata = { title: "Masuk Kelas 8 | LMS SMPN 8 Probolinggo" };

/** Login khusus database Kelas 8. */
export default function LoginKelas8() {
  return <HalamanLogin jenjang={8} />;
}
