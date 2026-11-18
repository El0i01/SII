'use client';

import { ROTULO_PERFIL } from '@sii/shared';
import * as Dialog from '@radix-ui/react-dialog';
import { LogOut, Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { Cabecalho } from '@/components/cabecalho';
import { Botao } from '@/components/ui/button';
import { FiltrosCabecalho } from './filtros-cabecalho';
import { MenuLateral } from './menu-lateral';
import { ROTAS_PUBLICAS, useSessao } from './sessao';

/**
 * Casca do web (P14): cabeçalho do órgão, menu lateral agrupado (gaveta no celular) e o conteúdo.
 * Em /entrar, só o cabeçalho.
 */
export function Estrutura({
  homologacao,
  children,
}: {
  homologacao: boolean;
  children: ReactNode;
}) {
  const caminho = usePathname();
  const { usuario, sair } = useSessao();
  const [aberto, setAberto] = useState(false);
  const publica = ROTAS_PUBLICAS.includes(caminho);
  const comMenu = !publica && usuario;

  return (
    <>
      <Cabecalho
        homologacao={homologacao}
        menu={
          comMenu && (
            <Dialog.Root open={aberto} onOpenChange={setAberto}>
              <Dialog.Trigger asChild>
                <Botao variante="contorno" className="lg:hidden" aria-label="Abrir o menu">
                  <Menu aria-hidden="true" className="h-5 w-5" /> Menu
                </Botao>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-texto-forte/40" />
                <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,90vw)] flex-col gap-4 overflow-y-auto bg-fundo p-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <Dialog.Title className="text-lg font-semibold text-texto-forte">
                      Menu
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <Botao variante="contorno" aria-label="Fechar o menu">
                        <X aria-hidden="true" className="h-5 w-5" />
                      </Botao>
                    </Dialog.Close>
                  </div>
                  <Dialog.Description className="sr-only">
                    Painéis disponíveis para o seu perfil
                  </Dialog.Description>
                  <MenuLateral aoNavegar={() => setAberto(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          )
        }
      >
        {comMenu && (
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
            <FiltrosCabecalho />
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="text-sm">
                <span className="block font-semibold text-texto-forte">{usuario.nome}</span>
                <span className="text-texto-suave">{ROTULO_PERFIL[usuario.perfil]}</span>
              </p>
              <Botao variante="contorno" onClick={() => void sair()}>
                <LogOut aria-hidden="true" className="h-4 w-4" /> Sair
              </Botao>
            </div>
          </div>
        )}
      </Cabecalho>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {comMenu && (
          <aside className="hidden w-60 shrink-0 lg:block">
            <div className="sticky top-4">
              <MenuLateral />
            </div>
          </aside>
        )}
        <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </main>
      </div>
    </>
  );
}
