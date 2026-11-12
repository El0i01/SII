/**
 * Gera um CSV fictício do CadÚnico para testar a tela de cargas:
 *   pnpm --filter @sii/worker cadunico:ficticio [linhas] [arquivo]
 * Padrão: 5000 linhas em /tmp/cadunico-ficticio.csv. Dados inventados.
 */
import fs from 'node:fs';
import { gerarCadunicoFicticio } from '../src/cargas/ficticio';

const linhas = Number(process.argv[2] ?? 5000);
const arquivo = process.argv[3] ?? '/tmp/cadunico-ficticio.csv';
const csv = gerarCadunicoFicticio(linhas);
fs.writeFileSync(arquivo, csv.bytes);
// eslint-disable-next-line no-console -- saída do script de linha de comando
console.log(`${csv.linhas} linhas (${csv.comErro} com erro de propósito) em ${arquivo}`);
