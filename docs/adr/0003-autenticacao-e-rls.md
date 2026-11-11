# 0003 · Autenticação, perfis e Row-Level Security

Data: 11/11/2026 · Situação: aceita · Prompt: P03

## Contexto

O SII guarda dado nominal de crianças, famílias e idosos de quatro secretarias. A especificação (§2) define
11 perfis e exige três camadas: RBAC (perfil), ABAC (escola, microárea, CRAS…) e RLS no banco. O
`AUDITOR_TCE` não pode ler tabela nominal nem por SQL. Não há reaproveitamento do GTE-SEMED nem servidor de
identidade externo.

## Decisões

### Autenticação

1. **Login por apelido** (`ana.cras`), nunca por CPF. Senha com bcrypt custo 12 (`bcryptjs`, sem
   compilação nativa). Login inexistente ou inativo compara com um hash fictício: a resposta leva o mesmo
   tempo e tem o mesmo texto ("Login ou senha incorretos.").
2. **Bloqueio por conta**: a 5ª senha errada seguida bloqueia por 15 min (HTTP 423). **Limite por IP**:
   `LOGIN_LIMITE_POR_MINUTO` (padrão 10) tentativas de login por minuto (HTTP 429), em memória, porque a API
   roda numa instância só. O plano falava em 5 por IP; ficou 10, porque o bloqueio por conta já trava a
   força bruta numa conta e 5 por IP derrubaria uma sala de capacitação inteira atrás do mesmo NAT.
3. **JWT de acesso** HS256 de 15 min com `{ sub, perfil, tv }`. A cada requisição a API recarrega o usuário:
   desativação, troca de senha ou revogação (que incrementam `versao_token`) derrubam o acesso na hora.
4. **Refresh token opaco** de 256 bits, rotativo, guardado só como sha256 (`acesso.sessao_refresh`).
   Tokens de uma mesma cadeia formam uma **família**: um token já usado ou revogado que reaparece revoga a
   família inteira e grava `REUSO_REFRESH` na trilha. Uso simultâneo do mesmo token conta como reuso.
   **Validade deslizante: 12 h no web e 7 dias no celular** (decisão de 11/11/2026). Ainda não há validade
   absoluta da família; reavaliar no P17, junto com o PIN offline.
5. **Entrega**: o web recebe cookies `httpOnly`, `SameSite=Strict` e `Secure` em produção. São dois:
   `sii_acesso`, com `path=/api`, e `sii_refresh`, com `path=/api/v1/auth`, o que faz o refresh nunca viajar
   para as outras rotas. O app mobile manda `X-SII-Cliente: mobile` e recebe os tokens no corpo, para
   guardar no secure store. O `SameSite=Strict` protege contra CSRF enquanto web e API estiverem no mesmo
   site (no deploy, o Nginx serve os dois no mesmo domínio).
6. **Senha provisória** (`xxxx-xxxx-xxxx`, sem caracteres ambíguos, 24 h), gerada pelo `ADMIN_CTI` ao criar
   o usuário ou quando ele esquece a senha. Não depende de e-mail. Enquanto a senha não é trocada, só
   funcionam `auth/eu`, `auth/trocar-senha` e `auth/sair`.

### Autorização

7. **Guards globais, nesta ordem**: limite de tentativas → `JwtGuard` (tudo exige login, exceto
   `@Publico()`) → troca obrigatória → `@Perfis(...)` → `@Escopo({ tipo, param })`. O `@Escopo` confere
   o parâmetro da rota contra os escopos do usuário e dá um 403 claro (`FORA_DO_ESCOPO`) antes de consultar.
8. **Visibilidade** (decisão de 11/11/2026):
   - `ADMIN_CTI`, `COMITE_GESTOR`, `SEMED_GESTOR` e `SAUDE_GESTOR` veem as pessoas do **município inteiro**,
     e cada um recebe só os campos da sua secretaria, recortados nos DTOs a partir do P12;
   - `ESCOLA`, `ACS`, `CRAS_TECNICO` e `VISITADOR_PCF` veem só o próprio escopo;
   - `FAZENDA` e `DPO` não veem pessoas;
   - `AUDITOR_TCE` só vê agregados.

### Row-Level Security

9. A API conecta como o **dono** do banco. Todo acesso a dado nominal passa por
   `PrismaService.comoUsuario(ctx, fn)`, que abre uma transação e faz duas coisas:
   - `SET LOCAL ROLE`: o papel é `sii_auditor` para o `AUDITOR_TCE` e `sii_app` para os outros perfis;
   - `set_config('sii.perfil' | 'sii.escopos' | 'sii.usuario_id', …, true)`.
   
   Os dois papéis são `NOLOGIN`, então nenhuma senha nova entra no repositório. Ao fim da transação tudo
   volta ao normal, e um teste garante que o contexto não vaza.
10. As policies usam as funções `sii.perfil_atual()`, `sii.ve_municipio()` e `sii.tem_escopo(tipo, valor)`:
    - `pessoas.pessoa_mestra` filtra por escola, microárea, CRAS e família do PCF;
    - `casos.caso` herda a visibilidade da pessoa, por uma subconsulta que também passa pela RLS.
    
    As duas tabelas usam `FORCE ROW LEVEL SECURITY`.
11. **`sii_auditor` não tem nenhum grant** em `pessoas`, `casos` nem `acesso`: até um `SELECT` escrito à mão
    dá *permission denied*. Ele lê só o schema `agregados`, cujas views rodam com o privilégio do dono e
    suprimem contagens menores que 5 (`'<5'`).
12. `sii_app` também não lê o schema `acesso` (hash de senha, sessões). Uma injeção de SQL dentro de
    `comoUsuario` não alcança credenciais.
13. **Esqueleto nominal**: `pessoa_mestra` e `caso` entram agora só com as colunas que as policies usam.
    O P05 completa as tabelas (CPF/NIS/CNS cifrados, família, domicílio); as policies e os grants padrão
    (`ALTER DEFAULT PRIVILEGES`) já cobrem as tabelas novas desses schemas.

### Outros

14. Erros no formato `{ codigo, mensagem, campos? }` (filtro global). Erros inesperados não expõem detalhe:
    a mensagem do banco pode conter valores de colunas.
15. Seed de desenvolvimento (`pnpm db:seed`, roda com `tsx`): um usuário fictício por perfil, com a senha
    `SEED_SENHA` do `.env`, e 12 pessoas fictícias. Recusa rodar em produção.

## Riscos e pendências

- O dono do banco é superusuário em dev, por isso ignora a RLS. **No P20**, a API de produção deve conectar
  com um usuário que não seja superusuário, que seja dono dos objetos e tenha `BYPASSRLS` só para as tarefas
  da CTI. Uma alternativa é separar "dono das migrations" de "usuário da API". Isso precisa ser revisto na
  revisão de segurança.
- O limite de tentativas em memória não serve para mais de uma instância. Se a API escalar, trocar o
  armazenamento do throttler por Redis.
- Atrás do Nginx, configurar `trust proxy`, para o limite por IP e a trilha usarem o IP real (P20).
