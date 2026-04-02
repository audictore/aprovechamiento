import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { enviarCorreo } from '../lib/emailService.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const docentes = await prisma.docente.findMany({
      orderBy: { nombre: 'asc' }
    })
    res.json(docentes)
  } catch (e) { next(e) }
})

router.put('/:id/email', async (req, res, next) => {
  try {
    const { email } = req.body
    if (email === undefined) {
      return res.status(400).json({ error: 'email es requerido' })
    }
    const doc = await prisma.docente.update({
      where: { id: Number(req.params.id) },
      data:  { email: email.trim() }
    })
    res.json({ ok: true, docente: doc })
  } catch (e) {
    if (e.code === 'P2025') {
      return res.status(404).json({ error: 'Docente no encontrado' })
    }
    next(e)
  }
})

router.post('/enviar-correos', async (req, res, next) => {
  try {
    const { asunto, mensaje, destinatarios } = req.body

    if (!destinatarios?.length) {
      return res.status(400).json({ error: 'No hay destinatarios' })
    }

    const enviados = []
    const errores  = []

    for (const dest of destinatarios) {
      try {
        const docente = await prisma.docente.findUnique({ where: { id: dest.docenteId } })
        if (!docente?.email) { errores.push({ nombre: dest.nombre, razon: 'Sin correo' }); continue }

        const cuerpo = `Estimado(a) ${docente.nombre},\n\n${mensaje}\n\nAtentamente,\nCoordinación Académica — UPMH`

        await enviarCorreo({ to: docente.email, subject: asunto, text: cuerpo })
        enviados.push(docente.email)
      } catch (e) {
          console.error('Error enviando a', dest.nombre, ':', e.message)
          errores.push({ nombre: dest.nombre, razon: e.message })
      }
    }

    res.json({ enviados: enviados.length, errores })
  } catch (e) { next(e) }
})

export default router