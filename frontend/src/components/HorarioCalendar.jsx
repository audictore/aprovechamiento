import { useEffect, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

function getToken() { return localStorage.getItem('token') || '' }

export default function HorarioCalendar({ file, sheet, docenteNombre, onClose }) {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!file) return
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ file })
    if (sheet) params.set('sheet', sheet)
    fetch(`${BASE_URL}/memos/calendar-events?${params}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(data => { setEvents(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [file, sheet])

  // Cerrar con Escape
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 12,
        width: '100%', maxWidth: 1100, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, #1D9E75, #157a5a)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
              {docenteNombre || sheet || file}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
              Horario — Semana actual
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6,
              color: '#fff', cursor: 'pointer', fontSize: 18,
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <span className="spinner" />&nbsp; Cargando horario…
            </div>
          )}
          {error && (
            <div style={{ color: '#A32D2D', padding: 16, background: '#fde8e8', borderRadius: 8 }}>
              Error: {error}
            </div>
          )}
          {!loading && !error && (
            <FullCalendar
              plugins={[timeGridPlugin]}
              initialView="timeGridWeek"
              locale="es"
              headerToolbar={false}
              allDaySlot={false}
              nowIndicator={true}
              editable={false}
              height="auto"
              slotMinTime="07:00:00"
              slotMaxTime="22:00:00"
              slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              dayHeaderFormat={{ weekday: 'short', month: 'numeric', day: 'numeric' }}
              hiddenDays={[0, 6]}
              events={events}
              eventDisplay="block"
              eventTextColor="#fff"
              eventContent={arg => (
                <div style={{ padding: '2px 4px', fontSize: 11, lineHeight: 1.3, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 700 }}>{arg.timeText}</div>
                  <div>{arg.event.title}</div>
                </div>
              )}
            />
          )}
          {!loading && !error && events.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
              Sin eventos para esta hoja
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
