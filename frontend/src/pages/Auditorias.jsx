import { useState, useEffect, useCallback } from 'react'
import {
  getCuatrimestres, getDocentes,
  getAuditorias, crearAuditoria, actualizarAuditoria, eliminarAuditoria,
  notificarAuditorias, sincronizarAuditorias,
  getAuditoriasConfig, saveAuditoriasConfig,
} from '../api.js'
import { useToast } from '../components/Toast.jsx'

// ─── Columnas del checklist ───────────────────────────────────────────────────
const PLAN_COLS = [
  { key: 'planProfesor',    label: 'P',    tipo: 'bool' },
  { key: 'planCoordinador', label: 'C',    tipo: 'bool' },
  { key: 'planFechaRevision', label: 'FR', tipo: 'text' },
  { key: 'planFechaElab',   label: 'FE',   tipo: 'text' },
]
const PRES_COLS = [
  { key: 'presentacion', label: 'Pres.', tipo: 'bool' },
]
const PARCIAL_KEYS = ['Conocimiento', 'Producto', 'Desempeno', 'Asistencia', 'Calificaciones']
const PARCIAL_LABELS = ['Conoc.', 'Prod.', 'Desemp.', 'Asist.', 'Calif.']

function parcialCols(n) {
  return PARCIAL_KEYS.map((k, i) => ({
    key:   `p${n}${k}`,
    label: PARCIAL_LABELS[i],
    tipo:  'bool',
  }))
}

const ALL_COLS = [
  ...PLAN_COLS,
  ...PRES_COLS,
  ...parcialCols(1),
  ...parcialCols(2),
  ...parcialCols(3),
]

const TOTAL_BOOL = ALL_COLS.filter(c => c.tipo === 'bool').length

// ─── Celda editable ───────────────────────────────────────────────────────────
function Celda({ row, col, onChange }) {
  const val = row[col.key]

  if (col.tipo === 'bool') {
    return (
      <td style={{ textAlign: 'center', padding: '2px 4px' }}>
        <input
          type="checkbox"
          checked={!!val}
          onChange={e => onChange(row.id, col.key, e.target.checked)}
        />
      </td>
    )
  }

  return (
    <td style={{ padding: '2px 4px' }}>
      <input
        type="text"
        value={val ?? ''}
        onChange={e => onChange(row.id, col.key, e.target.value)}
        onBlur={e => onChange(row.id, col.key, e.target.value, true)}
        style={{ width: 64, fontSize: 11, border: '1px solid #ccc', borderRadius: 3, padding: '1px 4px' }}
      />
    </td>
  )
}

