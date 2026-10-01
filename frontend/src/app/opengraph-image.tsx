import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/seo';
import fs from 'node:fs';
import path from 'node:path';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${SITE_NAME} — A Navedhana Product`;

export default function OgImage() {
  const logoBuffer = fs.readFileSync(path.join(process.cwd(), 'public/logo-dark.png'));
  const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          background: 'linear-gradient(135deg,#0b1020 0%,#111827 55%,#1f2937 100%)',
          color: 'white',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img
            src={logoBase64}
            alt={alt}
            height="80"
            style={{ objectFit: 'contain' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.15 }}>
            Every brand. Every invoice. One ledger.
          </div>
          <div style={{ fontSize: 28, marginTop: 24, opacity: 0.85, color: '#e2e8f0' }}>
            GST invoicing, payment schedules and reports for multi-brand companies
          </div>
        </div>
      </div>
    ),
    size,
  );
}
