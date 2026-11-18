# 0015 · Indicadores, controle externo e auditoria

Data: 18/11/2026 · Situação: aceita · Prompt: P16

## Contexto

O P16 pede quatro entregas:
- os indicadores dos objetivos OE1 a OE6 por território, com supressão < 5;
- gasto × resultado a partir do Portal da Transparência;
- o painel "Controle externo" do protótipo e o relatório semestral ao TCE-RO em PDF e XLSX;
- o painel do DPO com filtros por pessoa, usuário e período.

Critérios de aceite:
- o AUDITOR_TCE navega só por agregados;
- o relatório tem linha de base, valor atual e meta;
- a trilha de um caso pode ser verificada pelo código verificador.

## Decisões

1. **Snapshots mensais e por vigência.**
   - O job `INDICADORES` (fila `cargas`, dia 1 às 3h, referência = ontem; `indicadores:rodar [data]`) grava `indicador_snapshot` por indicador, território (`MUN` e cada setor) e período `AAAA-MM`.
   - OE3 (Bolsa Família) também é gravado por vigência (`AAAA-V1` jan–jun, `AAAA-V2` jul–dez).
   - A gravação é por upsert, então rodar de novo não duplica.
   - As regras são puras, no `packages/shared/src/indicadores/`:
     - `calcularSnapshot`;
     - `encaminhadoNoPrazo`;
     - `cumpreFrequenciaPbf`;
     - `situacaoIndicador`;
     - `montarLinhaIndicador`.
2. **Supressão no snapshot.**
   - Numerador ou denominador de 1 a 4 esconde os três números: uma razão sobre poucas pessoas também identifica.
   - OE5 (relatórios) e OE6 (acessos registrados) contam relatórios e acessos de servidores, não cidadãos. Não são suprimidos e ficam só no município.
3. **Metas e linhas de base versionadas** (decisão do usuário).
   - Ficam em `indicadores.meta_indicador`. O seed traz os valores do protótipo.
   - `PUT /indicadores/metas/:indicador` (CTI, Comitê) cria uma versão nova e vale a de maior versão.
   - Sem linha de base cadastrada, vale o primeiro snapshot.
   - **Situação:**
     - atingiu a meta → em dia;
     - senão, compara com a trajetória linear da base à meta: na trajetória → em evolução; abaixo → abaixo do esperado.
4. **Despesa com duas entradas** (decisão do usuário), gravando em `indicadores.despesa_programa`, sem dado pessoal:
   - **conector HTTP** pelo contrato `apps/worker/config/transparencia/contrato.json` (URL, parâmetros e campos a confirmar).
     - Fica desligado sem `TRANSPARENCIA_URL`.
     - Se a estrutura mudar, ele falha de forma visível (alerta da CTI) e não grava nada.
     - É testado contra um servidor HTTP fictício;
   - **CSV `DESPESA`** enviado pela Fazenda em `/cargas`. O perfil FAZENDA passa a enviar só essa fonte.
5. **Programa → indicador do resultado** em `PROGRAMAS` (shared):
   - Atenção primária → vacinação 0–6;
   - Creche → creche 0–3;
   - Transporte escolar → encaminhamento em 30 dias;
   - CRAS/PAIF → acompanhamento de saúde do PBF.

   Provisório até o Comitê definir.
6. **O auditor lê pelo papel `sii_auditor`.**
   - `GET /indicadores/controle-externo` roda por `comoUsuario`.
   - O papel só alcança o schema `indicadores` e duas funções SECURITY DEFINER:
     - `casos.verificar_trilha_codigo(codigo)`: integridade, verificador e tipo e data de cada evento;
     - `casos.trilhas_encerradas(de, ate)`: código, tipo, data, número de eventos e verificador.
   - Nenhuma das duas devolve `dados`, autor ou pessoa.
   - O teste prova que o papel recebe `permission denied` em `casos.caso`, `evento_caso`, `pessoa_mestra` e `acesso_dado_pessoal`.
7. **Relatório semestral com `pdfkit` 0.20.2 e `exceljs` 4.4.0** (decisão do usuário: gerado no servidor, sem navegador).
   - O PDF e o XLSX saem do mesmo `ControleExterno` da tela:
     - indicadores com linha de base, atual e meta;
     - gasto × resultado;
     - contagem de acessos;
     - anexo de casos encerrados com o código verificador.
   - Cada geração grava `indicadores.relatorio_semestral` com o sha256 do PDF, mas não o arquivo (o disco está apertado e o hash basta para conferir).
   - A CTI marca a entrega (`POST /indicadores/relatorios/:id/entregar`), que conta no OE5. São devidos os semestres encerrados desde `2026-S1`.
8. **DPO** (decisão do usuário):
   - filtro por código da ficha (`CI-123`), login e período na URL;
   - por CPF, só no corpo de `POST /auditoria/acessos/por-cpf`: busca pelo hash e a consulta também vira um registro de acesso;
   - CSV em `GET /auditoria/acessos.csv`, sem o número revelado.
9. **Testes do PDF sem dependência nova.** O teste descomprime os streams (`zlib`) e junta as strings dos operadores `TJ`. O E2E lê o XLSX com o `exceljs` que já está na API.

## Consequências

- **Proxies do Bolsa Família** (a confirmar com a Assistência):
  - educação = 6 a 17 anos de família PBF com frequência ≥ 85% no período;
  - saúde = 0 a 6 anos de família PBF com vacinação em dia.
- **Seed:** o PBF educação sai baixo (cerca de 20%), porque as frequências fictícias de novembro têm 37% de faltas, de propósito, para disparar a infrequência.
- **Testes:** o teste de integração do worker apaga o `LogCarga` de falha que cria, para não deixar alerta no banco de teste compartilhado.
- **Build do shared:** o tsconfig não tem `URL` (o shared também roda no mobile), por isso a URL do conector é montada à mão.
