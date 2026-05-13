import { useState, useEffect, useRef } from 'react'
import { getMemosConfig, saveMemosConfig, getMemosFiles, generateMemos, deleteHorario } from '../api.js'
import { useToast } from '../components/Toast.jsx'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// ─── Sección Configuración ────────────────────────────────────────────────────
function SeccionConfig({ onSaved }) {
  const [cfg, setCfg]       = useState(null)
  const [saving, setSaving] = useState(false)
  const { addToast }        = useToast()

  useEffect(() => {
    getMemosConfig()
      .then(r => setCfg(r.data))
      .catch(() => addToast('No se pudo cargar la configuración', 'error'))
  }, [])

  function set(path, val) {
    setCfg(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.')
      let obj = next
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]]
      obj[keys[keys.length - 1]] = val
      return next
    })
  }

  async function guardar() {
    setSaving(true)
    try {
      // Coordinador único: copiar LAGE → LAD antes de guardar
      const payload = JSON.parse(JSON.stringify(cfg))
      const coordLage = payload.programa_educativo?.LAGE?.coordinador
      if (coordLage && payload.programa_educativo?.LAD) {
        payload.programa_educativo.LAD.coordinador = { ...coordLage }
      }
      await saveMemosConfig(payload)
      addToast('Configuración guardada', 'success')
      onSaved?.()
    } catch (e) {
      addToast('Error: ' + (e.response?.data?.error ?? e.message), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!cfg) return <div className="loading"><span className="spinner" /> Cargando config…</div>

  const field = (label, path, type = 'text') => (
    <div className="field" key={path}>
      <label style={{ fontSize: 12 }}>{label}</label>
      <input
        type={type}
        value={path.split('.').reduce((o, k) => o?.[k] ?? '', cfg)}
        onChange={e => set(path, type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </div>
  )

  const subTitle = (text) => (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
      color: 'var(--text)', opacity: 0.5, textTransform: 'uppercase',
      marginBottom: 8,
    }}>
      {text}
    </div>
  )

  const subBlock = (title, children) => (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {subTitle(title)}
      {children}
    </div>
  )

  const personaFields = (prefix, labels = {}) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {field(labels.nombre      ?? 'Nombre',      `${prefix}.nombre`)}
      {field(labels.cargo_corto ?? 'Cargo corto', `${prefix}.cargo_corto`)}
      {field(labels.cargo_largo ?? 'Cargo largo', `${prefix}.cargo_largo`)}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Datos del memo ── */}
      {subBlock('Datos del memo',
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {field('Cuatrimestre',                'cuatrimestre')}
          {field('Año de referencia',           'anio_ref', 'number')}
          {field('Prefijo de referencia',       'ref_prefix')}
          {field('Número inicial de referencia','ref_number')}
        </div>
      )}

      {/* ── Memo para quién ── */}
      {subBlock('Memo para quién',
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Coordinador principal (siempre presente) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {field('Nombre', 'programa_educativo.LAGE.coordinador.nombre')}
            {field('Cargo',  'programa_educativo.LAGE.coordinador.cargo_largo')}
          </div>

          {/* Destinatarios adicionales */}
          {(cfg.destinatarios_adicionales || []).map((dest, idx) => (
            <div key={idx} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end',
            }}>
              <div className="field">
                <label style={{ fontSize: 12 }}>Nombre</label>
                <input
                  type="text"
                  value={dest.nombre || ''}
                  onChange={e => {
                    const arr = [...(cfg.destinatarios_adicionales || [])]
                    arr[idx] = { ...arr[idx], nombre: e.target.value }
                    set('destinatarios_adicionales', arr)
                  }}
                />
              </div>
              <div className="field">
                <label style={{ fontSize: 12 }}>Cargo</label>
                <input
                  type="text"
                  value={dest.cargo || ''}
                  onChange={e => {
                    const arr = [...(cfg.destinatarios_adicionales || [])]
                    arr[idx] = { ...arr[idx], cargo: e.target.value }
                    set('destinatarios_adicionales', arr)
                  }}
                />
              </div>
              <button
                onClick={() => {
                  const arr = (cfg.destinatarios_adicionales || []).filter((_, i) => i !== idx)
                  set('destinatarios_adicionales', arr)
                }}
                title="Eliminar"
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                  cursor: 'pointer', color: '#A32D2D', fontSize: 16,
                  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >✕</button>
            </div>
          ))}

          {/* Botón añadir */}
          <div>
            <button
              className="btn"
              style={{ fontSize: 12 }}
              onClick={() => {
                const arr = [...(cfg.destinatarios_adicionales || []), { nombre: '', cargo: '' }]
                set('destinatarios_adicionales', arr)
              }}
            >
              + Añadir destinatario
            </button>
          </div>
        </div>
      )}

      {/* ── Copias del memo ── */}
      {subBlock('Copias del memo',
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 6 }}>Secretaría Académica</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {field('Nombre', 'secretaria_academica.nombre')}
              {field('Cargo',  'secretaria_academica.cargo_largo')}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 6 }}>Jefe de Recursos Humanos</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {field('Nombre', 'jefe_rh.nombre')}
              {field('Cargo',  'jefe_rh.cargo_largo')}
            </div>
          </div>

          {/* Copias adicionales */}
          {(cfg.copias_adicionales || []).map((copia, idx) => (
            <div key={idx} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end',
            }}>
              <div className="field">
                <label style={{ fontSize: 12 }}>Nombre</label>
                <input
                  type="text"
                  value={copia.nombre || ''}
                  onChange={e => {
                    const arr = [...(cfg.copias_adicionales || [])]
                    arr[idx] = { ...arr[idx], nombre: e.target.value }
                    set('copias_adicionales', arr)
                  }}
                />
              </div>
              <div className="field">
                <label style={{ fontSize: 12 }}>Cargo</label>
                <input
                  type="text"
                  value={copia.cargo || ''}
                  onChange={e => {
                    const arr = [...(cfg.copias_adicionales || [])]
                    arr[idx] = { ...arr[idx], cargo: e.target.value }
                    set('copias_adicionales', arr)
                  }}
                />
              </div>
              <button
                onClick={() => {
                  const arr = (cfg.copias_adicionales || []).filter((_, i) => i !== idx)
                  set('copias_adicionales', arr)
                }}
                title="Eliminar"
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                  cursor: 'pointer', color: '#A32D2D', fontSize: 16,
                  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >✕</button>
            </div>
          ))}

          <div>
            <button
              className="btn"
              style={{ fontSize: 12 }}
              onClick={() => {
                const arr = [...(cfg.copias_adicionales || []), { nombre: '', cargo: '' }]
                set('copias_adicionales', arr)
              }}
            >
              + Añadir copia
            </button>
          </div>
        </div>
      )}

      <div>
        <button className="btn btn-primary" onClick={guardar} disabled={saving} style={{ minWidth: 140 }}>
          {saving ? <><span className="spinner" /> Guardando…</> : '💾 Guardar configuración'}
        </button>
      </div>
    </div>
  )
}

