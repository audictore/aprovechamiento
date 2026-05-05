import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType,
  PageOrientation, SectionType, VerticalAlign, TableLayoutType,
  Header, Footer, convertInchesToTwip,
} from 'docx'
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { cellText } from './parseHorario.js'

// ─── helpers de estilo ─────────────────────────────────────────────────────

const PT = n => n * 20  // puntos → half-points (unidades de docx)

const noBorder = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

const thinBorder = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  left:   { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  right:  { style: BorderStyle.SINGLE, size: 4, color: '000000' },
}

function cell(text, opts = {}) {
  return new TableCell({
    borders: opts.borders ?? thinBorder,
    shading: opts.shading,
    verticalAlign: opts.verticalAlign ?? VerticalAlign.CENTER,
    rowSpan: opts.rowSpan,
    columnSpan: opts.columnSpan,
    width: opts.width,
    children: [
      new Paragraph({
        alignment: opts.align ?? AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({
            text: String(text ?? ''),
            bold: opts.bold ?? false,
            size: opts.size ?? PT(9),
            font: 'Arial',
          }),
        ],
      }),
    ],
  })
}

function para(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { before: opts.spaceBefore ?? 80, after: opts.spaceAfter ?? 80 },
    children: [
      new TextRun({
        text: String(text ?? ''),
        bold: opts.bold ?? false,
        size: opts.size ?? PT(10),
        font: 'Arial',
      }),
    ],
  })
}

function paraRuns(runs, opts = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { before: opts.spaceBefore ?? 80, after: opts.spaceAfter ?? 80 },
    children: runs.map(r =>
      new TextRun({ text: r.text, bold: r.bold ?? false, size: r.size ?? PT(10), font: 'Arial' })
    ),
  })
}

// ─── Página 1: Memorándum ────────────────────────────────────────────────────

function buildMemoSection(job) {
  const children = []

  // Título
  children.push(para('MEMORÁNDUM', { bold: true, size: PT(14), align: AlignmentType.CENTER, spaceBefore: 0, spaceAfter: 160 }))

  // Tabla de campos del encabezado (PARA / DE / FECHA / REFERENCIA / ASUNTO)
  const campos = [
    ['PARA:',       `${job.coordinador.nombre}, ${job.coordinador.cargo_largo}`],
    ['DE:',         `${job.docente.nombre}, ${job.cargoDocente}`],
    ['FECHA:',      job.fecha],
    ['REFERENCIA:', job.referencia],
    ['ASUNTO:',     job.asunto],
  ]

  const encabezadoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: campos.map(([lbl, val]) =>
      new TableRow({
        children: [
          cell(lbl, { borders: noBorder, bold: true, width: { size: 18, type: WidthType.PERCENTAGE } }),
          cell(val, { borders: noBorder, width: { size: 82, type: WidthType.PERCENTAGE } }),
        ],
      })
    ),
  })

  children.push(encabezadoTable)
  children.push(para(''))

  // Línea separadora (tabla de 1 fila con borde inferior)
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } },
            children: [new Paragraph({ children: [] })],
          }),
        ],
      }),
    ],
  }))

  children.push(para(''))

  // Párrafo 1
  children.push(para(
    `Estimado maestro, reciba un saludo cordial y sirva el medio para compartir con usted las funciones que se estarán realizando de acuerdo a la categoría de contratación que tengo en este momento como ${job.cargoDocente}, en apegado a la normatividad institucional y cuidando un comportamiento ético con disciplina orden y respeto, en los programas educativos de ${job.programaLargo}.`,
    { spaceBefore: 80, spaceAfter: 80 }
  ))

  // Párrafo 2
  children.push(para(
    `Por lo cual para el cuatrimestre ${job.cuatrimestre}, la carga académica quedó distribuida de la siguiente manera.`,
    { spaceAfter: 120 }
  ))

  // Tabla de actividades
  children.push(buildActividadesTable(job))

  children.push(para(''))

  // Párrafo 3
  children.push(para(
    'Por lo anterior agradezco su atención de acuerdo a lo establecido, reiterándome a sus órdenes para cualquier aclaración.',
    { spaceBefore: 80 }
  ))

  // Párrafo 4
  children.push(para('Reciba un cordial saludo.', { spaceAfter: 160 }))

  // Tabla de firmas
  children.push(buildFirmasTable(job.coordinador.nombre, job.coordinador.cargo_corto, job.docente.nombre, job.cargoDocente))

  children.push(para(''))

  // CC
  children.push(paraRuns([
    { text: 'CC: ', bold: true },
    { text: `${job.secretaria.nombre} — ${job.secretaria.cargo_corto}; Recursos Humanos` },
  ], { spaceBefore: 40, spaceAfter: 40 }))

  return {
    properties: { page: { orientation: PageOrientation.PORTRAIT, margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.25), right: convertInchesToTwip(1.25) } } },
    children,
  }
}

