import { redirect } from "next/navigation";

export default function RootPage() {
  // Kalau user sudah login, middleware.ts sudah meredirect sebelum
  // sampai ke sini. Jadi kalau sampai di sini, pasti belum login.
  redirect("/login");
}
