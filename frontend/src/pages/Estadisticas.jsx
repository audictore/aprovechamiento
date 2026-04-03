import { useState, useEffect, useRef } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart, CategoryScale, LinearScale,
  BarElement, LineElement, PointElement, Tooltip, Legend
} from 'chart.js'
import { getEstadisticas } from '../api.js'
import { useToast } from '../components/Toast.jsx'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend)

const COLORS  = ['#1D9E75','#378ADD','#BA7517','#D85A30','#7F77DD','#D4537E','#639922','#985C3C']
const barOpts = (min = 7) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales:  { y: { min, max: 10, ticks: { font: { size: 11 } } } }
})

export default function Estadisticas({ cuatrimestres }) {
  const [cuatriSel,     setCuatriSel]     = useState('')
  const [estadisticas,  setEstadisticas]  = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [parcialFiltro, setParcialFiltro] = useState(1)
  const statsRef         = useRef()
  const { addToast }     = useToast()

// Auto-seleccionar el cuatrimestre más reciente
useEffect(() => {
  if (cuatrimestres.length > 0 && !cuatriSel) {
    setCuatriSel(String(cuatrimestres[cuatrimestres.length - 1].id))
  }
}, [cuatrimestres])

  useEffect(() => {
    if (!cuatriSel) { setEstadisticas(null); return }
    setLoading(true)
    getEstadisticas(cuatriSel)
      .then(r => setEstadisticas(r.data))
      .finally(() => setLoading(false))
  }, [cuatriSel])

  const numerosParcialesDisponibles = estadisticas
    ? [...new Set(estadisticas.flatMap(p => p.parciales.map(pa => pa.numero)))].sort()
    : []

  const datosPorPrograma = estadisticas?.map(prog => {
    const parcial = prog.parciales.find(p => p.numero === parcialFiltro)
    return { nombre: prog.nombre, parcial }
  }).filter(p => p.parcial) || []

  const rankingGrupos = datosPorPrograma
    .flatMap(p => p.parcial.grupos.map(g => ({
      ...g,
      programa: p.nombre.length > 30 ? p.nombre.slice(0,30)+'…' : p.nombre
    })))
    .sort((a, b) => b.promedio - a.promedio)

  const todasMateriasEnRiesgo = datosPorPrograma
    .flatMap(p => p.parcial.materiasEnRiesgo.map(m => ({
      ...m,
      programa: p.nombre.length > 25 ? p.nombre.slice(0,25)+'…' : p.nombre
    })))
    .sort((a, b) => a.promedio - b.promedio)

  const cuatri = cuatrimestres.find(c => c.id === Number(cuatriSel))

  async function exportarPDF() {
    try {
      addToast('Generando PDF…', 'info')
      const elemento   = statsRef.current
      const canvas     = await html2canvas(elemento, { scale: 1.5, useCORS: true, backgroundColor: '#f5f5f3' })
      const imgData    = canvas.toDataURL('image/png')
      const pdf        = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfWidth   = pdf.internal.pageSize.getWidth()
      const pdfHeight  = (canvas.height * pdfWidth) / canvas.width
      const pageHeight = pdf.internal.pageSize.getHeight()
      let posY = 0
      while (posY < pdfHeight) {
        if (posY > 0) pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, -posY, pdfWidth, pdfHeight)
        posY += pageHeight
      }
      const label = parcialFiltro === 1 ? '1er_Parcial' : parcialFiltro === 2 ? '2do_Parcial' : '3er_Parcial'
      pdf.save(`Estadisticas_${cuatri?.nombre || 'Global'}_${label}.pdf`)
      addToast('PDF exportado correctamente', 'success')
    } catch (e) {
      addToast('Error al generar PDF: ' + e.message, 'error')
    }
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Estadísticas globales</h2>
        {datosPorPrograma.length > 0 && (
          <button className="btn" style={{ fontSize:11 }} onClick={exportarPDF}>
            ↓ PDF
          </button>
        )}
      </div>

      <div className="tcard" style={{ padding:16, marginBottom:16, display:'flex', gap:16, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div className="field" style={{ margin:0, minWidth:220 }}>
          <label>Cuatrimestre</label>
          <select value={cuatriSel} onChange={e => setCuatriSel(e.target.value)}>
            <option value="">Selecciona…</option>
            {cuatrimestres.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        {numerosParcialesDisponibles.length > 0 && (
          <div style={{ display:'flex', gap:6 }}>
            {numerosParcialesDisponibles.map(n => (
              <button
                key={n}
                className={`btn ${parcialFiltro === n ? 'btn-primary' : ''}`}
                style={{ fontSize:11 }}
                onClick={() => setParcialFiltro(n)}
              >
                {n === 1 ? '1er' : n === 2 ? '2do' : '3er'} Parcial
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="loading"><span className="spinner" /> Cargando estadísticas…</div>}
      {!loading && !estadisticas && <div className="empty-state">Selecciona un cuatrimestre para ver las estadísticas.</div>}
      {!loading && estadisticas && datosPorPrograma.length === 0 && <div className="empty-state">No hay datos para este parcial.</div>}

      {!loading && datosPorPrograma.length > 0 && (
        <div ref={statsRef}>
          <div className="metrics" style={{ gridTemplateColumns: `repeat(${datosPorPrograma.length}, 1fr)` }}>
            {datosPorPrograma.map((p, i) => (
              <div key={i} className="metric">
                <div className="mlabel" style={{ fontSize:10 }}>
                  {p.nombre.length > 35 ? p.nombre.slice(0,35)+'…' : p.nombre}
                </div>
                <div className="mval" style={{ color: p.parcial.promedioGeneral < 8 ? '#A32D2D' : '#1D9E75' }}>
                  {p.parcial.promedioGeneral}
                </div>
                <div className="msub">{p.parcial.totalAlumnos} alumnos</div>
              </div>
            ))}
          </div>

          <div className="chart-grid single" style={{ marginBottom:20 }}>
            <div className="chart-card">
              <h3>Promedio general por programa</h3>
              <div className="chart-wrap" style={{ height:220 }}>
                <Bar
                  data={{
                    labels: datosPorPrograma.map(p => p.nombre.length > 25 ? p.nombre.slice(0,25)+'…' : p.nombre),
                    datasets: [{
                      data: datosPorPrograma.map(p => p.parcial.promedioGeneral),
                      backgroundColor: datosPorPrograma.map(p => p.parcial.promedioGeneral < 8 ? '#D85A30' : '#1D9E75'),
                      borderRadius: 5
                    }]
                  }}
                  options={barOpts()}
                />
              </div>
            </div>
          </div>

          {estadisticas.map(prog => prog.parciales.length > 1 && (
            <div key={prog.id} className="chart-grid single" style={{ marginBottom:20 }}>
              <div className="chart-card">
                <h3>Evolución — {prog.nombre.length > 50 ? prog.nombre.slice(0,50)+'…' : prog.nombre}</h3>
                <div className="chart-wrap" style={{ height:260 }}>
                  <Line
                    data={{
                      labels: prog.parciales.map(p => p.label),
                      datasets: (() => {
                        const nombresGrupos = [...new Set(prog.parciales.flatMap(p => p.grupos.map(g => g.nombre)))].sort()
                        return nombresGrupos.map((nombre, idx) => ({
                          label: nombre,
                          data: prog.parciales.map(p => {
                            const g = p.grupos.find(g => g.nombre === nombre)
                            return g ? g.promedio : null
                          }),
                          borderColor:     COLORS[idx % COLORS.length],
                          backgroundColor: COLORS[idx % COLORS.length] + '33',
                          tension: 0.3, pointRadius: 5
                        }))
                      })()
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: { legend: { display: true, position: 'bottom' } },
                      scales: { y: { min: 7, max: 10 } }
                    }}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="chart-grid single" style={{ marginBottom:20 }}>
            <div className="chart-card">
              <h3>Ranking de grupos — todos los programas</h3>
              <div className="chart-wrap" style={{ height: rankingGrupos.length * 36 + 60 }}>
                <Bar
                  data={{
                    labels: rankingGrupos.map(g => `${g.nombre} (${g.programa})`),
                    datasets: [{
                      data: rankingGrupos.map(g => g.promedio),
                      backgroundColor: rankingGrupos.map(g => g.promedio < 8 ? '#D85A30' : '#1D9E75'),
                      borderRadius: 5
                    }]
                  }}
                  options={{ ...barOpts(), indexAxis: 'y', scales: { x: { min: 7, max: 10 } } }}
                />
              </div>
            </div>
          </div>

          {todasMateriasEnRiesgo.length > 0 && (
            <div className="chart-grid single" style={{ marginBottom:20 }}>
              <div className="chart-card">
                <h3>Materias en riesgo — todos los programas</h3>
                <div className="chart-wrap" style={{ height: todasMateriasEnRiesgo.length * 40 + 80 }}>
                  <Bar
                    data={{
                      labels: todasMateriasEnRiesgo.map(m => `${m.nombre.slice(0,25)} (${m.programa})`),
                      datasets: [{
                        data: todasMateriasEnRiesgo.map(m => m.promedio),
                        backgroundColor: '#D85A30',
                        borderRadius: 5
                      }]
                    }}
                    options={{ ...barOpts(6), indexAxis: 'y', scales: { x: { min: 6, max: 10 } } }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="tcard">
            <table>
              <thead>
                <tr><th>#</th><th>Grupo</th><th>Programa</th><th>Alumnos</th><th>Promedio</th></tr>
              </thead>
              <tbody>
                {rankingGrupos.map((g, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight:700, color:'#aaa' }}>{i + 1}</td>
                    <td><strong>{g.nombre}</strong></td>
                    <td style={{ fontSize:11, color:'#aaa' }}>{g.programa}</td>
                    <td>{g.alumnos}</td>
                    <td>
                      <strong style={{ color: g.promedio >= 9 ? '#0F6E56' : g.promedio >= 8 ? '#1a1a1a' : '#A32D2D' }}>
                        {g.promedio}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}