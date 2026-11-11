# 0005 · Território, grade provisória e geocodificação

Data: 11/11/2026 · Situação: aceita · Prompt: P06

## Contexto

Os shapefiles do geoportal (`~/geoportal_itapua-main(1)/geoportal_itapua-main`) trazem o limite, os setores,
as ruas, os equipamentos e as microáreas de ACS, mas não trazem quadras nem lotes: a malha da Fazenda ainda não
chegou. O seed do P05 cria 79 quadras fictícias, ainda sem geometria. Medi as áreas dos setores reais e
dividi por células de 216 m (o `cell_m` do protótipo): deu 16,4, 18,3, 14,2, 22,0 e 7,2 células, para 16, 18,
16, 24 e 5 quadras no protótipo. A grade do protótipo saiu dos setores reais.

## Decisões

1. **Cadastro de referência separado do seed** (`apps/api/prisma/referencia/cadastro.ts`). Setores,
   equipamentos, escolas e áreas de referência são dado público real, gravado por *upsert* pela chave estável
   (`equipamento.codigo`, `escola.inep`, `tipo + codigo`). O seed não apaga nem recria essas tabelas e por isso
   não perde a geometria do geoportal. As linhas antigas, criadas antes do `codigo`, são adotadas pelo INEP,
   CNES, CadSUAS ou nome.
2. **`pnpm geo:carregar`** (`apps/api/scripts/geo/carregar.ts`) é guiado por `infra/geo/mapeamento.json`:
   - importa cada camada para `stg_geoportal` com o script do P02;
   - grava as geometrias: limite, setores, `SIND` (setor industrial), **zona rural = limite − setores
     urbanos**, os 20 equipamentos pela tabela de mapeamento, as 19 microáreas e os 91 logradouros;
   - gera a grade e posiciona os domicílios;
   - devolve um relatório (feições por camada, equipamentos sem feição, microáreas duplicadas, quadras por
     setor com ângulo e tamanho da célula).
   
   As correções da §3.1.1 ficam no mapeamento, sem editar o shapefile:
   - os arquivos de ACS trocados;
   - a rural `urb9` duplicada, que é unida e registrada no relatório;
   - o `Pontos.shp`, que é LATIN1 sem `.cpg`;
   - os dois `VIGILANCIA`, distinguidos pelo `id`.
3. **Grade provisória** (funções puras em `packages/shared/src/territorio/grade.ts` mais recorte no PostGIS,
   em UTM 20S):
   - ângulo dominante das arestas do setor, por média circular de período 90° ponderada pelo comprimento.
     Deu cerca de 44°, o traçado diagonal da sede;
   - células de 216 m giradas e recortadas pelo setor; ficam as que cobrem pelo menos 25% da célula;
   - o número de quadras de cada setor iguala o do seed: sobrando célula, ficam as maiores; faltando, a
     célula diminui 5% por vez. Nos dados reais, os 5 setores fecharam com 216 m;
   - as quadras recebem as células em ordem de leitura. Cada quadra vira 4 × 3 lotes, como o `lotPos` do
     protótipo: o retângulo orientado da quadra dividido e recortado. Das 79 quadras, saem 942 lotes com
     geometria e 6 vazios, em quadras da borda;
   - tudo fica `provisoria = true`. A malha da Fazenda substitui a grade quando chegar.
4. **Ponto dos domicílios fictícios:** sorteio determinístico (`ST_GeneratePoints` com semente = id) dentro do
   lote; sem lote, dentro da quadra; na zona rural, dentro do polígono rural. Ponto `CONFIRMADO_USUARIO`
   nunca é sobrescrito.
5. **GeoJSON** em `GET /territorio/{limite|setores|quadras|lotes|equipamentos|microareas}.geojson?zoom=`:
   - simplificação com `ST_SimplifyPreserveTopology` por faixa de zoom;
   - cache no Redis por camada e faixa, por 24 h, invalidado pelo `geo:carregar`;
   - nenhuma propriedade traz dado pessoal. As quadras levam o IVM calculado com os pesos vigentes;
   - exige login, e qualquer perfil vê, inclusive o auditor. O mapa de pessoas virá pelos painéis, com RLS.
6. **Geocodificação:**
   - os candidatos de hoje são o ponto confirmado, o lote e o setor. Censo, e-SUS, CNEFE e SIGEF entram com as
     cargas do P08 e do P09;
   - a cascata é a do shared;
   - `POST /domicilios/:id/geocodificar` (ADMIN_CTI);
   - a busca de logradouro é por similaridade trigram sobre o nome normalizado (`normalizarEndereco`),
     opcionalmente restrita ao setor;
   - a limpeza dos pontos do e-SUS (§3.2) é função pura no shared e vai ser aplicada na carga do P09.
7. **Confirmação do pino** (`PUT /domicilios/:id/ponto`):
   - só no próprio escopo: a visibilidade sai da RLS das pessoas do domicílio, via `comoUsuario`, e fora dele
     a resposta é 404;
   - o ponto precisa cair dentro do município, senão 422;
   - grava `CONFIRMADO_USUARIO`, a precisão do GPS e `confirmado_em`.
8. **Relatório de geocodificação** (`GET /territorio/relatorio-geocodificacao`): domicílios por setor e
   fonte, com precisão média e mediana. Contagens abaixo de 5 aparecem como `<5`.

## Conferência

- As áreas dos setores no banco batem com as calculadas pelo GDAL/SpatiaLite direto nos shapefiles originais
  (diferença abaixo de 0,5%). Os centroides da UBS Jacir Boni e da EMEF Dr. Custódio ficam a menos de 1 m do
  shapefile.
- Conferência visual com o satélite de fundo: os setores envolvem a mancha urbana, a grade segue as ruas e os
  equipamentos caem nos prédios.

## Pendências

- Malha de quadras e lotes da Fazenda (vai substituir a grade provisória).
- Pontos do Censo Municipal, do e-SUS Território (com a limpeza), do CNEFE 2022 e do SIGEF/CAR (P08, P09).
