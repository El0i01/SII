# Especificação — SII · Sistema Integrado Intersecretarial

Versão 0.5 · 18 de novembro de 2026 · CTI/SEMED · Itapuã do Oeste/RO
O que já foi entregue, prompt a prompt: `docs/ANDAMENTO.md`.
Base: Plano Estratégico, Plano de Desenvolvimento e protótipo navegável (`docs/prototipo/index.html`).

---

## 1. Objetivo e escopo

Integrar os dados de Educação, Saúde, Assistência Social e Fazenda numa base única de **pessoas, famílias, domicílios e lotes**, para agir de forma preventiva e prestar contas ao TCE-RO.

Fora do escopo da v1: multi-município, prontuário clínico, emissão de documentos fiscais, substituição dos sistemas federais (e-SUS, CadÚnico, SICON continuam sendo a origem).

## 2. Perfis de acesso

| Perfil | Quem | Vê dado nominal | Pode |
| --- | --- | --- | --- |
| `ADMIN_CTI` | Equipe técnica | Sim (com finalidade) | Administrar usuários, cargas, configurações |
| `COMITE_GESTOR` | Membros do Comitê | Sim, do município | Tudo de leitura, pauta do Comitê, aprovar pesos do índice |
| `SEMED_GESTOR` | Coordenação da SEMED | Sim, alunos | Busca ativa, vagas, encaminhar casos |
| `ESCOLA` | Secretário escolar / direção | Sim, só alunos da escola | Frequência, matrícula, encaminhar caso, ler parecer |
| `SAUDE_GESTOR` | Coordenação da APS | Sim, sinalizadores de saúde | Listas de visita, idosos, vacinação |
| `ASSISTENCIA_GESTOR` | Ponto focal do CadÚnico na Assistência Social | Sim, do município (campos da Assistência) | Enviar e acompanhar as cargas do CadÚnico |
| `ACS` | Agente comunitário (mobile) | Sim, só a microárea | Registrar visita, confirmar ponto |
| `CRAS_TECNICO` | Técnico do CRAS | Sim, território do CRAS | Receber notificação, registrar parecer, PAIF |
| `VISITADOR_PCF` | Visitador do Criança Feliz (mobile) | Sim, só suas famílias | Registrar visita PCF |
| `FAZENDA` | Cadastro imobiliário | Não (só imóvel e território) | Pendências cadastrais, lotes |
| `AUDITOR_TCE` | TCE-RO, CGM, Câmara | **Não** | Indicadores agregados, trilha anonimizada, relatórios |
| `DPO` | Encarregado de dados | Registro de acessos | Auditar acessos, RIPD, atender titulares |

Autorização = RBAC (perfil) + ABAC (secretaria, território, escola, microárea, CRAS) + RLS no banco.

Decisões de 11/11/2026 (ADR 0003):

- `SEMED_GESTOR` e `SAUDE_GESTOR` veem as pessoas do **município inteiro**. A busca ativa precisa achar quem não está matriculado, e a UBS Jacir Boni atende todas as microáreas. Cada um recebe só os campos da própria secretaria.
- Escopo dos perfis locais:
  - `ESCOLA`: o INEP da escola;
  - `ACS`: a microárea;
  - `CRAS_TECNICO`: o CadSUAS do CRAS;
  - `VISITADOR_PCF`: as famílias acompanhadas.
- `FAZENDA` e `DPO` não veem pessoas.

Decisão de 12/11/2026 (P08): criado o perfil `ASSISTENCIA_GESTOR`, o ponto focal do CadÚnico. Ele vê o **município inteiro**, como `SEMED_GESTOR` e `SAUDE_GESTOR`, e envia as cargas junto com a `ADMIN_CTI`.
- Sessão: o acesso vale 15 min. O refresh é deslizante, **12 h no web e 7 dias no celular**.
- Bloqueio: 5 senhas erradas seguidas travam a conta por 15 min. Para destravar antes disso, a CTI gera uma senha provisória.

## 3. Módulos

### 3.1 Território (`territorio`)

- Hierarquia: **Setor → Quadra → Lote → Domicílio**. Chave natural `setor/quadra/lote` (ex.: `S03/Q055/L07`), igual ao sistema da Reurb.
- Geometrias em PostGIS, SRID de armazenamento 4674 (SIRGAS 2000); exibição em 3857.
- Fontes: Geoportal (setores, escolas municipais e estaduais, saúde, assistência, áreas de ACS), malha cadastral da Fazenda (quadras e lotes, SIRGAS 2000 / UTM 20S), CNEFE 2022, SIGEF/CAR (rural).
- Situação do lote: `REGULAR`, `SEM_INSCRICAO`, `REURB_EM_ANALISE`, `TITULADO`, `VAZIO`.
- Equipamentos públicos (`Equipamento`): tipo, nome, CNES/INEP, geometria, território de referência.
- Áreas de referência: microárea do ACS, território do CRAS, zona da escola (para rotear notificações).
- Carga do geoportal (`pnpm geo:carregar`, ADR 0005):
  - os setores S01–S05 e o industrial (`SIND`) vêm dos shapefiles;
  - a zona rural (`RUR`) é o município menos os setores urbanos;
  - até a malha da Fazenda chegar, as quadras e os lotes são a **grade provisória**: células de 216 m giradas no ângulo das ruas, cada quadra em 4 × 3 lotes, marcadas `provisoria`.

#### 3.1.1 Shapefiles do Geoportal (inventário de 11/11/2026)

Origem: `~/geoportal_itapua-main(1)/geoportal_itapua-main/`. Todas as camadas têm .shp, .shx, .dbf e .prj.

| Camada | Arquivo | Geometria | Feições | SRS de origem | Atributos |
| --- | --- | --- | --- | --- | --- |
| Limite municipal (IBGE) | `malha_municipal/limite_mun_itapua.shp` | Polígono | 1 | SIRGAS 2000 | `CD_MUN`, `NM_MUN`… |
| Setores urbanos | `setores/setor1..5.shp`, `industrial.shp` | Polígono | 6 (1 por arquivo) | Web Mercator 3857 | `id`, `nome` |
| Ruas | `Ruas_Itapuã/RuasItapuã.shp` | Linha | 91 | WGS 84 | `id`, `rua` (rua/avenida/linha), `nome`, `km` |
| Escolas municipais | `predios_publicos/escolas/municipais/escolas_mun.shp` | Polígono | 7 | Web Mercator 3857 | só `nome` |
| Escolas estaduais | `predios_publicos/escolas/estaduais/escolas_est.shp` | Polígono | 2 | WGS 84 | `cod`, `nome` |
| Saúde | `predios_publicos/saude/saude.shp` | Polígono | 7 | WGS 84 | `id`, `nome` |
| Assistência | `predios_publicos/assistencia/assistencia.shp` | Polígono | 3 (CRAS, CREAS, Conselho Tutelar) | WGS 84 | `id`, `nome` |
| Outros prédios | `predios_publicos/outros/predios_outros.shp` | Polígono | 12 | WGS 84 | `id`, `nome` |
| Pontos de interesse | `PrediosItap/Pontos.shp` | Multiponto | 53 | WGS 84 | `Tipo`, `Nome`, `CNPJ`, `ID` |
| Microáreas ACS (sede) | `MalhaACS/AreaACS.shp` | Polígono | 6 | WGS 84 | `id`, `regiao` |
| Microáreas ACS (rural) | `MalhaACS/AreaACS_Urbano.shp` | Polígono | 14 | WGS 84 | `id`, `regiao` |

