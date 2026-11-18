# Prompts para o Claude Code — SII

Como usar:

1. Crie a pasta `sii-itapua/`, copie `CLAUDE.md` para a raiz e `ESPECIFICACAO.md` + `prototipo/index.html` para `docs/`.
2. Abra o Claude Code na raiz e rode **um prompt por vez**, na ordem. Cada prompt pede plano antes do código.
3. Só passe para o próximo quando os critérios de aceite do atual estiverem cumpridos e os testes passando.
4. Faça um commit ao fim de cada prompt e registre a entrega em `docs/ANDAMENTO.md`.

Situação em 18/11/2026: P01 a P16 concluídos. Próximo: P17.

Não há reaproveitamento do GTE-SEMED: a autenticação é escrita no próprio SII (P03). Os shapefiles vêm de `~/geoportal_itapua-main(1)/geoportal_itapua-main/` (P02 e P06).

---

## Fase 1 · Fundação

### P01 · Monorepo

```
Leia CLAUDE.md e docs/ESPECIFICACAO.md inteiros. Em modo de plano, proponha e depois crie o monorepo sii-itapua com Turborepo + pnpm:
apps/api (NestJS 10), apps/worker (NestJS standalone), apps/web (Next.js 15 App Router), apps/mobile (Expo com expo-router, TypeScript),
packages/shared (zod + regras puras, Vitest), packages/config (eslint, tsconfig base estrito, prettier, preset Tailwind com os tokens gov.br do CLAUDE.md).
Configure os pipelines turbo (dev, build, lint, typecheck, test) e scripts na raiz conforme a seção "Comandos" do CLAUDE.md.
Critérios de aceite: pnpm i, pnpm lint, pnpm typecheck e pnpm test passam; pnpm dev sobe api (porta 3333), web (3000) e worker; o app mobile abre no Expo Go com uma tela "SII · Campo".
```

### P02 · Infraestrutura local

```
Crie infra/docker-compose.yml com postgres 16 + PostGIS (extensões postgis, pg_trgm, pgcrypto, unaccent), redis e minio. Volumes nomeados, healthchecks, .env.example completo.
Adicione infra/scripts/import-shapefile.sh usando ogr2ogr para importar shapefiles, recusando a importação se faltar .shx, .dbf ou .prj. A origem vem misturada (WGS 84, Web Mercator 3857 e SIRGAS 2000): ler o SRS do .prj de cada arquivo e reprojetar sempre para EPSG:4674 (-t_srs), com -nlt PROMOTE_TO_MULTI, -lco GEOMETRY_NAME=geom, encoding do .dbf e makevalid. Tudo cai primeiro em stg_geoportal.<camada>.
Ligue o Prisma na apps/api com schema único em apps/api/prisma, usando Unsupported("geometry") para colunas PostGIS e migrations SQL para os índices GiST.
Critérios de aceite: docker compose up -d deixa tudo healthy; pnpm db:migrate cria o banco; um endpoint /api/v1/health responde com status do banco e do redis.
```

### P03 · Autenticação, perfis e permissões

```
Implemente o módulo auth na API do zero, com @nestjs/jwt + passport-jwt + @nestjs/throttler (sem Keycloak e sem código do GTE-SEMED), conforme o CLAUDE.md: JWT de acesso de 15 min; refresh token opaco rotativo, guardado só como hash, agrupado em família, com detecção de reuso (reuso revoga a família inteira); bcrypt 12; rate limiting no login; bloqueio após 5 falhas por 15 min; hash fictício quando o login não existe; senha provisória gerada pelo ADMIN_CTI (xxxx-xxxx-xxxx, 24 h, troca obrigatória no primeiro acesso); cookies httpOnly + SameSite=Strict no web e refresh no secure store do mobile. Use como referência de ideias (não copiar Express) ~/central-educacional/apps/api/src/plataforma/acesso/senha.ts.
Crie os perfis da seção 2 da especificação e um sistema de autorização RBAC + ABAC: decorators @Perfis() e @Escopo() que filtram por secretaria, território, escola, microárea e CRAS.
Prepare as policies de Row-Level Security no PostgreSQL (session variables definidas por request) para as tabelas de pessoas e casos.
Crie usuários de seed para cada perfil.
Critérios de aceite: testes e2e cobrindo login, refresh, reuso de refresh token, bloqueio por rate limit, acesso negado por perfil e por escopo; AUDITOR_TCE nunca consegue ler tabela nominal, nem mesmo por SQL com o papel dele.
```

