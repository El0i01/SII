# 0004 · Modelo de dados, cifragem de documentos, trilha e seed

Data: 11/11/2026 · Situação: aceita · Prompt: P05

## Contexto

O P05 modela as entidades das seções 3.1 a 3.12 da especificação, protege CPF, NIS e CNS, torna a
trilha dos casos à prova de alteração e cria o seed fictício que reproduz o protótipo.

## Decisões

### Modelo

1. **Um schema por domínio**: `territorio`, `pessoas`, `educacao`, `saude`, `assistencia`, `casos`,
   `indicadores` e `auditoria`, mais `acesso` (P03) e `sii` (funções de contexto da RLS). O `sii` entrou na
   lista de schemas do Prisma porque o usuário do banco também se chama `sii`: com o `search_path` padrão
   (`"$user", public`), o `prisma migrate reset` acabava criando a tabela `_prisma_migrations` dentro dele.
2. **Toda tabela nominal tem RLS + FORCE + policy na mesma migration** (regra do ADR 0003). O padrão é:
   - a linha é visível se a pessoa for visível;
   - família e CadÚnico, pelos membros;
   - frequência, pela matrícula;
   - evento, notificação e parecer, pelo caso;
   - visita, por qualquer pessoa atendida.
   
   `sii_auditor` não tem grant em nenhum schema nominal. Ele lê cadastros públicos (escolas, quadras,
   equipamentos) e `indicadores`. `auditoria` é só do dono.
3. **Saúde guarda só sinalizadores.** Um teste garante que nenhuma coluna de `saude` tem nome de CID,
   diagnóstico ou laudo, e os schemas `Parecer` e `Visita` do shared recusam código CID no texto.
4. Entraram dois campos que a especificação não listava, mas que os motivos de visita exigem:
   - `territorio.domicilio.moradores`, para saber se o idoso mora sozinho;
   - `educacao.atendimento_especializado` (sala de recursos ou APAE), para o AEE.
5. **Colunas de escopo** (`setor_codigo`, `microarea`, `escola_inep`, `cras_codigo`, `familia_pcf`) ficam
   desnormalizadas em `pessoa_mestra`, para a RLS ser barata. Quem as mantém são as cargas.

### Cifragem

6. **AES-256-GCM na aplicação**, no formato `versão(1) | iv(12) | tag(16) | texto cifrado`, com IV
   aleatório. A versão permite trocar a chave aos poucos.
7. **HMAC-SHA256 com uma chave separada**, sobre `TIPO:dígitos`, gravado em `cpf_hash`, `nis_hash` e
   `cns_hash`, todos com índice único. A busca e a ligação entre fontes usam o hash, sem decifrar nada.
   Sem a chave HMAC, o hash não cai num ataque de dicionário de CPFs.
8. As chaves ficam no `.env` (`CHAVE_CIFRA` e `CHAVE_HMAC`, 32 bytes em hex), validadas na partida da
   API. **Perder a `CHAVE_CIFRA` é perder os documentos**: guardar cópia no cofre da CTI (P20).
9. O código fica em `apps/api/src/cripto/`. No P08 o worker vai precisar da mesma cifra; nessa hora ele vai
   para um pacote de servidor compartilhado.

### Trilha do caso

10. `casos.evento_caso` é **append-only**: triggers bloqueiam UPDATE, DELETE e TRUNCATE, inclusive para o
    dono, e `sii_app` também não tem esses grants.
11. **O hash é calculado pelo banco**, num trigger `BEFORE INSERT`. O trigger trava o caso, numera o `seq`
    e calcula `sha256(hash_anterior ‖ caso|seq|tipo|ocorrido_em|autor|dados)`. Como quem grava não informa
    o hash, a aplicação não consegue forjar a cadeia.
12. `casos.verificar_trilha(caso)` recalcula a cadeia e aponta o primeiro evento quebrado. A função é
    `SECURITY DEFINER`, então o auditor confere a integridade sem ler o conteúdo. O **código verificador**
    (`XXXX-XXXX-XXXX`, os 12 primeiros caracteres hex do último hash) está no shared.
13. Limite conhecido: um superusuário pode desligar o trigger e alterar a trilha. O `verificar_trilha`
    detecta, mas não impede. Em produção a API não roda como superusuário (P20).

### Seed

14. `prisma/seed/prototipo/gerador.ts` é um **porte fiel** do gerador do protótipo, com as mesmas
    sementes e as mesmas chamadas. O teste compara o resultado com o digest do JS original, e todos os
    registros batem. Os sorteios novos (nomes, nascimento, NIS, CNS, responsáveis, fonte do ponto)
    usam uma quarta sequência, para não deslocar os números.
15. **Equipamentos reais, pessoas fictícias** (decisão de 11/11/2026). O mapeamento das escolas inventadas
    para os INEP reais fica em `mapeamento.ts`. Trocar o nome não muda nenhum número.
16. O calendário escolar 2026 do seed é só o ponto de partida, igual para todas as escolas: de 09/02 a 18/12, sem o recesso de
    6 a 24/07 e sem os feriados nacionais e estaduais. Depois, o calendário é **configurável** por escola ou por rede, pela API, e o feriado municipal entra por lá.
17. O seed é idempotente e roda numa transação. Ele recusa limpar o banco se houver qualquer pessoa sem
    vínculo `SEED`. Para apagar a trilha, desliga os triggers só naquela transação, o que exige
    superusuário (dev).
18. Os testes de RLS do P03 usam uma fixture própria de 12 pessoas (`test/fixtures/rls.ts`), separada do
    seed grande.

## Consequências

- `pnpm db:seed` cria 11 usuários e 2.436 pessoas em cerca de 4 s. São 620 crianças, 1.048 idosos,
  74 casos de busca ativa e os responsáveis. Também cria 37 notificações, 111 trilhas íntegras e 8.040
  lançamentos de frequência.
- Os números conferem com o protótipo: casos por status, notificações por status, lotes por situação e
  matrículas por escola.
- Frequência: as faltas seguidas recalculadas pelo shared, a partir do que foi lançado no banco,
  reproduzem as do protótipo em todos os alunos.

## Correções posteriores (11/11/2026)

- **`CREATE SCHEMA` que faltavam:** o SQL da migration `20261112090000_modelo_completo` tinha sido gerado num banco em que o reset do Prisma já criara os schemas novos, então ficou sem os `CREATE SCHEMA` deles. Num banco vazio, a migration falhava. Acrescentei `CREATE SCHEMA IF NOT EXISTS` no início do arquivo e atualizei a soma de verificação nos dois bancos locais. Ninguém mais tinha aplicado a migration. Testei o caminho do zero num banco descartável.
- **Data no nome da pasta:** o nome `20261112…` traz uma data errada (a migration é de 11/11). Mantive o nome porque ele só define a ordem; a migration seguinte, `20261112090100_calendario_configuravel`, foi nomeada para vir depois dela.
