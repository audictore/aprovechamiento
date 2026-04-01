import { useState } from 'react'
import { login } from '../api.js'

export default function Login({ onLogin }) {
  const [usuario,  setUsuario]  = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [modo,     setModo]     = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await login({ usuario, password })
      localStorage.setItem('token',   data.token)
      localStorage.setItem('rol',     data.rol)
      localStorage.setItem('usuario', data.usuario)
      onLogin(data.rol)
    } catch (e) {
      setError(e.response?.data?.error ?? 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  async function entrarObservador() {
    setLoading(true)
    try {
      const { data } = await login({ usuario: 'observador', password: '' })
      localStorage.setItem('token',   data.token)
      localStorage.setItem('rol',     data.rol)
      localStorage.setItem('usuario', data.usuario)
      onLogin(data.rol)
    } catch (e) {
      setError(e.response?.data?.error ?? 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f5f3' }}>
      <div style={{ background:'#fff', border:'1px solid #e8e8e4', borderRadius:12, padding:'2rem', width:340 }}>
        <div style={{ marginBottom:'1.5rem' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#1D9E75' }}>Aprovechamiento</div>
          <div style={{ fontSize:12, color:'#aaa', marginTop:2 }}>UPMH — Sistema académico</div>
        </div>

        {!modo && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <button
              className="btn btn-primary"
              style={{ width:'100%', padding:'12px' }}
              onClick={() => setModo('admin')}
            >
              Administrador
            </button>
            <button
              className="btn"
              style={{ width:'100%', padding:'12px' }}
              onClick={entrarObservador}
              disabled={loading}
            >
              {loading ? 'Entrando…' : 'Entrar como observador'}
            </button>
          </div>
        )}

        {modo === 'admin' && (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Usuario</label>
              <input
                type="text"
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                placeholder="alflores"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div style={{ fontSize:12, color:'#A32D2D', marginBottom:12, background:'#fde8e8', padding:'8px 12px', borderRadius:6 }}>
                {error}
              </div>
            )}

            <div style={{ display:'flex', gap:8, marginTop:4 }}>
              <button
                type="button"
                className="btn"
                style={{ flex:1 }}
                onClick={() => { setModo(null); setError('') }}
              >
                Volver
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex:1 }}
                disabled={loading}
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}