import { Prisma } from '../generated/prisma/client';

/**
 * Uma linha por criança (0 a 17) com tudo o que a ficha e os motivos de visita precisam (§3.8, §4.3).
 * Roda **dentro de `comoUsuario`**: a RLS de pessoa_mestra, matrícula, frequência, saúde, assistência
 * e casos recorta o que o perfil vê. Nunca seleciona CPF, NIS, CNS nem dado de saúde além dos
 * sinalizadores.
 *
 * Faltas seguidas: mesma regra do job de infrequência (`contarFaltasSeguidas`, shared): pelos dias
 * letivos da escola **antes de hoje**, do mais recente para trás, até o primeiro dia que não é FALTA
 * lançada.
 */
export interface LinhaFicha {
  id: number;
  nome: string;
  nascimento: Date | null;
  setor_codigo: string | null;
  setor_nome: string | null;
  quadra: string | null;
  lote: number | null;
  localidade: string | null;
  matricula_id: number | null;
  escola: string | null;
  rede: string | null;
  turma: string | null;
  matricula_inicio: Date | null;
  faltas_seguidas: number | null;
  presencas_mes: number | null;
  lancamentos_mes: number | null;
  ubs: string | null;
  ultima_visita_acs: Date | null;
  vacinacao_em_dia: boolean | null;
  necessita_aee: boolean | null;
  cad_atualizado: Date | null;
  recebe_pbf: boolean | null;
  paif_tipo: string | null;
  cras: string | null;
  paif_ultimo: Date | null;
  pcf_visitador: string | null;
  pcf_ultima: Date | null;
  sala_recursos: boolean | null;
  apae: boolean | null;
  bpc: boolean | null;
  notificacao_aberta: string | null;
  conselho_tutelar: Date | null;
}

