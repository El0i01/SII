# 0012 · Busca ativa escolar: job, etapas e painel

Data: 17/11/2026 · Situação: aceita · Prompt: P13

## Contexto

A §4.2 define a busca ativa: crianças e adolescentes de 4 a 17 anos, residentes, sem matrícula na rede municipal nem na estadual. O caso segue o fluxo identificado → encaminhado → visita → matriculado ou não localizado, com prazos contados do alerta. O seed já trazia os 74 casos do protótipo, e o job de prazos (P11) já escalonava a busca ativa.

Critérios de aceite:
- com o seed, os números do painel batem com o protótipo;
- a exportação não contém CPF nem nome completo.

## Decisões

1. **Job diário na fila `cargas`** (fonte `BUSCA_ATIVA`, 6h15, entre a infrequência e os prazos), como os jobs do P10 e do P11.
   - Abre por `criarCaso`, que ganhou `statusInicial`: a busca ativa começa em `IDENTIFICADO`.
   - Fecha sozinho o caso de quem ganhou matrícula ativa.
   - "Residente" é ter domicílio cadastrado.
2. **Quarentena de 180 dias depois do Conselho Tutelar.** Sem ela, o job reabriria no dia seguinte o caso recém-comunicado. O prazo está na §9 para confirmação.
3. **Quem movimenta** (decisão do usuário, 17/11/2026):
   - a SEMED encaminha, registra a matrícula e comunica o Conselho Tutelar;
   - a visita é da secretaria responsável pelo caso;
   - o Comitê e a CTI podem tudo.

   A regra fica em `quemPode` e `proximaEtapa` (shared); a API confere as duas e responde 403 ou 409.
4. **Matrícula manual cria a matrícula** (`educacao.matricula`, upsert por pessoa, escola e ano) antes de fechar o caso. Sem isso, o job reabriria o caso no dia seguinte; a carga da gestão escolar depois atualiza a mesma matrícula.
5. **Painel com as fórmulas do protótipo** (`resumoBuscaAtiva`, shared).
   - O teste compara o painel com o gerador do protótipo, deslocando os dias da data-base até hoje.
   - "Encaminhados em até 30 dias" é calculado; no protótipo era um número fixo.
   - O auditor recebe só os números, pelo cliente dono, com contagens de 1 a 4 suprimidas.
6. **Seed intocado** (decisão do usuário): o painel bate com o protótipo no seed recém-criado. Rodar o job depois abre os casos das crianças fora da escola das fichas, como em produção.

## Consequências

- Com o job rodando todos os dias, o painel deixa de bater com o protótipo; isso é o esperado em produção.
- Revelar CPF na busca ativa usa o mesmo endpoint da ficha (P12), com a finalidade e o registro no painel do DPO.
