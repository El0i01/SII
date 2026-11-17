# 0011 · Ficha da criança, revelação de CPF e painel de acessos

Data: 17/11/2026 · Situação: aceita · Prompt: P12

## Contexto

A §3.8 pede uma ficha por criança (0 a 17) que junte as quatro secretarias, com motivos de visita, histórico e relatórios de visita. A §3.12 e o CLAUDE.md pedem que o CPF saia sempre mascarado e que revelar exija finalidade e fique registrado.

Critérios de aceite:
- a ficha carrega em menos de 1,5 s com o seed;
- revelar CPF sem finalidade retorna 422;
- o registro do acesso aparece no painel do DPO.

## Decisões

1. **Seções por perfil** (decisão do usuário, 17/11/2026): todo perfil nominal vê todas as seções, como no protótipo.
   - A ficha só tem sinalizadores: laudo, CID e diagnóstico nunca entram.
   - A matriz fica em `secoesDaFicha` (shared); a API não põe no JSON a seção que o perfil não pode ver (chave ausente, nunca `null`).
   - A RLS continua decidindo quais crianças cada perfil vê.
2. **Uma consulta para a lista e a ficha** (`apps/api/src/fichas/consulta-fichas.ts`), sempre dentro de `comoUsuario`.
   - Os motivos de visita são calculados pelo shared, não em SQL.
   - Faltas seguidas seguem a regra do job de infrequência.
   - A lista devolve 40 itens, como o protótipo.
3. **Revelar CPF** (`POST /fichas/:id/revelar-cpf`), aberto a todo perfil nominal (decisão do usuário).
   - Finalidade de uma lista fechada, ou "Outra" com descrição.
   - O acesso é gravado **antes** de decifrar: se a gravação falhar, nada é revelado.
   - `auditoria.acesso_dado_pessoal` continua sem grant para `sii_app`; a API grava com o cliente dono, depois de conferir a visibilidade pela RLS.
4. **Painel do DPO mínimo** (`/acessos`) já no P12, para o critério de aceite. O P16 completa: filtro por pessoa e exportação.
5. **Seed**: relatórios de visita fictícios (ACS, Criança Feliz, CRAS) em `casos.visita`, com os textos do protótipo.

## Consequências

- Para recortar a ficha por secretaria basta mudar a matriz no shared e incluir um teste de integração com o perfil recortado (hoje nenhum perfil nominal tem seção ausente).
- O CPF mascarado exige decifrar no servidor, só para montar a máscara (DTO interno × DTO de saída). O número em claro só sai pelo endpoint com finalidade.
- O Conselho Tutelar na ficha depende dos casos até haver fonte própria.
