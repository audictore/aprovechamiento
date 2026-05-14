import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType,
  PageOrientation, SectionType, VerticalAlign, LevelFormat,
  ImageRun, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom,
  TextWrappingType, TextWrappingSide, convertInchesToTwip,
} from 'docx'
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { cellText } from './parseHorario.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Constantes de página (A4) ───────────────────────────────────────────────

const A4_W    = 11909                    // DXA
const A4_H    = 16834                    // DXA
const M1      = convertInchesToTwip(1)   // 1440 DXA — margen 1"
const CONT_W  = A4_W - 2 * M1           // 9029 DXA — ancho de contenido

// Logo (ruta relativa al archivo)
const LOGO_PATH = path.join(__dirname, '../../../data/logo_upmh.jpg')

// ─── Colores de la tabla de actividades ──────────────────────────────────────
const RED_HEADER = 'a50021'   // rojo oscuro UPMH
const OLIVE_ROW  = 'b3af79'   // oliva/beige para filas de datos

// ─── Helpers generales ───────────────────────────────────────────────────────

const PT = n => n * 2   // puntos → half-points (1pt = 2 half-points en OOXML)

const noBorder = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

const thinBorder = {
  top:    { style: BorderStyle.SINGLE, size: 5, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 5, color: '000000' },
  left:   { style: BorderStyle.SINGLE, size: 5, color: '000000' },
  right:  { style: BorderStyle.SINGLE, size: 5, color: '000000' },
}

const grayBorder = {
  top:    { style: BorderStyle.SINGLE, size: 5, color: 'cccccc' },
  bottom: { style: BorderStyle.SINGLE, size: 5, color: '000000' },
  left:   { style: BorderStyle.SINGLE, size: 5, color: '000000' },
  right:  { style: BorderStyle.SINGLE, size: 5, color: '000000' },
}

// Párrafo simple — sin tamaño explícito hereda el default del documento (Arial 11pt)
function para(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: {
      before: opts.spaceBefore ?? 80,
      after:  opts.spaceAfter  ?? 80,
      line:   240,
      lineRule: 'auto',
    },
    children: [
      new TextRun({
        text:  String(text ?? ''),
        bold:  opts.bold  ?? false,
        size:  opts.size,          // undefined → hereda el default del documento
        font:  opts.font,          // undefined → hereda Arial del documento
        color: opts.color,
      }),
    ],
  })
}

// Párrafo justificado para el cuerpo del memo (hereda Arial 11pt del documento)
function bodyPara(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.BOTH,
    spacing: { before: 0, after: 120, line: 240, lineRule: 'auto' },
    children: [
      new TextRun({
        text: String(text ?? ''),
        bold: opts.bold ?? false,
        // Sin font/size → hereda Arial 11pt del default del documento
      }),
    ],
  })
}

// Celda genérica
function cell(children, opts = {}) {
  return new TableCell({
    borders:       opts.borders       ?? thinBorder,
    shading:       opts.shading,
    verticalAlign: opts.verticalAlign ?? VerticalAlign.CENTER,
    rowSpan:       opts.rowSpan,
    columnSpan:    opts.columnSpan,
    width:         opts.width,
    margins:       opts.margins ?? { top: 0, bottom: 0, left: 40, right: 40 },
    children: Array.isArray(children) ? children : [children],
  })
}

// Celda con texto simple — sin size/font explícito hereda el default del documento
function textCell(text, opts = {}) {
  return cell([
    new Paragraph({
      alignment: opts.align ?? AlignmentType.LEFT,
      spacing:   { before: 0, after: 0, line: 240, lineRule: 'auto' },
      children: [new TextRun({
        text:  String(text ?? ''),
        bold:  opts.bold   ?? false,
        size:  opts.size,          // undefined → hereda default
        font:  opts.font,          // undefined → hereda Arial
        color: opts.color,
      })],
    }),
  ], opts)
}

// ─── Logo UPMH ───────────────────────────────────────────────────────────────

function buildLogoParagraph() {
  if (!fs.existsSync(LOGO_PATH)) return null
  const logoData = fs.readFileSync(LOGO_PATH)
  return new Paragraph({
    spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
    children: [
      new TextRun({ text: 'Memorándum', bold: true, size: PT(11), font: 'Arial' }),
      new ImageRun({
        type: 'jpg',
        data: logoData,
        transformation: { width: 228, height: 90 },
        altText: { title: 'Logo UPMH', description: 'Logo UPMH', name: 'Logo UPMH' },
        floating: {
          horizontalPosition: {
            relative: HorizontalPositionRelativeFrom.COLUMN,
            offset: -236213,
          },
          verticalPosition: {
            relative: VerticalPositionRelativeFrom.PARAGRAPH,
            offset: 0,
          },
          wrap: {
            type: TextWrappingType.SQUARE,
            side: TextWrappingSide.BOTH_SIDES,
          },
          behindDocument: false,
        },
      }),
    ],
  })
}

// ─── Tabla de encabezado (Para/De | Fecha/Ref/Asunto) ────────────────────────