Problemas conhecidos, a tratar na tabela de mapeamento (não corrigir o shapefile em silêncio):

- **Projeções misturadas**: reprojetar tudo para 4674 lendo o .prj de cada arquivo.
- **Nomes truncados em 10 caracteres** (`Ubs 1`, `Con. Tutel`, `Farmacia M`, `AN. CUST`, `NOVO PEQ`): mapear para nome completo + código INEP (escolas) ou CNES (saúde). Escolas municipais não têm código nenhum.
- **Arquivos de ACS trocados**: `AreaACS_Urbano.shp` é a zona rural e `AreaACS.shp` é a sede.
- **ACS rural**: `id` 9 duplicado; faltam 5, 7 e 15; regiões chamadas `urb*` apesar de rurais. Grafia inconsistente na sede (`area01` × `Area02`).
- **Outros prédios**: uma feição sem `id` nem `nome`.
- **Pontos**: categoria `educaca` (erro de digitação de `educacao`); o Conselho Tutelar está classificado como `saude`; o `.dbf` está em LATIN1 e não tem `.cpg` (importar com `--encoding LATIN1`, senão os acentos quebram).
- **Saúde**: dois polígonos com o mesmo nome `VIGILANCIA` (são unidades diferentes, ver 3.1.2).
- **Setores**: são os 5 setores urbanos + industrial da Prefeitura, não setores censitários do IBGE; a chave `S01..S05` e `SIND` precisa casar com a chave da Reurb.
- **Faltam**: quadras e lotes (malha da Fazenda), área de abrangência do CRAS e zona de cada escola.

#### 3.1.2 Mapeamento de equipamentos (shapefile → cadastro oficial)

Fonte dos dados oficiais: Catálogo de Escolas do INEP, informado pela SEMED em 11/11/2026.

| Camada | Valor no shapefile | Nome oficial | INEP | Rede | Etapas / modalidades | Endereço | Telefone |
| --- | --- | --- | --- | --- | --- | --- | --- |
| escolas_mun | `CRECHE` | Creche Municipal Pequeninos de Cristo | 11048395 | Municipal, urbana | Educação Infantil | Rua Ana Ferreira esq. c/ Presidente Médici, s/n | (69) 99245-6628 |
| escolas_est | `1` / `JOAO FRANCISCO` | EEEF João Francisco Correia | 11040882 | Estadual, urbana | Ensino Fundamental · Regular | Rua Senador Olavo Pires, 1363 | (69) 99262-7181 |
| escolas_est | `2` / `PAULO FREIRE` | EEEFM Paulo Freire | 11005360 | Estadual, urbana | Fundamental e Médio · Regular, EJA | Av. Ayrton Senna, 1655 | (69) 99232-3878 |
| escolas_mun | `CUST` | EMEF Dr. Custódio | 11005165 | Municipal, urbana | Fundamental (anos iniciais e finais) · Regular, EJA | Av. Costa e Silva, 2166, Centro | (69) 99321-0776 |
| escolas_mun | `PEQ` | EMEI Pequeno Príncipe | 11005378 | Municipal, urbana | Educação Infantil | Av. Costa e Silva, 2166, Centro | *incompleto no INEP* |
| escolas_mun | `SOG` | EMEIEF Sossego da Mamãe | 11005300 | Municipal, urbana | Ensino Fundamental · Regular | Rua Senador Olavo Pires, 1367 | (69) 99221-2649 |
| escolas_mun | `CECILIA` | EMEIEF Cecília Meireles | 11005122 | Municipal, **rural** | Infantil e Fundamental · Regular | Linha B-40-A, km 10, zona rural | (69) 3231-2330 |
| escolas_mun | `AN. CUST` | Anexo da EMEF Dr. Custódio (confirmado pela SEMED) | 11005165 | Municipal | | | |
| escolas_mun | `NOVO PEQ` | Prédio novo da EMEI Pequeno Príncipe (confirmado pela SEMED) | 11005378 | Municipal | | | |

Conferência geométrica (centroides): `CUST`, `AN. CUST` e `PEQ` ficam a menos de 80 m um do outro, coerente com o endereço comum (Av. Costa e Silva, 2166). `NOVO PEQ` fica a cerca de 600 m dali. `CECILIA` fica 11 km ao sul da sede, coerente com a zona rural. `SOG` fica ao lado da EEEF João Francisco (Olavo Pires 1367 × 1363).

Um polígono que não tem INEP próprio (anexo, prédio novo) vira `Equipamento` ligado à escola-mãe, não uma `Escola` nova.

CEP de todas: 76861-000.

**Saúde** (CNES informado pela SEMSAU em 11/11/2026). O nome completo veio do `PrediosItap/Pontos.shp`: cada ponto cai dentro do polígono correspondente (distância 0 m).

| Camada | Valor no shapefile | Nome oficial | CNES |
| --- | --- | --- | --- |
| saude (id 1) | `Hpp` | Hospital de Pequeno Porte José Baioco | 4002768 |
| saude (id 2) | `Ubs 1` | UBS Edson Cavalheiro | 2806509 |
| saude (id 3) | `Ubs 4` | UBS Jacir Boni | 7327862 |
| saude (id 4) | `ALMO SAUDE` | Almoxarifado da Saúde | *sem CNES* |
| saude (id 5) | `VIGILANCIA` | Vigilância Sanitária | 7121237 |
| saude (id 6) | `VIGILANCIA` | Unidade de Vigilância Epidemiológica e Endemias (confirmado pela SEMSAU) | 7346050 |
| saude (id 7) | `Farmacia M` | Farmácia Básica Municipal | 0392553 |
| outros (id 1) | `APAE` | APAE Itapuã | 2899418 |

Estabelecimentos municipais com CNES que ainda não têm polígono: SEMSAU (7121229), Central Municipal de Rede de Frio (8208697), Unidade Odontológica Móvel (8448876, sem endereço fixo). Os privados (laboratórios, próteses, clínicas, psicologia) ficam fora dos equipamentos públicos.

**Microáreas de ACS → UBS**: segundo a SEMSAU (11/11/2026), as microáreas de `MalhaACS` (6 da sede e 14 rurais) são da **UBS Jacir Boni** (`Ubs 4`, CNES 7327862). A UBS Edson Cavalheiro não tem microárea de ACS no geoportal.

