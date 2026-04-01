import { createRequire } from 'module'
const require = createRequire(import.meta.url)

export async function parsearPDF(buffer, numParcial) {
  const { PdfReader } = require('pdfreader')

  return new Promise((resolve, reject) => {
    const reader  = new PdfReader()
    const filas   = {}
    let grupo     = null

    reader.parseBuffer(buffer, (err, item) => {
      if (err) { reject(err); return }

      if (!item) {
        const resultado = procesarFilas(filas, grupo, numParcial)
        resolve(resultado)
        return
      }

      if (item.text) {
        if (!grupo) {
          const m = item.text.match(/^(\d+)[°\s]+([A-Z])$/)
          if (m) grupo = `${m[1]}-${m[2]}`
        }

        const y = item.y?.toFixed(2)
        if (y) {
          if (!filas[y]) filas[y] = []
          filas[y].push({ x: item.x, text: item.text.trim() })
        }
      }
    })
  })
}

function procesarFilas(filas, grupo, numParcial) {
  let reprobados   = 0
  let totalAlumnos = 0

  const ysOrdenados = Object.keys(filas)
    .map(Number)
    .sort((a, b) => a - b)

  // Primero encontrar la fila de encabezado con M1, M2, P para detectar posiciones
  let posicionesP = []

  for (const y of ysOrdenados) {
    const celdas = filas[y.toFixed(2)].sort((a, b) => a.x - b.x)
    const textos = celdas.map(c => c.text)

    // Detectar fila de encabezado M1 M2 ... P
    const tieneM1 = textos.some(t => t === 'M1')
    const tieneP  = textos.filter(t => t === 'P').length >= 2

    if (tieneM1 && tieneP) {
      // Guardar las posiciones X de las columnas P
      posicionesP = celdas
        .filter(c => c.text === 'P')
        .map(c => c.x)
      break
    }
  }

  // Si no encontramos encabezado, usar método anterior
  if (posicionesP.length < numParcial) {
    return procesarFilasSinEncabezado(filas, grupo, numParcial, ysOrdenados)
  }

  // La posición X de la columna P del parcial seleccionado
  const xP = posicionesP[numParcial - 1]

  for (const y of ysOrdenados) {
    const celdas = filas[y.toFixed(2)].sort((a, b) => a.x - b.x)
    const textos = celdas.map(c => c.text)

    // Verificar que la primera celda sea matrícula
    const primeracelda = textos[0]
    if (!primeracelda || !/^\d{9}$/.test(primeracelda)) continue

    // Buscar el valor en la columna P del parcial seleccionado
    // La celda más cercana a xP
    const celdaP = celdas.reduce((closer, c) => {
      if (!closer) return c
      return Math.abs(c.x - xP) < Math.abs(closer.x - xP) ? c : closer
    }, null)

    if (!celdaP) continue

    const promedio = parseFloat(celdaP.text)
    if (isNaN(promedio) || promedio === 0) continue

    totalAlumnos++
    if (promedio < 7) reprobados++
  }

  return { grupo, reprobados, totalAlumnos }
}

function procesarFilasSinEncabezado(filas, grupo, numParcial, ysOrdenados) {
  let reprobados   = 0
  let totalAlumnos = 0

  for (const y of ysOrdenados) {
    const celdas = filas[y.toFixed(2)].sort((a, b) => a.x - b.x)
    const textos = celdas.map(c => c.text)

    const primeracelda = textos[0]
    if (!primeracelda || !/^\d{9}$/.test(primeracelda)) continue

    const nums = textos
      .map(t => parseFloat(t))
      .filter(n => !isNaN(n) && n >= 0 && n <= 10)

    if (nums.length < 6) continue

    const tamBloque = Math.floor(nums.length / 3)
    if (tamBloque < 2) continue

    const idxP     = (tamBloque * numParcial) - 1
    const promedio = nums[idxP]

    if (!promedio || promedio === 0) continue

    totalAlumnos++
    if (promedio < 7) reprobados++
  }

  return { grupo, reprobados, totalAlumnos }
}