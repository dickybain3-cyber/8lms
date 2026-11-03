/**
 * Jalankan: npx tsx src/lib/__tests__/ai-gemini.test.ts
 *
 * Menguji giliran kunci Gemini dengan `fetch` palsu — tanpa jaringan,
 * tanpa kunci sungguhan (kunci di bawah hanya string contoh).
 */
import assert from "node:assert/strict";

process.env.GEMINI_API_KEYS_7 = "kunci-uji-satu-aaaa, kunci-uji-dua-bbbb\nkunci-uji-tiga-cccc";
process.env.GEMINI_API_KEYS_8 = "kunci-uji-empat-dddd;kunci-uji-lima-eeee";
delete process.env.GEMINI_API_KEYS;
delete process.env.GEMINI_MODEL;
process.env.GEMINI_JEDA_SIBUK_MS = "0";

type Jawab = { status: number; body: unknown };
let antrean: ((kunci: string, url: string, body: Record<string, unknown>) => Jawab)[] = [];
const tercatat: { kunci: string; url: string; body: Record<string, unknown> }[] = [];

globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const url = String(input);
  const kunci = (init?.headers as Record<string, string>)["x-goog-api-key"];
  const body = JSON.parse(String(init?.body ?? "{}"));
  tercatat.push({ kunci, url, body });
  const f = antrean.shift();
  if (!f) throw new Error("fetch tak terduga");
  const j = f(kunci, url, body);
  return new Response(JSON.stringify(j.body), { status: j.status });
}) as typeof fetch;

const ok = (obj: unknown): Jawab => ({
  status: 200,
  body: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] },
});

