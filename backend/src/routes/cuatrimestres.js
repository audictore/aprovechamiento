import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET /cuatrimestres
// Devuelve todos los cuatrimestres ordenados por fecha
router.get('/', async (_req, res, next) => {
  try {
    const lista = await prisma.cuatrimestre.findMany({
      orderBy: { orden: 'asc' },
      include: {
        parciales: {
          orderBy: { numero: 'asc' }
        }
      }
    })
    res.json(lista)
  } catch (e) {
    next(e)
  }
})

// POST /cuatrimestres
// Crea un nuevo cuatrimestre
router.post('/', async (req, res, next) => {
  try {
    const { nombre, orden, licenciatura } = req.body

    if (!nombre || !orden) {
      return res.status(400).json({ error: 'nombre y orden son requeridos' })
    }

    const cuatri = await prisma.cuatrimestre.create({
      data: {
        nombre:       nombre.trim(),
        orden:        Number(orden),
        licenciatura: licenciatura || 'Lic. en Administración y Gestión Empresarial'
      }
    })
    res.status(201).json(cuatri)
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Ese cuatrimestre ya existe' })
    }
    next(e)
  }
})

// GET /cuatrimestres/:id/parciales
// Devuelve los parciales de un cuatrimestre específico
router.get('/:id/parciales', async (req, res, next) => {
  try {
    const parciales = await prisma.parcial.findMany({
      where:   { cuatrimestreId: Number(req.params.id) },
      orderBy: { numero: 'asc' }
    })
    res.json(parciales)
  } catch (e) {
    next(e)
  }
})

export default router