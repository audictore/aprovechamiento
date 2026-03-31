import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET /docentes
// Devuelve todos los docentes ordenados por nombre
router.get('/', async (_req, res, next) => {
  try {
    const docentes = await prisma.docente.findMany({
      orderBy: { nombre: 'asc' }
    })
    res.json(docentes)
  } catch (e) {
    next(e)
  }
})

// PUT /docentes/:id/email
// Actualiza el correo de un docente
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

export default router