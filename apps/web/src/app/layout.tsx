import type { Metadata, Viewport } from 'next';
import { Raleway } from 'next/font/google';
import { Cabecalho } from '@/components/cabecalho';
import './globals.css';

const raleway = Raleway({ subsets: ['latin'], variable: '--font-raleway', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'SII · Itapuã do Oeste', template: '%s · SII' },
  description: 'Sistema Integrado Intersecretarial da Prefeitura de Itapuã do Oeste/RO',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#1351B4',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const homologacao = process.env.NEXT_PUBLIC_AMBIENTE !== 'producao';

  return (
    <html lang="pt-BR" className={raleway.variable}>
      <body className="min-h-dvh antialiased">
        <Cabecalho homologacao={homologacao} />
        <main id="conteudo" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 outline-none">
          {children}
        </main>
      </body>
    </html>
  );
}
