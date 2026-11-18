import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { ControleExterno } from './indicadores.service';

/**
 * Relatório semestral ao TCE-RO (§3.11, P16) em PDF (pdfkit) e XLSX (exceljs), gerados no servidor
 * a partir do mesmo `ControleExterno` da tela. Nenhum dado pessoal: indicadores agregados (com
 * "< 5"), despesa por programa e os códigos verificadores das trilhas.
 */

const ORGAO = 'Prefeitura Municipal de Itapuã do Oeste · Rondônia';
const TITULO = 'Relatório semestral ao TCE-RO';
const NOTA_SUPRESSAO =
  'Contagens menores que 5 aparecem como "< 5" para proteger as pessoas. Os indicadores são desidentificados.';
const COMO_VERIFICAR =
  'Para conferir a trilha de um caso, informe o código do caso e o código verificador em "Controle externo > Verificar a trilha". O sistema recalcula a cadeia de hashes dos eventos.';

const ROTULO_TIPO: Record<string, string> = {
  BUSCA_ATIVA_ESCOLAR: 'Busca ativa escolar',
  INFREQUENCIA: 'Infrequência',
};
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (d: Date | string) =>
  new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Porto_Velho' });
const dataHoraBr = (d: Date) =>
  d.toLocaleString('pt-BR', {
    timeZone: 'America/Porto_Velho',
    dateStyle: 'short',
    timeStyle: 'short',
  });

type Doc = InstanceType<typeof PDFDocument>;

/** Tabela simples: cabeçalho em negrito, quebra de linha nas células e de página quando falta espaço. */
function tabela(doc: Doc, colunas: { titulo: string; largura: number }[], linhas: string[][]) {
  const x0 = doc.page.margins.left;
  const desenharLinha = (celulas: string[], negrito: boolean) => {
    doc.font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    const alturas = celulas.map((c, i) =>
      doc.heightOfString(c, { width: (colunas[i]?.largura ?? 60) - 6 }),
    );
    const altura = Math.max(...alturas) + 6;
    if (doc.y + altura > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const y = doc.y;
    let x = x0;
    celulas.forEach((c, i) => {
      const w = colunas[i]?.largura ?? 60;
      doc.text(c, x + 3, y + 3, { width: w - 6 });
      x += w;
    });
    doc
      .moveTo(x0, y + altura)
      .lineTo(x, y + altura)
      .lineWidth(0.5)
      .strokeColor('#cccccc')
      .stroke();
    doc.x = x0;
    doc.y = y + altura;
  };
  desenharLinha(
    colunas.map((c) => c.titulo),
    true,
  );
  for (const l of linhas) desenharLinha(l, false);
  doc.moveDown(0.8);
}

function secao(doc: Doc, titulo: string, texto?: string) {
  if (doc.y > doc.page.height - 140) doc.addPage();
  doc.x = doc.page.margins.left;
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#1b1b1b').text(titulo);
  if (texto) doc.font('Helvetica').fontSize(9).fillColor('#555555').text(texto);
  doc.fillColor('#1b1b1b').moveDown(0.4);
}

export function gerarPdf(d: ControleExterno, geradoEm: Date): Promise<Buffer> {
  return new Promise((ok, falha) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: { Title: `${TITULO} · ${d.rotuloSemestre}`, Author: 'SII · CTI/SEMED', Creator: 'SII' },
    });
    const partes: Buffer[] = [];
    doc.on('data', (p: Buffer) => partes.push(p));
    doc.on('end', () => ok(Buffer.concat(partes)));
    doc.on('error', falha);

    doc.font('Helvetica').fontSize(9).fillColor('#555555').text(ORGAO);
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#1351b4').text(`${TITULO}`);
    doc.font('Helvetica').fontSize(11).fillColor('#1b1b1b').text(d.rotuloSemestre);
    doc
      .fontSize(8.5)
      .fillColor('#555555')
      .text(
        `Referência: ${dataBr(`${d.referencia}T12:00:00Z`)} · Gerado em ${dataHoraBr(geradoEm)}`,
      );
    doc.text(NOTA_SUPRESSAO).moveDown(1).fillColor('#1b1b1b');

    secao(
      doc,
      '1. Indicadores dos objetivos estratégicos',
      'Linha de base, valor atual e meta de cada objetivo do plano.',
    );
    tabela(
      doc,
      [
        { titulo: 'Objetivo', largura: 48 },
        { titulo: 'Eixo', largura: 80 },
        { titulo: 'Indicador', largura: 120 },
        { titulo: 'Linha de base', largura: 72 },
        { titulo: 'Atual', largura: 50 },
        { titulo: 'Meta', largura: 70 },
        { titulo: 'Situação', largura: 75 },
      ],
      d.indicadores.map((i) => [
        i.objetivo,
        i.eixo,
        i.nome,
        i.linhaBase,
        i.atual,
        i.meta,
        i.rotuloSituacao,
      ]),
    );

    secao(
      doc,
      '2. Gasto × resultado',
      `Despesa liquidada em ${d.gasto.ano} por programa e o resultado associado.${d.gasto.fonte === 'CSV' ? ' Fonte: arquivo enviado pela Fazenda.' : d.gasto.fonte === 'API' ? ' Fonte: Portal da Transparência (dados abertos).' : ''}`,
    );
    tabela(
      doc,
      [
        { titulo: 'Programa', largura: 120 },
        { titulo: 'Despesa liquidada', largura: 100 },
        { titulo: 'Resultado', largura: 295 },
      ],
      d.gasto.programas.map((p) => [p.nome, brl(p.valor), p.resultado]),
    );

    secao(doc, '3. Proteção de dados', undefined);
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(
        `Acessos a dado pessoal registrados no semestre: ${d.acessos.registrados}. O registro detalhado é entregue pelo encarregado de dados mediante requisição formal.`,
      )
      .moveDown(0.8);

    secao(doc, '4. Anexo: trilhas de evidências dos casos encerrados', COMO_VERIFICAR);
    if (d.trilhas.length === 0)
      doc.font('Helvetica').fontSize(9).text('Nenhum caso encerrado no semestre.');
    else
      tabela(
        doc,
        [
          { titulo: 'Caso', largura: 90 },
          { titulo: 'Tipo', largura: 130 },
          { titulo: 'Encerrado em', largura: 85 },
          { titulo: 'Eventos', largura: 60 },
          { titulo: 'Código verificador', largura: 150 },
        ],
        d.trilhas.map((t) => [
          t.codigo,
          ROTULO_TIPO[t.tipo] ?? t.tipo,
          dataBr(t.encerradoEm),
          String(t.eventos),
          t.verificador,
        ]),
      );
    doc.end();
  });
}