### P04 · Regras de negócio no pacote compartilhado

```
Em packages/shared, com testes primeiro (Vitest), implemente como funções puras as regras da seção 4 da especificação:
- contarFaltasSeguidas(frequencias, calendario) e deveNotificarInfrequencia (5 dias letivos consecutivos);
- prazoCaso(tipo, status, diasDesdeAlerta) → { restante, nivel 0..3, rotulo } para busca ativa e infrequência (dias úteis no parecer);
- motivosVisitaCrianca e motivosVisitaIdoso;
- calcularIvm(dimensoes, pesos) e faixaIvm;
- coberturaCreche e prioridadeNovaUnidade;
- mascararCpf, mascararNis, iniciais;
- cascataGeocodificacao(candidatos) → ponto escolhido com fonte e precisão.
Exporte os schemas zod de entrada (Parecer, Visita, Encaminhamento, UploadCarga) e os enums (perfis, tipos de caso, desfechos, situação do lote).
Critérios de aceite: cobertura de 100% das linhas dessas funções; casos de borda testados (feriado no meio das 5 faltas, falta justificada quebra a sequência, prazo vencendo hoje).
```

### P05 · Modelo de dados e seed fictício

```
Modele no Prisma as entidades das seções 3.1 a 3.12: Setor, Quadra, Lote, Domicilio, Equipamento, AreaReferencia, PessoaMestra, Familia, MembroFamilia, VinculoFonte, RevisaoVinculo, Escola, Turma, Matricula, Frequencia, CalendarioEscolar, FilaCreche, SinalizadorSaude, CadunicoFamilia, AcompanhamentoPaif, Bpc, Scfv, CriancaFeliz, Caso, EventoCaso, Notificacao, Parecer, Visita, IndicadorSnapshot, PesosIvm, AcessoDadoPessoal, LogCarga.
CPF, NIS e CNS: colunas cifradas (bytea) + hash HMAC indexado; crie o serviço de cifragem AES-256-GCM.
EventoCaso: append-only (trigger que bloqueia UPDATE e DELETE) e hash encadeado (hash do evento anterior + conteúdo) exposto como código verificador.
Crie o seed fictício portando o gerador do protótipo (docs/prototipo/index.html, funções rng/CASOS/CRIANCAS/IDOSOS/NOTIF), com a mesma semente, para que os números batam com o protótipo.
Critérios de aceite: migrate + seed rodam do zero; teste que tenta alterar um EventoCaso falha; consulta por CPF funciona pelo hash sem decifrar a tabela.
```

### P06 · Território e geocodificação

```
Implemente o módulo territorio:
1. Importação das camadas de ~/geoportal_itapua-main(1)/geoportal_itapua-main/ (limite municipal, setores 1–5 + industrial, ruas, escolas municipais e estaduais, saúde, assistência, outros prédios, pontos de interesse, microáreas de ACS) via o script do P02, com tabela de mapeamento de atributos que resolve os problemas listados na seção 3.1.1 da especificação (nomes truncados → nome completo + INEP/CNES, arquivos de ACS trocados, ids duplicados, feição vazia). A malha cadastral de quadras e lotes da Fazenda ainda não existe: usar a grade provisória abaixo.
2. Endpoints GeoJSON simplificados por nível de zoom (ST_SimplifyPreserveTopology) para setores, quadras, lotes e equipamentos, com cache no Redis.
3. Serviço de geocodificação com a cascata da seção 3.2, normalização de endereço (unaccent + pg_trgm) e limpeza dos pontos do e-SUS Território.
4. Endpoint para confirmar ou ajustar o pino (grava CONFIRMADO_USUARIO e a precisão do GPS).
Enquanto a malha real de quadras e lotes não chega, gere uma grade provisória alinhada às ruas (ângulo dominante das arestas dos setores), como no protótipo, marcada como provisória.
Critérios de aceite: com os shapefiles de teste o mapa de setores e equipamentos bate com o QGIS; teste da cascata para cada fonte; relatório de cobertura por fonte e precisão por setor.
```