function buildEncabezadoTable(job) {
  // Columnas: izquierda 44%, derecha 56%
  const colL = Math.round(CONT_W * 0.44)   // ~3973 DXA
  const colR = CONT_W - colL                // ~5056 DXA

  const insideOnly = {
    top:    { style: BorderStyle.NONE,   size: 0 },
    bottom: { style: BorderStyle.NONE,   size: 0 },
    left:   { style: BorderStyle.NONE,   size: 0 },
    right:  { style: BorderStyle.SINGLE, size: 12, color: '000000' },
  }
  const leftBorderCell = {
    top:    { style: BorderStyle.NONE, size: 0 },
    bottom: { style: BorderStyle.NONE, size: 0 },
    left:   { style: BorderStyle.NONE, size: 0 },
    right:  { style: BorderStyle.NONE, size: 0 },
  }

  function hdrPara(text, bold = true) {
    return new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
      children: [new TextRun({ text: String(text ?? ''), bold, size: PT(9), font: 'Arial' })],
    })
  }
  function hdrBlank() {
    return new Paragraph({ spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' }, children: [] })
  }

  return new Table({
    width: { size: CONT_W, type: WidthType.DXA },
    columnWidths: [colL, colR],
    rows: [
      new TableRow({
        children: [
          // Celda izquierda: Para, Cargo, De, Cargo
          new TableCell({
            borders: insideOnly,
            width: { size: colL, type: WidthType.DXA },
            margins: { top: 40, bottom: 40, left: 0, right: 80 },
            children: [
              hdrBlank(),
              hdrBlank(),
              hdrBlank(),
              hdrPara(`Para: ${job.coordinador.nombre}`),
              hdrPara(`Cargo: ${job.coordinador.cargo_largo}`),
              hdrBlank(),
              hdrPara(`De: ${job.docente.nombre}`),
              hdrPara(`Cargo: ${job.cargoDocente}`),
              hdrBlank(),
            ],
          }),
          // Celda derecha: Fecha, Referencia, Asunto
          new TableCell({
            borders: leftBorderCell,
            width: { size: colR, type: WidthType.DXA },
            margins: { top: 40, bottom: 40, left: 80, right: 0 },
            children: [
              hdrBlank(),
              hdrBlank(),
              hdrBlank(),
              hdrPara(`Fecha:  ${job.fecha}.`),
              hdrBlank(),
              hdrPara(`No. de referencia:  ${job.referencia}.`),
              hdrBlank(),
              hdrPara(`Asunto: ${job.asunto}`),
              hdrBlank(),
            ],
          }),
        ],
      }),
    ],
  })
}

// ─── Tabla de actividades ─────────────────────────────────────────────────────

const ACT_W1 = 2370   // Actividades académicas
const ACT_W2 = 1635   // Horas/Semana
const ACT_W3 = 4950   // Observaciones
const ACT_TOTAL = ACT_W1 + ACT_W2 + ACT_W3  // 8955

function buildActividadesTable(job) {
  const REF_OBS = 'obs-bullets'

  // Párrafo de bullet — Calibri 9pt
  function obsBulletPara(text) {
    return new Paragraph({
      numbering: { reference: REF_OBS, level: 0 },
      spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
      children: [new TextRun({ text: String(text), font: 'Calibri', size: PT(9) })],
    })
  }

  // Celda de encabezado rojo (hereda tamaño 11pt del default)
  function headerCell(text, width, font) {
    return textCell(text, {
      borders: thinBorder,
      shading: { type: ShadingType.CLEAR, fill: RED_HEADER },
      align: AlignmentType.CENTER,
      bold: true,
      color: 'ffffff',
      font: font,   // undefined → hereda Arial; 'Calibri' para Observaciones
      width: { size: width, type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 40, right: 40 },
    })
  }

  // Celda de datos con fondo oliva (hereda tamaño 11pt del default)
  function oliveCell(text, width, center = false) {
    return textCell(text, {
      borders: thinBorder,
      shading: { type: ShadingType.CLEAR, fill: OLIVE_ROW },
      align: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      width: { size: width, type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 40, right: 40 },
    })
  }

  // Fila de encabezado ("Observaciones" usa Calibri igual que la plantilla)
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell('Actividades académicas', ACT_W1),
      headerCell('Horas/Semana',           ACT_W2),
      headerCell('Observaciones',          ACT_W3, 'Calibri'),
    ],
  })

  const dataRows = []
  const { actividades, tipoPTC, totalHoras } = job

  if (tipoPTC) {
    // PTC: celda de observaciones fusionada verticalmente
    const obsLineas = job.getObsLineas()
    const totalFilas = actividades.length + 1

    actividades.forEach((act, idx) => {
      const rowCells = [
        oliveCell(act.label,        ACT_W1),
        oliveCell(String(act.horas), ACT_W2, true),
      ]
      if (idx === 0) {
        rowCells.push(new TableCell({
          borders: thinBorder,
          verticalAlign: VerticalAlign.TOP,
          rowSpan: totalFilas,
          width: { size: ACT_W3, type: WidthType.DXA },
          margins: { top: 40, bottom: 40, left: 100, right: 40 },
          children: obsLineas.length
            ? obsLineas.map(l => obsBulletPara(l))
            : [new Paragraph({ children: [] })],
        }))
      }
      dataRows.push(new TableRow({ children: rowCells }))
    })

    // Fila Total
    dataRows.push(new TableRow({
      children: [
        oliveCell('Total', ACT_W1),
        oliveCell(String(totalHoras), ACT_W2, true),
      ],
    }))
  } else {
    // PA: cada actividad tiene sus propias observaciones
    actividades.forEach(act => {
      const lineas = job.getObsPorActividad(act.label)
      dataRows.push(new TableRow({
        children: [
          oliveCell(act.label,         ACT_W1),
          oliveCell(String(act.horas), ACT_W2, true),
          new TableCell({
            borders: thinBorder,
            width: { size: ACT_W3, type: WidthType.DXA },
            margins: { top: 40, bottom: 40, left: 100, right: 40 },
            children: lineas.length
              ? lineas.map(l => obsBulletPara(l))
              : [new Paragraph({ spacing: { before: 0, after: 0 }, children: [] })],
          }),
        ],
      }))
    })

    // Fila Total
    dataRows.push(new TableRow({
      children: [
        oliveCell('Total', ACT_W1),
        oliveCell(String(totalHoras), ACT_W2, true),
        textCell('', { borders: thinBorder, width: { size: ACT_W3, type: WidthType.DXA } }),
      ],
    }))
  }

  return { table: new Table({
    width: { size: ACT_TOTAL, type: WidthType.DXA },
    columnWidths: [ACT_W1, ACT_W2, ACT_W3],
    rows: [headerRow, ...dataRows],
  }), numbering: REF_OBS }
}

