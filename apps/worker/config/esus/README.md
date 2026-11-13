# Configuração do conector do e-SUS PEC (P09, ADR 0008)

## `contrato.json`

O que o conector lê do banco do PEC. Cada tabela tem o **nome lógico** (usado no código, não muda) e o **nome físico** (no banco do PEC, muda com a versão).

**A CONFIRMAR:** os nomes foram montados pelo modelo de dados conhecido do PEC 5.x. Antes de ligar em produção, a CTI roda `pnpm --filter @sii/worker esus:dry-run` contra o banco do PEC de Itapuã:

- se faltar alguma tabela ou coluna, o dry-run lista exatamente qual;
- corrija o nome físico aqui (não precisa mexer no código).

Regras:

- **Nunca** acrescente coluna de CID, CIAP, diagnóstico, medicamento ou texto livre de atendimento. O SII só recebe sinalizadores (CLAUDE.md, §3.5).
- `colunasCronicas`: colunas do cadastro individual que marcam condição crônica. O PEC devolve só "tem alguma" (um booleano); qual delas nunca sai do PEC.
- `imunobiologicosGripe`: códigos (no PEC) da vacina da influenza, para o sinalizador do idoso.
- Os nomes só aceitam letras minúsculas, números e `_`.

Depois de uma atualização do PEC, se a estrutura mudar, a carga noturna **falha sem gravar nada** e a tela /cargas mostra o alerta para a CTI com a coluna que sumiu.

## `microareas.json`

Tabela de conversão da microárea do PEC (CNES da UBS + número da microárea) para o nome da área no Geoportal, que é o que a RLS usa no escopo do ACS. É a CTI quem edita:

```json
{ "7327862/04": "area04", "7327862/05": "area05" }
```

Microárea sem conversão vai para o sinalizador com o número do PEC, mas não muda o escopo da pessoa. A carga conta essas pessoas como aviso.