**Assistência** (informado em 11/11/2026):

| Camada | Valor no shapefile | Nome oficial | Endereço | Código |
| --- | --- | --- | --- | --- |
| assistencia (id 1) | `CRAS` | CRAS · Centro de Referência de Assistência Social | Rua Maria Vitaliano de Souza, 1940, Centro | CadSUAS 11011015018 |
| assistencia (id 2) | `CREAS` | CREAS · Centro de Referência Especializado de Assistência Social | Rua Moisés de Freitas, 2476, Centro (confirmado em 11/11/2026) | CadSUAS 11101102797 |
| assistencia (id 3) | `Con. Tutel` | Conselho Tutelar | *a informar* | não tem |

A **APAE Itapuã** (`outros` id 1) é também a unidade **Centro-Dia e similares** do SUAS: CadSUAS 1101103503753, mesmo CNPJ do CNES (07.525.228/0001-44). Conta para a Educação inclusiva (atendimento especializado) e para a Pessoa idosa/PCD (Centro-Dia), além da Saúde (CNES 2899418).

Os números do CadSUAS começam por 110110, os 6 primeiros dígitos do código IBGE; daí a confusão com "1101103" no texto anterior.

Há um único CRAS no município: toda notificação de infrequência (4.1) vai para ele, qualquer que seja o setor do domicílio.

**Município**: Itapuã do Oeste/RO, código IBGE **1101104** (do `limite_mun_itapua.shp`, malha do IBGE). Um texto recebido citava 1101103; vale o da malha oficial. CNPJ da Prefeitura: 63.761.936/0001-55.

### 3.2 Geocodificação (`territorio/geocodificacao`)

Cascata fixa (a primeira fonte disponível vence), gravando `geoFonte` e `geoPrecisaoM`. O ponto `CONFIRMADO_USUARIO` (confirmado ou ajustado em campo) vem antes de todas. Dentro da mesma fonte, vence o mais preciso; no CNEFE, o nível 1 vence o 2, que vence o 3.

1. `CENSO_GPS`: ponto do Censo Municipal (≈ 5 m)
2. `LOTE`: centroide do lote cadastral (≈ 10 m)
3. `ESUS_TERRITORIO`: ponto do imóvel no e-SUS Território, após limpeza (≈ 15–30 m)
4. `CNEFE`: CNEFE 2022, nível 1 > 2 > 3
5. `SIGEF_CAR`: centroide do polígono rural
6. `SETOR`: centroide do setor censitário (baixa precisão)

Limpeza dos pontos do e-SUS: descartar pontos a menos de 30 m de uma unidade de saúde, fora do limite municipal, ou repetidos em 3 ou mais imóveis distintos.
Normalização de endereço: sem acento, abreviações expandidas ("R." → "RUA"), busca por similaridade (`pg_trgm`) restrita ao setor.
Toda tela de cadastro (web e mobile) mostra o pino sugerido para o usuário confirmar ou ajustar; a confirmação vira `CONFIRMADO_USUARIO` com precisão do GPS.

### 3.3 Pessoas e identidade (`pessoas`)

- `PessoaMestra`: um registro por cidadão. CPF, NIS e CNS cifrados + hash HMAC; nome; data de nascimento; nome da mãe; sexo.
  - Cifragem AES-256-GCM na aplicação; o hash HMAC-SHA256 usa uma chave separada e tem índice único. A busca e a ligação entre fontes usam só o hash (ADR 0004).
  - Nenhuma coluna guarda CPF, NIS ou CNS em texto.
- `Familia` e `Domicilio`: composição familiar com o responsável familiar; o domicílio aponta para o lote.
- `VinculoFonte`: pessoa ↔ registro em cada fonte (`ESUS`, `CADUNICO`, `GESTAO_ESCOLAR`, `CENSO`, `SEDUC`, `SINASC`) com `regra` e `confianca`.
- Regras de ligação, nesta ordem:
  1. CPF igual → confiança 1,0
  2. CNS ou NIS igual → 0,95
  3. Nome normalizado + data de nascimento + nome da mãe (similaridade ≥ 0,92) → 0,85
  4. Abaixo disso → fila de revisão manual (`RevisaoVinculo`)
- Nunca fundir duas pessoas automaticamente com confiança < 0,85.
- Como a regra funciona (ADR 0006, decisões de 11/11/2026):
  - a similaridade é Jaro-Winkler sobre o nome normalizado, com as iniciais expandidas (mãe abreviada casa);
  - o primeiro nome é conferido à parte (gêmeos);
  - CPF diferente nos dois lados nunca une;
  - nascimento com erro de digitação (até 31 dias ou dia e mês trocados) vai no máximo para revisão.
- Revisão: só a CTI (`ADMIN_CTI`).
  - **Aceitar** une o par; **Rejeitar** marca como pessoas diferentes.
  - Fora da fila, a CTI também pode **unir** dois registros quaisquer e **separar** uma união errada.
  - Tudo vai para `auditoria.evento_identidade`.

### 3.4 Educação (`educacao`)

- `Escola` (INEP, rede municipal ou estadual, geometria), `Turma`, `Matricula` (situação: ativa, transferida, abandono, concluída), `Frequencia` (aluno × dia letivo × presente/falta/justificada).
- `CalendarioEscolar`: dias letivos por escola e ano. **Obrigatório para a regra de infrequência.**
- **O calendário é configurável** (decisão de 11/11/2026):
  - cada escola e ano tem parâmetros: início, fim, recessos, feriados e dias letivos extras;
  - os dias letivos são gerados a partir deles (`gerarDiasLetivos`, no shared);
  - a SEMED ou a CTI define o calendário de uma escola (`PUT /escolas/:inep/calendario/:ano`) ou da rede inteira (`PUT /calendarios/:ano?rede=MUNICIPAL`);
  - a escola consulta o próprio calendário;
  - o feriado municipal entra por essa configuração.
- `FilaCreche`: inscrição, data, critérios (vulnerabilidade CadÚnico, distância, irmão na escola), posição.
- Integrações: gestão escolar (enquanto não houver módulo próprio, importação CSV), Educacenso, Sistema Presença, matrículas da SEDUC-RO, GTE (transporte).
- EJA: turmas, matrículas, frequência; público potencial vem do CadÚnico (escolaridade) e do Censo.

Como ficou (P10, ADR 0009):

- **Frequência no web** (`/frequencia`):
  - a escola abre a grade aluno × dia letivo da turma e lança P, F ou J, ou apaga;
  - o salvamento é automático, em lote (`PUT /escolas/:inep/turmas/:turma/frequencia`, schema `LancamentosFrequencia` do shared);
  - a API recusa por item o dia não letivo, o dia futuro e o aluno fora da turma, e grava o resto;
  - lançam a escola (só a própria), a SEMED e a CTI; o Comitê só consulta;
  - fica registrado quem lançou ou corrigiu por último.
