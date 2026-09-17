import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EventScraper – Hitta lokala event',
  description: 'Aggregera event från lokala RSS-flöden och upptäck vad som händer i din stad.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body className="bg-[#FAF8F4]">
        {children}
      </body>
    </html>
  );
}