// ─── Sección Archivos ─────────────────────────────────────────────────────────
function SeccionArchivos({ files, onRefresh }) {
  const [uploadingCarga,    setUploadingCarga]    = useState(false)
  const [uploadingHorarios, setUploadingHorarios] = useState(false)
  const [deletingFile,      setDeletingFile]      = useState(null)
  const { addToast } = useToast()
  const cargaRef    = useRef()
  const horariosRef = useRef()

  async function subirCarga(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCarga(true)
    try {
      const fd = new FormData()
      fd.append('carga', file)
      const token = localStorage.getItem('token')
      await fetch(`${BASE_URL}/memos/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      addToast('Carga académica subida', 'success')
      onRefresh()
    } catch (e) {
      addToast('Error: ' + e.message, 'error')
    } finally {
      setUploadingCarga(false)
      e.target.value = ''
    }
  }

  async function subirHorarios(e) {
    const files = e.target.files
    if (!files?.length) return
    setUploadingHorarios(true)
    try {
      const fd = new FormData()
      Array.from(files).forEach(f => fd.append('horarios', f))
      const token = localStorage.getItem('token')
      const r = await fetch(`${BASE_URL}/memos/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = await r.json()
      addToast(`${data.horarios} archivo(s) de horario subido(s)`, 'success')
      onRefresh()
    } catch (e) {
      addToast('Error: ' + e.message, 'error')
    } finally {
      setUploadingHorarios(false)
      e.target.value = ''
    }
  }

  async function borrarHorario(name) {
    setDeletingFile(name)
    try {
      await deleteHorario(name)
      addToast(`${name} eliminado`, 'success')
      onRefresh()
    } catch (e) {
      addToast('Error: ' + e.message, 'error')
    } finally {
      setDeletingFile(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Carga académica */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📋 Carga académica</div>
        {files?.carga ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1D9E75' }}>
            <span>✓</span>
            <span style={{ flex: 1 }}>{files.carga.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text)', opacity: 0.6 }}>{fmt(files.carga.size)}</span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text)', opacity: 0.5, marginBottom: 8 }}>
            Sin archivo — sube el Excel de carga académica
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <input ref={cargaRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={subirCarga} />
          <button
            className="btn"
            style={{ fontSize: 12 }}
            onClick={() => cargaRef.current.click()}
            disabled={uploadingCarga}
          >
            {uploadingCarga ? <><span className="spinner" /> Subiendo…</> : '📂 Seleccionar carga.xlsx'}
          </button>
        </div>
      </div>

      {/* Horarios */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
          🗓 Horarios ({files?.horarios?.length ?? 0} archivo{files?.horarios?.length !== 1 ? 's' : ''})
        </div>
        {files?.horarios?.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, maxHeight: 180, overflowY: 'auto' }}>
            {files.horarios.map(f => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ flex: 1, color: '#1D9E75' }}>✓ {f.name}</span>
                <span style={{ opacity: 0.5 }}>{fmt(f.size)}</span>
                <button
                  onClick={() => borrarHorario(f.name)}
                  disabled={deletingFile === f.name}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', fontSize: 14, padding: '0 4px', lineHeight: 1 }}
                  title="Eliminar"
                >
                  {deletingFile === f.name ? '…' : '✕'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text)', opacity: 0.5, marginBottom: 8 }}>
            Sin horarios — sube uno o varios Excel (pueden ser multi-hoja)
          </div>
        )}
        <input ref={horariosRef} type="file" accept=".xlsx,.xls" multiple style={{ display: 'none' }} onChange={subirHorarios} />
        <button
          className="btn"
          style={{ fontSize: 12 }}
          onClick={() => horariosRef.current.click()}
          disabled={uploadingHorarios}
        >
          {uploadingHorarios ? <><span className="spinner" /> Subiendo…</> : '📂 Agregar horario(s)'}
        </button>
      </div>
    </div>
  )
}

// ─── Sección Generar + Log ────────────────────────────────────────────────────
function SeccionGenerar({ files, onDone }) {
  const [generando,  setGenerando]  = useState(false)
  const [log,        setLog]        = useState([])
  const [done,       setDone]       = useState(null)   // null | 0 (ok) | 1 (errors)
  const logRef = useRef()
  const { addToast } = useToast()

  const puedeGenerar = files?.carga && !generando

  function appendLog(entry) {
    setLog(prev => [...prev, entry])
    setTimeout(() => { logRef.current?.scrollTo(0, 99999) }, 50)
  }

  async function handleGenerar() {
    setLog([])
    setDone(null)
    setGenerando(true)

    const token = localStorage.getItem('token')

    // Abrir SSE primero
    const es = new EventSource(`${BASE_URL}/memos/log-stream?token=${token}`)
    es.onmessage = e => {
      try {
        const evt = JSON.parse(e.data)
        if (evt.type === 'start')  appendLog({ type: 'info', text: '▶ Iniciando generación…' })
        else if (evt.type === 'log')   appendLog({ type: 'log',  text: evt.text })
        else if (evt.type === 'error') appendLog({ type: 'err',  text: evt.text })
        else if (evt.type === 'done') {
          setDone(evt.code)
          setGenerando(false)
          es.close()
          onDone?.()
          if (evt.code === 0) addToast('Documentos generados correctamente', 'success')
          else addToast('Generación con errores — revisa el log', 'warning')
        }
      } catch {}
    }
    es.onerror = () => {
      appendLog({ type: 'err', text: 'Error en la conexión SSE' })
      setGenerando(false)
      es.close()
    }

    // Disparar generación
    try {
      await generateMemos()
    } catch (e) {
      appendLog({ type: 'err', text: 'Error al iniciar: ' + e.message })
      setGenerando(false)
      es.close()
    }
  }

  const logColor = t => t === 'err' ? '#E55' : t === 'info' ? '#1D9E75' : 'var(--text)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="btn btn-primary"
          onClick={handleGenerar}
          disabled={!puedeGenerar}
          style={{ minWidth: 180 }}
        >
          {generando ? <><span className="spinner" /> Generando…</> : '⚙️ Generar documentos'}
        </button>
        {!files?.carga && (
          <span style={{ fontSize: 12, color: 'var(--text)', opacity: 0.6 }}>
            Sube la carga académica primero
          </span>
        )}
        {done === 0 && <span style={{ fontSize: 12, color: '#1D9E75', fontWeight: 700 }}>✓ Completado</span>}
        {done === 1 && <span style={{ fontSize: 12, color: '#E55', fontWeight: 700 }}>⚠ Con errores</span>}
      </div>

      {log.length > 0 && (
        <div
          ref={logRef}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            fontFamily: 'monospace',
            fontSize: 12,
            maxHeight: 280,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {log.map((entry, i) => (
            <div key={i} style={{ color: logColor(entry.type), whiteSpace: 'pre-wrap' }}>
              {entry.text}
            </div>
          ))}
          {generando && <div style={{ color: '#1D9E75' }}>…</div>}
        </div>
      )}
    </div>
  )
}

