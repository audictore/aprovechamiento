import * as XLSX from 'xlsx'

export function parsearReporte(buffer, numParcial = 1) {
  const wb   = XLSX.read(buffer, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  const colCorte = numParcial + 1

  const grupos = []
  let i = 0

  while (i < rows.length) {
    const row  = rows[i].map(c => String(c ?? '').trim())
    const col0 = row[0] || ''

    const grupoMatch = col0.match(/^(\d+)\s*-\s*([A-Z])$/)

    if (grupoMatch) {
      const nombreGrupo = `${grupoMatch[1]}-${grupoMatch[2]}`

      // El tutor está en col1, las bajas en col6
      const col1 = row[1] || ''
      const col6 = row[6] || ''

      const tutorMatch = col1.match(/Tutor:\s*(.+)/i)
      const tutor      = tutorMatch ? tutorMatch[1].trim() : col1.trim()

      const bajasMatch = col6.match(/Bajas:\s*(\d+)/i)
      const bajas      = bajasMatch ? parseInt(bajasMatch[1]) : 0

      i += 2

      let alumnosTotal = 0
      const materias   = []

      while (i < rows.length) {
        const r         = rows[i].map(c => String(c ?? '').trim())
        const matNombre = r[0] || ''

        if (!matNombre || matNombre.match(/^\d+\s*-\s*[A-Z]$/)) break

        const docente  = r[1] && r[1].toLowerCase() !== 'no disponible' ? r[1] : ''
        const promedio = toFloat(r[colCorte])

        const { alumnos, reprobados } = parsearAlumnos(r[6] || '')
        if (alumnos > alumnosTotal) alumnosTotal = alumnos

        materias.push({ nombre: matNombre, docente, promedio, reprobados })
        i++
      }

      grupos.push({ grupo: nombreGrupo, tutor, alumnos: alumnosTotal, bajas, materias })
    } else {
      i++
    }
  }

  return grupos
}

function toFloat(val) {
  const n = parseFloat(val)
  return isNaN(n) || n <= 0 ? 0 : n
}

function parsearAlumnos(texto) {
  const match = texto.match(/(\d+)\s*\/\s*(\d+)/)
  if (match) return { alumnos: parseInt(match[1]), reprobados: parseInt(match[2]) }
  return { alumnos: 0, reprobados: 0 }
}