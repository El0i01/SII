# 0016 · Ciclos de vida e índice de vulnerabilidade

Data: 18/11/2026 · Situação: aceita · Prompt: P19

## Contexto

Os painéis de ciclos de vida cruzam dados da base única, da Educação, da Saúde e da Assistência. O painel do IVM e o mapa precisam usar a mesma versão dos pesos.

## Decisões

1. A SEMED cadastra a oferta de vagas de creche por escola e ano. A CTI também pode editar o cadastro. Até a integração do SINASC, as quatro coortes de 0 a 3 anos vêm dos nascimentos registrados na base única. A simulação calcula cobertura, déficit e prioridade por setor.
2. O público potencial da EJA usa a escolaridade do CadÚnico e a matrícula regular. Turmas de EJA são identificadas pelo nome. Os nomes das colunas e os códigos de escolaridade e alfabetização precisam ser validados com o MDS.
3. A primeira infância reutiliza os snapshots de vacinação e cruza CadÚnico, matrícula e Criança Feliz. O indicador de pré-natal aguarda a regra da Saúde.
4. As listas de educação inclusiva e pessoa idosa usam a RLS para respeitar o escopo dos perfis nominais. Para o TCE, a API calcula os agregados no servidor com o cliente do dono do banco, suprime contagens de 1 a 4 nos painéis de ciclos e omite as listas.
5. Apenas o Comitê Gestor aprova uma nova versão dos pesos do IVM. Cada aprovação registra responsável, data e justificativa. Vale a maior versão aprovada. Até a primeira aprovação, valem os pesos da proposta inicial. A aprovação invalida as chaves `geo:quadras:*` no Redis para o mapa recalcular com os novos pesos.

## Consequências

As regras compartilhadas ficam em `packages/shared/src/ciclos/` e `packages/shared/src/indice/`. O seed de desenvolvimento oferece vagas, escolaridade e matrículas de EJA fictícias. A cobertura de creche depende da completude da base única até a chegada do SINASC.
