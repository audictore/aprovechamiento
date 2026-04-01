import { useState } from 'react'
import { crearCuatrimestre, uploadPDFs, eliminarCuatrimestre, eliminarPrograma, eliminarParcial, limpiarParcial } from '../api.js'
import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const PROGRAMAS = [
  'TSU: Gestión del Capital Humano',
  'TSU: Emprendimiento, Evaluación y Formulación de Proyectos',
  'Licenciatura en Administración y Gestión Empresarial'
]

export default function Sidebar({ cuatrimestres, seleccion, onSelect, onReload, esAdmin, onLogout }) {
  const [abiertos,     setAbiertos]     = useState({})
  const [programasMap, setProgramasMap] = useState({})
  const [modal,        setModal]        = useState(false)
  const [modalUpload,  setModalUpload]  = useState(null)
  const [nombre,       setNombre]       = useState('')
  const [uploading,    setUploading]    = useState(false)
  const [uploadForm,   setUploadForm]   = useState({ programa: PROGRAMAS[0], numParcial: '1' })

  async function toggleCuatri(cuatri) {
    const id = cuatri.id
    const estaAbierto = abiertos[id]
    setAbiertos(prev => ({ ...prev, [id]: !estaAbierto }))
    if (!estaAbierto && !programasMap[id]) {
      const r = await api.get(`/cuatrimestres/${id}/programas`)
      setProgramasMap(prev => ({ ...prev, [id]: r.data }))
    }
  }

  async function refreshProgramas(cuatriId) {
    const r = await api.get(`/cuatrimestres/${cuatriId}/programas`)
    setProgramasMap(prev => ({ ...prev, [cuatriId]: r.data }))
  }

  async function handleCrear() {
    const n = nombre.trim()
    if (!n) return alert('Escribe el nombre del cuatrimestre')
    const year = (n.match(/\d{4}/) || ['9999'])[0]
    const mes  = n.toLowerCase().includes('mayo') ? 5
               : n.toLowerCase().includes('sep')  ? 9 : 1
    await crearCuatrimestre({ nombre: n, orden: Number(year) * 10000 + mes * 100 })
    setModal(false)
    setNombre('')
    onReload()
  }

  async function handleUploadExcel(file) {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const prog = encodeURIComponent(uploadForm.programa)
      await api.post(`/parciales/${modalUpload.id}/${prog}/${uploadForm.numParcial}/upload`, fd)
      await refreshProgramas(modalUpload.id)
      onReload()
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error ?? e.message))
    } finally {
      setUploading(false)
    }
  }

  async function handleUploadPDFs(files) {
    if (!files.length) return
    setUploading(true)
    try {
      const programasResp = await api.get(`/cuatrimestres/${modalUpload.id}/programas`)
      const programa = programasResp.data.find(p => p.nombre === uploadForm.programa)
      if (!programa) { alert('Primero sube el Excel de este programa'); return }
      const parcial = programa.parciales.find(p => p.numero === Number(uploadForm.numParcial))
      if (!parcial) { alert('Primero sube el Excel de este parcial'); return }
      const r = await uploadPDFs(parcial.id, uploadForm.numParcial, files)
      const ok  = r.data.resultados.filter(x => !x.error).length
      const err = r.data.resultados.filter(x => x.error).length
      alert(`PDFs procesados: ${ok} exitosos${err ? `, ${err} con error` : ''}`)
      await refreshProgramas(modalUpload.id)
      onReload()
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error ?? e.message))
    } finally {
      setUploading(false)
    }
  }

  async function handleEliminarCuatri(e, cuatri) {
    e.stopPropagation()
    if (!confirm(`¿Eliminar "${cuatri.nombre}" y todos sus datos?`)) return
    await eliminarCuatrimestre(cuatri.id)
    onReload()
  }

  async function handleEliminarPrograma(e, cuatriId, prog) {
    e.stopPropagation()
    if (!confirm(`¿Eliminar "${prog.nombre}" y todos sus parciales?`)) return
    await eliminarPrograma(cuatriId, prog.id)
    await refreshProgramas(cuatriId)
    onReload()
  }

  async function handleEliminarParcial(e, cuatriId, programaId, parcial) {
    e.stopPropagation()
    if (!confirm(`¿Eliminar "${parcial.label}"?`)) return
    await eliminarParcial(cuatriId, programaId, parcial.id)
    await refreshProgramas(cuatriId)
    onReload()
  }

  async function handleLimpiarParcial(e, cuatriId, programaId, parcial) {
    e.stopPropagation()
    if (!confirm(`¿Limpiar datos de "${parcial.label}"? Los grupos y materias se borrarán pero el parcial permanece.`)) return
    await limpiarParcial(parcial.id)
    await refreshProgramas(cuatriId)
    onReload()
  }

  const usuario = localStorage.getItem('usuario') || ''

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-logo">
          Aprovechamiento
          <span>UPMH — Sistema académico</span>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">Cuatrimestres</div>
          {cuatrimestres.map(c => (
            <div key={c.id}>
              <div style={{ display:'flex', alignItems:'center' }}>
                <button
                  className={`cuatri-btn ${abiertos[c.id] ? 'open' : ''}`}
                  style={{ flex:1 }}
                  onClick={() => toggleCuatri(c)}
                >
                  <span>{c.nombre}</span>
                  <span className="arrow">›</span>
                </button>
                {esAdmin && (
                  <button
                    onClick={e => handleEliminarCuatri(e, c)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#ccc', fontSize:14, padding:'0 8px', lineHeight:1 }}
                    title="Eliminar cuatrimestre"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className={`parciales ${abiertos[c.id] ? 'open' : ''}`}>
                {(programasMap[c.id] || []).map(prog => (
                  <div key={prog.id}>
                    <div style={{ display:'flex', alignItems:'center', padding:'5px 8px 2px 18px' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'#aaa', textTransform:'uppercase', letterSpacing:'.04em', flex:1 }}>
                        {prog.nombre.length > 24 ? prog.nombre.slice(0,24)+'…' : prog.nombre}
                      </span>
                      {esAdmin && (
                        <button
                          onClick={e => handleEliminarPrograma(e, c.id, prog)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#ccc', fontSize:12, padding:'0 6px' }}
                          title="Eliminar programa"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {prog.parciales.map(p => (
                      <div key={p.id} style={{ display:'flex', alignItems:'center' }}>
                        <button
                          className={`parcial-btn ${seleccion?.parcial.id === p.id ? 'active' : ''}`}
                          onClick={() => onSelect(c, p, prog)}
                          style={{ paddingLeft:28, flex:1, textAlign:'left' }}
                        >
                          {p.label}
                        </button>
                        {esAdmin && (
                          <div style={{ display:'flex', gap:2, paddingRight:6 }}>
                            <button
                              onClick={e => handleLimpiarParcial(e, c.id, prog.id, p)}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'#BA7517', fontSize:11, padding:'0 4px' }}
                              title="Limpiar datos (subir de nuevo)"
                            >
                              ↺
                            </button>
                            <button
                              onClick={e => handleEliminarParcial(e, c.id, prog.id, p)}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'#ccc', fontSize:12, padding:'0 4px' }}
                              title="Eliminar parcial"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}

                {esAdmin && (
                  <button
                    className="parcial-btn"
                    style={{ color:'#1D9E75', paddingLeft:18 }}
                    onClick={() => { setUploadForm({ programa: PROGRAMAS[0], numParcial:'1' }); setModalUpload(c) }}
                  >
                    + Subir parcial
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {esAdmin && (
          <div className="sidebar-section">
            <button className="sidebar-add" onClick={() => setModal(true)}>
              + Agregar cuatrimestre
            </button>
          </div>
        )}

        <div style={{ marginTop:'auto', padding:'12px 14px', borderTop:'1px solid #e8e8e4' }}>
          <div style={{ fontSize:11, color:'#aaa', marginBottom:6 }}>
            {usuario} · {esAdmin ? 'Administrador' : 'Observador'}
          </div>
          <button className="btn" style={{ width:'100%', fontSize:11 }} onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {modal && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <h2>Nuevo cuatrimestre</h2>
            <div className="field">
              <label>Nombre</label>
              <input
                type="text"
                list="sugerencias"
                placeholder="ej. Enero-Abril 2027"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCrear()}
              />
              <datalist id="sugerencias">
                <option value="Enero-Abril 2026" />
                <option value="Mayo-Agosto 2026" />
                <option value="Septiembre-Diciembre 2026" />
                <option value="Enero-Abril 2027" />
                <option value="Mayo-Agosto 2027" />
              </datalist>
            </div>
            <div className="modal-btns">
              <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCrear}>Crear</button>
            </div>
          </div>
        </div>
      )}

      {modalUpload && (
        <div className="modal-bg" onClick={e => e.target === e.currentTarget && setModalUpload(null)}>
          <div className="modal">
            <h2>Subir parcial — {modalUpload.nombre}</h2>

            <div className="field">
              <label>Programa educativo</label>
              <select
                value={uploadForm.programa}
                onChange={e => setUploadForm(f => ({ ...f, programa: e.target.value }))}
              >
                {PROGRAMAS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Número de parcial</label>
              <select
                value={uploadForm.numParcial}
                onChange={e => setUploadForm(f => ({ ...f, numParcial: e.target.value }))}
              >
                <option value="1">1er Parcial</option>
                <option value="2">2do Parcial</option>
                <option value="3">3er Parcial</option>
              </select>
            </div>

            <div className="field">
              <label>Archivo Excel (.xlsx) — promedios por materia</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={e => handleUploadExcel(e.target.files[0])}
              />
            </div>

            <div className="field">
              <label>PDFs de calificaciones — reprobados exactos (opcional)</label>
              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={e => handleUploadPDFs(e.target.files)}
              />
            </div>

            {uploading && (
              <div className="loading"><span className="spinner" /> Procesando…</div>
            )}

            <div className="modal-btns">
              <button className="btn" onClick={() => setModalUpload(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}