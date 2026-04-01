import { useState, useEffect, useRef } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  Chart, CategoryScale, LinearScale,
  BarElement, Tooltip, Legend
} from 'chart.js'
import { getReporte, uploadExcel } from '../api.js'

Chart.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const COLORS  = ['#1D9E75','#378ADD','#BA7517','#D85A30','#7F77DD','#D4537E','#639922','#985C3C']
const barOpts = (min = 7) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales:  { y: { min, max: 10, ticks: { font: { size: 11 } } } }
})

export default function Dashboard({ seleccion, onReload }) {
  const [reporte,   setReporte]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [drag,      setDrag]      = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    setLoading(true)
    setReporte(null)
    getReporte(seleccion.parcial.id)
      .then(r  => setReporte(r.data))
      .catch(() => setReporte(null))
      .finally(() => setLoading(false))
  }, [seleccion.parcial.id])

  async function handleFile(file) {
    if (!file) return
    setUploading(true)
    try {
      await uploadExcel(seleccion.cuatri.id, seleccion.parcial.numero, file)
      const r = await getReporte(seleccion.parcial.id)
      setReporte(r.data)
      onReload()
    } catch (e) {
      alert('Error al procesar el archivo: ' + (e.response?.data?.error ?? e.message))
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <div className="loading"><span className="spinner" /> Cargando reporte…</div>

  if (!reporte || !reporte.grupos.length) {
    return (
      <div
        className={`upload-zone ${drag ? 'drag' : ''}`}
        onDragOver={e  => { e.preventDefault(); setDrag(true)  }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current.click()}
      >
        <div style={{ fontSize: 40 }}>📂</div>
        <p style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>
          {uploading ? 'Procesando archivo…' : 'Sin datos para este parcial'}
        </p>
        <p>Arrastra el archivo Excel aquí o haz clic para seleccionarlo</p>
        {!uploading && <button className="upload-btn">Seleccionar .xlsx</button>}
        {uploading  && <div className="loading" style={{ justifyContent:'center', marginTop:12 }}><span className="spinner" /> Importando…</div>}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={e => handleFile(e.target.files[0])} />
      </div>
    )
  }

  const grupos     = reporte.grupos
  const totAlumnos = grupos.reduce((s, g) => s + g.alumnos, 0)
  const totRep     = grupos.reduce((s, g) => s + g.materias.reduce((ss, m) => ss + m.reprobados, 0), 0)

  const grupoConProm = g => {
    const mats = g.materias.filter(m => m.promedio > 0)
    return mats.length ? mats.reduce((s, m) => s + m.promedio, 0) / mats.length : 0
  }

  const avgGeneral = (grupos.reduce((s, g) => s + grupoConProm(g), 0) / grupos.length).toFixed(2)
  const mejorGrupo = [...grupos].sort((a, b) => grupoConProm(b) - grupoConProm(a))[0]
  const grupoLabels = grupos.map(g => g.nombre)
  const grupoAvgs   = grupos.map(g => +grupoConProm(g).toFixed(2))
  const grupoReps   = grupos.map(g => g.materias.reduce((s, m) => s + m.reprobados, 0))

  const matMap = {}
  grupos.forEach(g => g.materias.forEach(m => {
    if (m.promedio > 0) (matMap[m.nombre] = matMap[m.nombre] || []).push(m.promedio)
  }))
  const matNombres = Object.keys(matMap)
  const matAvgs    = matNombres.map(n => +(matMap[n].reduce((a, b) => a + b, 0) / matMap[n].length).toFixed(2))

  return (
    <>
      <div className="reimport-btn">
        <button className="btn" style={{ fontSize: 11 }} onClick={() => fileRef.current.click()}>
          Reimportar Excel
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={e => handleFile(e.target.files[0])} />
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="mlabel">Total alumnos</div>
          <div className="mval">{totAlumnos}</div>
          <div className="msub">{grupos.length} grupos</div>
        </div>
        <div className="metric">
          <div className="mlabel">Promedio general</div>
          <div className="mval">{avgGeneral}</div>
          <div className="msub">{seleccion.parcial.label}</div>
        </div>
        <div className="metric">
          <div className="mlabel">Reprobados</div>
          <div className="mval" style={{ color: '#A32D2D' }}>{totRep}</div>
          <div className="msub">todos los grupos</div>
        </div>
        <div className="metric">
          <div className="mlabel">Mejor grupo</div>
          <div className="mval">{mejorGrupo?.nombre ?? '—'}</div>
          <div className="msub">Prom. {grupoConProm(mejorGrupo).toFixed(2)}</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>Promedio por grupo</h3>
          <div className="chart-wrap">
            <Bar data={{ labels: grupoLabels, datasets: [{ data: grupoAvgs, backgroundColor: COLORS, borderRadius: 5 }] }} options={barOpts()} />
          </div>
        </div>
        <div className="chart-card">
          <h3>Reprobados por grupo</h3>
          <div className="chart-wrap">
            <Bar
              data={{ labels: grupoLabels, datasets: [{ data: grupoReps, backgroundColor: grupoReps.map(r => r === 0 ? '#1D9E75' : r <= 3 ? '#BA7517' : '#D85A30'), borderRadius: 5 }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { stepSize: 1 } } } }}
            />
          </div>
        </div>
      </div>

      <div className="chart-grid single">
        <div className="chart-card">
          <h3>Promedio por materia — entre grupos</h3>
          <div className="chart-wrap" style={{ height: matNombres.length * 36 + 60 }}>
            <Bar
              data={{ labels: matNombres.map(n => n.length > 30 ? n.slice(0,30)+'…' : n), datasets: [{ data: matAvgs, backgroundColor: COLORS, borderRadius: 5 }] }}
              options={{ ...barOpts(), indexAxis: 'y', scales: { x: { min: 7, max: 10 } } }}
            />
          </div>
        </div>
      </div>

      <div className="tcard">
        <table>
          <thead>
            <tr><th>Grupo</th><th>Tutor</th><th>Alumnos</th><th>Promedio</th><th>Reprobados</th></tr>
          </thead>
          <tbody>
            {grupos.map(g => {
              const avg = grupoConProm(g).toFixed(2)
              const rep = g.materias.reduce((s, m) => s + m.reprobados, 0)
              return (
                <tr key={g.id}>
                  <td><strong>{g.nombre}</strong></td>
                  <td style={{ fontSize: 11, color: '#aaa' }}>{g.tutor || '—'}</td>
                  <td>{g.alumnos}</td>
                  <td><strong style={{ color: +avg >= 9 ? '#0F6E56' : +avg >= 8 ? '#1a1a1a' : '#A32D2D' }}>{avg}</strong></td>
                  <td><span className={`badge ${rep === 0 ? 'badge-ok' : rep <= 3 ? 'badge-warn' : 'badge-bad'}`}>{rep}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}