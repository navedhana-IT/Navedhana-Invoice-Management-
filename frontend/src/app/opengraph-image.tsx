import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/seo';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${SITE_NAME} — A Navedhana Product`;

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 80, background: 'linear-gradient(135deg,#1e1b4b 0%,#312e81 55%,#6d28d9 100%)', color: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg,#6366f1,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.25)' }}>
            <svg width="44" height="44" viewBox="0 0 32 32"><path d="M9 23V9.5l14 13V9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 36, fontWeight: 700 }}>{SITE_NAME}</div>
            <div style={{ fontSize: 18, letterSpacing: 4, opacity: 0.7, textTransform: 'uppercase' }}>A Navedhana Product</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>Every brand. Every invoice. One ledger.</div>
          <div style={{ fontSize: 30, marginTop: 28, opacity: 0.85 }}>GST invoicing, payment schedules and reports for multi-brand companies</div>
        </div>
      </div>
    ),
    size,
  );
}