// ─── Tabla de destinatarios (5 columnas, cabecera de 2 filas) ────────────────

const GRAY_HDR = 'bfbfbf'  // gris de la cabecera de destinatarios

// Columnas: etiqueta | nombre | cargo | firma | fecha  (suman CONT_W)
const DC = [608, 2002, 1869, 2230, 2320]   // total = 9029 = CONT_W

function buildDestinatariosTable(job, tableWidth) {
  const tw = tableWidth ?? CONT_W

  // Escalar columnas proporcionalmente si el ancho difiere
  let cols
  if (tw === CONT_W) {
    cols = DC
  } else {
    const ratio = tw / CONT_W
    const scaled = DC.map(w => Math.round(w * ratio))
    // Ajustar último para que sumen exactamente tw
    const diff = tw - scaled.reduce((a, b) => a + b, 0)
    scaled[scaled.length - 1] += diff
    cols = scaled
  }

  function dHdr(text, colSpan, wDXA, bold = true) {
    return new TableCell({
      columnSpan: colSpan,
      borders: thinBorder,
      shading: { type: ShadingType.CLEAR, fill: GRAY_HDR },
      verticalAlign: VerticalAlign.CENTER,
      width: { size: wDXA, type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 40, right: 40 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
        children: [new TextRun({ text, bold, size: PT(9) })],
      })],
    })
  }

  function dLabel(text) {
    return new TableCell({
      borders: thinBorder,
      shading: { type: ShadingType.CLEAR, fill: GRAY_HDR },
      verticalAlign: VerticalAlign.CENTER,
      width: { size: cols[0], type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 40, right: 40 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
        children: [new TextRun({ text, bold: true, size: PT(9) })],
      })],
    })
  }

  function dData(text, colIdx, bold = false) {
    return new TableCell({
      borders: thinBorder,
      shading: { type: ShadingType.CLEAR, fill: 'FFFFFF' },
      verticalAlign: VerticalAlign.CENTER,
      width: { size: cols[colIdx], type: WidthType.DXA },
      margins: { top: 0, bottom: 0, left: 40, right: 40 },
      children: [new Paragraph({
        spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
        children: [new TextRun({ text, bold, size: PT(9) })],
      })],
    })
  }

  return new Table({
    width: { size: tw, type: WidthType.DXA },
    columnWidths: cols,
    rows: [
      // Cabecera fila 1
      new TableRow({
        children: [
          dHdr('Lista de',          1, cols[0]),
          dHdr('Destinatarios:',    2, cols[1] + cols[2]),
          dHdr('Acuse de recibido', 2, cols[3] + cols[4]),
        ],
      }),
      // Cabecera fila 2
      new TableRow({
        children: [
          dHdr('',         1, cols[0], false),
          dHdr('Nombre:',  1, cols[1], false),
          dHdr('Cargo:',   1, cols[2], false),
          dHdr('Firma',    1, cols[3], false),
          dHdr('Fecha',    1, cols[4], false),
        ],
      }),
      // Para: → coordinador principal
      new TableRow({
        children: [
          dLabel('Para:'),
          dData(job.coordinador.nombre,      1, true),
          dData(job.coordinador.cargo_largo, 2, true),
          dData('', 3),
          dData('', 4),
        ],
      }),
      // Para: → destinatarios adicionales
      ...(job.destinatariosAdicionales || []).map(dest => new TableRow({
        children: [
          dLabel('Para:'),
          dData(dest.nombre, 1, true),
          dData(dest.cargo,  2, true),
          dData('', 3),
          dData('', 4),
        ],
      })),
      // C.c.p. → secretaria
      new TableRow({
        children: [
          dLabel('C.c.p.'),
          dData(job.secretaria.nombre + '.', 1, true),
          dData(job.secretaria.cargo_largo,  2, true),
          dData('', 3),
          dData('', 4),
        ],
      }),
      // C.c.p. → Jefe de Recursos Humanos
      new TableRow({
        children: [
          dLabel('C.c.p.'),
          dData(job.jefeRH.nombre,      1, true),
          dData(job.jefeRH.cargo_largo, 2, true),
          dData('', 3),
          dData('', 4),
        ],
      }),
      // C.c.p. → copias adicionales
      ...(job.copiasAdicionales || []).map(copia => new TableRow({
        children: [
          dLabel('C.c.p.'),
          dData(copia.nombre, 1, true),
          dData(copia.cargo,  2, true),
          dData('', 3),
          dData('', 4),
        ],
      })),
    ],
  })
}

