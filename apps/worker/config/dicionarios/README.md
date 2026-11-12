# Dicionários de layout das cargas

Cada arquivo diz quais colunas a carga espera, com os nomes aceitos (aliases) e se a coluna é
obrigatória. A conferência ignora maiúsculas, acentos, aspas e o prefixo de tabela do CECAD (`p.`,
`d.`).

- `cadunico.json`: CSV do CECAD e base completa do Portal de Gestão (P08).
  - **Os nomes de coluna estão a confirmar com o dicionário oficial do MDS.** Se o MDS mudar um nome,
    acrescente o novo nome em `colunas` (o primeiro da lista aparece na mensagem de erro) e reinicie o
    worker. Não precisa mexer no código.
  - `algumDe`: basta a faixa pronta (`fx_rfpc`) **ou** a renda per capita.
  - `linhasRenda`: linhas de renda per capita em reais para calcular a faixa quando o arquivo traz
    só a renda. **Confirme os valores vigentes com a Assistência** (extrema pobreza, linha do Bolsa
    Família e meio salário mínimo).

Outro arquivo pode ser usado com `DICIONARIO_CADUNICO=/caminho/arquivo.json` no `.env`.