function buildActividadesTable(job) {
  const headers = new TableRow({
    tableHeader: true,
    children: [
      cell('Actividades académicas', { bold: true, shading: { type: ShadingType.CLEAR, fill: 'D0D0D0' }, align: AlignmentType.CENTER, width: { size: 45, type: WidthType.PERCENTAGE } }),
      cell('Horas/Semana',           { bold: true, shading: { type: ShadingType.CLEAR, fill: 'D0D0D0' }, align: AlignmentType.CENTER, width: { size: 20, type: WidthType.PERCENTAGE } }),
      cell('Observaciones',          { bold: true, shading: { type: ShadingType.CLEAR, fill: 'D0D0D0' }, align: AlignmentType.CENTER, width: { size: 35, type: WidthType.PERCENTAGE } }),
    ],
  })

  const dataRows = []
  const { actividades, tipoPTC, totalHoras } = job
  const obsTexto = job.getObsTexto()

  if (tipoPTC) {
    // PTC: celda de observaciones fusionada verticalmente sobre todas las filas de actividades
    const totalFilas = actividades.length + 1  // actividades + fila Total
    actividades.forEach((act, idx) => {
      const rowCells = [
        cell(act.label, { width: { size: 45, type: WidthType.PERCENTAGE } }),
        cell(String(act.horas), { align: AlignmentType.CENTER, width: { size: 20, type: WidthType.PERCENTAGE } }),
      ]
      if (idx === 0) {
        // Primera fila: agregar celda de obs con rowSpan = totalFilas
        rowCells.push(new TableCell({
          borders: thinBorder,
          verticalAlign: VerticalAlign.CENTER,
          rowSpan: totalFilas,
          width: { size: 35, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: { before: 40, after: 40 },
              children: [new TextRun({ text: obsTexto, size: PT(9), font: 'Arial' })],
            }),
          ],
        }))
      }
      dataRows.push(new TableRow({ children: rowCells }))
    })

    // Fila Total (sin celda de obs porque está fusionada)
    dataRows.push(new TableRow({
      children: [
        cell('Total', { bold: true, width: { size: 45, type: WidthType.PERCENTAGE } }),
        cell(String(totalHoras), { bold: true, align: AlignmentType.CENTER, width: { size: 20, type: WidthType.PERCENTAGE } }),
      ],
    }))
  } else {
    // PA: cada fila con observación propia
    actividades.forEach(act => {
      dataRows.push(new TableRow({
        children: [
          cell(act.label, { width: { size: 45, type: WidthType.PERCENTAGE } }),
          cell(String(act.horas), { align: AlignmentType.CENTER, width: { size: 20, type: WidthType.PERCENTAGE } }),
          cell(job.getObsPorActividad(act.label), { width: { size: 35, type: WidthType.PERCENTAGE } }),
        ],
      }))
    })

    // Fila Total
    dataRows.push(new TableRow({
      children: [
        cell('Total', { bold: true, width: { size: 45, type: WidthType.PERCENTAGE } }),
        cell(String(totalHoras), { bold: true, align: AlignmentType.CENTER, width: { size: 20, type: WidthType.PERCENTAGE } }),
        cell('', { width: { size: 35, type: WidthType.PERCENTAGE } }),
      ],
    }))
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headers, ...dataRows],
  })
}

