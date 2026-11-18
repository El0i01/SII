import type { Metadata, Viewport } from 'next';
import { Raleway } from 'next/font/google';
import { Estrutura } from '@/components/layout/estrutura';
import { ProvedorSessao } from '@/components/layout/sessao';
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
        <ProvedorSessao>
          <Estrutura homologacao={homologacao}>{children}</Estrutura>
        </ProvedorSessao>
      </body>
    </html>
  );
}
