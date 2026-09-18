import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const JENJANG = 9;

const supabase = createClient(
  process.env[`NEXT_PUBLIC_SUPABASE_URL_${JENJANG}`],
  process.env[`SUPABASE_SERVICE_ROLE_KEY_${JENJANG}`],
  {
    realtime: { transport: WebSocket },
  }
);

async function main() {
  const { data: siswa, error } = await supabase
    .from('siswa')
    .select('id, username, tanggal_lahir')
    .is('auth_id', null);

  if (error) throw error;

  console.log(`[Kelas ${JENJANG}] Ditemukan ${siswa.length} siswa tanpa akun auth.`);

  for (const s of siswa) {
    const email = `${s.username}${process.env.NEXT_PUBLIC_SISWA_EMAIL_SUFFIX}`;
    const password = formatPassword(s.tanggal_lahir);

    const { data: user, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: s.username },
    });

    if (createErr) {
      console.error(`Gagal buat akun untuk ${s.username}:`, createErr.message);
      continue;
    }

    await supabase
      .from('siswa')
      .update({ auth_id: user.user.id })
      .eq('id', s.id);

    console.log(`OK: ${email}`);
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log('Selesai.');
}

function formatPassword(tanggalLahir) {
  const d = new Date(tanggalLahir);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

main();