function buildFirmasTable(nombre1, cargo1, nombre2, cargo2) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorder,
            width: { size: 48, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ spacing: { before: 480, after: 0 }, children: [] }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: '_'.repeat(35), font: 'Arial', size: PT(10) })],
              }),
              para(nombre1, { align: AlignmentType.CENTER, bold: true, spaceBefore: 40, spaceAfter: 0 }),
              para(cargo1,  { align: AlignmentType.CENTER, spaceBefore: 0, spaceAfter: 0 }),
            ],
          }),
          new TableCell({
            borders: noBorder,
            width: { size: 4, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [] })],
          }),
          new TableCell({
            borders: noBorder,
            width: { size: 48, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ spacing: { before: 480, after: 0 }, children: [] }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: '_'.repeat(35), font: 'Arial', size: PT(10) })],
              }),
              para(nombre2, { align: AlignmentType.CENTER, bold: true, spaceBefore: 40, spaceAfter: 0 }),
              para(cargo2,  { align: AlignmentType.CENTER, spaceBefore: 0, spaceAfter: 0 }),
            ],
          }),
        ],
      }),
    ],
  })
}

// ─── Página 2: Horario (landscape) ──────────────────────────────────────────

const HORA_RE = /^\d{1,2}[:.]\d{0,2}\s*[-–]/

async function readHorarioTable(xlsxFile, sheetName) {
  if (!xlsxFile || !fs.existsSync(xlsxFile)) return null
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxFile)
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0]
  if (!ws) return null

  const rows = []
  let started = false

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const firstCell = cellText(row.getCell(1)).trim()

    if (!started) {
      if (HORA_RE.test(firstCell)) started = true
      else continue
    } else {
      if (firstCell && !HORA_RE.test(firstCell)) break
    }

    const rowData = []
    for (let c = 1; c <= Math.max(ws.columnCount || 6, 6); c++) {
      rowData.push(cellText(row.getCell(c)).trim())
    }
    rows.push(rowData)
  }

  return rows.length ? rows : null
}

function buildHorarioSection(job, horarioRows) {
  const children = []

  children.push(para('HORARIO', { bold: true, size: PT(14), align: AlignmentType.CENTER, spaceBefore: 0, spaceAfter: 120 }))
  children.push(para(`Docente: ${job.docente.nombre}`, { bold: true, spaceAfter: 120 }))

  if (horarioRows && horarioRows.length) {
    // Determinar número de columnas
    const numCols = Math.max(...horarioRows.map(r => r.length))
    const colWidth = Math.floor(100 / numCols)

    const tableRows = horarioRows.map((rowData, idx) => {
      return new TableRow({
        tableHeader: idx === 0,
        children: rowData.map((txt, ci) => {
          const isHeader = idx === 0
          const w = { size: colWidth, type: WidthType.PERCENTAGE }
          return cell(txt, {
            bold: isHeader,
            shading: isHeader ? { type: ShadingType.CLEAR, fill: 'D0D0D0' } : undefined,
            align: ci === 0 ? AlignmentType.CENTER : AlignmentType.CENTER,
            width: w,
          })
        }),
      })
    })

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows,
    }))
  } else {
    children.push(para('(No se encontró archivo de horario para este docente)', { align: AlignmentType.CENTER }))
  }

  children.push(para(''))
  children.push(buildFirmasTable(job.coordinador.nombre, job.coordinador.cargo_corto, job.docente.nombre, job.cargoDocente))

  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        orientation: PageOrientation.LANDSCAPE,
        margin: {
          top:    convertInchesToTwip(0.75),
          bottom: convertInchesToTwip(0.75),
          left:   convertInchesToTwip(1),
          right:  convertInchesToTwip(1),
        },
      },
    },
    children,
  }
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function generateDocx(job) {
  const horarioRows = await readHorarioTable(job.horarioXlsx, job.horarioSheetName)

  const memoSection    = buildMemoSection(job)
  const horarioSection = buildHorarioSection(job, horarioRows)

  const doc = new Document({
    sections: [memoSection, horarioSection],
  })

  const buffer = await Packer.toBuffer(doc)
  fs.mkdirSync(path.dirname(job.outputPath), { recursive: true })
  fs.writeFileSync(job.outputPath, buffer)
}
