import { useState } from 'react'
import { login } from '../api.js'

export default function Login({ onLogin }) {
  const [usuario,  setUsuario]  = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [modo, setModo] = useState('admin')

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
  <div style={{ background:'#fff', borderRadius:16, padding:'2rem', width:'100%', boxShadow:'0 8px 32px rgba(0,0,0,0.15)' }}>
    {/* Logo */}
    <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
      <div style={{
        width:48, height:48,
        background:'linear-gradient(135deg, #1D9E75, #157a5a)',
        borderRadius:12,
        display:'flex', alignItems:'center', justifyContent:'center',
        margin:'0 auto 10px', fontSize:20
      }}>
        📊
      </div>
      <div style={{ fontSize:18, fontWeight:800, color:'#1a1a1a' }}>Aprovechamiento</div>
      <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>UPMH — Sistema académico</div>
    </div>

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
        <div style={{ fontSize:12, color:'#A32D2D', marginBottom:12, background:'#fde8e8', padding:'8px 12px', borderRadius:8 }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        style={{ width:'100%', padding:'12px', borderRadius:10, fontWeight:700, marginTop:4 }}
        disabled={loading}
      >
        {loading ? 'Entrando…' : 'Entrar →'}
      </button>
    </form>

    <div style={{ marginTop:16, textAlign:'center', fontSize:11, color:'#ccc' }}>
      Universidad Politécnica Metropolitana de Hidalgo
    </div>
  </div>
)
}