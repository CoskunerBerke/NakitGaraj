/**
 * Tek yetkili backend API taban adresi.
 *
 * Üretimde NEXT_PUBLIC_API_URL derleme sırasında verilmelidir
 * (ör. https://alanadi.com/api — ters vekil arkasında).
 * Verilmezse yerel geliştirme davranışı korunur: aynı makinede 3001 portu.
 */
const configured = process.env.NEXT_PUBLIC_API_URL;

export const API_BASE = configured
  ? configured.replace(/\/+$/, '')
  : typeof window !== 'undefined'
    ? `http://${window.location.hostname}:3001/api`
    : 'http://127.0.0.1:3001/api';
