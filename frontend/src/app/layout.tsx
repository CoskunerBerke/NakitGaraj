import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ThemeProvider } from '../context/ThemeContext';
import { LanguageProvider } from '../context/LanguageContext';

export const metadata: Metadata = {
  title: 'NakitGaraj - Premium Araç Değerleme ve Konsinye Platformu',
  description:
    'Yapay zeka destekli fiyatlandırma algoritması ile aracınızın gerçek piyasa değerini saniyeler içinde öğrenin. Konsinye araç satışı ve değerleme hizmetleri.',
  robots: 'index, follow',
  openGraph: {
    title: 'NakitGaraj - Premium Araç Değerleme ve Konsinye',
    description:
      'Aracınızın piyasa değerini anında hesaplayın, en iyi fiyata konsinye satışa bırakın.',
    type: 'website',
    locale: 'tr_TR',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
          <ThemeProvider>
            <Providers>
              <Navbar />
              <main className="flex-grow flex flex-col">
                {children}
              </main>
              <Footer />
            </Providers>
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