// ─── Sección de firmas ────────────────────────────────────────────────────────

function buildFirmasSection(job) {
  const elements = []

  // ATENTAMENTE
  elements.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 0, line: 240, lineRule: 'auto' },
    children: [new TextRun({ text: 'ATENTAMENTE', bold: true })],
  }))
  elements.push(para('', { spaceBefore: 0, spaceAfter: 0 }))
  elements.push(para('', { spaceBefore: 0, spaceAfter: 0 }))

  // Firma del docente centrada
  elements.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 0, line: 240, lineRule: 'auto' },
    children: [new TextRun({ text: '_'.repeat(36) })],
  }))
  elements.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 40, after: 0, line: 240, lineRule: 'auto' },
    children: [new TextRun({ text: job.docente.nombre, bold: true })],
  }))
  elements.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80, line: 240, lineRule: 'auto' },
    children: [new TextRun({ text: job.cargoDocente })],
  }))

  // Tabla de destinatarios (5 columnas, cabecera gris)
  elements.push(buildDestinatariosTable(job))
  elements.push(para('NOTA: ANEXAR TANTAS FILAS COMO SEAN NECESARIAS.', {
    spaceBefore: 40, spaceAfter: 80, size: PT(8),
  }))

  return elements
}

// ─── Página 1: Memorándum completo ───────────────────────────────────────────

function buildMemoSection(job) {
  const { table: actTable, numbering: obsRef } = buildActividadesTable(job)

  const children = []

  // Título + logo flotante
  const logoPara = buildLogoParagraph()
  if (logoPara) {
    children.push(logoPara)
  } else {
    // Sin logo: título centrado
    children.push(para('Memorándum', {
      bold: true, size: PT(11), align: AlignmentType.CENTER, spaceBefore: 0, spaceAfter: 0,
    }))
  }

  // Dos líneas en blanco (espacio visual tras el logo)
  children.push(para('', { spaceBefore: 0, spaceAfter: 0 }))
  children.push(para('', { spaceBefore: 0, spaceAfter: 0 }))

  // Tabla de encabezado Para/De | Fecha/Ref/Asunto
  children.push(buildEncabezadoTable(job))

  // Párrafo 1 del cuerpo
  children.push(bodyPara(
    `Estimado maestro, reciba un saludo cordial y sirva el medio para compartir con usted las ` +
    `funciones que se estarán realizando de acuerdo a la categoría de contratación que tengo en ` +
    `este momento como ${job.cargoDocente}, en apegado a la normatividad institucional y cuidando ` +
    `un comportamiento ético con disciplina orden y respeto, en los programas educativos de ${job.programaLargo}.`
  ))

  children.push(para('', { spaceBefore: 0, spaceAfter: 0 }))

  // Párrafo 2
  children.push(bodyPara(
    `Por lo cual para el cuatrimestre ${job.cuatrimestre}, la carga académica quedó distribuida ` +
    `de la siguiente manera.`
  ))

  children.push(para('', { spaceBefore: 0, spaceAfter: 80 }))

  // Tabla de actividades
  children.push(actTable)

  children.push(para('', { spaceBefore: 0, spaceAfter: 0 }))

  // Párrafo 3
  children.push(bodyPara(
    'Por lo anterior agradezco su atención de acuerdo a lo establecido, reiterándome a sus órdenes para cualquier aclaración.'
  ))

  // Párrafo 4
  children.push(bodyPara('Reciba un cordial saludo.'))

  // Firmas, tabla de destinatarios y firmas finales
  children.push(...buildFirmasSection(job))

  return {
    properties: {
      page: {
        size: {
          width:       A4_W,
          height:      A4_H,
          orientation: PageOrientation.PORTRAIT,
        },
        margin: { top: M1, bottom: M1, left: M1, right: M1 },
      },
    },
    children,
    // Numbering para bullets de observaciones
  }
}