// ─── Sección Resultados ───────────────────────────────────────────────────────
function SeccionResultados({ files }) {
  const token = localStorage.getItem('token')
  const [descargando, setDescargando] = useState(false)

  async function descargarTodos() {
    setDescargando(true)
    for (const f of files.output) {
      const a = document.createElement('a')
      a.href = `${BASE_URL}/memos/download/${encodeURIComponent(f.name)}?token=${token}`
      a.download = f.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Pequeña pausa para que el navegador procese cada descarga
      await new Promise(r => setTimeout(r, 400))
    }
    setDescargando(false)
  }

  if (!files?.output?.length) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text)', opacity: 0.5 }}>
        Aún no hay documentos generados.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Botón descargar todos */}
      <div style={{ marginBottom: 8 }}>
        <button
          className="btn btn-primary"
          onClick={descargarTodos}
          disabled={descargando}
          style={{ fontSize: 12, padding: '7px 16px' }}
        >
          {descargando
            ? <><span className="spinner" /> Descargando…</>
            : `⬇ Descargar todos — ${files.output.length} archivo${files.output.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {files.output.map(f => (
        <div
          key={f.name}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: 6, fontSize: 13,
          }}
        >
          <span style={{ flex: 1, wordBreak: 'break-word' }}>📄 {f.name}</span>
          <span style={{ fontSize: 11, opacity: 0.5, whiteSpace: 'nowrap' }}>{fmt(f.size)}</span>
          <a
            href={`${BASE_URL}/memos/download/${encodeURIComponent(f.name)}?token=${token}`}
            download={f.name}
            className="btn btn-primary"
            style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}
          >
            ⬇ Descargar
          </a>
        </div>
      ))}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function MemosPage({ esAdmin }) {
  const [files, setFiles] = useState(null)
  const { addToast } = useToast()

  function refreshFiles() {
    getMemosFiles()
      .then(r => setFiles(r.data))
      .catch(() => addToast('No se pudo obtener la lista de archivos', 'error'))
  }

  useEffect(() => { refreshFiles() }, [])

  const cardStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '18px 22px',
    marginBottom: 18,
  }

  const titleStyle = {
    fontSize: 15, fontWeight: 700, marginBottom: 14,
    color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8,
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 820 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
        📄 Generador de Memorándums
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text)', opacity: 0.65, marginBottom: 24 }}>
        Genera los documentos Word (DOCX) de carga académica y horario para cada docente.
      </p>

      {/* Configuración */}
      <div style={cardStyle}>
        <div style={titleStyle}>⚙️ Configuración</div>
        <SeccionConfig onSaved={refreshFiles} />
      </div>

      {/* Archivos */}
      <div style={cardStyle}>
        <div style={titleStyle}>📁 Archivos de entrada</div>
        {files === null
          ? <div className="loading"><span className="spinner" /> Cargando…</div>
          : <SeccionArchivos files={files} onRefresh={refreshFiles} />
        }
      </div>

      {/* Generar */}
      <div style={cardStyle}>
        <div style={titleStyle}>⚙️ Generar</div>
        <SeccionGenerar files={files} onDone={refreshFiles} />
      </div>

      {/* Resultados */}
      <div style={cardStyle}>
        <div style={{ ...titleStyle, marginBottom: 10 }}>
          📥 Documentos generados
          {files?.output?.length > 0 && (
            <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.6 }}>
              ({files.output.length})
            </span>
          )}
          <button
            onClick={refreshFiles}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#1D9E75' }}
            title="Actualizar lista"
          >
            ↺
          </button>
        </div>
        {files === null
          ? <div className="loading"><span className="spinner" /> Cargando…</div>
          : <SeccionResultados files={files} />
        }
      </div>
    </div>
  )
}
