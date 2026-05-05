import ExcelJS from 'exceljs'

export function cellText(cell) {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('')
    if (v.text) return v.text
    if (v.result !== undefined) return String(v.result)
  }
  return String(v)
}

function extractNombreFromSheet(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= Math.min(ws.columnCount || 10, 10); c++) {
      const txt = cellText(row.getCell(c))
      const m = txt.match(/Nombre del docente\s*:?\s*(.+)/i)
      if (m) return m[1].trim()
    }
  }
  return null
}

export async function isMultiSheetHorario(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  return wb.worksheets.length >= 2
}

export async function parseHorario(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.worksheets[0]
  const nombreDocente = extractNombreFromSheet(ws)
  if (!nombreDocente) throw new Error(`No se encontró "Nombre del docente: ..." en ${file}`)
  return { nombreDocente, file, sheetName: null }
}

export async function parseHorarioMulti(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const results = []
  for (const ws of wb.worksheets) {
    const sheetName = ws.name.trim()
    if (!sheetName) continue
    const nombreFromCell = extractNombreFromSheet(ws)
    results.push({ nombreDocente: nombreFromCell || sheetName, file, sheetName })
  }
  return results
}
