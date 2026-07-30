import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { AuthProvider } from '@/hooks/useUserRole';
import { Navbar } from '@/components/layout/Navbar';
import { I18nProvider } from '@/lib/i18n/context';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { isValidLocale, DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from '@/lib/i18n/config';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Rentars — Decentralized P2P Rentals on Stellar',
  description:
    'Rentars is a peer-to-peer rental platform built on the Stellar blockchain. Minimal fees, instant payments, complete transparency.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Rentars',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'Rentars',
    title: 'Rentars — Decentralized P2P Rentals on Stellar',
    description:
      'Peer-to-peer rental platform built on the Stellar blockchain. Minimal fees, instant payments.',
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
};

async function getInitialLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  return isValidLocale(value) ? (value as Locale) : DEFAULT_LOCALE;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialLocale = await getInitialLocale();

  return (
    <html lang={initialLocale}>
      <head>
        {/* PWA theme color (redundant with Viewport export but required for Safari) */}
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="icon" href="/icons/icon-192.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className={inter.className}>
        {/* Skip to main content for keyboard and screen-reader users */}
        <a href="#main-content" className="skip-nav">
          Skip to main content
        </a>
        <I18nProvider initialLocale={initialLocale}>
          <AuthProvider>
            <OfflineBanner />
            <Navbar />
            <main id="main-content" tabIndex={-1}>
              {children}
            </main>
          </AuthProvider>
        </I18nProvider>

        {/* Register service worker */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.warn('SW registration failed:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
