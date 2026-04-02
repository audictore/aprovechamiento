import { useState, useEffect, createContext, useContext, useCallback } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((mensaje, tipo = 'info', duracion = 4000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, mensaje, tipo }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duracion)
  }, [])

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, right: 24,
        display: 'flex', flexDirection: 'column', gap: 10,
        zIndex: 9999, maxWidth: 360
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => removeToast(t.id)}
            style={{
              background: t.tipo === 'error'   ? '#A32D2D'
                        : t.tipo === 'success' ? '#0F6E56'
                        : t.tipo === 'warning' ? '#BA7517'
                        : '#1a1a1a',
              color:      '#fff',
              padding:    '12px 16px',
              borderRadius: 8,
              fontSize:   13,
              fontWeight: 500,
              boxShadow:  '0 4px 12px rgba(0,0,0,0.15)',
              cursor:     'pointer',
              display:    'flex',
              alignItems: 'center',
              gap:        10,
              animation:  'slideIn 0.2s ease',
            }}
          >
            <span style={{ fontSize: 16 }}>
              {t.tipo === 'error'   ? '✕'
             : t.tipo === 'success' ? '✓'
             : t.tipo === 'warning' ? '⚠'
             : 'ℹ'}
            </span>
            <span>{t.mensaje}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}