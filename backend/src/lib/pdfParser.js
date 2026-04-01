import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

export async function parsearPDF(buffer, numParcial) {
  const data = await pdfParse(buffer)
  const texto = data.text

  // Extraer nombre del grupo desde el PDF
  const grupoMatch = texto.match(/Grupo:\s*(\d+)[°\s]*([A-Z])/i)
  const grupo = grupoMatch ? `${grupoMatch[1]}-${grupoMatch[2]}` : null

  if (!grupo) return null

  // Índice de columna del promedio según parcial
  // El PDF tiene columnas: M1 M2 ... P | M1 M2 ... P | M1 M2 ... P
  // Necesitamos el P (promedio) del parcial seleccionado
  const parcialLabels = ['Primer Parcial', 'Segundo Parcial', 'Tercer Parcial']
  const labelBuscado  = parcialLabels[numParcial - 1]

  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)

  let reprobados  = 0
  let totalAlumnos = 0
  let leyendoAlumnos = false

  for (const linea of lineas) {
    // Detectar inicio de tabla de alumnos (línea con matrícula numérica)
    const esAlumno = linea.match(/^(\d{9})\s+(.+?)\s+([\d.]+)/)
    if (!esAlumno) continue

    // Extraer todos los números de la línea
    const nums = linea.match(/[\d.]+/g)?.map(Number) || []
    if (nums.length < 2) continue

    // El PDF tiene estructura: matrícula + nombre + notas M1..Mn + P (por cada parcial)
    // Necesitamos encontrar el promedio P del parcial correcto
    // Buscamos grupos de números separados por el patrón de materias
    const promedio = extraerPromedioParcial(nums, numParcial)
    if (promedio === null) continue

    totalAlumnos++
    if (promedio < 7 && promedio > 0) reprobados++
  }

  return { grupo, reprobados, totalAlumnos }
}

function extraerPromedioParcial(nums, numParcial) {
  // Quitar la matrícula (primer número de 9 dígitos aprox)
  // Los números restantes son: [M1,M2,...,Mn,P] repetido 3 veces
  // Necesitamos identificar dónde está el P de cada parcial

  // Estrategia: el promedio P de cada parcial es el que viene
  // después de todas las materias de ese parcial
  // Como no sabemos cuántas materias hay, usamos el patrón:
  // los números del PDF están ordenados como aparecen en la tabla

  // Filtrar la matrícula (número >= 100000000)
  const sinMatricula = nums.filter(n => n < 100000000)

  // Cada parcial termina en un promedio P
  // Detectamos los promedios P buscando el patrón de 3 grupos
  // El total de columnas por parcial es el mismo en todos
  const totalCols = sinMatricula.length

  // Si hay 3 parciales, dividir en 3 partes iguales
  const colsPorParcial = Math.floor(totalCols / 3)
  if (colsPorParcial === 0) return null

  // El promedio P está al final de cada grupo
  const idxP = (numParcial * colsPorParcial) - 1
  if (idxP >= sinMatricula.length) return null

  return sinMatricula[idxP]
}