export async function gerarXlsx(d: ControleExterno, geradoEm: Date): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SII · CTI/SEMED';
  wb.created = geradoEm;
  wb.title = `${TITULO} · ${d.rotuloSemestre}`;

  const cabecalho = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const ind = wb.addWorksheet('Indicadores');
  ind.columns = [
    { header: 'Objetivo', key: 'objetivo', width: 10 },
    { header: 'Eixo', key: 'eixo', width: 28 },
    { header: 'Indicador', key: 'nome', width: 42 },
    { header: 'Linha de base', key: 'linhaBase', width: 18 },
    { header: 'Atual', key: 'atual', width: 12 },
    { header: 'Meta', key: 'meta', width: 22 },
    { header: 'Situação', key: 'situacao', width: 20 },
    { header: 'Período do valor atual', key: 'periodo', width: 20 },
    { header: 'Numerador', key: 'numerador', width: 12 },
    { header: 'Denominador', key: 'denominador', width: 12 },
    { header: 'Linha de base (número)', key: 'baseN', width: 20 },
    { header: 'Atual (número)', key: 'atualN', width: 16 },
    { header: 'Meta (número)', key: 'metaN', width: 16 },
  ];
  for (const i of d.indicadores)
    ind.addRow({
      objetivo: i.objetivo,
      eixo: i.eixo,
      nome: i.nome,
      linhaBase: i.linhaBase,
      atual: i.atual,
      meta: i.meta,
      situacao: i.rotuloSituacao,
      periodo: i.valores.periodo,
      numerador: i.valores.numerador,
      denominador: i.valores.denominador,
      baseN: i.valores.linhaBase,
      atualN: i.valores.atual,
      metaN: i.valores.meta,
    });
  cabecalho(ind);

  const gasto = wb.addWorksheet('Gasto × resultado');
  gasto.columns = [
    { header: 'Programa', key: 'nome', width: 24 },
    {
      header: `Despesa liquidada ${d.gasto.ano} (R$)`,
      key: 'valor',
      width: 24,
      style: { numFmt: '#,##0.00' },
    },
    { header: 'Resultado', key: 'resultado', width: 60 },
  ];
  for (const p of d.gasto.programas)
    gasto.addRow({ nome: p.nome, valor: p.valor, resultado: p.resultado });
  cabecalho(gasto);

  const trilhas = wb.addWorksheet('Trilhas');
  trilhas.columns = [
    { header: 'Caso', key: 'codigo', width: 16 },
    { header: 'Tipo', key: 'tipo', width: 24 },
    { header: 'Encerrado em', key: 'encerrado', width: 14 },
    { header: 'Eventos', key: 'eventos', width: 10 },
    { header: 'Código verificador', key: 'verificador', width: 20 },
  ];
  for (const t of d.trilhas)
    trilhas.addRow({
      codigo: t.codigo,
      tipo: ROTULO_TIPO[t.tipo] ?? t.tipo,
      encerrado: dataBr(t.encerradoEm),
      eventos: t.eventos,
      verificador: t.verificador,
    });
  cabecalho(trilhas);

  const sobre = wb.addWorksheet('Sobre');
  sobre.columns = [{ header: TITULO, key: 'texto', width: 110 }];
  for (const texto of [
    ORGAO,
    d.rotuloSemestre,
    `Referência: ${dataBr(`${d.referencia}T12:00:00Z`)} · Gerado em ${dataHoraBr(geradoEm)}`,
    `Acessos a dado pessoal registrados no semestre: ${d.acessos.registrados}`,
    NOTA_SUPRESSAO,
    COMO_VERIFICAR,
  ])
    sobre.addRow({ texto });
  cabecalho(sobre);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
