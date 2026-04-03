import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const lista = await prisma.cuatrimestre.findMany({
      orderBy: { orden: 'asc' },
      include: {
        programas: {
          orderBy: { nombre: 'asc' },
          include: {
            parciales: { orderBy: { numero: 'asc' } }
          }
        }
      }
    })
    res.json(lista)
  } catch (e) { next(e) }
})

router.post('/', async (req, res, next) => {
  try {
    const { nombre, orden } = req.body
    if (!nombre || !orden) {
      return res.status(400).json({ error: 'nombre y orden son requeridos' })
    }
    const cuatri = await prisma.cuatrimestre.create({
      data: { nombre: nombre.trim(), orden: Number(orden) }
    })
    res.status(201).json(cuatri)
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Ese cuatrimestre ya existe' })
    }
    next(e)
  }
})

router.get('/:id/programas', async (req, res, next) => {
  try {
    const programas = await prisma.programaEducativo.findMany({
      where:   { cuatrimestreId: Number(req.params.id) },
      orderBy: { nombre: 'asc' },
      include: {
        parciales: {
          orderBy: { numero: 'asc' },
          include: {
            grupos: {
              include: { materias: true }
            }
          }
        }
      }
    })

    const resultado = programas.map(prog => ({
      ...prog,
      parciales: prog.parciales.map(p => {
        const grupos = p.grupos
        let sumaGrupos  = 0
        let countGrupos = 0

        grupos.forEach(g => {
          const mats = g.materias.filter(m => m.promedio > 0)
          if (mats.length > 0) {
            const promGrupo = mats.reduce((s, m) => s + m.promedio, 0) / mats.length
            sumaGrupos += promGrupo
            countGrupos++
          }
        })

        const promedio = countGrupos > 0 ? +(sumaGrupos / countGrupos).toFixed(2) : null

        return {
          id:      p.id,
          numero:  p.numero,
          label:   p.label,
          promedio
        }
      })
    }))

    res.json(resultado)
  } catch (e) { next(e) }
})

router.get('/:cuatriId/programas/:programaId/tendencia', async (req, res, next) => {
  try {
    const parciales = await prisma.parcial.findMany({
      where:   { programaId: Number(req.params.programaId) },
      orderBy: { numero: 'asc' },
      include: {
        grupos: {
          include: { materias: true }
        }
      }
    })

    const resultado = parciales.map(p => {
      const grupos = p.grupos.map(g => {
        const mats = g.materias.filter(m => m.promedio > 0)
        const prom = mats.length
          ? mats.reduce((s, m) => s + m.promedio, 0) / mats.length
          : 0
        return { nombre: g.nombre, promedio: +prom.toFixed(2) }
      })
      return { parcialId: p.id, label: p.label, numero: p.numero, grupos }
    })

    res.json(resultado)
  } catch (e) { next(e) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.cuatrimestre.delete({
      where: { id: Number(req.params.id) }
    })
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'No encontrado' })
    next(e)
  }
})

router.delete('/:cuatriId/programas/:programaId', async (req, res, next) => {
  try {
    await prisma.programaEducativo.delete({
      where: { id: Number(req.params.programaId) }
    })
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'No encontrado' })
    next(e)
  }
})

router.delete('/:cuatriId/programas/:programaId/parciales/:parcialId', async (req, res, next) => {
  try {
    await prisma.parcial.delete({
      where: { id: Number(req.params.parcialId) }
    })
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'No encontrado' })
    next(e)
  }
})

router.get('/:id/estadisticas', async (req, res, next) => {
  try {
    const programas = await prisma.programaEducativo.findMany({
      where:   { cuatrimestreId: Number(req.params.id) },
      orderBy: { nombre: 'asc' },
      include: {
        parciales: {
          orderBy: { numero: 'asc' },
          include: { grupos: { include: { materias: true } } }
        }
      }
    })

    const resultado = programas.map(prog => {
      const grupoConProm = g => {
        const mats = g.materias.filter(m => m.promedio > 0)
        return mats.length ? mats.reduce((s, m) => s + m.promedio, 0) / mats.length : 0
      }

      const parciales = prog.parciales.map(p => {
        const grupos = p.grupos.map(g => ({
          nombre:   g.nombre,
          promedio: +grupoConProm(g).toFixed(2),
          alumnos:  g.alumnos
        }))

        const promedioGeneral = grupos.length
          ? +(grupos.reduce((s, g) => s + g.promedio, 0) / grupos.length).toFixed(2)
          : 0

        const totalAlumnos = grupos.reduce((s, g) => s + g.alumnos, 0)

        const matMap = {}
        p.grupos.forEach(g => g.materias.forEach(m => {
          if (m.promedio > 0) {
            if (!matMap[m.nombre]) matMap[m.nombre] = []
            matMap[m.nombre].push(m.promedio)
          }
        }))

        const materias = Object.entries(matMap).map(([nombre, promedios]) => ({
          nombre,
          promedio: +(promedios.reduce((a, b) => a + b, 0) / promedios.length).toFixed(2)
        })).sort((a, b) => a.promedio - b.promedio)

        const materiasEnRiesgo = materias.filter(m => m.promedio < 8)

        return {
          id:              p.id,
          label:           p.label,
          numero:          p.numero,
          promedioGeneral,
          totalAlumnos,
          grupos,
          materias,
          materiasEnRiesgo
        }
      })

      return {
        id:       prog.id,
        nombre:   prog.nombre,
        parciales
      }
    })

    res.json(resultado)
  } catch (e) { next(e) }
})

export default router