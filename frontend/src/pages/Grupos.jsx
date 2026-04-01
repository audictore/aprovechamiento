import { useState, useEffect } from 'react'
import { Bar } from 'react-chartjs-2'
import { getReporte } from '../api.js'

const COLORS = ['#1D9E75','#378ADD','#BA7517','#D85A30','#7F77DD','#D4537E','#639922','#985C3C']

export default function Grupos({ parcialId }) {
  const [reporte,  setReporte]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [grupoSel, setGrupoSel] = useState(null)

  useEffect(() => {
    setLoading(true)
    getReporte(parcialId)
      .then(r => {
        setReporte(r.data)
        setGrupoSel(r.data.grupos[0]?.nombre ?? null)
      })
      .finally(() => setLoading(false))
  }, [parcialId])

  if (loading) return <div className="loading"><span className="spinner" /> Cargando…</div>
  if (!reporte?.grupos.length) return <div className="loading">Sin datos para este parcial.</div>

  const grupo     = reporte.grupos.find(g => g.nombre === grupoSel) ?? reporte.grupos[0]
  const mats      = grupo.materias.filter(m => m.promedio > 0)
  const promGrupo = mats.length
    ? (mats.reduce((s, m) => s + m.promedio, 0) / mats.length).toFixed(2)
    : '—'

  return (
    <>
      <div className="group-pills">
        {reporte.grupos.map(g => (
          <button
            key={g.nombre}
            className={`pill ${grupoSel === g.nombre ? 'active' : ''}`}
            onClick={() => setGrupoSel(g.nombre)}
          >
            {g.nombre}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16, display: 'flex', gap: 16 }}>
        <span>Tutor: <strong style={{ color: '#1a1a1a' }}>{grupo.tutor || 'No especificado'}</strong></span>
        <span>Alumnos: <strong style={{ color: '#1a1a1a' }}>{grupo.alumnos}</strong></span>
        <span>Bajas: <strong style={{ color: '#1a1a1a' }}>{grupo.bajas}</strong></span>
        <span>Promedio: <strong style={{ color: '#1D9E75' }}>{promGrupo}</strong></span>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <h3>Promedio por materia — Grupo {grupo.nombre}</h3>
          <div className="chart-wrap">
            <Bar
              data={{
                labels:   mats.map(m => m.nombre.length > 16 ? m.nombre.slice(0,16)+'…' : m.nombre),
                datasets: [{ data: mats.map(m => m.promedio), backgroundColor: COLORS, borderRadius: 5 }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales:  { y: { min: 7, max: 10 } }
              }}
            />
          </div>
        </div>

        <div className="chart-card">
          <h3>Reprobados por materia</h3>
          <div className="chart-wrap">
            <Bar
              data={{
                labels:   mats.map(m => m.nombre.length > 16 ? m.nombre.slice(0,16)+'…' : m.nombre),
                datasets: [{
                  data: mats.map(m => m.reprobados),
                  backgroundColor: mats.map(m => m.reprobados === 0 ? '#1D9E75' : m.reprobados <= 2 ? '#BA7517' : '#D85A30'),
                  borderRadius: 5
                }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales:  { y: { ticks: { stepSize: 1 } } }
              }}
            />
          </div>
        </div>
      </div>

      <div className="tcard">
        <table>
          <thead>
            <tr>
              <th>Materia</th><th>Docente</th><th>Promedio</th>
              <th>Alumnos</th><th>Reprobados</th><th>% Rep.</th>
            </tr>
          </thead>
          <tbody>
            {grupo.materias.map(m => {
              const pct = grupo.alumnos > 0
                ? ((m.reprobados / grupo.alumnos) * 100).toFixed(1)
                : '0'
              return (
                <tr key={m.id}>
                  <td><strong>{m.nombre}</strong></td>
                  <td style={{ fontSize: 11, color: '#aaa' }}>{m.docenteNombre ?? 'No especificado'}</td>
                  <td>
                    <strong style={{ color: m.promedio >= 9 ? '#0F6E56' : m.promedio >= 8 ? '#1a1a1a' : '#A32D2D' }}>
                      {m.promedio > 0 ? m.promedio.toFixed(2) : '—'}
                    </strong>
                  </td>
                  <td>{grupo.alumnos}</td>
                  <td>
                    <span className={`badge ${m.reprobados === 0 ? 'badge-ok' : m.reprobados <= 2 ? 'badge-warn' : 'badge-bad'}`}>
                      {m.reprobados}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: '#aaa' }}>
                    {m.reprobados > 0 ? pct + '%' : '—'}
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