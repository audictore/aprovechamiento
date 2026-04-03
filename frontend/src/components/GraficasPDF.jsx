import { useState, useEffect, useRef } from 'react'
import { getDocentes, updateEmail, enviarCorreosDirecto, getCuatrimestres, getReporte, getTendencia } from '../api.js'
import { useToast } from '../components/Toast.jsx'
import GraficasPDF from '../components/GraficasPDF.jsx'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' })
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default function Docentes({ esAdmin }) {
  const [docentes,      setDocentes]      = useState([])
  const [checks,        setChecks]        = useState({})
  const [asunto,        setAsunto]        = useState('Reporte de Aprovechamiento — UPMH')
  const [extra,         setExtra]         = useState('')
  const [enviando,      setEnviando]      = useState(false)
  const [busqueda,      setBusqueda]      = useState('')
  const [preview,       setPreview]       = useState(false)
  const [cuatrimestres, setCuatrimestres] = useState([])
  const [programas,     setProgramas]     = useState([])
  const [cuatriSel,     setCuatriSel]     = useState('')
  const [parcialesSel,  setParcialesSel]  = useState({})
  const [reportes,      setReportes]      = useState({})
  const [tendencias,    setTendencias]    = useState({})
  const [cargando,      setCargando]      = useState(false)
  const [mostrarTodos,  setMostrarTodos]  = useState(false)
  const [adjuntos,      setAdjuntos]      = useState([])
  const [generando,     setGenerando]     = useState(false)
  const graficasRefs                      = useRef({})
  const { addToast }                      = useToast()

  useEffect(() => {
    getDocentes().then(r => setDocentes(r.data))
    getCuatrimestres().then(r => setCuatrimestres(r.data))
  }, [])

  useEffect(() => {
    if (!cuatriSel) { setProgramas([]); setParcialesSel({}); setReportes({}); setTendencias({}); setChecks({}); return }
    api.get(`/cuatrimestres/${cuatriSel}/programas`).then(r => {
      setProgramas(r.data)
      setParcialesSel({})
      setReportes({})
      setTendencias({})
      setChecks({})
    })
    const cuatri = cuatrimestres.find(c => c.id === Number(cuatriSel))
    if (cuatri) setAsunto(`Reporte de Aprovechamiento — ${cuatri.nombre}`)
  }, [cuatriSel])

  async function toggleParcial(parcialId) {
    const nuevo = { ...parcialesSel, [parcialId]: !parcialesSel[parcialId] }
    setParcialesSel(nuevo)
    if (nuevo[parcialId] && !reportes[parcialId]) {
      setCargando(true)
      try {
        const r = await getReporte(parcialId)
        setReportes(prev => ({ ...prev, [parcialId]: r.data }))
        // Cargar tendencia del programa
        const progId = r.data.programaId
        if (progId && !tendencias[progId]) {
          try {
            const t = await getTendencia(cuatriSel, progId)
            setTendencias(prev => ({ ...prev, [progId]: t.data }))
          } catch (_) {}
        }
      } finally {
        setCargando(false)
      }
    }
  }

  const docentesDelParcial = (() => {
    const ids = new Set()
    Object.entries(parcialesSel).forEach(([parcialId, sel]) => {
      if (!sel) return
      const rep = reportes[parcialId]
      if (!rep) return
      rep.grupos.forEach(g => g.materias.forEach(m => { if (m.docenteId) ids.add(m.docenteId) }))
    })
    return docentes.filter(d => ids.has(d.id))
  })()

  useEffect(() => {
    if (docentesDelParcial.length === 0) return
    const m = {}
    docentesDelParcial.forEach(d => { if (d.email) m[d.id] = true })
    setChecks(m)
  }, [JSON.stringify(Object.keys(parcialesSel).filter(k => parcialesSel[k]))])

  const docentesExtra = docentes.filter(d =>
    d.nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
    !docentesDelParcial.find(dp => dp.id === d.id)
  )

  const docentesMostrados = mostrarTodos
    ? [...docentesDelParcial, ...docentesExtra]
    : docentesDelParcial.length > 0
      ? docentesDelParcial.filter(d => d.nombre.toLowerCase().includes(busqueda.toLowerCase()))
      : docentes.filter(d => d.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  const iniciales = nombre =>
    nombre.split(' ').filter(w => w.length > 2).slice(0, 2).map(w => w[0]).join('')

  async function handleEmailBlur(id, email) {
    try { await updateEmail(id, email); addToast('Correo actualizado', 'success') } catch (_) {}
  }

  function toggleCheck(id) { setChecks(prev => ({ ...prev, [id]: !prev[id] })) }
  function selTodos()      { const m = {}; docentesMostrados.forEach(d => { m[d.id] = true }); setChecks(m) }
  function selNinguno()    { setChecks({}) }
  function selConCorreo()  { const m = {}; docentesMostrados.forEach(d => { if (d.email) m[d.id] = true }); setChecks(m) }

  const seleccionados = docentes.filter(d => checks[d.id])
  const sinCorreo     = seleccionados.filter(d => !d.email)
  const parcialIds    = Object.entries(parcialesSel).filter(([, v]) => v).map(([k]) => Number(k))

  function infoReporte() {
    if (!parcialIds.length) return ''
    let bloques = []
    for (const pid of parcialIds) {
      const rep = reportes[pid]
      if (!rep) continue
      const grupoConProm = g => {
        const mats = g.materias.filter(m => m.promedio > 0)
        return mats.length ? mats.reduce((s, m) => s + m.promedio, 0) / mats.length : 0
      }
      const avgGeneral = rep.grupos.length
        ? (rep.grupos.reduce((s, g) => s + grupoConProm(g), 0) / rep.grupos.length).toFixed(2)
        : '—'
      const matMap = {}
      rep.grupos.forEach(g => g.materias.forEach(m => {
        if (m.promedio > 0) {
          if (!matMap[m.nombre]) matMap[m.nombre] = []
          matMap[m.nombre].push(m.promedio)
        }
      }))
      const materiasEnRiesgo = Object.entries(matMap)
        .map(([nombre, promedios]) => ({ nombre, promedio: promedios.reduce((a, b) => a + b, 0) / promedios.length }))
        .filter(m => m.promedio < 8)
        .sort((a, b) => a.promedio - b.promedio)
      const lineasGrupos = rep.grupos.map(g =>
        `  • Grupo ${g.nombre}: Promedio ${grupoConProm(g).toFixed(2)}`
      ).join('\n')
      const lineasRiesgo = materiasEnRiesgo.length
        ? '\n  Materias en riesgo:\n' + materiasEnRiesgo.map(m => `    - ${m.nombre}: ${m.promedio.toFixed(2)}`).join('\n')
        : '\n  Todas las materias por encima de 8.'
      bloques.push(`[ ${rep.programa} — ${rep.parcialLabel} ]\nPromedio general: ${avgGeneral}\n\nResultados por grupo:\n${lineasGrupos}${lineasRiesgo}`)
    }
    return bloques.join('\n\n' + '─'.repeat(40) + '\n\n')
  }

  function textoPreview() {
    const doc = seleccionados[0]
    if (!doc) return 'Selecciona al menos un docente para ver la vista previa.'
    const info   = infoReporte()
    const encab  = extra ? `\n${extra}\n` : ''
    const bloque = info ? `\n\n${info}\n` : ''
    return `Estimado(a) ${doc.nombre},\n${encab}${bloque}\nAtentamente,\nCoordinación Académica — UPMH`
  }

  async function capturarEl(el) {
    const canvas  = await html2canvas(el, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' })
    return canvas.toDataURL('image/png')
  }

  async function handleGenerarPDF() {
    if (!parcialIds.length) { addToast('Selecciona al menos un parcial', 'warning'); return }
    setGenerando(true)
    addToast('Generando PDF con gráficas…', 'info')

    try {
      // Esperar a que las gráficas se rendericen
      await new Promise(r => setTimeout(r, 800))

      const pdf      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW     = pdf.internal.pageSize.getWidth()
      const pdfH     = pdf.internal.pageSize.getHeight()
      const margin   = 10
      const maxImgH  = (pdfH - margin * 2) / 2 - 15
      const cuatri   = cuatrimestres.find(c => c.id === Number(cuatriSel))

      // Portada
      pdf.setFillColor(29, 158, 117)
      pdf.rect(0, 0, pdfW, 40, 'F')
      pdf.setFontSize(16)
      pdf.setTextColor(255, 255, 255)
      pdf.text('Reporte de Aprovechamiento Académico', margin, 18)
      pdf.setFontSize(10)
      pdf.text('Universidad Politécnica Metropolitana de Hidalgo', margin, 26)
      pdf.setFontSize(9)
      pdf.text(`Cuatrimestre: ${cuatri?.nombre || ''}  ·  Fecha: ${new Date().toLocaleDateString('es-MX')}`, margin, 34)

      for (const pid of parcialIds) {
        const rep  = reportes[pid]
        if (!rep) continue
        const refs = graficasRefs.current[pid]
        if (!refs) continue

        const { refGrupos, refRiesgo, refMaterias, refLinea } = refs

        // Función para agregar imagen al PDF
        async function agregarImagen(ref, titulo, addPageFirst = true) {
          if (!ref?.current) return
          if (addPageFirst) pdf.addPage()
          const imgData = await capturarEl(ref.current)
          const imgW    = pdfW - margin * 2
          const imgH    = Math.min(
            (ref.current.offsetHeight * imgW) / ref.current.offsetWidth,
            maxImgH * 1.8
          )
          pdf.setFontSize(12)
          pdf.setTextColor(29, 158, 117)
          pdf.text(titulo, margin, margin + 6)
          pdf.addImage(imgData, 'PNG', margin, margin + 12, imgW, imgH)
        }

        // Encabezado del programa
        pdf.addPage()
        pdf.setFillColor(29, 158, 117)
        pdf.rect(0, 0, pdfW, 20, 'F')
        pdf.setFontSize(12)
        pdf.setTextColor(255, 255, 255)
        pdf.text(rep.programa, margin, 12)
        pdf.setFontSize(9)
        pdf.text(rep.parcialLabel, margin, 18)

        // Tabla de grupos
        let y = 28
        const grupoConProm = g => {
          const mats = g.materias.filter(m => m.promedio > 0)
          return mats.length ? mats.reduce((s, m) => s + m.promedio, 0) / mats.length : 0
        }

        pdf.setFillColor(240, 240, 240)
        pdf.rect(margin, y, pdfW - margin * 2, 7, 'F')
        pdf.setFontSize(9)
        pdf.setTextColor(80)
        pdf.text('Grupo',    margin + 2,  y + 5)
        pdf.text('Promedio', margin + 35, y + 5)
        pdf.text('Alumnos',  margin + 65, y + 5)
        pdf.text('Estado',   margin + 95, y + 5)
        y += 9

        rep.grupos.forEach((g, i) => {
          const prom     = grupoConProm(g).toFixed(2)
          const enRiesgo = +prom < 8
          if (i % 2 === 0) {
            pdf.setFillColor(250, 250, 250)
            pdf.rect(margin, y - 1, pdfW - margin * 2, 7, 'F')
          }
          pdf.setFontSize(9)
          pdf.setTextColor(0)
          pdf.text(g.nombre, margin + 2, y + 4)
          pdf.setTextColor(enRiesgo ? 163 : 15, enRiesgo ? 45 : 110, enRiesgo ? 45 : 86)
          pdf.text(String(prom), margin + 35, y + 4)
          pdf.setTextColor(0)
          pdf.text(String(g.alumnos), margin + 65, y + 4)
          pdf.setTextColor(enRiesgo ? 163 : 15, enRiesgo ? 45 : 110, enRiesgo ? 45 : 86)
          pdf.text(enRiesgo ? 'En riesgo' : 'Bien', margin + 95, y + 4)
          y += 8
          if (y > pdfH - 20) { pdf.addPage(); y = margin }
        })

        // Gráficas — 2 por página
        await agregarImagen(refGrupos,   `Promedio por grupo — ${rep.parcialLabel}`)
        await agregarImagen(refRiesgo,   `Materias en riesgo — ${rep.parcialLabel}`)
        await agregarImagen(refMaterias, `Promedio por materia — ${rep.parcialLabel}`)
        if (refLinea?.current) {
          await agregarImagen(refLinea, `Evolución entre parciales — ${rep.programa}`)
        }
      }

      const blob   = pdf.output('blob')
      const cuatriNombre = cuatri?.nombre || 'UPMH'
      const nombre = `Reporte_${cuatriNombre}_${new Date().toLocaleDateString('es-MX').replace(/\//g,'-')}.pdf`
      const file   = new File([blob], nombre, { type: 'application/pdf' })
      setAdjuntos(prev => [...prev.filter(f => !f.name.startsWith('Reporte_')), file])
      addToast('PDF con gráficas agregado a los adjuntos', 'success')
    } catch (e) {
      addToast('Error al generar PDF: ' + e.message, 'error')
    } finally {
      setGenerando(false)
    }
  }

  async function handleEnviar() {
    if (!seleccionados.length) { addToast('Selecciona al menos un docente', 'warning'); return }
    if (sinCorreo.length)      { addToast(`Falta correo: ${sinCorreo.map(d => d.nombre).join(', ')}`, 'warning'); return }

    setEnviando(true)
    try {
      const info    = infoReporte()
      const encab   = extra ? `\n${extra}\n` : ''
      const bloque  = info ? `\n\n${info}\n` : ''
      const mensaje = `${encab}${bloque}`

      const { data } = await enviarCorreosDirecto({
        asunto,
        mensaje,
        destinatarios: seleccionados.map(d => ({ docenteId: d.id, nombre: d.nombre })),
        parcialIds
      }, adjuntos)

      addToast(
        `${data.enviados} correo(s) enviado(s)${data.errores.length ? ` · ${data.errores.length} error(es)` : ''}`,
        data.errores.length ? 'warning' : 'success'
      )
    } catch (e) {
      addToast(e.response?.data?.error ?? 'Error al enviar', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Docentes y correos</h2>
      </div>

      {/* Gráficas ocultas para PDF */}
      {parcialIds.map(pid => {
        const rep = reportes[pid]
        if (!rep) return null
        const progId   = rep.programaId
        const tendencia = tendencias[progId] || null
        return (
          <GraficasPDF
            key={pid}
            reporte={rep}
            tendencia={tendencia}
            onReady={refs => { graficasRefs.current[pid] = refs }}
          />
        )
      })}

      <div className="tcard" style={{ padding:16, marginBottom:16 }}>
        <div className="field" style={{ margin:0, maxWidth:300 }}>
          <label>Cuatrimestre</label>
          <select value={cuatriSel} onChange={e => setCuatriSel(e.target.value)}>
            <option value="">Selecciona un cuatrimestre…</option>
            {cuatrimestres.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        {programas.length > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#aaa', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:10 }}>
              Selecciona los parciales a incluir
            </div>
            {programas.map(prog => (
              <div key={prog.id} style={{ marginBottom:12 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#555', marginBottom:6 }}>
                  {prog.nombre}
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {prog.parciales.map(p => (
                    <label
                      key={p.id}
                      style={{
                        display:'flex', alignItems:'center', gap:6, cursor:'pointer',
                        padding:'5px 12px', borderRadius:999,
                        border: parcialesSel[p.id] ? '1px solid #1D9E75' : '1px solid #ddd',
                        background: parcialesSel[p.id] ? '#e8f8f2' : '#fff',
                        fontSize:12, fontWeight:600,
                        color: parcialesSel[p.id] ? '#1D9E75' : '#777',
                        transition:'all .15s'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!parcialesSel[p.id]}
                        onChange={() => toggleParcial(p.id)}
                        style={{ accentColor:'#1D9E75' }}
                      />
                      {p.label}
                      {p.promedio && <span style={{ fontSize:10, color:'#1D9E75' }}>· {p.promedio}</span>}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {cargando && <div className="loading"><span className="spinner" /> Cargando datos…</div>}
          </div>
        )}
      </div>

      <div className="sel-bar" style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Buscar docente…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #e8e8e4', fontSize:12, width:180 }}
        />
        <span>Seleccionar:</span>
        <a onClick={selTodos}>Todos</a>
        <a onClick={selNinguno}>Ninguno</a>
        <a onClick={selConCorreo}>Solo con correo</a>
        {docentesDelParcial.length > 0 && (
          <a onClick={() => setMostrarTodos(p => !p)} style={{ color:'#BA7517' }}>
            {mostrarTodos ? 'Ver solo del parcial' : '+ Agregar más docentes'}
          </a>
        )}
        <span style={{ marginLeft:'auto', color:'#aaa' }}>
          {seleccionados.length} seleccionado(s)
        </span>
      </div>

      <div className="doc-list">
        {docentesMostrados.length === 0 && (
          <div style={{ padding:20, color:'#aaa', textAlign:'center' }}>
            {parcialIds.length ? 'No hay docentes en los parciales seleccionados' : 'Selecciona un cuatrimestre y marca los parciales a incluir'}
          </div>
        )}

        {mostrarTodos && docentesDelParcial.length > 0 && (
          <div style={{ fontSize:11, fontWeight:700, color:'#aaa', textTransform:'uppercase', letterSpacing:'.04em', padding:'4px 0' }}>
            Docentes de los parciales seleccionados
          </div>
        )}

        {docentesMostrados.map((doc, idx) => {
          const esSeparador = mostrarTodos && idx === docentesDelParcial.length && docentesExtra.length > 0
          return (
            <div key={doc.id}>
              {esSeparador && (
                <div style={{ fontSize:11, fontWeight:700, color:'#aaa', textTransform:'uppercase', letterSpacing:'.04em', padding:'8px 0 4px' }}>
                  Otros docentes
                </div>
              )}
              <div className={`doc-row ${checks[doc.id] ? '' : 'disabled'}`}>
                <input
                  type="checkbox"
                  checked={!!checks[doc.id]}
                  onChange={() => toggleCheck(doc.id)}
                  style={{ width:14, height:14, cursor:'pointer', accentColor:'#1D9E75' }}
                />
                <div className="avatar">{iniciales(doc.nombre)}</div>
                <div style={{ flex:1 }}>
                  <div className="doc-name">{doc.nombre}</div>
                </div>
                {esAdmin ? (
                  <input
                    type="email"
                    defaultValue={doc.email}
                    placeholder="correo@upmh.edu.mx"
                    onBlur={e => { doc.email = e.target.value; handleEmailBlur(doc.id, e.target.value) }}
                  />
                ) : (
                  <span style={{ fontSize:11, color:'#aaa' }}>{doc.email || '—'}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {esAdmin && (
        <div className="compose">
          <h3>Redactar y enviar</h3>
          <div className="field">
            <label>Asunto</label>
            <input type="text" value={asunto} onChange={e => setAsunto(e.target.value)} />
          </div>
          <div className="field">
            <label>Mensaje adicional (opcional)</label>
            <textarea
              rows={3}
              placeholder="Ej: Les recordamos que el siguiente parcial es el 15 de julio…"
              value={extra}
              onChange={e => setExtra(e.target.value)}
            />
          </div>
          <div className="field">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <label style={{ margin:0 }}>Vista previa</label>
              <button className="btn" style={{ fontSize:11 }} onClick={() => setPreview(p => !p)}>
                {preview ? 'Ocultar' : 'Mostrar vista previa'}
              </button>
            </div>
            {preview && <div className="preview">{textoPreview()}</div>}
          </div>

          <div className="field">
            <label>Archivos adjuntos</label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
              {parcialIds.length > 0 && (
                <button className="btn" style={{ fontSize:11 }} onClick={handleGenerarPDF} disabled={generando}>
                  {generando ? 'Generando…' : '📄 Generar PDF del reporte'}
                </button>
              )}
              <label className="btn" style={{ fontSize:11, cursor:'pointer' }}>
                📎 Adjuntar archivo
                <input
                  type="file"
                  multiple
                  hidden
                  onChange={e => setAdjuntos(prev => [...prev, ...Array.from(e.target.files)])}
                />
              </label>
            </div>
            {adjuntos.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {adjuntos.map((f, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:4, background:'#f0f0f0', borderRadius:6, padding:'3px 10px', fontSize:11 }}>
                    <span>📄 {f.name}</span>
                    <button
                      onClick={() => setAdjuntos(prev => prev.filter((_, j) => j !== i))}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#aaa', fontSize:12, padding:'0 2px' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="btn-row">
            <button className="btn btn-primary" onClick={handleEnviar} disabled={enviando}>
              {enviando ? 'Enviando…' : `Enviar a ${seleccionados.length} docente(s)`}
            </button>
            {sinCorreo.length > 0 && (
              <span style={{ fontSize:11, color:'#BA7517' }}>
                ⚠ {sinCorreo.length} sin correo asignado
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}