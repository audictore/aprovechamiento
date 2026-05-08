import { useState, useEffect, useCallback } from 'react'
import {
  getCuatrimestres, getDocentes,
  getAuditorias, crearAuditoria, actualizarAuditoria, eliminarAuditoria,
  notificarAuditorias, sincronizarAuditorias,
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

// ─── Modal sincronizar carpetas ───────────────────────────────────────────────
function ModalSincronizar({ cuatrimestreId, cuatrimestres, onSincronizado, onCerrar }) {
  const [ruta,      setRuta]      = useState('')
  const [cargando,  setCargando]  = useState(false)
  const [resultado, setResultado] = useState(null)
  const { addToast } = useToast()

  const cuatri = cuatrimestres.find(c => c.id === cuatrimestreId)

  async function sincronizar() {
    if (!ruta.trim()) return addToast('Ingresa la ruta de la carpeta', 'error')
    setCargando(true)
    try {
      const { data } = await sincronizarAuditorias({ cuatrimestreId, rutaBase: ruta.trim() })
      setResultado(data)
      if (data.total > 0) onSincronizado()
    } catch (e) {
      addToast(e.response?.data?.error ?? e.message, 'error')
    } finally {
      setCargando(false)
    }
  }

  const CAMPO_LABEL = {
    planProfesor: 'Planeación (P)', presentacion: 'Presentación',
    p1Conocimiento: '1C-Conoc', p1Producto: '1C-Prod', p1Desempeno: '1C-Desemp',
    p1Asistencia: '1C-Asist', p1Calificaciones: '1C-Calif',
    p2Conocimiento: '2C-Conoc', p2Producto: '2C-Prod', p2Desempeno: '2C-Desemp',
    p2Asistencia: '2C-Asist', p2Calificaciones: '2C-Calif',
    p3Conocimiento: '3C-Conoc', p3Producto: '3C-Prod', p3Desempeno: '3C-Desemp',
    p3Asistencia: '3C-Asist', p3Calificaciones: '3C-Calif',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface, #fff)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 580, boxShadow: '0 8px 32px rgba(0,0,0,.22)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>📂 Sincronizar carpetas de Drive</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#666' }}>
          Escanea la carpeta del cuatrimestre <strong>{cuatri?.nombre}</strong> descargada localmente
          y marca automáticamente lo que ya está entregado.
        </p>

        {!resultado ? (
          <>
            <div className="field">
              <label style={{ fontSize: 12 }}>Ruta de la carpeta del cuatrimestre</label>
              <input
                value={ruta}
                onChange={e => setRuta(e.target.value)}
                placeholder="Ej: C:\Users\Alonzo\Desktop\Materias\2do Cuatrimestre"
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <small style={{ color: '#888', fontSize: 11 }}>
                La carpeta debe tener la estructura: Materia → Docente → Grupo → Corte → Evidencia
              </small>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 11, color: '#166534' }}>
              <strong>¿Qué detecta automáticamente?</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Planeación (P) — archivo con "planeac" en el nombre a nivel docente</li>
                <li>Presentación — archivo .pptx o con "presentac/encuadre/primera clase"</li>
                <li>Evidencias por corte — carpetas cuyo nombre contenga el número del corte,<br />
                  con subcarpetas de evidencias que tengan archivos dentro</li>
              </ul>
              <p style={{ margin: '6px 0 0' }}>Solo <strong>marca</strong> lo encontrado; no desmarca lo ya capturado manualmente.</p>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={sincronizar} disabled={cargando}>
                {cargando ? '🔍 Escaneando…' : '🔍 Sincronizar'}
              </button>
              <button className="btn" onClick={onCerrar}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{resultado.total}</div>
                <div style={{ fontSize: 11, color: '#166534' }}>registros actualizados</div>
              </div>
              <div style={{ flex: 1, background: resultado.sinCoincidencia.length ? '#fff7ed' : '#f9fafb', border: `1px solid ${resultado.sinCoincidencia.length ? '#fed7aa' : '#e5e7eb'}`, borderRadius: 8, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: resultado.sinCoincidencia.length ? '#ea580c' : '#9ca3af' }}>{resultado.sinCoincidencia.length}</div>
                <div style={{ fontSize: 11, color: resultado.sinCoincidencia.length ? '#9a3412' : '#6b7280' }}>sin coincidencia en BD</div>
              </div>
            </div>

            {resultado.actualizados.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#166534' }}>✅ Actualizados</div>
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                  {resultado.actualizados.map((r, i) => (
                    <div key={i} style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 11 }}>
                      <strong>{r.materia}</strong> — {r.docente}
                      {r.grupo ? <span style={{ color: '#888' }}> ({r.grupo})</span> : null}
                      <br />
                      <span style={{ color: '#16a34a' }}>
                        {r.campos.map(k => CAMPO_LABEL[k] ?? k).join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resultado.sinCoincidencia.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#ea580c' }}>⚠️ Sin coincidencia en la tabla</div>
                <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #fed7aa', borderRadius: 6, background: '#fff7ed' }}>
                  {resultado.sinCoincidencia.map((r, i) => (
                    <div key={i} style={{ padding: '5px 10px', borderBottom: '1px solid #fed7aa', fontSize: 11, color: '#9a3412' }}>
                      {r.materia} / {r.docente} / {r.grupo}
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                  Agrega estos registros manualmente con <strong>+ Agregar</strong> y vuelve a sincronizar.
                </p>
              </div>
            )}

            <button className="btn" onClick={onCerrar}>Cerrar</button>
          </>
        )}
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
  const [modalSincronizar, setModalSincronizar] = useState(false)
  const [pendingUpdates,  setPendingUpdates]  = useState({}) // { rowId: { campo: valor } }
  const { addToast } = useToast()

  useEffect(() => {
    getCuatrimestres().then(r => {
      setCuatrimestres(r.data)
      if (r.data.length) setCuatriId(r.data[r.data.length - 1].id)
    })
    getDocentes().then(r => setDocentes(r.data))
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
          onClick={() => setModalSincronizar(true)}
          disabled={!cuatriId}
        >
          📂 Sincronizar carpetas
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>
          {rows.length} registros
        </span>
      </div>

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

      {modalSincronizar && (
        <ModalSincronizar
          cuatrimestreId={cuatriId}
          cuatrimestres={cuatrimestres}
          onSincronizado={() => {
            // Recargar datos de la tabla
            setLoading(true)
            getAuditorias(cuatriId)
              .then(r => setRows(r.data))
              .catch(() => addToast('Error al recargar', 'error'))
              .finally(() => setLoading(false))
          }}
          onCerrar={() => setModalSincronizar(false)}
        />
      )}
    </div>
  )
}
