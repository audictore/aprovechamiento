import { Router } from 'express'
import multer from 'multer'
import prisma from '../lib/prisma.js'
import { enviarCorreo } from '../lib/emailService.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.get('/', async (_req, res, next) => {
  try {
    const docentes = await prisma.docente.findMany({ orderBy: { nombre: 'asc' } })
    res.json(docentes)
  } catch (e) { next(e) }
})

router.put('/:id/email', async (req, res, next) => {
  try {
    const { email } = req.body
    if (email === undefined) return res.status(400).json({ error: 'email es requerido' })
    const doc = await prisma.docente.update({
      where: { id: Number(req.params.id) },
      data:  { email: email.trim() }
    })
    res.json({ ok: true, docente: doc })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Docente no encontrado' })
    next(e)
  }
})

router.post('/enviar-correos', upload.any(), async (req, res, next) => {
  try {
    let asunto, mensaje, destinatarios, parcialIds

    if (req.files?.length) {
      const parsed  = JSON.parse(req.body.json || '{}')
      asunto        = parsed.asunto
      mensaje       = parsed.mensaje
      destinatarios = parsed.destinatarios
      parcialIds    = parsed.parcialIds
    } else {
      asunto        = req.body.asunto
      mensaje       = req.body.mensaje
      destinatarios = typeof req.body.destinatarios === 'string'
        ? JSON.parse(req.body.destinatarios)
        : req.body.destinatarios
      parcialIds    = typeof req.body.parcialIds === 'string'
        ? JSON.parse(req.body.parcialIds)
        : req.body.parcialIds
    }

    console.log('Destinatarios:', destinatarios?.length)
    console.log('Archivos:', req.files?.length)

    if (!destinatarios?.length) return res.status(400).json({ error: 'No hay destinatarios' })

    const adjuntos = (req.files || []).map(f => ({
      filename:    f.originalname,
      content:     f.buffer,
      contentType: f.mimetype
    }))

    const enviados = []
    const errores  = []

    for (const dest of destinatarios) {
      try {
        const docente = await prisma.docente.findUnique({ where: { id: dest.docenteId } })
        if (!docente?.email) { errores.push({ nombre: dest.nombre, razon: 'Sin correo' }); continue }

        const appUrl = process.env.APP_URL || 'http://localhost:4000'
const cuerpo = `Estimado(a) ${docente.nombre},\n\n${mensaje}\n\nPuede consultar las estadísticas globales en:\n${appUrl}\n\n⚠ Este enlace solo funciona dentro de la red de la Universidad Politécnica Metropolitana de Hidalgo.\n\nAtentamente,\nCoordinación Académica de Administracion — UPMH`

        await enviarCorreo({ to: docente.email, subject: asunto, text: cuerpo, adjuntos })
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