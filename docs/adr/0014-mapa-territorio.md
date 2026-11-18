# 0014 · Mapa do Território com MapLibre

Data: 18/11/2026 · Situação: aceita · Prompt: P15

## Contexto

O P06 já servia as camadas de território em GeoJSON (setores, quadras com IVM, lotes, equipamentos), mas o web não tinha mapa. O P15 pede a tela Território com MapLibre GL JS:
- as 7 camadas do protótipo;
- o detalhe da quadra com os lotes e quem mora em cada um, respeitando o perfil;
- mapa de calor sem ponto individual para o AUDITOR_TCE (só agregados por quadra, com supressão < 5).

Critérios de aceite:
- troca de camada em menos de 300 ms com o seed;
- mapa utilizável pelo teclado (lista de quadras como alternativa).

## Decisões

1. **Sem mapa de fundo de terceiros** (decisão do usuário, 18/11/2026).
   - O estilo do MapLibre só tem as camadas do SII: limite, setores, quadras, lotes, ruas do geoportal e equipamentos.
   - Nenhum pedido sai para servidor externo e tudo funciona na rede interna.
   - Sem servidor de fontes, os equipamentos são marcadores HTML com letra (E, S, A).
2. **Moradores no detalhe: iniciais, idade e sinais** (decisão do usuário).
   - Os sinais são criança, Criança Feliz, pessoa idosa ou idosa sozinha, precisa de visita e busca ativa, mais o link para a ficha (0 a 17 anos).
   - Nome e CPF ficam só na ficha.
3. **Um pedido com os indicadores de todas as camadas** (`GET /mapa/quadras`).
   - Trocar de camada não vai ao servidor: muda o `feature-state` das quadras e a expressão de cor (`setPaintProperty`), ou mostra a camada de calor ou de pontos.
   - As classes e legendas ficam no shared (`mapa/camadas.ts`: `classeQuadra`, `LEGENDA_CAMADA_MAPA`, `valorCamada`), com 100% de cobertura.
4. **Pontos individuais só para perfis nominais.**
   - `GET /mapa/pontos` roda por `comoUsuario`: a RLS recorta o escopo (o ACS vê só a microárea dele).
   - A resposta só tem coordenadas, com 5 casas decimais, e o atraso do Criança Feliz. Nenhum id, idade ou nome.
5. **Agregado para AUDITOR_TCE e FAZENDA.**
   - Os números vêm pelo cliente dono, com `suprimirIndicadores`: contagens de pessoas e domicílios de 1 a 4 viram "< 5". Lotes não são dado pessoal e não são suprimidos.
   - O calor sai do centro de cada quadra, com peso igual à contagem já suprimida. Quadra com 1 a 4 pessoas fica de fora do calor, para não apontar onde estão poucas pessoas.
   - `/mapa/pontos` responde 403 para esses perfis. O detalhe da quadra vem sem moradores.
6. **"Precisa de visita" é o mesmo da ficha.** O mapa reaproveita `consultaFichas` e `avaliar` (P12), para o número da quadra bater com a lista de fichas.
7. **Lista de quadras como alternativa ao mapa.** É uma `Tabela` com busca, ordenada pelo valor da camada, e o botão "Ver quadra" abre o detalhe com o foco no título. O mapa tem `role="region"` e um rótulo que aponta para a lista.
8. **Medida da troca de camada.**
   - A medida vai da troca até o quadro com a camada nova chegar à tela: o `render` do MapLibre e mais um `requestAnimationFrame`. O valor fica gravado em `data-troca-ms`.
   - Com o seed, no Chrome sem GPU (WebGL por software), a troca leva de 20 a 37 ms.
   - Até o mapa ficar parado (`idle`, em `data-parado-ms`) leva de 190 a 310 ms nessa mesma máquina sem GPU. O `idle` não é o critério, porque espera trabalho que não muda o que aparece na tela.
9. **Dependência nova:** `maplibre-gl` 5.24.0, prevista na stack do CLAUDE.md e fixada numa versão com mais de duas semanas.
10. **E2E com geometria.**
    - O preparo do E2E carrega o geoportal no banco de teste.
    - O Redis do E2E usa o banco lógico `/1`, para o cache `geo:*` do dev não vazar para o teste: os ids das quadras mudam a cada seed.

## Consequências

- **Lista de quadras sem geometria.** `consultaQuadras(false)` lista também as quadras ainda sem geometria, para a lista e os números funcionarem antes da malha da Fazenda. O GeoJSON do mapa continua só com as que têm geometria.
- **Id na camada de quadras.** O GeoJSON das quadras ganhou a propriedade `id` (`promoteId` no MapLibre), e a camada `ruas` passou a ser servida.
- **Correção na `Tabela`.** O contêiner que rola ganhou `position: relative`. Sem isso, o texto `sr-only` de dentro das células escapava do contêiner e alargava a página em 360 px.
- **Tokens novos.** A escala dos mapas ganhou os tokens `--color-mapa-1` a `--color-mapa-6`, iguais aos do protótipo, também no espelho TS.