- **Offline** (decisão de 17/11/2026): sem internet, a grade aberta e as alterações ficam no navegador, por usuário, por até 24 h, e são enviadas quando a conexão volta. Ao entrar, o navegador apaga o que for de outro usuário.
- **Cargas** (padrão do §5):
  - **gestão escolar**: aluno × dia, com matrícula na turma e frequência;
  - **SEDUC-RO**: matrículas de residentes na rede estadual, com a situação;
  - o layout é próprio do SII, **a confirmar** (dicionários em `apps/worker/config/dicionarios/`);
  - enviam a SEMED e a CTI;
  - a matrícula é única por aluno, escola e ano;
  - a matrícula ativa atualiza a escola da pessoa (escopo do perfil ESCOLA);
  - frequência em dia não letivo é ignorada com aviso.

### 3.5 Saúde (`saude`), só sinalizadores

Do e-SUS APS PEC (leitura somente leitura), por pessoa: `ubsReferencia`, `microarea`, `acsResponsavel`, `ultimaVisitaAcs`, `vacinacaoEmDia`, `preNatalAdequado` (gestantes), `acamadoDomiciliado`, `condicaoCronicaAcompanhada` (booleano, sem dizer qual), `necessitaAtendimentoEspecializado`.
Regras (P09, decisão de 13/11/2026):
- crônica acompanhada = atendimento nos últimos 180 dias;
- vacina da gripe em dia = 60 anos ou mais com dose nos últimos 12 meses;
- `vacinacaoEmDia`, `preNatalAdequado` e `necessitaAtendimentoEspecializado` ficam sem valor até a Saúde definir a regra (§9).

Do SINASC: nascidos vivos com endereço. Do PBF na Saúde: situação do acompanhamento por vigência.

### 3.6 Assistência Social (`assistencia`)

- Snapshot mensal do CadÚnico: família, renda per capita (faixa), PBF, membros, escolaridade.
- `AcompanhamentoPaif` / `AcompanhamentoPaefi`, `Bpc` (idoso ou PCD), `Scfv` (Serviço de Convivência, por faixa etária).
- `CriancaFeliz`: família, criança ou gestante, visitador, data da última visita, frequência esperada (semanal).
- SICON: descumprimentos e acompanhamento familiar por vigência.

### 3.7 Casos, notificações e pareceres (`casos`, `notificacoes`)

`Caso`: tipo, pessoa, território, responsável atual (secretaria e usuário), status, nível de escalonamento, prazos.
Tipos v1: `BUSCA_ATIVA_ESCOLAR`, `INFREQUENCIA`, `PRIMEIRA_INFANCIA_SEM_CUIDADO`, `INCLUSAO_SEM_ATENDIMENTO`, `IDOSO_SEM_VISITA`.

`EventoCaso` (append-only, encadeado por hash = código verificador): alerta gerado, encaminhado, notificação enviada, em análise, visita realizada, parecer emitido, encaminhado ao Conselho Tutelar, desfecho.

Como funciona a trilha (ADR 0004):

- Quem calcula `seq` e `hash` é o banco, no INSERT: `sha256(hash_anterior ‖ caso|seq|tipo|ocorrido_em|autor|dados)`.
- UPDATE, DELETE e TRUNCATE são bloqueados por trigger.
- `casos.verificar_trilha(caso)` confere a cadeia e pode ser usada pelo auditor.
- O **código verificador** é `XXXX-XXXX-XXXX`, os 12 primeiros caracteres hex do hash do último evento.
- `dados` nunca leva dado pessoal.

`Notificacao`: origem, destino (CRAS do território do domicílio), motivo, status (`NOVA`, `EM_ANALISE`, `PARECER_EMITIDO`), prazo.
`Parecer`: desfecho (lista fechada abaixo), texto (mínimo 30 caracteres, sem diagnóstico), autor, nova visita programada (sim/não).

Desfechos: `RETORNO_ESCOLA_COMBINADO`, `ENCAMINHADO_SEMED_TRANSPORTE`, `AUSENCIA_JUSTIFICADA_SAUDE`, `ENCAMINHADO_CREAS`, `ENCAMINHADO_CONSELHO_TUTELAR`, `FAMILIA_NAO_LOCALIZADA`.

Como ficou (P11, ADR 0010):

- **Caixa de entrada** (`/notificacoes`):
  - KPIs: novas, em análise, pareceres emitidos e fora do prazo;
  - filtro por situação e detalhe com a criança pelas iniciais, a escola, o território, o prazo e a trilha com código verificador;
  - a RLS recorta o que cada um vê: o CRAS vê as do próprio CRAS; a escola, as dos próprios alunos; SEMED, Comitê e CTI veem o município.
- **Parecer** (decisão de 17/11/2026: emitem o técnico do CRAS e o Comitê Gestor):
  - o técnico pode antes marcar "em análise";
  - validação com o schema `Parecer` (30 caracteres, desfecho, sem CID, data da nova visita);
  - ao enviar, o caso fecha (exceto Conselho Tutelar ou nova visita), a trilha registra e a escola e a SEMED recebem um **aviso interno**.
- **Avisos internos** (`/avisos`): só o código do caso e um texto fixo, nunca dado pessoal. Recebem a escola (pelo INEP), o CRAS, as secretarias e o Comitê. Não há e-mail por enquanto.
- **Encaminhamento manual** (`POST /casos/encaminhamentos`):
  - encaminham escola, SEMED, Comitê e CTI;
  - à Assistência, vira notificação ao CRAS; aos outros destinos, aviso à secretaria;
  - um caso aberto por pessoa e tipo.
- **Prazos** (job diário às 6h30): atualiza o nível de escalonamento e avisa quando sobe (nível 3 → Comitê). Para rodar na hora: `pnpm --filter @sii/worker prazos:rodar [AAAA-MM-DD]`.
- **Pauta do Comitê** (`/pauta`, lista viva): casos em nível 3, do mais atrasado ao menos, com exportação CSV sem CPF.


### 3.8 Ficha da criança (`fichas`)

Uma ficha por criança e adolescente (0 a 17), montada a partir da `PessoaMestra`:
identificação (mascarada), endereço (setor/quadra/lote), educação (escola, turma, frequência do mês, faltas seguidas), saúde (UBS, vacinação, última visita do ACS), assistência (CadÚnico, PBF, CRAS, Criança Feliz), proteção e inclusão (Conselho Tutelar, atendimento especializado, APAE, BPC), **motivos de visita**, histórico (linha do tempo de `EventoCaso` + eventos das fontes) e relatórios de visita.

Como ficou (P12, ADR 0011):

- **Quem vê** (decisão de 17/11/2026): todo perfil com dado nominal vê os quatro blocos (Educação, Saúde, Assistência, Proteção e inclusão), o histórico e os relatórios de visita, como no protótipo. A RLS decide **quais** crianças cada um vê (escola: seus alunos; ACS: a microárea; CRAS: o território; PCF: suas famílias). `FAZENDA`, `AUDITOR_TCE` e `DPO` recebem 403.
  - A matriz fica em `secoesDaFicha(perfil)` (shared): seção que o perfil não pode ver sai **ausente** do JSON, nunca `null`. Para recortar por secretaria no futuro, muda-se só a matriz.
