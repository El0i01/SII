# 0007 · Padrão de carga e carga do CadÚnico

Data: 12/11/2026 · Situação: aceita · Prompt: P08

## Contexto

A §5 define o padrão de toda carga: arquivo ou consulta → `stg_<fonte>` com `carga_id` → validação →
ligação de pessoas → domínio, com `LogCarga`. A primeira fonte é o CadÚnico, nos dois formatos:
- o CSV do CECAD;
- a base completa do Portal de Gestão.

Critérios de aceite:
- 5 mil linhas em menos de 2 min;
- coluna faltando é rejeitada com mensagem clara;
- nenhuma linha com CPF vai para log.

## Decisões

1. **O worker usa o código da API por caminho relativo.** Importa de `apps/api/src`:
   - o cliente Prisma gerado;
   - `cripto/cifra.ts`;
   - `pessoas/ligacao.ts`;
   - `cargas/armazenamento.ts`.

   O CLAUDE.md pede o mesmo Prisma e a mesma `LigacaoPessoas` em toda carga, e copiar o código abriria
   espaço para divergência. Como funciona:
   - o `tsconfig.build.json` do worker tem `rootDir: ".."`, e a saída fica em `dist/worker/src` e
     `dist/api/src`;
   - o `turbo.json` do worker depende de `@sii/api#db:generate`.

   Se o worker crescer, isso vira um pacote `@sii/banco`.
2. **Caminho do arquivo:**
   1. `POST /cargas` (multipart, em memória, no máximo 100 MB), só para `ADMIN_CTI` e o perfil novo
      `ASSISTENCIA_GESTOR`;
   2. a API grava o arquivo no MinIO com a chave `<fonte>/<id>.csv` (o nome original pode ter dado
      pessoal, então fica só no `LogCarga.arquivo`, para a tela);
   3. o `LogCarga` é criado `AGUARDANDO`;
   4. o job BullMQ `cargas` leva **só `{ cargaId }`**, com 3 tentativas e espera exponencial.

   O worker consome com concorrência 1, porque duas cargas ao mesmo tempo disputariam a ligação de
   pessoas.
3. **O arquivo sai do MinIO quando a carga termina** (decisão do usuário, 12/11/2026): com sucesso,
   rejeição ou falha na última tentativa. `LogCarga.objeto` vira `null`.
4. **Pipeline genérico** (`apps/worker/src/cargas/pipeline.ts`):
   - as etapas são `BAIXANDO` → `LAYOUT` → `STAGING` → `LIGACAO` → `FIM`, e o progresso é gravado a
     cada 250 linhas;
   - `RejeicaoCarga` vira `REJEITADA`, com a mensagem para a tela;
   - outra exceção vira `AGUARDANDO` (nova tentativa) ou, na última, `FALHOU`, com mensagem genérica;
   - **o log do processo recebe só id, contagens e o nome do tipo do erro.** A mensagem do erro pode
     trazer valores de coluna vindos do banco, por isso não é logada.
5. **Shared** (`packages/shared/src/cargas/`, puro, 100% das linhas):
   - codificação: UTF-8 estrito, senão Windows-1252, retirando o BOM;
   - separador: o mais frequente fora de aspas entre `;`, `,`, tab e `|`;
   - CSV no formato RFC 4180, com o número da linha;
   - conferência do cabeçalho pelo dicionário;
   - CPF e NIS com dígito verificador, completando os zeros que o Excel tira;
   - conversão da linha do CadÚnico, com mensagens fixas.
6. **Dicionário em arquivo de configuração** (`apps/worker/config/dicionarios/cadunico.json`):
   - cada campo tem os nomes aceitos (CECAD com `p.`/`d.` e Portal) e diz se é obrigatório;
   - `algumDe` aceita a faixa `fx_rfpc` **ou** a renda per capita;
   - `linhasRenda` traz as linhas de renda;
   - um campo obrigatório faltando gera a mensagem com o nome oficial da coluna.

   **Os nomes das colunas e as linhas de renda ainda precisam ser confirmados** com o dicionário oficial
   do MDS e com a Assistência.
7. **Regras da linha:**
   - **erro descarta a linha:** código familiar, nome ou nascimento vazios ou inválidos, NIS com DV
     errado, faixa de renda ausente;
   - **aviso carrega a linha sem o dado:** CPF com DV errado.
   
   Os problemas ficam em `auditoria.erro_carga`, no máximo 1.000 por carga, com o total nos contadores.
8. **Staging** `stg_cadunico.pessoa`:
   - é criado pelo worker, porque os schemas `stg_*` ficam fora do Prisma;
   - guarda a linha bruta **sem CPF e sem NIS**, só se tinha;
   - mantém as 3 últimas cargas;
   - não tem grant para os papéis da aplicação.
9. **Domínio, família por família numa transação:**
   1. `LigacaoPessoas.ligar` de cada membro, com `fonte = CADUNICO` e `cargaId`;
   2. upsert da `Familia` pelo código familiar;
   3. `MembroFamilia` com o papel tirado do parentesco;
   4. `CadunicoFamilia` do mês, com faixa, PBF, quantidade e data de atualização, tirados do
      responsável familiar.

   **Idempotente:** reenviar o mesmo arquivo dá 0 pessoas novas.
10. **O id do vínculo é `N` + HMAC do NIS.** O NIS em texto ficaria em `vinculo_fonte.id_externo`, o que
    a regra "documento só cifrado + hash" proíbe. Sem NIS, o id é `CF<código familiar>-<resumo de nome e
    nascimento>`. `vinculo_fonte.carga_id` registra de que carga veio a ligação.
11. **Desempenho:**
    - sem índice, a busca de candidatos por nome fazia seq scan com `similarity()` em todas as pessoas, e
      a primeira carga de 5 mil levou 102 s;
    - com índice em `data_nascimento` (mais um GIN trigram no nome, para a busca sem nascimento), caiu
      para **25 s**;
    - a recarga do mesmo arquivo leva cerca de 10 s.

## Limites conhecidos

- **Quem saiu da família continua como membro**, porque o CECAD pode exportar um recorte. A
  reconciliação entra quando a base completa do Portal for a fonte oficial.
- **O endereço do CadÚnico ainda não vira domicílio nem `crasCodigo`.** Por isso o `CRAS_TECNICO` ainda
  não vê, pela RLS, as pessoas novas que vieram só do CadÚnico. A geocodificação do endereço fica para
  quando o layout de endereço for confirmado.
- **O arquivo é lido inteiro em memória**, no máximo 100 MB. Isso basta para a base de Itapuã do Oeste;
  se crescer, a leitura passa a ser em fluxo.
- O MinIO usa o usuário root em desenvolvimento. O usuário dedicado e a política de bucket entram no P20.
- **Uma falha técnica no meio da carga deixa gravadas as famílias já processadas.** É seguro, porque a
  carga é idempotente e a nova tentativa completa o resto.