async function main() {
  const { panggilGeminiJson, aiTersedia, GalatAi } = await import("@/lib/ai/gemini");
  let lulus = 0;
  const uji = async (nama: string, fn: () => Promise<void>) => {
    tercatat.length = 0;
    await fn();
    lulus++;
    console.log(`  ✓ ${nama}`);
  };

  await uji("kunci terbaca dari env, jenjang lain kosong", async () => {
    assert.equal(await aiTersedia(7), true);
    assert.equal(await aiTersedia(9), false);
  });

  await uji("429 lalu kunci tidak sah (400) → pindah ke kunci ketiga", async () => {
    antrean = [
      () => ({ status: 429, body: { error: { message: "quota" } } }),
      () => ({ status: 400, body: { error: { message: "API key not valid.", status: "INVALID_ARGUMENT" } } }),
      () => ok({ soal: [1, 2] }),
    ];
    const h = await panggilGeminiJson<{ soal: number[] }>(7, "uji", { skema: { type: "OBJECT" } });
    assert.deepEqual(h.soal, [1, 2]);
    assert.equal(new Set(tercatat.map((t) => t.kunci)).size, 3, "tiga kunci berbeda dicoba");
    assert.ok(tercatat[0].url.includes("gemini-flash-latest"));
    assert.ok((tercatat[0].body.generationConfig as Record<string, unknown>).responseSchema);
  });

  await uji("round-robin: panggilan berikutnya mulai dari kunci lain", async () => {
    antrean = [() => ok({ a: 1 })];
    await panggilGeminiJson(8, "x");
    const pertama = tercatat[0].kunci;
    antrean = [() => ok({ a: 2 })];
    tercatat.length = 0;
    await panggilGeminiJson(8, "x");
    assert.notEqual(tercatat[0].kunci, pertama);
  });

  await uji("kunci yang sedang istirahat (429) didahului kunci yang siap", async () => {
    // Dari uji sebelumnya, dua kunci kelas 7 sedang istirahat.
    antrean = [() => ok({ a: 3 })];
    await panggilGeminiJson(7, "x");
    assert.equal(tercatat[0].kunci, "kunci-uji-tiga-cccc");
  });

  await uji("404 model → model cadangan dengan kunci yang sama", async () => {
    antrean = [() => ({ status: 404, body: { error: { message: "not found" } } }), () => ok({ b: 1 })];
    await panggilGeminiJson(7, "x");
    assert.equal(tercatat[0].kunci, tercatat[1].kunci);
    assert.ok(tercatat[1].url.includes("gemini-flash-lite-latest"));
  });

  await uji("400 karena schema → ulang tanpa responseSchema", async () => {
    antrean = [
      () => ({ status: 400, body: { error: { message: "Invalid responseSchema field" } } }),
      () => ok({ c: 1 }),
    ];
    await panggilGeminiJson(7, "x", { skema: { type: "OBJECT" } });
    assert.ok(!(tercatat[1].body.generationConfig as Record<string, unknown>).responseSchema);
  });

  await uji("thinking dimatikan; kalau ditolak → ulang tanpa thinkingConfig", async () => {
    antrean = [
      () => ({ status: 400, body: { error: { message: "Thinking budget is not supported" } } }),
      () => ok({ t: 1 }),
    ];
    await panggilGeminiJson(7, "x");
    const gc = (i: number) => tercatat[i].body.generationConfig as Record<string, unknown>;
    assert.deepEqual(gc(0).thinkingConfig, { thinkingBudget: 0 });
    assert.equal(gc(1).thinkingConfig, undefined);
    assert.equal(tercatat[0].kunci, tercatat[1].kunci);
  });

  await uji("400 tanpa keterangan → lepas thinking, lalu skema (skema ditempel ke prompt)", async () => {
    antrean = [
      () => ({ status: 400, body: { error: { message: "Request contains an invalid argument." } } }),
      () => ({ status: 400, body: { error: { message: "Request contains an invalid argument." } } }),
      () => ok({ s: 1 }),
    ];
    await panggilGeminiJson(7, "x", { skema: { type: "OBJECT", properties: { soal: { type: "ARRAY" } } } });
    const gc = (i: number) => tercatat[i].body.generationConfig as Record<string, unknown>;
    assert.ok(gc(0).thinkingConfig && gc(0).responseSchema);
    assert.ok(!gc(1).thinkingConfig && gc(1).responseSchema);
    assert.ok(!gc(2).thinkingConfig && !gc(2).responseSchema);
    const teks = JSON.stringify(tercatat[2].body.contents);
    assert.match(teks, /nama field persis/);
    assert.equal(new Set(tercatat.map((t) => t.kunci)).size, 1, "kunci yang sama");
  });

  await uji("400 terus-menerus → pesan Google ikut tampil, kunci disamarkan", async () => {
    antrean = [0, 1, 2].map(() => () => ({ status: 400, body: { error: { message: "Bad field AIzaSyTEST1234567890abc" } } }));
    await assert.rejects(panggilGeminiJson(7, "x", { skema: { type: "OBJECT" } }), (e: unknown) => {
      assert.ok(e instanceof GalatAi);
      assert.match((e as Error).message, /Bad field \[kunci\]/);
      return true;
    });
  });

  await uji("503 (model penuh) → kunci berikutnya memakai model cadangan", async () => {
    antrean = [() => ({ status: 503, body: { error: { message: "overloaded" } } }), () => ok({ e: 1 })];
    await panggilGeminiJson(7, "x");
    assert.ok(tercatat[0].url.includes("gemini-flash-latest"));
    assert.ok(tercatat[1].url.includes("gemini-flash-lite-latest"));
    assert.notEqual(tercatat[0].kunci, tercatat[1].kunci);
  });

  await uji("JSON dibungkus ```json``` tetap terbaca", async () => {
    antrean = [
      () => ({
        status: 200,
        body: { candidates: [{ content: { parts: [{ text: '```json\n{"d":4}\n```' }] } }] },
      }),
    ];
    const h = await panggilGeminiJson<{ d: number }>(7, "x");
    assert.equal(h.d, 4);
  });

  await uji("semua kunci gagal → GalatAi 503 tanpa membocorkan kunci", async () => {
    antrean = [0, 1, 2, 3, 4, 5].map(() => () => ({ status: 503, body: {} }));
    await assert.rejects(panggilGeminiJson(7, "x"), (e: unknown) => {
      assert.ok(e instanceof GalatAi);
      assert.equal((e as InstanceType<typeof GalatAi>).status, 503);
      assert.ok(!(e as Error).message.includes("kunci-uji"));
      return true;
    });
  });

  await uji("jenjang tanpa kunci → pesan jelas", async () => {
    await assert.rejects(panggilGeminiJson(9, "x"), /GEMINI_API_KEYS_9/);
  });

  console.log(`\n${lulus} uji lulus.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