- **Lista** (`GET /fichas?busca=&filtro=`): uma consulta SQL só, dentro de `comoUsuario`; motivos de visita pelo shared (`motivosVisitaCrianca`); ordem pela necessidade (motivos × 10 + notificação aberta × 5); filtros do protótipo (precisam de visita, com notificação, 0 a 3 anos, educação especial); busca por código `CI-<id>`, iniciais, quadra ou escola, nunca por nome. Devolve os 40 primeiros e o total.
- **Ficha** (`GET /fichas/:id`): iniciais, idade, CPF **mascarado**, endereço (quadra, lote, setor), motivos, notificação aberta, blocos, linha do tempo (matrícula, CadÚnico, visita do ACS, PAIF, Criança Feliz + eventos da trilha dos casos) e relatórios de visita (`casos.visita` + pareceres). Faltas seguidas pela mesma regra do job de infrequência (dias letivos antes de hoje). Com o seed, responde em cerca de 0,3 s.
- O botão "Encaminhar à Assistência" usa `POST /casos/encaminhamentos` (P11).

### 3.9 Ciclos de vida

- **Primeira infância (0 a 6)**: vacinação, pré-natal, creche 0–3, pré-escola 4–5, Criança Feliz, crianças de 0 a 3 no CadÚnico sem creche e sem PCF.
- **Vagas de creche**: crianças de 0 a 3 estimadas pelo SINASC (4 coortes), vagas, fila, cobertura, déficit para a meta (padrão 50%, PNE), simulação de nova unidade, prioridade = déficit × (1 + índice médio do setor).
- **Educação inclusiva**: necessidade de AEE, sala de recursos, APAE, BPC, sem atendimento.
- **EJA**: público potencial, sem alfabetização, matrículas, frequência, evasão, convites (CRAS, escola dos filhos, SCFV).
- **Pessoa idosa (60+)**: mora sozinha, BPC, acamada, vacina da gripe, crônico acompanhado, SCFV, última visita do ACS.

### 3.10 Índice de vulnerabilidade municipal (IVM)

Por quadra, de 0 a 1. Cinco dimensões normalizadas (0 a 1) e pesos configuráveis (aprovados pelo Comitê, versionados):

| Dimensão | Fonte | Peso padrão |
| --- | --- | --- |
| Renda (famílias com renda per capita até a linha do PBF) | CadÚnico | 30 |
| Saúde (vacina atrasada, pré-natal inadequado) | e-SUS | 20 |
| Escola (fora da escola, infrequência) | Educação | 20 |
| Condição do imóvel (saneamento, material) | Censo | 15 |
| Regularização (lotes sem titulação) | Fazenda/Reurb | 15 |

`IVM = Σ(dim × peso) / Σ(peso)`. Faixas: baixa < 0,35 ≤ moderada < 0,50 ≤ alta < 0,65 ≤ muito alta. Nos limites exatos vale esta regra; o protótipo usa `>` e diverge.

### 3.11 Indicadores e controle externo (`indicadores`)

Snapshots mensais e por vigência, por território, desidentificados, com supressão de contagens < 5.
Objetivos estratégicos OE1 a OE6 (ver Plano Estratégico): encaminhamento em até 30 dias, vacinação 0–6, creche 0–3, condicionalidades do PBF, domicílios com precisão de lote ou melhor, relatórios entregues, acessos registrados.
Gasto × resultado: despesa liquidada por programa (Portal da Transparência, API Publica-RO) × indicador associado.
Relatório semestral ao TCE-RO em PDF e XLSX.

Como ficou (P16, ADR 0015):

- **Job `INDICADORES`** (dia 1 às 3h, fecha o mês anterior; `pnpm --filter @sii/worker indicadores:rodar [data]`).
  - Grava `indicadores.indicador_snapshot` para o município (`MUN`) e cada setor, por mês (`AAAA-MM`) e, para o Bolsa Família, por vigência (`AAAA-V1`/`V2`).
  - Contagem de pessoas de 1 a 4 esconde numerador, denominador e valor.
- **Os 8 indicadores do protótipo:**
  - OE1: casos encaminhados em até 30 dias;
  - OE2: vacinação em dia de 0 a 6 anos e creche de 0 a 3 anos;
  - OE3: acompanhamento de educação e de saúde do Bolsa Família (*proxies* a confirmar);
  - OE4: domicílios com ponto de lote ou melhor;
  - OE5: relatórios semestrais entregues;
  - OE6: acessos a dado pessoal registrados.
- **Metas e linhas de base versionadas** em `indicadores.meta_indicador`. A CTI e o Comitê mudam pela API, o que cria uma versão nova.
  - Situação: em dia (atingiu a meta), em evolução (na trajetória linear da base à meta) ou abaixo do esperado.
- **Gasto × resultado:** despesa liquidada por programa em `indicadores.despesa_programa`. Entra de dois jeitos:
  - pelo conector do Portal da Transparência (contrato em `apps/worker/config/transparencia/contrato.json`, desligado sem `TRANSPARENCIA_URL`);
  - pelo CSV `DESPESA` enviado pela Fazenda em `/cargas`.
- **Tela "Controle externo"** (`/controle-externo`; CTI, Comitê e auditor), como no protótipo:
  - KPIs e a tabela dos objetivos com linha de base, atual, meta e situação (CSV);
  - gasto × resultado;
  - trilha de evidências com "Verificar a trilha" (código do caso + código verificador);
  - registro de acessos (o auditor vê só a contagem);
  - relatório semestral em PDF e XLSX.
- **Relatório semestral** (`GET /indicadores/relatorio?semestre=&formato=pdf|xlsx`).
  - Traz indicadores com linha de base, atual e meta, gasto × resultado, contagem de acessos e o anexo dos casos encerrados com o código verificador.
  - Cada geração fica registrada com o sha256. A CTI marca a entrega, que conta no OE5.
- **O auditor lê pelo papel `sii_auditor`:** só o schema `indicadores` e as funções de trilha (`verificar_trilha_codigo`, `trilhas_encerradas`), que nunca devolvem pessoa nem `dados` do evento.

### 3.12 Auditoria (`auditoria`)

`AcessoDadoPessoal`: quem, perfil, quando, registro, campo revelado, finalidade, IP.
`LogCarga`: fonte, início, fim, registros lidos, inseridos, rejeitados, erro.
O DPO tem painel próprio de acessos.

Como ficou (P12, ADR 0011):