### P07 · Identidade única

```
Implemente o módulo pessoas com o serviço de ligação da seção 3.3: regras em ordem (CPF, CNS/NIS, nome + nascimento + mãe com similaridade ≥ 0,92), confiança gravada em VinculoFonte, fila de revisão manual para os casos abaixo de 0,85 e tela simples de revisão no web (aceitar, rejeitar, unir).
Nunca unir automaticamente abaixo de 0,85. Toda união ou separação gera registro de auditoria.
Critérios de aceite: testes com pares sintéticos (gêmeos, homônimos, nome da mãe abreviado); o seed gera pelo menos 20 casos de revisão.
```

---

## Fase 2 · Integração social

### P08 · Cargas: padrão e CadÚnico

```
No apps/worker, crie o padrão de carga da seção 5: upload (web) → arquivo no minio → job BullMQ → schema stg_<fonte> com carga_id → validação de layout → ligação de pessoas → tabelas de domínio → LogCarga.
Implemente primeiro o CadÚnico (CSV do CECAD e base completa do Portal de Gestão): detectar separador e encoding, validar colunas pelo dicionário do MDS (deixe o dicionário em um arquivo de configuração), normalizar CPF e NIS, guardar o mês de referência.
Tela no web para o ponto focal da Assistência enviar o arquivo, ver o progresso e os erros por linha.
Critérios de aceite: carga de um CSV fictício de 5 mil linhas em menos de 2 min; arquivo com coluna faltando é rejeitado com mensagem clara; nenhuma linha com CPF vai para log.
```

### P09 · Carga do e-SUS APS PEC

```
Implemente o conector do e-SUS PEC: conexão PostgreSQL somente leitura configurável por .env (host, porta, banco, usuário), descoberta e verificação das tabelas usadas (tb_cidadao, tb_fat_cad_individual, tb_fat_cad_domiciliar e colunas de latitude/longitude, a confirmar), leitura incremental noturna, gerando apenas os sinalizadores da seção 3.5. Nada de CID ou diagnóstico.
Se a estrutura do banco mudar (após atualização do PEC), a carga falha de forma visível e alerta a CTI, sem gravar dados pela metade.
Inclua um modo "dry-run" que só relata o que leria.
Critérios de aceite: teste de integração contra um PostgreSQL de teste com o schema mínimo do PEC; dry-run lista contagens por tabela.
```

### P10 · Educação: matrícula, frequência e calendário

```
Implemente o módulo educacao: escolas, turmas, matrículas, frequência diária e calendário escolar. Importação CSV da gestão escolar e da SEDUC-RO pelo padrão de carga.
No web, a escola lança e corrige a frequência da turma (grade aluno × dia), com salvamento automático e estado offline simples.
Job diário que aplica deveNotificarInfrequencia (packages/shared) e cria Caso + Notificacao para o CRAS do território do domicílio, de forma idempotente.
Critérios de aceite: com o seed, o job cria exatamente as notificações esperadas; rodar o job duas vezes não duplica; feriado do calendário não conta como falta.
```

### P11 · Notificações e parecer da Assistência

