"use client";

import { useCallback, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, MouseEvent } from "react";

/**
 * Gestur geser-kanan untuk membalas pesan (pola WhatsApp), dipakai di sisi
 * GURU (Part 5). Sengaja berupa hook murni — tidak tahu apa-apa soal
 * Supabase atau bentuk pesan; cuma memanggil `onBalas()` saat gestur tuntas.
 *
 * ── TIGA HAL YANG DIJAGA ──
 *
 * 1. Scroll vertikal tetap jalan. `touch-action: pan-y` menyerahkan gerak
 *    vertikal ke browser; gestur baru "dikunci" kalau gerak awal jelas
 *    lebih horizontal daripada vertikal.
 * 2. Geser TIDAK boleh ikut memicu klik. Bubble guru sudah punya klik untuk
 *    toggle bonus +5 poin (`toggleBonusPesan`). Tanpa `onClickCapture` di
 *    bawah, setiap geser-balas yang selesai akan diam-diam memberi/mencabut
 *    bonus. Klik yang datang tepat setelah geser ditelan.
 * 3. Geser ke kiri diabaikan (tidak ada aksi), dan ada peredam di atas
 *    ambang supaya bubble tidak terseret jauh.
 */

/** Jarak geser (px) yang dianggap "sengaja membalas". */
export const AMBANG_BALAS_PX = 56;
/** Gerak minimum sebelum arah (horizontal/vertikal) ditentukan. */
const AMBANG_KUNCI_PX = 8;
/** Batas geser visual maksimum. */
const JARAK_MAKS_PX = 88;

export interface GeserBalas {
  /** Sebar ke elemen bubble: `{...handlers}`. */
  handlers: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
    onClickCapture: (e: MouseEvent<HTMLElement>) => void;
  };
  /** Style untuk elemen yang ikut bergeser. */
  style: CSSProperties;
  /** 0..1 — seberapa dekat ke ambang; untuk memudarkan ikon balas. */
  kemajuan: number;
  /** true kalau geser sudah melewati ambang (lepas sekarang = membalas). */
  siapDilepas: boolean;
}

export function useGeserBalas(onBalas: () => void, aktif = true): GeserBalas {
  const awal = useRef<{ x: number; y: number; id: number } | null>(null);
  const terkunci = useRef(false);
  const barusaGeser = useRef(false);
  const sudahGetar = useRef(false);
  const [dx, setDx] = useState(0);
  const [sedangGeser, setSedangGeser] = useState(false);

  const reset = useCallback(() => {
    awal.current = null;
    terkunci.current = false;
    sudahGetar.current = false;
    setSedangGeser(false);
    setDx(0);
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!aktif) return;
      // Tombol mouse selain kiri tidak dihitung.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      awal.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      terkunci.current = false;
    },
    [aktif]
  );

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const a = awal.current;
    if (!a || e.pointerId !== a.id) return;

    const selisihX = e.clientX - a.x;
    const selisihY = e.clientY - a.y;

    if (!terkunci.current) {
      if (
        Math.abs(selisihX) < AMBANG_KUNCI_PX &&
        Math.abs(selisihY) < AMBANG_KUNCI_PX
      ) {
        return;
      }
      // Gerak awal lebih vertikal / ke kiri -> serahkan ke scroll, batal.
      if (Math.abs(selisihY) >= Math.abs(selisihX) || selisihX < 0) {
        awal.current = null;
        return;
      }
      terkunci.current = true;
      setSedangGeser(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // pointer sudah tidak aktif — abaikan
      }
    }

    // Peredam: di atas ambang, geser hanya dihitung 30%.
    const efektif =
      selisihX <= AMBANG_BALAS_PX
        ? selisihX
        : AMBANG_BALAS_PX + (selisihX - AMBANG_BALAS_PX) * 0.3;
    setDx(Math.max(0, Math.min(efektif, JARAK_MAKS_PX)));

    if (selisihX >= AMBANG_BALAS_PX && !sudahGetar.current) {
      sudahGetar.current = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(10);
      }
    } else if (selisihX < AMBANG_BALAS_PX) {
      sudahGetar.current = false;
    }
  }, []);

  const selesai = useCallback(
    (e: PointerEvent<HTMLElement>, dibatalkan: boolean) => {
      const a = awal.current;
      if (!a || e.pointerId !== a.id) return;

      const menggeser = terkunci.current;
      const cukupJauh = e.clientX - a.x >= AMBANG_BALAS_PX;

      if (menggeser) {
        // Telan klik yang menyusul pointerup ini (lihat catatan #2).
        barusaGeser.current = true;
        window.setTimeout(() => {
          barusaGeser.current = false;
        }, 80);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // sudah dilepas
        }
      }

      reset();
      if (menggeser && cukupJauh && !dibatalkan) onBalas();
    },
    [onBalas, reset]
  );

  const onClickCapture = useCallback((e: MouseEvent<HTMLElement>) => {
    if (barusaGeser.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => selesai(e, false),
      onPointerCancel: (e) => selesai(e, true),
      onClickCapture,
    },
    style: {
      transform: dx ? `translateX(${dx}px)` : undefined,
      transition: sedangGeser ? "none" : "transform 180ms ease-out",
      touchAction: "pan-y",
      userSelect: sedangGeser ? "none" : undefined,
    },
    kemajuan: Math.min(dx / AMBANG_BALAS_PX, 1),
    siapDilepas: dx >= AMBANG_BALAS_PX,
  };
}
