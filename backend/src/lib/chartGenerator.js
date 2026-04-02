import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { ChartJSNodeCanvas } = require('chartjs-node-canvas')

const COLORS = ['#1D9E75','#378ADD','#BA7517','#D85A30','#7F77DD','#D4537E','#639922','#985C3C']

export async function generarGraficaGrupos(grupos, titulo) {
  const width  = 700
  const height = 280
  const canvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' })
  const labels = grupos.map(g => g.nombre)
  const data   = grupos.map(g => +g.promedio.toFixed(2))
  return await canvas.renderToBuffer({
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: data.map(d => d < 8 ? '#D85A30' : '#1D9E75'), borderRadius: 5 }]
    },
    options: {
      responsive: false,
      plugins: { legend: { display: false }, title: { display: true, text: titulo, font: { size: 13, weight: 'bold' }, padding: { bottom: 12 } } },
      scales: { y: { min: 7, max: 10 } }
    }
  })
}

export async function generarGraficaMaterias(materias, titulo) {
  const width  = 700
  const height = Math.max(200, materias.length * 40 + 100)
  const canvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' })
  const labels = materias.map(m => m.nombre.length > 30 ? m.nombre.slice(0,30)+'…' : m.nombre)
  const data   = materias.map(m => +m.promedio.toFixed(2))
  return await canvas.renderToBuffer({
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: '#D85A30', borderRadius: 5 }]
    },
    options: {
      responsive: false,
      indexAxis: 'y',
      plugins: { legend: { display: false }, title: { display: true, text: titulo, font: { size: 13, weight: 'bold' }, padding: { bottom: 12 } } },
      scales: { x: { min: 6, max: 10 } }
    }
  })
}

export async function generarGraficaTodasMaterias(matMap, titulo) {
  const entradas = Object.entries(matMap)
    .map(([nombre, promedios]) => ({ nombre, promedio: promedios.reduce((a, b) => a + b, 0) / promedios.length }))
    .sort((a, b) => b.promedio - a.promedio)

  const width  = 700
  const height = Math.max(250, entradas.length * 35 + 100)
  const canvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' })
  const labels = entradas.map(m => m.nombre.length > 30 ? m.nombre.slice(0,30)+'…' : m.nombre)
  const data   = entradas.map(m => +m.promedio.toFixed(2))
  return await canvas.renderToBuffer({
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: data.map(d => d < 8 ? '#D85A30' : '#1D9E75'), borderRadius: 5 }]
    },
    options: {
      responsive: false,
      indexAxis: 'y',
      plugins: { legend: { display: false }, title: { display: true, text: titulo, font: { size: 13, weight: 'bold' }, padding: { bottom: 12 } } },
      scales: { x: { min: 7, max: 10 } }
    }
  })
}

export async function generarGraficaEvolucion(parciales) {
  // parciales: [{ label, grupos: [{ nombre, promedio }] }]
  const nombresGrupos = [...new Set(parciales.flatMap(p => p.grupos.map(g => g.nombre)))].sort()
  const width  = 700
  const height = 300
  const canvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' })

  return await canvas.renderToBuffer({
    type: 'line',
    data: {
      labels: parciales.map(p => p.label),
      datasets: nombresGrupos.map((nombre, idx) => ({
        label: nombre,
        data: parciales.map(p => {
          const g = p.grupos.find(g => g.nombre === nombre)
          return g ? +g.promedio.toFixed(2) : null
        }),
        borderColor: COLORS[idx % COLORS.length],
        backgroundColor: COLORS[idx % COLORS.length] + '33',
        tension: 0.3,
        pointRadius: 5
      }))
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: true, position: 'bottom' },
        title: { display: true, text: 'Evolución de promedio por grupo entre parciales', font: { size: 13, weight: 'bold' }, padding: { bottom: 12 } }
      },
      scales: { y: { min: 7, max: 10 } }
    }
  })
}