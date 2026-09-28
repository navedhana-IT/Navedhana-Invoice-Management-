import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}>
        <svg width="120" height="120" viewBox="0 0 32 32">
          <path d="M9 23V9.5l14 13V9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 26.5h14" stroke="#fff" strokeOpacity=".45" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
