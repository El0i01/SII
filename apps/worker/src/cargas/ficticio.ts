/**
 * CSV fictício do CadÚnico no layout do CECAD (Windows-1252, `;`), para testes e demonstração.
 * Nomes inventados; CPF e NIS com dígito verificador válido, gerados ao acaso. Nunca dado real.
 */

export const NOMES_F = [
  'Ana',
  'Maria',
  'Júlia',
  'Luíza',
  'Cecília',
  'Helena',
  'Alice',
  'Lívia',
  'Sofia',
  'Valentina',
  'Laura',
  'Isadora',
  'Beatriz',
  'Lorena',
  'Antônia',
];
export const NOMES_M = [
  'João',
  'José',
  'Pedro',
  'Lucas',
  'Gabriel',
  'Davi',
  'Arthur',
  'Heitor',
  'Bernardo',
  'Théo',
  'Samuel',
  'Benício',
  'Joaquim',
  'Caetano',
  'Raimundo',
];
export const SOBRENOMES = [
  'Silva',
  'Souza',
  'Oliveira',
  'Pereira',
  'Lima',
  'Carvalho',
  'Ferreira',
  'Rodrigues',
  'Almeida',
  'Costa',
  'Gomes',
  'Ribeiro',
  'Martins',
  'Araújo',
  'Barbosa',
  'Nascimento',
  'Moraes',
  'Conceição',
  'Teixeira',
  'Batista',
];

export const CABECALHO_CECAD = [
  'd.cod_familiar_fam',
  'd.dat_atual_fam',
  'd.vlr_renda_media_fam',
  'd.fx_rfpc',
  'd.marc_pbf',
  'd.qtd_pessoas_domic_fam',
  'p.nom_pessoa',
  'p.num_nis_pessoa_atual',
  'p.num_cpf_pessoa',
  'p.dta_nasc_pessoa',
  'p.nom_completo_mae_pessoa',
  'p.cod_sexo_pessoa',
  'p.cod_parentesco_rf_pessoa',
];

export function rng(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cpfValido(r: () => number): string {
  const b = Array.from({ length: 9 }, () => Math.floor(r() * 10));
  const dv = (ds: number[]) => {
    const s = ds.reduce((a, d, i) => a + d * (ds.length + 1 - i), 0);
    const x = (s * 10) % 11;
    return x === 10 ? 0 : x;
  };
  const d1 = dv(b);
  return [...b, d1, dv([...b, d1])].join('');
}

function nisValido(r: () => number): string {
  const b = [1, 2, ...Array.from({ length: 8 }, () => Math.floor(r() * 10))];
  const s = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2].reduce((a, p, i) => a + p * (b[i] as number), 0);
  const x = 11 - (s % 11);
  return [...b, x >= 10 ? 0 : x].join('');
}

export interface CsvFicticio {
  bytes: Buffer;
  linhas: number;
  /** Linhas com erro de propósito (nascimento, NIS ou nome inválidos). */
  comErro: number;
  /** Todos os CPF e NIS do arquivo (para conferir que nenhum vazou para log). */
  documentos: string[];
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** `n` linhas de pessoa (sem contar o cabeçalho), em famílias de 1 a 6 pessoas. ~3% com erro. */
export function gerarCadunicoFicticio(
  n: number,
  opcoes: { semente?: number; colunas?: string[]; prefixoFamilia?: string } = {},
): CsvFicticio {
  const r = rng(opcoes.semente ?? 20261112);
  const pega = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)] as T;
  const colunas = opcoes.colunas ?? CABECALHO_CECAD;
  const linhas: string[] = [colunas.join(';')];
  const documentos: string[] = [];
  let comErro = 0;
  let familia = 0;
  while (linhas.length - 1 < n) {
    familia++;
    const codigo = `${opcoes.prefixoFamilia ?? '9'}${String(familia).padStart(10, '0')}`;
    const tamanho = Math.min(1 + Math.floor(r() * 6), n - (linhas.length - 1));
    const sobrenome = `${pega(SOBRENOMES)} ${pega(SOBRENOMES)}`;
    const maeRf = `${pega(NOMES_F)} ${pega(SOBRENOMES)}`;
    const renda = Math.floor(r() * 900);
    const fx = renda <= 109 ? 1 : renda <= 218 ? 2 : renda <= 759 ? 3 : 4;
    const pbf = fx <= 2 ? 1 : 0;
    const anoRf = 1965 + Math.floor(r() * 40);
    for (let i = 0; i < tamanho; i++) {
      const fem = r() < 0.5;
      const nome = `${pega(fem ? NOMES_F : NOMES_M)} ${pega(NOMES_F.concat(NOMES_M))} ${sobrenome}`;
      const ano =
        i === 0 ? anoRf : i === 1 ? anoRf + Math.floor(r() * 4) : anoRf + 18 + Math.floor(r() * 20);
      let nasc = `${doisDigitos(1 + Math.floor(r() * 28))}/${doisDigitos(1 + Math.floor(r() * 12))}/${Math.min(ano, 2026)}`;
      let nis = nisValido(r);
      let cpf = r() < 0.7 ? cpfValido(r) : '';
      let nomeFinal = nome;
      const sorte = r();
      if (sorte < 0.01) nasc = '31/02/2010';
      else if (sorte < 0.02) nis = nis.slice(0, 10) + String((Number(nis[10]) + 1) % 10);
      else if (sorte < 0.03) nomeFinal = '';
      if (sorte < 0.03) comErro++;
      // CPF com DV errado: aviso (a pessoa entra sem CPF).
      if (sorte >= 0.03 && sorte < 0.04 && cpf)
        cpf = cpf.slice(0, 10) + String((Number(cpf[10]) + 1) % 10);
      documentos.push(nis);
      if (cpf) documentos.push(cpf);
      const valores: Record<string, string> = {
        'd.cod_familiar_fam': codigo,
        'd.dat_atual_fam': `${doisDigitos(1 + Math.floor(r() * 28))}/${doisDigitos(1 + Math.floor(r() * 9))}/2026`,
        'd.vlr_renda_media_fam': `${renda},00`,
        'd.fx_rfpc': String(fx),
        'd.marc_pbf': String(pbf),
        'd.qtd_pessoas_domic_fam': String(tamanho),
        'p.nom_pessoa': nomeFinal,
        'p.num_nis_pessoa_atual': nis,
        'p.num_cpf_pessoa': cpf,
        'p.dta_nasc_pessoa': nasc,
        'p.nom_completo_mae_pessoa': i >= 2 ? maeRf : `${pega(NOMES_F)} ${pega(SOBRENOMES)}`,
        'p.cod_sexo_pessoa': fem ? '2' : '1',
        'p.cod_parentesco_rf_pessoa': String(i === 0 ? 1 : i === 1 ? 2 : 3),
      };
      linhas.push(colunas.map((c) => valores[c] ?? '').join(';'));
    }
  }
  return {
    bytes: Buffer.from(`${linhas.join('\r\n')}\r\n`, 'latin1'),
    linhas: n,
    comErro,
    documentos,
  };
}
