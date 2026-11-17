# 0009 · Frequência, cargas escolares e job de infrequência

Data: 17/11/2026 · Situação: aceita · Prompt: P10

## Contexto

A regra central do SII (§4.1) é: 5 dias letivos seguidos de falta → caso de infrequência e notificação ao CRAS do território do domicílio. A regra pura já existia no shared (`contarFaltasSeguidas`, P04) e o calendário configurável também (11/11). Faltavam:
- a escola lançar e corrigir a frequência;
- as cargas da gestão escolar e da SEDUC-RO;
- o job diário que aplica a regra.

Critérios de aceite:
- com o seed, o job cria exatamente as notificações esperadas;
- rodar o job duas vezes não duplica;
- feriado do calendário não conta como falta.

## Decisões

1. **Reabertura imediata** (decisão do usuário, 17/11/2026):
   - caso de infrequência encerrado não conta como aberto;
   - se o aluno ainda tem 5 ou mais faltas seguidas, a próxima execução abre outro caso.

   Caso aberto (inclusive o que ficou aberto por `ENCAMINHADO_CONSELHO_TUTELAR` ou nova visita) só tem o motivo da notificação atualizado (`decidirInfrequencia`, shared).
2. **Idempotência sem índice parcial:**
   - a criação roda numa transação com `pg_advisory_xact_lock` e confere de novo se há caso aberto;
   - o job também passa pela fila `cargas` (concorrência 1).

   O índice único parcial (`WHERE encerrado_em IS NULL`) previsto no plano ficou de fora: o Prisma não representa índice parcial e tentaria apagá-lo na próxima migration.
3. **Referência = último dia letivo antes de hoje.** O dia corrente fica de fora porque a escola pode não ter lançado ainda (dia sem lançamento quebra a sequência). O job olha no máximo 40 dias letivos para trás; acima disso, o motivo para em 40.
4. **CRAS de destino:**
   - o CRAS de referência da pessoa (`pessoa_mestra.cras_codigo`);
   - senão, a área `TERRITORIO_CRAS` que contém o ponto do domicílio;
   - senão, a única área `TERRITORIO_CRAS` cadastrada (Itapuã tem um CRAS).

   Sem destino, o caso não é criado e entra na contagem `semCras`.
5. **Códigos:**
   - `IF-AAAA-NNNN` e `NT-AAAA-NNNN` com o mesmo número, como no seed;
   - o número é o maior já usado no ano + 1, calculado dentro da trava.

   Prazo do parecer: 5 dias úteis, com os feriados do calendário da escola.
6. **O job é uma "consulta" do padrão de carga** (`ProcessadorConsulta`, fonte `INFREQUENCIA`):
   - ganha `LogCarga`, novas tentativas e o alerta da CTI de graça;
   - agendamento `infrequencia-diaria` (`INFREQUENCIA_CRON`, padrão `0 6 * * 1-6`, Porto Velho);
   - para rodar na hora: `pnpm --filter @sii/worker infrequencia:rodar [AAAA-MM-DD]`.
7. **Cargas escolares com layout próprio, a confirmar** (`config/dicionarios/gestao-escolar.json` e `seduc.json`):
   - gestão escolar: aluno × dia;
   - SEDUC: uma linha por matrícula.

   Mesmo caminho do CadÚnico (ADR 0007): staging sem CPF, `LigacaoPessoas.ligar` com o código do aluno como id do vínculo, matrícula única por (pessoa, escola, ano). `pessoa.escola_inep` é atualizado na matrícula ativa, porque é o que a RLS do perfil ESCOLA usa. Frequência em dia não letivo é ignorada com aviso.
8. **Quem envia:** a SEMED envia gestão escolar e SEDUC; a Assistência, o CadÚnico; a CTI, todas.
9. **Grade de frequência no web:**
   - leitura e escrita por `PrismaService.comoUsuario` (RLS);
   - o `PUT` responde por item: recusa dia não letivo, dia futuro e aluno fora da turma, e grava o resto;
   - o último a salvar vence;
   - `frequencia.lancado_por` e `atualizado_em` registram quem corrigiu.
10. **Offline no navegador: fila + grade em cache** (decisão do usuário, 17/11/2026). Como a grade tem nome de aluno:
    - chave por usuário, escola e turma;
    - expira em 24 h;
    - ao entrar, o navegador apaga o que for de outro usuário;
    - o do próprio usuário fica, porque a sessão pode ter vencido com alterações por enviar.

    Nenhum CPF, NIS ou dado de saúde vai para o navegador.

## Consequências

- O "aviso à escola" fica como evento na trilha. A notificação interna à escola e à SEMED chega no P11.
- Quando a SEMED escolher o sistema de gestão escolar (ou a SEDUC mandar o arquivo real), muda só o dicionário.
- Computador compartilhado de secretaria guarda nomes de alunos por até 24 h no navegador. Aceito pelo ganho de lançar sem internet.
