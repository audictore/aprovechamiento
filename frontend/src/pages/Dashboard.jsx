import { useState, useEffect, useRef } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart, CategoryScale, LinearScale,
  BarElement, LineElement, PointElement, Tooltip, Legend
} from 'chart.js'
import { getReporte, uploadExcel, getTendencia } from '../api.js'
import { useToast } from '../components/Toast.jsx'

Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend)

const COLORS  = ['#1D9E75','#378ADD','#BA7517','#D85A30','#7F77DD','#D4537E','#639922','#985C3C']
const barOpts = (min = 7) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales:  { y: { min, max: 10, ticks: { font: { size: 11 } } } }
})

export default function Dashboard({ seleccion, onReload, esAdmin }) {
  const [reporte,     setReporte]     = useState(null)
  const [tendencia,   setTendencia]   = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [drag,        setDrag]        = useState(false)
  const [uploading,   setUploading]   = useState(false)
  const [grupoFiltro, setGrupoFiltro] = useState('todos')
  const fileRef      = useRef()
  const { addToast } = useToast()

  useEffect(() => {
    setLoading(true)
    setReporte(null)
    setTendencia(null)
    setGrupoFiltro('todos')

    Promise.all([
      getReporte(seleccion.parcial.id),
      getTendencia(seleccion.cuatri.id, seleccion.programa.id)
    ])
      .then(([r, t]) => {
        setReporte(r.data)
        setTendencia(t.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [seleccion.parcial.id])

  async function handleFile(file) {
    if (!file) return
    setUploading(true)
    try {
      const numParcial = seleccion.parcial.numero || seleccion.parcial.id
      await uploadExcel(seleccion.cuatri.id, seleccion.programa.nombre, numParcial, file)
      const [r, t] = await Promise.all([
        getReporte(seleccion.parcial.id),
        getTendencia(seleccion.cuatri.id, seleccion.programa.id)
      ])
      setReporte(r.data)
      setTendencia(t.data)
      onReload()
      addToast('Excel importado correctamente', 'success')
    } catch (e) {
      addToast('Error al procesar el archivo: ' + (e.response?.data?.error ?? e.message), 'error')
    } finally {
      setUploading(false)
    }
  }

  async function exportarExcel() {
    try {
      const XLSX = await import('xlsx')
      const wb   = XLSX.utils.book_new()

      const resumenData = [
        ['Grupo', 'Tutor', 'Alumnos', 'Promedio', 'Estado'],
        ...gruposFiltrados.map(g => {
          const avg = grupoConProm(g).toFixed(2)
          return [g.nombre, g.tutor, g.alumnos, +avg, +avg < 8 ? 'En riesgo' : 'Bien']
        })
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumenData), 'Resumen por grupo')

      const matData = [
        ['Materia', 'Promedio general', 'Estado'],
        ...matNombres.map((n, i) => [n, matAvgs[i], matAvgs[i] < 8 ? 'En riesgo' : 'Bien'])
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matData), 'Promedio por materia')

      const detalleData = [
        ['Grupo', 'Materia', 'Docente', 'Promedio'],
        ...gruposFiltrados.flatMap(g =>
          g.materias
            .filter(m => m.promedio > 0)
            .map(m => [g.nombre, m.nombre, m.docenteNombre || '—', +m.promedio.toFixed(2)])
        )
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalleData), 'Detalle')

      XLSX.writeFile(wb, `Aprovechamiento_${seleccion.parcial.label}.xlsx`)
      addToast('Reporte exportado correctamente', 'success')
    } catch (e) {
      addToast('Error al exportar: ' + e.message, 'error')
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

  const grupos          = reporte.grupos
  const gruposFiltrados = grupoFiltro === 'todos' ? grupos : grupos.filter(g => g.nombre === grupoFiltro)

  const grupoConProm = g => {
    const mats = g.materias.filter(m => m.promedio > 0)
    return mats.length ? mats.reduce((s, m) => s + m.promedio, 0) / mats.length : 0
  }

  const totAlumnos = gruposFiltrados.reduce((s, g) => s + g.alumnos, 0)
  const avgGeneral = gruposFiltrados.length
    ? (gruposFiltrados.reduce((s, g) => s + grupoConProm(g), 0) / gruposFiltrados.length).toFixed(2)
    : '—'
  const grupoLabels = gruposFiltrados.map(g => g.nombre)
  const grupoAvgs   = gruposFiltrados.map(g => +grupoConProm(g).toFixed(2))

  const gruposEnRiesgo = gruposFiltrados.filter(g => grupoConProm(g) < 8)

  const matMap = {}
  gruposFiltrados.forEach(g => g.materias.forEach(m => {
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

  const nombresGrupos = tendencia
    ? [...new Set(tendencia.flatMap(p => p.grupos.map(g => g.nombre)))].sort()
    : []

  const gruposLineaFiltrados = grupoFiltro === 'todos'
    ? nombresGrupos
    : nombresGrupos.filter(n => n === grupoFiltro)

  const lineData = {
    labels: tendencia ? tendencia.map(p => p.label) : [],
    datasets: gruposLineaFiltrados.map((nombre, idx) => ({
      label:            nombre,
      data:             tendencia ? tendencia.map(p => { const g = p.grupos.find(g => g.nombre === nombre); return g ? g.promedio : null }) : [],
      borderColor:      COLORS[idx % COLORS.length],
      backgroundColor:  COLORS[idx % COLORS.length] + '33',
      tension:          0.3,
      pointRadius:      5,
      pointHoverRadius: 7
    }))
  }

  return (
    <>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button
            className={`btn ${grupoFiltro === 'todos' ? 'btn-primary' : ''}`}
            style={{ fontSize:11 }}
            onClick={() => setGrupoFiltro('todos')}
          >
            Todos los grupos
          </button>
          {grupos.map(g => (
            <button
              key={g.nombre}
              className={`btn ${grupoFiltro === g.nombre ? 'btn-primary' : ''}`}
              style={{ fontSize:11 }}
              onClick={() => setGrupoFiltro(g.nombre)}
            >
              {g.nombre}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary" style={{ fontSize:11 }} onClick={exportarExcel}>
            ↓ Exportar Excel
          </button>
          {esAdmin && (
            <>
              <button className="btn" style={{ fontSize:11 }} onClick={() => fileRef.current.click()}>
                Reimportar Excel
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={e => handleFile(e.target.files[0])} />
            </>
          )}
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="mlabel">Total alumnos</div>
          <div className="mval">{totAlumnos}</div>
          <div className="msub">{gruposFiltrados.length} grupos</div>
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
              : materiasEnRiesgo.length === 1
                ? materiasEnRiesgo[0].nombre.slice(0, 22)
                : `${materiasEnRiesgo[0].nombre.slice(0, 18)}… y ${materiasEnRiesgo.length - 1} más`}
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
              ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#1D9E75', fontWeight:600 }}>
                  Todas las materias están bien ✓
                </div>
              : <Bar
                  data={{
                    labels:   materiasEnRiesgo.map(m => m.nombre.length > 25 ? m.nombre.slice(0,25)+'…' : m.nombre),
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

      {tendencia && tendencia.length > 1 && (
        <div className="chart-grid single">
          <div className="chart-card">
            <h3>Evolución de promedio por grupo — entre parciales</h3>
            <div className="chart-wrap" style={{ height: 280 }}>
              <Line
                data={lineData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: true, position: 'bottom' } },
                  scales: { y: { min: 7, max: 10, ticks: { font: { size: 11 } } } }
                }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="tcard">
        <table>
          <thead>
            <tr><th>Grupo</th><th>Tutor</th><th>Alumnos</th><th>Promedio</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {gruposFiltrados.map(g => {
              const avg      = grupoConProm(g).toFixed(2)
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
    </>
  )
}