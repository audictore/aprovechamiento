import { useState, useEffect } from 'react'
import Sidebar      from './components/Sidebar.jsx'
import Dashboard    from './pages/Dashboard.jsx'
import Grupos       from './pages/Grupos.jsx'
import Docentes     from './pages/Docentes.jsx'
import Estadisticas from './pages/Estadisticas.jsx'
import Login        from './pages/Login.jsx'
import MemosPage    from './pages/Memos.jsx'
import { getCuatrimestres, verificar } from './api.js'

export default function App() {
  const [rol,           setRol]           = useState(null)
  const [autenticado,   setAutenticado]   = useState(false)
  const [verificando,   setVerificando]   = useState(true)
  const [cuatrimestres, setCuatrimestres] = useState([])
  const [seleccion,     setSeleccion]     = useState(null)
  const [vista,         setVista]         = useState('estadisticas')
  const [tab,           setTab]           = useState('resumen')
  const [tick,          setTick]          = useState(0)
  const [showLogin,     setShowLogin]     = useState(false)
  const [menuAbierto,   setMenuAbierto]   = useState(false)
  const [darkMode,      setDarkMode]      = useState(() => localStorage.getItem('theme') === 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    getCuatrimestres().then(r => setCuatrimestres(r.data)).catch(() => {})
    const token = localStorage.getItem('token')
    if (!token) { setVerificando(false); return }
    verificar()
      .then(r => { setRol(r.data.rol); setAutenticado(true) })
      .catch(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('rol')
        localStorage.removeItem('usuario')
      })
      .finally(() => setVerificando(false))
  }, [])

  useEffect(() => {
    getCuatrimestres().then(r => setCuatrimestres(r.data)).catch(() => {})
  }, [tick])

  function handleLogin(rolRecibido) {
    setRol(rolRecibido)
    setAutenticado(true)
    setShowLogin(false)
  }

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('rol')
    localStorage.removeItem('usuario')
    setAutenticado(false)
    setRol(null)
    setSeleccion(null)
    setVista('estadisticas')
  }

  function handleVerMemos() { setVista('memos'); setMenuAbierto(false) }

  function handleSelect(cuatri, parcial, programa) {
    setSeleccion({ cuatri, parcial, programa })
    setVista('parcial')
    setTab('resumen')
    setMenuAbierto(false)
  }

  const reload  = () => setTick(t => t + 1)
  const esAdmin = rol === 'admin'

  if (verificando) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="loading"><span className="spinner" /> Cargando…</div>
    </div>
  )

  if (showLogin) return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
      display:'flex', alignItems:'center', justifyContent:'center',
      zIndex:1000, padding:20
    }}>
      <div style={{ position:'relative', width:380 }}>
        <button
          onClick={() => setShowLogin(false)}
          style={{
            position:'absolute', top:-12, right:-12,
            background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:'50%', width:28, height:28,
            cursor:'pointer', fontSize:14, zIndex:1001,
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'var(--text)'
          }}
        >
          ✕
        </button>
        <Login onLogin={handleLogin} />
      </div>
    </div>
  )

  return (
    <div className="app-layout">
      {/* Header móvil */}
      <div className="mobile-header">
        <button className="hamburger" onClick={() => setMenuAbierto(true)}>☰</button>
        <div style={{ fontSize:14, fontWeight:700, color:'#1D9E75' }}>Coordinación Administración</div>
        <div style={{ display:'flex', gap:6 }}>
          <button
            className="btn"
            style={{ fontSize:14, padding:'4px 8px' }}
            onClick={() => setDarkMode(d => !d)}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          {!autenticado
            ? <button className="btn btn-primary" style={{ fontSize:11, padding:'6px 12px' }} onClick={() => setShowLogin(true)}>🔑</button>
            : <button className="btn" style={{ fontSize:11, padding:'6px 12px' }} onClick={handleLogout}>Salir</button>
          }
        </div>
      </div>

      {/* Overlay móvil */}
      {menuAbierto && <div className="sidebar-overlay" onClick={() => setMenuAbierto(false)} />}

      <Sidebar
        cuatrimestres={cuatrimestres}
        seleccion={seleccion}
        onSelect={handleSelect}
        onReload={reload}
        esAdmin={esAdmin}
        onLogout={handleLogout}
        autenticado={autenticado}
        onLogin={() => setShowLogin(true)}
        vistaDocentes={vista === 'docentes'}
        onVerDocentes={() => { setVista('docentes'); setMenuAbierto(false) }}
        vistaEstadisticas={vista === 'estadisticas'}
        onVerEstadisticas={() => { setVista('estadisticas'); setMenuAbierto(false) }}
        mobileOpen={menuAbierto}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        vistaMemos={vista === 'memos'}
        onVerMemos={handleVerMemos}
      />

      <main className="main-area">
        {vista === 'docentes' && esAdmin && <Docentes esAdmin={esAdmin} />}
        {vista === 'memos'    && autenticado && <MemosPage esAdmin={esAdmin} />}
        {vista === 'estadisticas' && <Estadisticas cuatrimestres={cuatrimestres} />}
        {vista === 'parcial' && !seleccion && <Estadisticas cuatrimestres={cuatrimestres} />}
        {vista === 'parcial' && seleccion && (
          <>
            <div className="top-bar">
              <span className="breadcrumb">
                {seleccion.cuatri.nombre} › {seleccion.programa?.nombre} › <strong>{seleccion.parcial.label}</strong>
              </span>
              <div className="main-tabs">
                {[
                  { key: 'resumen', label: 'Resumen'  },
                  { key: 'grupos',  label: 'Por grupo' },
                ].map(t => (
                  <button
                    key={t.key}
                    className={`mtab ${tab === t.key ? 'active' : ''}`}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {tab === 'resumen' && <Dashboard seleccion={seleccion} onReload={reload} esAdmin={esAdmin} />}
            {tab === 'grupos'  && <Grupos    parcialId={seleccion.parcial.id} />}
          </>
        )}
      </main>
    </div>
  )
}