- `POST /fichas/:id/revelar-cpf` (todo perfil nominal, decisão de 17/11/2026): finalidade obrigatória (`RevelarCpf`, shared) de uma lista (contato com a família para matrícula, encaminhamento à rede de proteção, atualização cadastral, atendimento ao titular) ou "Outra" com descrição de 10 caracteres ou mais. Sem finalidade → 422.
- Ordem: confere pela RLS que o usuário vê a ficha → **grava `acesso_dado_pessoal`** (usuário, perfil, pessoa, registro `CI-<id>`, campo, finalidade, IP) → só então decifra. Fora do escopo → 404, sem registro.
- Painel do DPO (`GET /auditoria/acessos`, tela `/acessos`; DPO e CTI): filtros por período e login, paginado, sem o número revelado.

Como ficou (P16, ADR 0015):

- **Filtros e exportação:** filtro por código da ficha (`CI-123`), login e período, gravados na URL; exportação CSV (`GET /auditoria/acessos.csv`), sem o número revelado.
- **Por CPF** (atendimento ao titular): só em `POST /auditoria/acessos/por-cpf`, com o CPF no corpo.
  - A busca é pelo hash; o número não vai para URL nem log.
  - A própria consulta do DPO fica registrada como acesso.
- **Verificar a trilha:** `POST /auditoria/verificar-trilha` (CTI, Comitê, auditor, DPO) confere a cadeia de hashes e compara o código verificador. Devolve só o tipo e a data de cada evento.

## 4. Regras de negócio (implementar em `packages/shared`, com testes)

### 4.1 Infrequência → notificação ao CRAS

- Gatilho: **5 dias letivos consecutivos** com falta não justificada, pelo calendário da escola.
- Contagem pelo calendário escolar e pelo lançamento (decisão de 11/11/2026):
  - só os dias letivos da escola contam;
  - feriado, recesso e fim de semana não somam nem quebram a sequência;
  - só falta lançada soma;
  - presença, falta justificada ou dia letivo **sem lançamento** encerram a sequência;
  - frequência lançada em dia que não é letivo é ignorada.
- Ação: cria `Caso(INFREQUENCIA)` + `Notificacao` para o CRAS do território do domicílio do aluno; evento na ficha; aviso à escola.
- Idempotência: um caso aberto por aluno; novas faltas atualizam o motivo, não criam outro caso.
- Prazo do parecer: **5 dias úteis**. A escala é a mesma da busca ativa, contada em dias úteis (decisão de 11/11/2026):
  - faltando 3 dias úteis ou menos → nível 1 (aviso);
  - vencido → nível 2 (coordenação da Assistência);
  - vencido há mais de 7 dias úteis → nível 3 (pauta do Comitê).
- Dias úteis: de segunda a sexta, sem os feriados.
- Parecer emitido → notifica a escola e a SEMED; o caso fecha, exceto quando o desfecho é `ENCAMINHADO_CONSELHO_TUTELAR` ou há nova visita programada.
- **Caso encerrado e o aluno ainda faltando** (decisão de 17/11/2026): o caso encerrado não conta como aberto. Com 5 ou mais faltas seguidas, o job abre outro caso na execução seguinte.
- **Job diário** (P10, ADR 0009):
  - roda de segunda a sábado às 6h (Porto Velho) e conta até o último dia letivo **antes** de hoje;
  - o destino é o CRAS de referência da pessoa; senão, o território do CRAS que contém o domicílio; senão, o único CRAS do município;
  - cada execução aparece em /cargas como "Conferência diária das faltas", só com contagens;
  - para rodar na hora ou reprocessar uma data: `pnpm --filter @sii/worker infrequencia:rodar [AAAA-MM-DD]`.

### 4.2 Busca ativa escolar

- Gatilho: pessoa de 4 a 17 anos, residente, sem matrícula ativa na rede municipal **nem** na estadual (SEDUC).
- Prazos contados do alerta: identificado → encaminhado em **5 dias**; encaminhado → visita em **20 dias**; visita → matrícula em **30 dias**; não localizado → comunicar o Conselho Tutelar em **30 dias**.
- Escalonamento: faltando 3 dias ou menos → nível 1 (aviso ao responsável); vencido → nível 2; vencido há mais de 7 dias → nível 3 (pauta do Comitê).

Como ficou (P13, ADR 0012):

- **Job diário** (`apps/worker/src/educacao/busca-ativa.ts`, fonte `BUSCA_ATIVA` na fila `cargas`, `BUSCA_ATIVA_CRON` 6h15, `busca-ativa:rodar [data]`):
  - abre o caso (`criarCaso`, etapa `IDENTIFICADO`, secretaria SEMED, aviso à SEMED) para quem tem 4 a 17 anos, domicílio no município, nenhuma matrícula ativa e nenhum caso aberto (`deveAbrirBuscaAtiva`, shared);
  - origem do alerta pelos vínculos da pessoa: CadÚnico, depois e-SUS, depois Censo Municipal;
  - fecha como `MATRICULADO` o caso aberto de quem ganhou matrícula ativa (evento `DESFECHO`);
  - **não reabre por 180 dias** o caso de quem foi comunicado ao Conselho Tutelar (senão voltaria no dia seguinte).
- **Etapas** (decisão de 17/11/2026, `proximaEtapa` e `quemPode` no shared): a SEMED (e o Comitê e a CTI) encaminha à secretaria responsável (SEMED, Assistência ou Saúde); a visita é registrada pela secretaria do caso (SEMED; CRAS ou ponto focal da Assistência; coordenação da Saúde ou ACS), com relato sem CID, e leva a `VISITA_REALIZADA` ou `NAO_LOCALIZADO`; a SEMED registra a matrícula (cria a matrícula e fecha o caso) ou comunica o Conselho Tutelar (fecha o caso). Etapa errada → 409; perfil errado → 403. Tudo na trilha.
- **Painel** (`/busca-ativa`): KPIs, funil e origem com as fórmulas do protótipo; com o seed recém-criado, os números batem com o protótipo (o teste confere). "Encaminhados em até 30 dias" é calculado (no protótipo era fixo em 88%). O auditor vê só os números, com contagens menores que 5 suprimidas. Exportação CSV com iniciais, sem CPF nem nome.
- Rodar o job no seed abre os casos das crianças "Fora da escola" das fichas, como aconteceria em produção (decisão de 17/11/2026).

### 4.3 Motivos de visita (criança)

Fora da escola (4 a 17) · 5 ou mais faltas seguidas · vacinação atrasada · sem visita do ACS há mais de 90 dias · Criança Feliz sem visita há mais de 14 dias · necessidade de AEE sem atendimento · 0 a 3 no CadÚnico sem creche e sem Criança Feliz.

### 4.4 Motivos de visita (pessoa idosa)

Mora sozinha · sem visita do ACS há mais de 90 dias · acamada · BPC sem acompanhamento do CRAS · sem vacina da gripe · condição crônica sem consulta no semestre. Lista prioritária: 3 ou mais motivos.

### 4.5 Máscaras

