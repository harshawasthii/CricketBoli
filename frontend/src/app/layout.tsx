import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['400', '700', '800', '900'] });

export const metadata: Metadata = {
  title: 'CricketBoli',
  description: 'Premium IPL Fantasy Auction Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${outfit.variable}`}>
        {children}
      </body>
    </html>
  );
}