// ─── Página 2: Horario (landscape) ───────────────────────────────────────────

const HORA_RE = /^\d{1,2}[:.]\d{0,2}\s*[-–]/
const DIA_RE  = /lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado/i

// Paleta de colores por materia (igual que el componente FullCalendar)
const SUBJECT_COLORS = [
  'CB4335','8E44AD','3498DB','27AE60','E6B800',
  'E67E22','16A085','D35400','2C3E50','1A5276',
  '6C3483','117A65','7D6608','784212','4A235A',
]
const HDR_GREEN  = '1D9E75'  // encabezado de días — verde UPMH
const TIME_BG    = 'F2F2F2'  // fondo columna de hora
const EMPTY_BG   = 'FFFFFF'  // celda vacía

function normSubject(text) {
  return (text || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').trim().slice(0, 30)
}
function subjectColor(name, map) {
  const key = normSubject(name)
  if (!key) return EMPTY_BG
  if (!map.has(key)) map.set(key, SUBJECT_COLORS[map.size % SUBJECT_COLORS.length])
  return map.get(key)
}

// Extrae el color de fondo de una celda Excel como hex RGB (sin alfa), o null
function cellFill(excelCell) {
  const f = excelCell.fill
  if (!f) return null
  if (f.type === 'pattern' && f.fgColor) {
    const argb = f.fgColor.argb || f.fgColor.theme
    if (argb && typeof argb === 'string' && argb.length >= 6) {
      return argb.length === 8 ? argb.slice(2).toUpperCase() : argb.toUpperCase()
    }
  }
  return null
}

/** Extrae la duración en horas de un rango como "7:00 - 8:00" o "13:00 - 15:00" */
function parseHoraDuracion(horaStr) {
  const m = horaStr.match(/(\d{1,2})[:.](\d{0,2})\s*[-–]\s*(\d{1,2})[:.](\d{0,2})/)
  if (!m) return 1
  const inicio = parseInt(m[1]) + (parseInt(m[2] || '0') / 60)
  const fin    = parseInt(m[3]) + (parseInt(m[4] || '0') / 60)
  return Math.max(0, fin - inicio)
}

/** Clasifica una actividad del horario */
function clasificarActividad(texto) {
  const n = (texto || '').toLowerCase()
    .normalize('NFD').replace(/\p{Mn}/gu, '')
    .trim()
  if (!n) return null
  if (/tutori/.test(n))                                   return 'tutorias'
  if (/preparac|gestion|investigac|asesoria/.test(n))     return 'extraClase'
  return 'docencia'
}

/** Calcula el resumen de horas a partir de las filas del horario */
function calcularResumen(horarioRows) {
  if (!horarioRows || horarioRows.length < 2) return null

  let docencia = 0, tutorias = 0, extraClase = 0

  for (let i = 1; i < horarioRows.length; i++) {   // saltar fila de encabezado
    const row      = horarioRows[i]
    const horaText = row[0]?.text ?? ''
    if (!HORA_RE.test(horaText)) continue

    const horas = parseHoraDuracion(horaText)

    for (let j = 1; j < row.length; j++) {
      const texto = row[j]?.text ?? ''
      if (!texto) continue
      const cat = clasificarActividad(texto)
      if (cat === 'docencia')    docencia   += horas
      if (cat === 'tutorias')    tutorias   += horas
      if (cat === 'extraClase')  extraClase += horas
    }
  }

  return {
    docencia:   Math.round(docencia),
    tutorias:   Math.round(tutorias),
    culturales: 0,
    extraClase: Math.round(extraClase),
    total:      Math.round(docencia + tutorias + extraClase),
  }
}

/**
 * Calcula el nivel de escala óptimo para que el horario + resumen + firmas
 * quepan en una sola página landscape (márgenes 0.5").
 *
 * Ahora cada celda de actividad tiene +1 línea de rango de tiempo,
 * y las columnas de días son más anchas (~2"), así que CHARS_PER_LINE es mayor.
 */
function computeHorarioScale(horarioRows) {
  const defaults = { pt: 9, padH: 40, padV: 30, lineH: 240, sigBefore: 480, sepBefore: 80 }
  if (!horarioRows?.length) return defaults

  // Ancho de columna de día ≈ (10" - 0.49") / 5 cols ≈ 1.9" → ~25 chars a 9pt
  const CHARS_PER_LINE = 22

  let totalLines = 0
  for (let ri = 0; ri < horarioRows.length; ri++) {
    const row      = horarioRows[ri]
    const isHeader = ri === 0
    let maxLines   = 1
    for (let ci = 1; ci < row.length; ci++) {   // saltar col. de hora
      const txt = (row[ci]?.text || '').trim()
      if (!txt) continue
      if (isHeader) {
        maxLines = Math.max(maxLines, 1)
      } else {
        // +1 por la línea del rango de tiempo (ej. "9:00 - 12:00")
        const textLines = Math.ceil(txt.replace(/\n/g, ' ').length / CHARS_PER_LINE)
        maxLines = Math.max(maxLines, 1 + Math.max(textLines, 1))
      }
    }
    totalLines += maxLines
  }

  // Altura disponible para la tabla ≈ 7800 DXA
  // (landscape carta 12240 DXA − 2×0.5"=1440 márgenes − ~3000 títulos+resumen+firmas)
  // Líneas que caben: lineH DXA/línea
  //   9pt → 240 → ~32 líneas
  //   8pt → 213 → ~36 líneas
  //   7pt → 187 → ~41 líneas
  //   6pt → 160 → ~48 líneas
  //   5pt → 133 → ~58 líneas
  if (totalLines <= 32) return { pt: 9, padH: 40, padV: 30, lineH: 240, sigBefore: 480, sepBefore:  80 }
  if (totalLines <= 38) return { pt: 8, padH: 30, padV: 20, lineH: 213, sigBefore: 400, sepBefore:  60 }
  if (totalLines <= 46) return { pt: 7, padH: 20, padV: 10, lineH: 187, sigBefore: 320, sepBefore:  40 }
  if (totalLines <= 56) return { pt: 6, padH: 10, padV: 5,  lineH: 160, sigBefore: 240, sepBefore:  30 }
  return                       { pt: 5, padH: 6,  padV: 0,  lineH: 133, sigBefore: 180, sepBefore:  20 }
}

async function readHorarioTable(xlsxFile, sheetName) {
  if (!xlsxFile || !fs.existsSync(xlsxFile)) return null
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxFile)
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0]
  if (!ws) return null

  const totalCols = ws.columnCount || 10

  // Paso 1: localizar fila de encabezado de días y primera fila de hora
  let headerRowNum    = null
  let firstHoraRowNum = null

  for (let r = 1; r <= ws.rowCount; r++) {
    const row       = ws.getRow(r)
    const firstCell = cellText(row.getCell(1)).trim()

    if (HORA_RE.test(firstCell)) {
      firstHoraRowNum = r
      break
    }

    const rowJoined = Array.from({ length: totalCols }, (_, i) =>
      cellText(row.getCell(i + 1))
    ).join(' ')
    if (DIA_RE.test(rowJoined)) headerRowNum = r
  }

  if (firstHoraRowNum === null) return null

  // Paso 2: leer filas (encabezado + horas) — cada celda: { text, fill }
  const rawRows = []
  const startRow = headerRowNum ?? firstHoraRowNum

  for (let r = startRow; r <= ws.rowCount; r++) {
    const row       = ws.getRow(r)
    const firstCell = cellText(row.getCell(1)).trim()

    if (r > firstHoraRowNum && firstCell && !HORA_RE.test(firstCell)) break

    const rowData = []
    for (let c = 1; c <= totalCols; c++) {
      const ec = row.getCell(c)
      rowData.push({ text: cellText(ec).trim(), fill: cellFill(ec) })
    }
    rawRows.push(rowData)
  }

  if (!rawRows.length) return null

  // Paso 3: detectar columnas de sábado/domingo para excluirlas
  const headerRow0 = rawRows[0] || []
  const excludedCols = new Set()
  headerRow0.forEach((cell, idx) => {
    if (/s[aá]bado|domingo/i.test(cell.text)) excludedCols.add(idx)
  })

  // Filtrar columnas vacías (y excluir sábado/domingo)
  const usedCols = new Set([0])
  for (const row of rawRows) {
    row.forEach((cell, idx) => {
      if (cell.text && !excludedCols.has(idx)) usedCols.add(idx)
    })
  }
  const sortedCols = [...usedCols].sort((a, b) => a - b)

  return rawRows.map(row => sortedCols.map(c => row[c] ?? { text: '', fill: null }))
}