CPF `***.456.789-**`; NIS com o 4º ao 7º dígito, `***.4567*.**-*` (decisão de 11/11/2026); número com tamanho errado vira máscara cheia; nome em iniciais nas listas (`M. S. O.`); nome completo só na ficha, para perfil autorizado.

## 5. Integrações (worker)

| Fonte | Como | Frequência | Observação |
| --- | --- | --- | --- |
| e-SUS APS PEC | PostgreSQL somente leitura (porta e banco a confirmar; costuma ser 5433/`esus`) | Diária, 2h | Ler por views; falhar visível se o schema mudar após atualização do PEC |
| CadÚnico | Upload do CSV do CECAD ou do Portal de Gestão pela Assistência | Mensal | Validar layout pelo dicionário do MDS; guardar mês de referência |
| SICON, Presença, PBF na Saúde | Upload de relatório exportado (CSV/XLSX) | Por vigência | |
| Gestão escolar | Importação CSV até existir o módulo próprio | Diária | Frequência por aluno e dia |
| SEDUC-RO | Upload CSV | Semestral | Residentes matriculados na rede estadual |
| SINASC | Upload CSV | Mensal | |
| Cadastro imobiliário | Firebird somente leitura (`node-firebird`) | Diária | Inscrição, lote, logradouro, uso |
| Protocolo (Pública) | Firebird somente leitura | Diária | Processos da Reurb (assunto 325) e encaminhamentos oficiais |
| Portal da Transparência | API REST (Publica-RO, Swagger em `/api/doc`) | Diária | `/api/despesas`, `/api/receitas` |
| Geoportal / malha cadastral | `ogr2ogr` para PostGIS (script em `infra/`) | Sob demanda | Exigir .shp, .shx, .dbf e .prj |

Padrão de toda carga: arquivo ou consulta → schema `stg_<fonte>` (bruto, com `carga_id`) → validação → ligação de pessoas → tabelas de domínio. Cada carga grava `LogCarga` e alerta a CTI em caso de falha.

Como ficou (P08, ADR 0007):

- **Caminho do upload:**
  - o web envia para `POST /cargas`;
  - a API guarda o arquivo no MinIO (bucket `sii-cargas`, chave `<fonte>/<carga>.csv`, nunca o nome original), cria o `LogCarga` e põe o job na fila BullMQ `cargas`, que leva só o id;
  - o worker processa.
- **O arquivo original sai do MinIO quando a carga termina**, com sucesso, rejeição ou falha definitiva (decisão de 12/11/2026). Ficam só os dados cifrados e o `LogCarga`. Para recarregar, a Assistência envia de novo.
- **Layout:**
  - o dicionário de cada fonte fica num arquivo de configuração (`apps/worker/config/dicionarios/`);
  - coluna obrigatória faltando → carga `REJEITADA`, com mensagem que cita o nome oficial da coluna, e nada é gravado;
  - a carga detecta sozinha a codificação (UTF-8 ou Windows-1252) e o separador.
- **Erros por linha** ficam em `auditoria.erro_carga`, com mensagem fixa e **sem o valor da célula**. Linha com erro não entra; com aviso, entra sem o dado (por exemplo, CPF com dígito errado).
- **Staging:** `stg_cadunico.pessoa` guarda a linha bruta **sem CPF e sem NIS**, e só das 3 últimas cargas.
- **Vínculo:** o vínculo do CadÚnico usa como id o HMAC do NIS. O NIS em texto nunca é gravado.

Como ficou o e-SUS PEC (P09, ADR 0008):

- **Leitura direta, somente leitura:** usuário só com SELECT, sessão `read_only` e transação `READ ONLY` numa foto só. Configuração `ESUS_PEC_*` no `.env`; sem ela, a carga noturna não é agendada.
- **Contrato de estrutura** em `apps/worker/config/esus/contrato.json`. Antes de ler, a carga confere tabelas e colunas. Se a estrutura mudou, a carga fica `FALHOU` com a coluna que sumiu, não grava nada, e a CTI vê uma faixa de alerta em /cargas até a próxima carga dar certo.
- **Noturna às 2h** (BullMQ), incremental desde a última carga, com uma completa por semana. Gravação numa única transação.
- **Dry-run:** `pnpm --filter @sii/worker esus:dry-run` lista as contagens por tabela sem gravar nada.
- **Microárea:** o número do PEC vira a área do Geoportal pela tabela `config/esus/microareas.json`, mantida pela CTI.

## 6. App mobile (Expo)

Usuários: `ACS`, `CRAS_TECNICO`, `VISITADOR_PCF` e agentes de busca ativa.

1. **Login** com o mesmo auth da API (refresh token no secure store) e PIN local para reabrir offline.
2. **Minha carteira**: lista de visitas do dia, ordenada por prioridade (motivos de visita, prazos), filtrável por quadra.
3. **Mapa**: setores, quadras e equipamentos em GeoJSON cacheado; pontos das famílias da carteira; navegação até o lote.
4. **Ficha resumida** da pessoa ou família (só o que o perfil vê).
5. **Registrar visita** (offline): tipo, quem foi atendido, situação encontrada, encaminhamentos, ponto GPS com precisão, confirmação do pino.
6. **Parecer do CRAS** (perfil `CRAS_TECNICO`): o mesmo formulário do web.
7. **Sincronização**: fila local com chave de idempotência; indicador de pendências; reenvio automático ao voltar o sinal.
8. **Notificações push** sem dado pessoal.

## 7. Requisitos não funcionais

- Disponibilidade em horário de expediente; backup diário do PostgreSQL com retenção de 30 dias e teste de restauração mensal.
- Tempo de resposta: listas < 1 s com 10 mil registros; ficha < 1,5 s.
- Funcionar em celular simples e conexão ruim (skeletons, paginação no servidor, payloads pequenos).
- Observabilidade: logs estruturados sem dado pessoal, métricas de fila e de carga, health checks.
- Hospedagem em infraestrutura do município; dados não saem do município.

Como ficou o web (P14, ADR 0013):

- **Layout institucional** do protótipo: faixa do órgão, marca SII, usuário e "Sair", seletores de **Território** e **Período** no cabeçalho (gravados na URL e levados pelos links do menu) e menu lateral agrupado (Acompanhamento, Ciclos de vida, Território, Gestão). No celular, o menu abre numa gaveta.
- **Menu só com telas prontas**, filtrado pelo perfil com as mesmas listas de perfis das rotas da API (decisão de 17/11/2026). Quem não tem a Visão geral (DPO, Fazenda) entra direto na sua primeira tela.
- **Componentes base** (`apps/web/src/components/ui/`): Botão, Card, Kpi, Pill (um mapa de tons para situação e prazo), Estado (carregando, vazio, erro, sem permissão, sucesso), Barras, GraficoLinha (com tabela alternativa), CabecalhoPagina e Tabela (TanStack Table: busca, ordenação com `aria-sort`, paginação, exportação CSV). Todas as telas foram migradas para eles.
- **Visão geral** (`/`, `GET /painel/visao-geral?territorio=&periodo=`): pessoas, famílias e domicílios; casos abertos (e com mais de 30 dias); rematrículas no ano; vacinação em dia de 0 a 6 anos; domicílios com ponto preciso; casos abertos e resolvidos por mês (12 meses); "Precisa de atenção"; casos por responsável e por território; pauta do Comitê. Perfis nominais contam pela RLS; o auditor vê os números com contagens menores que 5 suprimidas.
- Fichas, busca ativa e pauta respeitam o território do cabeçalho.
- **Acessibilidade verificada no Playwright**: axe (WCAG 2.1 AA) sem violação crítica nem séria em todas as telas do menu e na tela de entrar; navegação por teclado (atalho para o conteúdo, menu, filtros); em 360 px nenhuma tela rola para o lado.

