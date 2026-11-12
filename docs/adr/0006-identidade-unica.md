# 0006 · Identidade única e revisão de vínculos

Data: 11/11/2026 · Situação: aceita · Prompt: P07

## Contexto

A mesma pessoa chega por e-SUS, CadÚnico, gestão escolar, Censo, SEDUC e SINASC. A §3.3 manda testar as
regras nesta ordem:
1. CPF (1,00);
2. CNS ou NIS (0,95);
3. nome + nascimento + mãe com similaridade ≥ 0,92 (0,85);
4. abaixo disso, revisão manual.

Nunca une automaticamente abaixo de 0,85, e toda união ou separação é auditada.

## Decisões

1. **A regra fica no shared** (`packages/shared/src/pessoas/similaridade.ts`), como função pura e testada:
   - **Similaridade:** Jaro-Winkler sobre o nome normalizado (sem acento e sem partículas), depois de
     **expandir as iniciais** pelo nome do outro lado ("Maria S. Oliveira" = "Maria Silva Oliveira").
   - **Pontuação:** `min(nome completo, primeiro nome, mãe)`. O primeiro nome é conferido à parte para separar
     gêmeos (João × José dá 0,73).
   - **CPF diferente nos dois lados descarta o candidato**: gêmeos e homônimos com documento nunca se unem.
   - **Nascimento diferente:**
     - até 31 dias ou dia e mês trocados → pontuação × 0,9, então no máximo vai para revisão;
     - além disso → descartado (homônimos).
   - **Sem a mãe de um lado:** o teto é 0,91, que nunca une sozinho.
   - **Decisão:**
     - CPF → liga;
     - CNS ou NIS → liga;
     - **um único** candidato ≥ 0,92 com nascimento igual e mãe conhecida → liga com 0,85;
     - dois candidatos fortes → revisão (ambíguo);
     - de 0,75 a 0,92 → revisão;
     - abaixo de 0,75 → pessoa nova.
2. **`LigacaoPessoas`** (`apps/api/src/pessoas/ligacao.ts`) é uma classe sem Nest, usada do mesmo jeito pelo
   seed, pela API e pelo worker (P08):
   - **compara documento pelo hash**: o CPF do candidato nunca é decifrado;
   - procura candidatos com `pg_trgm`, por nascimento igual, próximo ou com dia e mês trocados;
   - é idempotente por `(fonte, idExterno)`;
   - só completa o que estiver vazio e nunca sobrescreve documento;
   - a regra `ORIGEM` marca o registro que deu origem a uma pessoa nova;
   - o vínculo guarda os dados de origem (nome, nascimento, mãe, sexo, nunca documento), para permitir separar.
3. **Revisão e união (só `ADMIN_CTI`, decisão de 11/11/2026):**
   - **Aceitar** une o par: a pessoa que já existia absorve a nova;
   - **Rejeitar** marca o par como pessoas diferentes;
   - **Unir** junta dois registros quaisquer;
   - **Separar** desfaz uma união: o registro volta a ser uma pessoa própria.
   
   A união é feita numa transação e move tudo o que referencia a pessoa absorvida:
   - vínculos, família, matrícula e frequência;
   - fila de creche e AEE;
   - BPC, SCFV, Criança Feliz e sinalizador de saúde (os campos são combinados);
   - casos, visitas e revisões.
   
   Os documentos e dados que faltarem passam para a pessoa mantida. Pessoas com **CPFs diferentes não se unem**
   (409).
4. **Auditoria:** cada ação e cada ligação automática por nome vão para `auditoria.evento_identidade` (tipo,
   pessoas, vínculos movidos, usuário, motivo). Só ids, nunca documento.
5. **Na tela, os documentos aparecem mascarados** (CPF `***.456.789-**`, NIS `***.4567*.**-*`). A CTI vê nome,
   nascimento e mãe, que são o que decide se é a mesma pessoa.
6. **Seed:** uma segunda fonte fictícia exercita cada regra:
   - 60 por CPF;
   - 30 por CNS;
   - 25 por nome com a mãe abreviada;
   - 25 com nascimento errado → **25 pares de revisão**;
   - 5 gêmeos, que viram pessoas novas.
   
   Os números do protótipo não mudam.
7. **Web:**
   - primeira tela com login (`/entrar`), com a sessão nos cookies httpOnly da API e sem token no JavaScript;
   - `/identidade/revisao` mostra os dois registros lado a lado, com o que difere destacado em cor **e** em
     texto para leitor de tela;
   - a tela tem os estados carregando, vazio, erro e sem permissão.
   
   O layout completo e o menu ficam para o P14.

## Limites conhecidos

- **Separar não sabe de qual registro vieram matrícula, casos e documentos**, então eles ficam com a pessoa
  original. A CTI corrige o restante à mão.
- **Rejeitar não impede o par de voltar** numa carga futura com outro registro das mesmas pessoas. Uma lista de
  "pares já rejeitados" ficou para quando as cargas reais começassem. No P08 (12/11/2026): a carga do
  CadÚnico é idempotente pelo id do registro, então o mesmo registro não volta à fila. A lista continua
  em aberto para registros novos das mesmas pessoas.
