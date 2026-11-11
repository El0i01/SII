/**
 * Sorteios que o protótipo não tem (nome completo, nascimento, NIS, CNS, responsável, microárea
 * rural, fonte do ponto…). Usam uma QUARTA sequência, separada das do protótipo, para não deslocar
 * nenhum número dos painéis. Tudo fictício.
 */
import { rng } from './gerador';

export const SEMENTE_COMPLEMENTOS = 1101104;

// Nomes por inicial (as iniciais vêm do protótipo: LETRAS = "ABCDEFGHIJLMNOPRSTV").
const FEMININOS: Record<string, string[]> = {
  A: ['Ana', 'Alice', 'Amanda'],
  B: ['Beatriz', 'Bianca'],
  C: ['Carla', 'Cecília', 'Clara'],
  D: ['Daniela', 'Débora'],
  E: ['Elisa', 'Eduarda'],
  F: ['Fernanda', 'Flávia'],
  G: ['Gabriela', 'Giovana'],
  H: ['Helena', 'Heloísa'],
  I: ['Isabela', 'Iara'],
  J: ['Júlia', 'Joana'],
  L: ['Laura', 'Lívia', 'Luana'],
  M: ['Maria', 'Manuela', 'Marina'],
  N: ['Natália', 'Nicole'],
  O: ['Olívia', 'Odete'],
  P: ['Paula', 'Priscila'],
  R: ['Rafaela', 'Rebeca'],
  S: ['Sofia', 'Sara'],
  T: ['Tatiane', 'Thaís'],
  V: ['Valentina', 'Vitória'],
};
const MASCULINOS: Record<string, string[]> = {
  A: ['Arthur', 'Antônio'],
  B: ['Bernardo', 'Bruno'],
  C: ['Carlos', 'Caio'],
  D: ['Davi', 'Daniel'],
  E: ['Enzo', 'Eduardo'],
  F: ['Felipe', 'Fábio'],
  G: ['Gabriel', 'Gustavo'],
  H: ['Heitor', 'Henrique'],
  I: ['Igor', 'Isaque'],
  J: ['João', 'José'],
  L: ['Lucas', 'Lorenzo'],
  M: ['Miguel', 'Matheus'],
  N: ['Nicolas', 'Nathan'],
  O: ['Otávio', 'Oliver'],
  P: ['Pedro', 'Paulo'],
  R: ['Rafael', 'Rodrigo'],
  S: ['Samuel', 'Sérgio'],
  T: ['Theo', 'Tiago'],
  V: ['Vitor', 'Vinícius'],
};
const SOBRENOMES: Record<string, string[]> = {
  A: ['Alves', 'Araújo'],
  B: ['Barbosa', 'Batista'],
  C: ['Cardoso', 'Costa'],
  D: ['Dias', 'Duarte'],
  E: ['Esteves', 'Estrela'],
  F: ['Ferreira', 'Freitas'],
  G: ['Gomes', 'Guimarães'],
  H: ['Holanda', 'Hermes'],
  I: ['Inácio', 'Ivo'],
  J: ['Jesus', 'Justino'],
  L: ['Lima', 'Lopes'],
  M: ['Martins', 'Moura'],
  N: ['Nogueira', 'Nunes'],
  O: ['Oliveira', 'Ornelas'],
  P: ['Pereira', 'Pinto'],
  R: ['Ribeiro', 'Rocha'],
  S: ['Santos', 'Souza'],
  T: ['Teixeira', 'Tavares'],
  V: ['Vieira', 'Vasconcelos'],
};
const LETRAS = 'ABCDEFGHIJLMNOPRSTV';

export function normalizarNome(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function criarComplementos() {
  const r = rng(SEMENTE_COMPLEMENTOS);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)] as T;
  const between = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const usados = new Set<string>();

  /** Sequência de dígitos única no seed (CPF, NIS, CNS e código familiar não podem colidir). */
  const unico = (prefixo: string, tamanho: number): string => {
    for (;;) {
      let d = prefixo;
      while (d.length < tamanho) d += between(0, 9);
      if (!usados.has(d)) {
        usados.add(d);
        return d;
      }
    }
  };

  return {
    r,
    pick,
    between,
    /** Reserva um documento que já existe (CPF sorteado pelo protótipo). Duplicado: false. */
    reservar(doc: string): boolean {
      if (usados.has(doc)) return false;
      usados.add(doc);
      return true;
    },
    sexo: (probFeminino = 0.5): 'FEMININO' | 'MASCULINO' =>
      r() < probFeminino ? 'FEMININO' : 'MASCULINO',
    /** Nome completo coerente com as iniciais "M. S. O." do protótipo. */
    nomeDeIniciais(ini: string, sexo: 'FEMININO' | 'MASCULINO'): string {
      const [a, b, c] = ini.replace(/\./g, '').split(/\s+/) as [string, string, string];
      const primeiros = sexo === 'FEMININO' ? FEMININOS : MASCULINOS;
      return `${pick(primeiros[a] ?? ['Ana'])} ${pick(SOBRENOMES[b] ?? ['Silva'])} ${pick(SOBRENOMES[c] ?? ['Souza'])}`;
    },
    nomeAleatorio(sexo: 'FEMININO' | 'MASCULINO', sobrenome?: string): string {
      const primeiros = sexo === 'FEMININO' ? FEMININOS : MASCULINOS;
      const l1 = pick(LETRAS.split(''));
      const l2 = pick(LETRAS.split(''));
      return `${pick(primeiros[l1] as string[])} ${pick(SOBRENOMES[l2] as string[])} ${sobrenome ?? pick(SOBRENOMES[pick(LETRAS.split(''))] as string[])}`;
    },
    cpf: () => unico('', 11),
    nis: () => unico('1', 11),
    cns: () => unico('7', 15),
    codigoFamiliar: () => unico('0', 11),
  };
}

export type Complementos = ReturnType<typeof criarComplementos>;
