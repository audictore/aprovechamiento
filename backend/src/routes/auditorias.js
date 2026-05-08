import { Router } from 'express'
import prisma      from '../lib/prisma.js'
import { enviarCorreo } from '../lib/emailService.js'
import { requireAuth }  from '../middleware/auth.js'

const router = Router()

// ── GET /auditorias?cuatrimestreId=X ─────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { cuatrimestreId } = req.query
    const where = cuatrimestreId ? { cuatrimestreId: Number(cuatrimestreId) } : {}
    const rows = await prisma.auditoria.findMany({
      where,
      include: { docente: true, cuatrimestre: true },
      orderBy: [{ grupo: 'asc' }, { materia: 'asc' }],
    })
    res.json(rows)
  } catch (e) { next(e) }
})

// ── POST /auditorias ──────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { cuatrimestreId, docenteId, materia, grupo } = req.body
    const row = await prisma.auditoria.create({
      data: { cuatrimestreId: Number(cuatrimestreId), docenteId: Number(docenteId), materia, grupo: grupo ?? '' },
      include: { docente: true },
    })
    res.status(201).json(row)
  } catch (e) { next(e) }
})

// ── PATCH /auditorias/:id ─────────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const campos = req.body
    const row = await prisma.auditoria.update({
      where: { id: Number(req.params.id) },
      data:  campos,
      include: { docente: true },
    })
    res.json(row)
  } catch (e) { next(e) }
})

// ── DELETE /auditorias/:id ────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await prisma.auditoria.delete({ where: { id: Number(req.params.id) } })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// ── POST /auditorias/notificar ────────────────────────────────────────────────
// Envía un correo a cada docente con sus pendientes; CC al coordinador
router.post('/notificar', requireAuth, async (req, res, next) => {
  try {
    const { cuatrimestreId, ccEmail } = req.body

    const rows = await prisma.auditoria.findMany({
      where: { cuatrimestreId: Number(cuatrimestreId) },
      include: { docente: true, cuatrimestre: true },
    })

    if (!rows.length) return res.status(400).json({ error: 'No hay registros para este cuatrimestre' })

    // Agrupar por docente
    const porDocente = {}
    for (const r of rows) {
      if (!porDocente[r.docenteId]) porDocente[r.docenteId] = { docente: r.docente, cuatrimestre: r.cuatrimestre.nombre, materias: [] }
      porDocente[r.docenteId].materias.push(r)
    }

    const resultados = []

    for (const { docente, cuatrimestre, materias } of Object.values(porDocente)) {
      if (!docente.email) {
        resultados.push({ docente: docente.nombre, status: 'sin_email' })
        continue
      }

      const lineas = materias.map(m => {
        const pendientes = []
        if (!m.planProfesor)    pendientes.push('Planeación (firma profesor)')
        if (!m.planCoordinador) pendientes.push('Planeación (firma coordinador)')
        if (!m.presentacion)    pendientes.push('Presentación de inicio')
        if (!m.p1Conocimiento)  pendientes.push('1er corte — Examen de conocimiento')
        if (!m.p1Producto)      pendientes.push('1er corte — Producto/Proyecto')
        if (!m.p1Desempeno)     pendientes.push('1er corte — Desempeño/Tarea')
        if (!m.p1Asistencia)    pendientes.push('1er corte — Lista de asistencia')
        if (!m.p1Calificaciones) pendientes.push('1er corte — Calificaciones')
        if (!m.p2Conocimiento)  pendientes.push('2do corte — Examen de conocimiento')
        if (!m.p2Producto)      pendientes.push('2do corte — Producto/Proyecto')
        if (!m.p2Desempeno)     pendientes.push('2do corte — Desempeño/Tarea')
        if (!m.p2Asistencia)    pendientes.push('2do corte — Lista de asistencia')
        if (!m.p2Calificaciones) pendientes.push('2do corte — Calificaciones')
        if (!m.p3Conocimiento)  pendientes.push('3er corte — Examen de conocimiento')
        if (!m.p3Producto)      pendientes.push('3er corte — Producto/Proyecto')
        if (!m.p3Desempeno)     pendientes.push('3er corte — Desempeño/Tarea')
        if (!m.p3Asistencia)    pendientes.push('3er corte — Lista de asistencia')
        if (!m.p3Calificaciones) pendientes.push('3er corte — Calificaciones')

        if (!pendientes.length) return `✅ ${m.materia}${m.grupo ? ` (${m.grupo})` : ''}: Todo en orden.`
        return `📋 ${m.materia}${m.grupo ? ` (${m.grupo})` : ''}:\n${pendientes.map(p => `   • ${p}`).join('\n')}`
      }).join('\n\n')

      const texto = `Estimado/a ${docente.nombre},

Le saludo cordialmente. Le comparto el estado actual de sus planeaciones y evidencias para el cuatrimestre ${cuatrimestre}:

${lineas}

Por favor, asegúrese de entregar los documentos pendientes a la brevedad posible.

Atentamente,
Coordinación Académica — UPMH`

      try {
        await enviarCorreo({
          to:      docente.email,
          subject: `Estado de planeaciones y evidencias — ${cuatrimestre}`,
          text:    texto,
          ...(ccEmail ? { attachments: [], graficasHtml: '', adjuntos: [] } : {}),
        })

        // Enviar con CC si se especificó
        if (ccEmail) {
          await enviarCorreo({
            to:      ccEmail,
            subject: `[CC] Estado de planeaciones — ${docente.nombre} — ${cuatrimestre}`,
            text:    texto,
          })
        }

        resultados.push({ docente: docente.nombre, status: 'enviado' })
      } catch (err) {
        resultados.push({ docente: docente.nombre, status: 'error', error: err.message })
      }
    }

    res.json({ resultados })
  } catch (e) { next(e) }
})

export default router
