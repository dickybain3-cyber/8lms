import type { Metadata } from "next";
import HalamanLogin from "../login/HalamanLogin";

export const metadata: Metadata = { title: "Masuk Kelas 7 | LMS SMPN 8 Probolinggo" };

/** Login khusus database Kelas 7. */
export default function LoginKelas7() {
  return <HalamanLogin jenjang={7} />;
}
