import { useState, useEffect } from 'react'
import Sidebar   from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Grupos    from './pages/Grupos.jsx'
import Docentes  from './pages/Docentes.jsx'
import Login     from './pages/Login.jsx'
import { getCuatrimestres, verificar } from './api.js'

export default function App() {
  const [rol,           setRol]           = useState(null)
  const [autenticado,   setAutenticado]   = useState(false)
  const [verificando,   setVerificando]   = useState(true)
  const [cuatrimestres, setCuatrimestres] = useState([])
  const [seleccion,     setSeleccion]     = useState(null)
  const [vista,         setVista]         = useState('parcial') // 'parcial' | 'docentes'
  const [tab,           setTab]           = useState('resumen')
  const [tick,          setTick]          = useState(0)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setVerificando(false); return }
    verificar()
      .then(r => { setRol(r.data.rol); setAutenticado(true) })
      .catch(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('rol')
        localStorage.removeItem('usuario')
        setAutenticado(false)
      })
      .finally(() => setVerificando(false))
  }, [])

  useEffect(() => {
    if (!autenticado) return
    getCuatrimestres().then(r => setCuatrimestres(r.data))
  }, [autenticado, tick])

  function handleLogin(rolRecibido) {
    setRol(rolRecibido)
    setAutenticado(true)
  }

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('rol')
    localStorage.removeItem('usuario')
    setAutenticado(false)
    setRol(null)
    setSeleccion(null)
  }

  function handleSelect(cuatri, parcial, programa) {
    setSeleccion({ cuatri, parcial, programa })
    setVista('parcial')
    setTab('resumen')
  }

  const reload  = () => setTick(t => t + 1)
  const esAdmin = rol === 'admin'

  if (verificando) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="loading"><span className="spinner" /> Verificando sesión…</div>
    </div>
  )

  if (!autenticado) return <Login onLogin={handleLogin} />

  return (
    <div className="app-layout">
      <Sidebar
        cuatrimestres={cuatrimestres}
        seleccion={seleccion}
        onSelect={handleSelect}
        onReload={reload}
        esAdmin={esAdmin}
        onLogout={handleLogout}
        vistaDocentes={vista === 'docentes'}
        onVerDocentes={() => setVista('docentes')}
      />
      <main className="main-area">
        {vista === 'docentes' && (
          <Docentes esAdmin={esAdmin} />
        )}

        {vista === 'parcial' && !seleccion && (
          <p className="empty-state">Selecciona un parcial del menú para ver el reporte.</p>
        )}

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