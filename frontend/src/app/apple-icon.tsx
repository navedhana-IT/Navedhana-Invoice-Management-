import { ImageResponse } from 'next/og';
import fs from 'node:fs';
import path from 'node:path';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const iconBuffer = fs.readFileSync(path.join(process.cwd(), 'public/logo-mark.png'));
  const iconBase64 = `data:image/png;base64,${iconBuffer.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
          borderRadius: 36,
        }}
      >
        <img
          src={iconBase64}
          alt=""
          width="130"
          height="130"
          style={{ objectFit: 'contain' }}
        />
      </div>
    ),
    size,
  );
}
