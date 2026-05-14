import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'
import { cellText } from './parseHorario.js'

const COLORS = [
  '#CB4335','#8E44AD','#3498DB','#27AE60','#F1C40F',
  '#E67E22','#16A085','#D35400','#2C3E50','#1A5276',
  '#6C3483','#117A65','#7D6608','#784212','#4A235A',
]

const DIA_OFFSETS = {
  lunes: 0, martes: 1,
  miercoles: 2, miércoles: 2,
  jueves: 3, viernes: 4,
  sabado: 5, sábado: 5,
}

function normalize(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/\p{Mn}/gu, '').trim()
}

function colorForSubject(name, map) {
  const key = normalize(name).slice(0, 30)
  if (!map.has(key)) map.set(key, COLORS[map.size % COLORS.length])
  return map.get(key)
}

function parseTimeRange(text) {
  const m = text.match(/(\d{1,2})[:.](\d{0,2})\s*[-–]\s*(\d{1,2})[:.](\d{0,2})/)
  if (!m) return null
  return {
    startH: +m[1], startM: +(m[2] || 0),
    endH:   +m[3], endM:   +(m[4] || 0),
  }
}

function mondayOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function toISO(base, offsetDays, h, min) {
  const d = new Date(base)
  d.setDate(d.getDate() + offsetDays)
  d.setHours(h, min, 0, 0)
  return d.toISOString()
}

export async function parseCalendarEvents(xlsxFile, sheetName) {
  if (!fs.existsSync(xlsxFile)) throw new Error('Archivo no encontrado: ' + xlsxFile)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxFile)

  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0]
  if (!ws) throw new Error('Hoja no encontrada: ' + sheetName)

  const totalCols = Math.min(ws.columnCount || 10, 10)

  // 1. Encontrar fila de encabezado de días
  let headerRowNum = null
  let colDayMap = {}   // col (1-indexed) → dayOffset

  for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
    const row = ws.getRow(r)
    const rowNorm = Array.from({ length: totalCols }, (_, i) => normalize(cellText(row.getCell(i + 1))))
    const hasDia = rowNorm.some(c => Object.keys(DIA_OFFSETS).some(d => c.includes(d)))
    if (hasDia) {
      headerRowNum = r
      rowNorm.forEach((cell, idx) => {
        for (const [dia, off] of Object.entries(DIA_OFFSETS)) {
          if (cell.includes(dia)) { colDayMap[idx + 1] = off; break }
        }
      })
      break
    }
  }

  if (!headerRowNum) throw new Error('No se encontró encabezado de días en la hoja')

  // 2. Leer filas de horario
  const monday = mondayOfWeek(new Date())
  const colorMap = new Map()
  const events = []

  for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const horaText = cellText(row.getCell(1)).trim()
    const timeRange = parseTimeRange(horaText)
    if (!timeRange) continue

    for (const [colStr, dayOff] of Object.entries(colDayMap)) {
      const col = +colStr
      const text = cellText(row.getCell(col)).trim()
      if (!text) continue

      const subject = text.split('\n')[0].trim()
      const color = colorForSubject(subject, colorMap)

      events.push({
        title: text.replace(/\n/g, ' — '),
        start: toISO(monday, dayOff, timeRange.startH, timeRange.startM),
        end:   toISO(monday, dayOff, timeRange.endH,   timeRange.endM),
        backgroundColor: color,
        borderColor:     color,
        extendedProps:   { subject, dayOff },
      })
    }
  }

  return events
}

export async function listHorarioSheets(horarioDir) {
  if (!fs.existsSync(horarioDir)) return []
  const files = fs.readdirSync(horarioDir).filter(f => /\.(xlsx|xls)$/i.test(f))
  const result = []

  for (const fname of files) {
    const fpath = path.join(horarioDir, fname)
    try {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.readFile(fpath)
      const sheets = wb.worksheets.map(ws => ws.name)
      result.push({ file: fname, sheets })
    } catch {
      result.push({ file: fname, sheets: [] })
    }
  }
  return result
}
