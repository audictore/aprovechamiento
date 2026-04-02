import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { enviarCorreo } from '../lib/emailService.js'
import { generarGraficaGrupos, generarGraficaMaterias, generarGraficaTodasMaterias, generarGraficaEvolucion } from '../lib/chartGenerator.js'

const router = Router()

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

router.post('/enviar-correos', async (req, res, next) => {
  try {
    const { asunto, mensaje, destinatarios, parcialIds } = req.body
    if (!destinatarios?.length) return res.status(400).json({ error: 'No hay destinatarios' })

    const attachments = []
    let graficasHtml  = ''
    let cidCounter    = 0

    if (parcialIds?.length) {
      // Agrupar parciales por programa
      const parciales = await prisma.parcial.findMany({
        where:   { id: { in: parcialIds } },
        include: { grupos: { include: { materias: true } }, programa: true },
        orderBy: { numero: 'asc' }
      })

      // Agrupar por programa para gráfica de evolución
      const programaMap = {}
      for (const parcial of parciales) {
        const progId = parcial.programaId
        if (!programaMap[progId]) programaMap[progId] = { nombre: parcial.programa.nombre, parciales: [] }
        const grupos = parcial.grupos.map(g => {
          const mats = g.materias.filter(m => m.promedio > 0)
          const prom = mats.length ? mats.reduce((s, m) => s + m.promedio, 0) / mats.length : 0
          return { nombre: g.nombre, promedio: prom }
        }).filter(g => g.promedio > 0)
        programaMap[progId].parciales.push({ label: parcial.label, grupos })
      }

      // Generar gráficas por parcial
      for (const parcial of parciales) {
        const titulo = `${parcial.programa.nombre} — ${parcial.label}`

        const grupos = parcial.grupos.map(g => {
          const mats = g.materias.filter(m => m.promedio > 0)
          const prom = mats.length ? mats.reduce((s, m) => s + m.promedio, 0) / mats.length : 0
          return { nombre: g.nombre, promedio: prom }
        }).filter(g => g.promedio > 0)

        const matMap = {}
        parcial.grupos.forEach(g => g.materias.forEach(m => {
          if (m.promedio > 0) {
            if (!matMap[m.nombre]) matMap[m.nombre] = []
            matMap[m.nombre].push(m.promedio)
          }
        }))

        const materiasEnRiesgo = Object.entries(matMap)
          .map(([nombre, promedios]) => ({ nombre, promedio: promedios.reduce((a, b) => a + b, 0) / promedios.length }))
          .filter(m => m.promedio < 8)
          .sort((a, b) => a.promedio - b.promedio)

        graficasHtml += `<h3 style="color:#1D9E75;font-size:14px;margin:24px 0 8px;border-bottom:2px solid #1D9E75;padding-bottom:4px">${titulo}</h3>`

        // Promedio por grupo
        if (grupos.length) {
          const cid = `g${cidCounter++}`
          const img = await generarGraficaGrupos(grupos, 'Promedio por grupo')
          attachments.push({ filename: `${cid}.png`, content: img, cid })
          graficasHtml += `<img src="cid:${cid}" style="width:100%;max-width:680px;border-radius:8px;border:1px solid #eee;margin-bottom:12px"/>`
        }

        // Promedio por materia
        if (Object.keys(matMap).length) {
          const cid = `g${cidCounter++}`
          const img = await generarGraficaTodasMaterias(matMap, 'Promedio por materia')
          attachments.push({ filename: `${cid}.png`, content: img, cid })
          graficasHtml += `<img src="cid:${cid}" style="width:100%;max-width:680px;border-radius:8px;border:1px solid #eee;margin-bottom:12px"/>`
        }

        // Materias en riesgo
        if (materiasEnRiesgo.length) {
          const cid = `g${cidCounter++}`
          const img = await generarGraficaMaterias(materiasEnRiesgo, 'Materias en riesgo (promedio < 8)')
          attachments.push({ filename: `${cid}.png`, content: img, cid })
          graficasHtml += `<img src="cid:${cid}" style="width:100%;max-width:680px;border-radius:8px;border:1px solid #eee;margin-bottom:24px"/>`
        }
      }

      // Gráfica de evolución por programa (si hay más de un parcial del mismo programa)
      for (const [, prog] of Object.entries(programaMap)) {
        if (prog.parciales.length > 1) {
          graficasHtml += `<h3 style="color:#1D9E75;font-size:14px;margin:24px 0 8px;border-bottom:2px solid #1D9E75;padding-bottom:4px">Evolución — ${prog.nombre}</h3>`
          const cid = `g${cidCounter++}`
          const img = await generarGraficaEvolucion(prog.parciales)
          attachments.push({ filename: `${cid}.png`, content: img, cid })
          graficasHtml += `<img src="cid:${cid}" style="width:100%;max-width:680px;border-radius:8px;border:1px solid #eee;margin-bottom:24px"/>`
        }
      }
    }

    const enviados = []
    const errores  = []

    for (const dest of destinatarios) {
      try {
        const docente = await prisma.docente.findUnique({ where: { id: dest.docenteId } })
        if (!docente?.email) { errores.push({ nombre: dest.nombre, razon: 'Sin correo' }); continue }

        const cuerpo = `Estimado(a) ${docente.nombre},\n\n${mensaje}\n\nAtentamente,\nCoordinación Académica — UPMH`

        await enviarCorreo({ to: docente.email, subject: asunto, text: cuerpo, graficasHtml, attachments })
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