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

export default function Dashboard({ seleccion, onReload, esAdmin }) {
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
      const numParcial = seleccion.parcial.numero || seleccion.parcial.id
      await uploadExcel(
        seleccion.cuatri.id,
        seleccion.programa.nombre,
        numParcial,
        file
      )
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
        onClick={() => esAdmin && fileRef.current.click()}
      >
        <div style={{ fontSize: 40 }}>📂</div>
        <p style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>
          {uploading ? 'Procesando archivo…' : 'Sin datos para este parcial'}
        </p>
        {esAdmin && <p>Arrastra el archivo Excel aquí o haz clic para seleccionarlo</p>}
        {esAdmin && !uploading && <button className="upload-btn">Seleccionar .xlsx</button>}
        {uploading && <div className="loading" style={{ justifyContent:'center', marginTop:12 }}><span className="spinner" /> Importando…</div>}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={e => handleFile(e.target.files[0])} />
      </div>
    )
  }

  const grupos     = reporte.grupos
  const totAlumnos = grupos.reduce((s, g) => s + g.alumnos, 0)

  const grupoConProm = g => {
    const mats = g.materias.filter(m => m.promedio > 0)
    return mats.length ? mats.reduce((s, m) => s + m.promedio, 0) / mats.length : 0
  }

  const avgGeneral  = (grupos.reduce((s, g) => s + grupoConProm(g), 0) / grupos.length).toFixed(2)
  const mejorGrupo  = [...grupos].sort((a, b) => grupoConProm(b) - grupoConProm(a))[0]
  const grupoLabels = grupos.map(g => g.nombre)
  const grupoAvgs   = grupos.map(g => +grupoConProm(g).toFixed(2))

  // Grupos en riesgo (promedio < 8)
  const gruposEnRiesgo = grupos.filter(g => grupoConProm(g) < 8)

  // Materias en riesgo (promedio < 8 en al menos un grupo)
  const matMap = {}
  grupos.forEach(g => g.materias.forEach(m => {
    if (m.promedio > 0) {
      if (!matMap[m.nombre]) matMap[m.nombre] = []
      matMap[m.nombre].push(m.promedio)
    }
  }))
  const materiasEnRiesgo = Object.entries(matMap)
    .map(([nombre, promedios]) => ({
      nombre,
      promedio: promedios.reduce((a, b) => a + b, 0) / promedios.length
    }))
    .filter(m => m.promedio < 8)
    .sort((a, b) => a.promedio - b.promedio)

  const matNombres = Object.keys(matMap)
  const matAvgs    = matNombres.map(n => +(matMap[n].reduce((a, b) => a + b, 0) / matMap[n].length).toFixed(2))

  return (
    <>
      {esAdmin && (
        <div className="reimport-btn">
          <button className="btn" style={{ fontSize: 11 }} onClick={() => fileRef.current.click()}>
            Reimportar Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={e => handleFile(e.target.files[0])} />
        </div>
      )}

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
          <div className="mlabel">Grupos en riesgo</div>
          <div className="mval" style={{ color: gruposEnRiesgo.length > 0 ? '#A32D2D' : '#0F6E56' }}>
            {gruposEnRiesgo.length}
          </div>
          <div className="msub">
            {gruposEnRiesgo.length === 0
              ? 'todos por encima de 8'
              : gruposEnRiesgo.map(g => g.nombre).join(', ')}
          </div>
        </div>
        <div className="metric">
          <div className="mlabel">Materias en riesgo</div>
          <div className="mval" style={{ color: materiasEnRiesgo.length > 0 ? '#A32D2D' : '#0F6E56' }}>
            {materiasEnRiesgo.length}
          </div>
          <div className="msub">
            {materiasEnRiesgo.length === 0
              ? 'todas por encima de 8'
              : `${materiasEnRiesgo[0].nombre.slice(0,20)}… y más`}
          </div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>Promedio por grupo</h3>
          <div className="chart-wrap">
            <Bar
              data={{ labels: grupoLabels, datasets: [{ data: grupoAvgs, backgroundColor: grupoAvgs.map(a => a < 8 ? '#D85A30' : '#1D9E75'), borderRadius: 5 }] }}
              options={barOpts()}
            />
          </div>
        </div>
        <div className="chart-card">
          <h3>Materias en riesgo (prom. {'<'} 8)</h3>
          <div className="chart-wrap">
            {materiasEnRiesgo.length === 0
              ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#1D9E75', fontWeight:600 }}>Todas las materias están bien ✓</div>
              : <Bar
                  data={{
                    labels: materiasEnRiesgo.map(m => m.nombre.length > 25 ? m.nombre.slice(0,25)+'…' : m.nombre),
                    datasets: [{ data: materiasEnRiesgo.map(m => +m.promedio.toFixed(2)), backgroundColor: '#D85A30', borderRadius: 5 }]
                  }}
                  options={{ ...barOpts(6), indexAxis: 'y', scales: { x: { min: 6, max: 10 } } }}
                />
            }
          </div>
        </div>
      </div>

      <div className="chart-grid single">
        <div className="chart-card">
          <h3>Promedio por materia — entre grupos</h3>
          <div className="chart-wrap" style={{ height: matNombres.length * 36 + 60 }}>
            <Bar
              data={{
                labels:   matNombres.map(n => n.length > 30 ? n.slice(0,30)+'…' : n),
                datasets: [{ data: matAvgs, backgroundColor: matAvgs.map(a => a < 8 ? '#D85A30' : '#1D9E75'), borderRadius: 5 }]
              }}
              options={{ ...barOpts(), indexAxis: 'y', scales: { x: { min: 7, max: 10 } } }}
            />
          </div>
        </div>
      </div>

      <div className="tcard">
        <table>
          <thead>
            <tr><th>Grupo</th><th>Tutor</th><th>Alumnos</th><th>Promedio</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {grupos.map(g => {
              const avg = grupoConProm(g).toFixed(2)
              const enRiesgo = +avg < 8
              return (
                <tr key={g.id}>
                  <td><strong>{g.nombre}</strong></td>
                  <td style={{ fontSize: 11, color: '#aaa' }}>{g.tutor || '—'}</td>
                  <td>{g.alumnos}</td>
                  <td><strong style={{ color: +avg >= 9 ? '#0F6E56' : +avg >= 8 ? '#1a1a1a' : '#A32D2D' }}>{avg}</strong></td>
                  <td>
                    <span className={`badge ${enRiesgo ? 'badge-bad' : 'badge-ok'}`}>
                      {enRiesgo ? 'En riesgo' : 'Bien'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {materiasEnRiesgo.length > 0 && (
        <div className="tcard" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr><th>Materia en riesgo</th><th>Promedio general</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {materiasEnRiesgo.map((m, i) => (
                <tr key={i}>
                  <td><strong>{m.nombre}</strong></td>
                  <td><strong style={{ color: '#A32D2D' }}>{m.promedio.toFixed(2)}</strong></td>
                  <td><span className="badge badge-bad">Atención requerida</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}