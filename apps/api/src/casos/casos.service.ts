import { HttpStatus, Injectable } from '@nestjs/common';
import {
  diasCorridosEntre,
  type Encaminhamento,
  enderecoDaSecretaria,
  hojeEmPortoVelho,
  prazoHoje,
} from '@sii/shared';
import { PrismaService } from '../banco/prisma.service';
import { ErroApi } from '../comum/erros';
import type { UsuarioAutenticado } from '../comum/usuario-autenticado';
import { registrarAvisos } from './avisos.service';
import { criarCaso, destinosCras, feriadosDoAno } from './criar-caso';

/**
 * Encaminhamento manual de caso a partir da ficha e pauta do Comitê (P11). Dado nominal só por
 * `comoUsuario`: a escola só encaminha os próprios alunos (a RLS barra o resto).
 */
@Injectable()
export class CasosService {
  constructor(private readonly prisma: PrismaService) {}

  async encaminhar(u: UsuarioAutenticado, e: Encaminhamento, hoje = hojeEmPortoVelho()) {
    const feriados =
      (await feriadosDoAno(this.prisma, Number(hoje.slice(0, 4)))).get('MUNICIPAL') ?? [];
    const r = await this.prisma.comoUsuario(u, async (tx) => {
      const pessoa = await tx.pessoaMestra.findUnique({
        where: { id: e.pessoaId },
        select: { id: true },
      });
      if (!pessoa)
        throw new ErroApi(HttpStatus.NOT_FOUND, 'PESSOA_NAO_ENCONTRADA', 'Pessoa não encontrada.');
      const destino = (await destinosCras(tx, [pessoa.id])).get(pessoa.id) ?? {
        cras: null,
        setor: null,
        localidade: null,
      };
      const paraAssistencia = e.destino === 'ASSISTENCIA';
      if (paraAssistencia && !destino.cras)
        throw new ErroApi(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SEM_CRAS',
          'Não foi possível saber o CRAS do território desta pessoa. Avise a CTI para conferir o endereço.',
        );
      const novo = await criarCaso(tx, {
        tipo: e.tipoCaso,
        pessoaId: pessoa.id,
        origem: 'Encaminhamento manual',
        secretaria: e.destino,
        destino,
        hoje,
        feriados,
        abertura: { tipo: 'ENCAMINHADO', dados: { destino: e.destino, perfil: u.perfil } },
        ...(paraAssistencia
          ? { notificacao: { motivo: e.motivo, origem: u.perfil.slice(0, 20) } }
          : {}),
        autorId: u.id,
      });
      if (!novo.criado) return novo;
      await tx.caso.update({ where: { id: novo.casoId }, data: { motivo: e.motivo } });
      await registrarAvisos(tx, novo.casoId, novo.codigo, 'ENCAMINHAMENTO', [
        enderecoDaSecretaria(e.destino, destino.cras),
      ]);
      return novo;
    });
    if (!r.criado)
      throw new ErroApi(
        HttpStatus.CONFLICT,
        'CASO_JA_ABERTO',
        `Esta pessoa já tem um caso aberto deste tipo (${r.codigoExistente}). Acompanhe por ele.`,
      );
    return { codigo: r.codigo, notificacao: r.notificacao };
  }

  /**
   * Pauta do Comitê (lista viva, decisão de 17/11/2026): casos abertos em nível 3, mantidos pelo job
   * de prazos, do mais atrasado ao menos. Sem nome nem CPF: código, território e etapa.
   */
  async pauta(u: UsuarioAutenticado, hoje = hojeEmPortoVelho()) {
    const casos = await this.prisma.comoUsuario(u, (tx) =>
      tx.caso.findMany({
        where: { nivel: 3, encerradoEm: null },
        select: {
          codigo: true,
          tipo: true,
          status: true,
          setorCodigo: true,
          localidade: true,
          secretariaResponsavel: true,
          alertaEm: true,
        },
      }),
    );
    const feriados =
      (await feriadosDoAno(this.prisma, Number(hoje.slice(0, 4)))).get('MUNICIPAL') ?? [];
    return casos
      .map((c) => {
        const alerta = hojeEmPortoVelho(c.alertaEm);
        let p: ReturnType<typeof prazoHoje> = null;
        try {
          p = prazoHoje(
            { tipo: c.tipo as 'INFREQUENCIA', status: c.status, alertaEm: alerta },
            hoje,
            feriados,
          );
        } catch {
          // Etapa que não é do tipo (dado antigo): fica sem dias de atraso, mas continua na pauta.
        }
        return {
          codigo: c.codigo,
          tipo: c.tipo,
          etapa: c.status,
          setor: c.setorCodigo,
          localidade: c.localidade,
          responsavel: c.secretariaResponsavel,
          diasDesdeAlerta: diasCorridosEntre(alerta, hoje),
          diasDeAtraso: p?.restante !== null && p?.restante !== undefined ? -p.restante : null,
        };
      })
      .sort((a, b) => (b.diasDeAtraso ?? 0) - (a.diasDeAtraso ?? 0));
  }
}