export function consultaFichas(hoje: string, pessoaId?: number): Prisma.Sql {
  const filtroPessoa = pessoaId === undefined ? Prisma.empty : Prisma.sql`AND p.id = ${pessoaId}`;
  return Prisma.sql`
WITH criancas AS (
  SELECT p.id, p.nome, p.data_nascimento, p.setor_codigo, p.domicilio_id
  FROM pessoas.pessoa_mestra p
  WHERE p.data_nascimento <= ${hoje}::date
    AND p.data_nascimento > ${hoje}::date - interval '18 years'
    ${filtroPessoa}
),
mat AS (
  SELECT DISTINCT ON (m.pessoa_id) m.pessoa_id, m.id, m.escola_id, e.nome AS escola,
         e.rede::text AS rede, t.nome AS turma, m.inicio_em
  FROM educacao.matricula m
  JOIN criancas c ON c.id = m.pessoa_id
  JOIN educacao.escola e ON e.id = m.escola_id
  LEFT JOIN educacao.turma t ON t.id = m.turma_id
  WHERE m.situacao = 'ATIVA'
  ORDER BY m.pessoa_id, m.ano DESC, m.inicio_em DESC
),
dias AS (
  SELECT mat.id AS mid, f.situacao,
         row_number() OVER (PARTITION BY mat.id ORDER BY ce.dia DESC) AS rn
  FROM mat
  JOIN educacao.calendario_escolar ce
    ON ce.escola_id = mat.escola_id AND ce.dia < ${hoje}::date AND ce.dia >= ${hoje}::date - 120
  LEFT JOIN educacao.frequencia f ON f.matricula_id = mat.id AND f.dia = ce.dia
),
faltas AS (
  SELECT mid,
         coalesce(min(rn) FILTER (WHERE situacao IS DISTINCT FROM 'FALTA'), max(rn) + 1) - 1 AS seguidas
  FROM dias GROUP BY mid
),
mes AS (
  SELECT f.matricula_id AS mid,
         count(*) FILTER (WHERE f.situacao <> 'FALTA') AS presencas,
         count(*) AS lancamentos
  FROM educacao.frequencia f
  JOIN mat ON mat.id = f.matricula_id
  WHERE f.dia >= date_trunc('month', ${hoje}::date) AND f.dia <= ${hoje}::date
  GROUP BY f.matricula_id
),
fam AS (
  SELECT DISTINCT ON (mf.pessoa_id) mf.pessoa_id, mf.familia_id
  FROM pessoas.membro_familia mf JOIN criancas c ON c.id = mf.pessoa_id
  ORDER BY mf.pessoa_id, mf.familia_id
),
cad AS (
  SELECT DISTINCT ON (cf.familia_id) cf.familia_id, cf.recebe_pbf, cf.atualizado_em
  FROM assistencia.cadunico_familia cf JOIN fam ON fam.familia_id = cf.familia_id
  ORDER BY cf.familia_id, cf.mes_referencia DESC
),
paif AS (
  SELECT DISTINCT ON (a.familia_id) a.familia_id, a.tipo::text AS tipo, a.cras_codigo,
         a.ultimo_atendimento_em
  FROM assistencia.acompanhamento_paif a JOIN fam ON fam.familia_id = a.familia_id
  WHERE a.fim_em IS NULL
  ORDER BY a.familia_id, a.inicio_em DESC
),
pcf AS (
  SELECT DISTINCT ON (x.pessoa_id) x.pessoa_id, x.visitador, x.ultima_visita_em
  FROM assistencia.crianca_feliz x JOIN criancas c ON c.id = x.pessoa_id
  WHERE x.ativo
  ORDER BY x.pessoa_id, x.ultima_visita_em DESC NULLS LAST
),
ae AS (
  SELECT x.pessoa_id, bool_or(x.tipo = 'SALA_RECURSOS') AS sala, bool_or(x.tipo = 'APAE') AS apae
  FROM educacao.atendimento_especializado x JOIN criancas c ON c.id = x.pessoa_id
  GROUP BY x.pessoa_id
),
bpc AS (
  SELECT b.pessoa_id, bool_or(b.ativo) AS ativo
  FROM assistencia.bpc b JOIN criancas c ON c.id = b.pessoa_id
  GROUP BY b.pessoa_id
),
notif AS (
  SELECT DISTINCT ON (ca.pessoa_id) ca.pessoa_id, n.codigo
  FROM casos.notificacao n
  JOIN casos.caso ca ON ca.id = n.caso_id
  JOIN criancas c ON c.id = ca.pessoa_id
  WHERE n.status <> 'PARECER_EMITIDO'
  ORDER BY ca.pessoa_id, n.criada_em DESC
),
ct AS (
  SELECT ca.pessoa_id, max(ev.ocorrido_em) AS quando
  FROM casos.evento_caso ev
  JOIN casos.caso ca ON ca.id = ev.caso_id
  JOIN criancas c ON c.id = ca.pessoa_id
  WHERE ev.tipo = 'ENCAMINHADO_CONSELHO_TUTELAR'
  GROUP BY ca.pessoa_id
)
SELECT c.id, c.nome, c.data_nascimento AS nascimento,
       c.setor_codigo, st.nome AS setor_nome, q.codigo AS quadra, l.numero::int AS lote,
       d.localidade,
       mat.id AS matricula_id, mat.escola, mat.rede, mat.turma, mat.inicio_em AS matricula_inicio,
       faltas.seguidas::int AS faltas_seguidas,
       mes.presencas::int AS presencas_mes, mes.lancamentos::int AS lancamentos_mes,
       ubs.nome AS ubs, s.ultima_visita_acs, s.vacinacao_em_dia,
       s.necessita_atendimento_especializado AS necessita_aee,
       cad.atualizado_em AS cad_atualizado, cad.recebe_pbf,
       paif.tipo AS paif_tipo, coalesce(cras.nome, paif.cras_codigo) AS cras,
       paif.ultimo_atendimento_em AS paif_ultimo,
       pcf.visitador AS pcf_visitador, pcf.ultima_visita_em AS pcf_ultima,
       ae.sala AS sala_recursos, ae.apae, bpc.ativo AS bpc,
       notif.codigo AS notificacao_aberta, ct.quando AS conselho_tutelar
FROM criancas c
LEFT JOIN territorio.setor st ON st.codigo = c.setor_codigo
LEFT JOIN territorio.domicilio d ON d.id = c.domicilio_id
LEFT JOIN territorio.lote l ON l.id = d.lote_id
LEFT JOIN territorio.quadra q ON q.id = l.quadra_id
LEFT JOIN mat ON mat.pessoa_id = c.id
LEFT JOIN faltas ON faltas.mid = mat.id
LEFT JOIN mes ON mes.mid = mat.id
LEFT JOIN saude.sinalizador_saude s ON s.pessoa_id = c.id
LEFT JOIN territorio.equipamento ubs ON ubs.codigo_cnes = s.ubs_cnes
LEFT JOIN fam ON fam.pessoa_id = c.id
LEFT JOIN cad ON cad.familia_id = fam.familia_id
LEFT JOIN paif ON paif.familia_id = fam.familia_id
LEFT JOIN territorio.equipamento cras ON cras.codigo_cadsuas = paif.cras_codigo
LEFT JOIN pcf ON pcf.pessoa_id = c.id
LEFT JOIN ae ON ae.pessoa_id = c.id
LEFT JOIN bpc ON bpc.pessoa_id = c.id
LEFT JOIN notif ON notif.pessoa_id = c.id
LEFT JOIN ct ON ct.pessoa_id = c.id
ORDER BY c.id`;
}