```
Implemente os módulos casos e notificacoes conforme as seções 3.7 e 4.1:
API para listar a caixa de entrada do CRAS (filtros por situação), marcar como em análise, registrar parecer (schema zod do shared, mínimo de 30 caracteres, desfecho obrigatório, nova visita opcional) e encaminhar manualmente um caso a partir da ficha.
Job de prazos que aplica prazoCaso, sobe o nível de escalonamento e monta a pauta do Comitê Gestor.
Ao emitir o parecer, notifique a escola e a SEMED (notificação interna; e-mail opcional sem dado pessoal).
Web: telas "Notificações à Assistência" e "Pauta do Comitê" iguais ao protótipo, com validação acessível (erro ligado ao campo, foco no primeiro erro, botão com estado "Enviando…").
Critérios de aceite: fluxo e2e no Playwright: falta → notificação → parecer → evento na ficha → aviso à escola; perfil ESCOLA não consegue emitir parecer.
```

### P12 · Ficha da criança

```
Implemente o módulo fichas (seção 3.8): endpoint que monta a ficha a partir da PessoaMestra respeitando o perfil (campos ausentes, não nulos, quando o perfil não pode ver), motivos de visita (shared), linha do tempo unificada e relatórios de visita.
Endpoint POST /fichas/:id/revelar-cpf com finalidade obrigatória, gravando AcessoDadoPessoal.
Web: tela "Ficha da criança" igual ao protótipo: lista com busca e filtros (precisam de visita, com notificação, 0 a 3 anos, educação especial) e a ficha ao lado.
Critérios de aceite: a ficha carrega em menos de 1,5 s com o seed; revelar CPF sem finalidade retorna 422; o registro de acesso aparece no painel do DPO.
```

### P13 · Busca ativa escolar

```
Implemente a busca ativa (seção 4.2): job que cruza pessoas de 4 a 17 anos residentes com matrículas municipais e estaduais e abre Caso(BUSCA_ATIVA_ESCOLAR); fluxo identificado → encaminhado → visita → matriculado ou não localizado; prazos e escalonamento.
Web: painel "Busca ativa escolar" igual ao protótipo (KPIs, funil, origem do alerta, tabela de casos com prazo, filtro "Escalonados ao Comitê", exportação CSV sem CPF).
Critérios de aceite: com o seed, os números do painel batem com o protótipo; exportação não contém CPF nem nome completo.
```

---

## Fase 3 · Web e controle externo

### P14 · Layout e painéis do web

```
Monte o app web com o layout institucional do protótipo (cabeçalho do órgão, faixa de homologação, menu lateral agrupado: Acompanhamento, Ciclos de vida, Território, Gestão), seguindo as regras de front-end do CLAUDE.md.
Crie os componentes base com shadcn/ui: Kpi, Card, Pill de situação, Tabela (TanStack Table com busca, ordenação, paginação e exportação), Estado (carregando, vazio, erro, sem permissão), filtros persistentes de território e período (na URL).
Implemente a Visão geral (KPIs, casos abertos × resolvidos, "Precisa de atenção", pauta do Comitê).
Critérios de aceite: auditoria de acessibilidade sem erros críticos (axe no Playwright); navegação completa por teclado; funciona em 360 px.
```

### P15 · Mapa

```
Implemente a tela Território com MapLibre GL JS: setores, quadras, lotes e equipamentos vindos dos endpoints do P06; camadas do protótipo (índice de vulnerabilidade, calor de 0 a 3 anos, Criança Feliz, calor de idosos sozinhos sem visita, casos de busca ativa, situação dos lotes, verificação da precisão do ponto); clique na quadra abre o detalhe com os lotes e quem mora em cada um (respeitando o perfil).
Mapa de calor com camada heatmap do MapLibre; nenhum ponto individual aparece para AUDITOR_TCE (só agregados por quadra, com supressão < 5).
Critérios de aceite: troca de camada em menos de 300 ms com o seed; mapa utilizável por teclado (lista de quadras alternativa ao mapa).
```

### P16 · Indicadores, painel do TCE e auditoria

