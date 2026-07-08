import type { Metadata, Viewport } from 'next';
import { DM_Sans, JetBrains_Mono, Source_Serif_4 } from 'next/font/google';
import { AuthKitProvider } from '@workos-inc/authkit-nextjs/components';
import './globals.css';

const sans = DM_Sans({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = Source_Serif_4({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-serif',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

const description = 'Your research desk — find, organize, draft, and check.';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Slate',
  title: {
    default: 'Slate',
    template: '%s · Slate',
  },
  description,
  openGraph: {
    type: 'website',
    siteName: 'Slate',
    title: 'Slate',
    description,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Slate',
    description,
  },
};

// themeColor/colorScheme belong in the viewport export in the App Router.
// Literal hex mirrors --paper (light/dark) in globals.css; a <meta> color
// cannot reference a CSS variable.
export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcfcfd' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0f11' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
      <body>
        <AuthKitProvider>{children}</AuthKitProvider>
      </body>
    </html>
  );
}
