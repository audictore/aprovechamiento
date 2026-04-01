import { useState, useEffect } from 'react'
import { getReporte, getDocentes, updateEmail, enviarCorreos } from '../api.js'

export default function Docentes({ seleccion }) {
  const [reporte,   setReporte]   = useState(null)
  const [docentes,  setDocentes]  = useState([])
  const [checks,    setChecks]    = useState({})
  const [asunto,    setAsunto]    = useState('')
  const [extra,     setExtra]     = useState('')
  const [enviando,  setEnviando]  = useState(false)
  const [statusMsg, setStatusMsg] = useState(null)

  useEffect(() => {
    setAsunto(`Reporte de Aprovechamiento — ${seleccion.cuatri.nombre} · ${seleccion.parcial.label}`)
    Promise.all([
      getReporte(seleccion.parcial.id),
      getDocentes(),
    ]).then(([rRep, rDoc]) => {
      setReporte(rRep.data)
      setDocentes(rDoc.data)
    })
  }, [seleccion.parcial.id])

  if (!reporte) return <div className="loading"><span className="spinner" /> Cargando…</div>

  const mapaDocente = {}
  reporte.grupos.forEach(g => {
    g.materias.forEach(m => {
      if (!m.docenteId) return
      ;(mapaDocente[m.docenteId] = mapaDocente[m.docenteId] || []).push({
        grupo: g.nombre, promedio: m.promedio, reprobados: m.reprobados
      })
    })
  })

  const docentesEnParcial = docentes.filter(d => mapaDocente[d.id])

  const promDocente = id => {
    const gs = mapaDocente[id] || []
    if (!gs.length) return null
    return (gs.reduce((s, g) => s + g.promedio, 0) / gs.length).toFixed(2)
  }

  const iniciales = nombre =>
    nombre.split(' ').filter(w => w.length > 2).slice(0, 2).map(w => w[0]).join('')

  async function handleEmailBlur(id, email) {
    try { await updateEmail(id, email) } catch (_) {}
  }

  function toggleCheck(id) {
    setChecks(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function selTodos()     { const m = {}; docentesEnParcial.forEach(d => { m[d.id] = true  }); setChecks(m) }
  function selNinguno()   { setChecks({}) }
  function selConCorreo() { const m = {}; docentesEnParcial.forEach(d => { if (d.email) m[d.id] = true }); setChecks(m) }

  function preview() {
    const doc = docentesEnParcial.find(d => checks[d.id])
    if (!doc) return 'Selecciona al menos un docente para ver la vista previa.'
    const grupos = mapaDocente[doc.id] || []
    const prom   = grupos.length ? (grupos.reduce((s,g)=>s+g.promedio,0)/grupos.length).toFixed(2) : '—'
    const rep    = grupos.reduce((s,g)=>s+g.reprobados,0)
    const lineas = grupos.map(g => `  • Grupo ${g.grupo}: Promedio ${g.promedio.toFixed(2)}  |  Reprobados: ${g.reprobados}`).join('\n')
    const encab  = extra ? `\n${extra}\n` : ''
    return `Estimado(a) ${doc.nombre},\n${encab}\nLe compartimos su reporte:\n\n  Cuatrimestre : ${seleccion.cuatri.nombre}\n  Parcial      : ${seleccion.parcial.label}\n\nRESULTADOS:\n${lineas}\n\n  Promedio general : ${prom}\n  Total reprobados : ${rep}\n\nAtentamente,\nCoordinación Académica — UPMH`
  }

  async function handleEnviar() {
    const seleccionados = docentesEnParcial.filter(d => checks[d.id])
    const sinCorreo     = seleccionados.filter(d => !d.email)

    if (!seleccionados.length) { setStatusMsg({ tipo:'err', texto:'Selecciona al menos un docente.' }); return }
    if (sinCorreo.length)      { setStatusMsg({ tipo:'err', texto:`Falta correo: ${sinCorreo.map(d=>d.nombre).join(', ')}` }); return }

    setEnviando(true)
    setStatusMsg(null)
    try {
      const { data } = await enviarCorreos(seleccion.parcial.id, {
        asunto,
        mensajeExtra: extra,
        destinatarios: seleccionados.map(d => ({ docenteId: d.id, email: d.email })),
      })
      setStatusMsg({
        tipo: data.errores.length ? 'err' : 'ok',
        texto: `✓ ${data.enviados} enviado(s)${data.errores.length ? ` · ${data.errores.length} error(es)` : ''}`
      })
    } catch (e) {
      setStatusMsg({ tipo:'err', texto: e.response?.data?.error ?? 'Error al enviar' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <div className="sel-bar">
        <span>Seleccionar:</span>
        <a onClick={selTodos}>Todos</a>
        <a onClick={selNinguno}>Ninguno</a>
        <a onClick={selConCorreo}>Solo con correo</a>
        <span style={{ marginLeft:'auto', color:'#aaa' }}>
          {docentesEnParcial.filter(d=>checks[d.id]).length} seleccionado(s)
        </span>
      </div>

      <div className="doc-list">
        {docentesEnParcial.map(doc => {
          const prom = promDocente(doc.id)
          const col  = prom ? (+prom >= 9 ? '#0F6E56' : +prom >= 8 ? '#1a1a1a' : '#A32D2D') : '#aaa'
          return (
            <div key={doc.id} className={`doc-row ${checks[doc.id] ? '' : 'disabled'}`}>
              <input
                type="checkbox"
                checked={!!checks[doc.id]}
                onChange={() => toggleCheck(doc.id)}
                style={{ width:14, height:14, cursor:'pointer', accentColor:'#1D9E75' }}
              />
              <div className="avatar">{iniciales(doc.nombre)}</div>
              <div>
                <div className="doc-name">{doc.nombre}</div>
                <div className="doc-mat">
                  {(mapaDocente[doc.id] || []).map(g => `${g.grupo}: ${g.promedio.toFixed(2)}`).join(' · ')}
                </div>
              </div>
              <input
                type="email"
                defaultValue={doc.email}
                placeholder="correo@upmh.edu.mx"
                onBlur={e => {
                  doc.email = e.target.value
                  handleEmailBlur(doc.id, e.target.value)
                }}
              />
              <div className="doc-avg" style={{ color: col }}>{prom ?? '—'}</div>
            </div>
          )
        })}
      </div>

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
          <label>Vista previa</label>
          <div className="preview">{preview()}</div>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={handleEnviar} disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar correos seleccionados'}
          </button>
          {statusMsg && (
            <span className={statusMsg.tipo === 'ok' ? 'send-ok' : 'send-err'}>
              {statusMsg.texto}
            </span>
          )}
        </div>
      </div>
    </>
  )
}