```
Implemente o módulo indicadores: job mensal e por vigência que grava IndicadorSnapshot por território para os objetivos OE1 a OE6, gasto × resultado (conector da API do Portal da Transparência) e supressão de contagens < 5.
Web: painel "Controle externo" igual ao protótipo e geração do relatório semestral em PDF e XLSX.
Painel do DPO com os acessos a dado pessoal (filtros por pessoa, usuário e período).
Critérios de aceite: o perfil AUDITOR_TCE navega só por agregados; o relatório gerado contém os indicadores com linha de base, valor atual e meta; a trilha de um caso pode ser verificada pelo código verificador.
```

---

## Fase 4 · App mobile e ampliação

### P17 · App mobile: base offline

```
No apps/mobile (Expo), implemente: login com a API (refresh no secure store), PIN local para reabrir offline, download da carteira do usuário (só seu escopo) para SQLite cifrado, tela "Minha carteira" ordenada por prioridade (motivos de visita e prazos do shared), filtro por quadra, ficha resumida.
Layout acessível com os tokens gov.br; alvos de 44 px; funciona em Android de entrada.
Critérios de aceite: com o modo avião ligado, o usuário abre o app, vê a carteira e a ficha resumida; ao sair do perfil, os dados locais são apagados.
```

### P18 · App mobile: visita, mapa e sincronização

```
Implemente no mobile: formulário de visita offline (schema Visita do shared), captura do ponto GPS com precisão e confirmação do pino, mapa MapLibre RN com setores, quadras e famílias da carteira (GeoJSON cacheado), fila de sincronização com chave de idempotência, indicador de pendências e reenvio automático.
Para CRAS_TECNICO: caixa de notificações e formulário de parecer, iguais ao web.
Push (expo-notifications) sem dado pessoal.
Critérios de aceite: 20 visitas registradas offline sincronizam sem duplicar ao voltar a rede; conflito resolvido conforme o CLAUDE.md; parecer enviado pelo celular aparece na ficha no web.
```

### P19 · Ciclos de vida e índice

```
Implemente os painéis web restantes do protótipo, com dados reais das cargas: Primeira infância (com Criança Feliz e "0 a 3 sem cuidado"), Vagas de creche (simulador), Educação inclusiva, EJA, Pessoa idosa (cruzamentos Saúde × Assistência e lista prioritária) e Índice de vulnerabilidade (pesos versionados em PesosIvm, aprovados pelo COMITE_GESTOR, com histórico).
Critérios de aceite: cada painel tem os estados obrigatórios; alterar os pesos cria nova versão e recalcula o mapa; listas nominais respeitam perfil e escopo.
```

### P20 · Produção

```
Prepare a produção: Dockerfiles multi-stage, compose de produção atrás de Nginx com HTTPS, backups diários do PostgreSQL com retenção de 30 dias e script de teste de restauração, logs estruturados sem dado pessoal, métricas das filas, health checks, CI (lint, typecheck, test, build) e checklist de deploy em docs/deploy.md.
Faça uma revisão de segurança: OWASP Top 10, cabeçalhos HTTP, CORS, segredos, dependências, e garanta que nenhum endpoint devolve CPF sem passar pelo fluxo de revelação.
Critérios de aceite: deploy do zero em uma VM limpa seguindo o docs/deploy.md; restauração de backup testada; relatório da revisão de segurança em docs/seguranca.md.
```

---

## Prompts avulsos úteis

**Revisão antes do commit**
```
Revise o diff atual: regras duplicadas fora do packages/shared, dado pessoal em log ou resposta sem máscara, falta de verificação de perfil ou escopo, estados de tela faltando, textos fora da linguagem simples. Liste os problemas por gravidade e corrija os críticos.
```

**Nova fonte de dados**
```
Quero integrar a fonte [nome]. Siga o padrão de carga da seção 5 da especificação: proponha o layout esperado, o schema stg_, as regras de validação e de ligação de pessoas e a tela de upload. Mostre o plano antes de codar.
```

**Nova regra de alerta**
```
Nova regra: [descrição]. Implemente primeiro em packages/shared com testes, depois o job no worker que cria o Caso e o evento na ficha, e por fim o aparecimento no painel e no app mobile. Não altere as regras existentes.
```