function buildResumenTable(resumen, tableWidth, fontSize) {
  if (!resumen) return null

  const FS = fontSize ?? PT(9)

  const HEADERS = ['Docencia', 'Tutorías', 'Culturales', 'Extra Clase', 'Total']
  const VALUES  = [
    String(resumen.docencia),
    String(resumen.tutorias),
    String(resumen.culturales),
    String(resumen.extraClase),
    String(resumen.total),
  ]
  const NUM_COLS = HEADERS.length
  const colW     = Math.floor(tableWidth / NUM_COLS)
  const grayBg   = 'F2F2F2'

  function hdrCell(text) {
    return new TableCell({
      borders: thinBorder,
      width: { size: colW, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: grayBg },
      margins: { top: 40, bottom: 40, left: 60, right: 60 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, size: FS, font: 'Arial' })],
      })],
    })
  }

  function valCell(text, bold = false) {
    return new TableCell({
      borders: thinBorder,
      width: { size: colW, type: WidthType.DXA },
      margins: { top: 40, bottom: 40, left: 60, right: 60 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold, size: FS, font: 'Arial' })],
      })],
    })
  }

  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: Array(NUM_COLS).fill(colW),
    rows: [
      // Fila de título fusionada
      new TableRow({
        children: [new TableCell({
          columnSpan: NUM_COLS,
          borders: thinBorder,
          width: { size: tableWidth, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: grayBg },
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Resumen de horas', bold: true, size: FS, font: 'Arial' })],
          })],
        })],
      }),
      // Fila de encabezados
      new TableRow({ children: HEADERS.map(h => hdrCell(h)) }),
      // Fila de valores
      new TableRow({
        children: VALUES.map((v, i) => valCell(v, i === VALUES.length - 1)),
      }),
    ],
  })
}

