'use client';

/** Last-resort boundary when the root layout itself fails; must render its own <html>. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, background: '#f7f8fb', color: '#0e1726' }}>
        <main style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#5b6b82', marginBottom: 24 }}>nbills couldn’t load. Please try again in a moment.</p>
          <button onClick={reset} style={{ background: '#4f46e5', color: '#fff', border: 0, borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer' }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
