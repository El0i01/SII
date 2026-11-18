'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { FormularioEntrar } from '@/components/formulario-entrar';
import { api, ErroApi } from '@/lib/api';
import { limparFrequenciaGuardada } from '@/lib/fila-frequencia';
import { telaInicial } from '@/lib/menu';
import type { Usuario } from '@/components/layout/sessao';

function Entrar() {
  const router = useRouter();
  const proximo = useSearchParams().get('proximo');
  // Só caminhos internos: evita redirecionar para outro site.
  const destino = proximo && proximo.startsWith('/') && !proximo.startsWith('//') ? proximo : null;

  async function onEntrar(login: string, senha: string) {
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ login, senha }) });
      // Frequência guardada offline por outro usuário neste navegador sai agora (ADR 0009).
      const eu = await api<Usuario>('/auth/eu').catch(() => null);
      try {
        limparFrequenciaGuardada(window.localStorage, eu?.id);
      } catch {
        // localStorage bloqueado: nada guardado
      }
      // Sem destino pedido: a primeira tela do perfil (DPO e Fazenda não têm a Visão geral).
      router.push(destino ?? (eu ? telaInicial(eu.perfil, eu.escopos) : '/'));
      return null;
    } catch (e) {
      if (e instanceof ErroApi) {
        return {
          ...(e.campos.login ? { login: e.campos.login[0] } : {}),
          ...(e.campos.senha ? { senha: e.campos.senha[0] } : {}),
          ...(Object.keys(e.campos).length ? {} : { geral: e.message }),
        };
      }
      return { geral: 'Não foi possível entrar agora. Tente de novo.' };
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold text-texto-forte">Entrar no SII</h1>
      <FormularioEntrar onEntrar={onEntrar} />
      <p className="text-sm text-texto-suave">Esqueceu a senha? Peça uma senha provisória à CTI.</p>
    </div>
  );
}

export default function PaginaEntrar() {
  return (
    <Suspense>
      <Entrar />
    </Suspense>
  );
}