Como ficou o mapa (P15, ADR 0014):

- **Tela Território** (`/territorio`): MapLibre GL JS só com as camadas do SII (limite, setores, quadras, lotes, ruas e equipamentos do geoportal), **sem mapa de fundo de terceiros** (decisão de 18/11/2026).
- **As 7 camadas do protótipo:**
  - índice de vulnerabilidade;
  - calor de crianças de 0 a 3 anos;
  - Criança Feliz (visita em dia ou atrasada há mais de 14 dias);
  - calor de pessoas idosas sozinhas sem visita do ACS há mais de 90 dias;
  - casos de busca ativa;
  - situação dos lotes;
  - precisão do ponto (fonte predominante da quadra).
  
  As classes e legendas estão em `packages/shared/src/mapa/camadas.ts`.
- **Troca de camada no navegador:**
  - um pedido (`GET /mapa/quadras?territorio=`) traz os indicadores de todas as camadas;
  - trocar de camada não vai ao servidor. Com o seed, a nova camada aparece em 20 a 37 ms, mesmo sem GPU.
- **Detalhe da quadra** (`GET /mapa/quadras/:id`): indicadores, lotes com a situação e, para perfis nominais, quem mora em cada lote (iniciais, idade, sinais e link para a ficha; nome e CPF só na ficha).
- **Pontos e agregados:**
  - pontos dos mapas de calor e do Criança Feliz (`GET /mapa/pontos`): só para perfis nominais, pela RLS, só com coordenadas;
  - AUDITOR_TCE e FAZENDA veem só números por quadra, com "< 5", e o calor sai do centro da quadra sem as quadras com 1 a 4 pessoas.
- **Lista de quadras** com busca e ordenação pela camada: é a alternativa ao mapa pelo teclado.
- **Zona rural:** domicílios, escolas, localizados por SIGEF/CAR e baixa precisão.

## 8. Fases

Situação em 18/11/2026: fases 1 e 2 concluídas (P01 a P13); fase 3 concluída (P14 a P16); próximo P17 (app mobile). Detalhe em `docs/ANDAMENTO.md`.

1. Fundação: monorepo, infra, auth, perfis, auditoria, território (Geoportal), geocodificação, identidade, seed fictício.
2. Integração social: e-SUS, CadÚnico, gestão escolar, SEDUC; infrequência → notificação → parecer; ficha da criança; busca ativa com prazos.
3. Controle externo: indicadores, painel do TCE, trilha, gasto × resultado, relatório semestral.
4. Ampliação: app mobile completo, primeira infância, Criança Feliz, vagas de creche, inclusiva, EJA, pessoa idosa, IVM, Reurb.

## 9. Pendências abertas

- ~~Nomes e atributos das camadas do Geoportal~~ resolvido em 11/11/2026 (ver 3.1.1). Continuam faltando: malha de quadras e lotes da Fazenda, códigos INEP/CNES e nomes completos dos equipamentos, território do CRAS.
- Porta, banco e versão do e-SUS PEC; credenciais somente leitura.
- **e-SUS PEC (P09, a confirmar com a Saúde):**
  - os nomes de tabela e coluna em `apps/worker/config/esus/contrato.json`, os valores dos campos `st_*` e o código da vacina da influenza (rodar `esus:dry-run` contra o PEC de Itapuã);
  - a regra de **vacinação em dia** e de **pré-natal adequado** (hoje ficam sem valor) e de **necessita atendimento especializado**;
  - a tabela de microáreas (`config/esus/microareas.json`): CNES + número da microárea → área do Geoportal.
- **CadÚnico (P08, a confirmar com a Assistência):**
  - os nomes das colunas em `apps/worker/config/dicionarios/cadunico.json`, montados pelo layout conhecido do CECAD, precisam ser conferidos com o dicionário oficial do MDS;
  - as linhas de renda usadas quando o arquivo traz só a renda: R$ 109 (extrema pobreza), R$ 218 (pobreza) e R$ 759 (½ salário mínimo de 2025; conferir o de 2026).
- Domínio e servidor de produção; política de backup da CTI.
- Pesos do IVM e metas a aprovar pelo Comitê Gestor.
- Sistema de gestão escolar atual da SEMED (integrar ou substituir).
- **Educação (P10, a confirmar com a SEMED e a SEDUC-RO):**
  - os layouts de `apps/worker/config/dicionarios/gestao-escolar.json` e `seduc.json` são próprios do SII; trocar pelos nomes reais quando chegar o primeiro arquivo;
  - ~~o "aviso à escola" da infrequência~~ resolvido no P11 (avisos internos).
- **Casos (P11):**
  - e-mail dos avisos: depende de um servidor SMTP da Prefeitura (o texto já não tem dado pessoal);
  - pauta fechada por reunião do Comitê (ata, casos daquele dia) para prestação de contas.
- **Ficha da criança (P12):**
  - Conselho Tutelar na ficha vem só dos casos (evento `ENCAMINHADO_CONSELHO_TUTELAR`); falta a fonte do próprio Conselho;
  - recorte de campos por secretaria fica desligado por decisão de 17/11/2026 (matriz pronta em `secoesDaFicha`).
- **Busca ativa (P13):**
  - quarentena de 180 dias depois do Conselho Tutelar: confirmar o prazo com a SEMED e o Conselho;
  - "residente" hoje é ter domicílio cadastrado; quem mudou de município precisa de baixa na fonte.
- **Indicadores e controle externo (P16):**
  - URL, parâmetros e campos da API do Portal da Transparência (Publica-RO) em `apps/worker/config/transparencia/contrato.json`; até lá, a despesa entra pelo CSV da Fazenda (layout próprio do SII em `config/dicionarios/despesa.json`);
  - regra oficial do acompanhamento de educação e de saúde do Bolsa Família (hoje: frequência ≥ 85% de 6 a 17 anos e vacinação em dia de 0 a 6 anos de família PBF);
  - associação programa → indicador do gasto × resultado e as metas do Plano Estratégico (o seed usa as do protótipo);
  - primeiro semestre com relatório devido ao TCE (hoje `2026-S1`).
