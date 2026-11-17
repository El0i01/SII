# 0010 · Notificações, parecer da Assistência, prazos e avisos internos

Data: 17/11/2026 · Situação: aceita · Prompt: P11

## Contexto

O P10 cria o caso de infrequência e a notificação ao CRAS. Faltava fechar o ciclo da §4.1:
- o CRAS ver a caixa de entrada e registrar o parecer;
- a escola e a SEMED saberem do parecer;
- o escalonamento por prazo e a pauta do Comitê.

Critérios de aceite:
- fluxo e2e no Playwright: falta → notificação → parecer → evento na trilha → aviso à escola;
- o perfil ESCOLA não emite parecer.

## Decisões

1. **Quem emite parecer** (decisão do usuário, 17/11/2026): o técnico do CRAS e o Comitê Gestor, como no protótipo.
   - O técnico do CRAS só responde as notificações enviadas ao próprio CRAS (`destino_cras_codigo` nos escopos), além da RLS.
   - Escola, SEMED, Assistência e CTI só leem.
2. **Efeito do parecer** (`efeitoDoParecer`, shared): o caso fecha, exceto com `ENCAMINHADO_CONSELHO_TUTELAR` (evento extra na trilha) ou nova visita programada. Parecer, status, trilha e avisos gravam numa transação só (`comoUsuario`). Segundo parecer → 409.
3. **Avisos internos** (`casos.aviso`) no lugar de e-mail:
   - só código do caso e texto fixo (`textoAviso`), **sem dado pessoal**;
   - por isso a tabela fica sem RLS: a API filtra pelo destino do usuário (`destinosDoUsuario`: escola pelo INEP, CRAS pelo CadSUAS, secretarias, Comitê; CTI vê todos);
   - o auditor não lê.

   E-mail fica para quando houver SMTP; o texto já serve, por não ter dado pessoal.
4. **Prazos** (`apps/worker/src/casos/prazos.ts`, fonte `PRAZOS` na fila `cargas`, `PRAZOS_CRON` 6h30):
   - `prazoHoje` (shared) calcula a infrequência em dias úteis, com os feriados do calendário da rede municipal, e a busca ativa em dias corridos;
   - o nível só gera aviso quando sobe: 1 → CRAS ou secretaria responsável; 2 → secretaria responsável; 3 → Comitê;
   - rodar de novo no dia não repete aviso.
5. **Pauta do Comitê = lista viva** (decisão do usuário): `GET /casos/pauta` traz os casos abertos em nível 3, do mais atrasado ao menos, sem nome nem CPF. Pauta fechada por reunião fica para depois.
6. **Criação de caso numa rotina só** (`apps/api/src/casos/criar-caso.ts`), usada pelo job de infrequência e pelo encaminhamento manual:
   - trava `pg_advisory_xact_lock` mais a conferência de caso aberto do mesmo tipo para a pessoa;
   - prefixo do código por tipo: IF, BA, PN, IN, ID;
   - a notificação ao CRAS leva o mesmo número (`NT-`).

   Encaminhamento à Assistência cria notificação ao CRAS; aos outros destinos, aviso à secretaria. O motivo fica em `caso.motivo` (texto validado sem CID).
7. **E2E com Playwright usando o Chrome instalado** (`channel: 'chrome'`, sem baixar navegador):
   - API e web sobem em portas próprias (3334/3001), apontados para o banco de **teste**;
   - o preparo (`apps/api/test/e2e-preparar.ts`) semeia o banco e escolhe um aluno fictício;
   - comando: `pnpm --filter @sii/web e2e`.

## Consequências

- A tela de notificações mantém aberta a notificação respondida mesmo quando ela sai do filtro atual.
- Uma notificação com destino a um CRAS que não seja o do técnico responde 404, como se não existisse. Assim não se revela que ela existe.
- A "ficha da criança" (P12) vai reutilizar a trilha exposta em `GET /notificacoes/:codigo`.