function buildHorarioSection(job, horarioRows) {
  // Calcular escala antes de construir cualquier elemento
  const scale = computeHorarioScale(horarioRows)
  const FS    = PT(scale.pt)   // font size en half-points

  const children = []

  // Títulos escalados según el tamaño de fuente elegido
  const titlePt    = Math.min(13, scale.pt + 4)
  const subtitlePt = Math.min(11, scale.pt + 2)

  children.push(para(job.docente.nombre.toUpperCase(), {
    bold: true, size: PT(titlePt), font: 'Arial', align: AlignmentType.CENTER, spaceBefore: 0, spaceAfter: 30,
  }))
  children.push(para(`Horario - ${job.cuatrimestre}`, {
    bold: true, size: PT(subtitlePt), font: 'Arial', align: AlignmentType.CENTER, spaceBefore: 0, spaceAfter: 60,
  }))

  // Ancho útil en landscape carta con márgenes 0.5": 11" - 2*0.5" = 10"
  const LAND_CONT_W = convertInchesToTwip(10)

  if (horarioRows && horarioRows.length) {
    const colorMap  = new Map()   // materia → color hex
    const numCols   = Math.max(...horarioRows.map(r => r.length))
    const timeColW  = 700   // columna de hora — angosta (≈ 0.49")
    const dayColW   = Math.floor((LAND_CONT_W - timeColW) / Math.max(numCols - 1, 1))
    const colW      = dayColW   // alias para compatibilidad con el resto del código

    // ── Calcular fusiones verticales (rowSpan) ───────────────────────────────
    // mergeMap[rowIdx][colIdx] = { rowSpan, skip }
    const mergeMap = horarioRows.map(row => row.map(() => ({ rowSpan: 1, skip: false })))

    for (let colIdx = 1; colIdx < numCols; colIdx++) {          // omitir col. de hora
      for (let rowIdx = 1; rowIdx < horarioRows.length; rowIdx++) {  // omitir encabezado
        if (mergeMap[rowIdx][colIdx]?.skip) continue
        const curText = (horarioRows[rowIdx][colIdx]?.text || '').trim()
        if (!curText) continue

        let span = 1
        while (rowIdx + span < horarioRows.length) {
          const nextText = (horarioRows[rowIdx + span]?.[colIdx]?.text || '').trim()
          if (nextText === curText) {
            mergeMap[rowIdx + span][colIdx].skip = true
            span++
          } else break
        }
        mergeMap[rowIdx][colIdx].rowSpan = span
      }
    }

    // ── Construir filas de la tabla ──────────────────────────────────────────
    const tableRows = horarioRows.map((rowData, rowIdx) => {
      const isHeader = rowIdx === 0
      const cells = []

      rowData.forEach(({ text }, colIdx) => {
        // Omitir celdas que están fusionadas en una celda superior
        if (!isHeader && mergeMap[rowIdx]?.[colIdx]?.skip) return

        const isTimeCol = colIdx === 0
        const rowSpan   = (!isHeader && !isTimeCol)
          ? (mergeMap[rowIdx]?.[colIdx]?.rowSpan ?? 1)
          : 1

        // ── Color de fondo y texto ─────────────────────────────────────────
        let bgColor, textColor
        if (isHeader) {
          bgColor   = isTimeCol ? '4A4A4A' : HDR_GREEN
          textColor = 'FFFFFF'
        } else if (isTimeCol) {
          bgColor   = TIME_BG
          textColor = '555555'
        } else if (text) {
          const subject = text.split('\n')[0].trim()
          bgColor   = subjectColor(subject, colorMap)
          textColor = 'FFFFFF'
        } else {
          bgColor   = EMPTY_BG
          textColor = '000000'
        }

        // Borde derecho más marcado en la columna de hora
        const cellBorders = isTimeCol
          ? {
              top:    { style: BorderStyle.SINGLE, size: 5,  color: 'cccccc' },
              bottom: { style: BorderStyle.SINGLE, size: 5,  color: 'cccccc' },
              left:   { style: BorderStyle.SINGLE, size: 5,  color: 'cccccc' },
              right:  { style: BorderStyle.SINGLE, size: 12, color: '888888' },
            }
          : thinBorder

        // En la columna de hora mostrar solo la hora de inicio ("7:00" en vez de "7:00 - 8:00")
        let displayText = text || ''
        if (isTimeCol && !isHeader && displayText) {
          const m = displayText.match(/^(\d{1,2}[:.]\d{2})/)
          if (m) displayText = m[1].replace('.', ':')
        }

        // Para celdas de actividad: calcular rango de tiempo y ponerlo arriba
        // igual que el FullCalendar ("9:00 - 12:00")
        let timeLabelRuns = []
        if (!isHeader && !isTimeCol && text) {
          const startRaw = horarioRows[rowIdx]?.[0]?.text || ''
          const endRaw   = horarioRows[rowIdx + rowSpan - 1]?.[0]?.text || ''
          const startT   = (startRaw.match(/^(\d{1,2}[:.]\d{2})/) || [])[1]?.replace('.', ':') || ''
          const endT     = (endRaw.match(/[-–]\s*(\d{1,2}[:.]\d{2})/) || [])[1]?.replace('.', ':') || ''
          const label    = startT && endT ? `${startT} - ${endT}` : startT
          if (label) timeLabelRuns = [
            new TextRun({ text: label, bold: true, size: Math.max(FS - 2, PT(6)), font: 'Arial', color: textColor }),
            new TextRun({ text: '', break: 1 }),
          ]
        }

        cells.push(new TableCell({
          rowSpan:       rowSpan > 1 ? rowSpan : undefined,
          borders:       cellBorders,
          shading:       { type: ShadingType.CLEAR, fill: bgColor },
          verticalAlign: VerticalAlign.TOP,
          width:         { size: isTimeCol ? timeColW : dayColW, type: WidthType.DXA },
          margins:       { top: scale.padV || 40, bottom: scale.padV || 40, left: isTimeCol ? 20 : scale.padH, right: isTimeCol ? 20 : scale.padH },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing:   { before: 0, after: 0, line: 240, lineRule: 'auto' },
            children: [
              ...timeLabelRuns,
              ...displayText.split('\n').map((line, li) =>
                new TextRun({
                  text:  line,
                  bold:  isHeader,
                  size:  FS,
                  font:  'Arial',
                  color: textColor,
                  break: li > 0 || timeLabelRuns.length > 0 ? 1 : 0,
                })
              ),
            ],
          })],
        }))
      })

      return new TableRow({ tableHeader: isHeader, children: cells })
    })

    children.push(new Table({
      width: { size: LAND_CONT_W, type: WidthType.DXA },
      columnWidths: [timeColW, ...Array(numCols - 1).fill(dayColW)],
      rows: tableRows,
    }))
  } else {
    children.push(para('(No se encontró archivo de horario para este docente)', {
      align: AlignmentType.CENTER,
    }))
  }

  children.push(para('', { spaceBefore: scale.sepBefore, spaceAfter: 0 }))

  // Tabla de resumen de horas (calculado desde el horario)
  const resumenTable = buildResumenTable(calcularResumen(horarioRows), LAND_CONT_W, FS)
  if (resumenTable) {
    children.push(resumenTable)
    children.push(para('', { spaceBefore: scale.sepBefore, spaceAfter: 0 }))
  }

  // Tabla de firmas (3 columnas: coordinador | docente | secretaria)
  const sigColW = Math.floor(LAND_CONT_W / 3)

  function sigCell(nombre, cargo) {
    return new TableCell({
      borders: thinBorder,
      width: { size: sigColW, type: WidthType.DXA },
      children: [
        new Paragraph({
          spacing: { before: scale.sigBefore, after: 0, line: 240, lineRule: 'auto' },
          children: [],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
          children: [new TextRun({ text: nombre, bold: true, size: FS })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
          children: [new TextRun({ text: cargo, size: FS })],
        }),
      ],
    })
  }

  children.push(new Table({
    width: { size: LAND_CONT_W, type: WidthType.DXA },
    columnWidths: [sigColW, sigColW, sigColW],
    rows: [new TableRow({
      children: [
        sigCell(job.docente.nombre,     job.cargoDocente),
        sigCell(job.coordinador.nombre, job.coordinador.cargo_largo),
        sigCell(job.secretaria.nombre,  job.secretaria.cargo_largo),
      ],
    })],
  }))

  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: {
          width:       convertInchesToTwip(8.5),
          height:      convertInchesToTwip(11),
          orientation: PageOrientation.LANDSCAPE,
        },
        margin: {
          top:    convertInchesToTwip(0.5),
          bottom: convertInchesToTwip(0.5),
          left:   convertInchesToTwip(0.5),
          right:  convertInchesToTwip(0.5),
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
    // Default del documento: Arial 9pt (solicitado por usuario)
    styles: {
      default: {
        document: {
          run: {
            font: 'Arial',
            size: PT(9),  // 18 half-points = 9pt
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'obs-bullets',
          levels: [{
            level:     0,
            format:    LevelFormat.BULLET,
            text:      '•',
            alignment: AlignmentType.LEFT,
            style: {
              run: { font: 'Calibri', size: PT(9) },
              paragraph: {
                indent: { left: 720, hanging: 360 },  // igual que plantilla original
              },
            },
          }],
        },
      ],
    },
    sections: [memoSection, horarioSection],
  })

  const buffer = await Packer.toBuffer(doc)
  fs.mkdirSync(path.dirname(job.outputPath), { recursive: true })
  fs.writeFileSync(job.outputPath, buffer)
}
