# Especificação — SII · Sistema Integrado Intersecretarial

Versão 0.1 · novembro de 2026 · CTI/SEMED · Itapuã do Oeste/RO
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

### 3.5 Saúde (`saude`), só sinalizadores

Do e-SUS APS PEC (leitura somente leitura), por pessoa: `ubsReferencia`, `microarea`, `acsResponsavel`, `ultimaVisitaAcs`, `vacinacaoEmDia`, `preNatalAdequado` (gestantes), `acamadoDomiciliado`, `condicaoCronicaAcompanhada` (booleano, sem dizer qual), `necessitaAtendimentoEspecializado`.
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

### 3.8 Ficha da criança (`fichas`)

Uma ficha por criança e adolescente (0 a 17), montada a partir da `PessoaMestra`:
identificação (mascarada), endereço (setor/quadra/lote), educação (escola, turma, frequência do mês, faltas seguidas), saúde (UBS, vacinação, última visita do ACS), assistência (CadÚnico, PBF, CRAS, Criança Feliz), proteção e inclusão (Conselho Tutelar, atendimento especializado, APAE, BPC), **motivos de visita**, histórico (linha do tempo de `EventoCaso` + eventos das fontes) e relatórios de visita.

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

### 3.12 Auditoria (`auditoria`)

`AcessoDadoPessoal`: quem, perfil, quando, registro, campo revelado, finalidade, IP.
`LogCarga`: fonte, início, fim, registros lidos, inseridos, rejeitados, erro.
O DPO tem painel próprio de acessos.

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

### 4.2 Busca ativa escolar

- Gatilho: pessoa de 4 a 17 anos, residente, sem matrícula ativa na rede municipal **nem** na estadual (SEDUC).
- Prazos contados do alerta: identificado → encaminhado em **5 dias**; encaminhado → visita em **20 dias**; visita → matrícula em **30 dias**; não localizado → comunicar o Conselho Tutelar em **30 dias**.
- Escalonamento: faltando 3 dias ou menos → nível 1 (aviso ao responsável); vencido → nível 2; vencido há mais de 7 dias → nível 3 (pauta do Comitê).

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

## 8. Fases

1. Fundação: monorepo, infra, auth, perfis, auditoria, território (Geoportal), geocodificação, identidade, seed fictício.
2. Integração social: e-SUS, CadÚnico, gestão escolar, SEDUC; infrequência → notificação → parecer; ficha da criança; busca ativa com prazos.
3. Controle externo: indicadores, painel do TCE, trilha, gasto × resultado, relatório semestral.
4. Ampliação: app mobile completo, primeira infância, Criança Feliz, vagas de creche, inclusiva, EJA, pessoa idosa, IVM, Reurb.

## 9. Pendências abertas

- ~~Nomes e atributos das camadas do Geoportal~~ resolvido em 11/11/2026 (ver 3.1.1). Continuam faltando: malha de quadras e lotes da Fazenda, códigos INEP/CNES e nomes completos dos equipamentos, território do CRAS.
- Porta, banco e versão do e-SUS PEC; credenciais somente leitura.
- Domínio e servidor de produção; política de backup da CTI.
- Pesos do IVM e metas a aprovar pelo Comitê Gestor.
- Sistema de gestão escolar atual da SEMED (integrar ou substituir).
