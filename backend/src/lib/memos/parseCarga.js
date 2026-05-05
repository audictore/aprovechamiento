import ExcelJS from 'exceljs'

function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function stripTitle(name) {
  return String(name || '').replace(/^\s*(dr\.|dra\.|mtro\.|mtra\.|lic\.|ing\.|m\.c\.|m\.e\.|ph\.d\.)\s+/i, '').trim()
}

function asNum(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'object' && v.result !== undefined) v = v.result
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function cellStr(cell) {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('')
    if (v.text) return String(v.text)
    if (v.result !== undefined) return String(v.result)
  }
  return String(v)
}

export async function parseCarga(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('El archivo de carga no tiene hojas.')

  let headerRowNum = null
  const maxScan = Math.min(ws.rowCount, 20)
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= Math.max(ws.columnCount, 30); c++) {
      const raw = row.getCell(c).value
      if (!raw) continue
      const txt = typeof raw === 'object'
        ? (raw.text || (raw.result !== undefined ? String(raw.result) : '') || '')
        : String(raw)
      if (normalize(txt) === 'profesor') { headerRowNum = r; break }
    }
    if (headerRowNum !== null) break
  }
  if (headerRowNum === null) headerRowNum = 1

  const header = {}
  const hRow = ws.getRow(headerRowNum)
  for (let c = 1; c <= Math.max(ws.columnCount, 30); c++) {
    const raw = hRow.getCell(c).value
    if (!raw) continue
    const txt = typeof raw === 'object'
      ? (raw.text || (raw.result !== undefined ? String(raw.result) : '') || '')
      : String(raw)
    if (txt) header[normalize(txt)] = c
  }

  const col = (...keys) => { for (const k of keys) if (header[k] !== undefined) return header[k]; return null }
  const cPE   = col('pe')
  const cProf = col('profesor')
  const cCat  = col('categoria')
  const cNivel = col('nivel')
  const cDoc  = col('docencia')
  const cTut  = col('tutoria')
  const cAse  = col('asesoria')
  const cPrep = col('preparacion')
  const cInv  = col('investigacion')
  const cGest = col('gestion insti.', 'gestion institucional', 'gestion')

  if (!cProf || !cPE) throw new Error('No se encontraron columnas "PE" o "Profesor".')

  const docentes = []
  for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const nombreRaw = row.getCell(cProf).value
    if (!nombreRaw) continue
    const nombreStr = String(
      typeof nombreRaw === 'object' ? (nombreRaw.text || nombreRaw.result || '') : nombreRaw
    ).trim()
    if (!nombreStr) continue

    const cAsig = col('asignatura')
    const cProy = col('proyecto de investigacion', 'proyecto de investigación', 'proyecto investigacion')

    docentes.push({
      pe: cellStr(row.getCell(cPE)).trim(),
      nombre: nombreStr,
      nombreKey: normalize(stripTitle(nombreStr)),
      categoria: cellStr(row.getCell(cCat ?? 0)).trim(),
      nivel: cellStr(row.getCell(cNivel ?? 0)).trim(),
      horas: {
        docencia:      asNum(row.getCell(cDoc  ?? 0)?.value),
        tutoria:       asNum(row.getCell(cTut  ?? 0)?.value),
        asesoria:      asNum(row.getCell(cAse  ?? 0)?.value),
        preparacion:   asNum(row.getCell(cPrep ?? 0)?.value),
        investigacion: asNum(row.getCell(cInv  ?? 0)?.value),
        gestion:       asNum(row.getCell(cGest ?? 0)?.value),
      },
      asignatura:           cAsig ? cellStr(row.getCell(cAsig)).trim() : '',
      proyectoInvestigacion: cProy ? cellStr(row.getCell(cProy)).trim() : '',
    })
  }

  function findByName(fullName) {
    const key = normalize(stripTitle(fullName))
    let hit = docentes.find(d => d.nombreKey === key)
    if (hit) return hit
    hit = docentes.find(d => d.nombreKey.includes(key) || key.includes(d.nombreKey))
    if (hit) return hit
    const keyWords = key.split(' ').filter(Boolean)
    let bestScore = 0, bestHit = null
    for (const d of docentes) {
      const dWords = d.nombreKey.split(' ').filter(Boolean)
      const matches = keyWords.filter(w => dWords.some(dw => dw === w || dw.includes(w) || w.includes(dw)))
      const score = matches.length
      const threshold = Math.max(2, Math.ceil(Math.min(keyWords.length, dWords.length) * 0.5))
      if (score >= threshold && score > bestScore) { bestScore = score; bestHit = d }
    }
    if (bestHit) console.warn(`  [AVISO] "${fullName}" → coincidencia aproximada con "${bestHit.nombre}"`)
    return bestHit
  }

  return { docentes, findByName }
}

export { normalize, stripTitle }