// ─── Barra de progreso de una fila ───────────────────────────────────────────
function Progreso({ row }) {
  const done = ALL_COLS.filter(c => c.tipo === 'bool' && row[c.key]).length
  const pct  = Math.round((done / TOTAL_BOOL) * 100)
  const color = pct === 100 ? '#1D9E75' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <td style={{ padding: '2px 8px', minWidth: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .2s' }} />
        </div>
        <span style={{ fontSize: 10, color, fontWeight: 600, minWidth: 28 }}>{pct}%</span>
      </div>
    </td>
  )
}

// ─── Modal agregar fila ───────────────────────────────────────────────────────
function ModalAgregar({ cuatrimestreId, docentes, onGuardar, onCerrar }) {
  const [docenteId, setDocenteId] = useState('')
  const [materia,   setMateria]   = useState('')
  const [grupo,     setGrupo]     = useState('')
  const { addToast } = useToast()

  async function guardar() {
    if (!docenteId || !materia.trim()) return addToast('Selecciona docente y materia', 'error')
    try {
      const { data } = await crearAuditoria({ cuatrimestreId, docenteId: Number(docenteId), materia: materia.trim(), grupo: grupo.trim() })
      onGuardar(data)
    } catch (e) {
      addToast(e.response?.data?.error ?? e.message, 'error')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 24, minWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Agregar registro</h3>

        <div className="field">
          <label style={{ fontSize: 12 }}>Docente</label>
          <select value={docenteId} onChange={e => setDocenteId(e.target.value)} style={{ width: '100%' }}>
            <option value="">— Seleccionar —</option>
            {docentes.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </div>

        <div className="field">
          <label style={{ fontSize: 12 }}>Materia</label>
          <input value={materia} onChange={e => setMateria(e.target.value)} placeholder="Nombre de la materia" />
        </div>

        <div className="field">
          <label style={{ fontSize: 12 }}>Grupo / Cuatrimestre</label>
          <input value={grupo} onChange={e => setGrupo(e.target.value)} placeholder="Ej: Quinto (GCH)" />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={guardar}>Agregar</button>
          <button className="btn" onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal notificar ──────────────────────────────────────────────────────────
function ModalNotificar({ cuatrimestreId, cuatrimestres, onCerrar }) {
  const [ccEmail,   setCcEmail]   = useState('')
  const [enviando,  setEnviando]  = useState(false)
  const [resultado, setResultado] = useState(null)
  const { addToast } = useToast()

  const cuatri = cuatrimestres.find(c => c.id === cuatrimestreId)

  async function enviar() {
    setEnviando(true)
    try {
      const { data } = await notificarAuditorias({ cuatrimestreId, ccEmail: ccEmail.trim() || undefined })
      setResultado(data.resultados)
    } catch (e) {
      addToast(e.response?.data?.error ?? e.message, 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 24, minWidth: 400, maxWidth: 520, boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Notificar docentes</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#666' }}>
          Se enviará un correo a cada docente con su estado de planeaciones para <strong>{cuatri?.nombre}</strong>.
        </p>

        {!resultado ? (
          <>
            <div className="field">
              <label style={{ fontSize: 12 }}>CC (coordinador) — opcional</label>
              <input
                type="email"
                value={ccEmail}
                onChange={e => setCcEmail(e.target.value)}
                placeholder="correo@upmh.edu.mx"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={enviar} disabled={enviando}>
                {enviando ? 'Enviando…' : '📧 Enviar correos'}
              </button>
              <button className="btn" onClick={onCerrar}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {resultado.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                  <span>{r.status === 'enviado' ? '✅' : r.status === 'sin_email' ? '⚠️' : '❌'}</span>
                  <span style={{ flex: 1 }}>{r.docente}</span>
                  <span style={{ fontSize: 11, color: '#888' }}>
                    {r.status === 'enviado' ? 'Enviado' : r.status === 'sin_email' ? 'Sin email' : 'Error'}
                  </span>
                </div>
              ))}
            </div>
            <button className="btn" style={{ marginTop: 16 }} onClick={onCerrar}>Cerrar</button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Etiquetas de campos para resultados ─────────────────────────────────────
const CAMPO_LABEL = {
  planProfesor: 'Plan (P)', presentacion: 'Presentación',
  p1Conocimiento: '1C-Conoc', p1Producto: '1C-Prod', p1Desempeno: '1C-Desemp',
  p1Asistencia: '1C-Asist', p1Calificaciones: '1C-Calif',
  p2Conocimiento: '2C-Conoc', p2Producto: '2C-Prod', p2Desempeno: '2C-Desemp',
  p2Asistencia: '2C-Asist', p2Calificaciones: '2C-Calif',
  p3Conocimiento: '3C-Conoc', p3Producto: '3C-Prod', p3Desempeno: '3C-Desemp',
  p3Asistencia: '3C-Asist', p3Calificaciones: '3C-Calif',
}

// ─── Modal resultado sincronización ──────────────────────────────────────────
function ModalResultadoSync({ resultado, onCerrar }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface, #fff)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 540, boxShadow: '0 8px 32px rgba(0,0,0,.22)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>📂 Resultado de la sincronización</h3>

        {resultado.carpetaUsada && (
          <p style={{ margin: '0 0 14px', fontSize: 11, color: '#888', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            📁 {resultado.carpetaUsada}
          </p>
        )}

        {/* Contadores */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{resultado.creados?.length ?? 0}</div>
            <div style={{ fontSize: 11, color: '#166534' }}>creados</div>
          </div>
          <div style={{ flex: 1, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#2563eb' }}>{resultado.actualizados?.length ?? 0}</div>
            <div style={{ fontSize: 11, color: '#1d4ed8' }}>actualizados</div>
          </div>
          <div style={{ flex: 1, background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#7c3aed' }}>{resultado.sinDocente?.length ?? 0}</div>
            <div style={{ fontSize: 11, color: '#6d28d9' }}>docentes creados</div>
          </div>
        </div>

        {/* Registros creados */}
        {resultado.creados?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#166534' }}>✅ Registros creados</div>
            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #bbf7d0', borderRadius: 6 }}>
              {resultado.creados.map((r, i) => (
                <div key={i} style={{ padding: '6px 10px', borderBottom: '1px solid #f0fdf4', fontSize: 11 }}>
                  <strong>{r.materia}</strong> — {r.docente}
                  {r.grupo ? <span style={{ color: '#888' }}> ({r.grupo})</span> : null}
                  {r.campos?.length > 0 && <><br /><span style={{ color: '#16a34a' }}>{r.campos.map(k => CAMPO_LABEL[k] ?? k).join(', ')}</span></>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Registros actualizados */}
        {resultado.actualizados?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#1d4ed8' }}>🔄 Checkboxes actualizados</div>
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #bfdbfe', borderRadius: 6 }}>
              {resultado.actualizados.map((r, i) => (
                <div key={i} style={{ padding: '6px 10px', borderBottom: '1px solid #eff6ff', fontSize: 11 }}>
                  <strong>{r.materia}</strong> — {r.docente}
                  {r.grupo ? <span style={{ color: '#888' }}> ({r.grupo})</span> : null}
                  <br /><span style={{ color: '#2563eb' }}>{r.campos.map(k => CAMPO_LABEL[k] ?? k).join(', ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Docentes creados automáticamente */}
        {resultado.sinDocente?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#7c3aed' }}>🆕 Docentes creados automáticamente</div>
            <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid #e9d5ff', borderRadius: 6, background: '#fdf4ff' }}>
              {resultado.sinDocente.map((r, i) => (
                <div key={i} style={{ padding: '5px 10px', borderBottom: '1px solid #e9d5ff', fontSize: 11, color: '#6d28d9' }}>
                  👤 {r.carpetaDocente}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              Puedes agregar su correo en la sección <strong>Docentes</strong>.
            </p>
          </div>
        )}

        {/* Sin cambios */}
        {resultado.total === 0 && !resultado.sinDocente?.length && (
          <div>
            {!resultado.carpetaExiste ? (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, fontSize: 12, color: '#b91c1c' }}>
                ❌ <strong>La carpeta no contiene subcarpetas.</strong> Verifica la ruta:<br />
                <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{resultado.carpetaUsada}</span>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', padding: '12px 0' }}>
                ✅ No hay cambios nuevos. Todo ya está registrado.
              </p>
            )}
            {resultado.carpetasMaterias?.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: '#888' }}>
                <strong>Subcarpetas vistas en:</strong> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{resultado.carpetaUsada}</span>
                <div style={{ maxHeight: 100, overflowY: 'auto', background: '#f9fafb', borderRadius: 6, padding: '6px 10px', marginTop: 4 }}>
                  {resultado.carpetasMaterias.map((c, i) => <div key={i}>📁 {c}</div>)}
                </div>
              </div>
            )}
          </div>
        )}

        <button className="btn" onClick={onCerrar}>Cerrar</button>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Auditorias() {
  const [cuatrimestres,   setCuatrimestres]   = useState([])
  const [docentes,        setDocentes]        = useState([])
  const [cuatriId,        setCuatriId]        = useState('')
  const [rows,            setRows]            = useState([])
  const [loading,         setLoading]         = useState(false)
  const [modalAgregar,     setModalAgregar]     = useState(false)
  const [modalNotificar,   setModalNotificar]   = useState(false)
  const [resultadoSync,    setResultadoSync]    = useState(null)
  const [sincronizando,    setSincronizando]    = useState(false)
  const [errorSync,        setErrorSync]        = useState('')
  const [rutaMaterias,     setRutaMaterias]     = useState('')
  const [editandoRuta,     setEditandoRuta]     = useState(false)
  const [rutaInput,        setRutaInput]        = useState('')
  const [pendingUpdates,  setPendingUpdates]  = useState({}) // { rowId: { campo: valor } }
  const { addToast } = useToast()

  useEffect(() => {
    getCuatrimestres().then(r => {
      setCuatrimestres(r.data)
      if (r.data.length) setCuatriId(r.data[r.data.length - 1].id)
    })
    getDocentes().then(r => setDocentes(r.data))
    getAuditoriasConfig().then(r => {
      if (r.data.rutaMaterias) { setRutaMaterias(r.data.rutaMaterias); setRutaInput(r.data.rutaMaterias) }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!cuatriId) return
    setLoading(true)
    getAuditorias(cuatriId)
      .then(r => setRows(r.data))
      .catch(() => addToast('Error al cargar auditorías', 'error'))
      .finally(() => setLoading(false))
  }, [cuatriId])

  // Debounce para campos de texto
  const timers = {}
  const handleChange = useCallback((id, campo, valor, flush = false) => {
    // Actualizar localmente de inmediato
    setRows(prev => prev.map(r => r.id === id ? { ...r, [campo]: valor } : r))

    if (flush) {
      // Guardar inmediatamente (onBlur en texto)
      actualizarAuditoria(id, { [campo]: valor })
        .catch(() => addToast('Error al guardar', 'error'))
      return
    }

    // Para checkboxes: guardar al instante
    actualizarAuditoria(id, { [campo]: valor })
      .catch(() => addToast('Error al guardar', 'error'))
  }, [])

  async function guardarRuta() {
    const ruta = rutaInput.trim()
    if (!ruta) return addToast('Ingresa la ruta', 'error')
    try {
      await saveAuditoriasConfig({ rutaMaterias: ruta })
      setRutaMaterias(ruta)
      setEditandoRuta(false)
      addToast('Ruta guardada', 'success')
    } catch { addToast('Error al guardar', 'error') }
  }

  async function sincronizar() {
    if (!cuatriId) return
    if (!rutaMaterias) { setEditandoRuta(true); return }
    setSincronizando(true)
    setErrorSync('')
    try {
      const { data } = await sincronizarAuditorias({ cuatrimestreId: cuatriId })
      setResultadoSync(data)
      getAuditorias(cuatriId).then(r => setRows(r.data)).catch(() => {})
    } catch (e) {
      const msg = e.response?.data?.error ?? e.message ?? 'Error desconocido'
      setErrorSync(msg)
      console.error('[sincronizar]', e)
    } finally {
      setSincronizando(false)
    }
  }

  function onAgregarFila(nueva) {
    setRows(prev => [...prev, nueva])
    setModalAgregar(false)
    addToast('Registro agregado', 'success')
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este registro?')) return
    try {
      await eliminarAuditoria(id)
      setRows(prev => prev.filter(r => r.id !== id))
      addToast('Eliminado', 'success')
    } catch {
      addToast('Error al eliminar', 'error')
    }
  }

  // Agrupar filas por grupo
  const grupos = {}
  for (const row of rows) {
    const g = row.grupo || '—'
    if (!grupos[g]) grupos[g] = []
    grupos[g].push(row)
  }

  const thStyle = {
    background: '#a50021', color: '#fff', fontSize: 10, fontWeight: 700,
    padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap', border: '1px solid #8b001c',
  }
  const thGray = { ...thStyle, background: '#555', border: '1px solid #444' }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>📋 Auditoría de Planeaciones</h2>

        <select
          value={cuatriId}
          onChange={e => setCuatriId(Number(e.target.value))}
          style={{ fontSize: 13 }}
        >
          {cuatrimestres.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>

        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setModalAgregar(true)}>
          + Agregar
        </button>

        <button
          className="btn"
          style={{ fontSize: 12, background: '#1D9E75', color: '#fff', border: 'none' }}
          onClick={() => setModalNotificar(true)}
          disabled={!rows.length}
        >
          📧 Notificar docentes
        </button>

        <button
          className="btn"
          style={{ fontSize: 12, background: '#2563eb', color: '#fff', border: 'none' }}
          onClick={sincronizar}
          disabled={!cuatriId || sincronizando}
          title={rutaMaterias || 'Configura la ruta primero'}
        >
          {sincronizando ? '🔍 Escaneando…' : '📂 Sincronizar'}
        </button>

        <button
          className="btn"
          style={{ fontSize: 12, padding: '6px 8px' }}
          onClick={() => { setRutaInput(rutaMaterias); setEditandoRuta(v => !v) }}
          title={rutaMaterias ? `Carpeta: ${rutaMaterias}` : 'Configurar ruta de carpetas'}
        >
          ⚙️
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>
          {rows.length} registros
        </span>
      </div>

      {/* Panel de configuración de ruta */}
      {editandoRuta && (
        <div style={{ background: 'var(--surface, #f9fafb)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>
              📁 Ruta de la carpeta <strong>Materias</strong> descargada de Drive
            </label>
            <input
              value={rutaInput}
              onChange={e => setRutaInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && guardarRuta()}
              placeholder="C:\Users\Alonzo\Desktop\Materias"
              style={{ fontFamily: 'monospace', fontSize: 12, width: '100%' }}
              autoFocus
            />
          </div>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={guardarRuta}>Guardar</button>
          <button className="btn" style={{ fontSize: 12 }} onClick={() => setEditandoRuta(false)}>Cancelar</button>
        </div>
      )}

      {!editandoRuta && rutaMaterias && (
        <div style={{ fontSize: 11, color: '#888', marginBottom: 10, fontFamily: 'monospace' }}>
          📁 {rutaMaterias}
        </div>
      )}

      {!editandoRuta && !rutaMaterias && (
        <div style={{ fontSize: 12, color: '#ea580c', marginBottom: 10 }}>
          ⚠️ Configura la ruta de la carpeta con <strong>⚙️</strong> para poder sincronizar.
        </div>
      )}

      {errorSync && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#b91c1c', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span>❌</span>
          <div>
            <strong>Error al sincronizar:</strong> {errorSync}
            <br /><span style={{ color: '#888' }}>Verifica que la ruta existe y que el servidor tiene acceso a esa carpeta.</span>
          </div>
          <button onClick={() => setErrorSync('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {loading ? (
        <div className="loading"><span className="spinner" /> Cargando…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: 900 }}>
            <thead>
              {/* Fila 1: grupos de columnas */}
              <tr>
                <th rowSpan={2} style={{ ...thGray, minWidth: 140 }}>Materia</th>
                <th rowSpan={2} style={{ ...thGray, minWidth: 120 }}>Docente</th>
                <th rowSpan={2} style={{ ...thGray, minWidth: 80 }}>Grupo</th>
                <th colSpan={4} style={thStyle}>Planeación</th>
                <th colSpan={1} style={thStyle}>Inicio</th>
                <th colSpan={5} style={{ ...thStyle, background: '#7b1517' }}>1er Corte</th>
                <th colSpan={5} style={{ ...thStyle, background: '#5a0f11' }}>2do Corte</th>
                <th colSpan={5} style={{ ...thStyle, background: '#3d0b0c' }}>3er Corte</th>
                <th rowSpan={2} style={{ ...thGray, minWidth: 90 }}>Avance</th>
                <th rowSpan={2} style={thGray}></th>
              </tr>
              {/* Fila 2: columnas individuales */}
              <tr>
                {ALL_COLS.map(c => <th key={c.key} style={thStyle}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(grupos).map(([grupo, filas]) => (
                <>
                  <tr key={`g-${grupo}`}>
                    <td colSpan={ALL_COLS.length + 5} style={{ background: '#f3f4f6', fontWeight: 700, fontSize: 11, padding: '4px 8px', color: '#444' }}>
                      {grupo}
                    </td>
                  </tr>
                  {filas.map(row => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '3px 8px', fontWeight: 600 }}>{row.materia}</td>
                      <td style={{ padding: '3px 8px', color: '#555' }}>{row.docente?.nombre}</td>
                      <td style={{ padding: '3px 8px', color: '#888', fontSize: 10 }}>{row.grupo}</td>
                      {ALL_COLS.map(col => (
                        <Celda key={col.key} row={row} col={col} onChange={handleChange} />
                      ))}
                      <Progreso row={row} />
                      <td style={{ padding: '2px 4px' }}>
                        <button
                          onClick={() => eliminar(row.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14 }}
                          title="Eliminar"
                        >🗑</button>
                      </td>
                    </tr>
                  ))}
                </>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={ALL_COLS.length + 5} style={{ textAlign: 'center', padding: 32, color: '#aaa' }}>
                    No hay registros. Agrega el primero con el botón <strong>+ Agregar</strong>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalAgregar && (
        <ModalAgregar
          cuatrimestreId={cuatriId}
          docentes={docentes}
          onGuardar={onAgregarFila}
          onCerrar={() => setModalAgregar(false)}
        />
      )}

      {modalNotificar && (
        <ModalNotificar
          cuatrimestreId={cuatriId}
          cuatrimestres={cuatrimestres}
          onCerrar={() => setModalNotificar(false)}
        />
      )}

      {resultadoSync && (
        <ModalResultadoSync
          resultado={resultadoSync}
          onCerrar={() => setResultadoSync(null)}
        />
      )}
    </div>
  )
}
