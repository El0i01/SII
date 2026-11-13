# 0008 · Conector do e-SUS APS PEC

Data: 13/11/2026 · Situação: aceita · Prompt: P09

## Contexto

A Saúde fornece ao SII só sinalizadores (§3.5): nada de CID, CIAP ou diagnóstico. A fonte é o banco PostgreSQL do e-SUS APS PEC, lido direto, sem arquivo. Os nomes de tabela e coluna mudam com a versão do PEC e ainda estão a confirmar com a instalação de Itapuã.

Critérios de aceite:
- teste de integração contra um PostgreSQL de teste com o schema mínimo do PEC;
- o dry-run lista as contagens por tabela.

## Decisões

1. **Somente leitura em três camadas:**
   - o usuário do PEC deve ter só SELECT (pedido à Saúde);
   - a sessão abre com `default_transaction_read_only=on` e `statement_timeout` de 10 min;
   - toda leitura roda em `BEGIN … REPEATABLE READ READ ONLY`, numa foto só do banco.

   O teste prova que um INSERT falha mesmo com um usuário que poderia escrever.
2. **Contrato de estrutura** (`apps/worker/config/esus/contrato.json`, validado por `ContratoPec` no shared):
   - mapeia o nome lógico (fixo no código) para o nome físico (editável);
   - os nomes só aceitam identificador simples e entram entre aspas na consulta.

   Antes de ler, o conector confere o contrato no `information_schema`. Se faltar tabela ou coluna, a carga lança `FalhaDefinitiva`, fica `FALHOU` na hora (sem nova tentativa), com a mensagem citando o que falta, e **não lê nem grava nada**.
3. **Nunca entra diagnóstico:**
   - a consulta não seleciona CID nem CIAP;
   - as colunas de condição crônica viram um único booleano dentro do próprio PEC;
   - o teste coloca CID em colunas-isca e confere que o valor não chega a nenhuma tabela, log ou job do SII.
4. **Carga em uma transação.** A leitura acontece toda antes da gravação. A gravação (staging `stg_esus.cidadao`, `LigacaoPessoas.ligar`, `SinalizadorSaude`) roda numa única transação do SII. Erro no meio desfaz tudo.
5. **Incremental + completa semanal:**
   - a `marca` da carga é o `now()` do PEC no início da foto;
   - a incremental lê quem teve `dt_atualizado` depois da marca (com 1 dia de folga) ou um fato novo desde o dia da marca;
   - a cada 7 dias a carga é completa, porque as janelas de 180 dias (crônica acompanhada) e de 12 meses (vacina da gripe) vencem sem fato novo no PEC;
   - a carga é idempotente pelo id do cidadão (`C<co_seq_cidadao>`).
6. **Agendamento:**
   - um job scheduler do BullMQ (`esus-noturno`, `ESUS_CRON`, padrão 2h em `America/Porto_Velho`, 3 tentativas);
   - o job nasce sem carga: o worker cria o `LogCarga` e grava o id no próprio job, para a nova tentativa usar a mesma carga;
   - sem `ESUS_PEC_HOST` no `.env`, o agendamento é removido.
7. **Microárea:**
   - a tabela de conversão `config/esus/microareas.json` (`"CNES/número": "área do Geoportal"`) é mantida pela CTI;
   - com conversão, o e-SUS atualiza o escopo da pessoa (RLS do ACS);
   - sem conversão, o número vai só para o sinalizador e a carga registra um aviso.
8. **Alerta:**
   - `GET /cargas/alertas` (só `ADMIN_CTI`) devolve, por fonte, a falha mais recente ainda não seguida de uma carga OK;
   - a tela /cargas mostra a faixa vermelha, que some sozinha quando a fonte volta a dar certo;
   - sem e-mail por enquanto (decisão de 13/11/2026).
9. **Dry-run** (`pnpm --filter @sii/worker esus:dry-run`): confere a estrutura e mostra `count(*)` por tabela e quantos cidadãos a próxima carga leria. Não grava nada, nem `LogCarga`.

## Regras dos sinalizadores (`packages/shared/src/saude/sinalizadores.ts`)

- **Do último cadastro individual:** UBS (CNES), microárea, ACS, acamado ou domiciliado e condição crônica (só sim/não).
- **Última visita do ACS:** a visita domiciliar mais recente.
- **Crônica acompanhada:** atendimento nos últimos 180 dias (só a data).
- **Vacina da gripe em dia:** 60 anos ou mais e dose nos últimos 12 meses (`imunobiologicosGripe` no contrato).
- **`vacinacaoEmDia`, `preNatalAdequado` e `necessitaAtendimentoEspecializado` ficam sem valor** até a Saúde definir a regra (decisão de 13/11/2026). Calcular exigiria o calendário vacinal e a contagem de pré-natal, que costuma depender de CIAP/CID.

## Limites conhecidos

- **Nomes do PEC a confirmar:** tabelas, colunas, valores de `st_*` (1 = sim) e o código da influenza. Antes de ligar em produção, rode o dry-run contra o PEC de Itapuã.
- O ponto do domicílio (`tb_fat_cad_domiciliar`, latitude e longitude) é só verificado e contado. Virar `ESUS_TERRITORIO` na geocodificação fica para depois.
- A carga completa lê o município inteiro para a memória. Isso cabe para o porte de Itapuã (cerca de 10 mil cidadãos).
- Cidadão inativado no PEC não apaga o sinalizador já gravado.
