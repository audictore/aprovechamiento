import { Router } from 'express'
import multer from 'multer'
import prisma from '../lib/prisma.js'
import { parsearReporte } from '../lib/excelParser.js'
import { enviarCorreo, construirCuerpo } from '../lib/emailService.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// GET /parciales/:id/reporte
// Devuelve el reporte completo de un parcial
router.get('/:id/reporte', async (req, res, next) => {
  try {
    const parcial = await prisma.parcial.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        cuatrimestre: true,
        grupos: {
          include: {
            materias: {
              include: { docente: true }
            }
          }
        }
      }
    })

    if (!parcial) {
      return res.status(404).json({ error: 'Parcial no encontrado' })
    }

    res.json({
      parcialId:    parcial.id,
      parcialLabel: parcial.label,
      cuatrimestre: parcial.cuatrimestre.nombre,
      licenciatura: parcial.cuatrimestre.licenciatura,
      grupos: parcial.grupos.map(g => ({
        id:      g.id,
        nombre:  g.nombre,
        tutor:   g.tutor,
        alumnos: g.alumnos,
        bajas:   g.bajas,
        materias: g.materias.map(m => ({
          id:            m.id,
          nombre:        m.nombre,
          promedio:      m.promedio,
          reprobados:    m.reprobados,
          docenteId:     m.docenteId,
          docenteNombre: m.docente?.nombre ?? null
        }))
      }))
    })
  } catch (e) {
    next(e)
  }
})

// POST /parciales/:cuatriId/:numParcial/upload
// Recibe el Excel y guarda los datos en la base de datos
router.post('/:cuatriId/:numParcial/upload', upload.single('file'), async (req, res, next) => {
  try {
    const cuatriId   = Number(req.params.cuatriId)
    const numParcial = Number(req.params.numParcial)

    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' })
    }

    const ext = req.file.originalname.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls'].includes(ext)) {
      return res.status(400).json({ error: 'Solo se aceptan archivos .xlsx o .xls' })
    }

    const datos = parsearReporte(req.file.buffer)

    const labels = { 1: '1er Parcial', 2: '2do Parcial', 3: '3er Parcial' }

    const parcial = await prisma.parcial.upsert({
      where:  { cuatrimestreId_numero: { cuatrimestreId: cuatriId, numero: numParcial } },
      update: {},
      create: {
        cuatrimestreId: cuatriId,
        numero:         numParcial,
        label:          labels[numParcial] ?? `${numParcial}° Parcial`
      }
    })

    await prisma.grupo.deleteMany({ where: { parcialId: parcial.id } })

    for (const g of datos) {
      const grupo = await prisma.grupo.create({
        data: {
          parcialId: parcial.id,
          nombre:    g.grupo,
          tutor:     g.tutor,
          alumnos:   g.alumnos,
          bajas:     g.bajas
        }
      })

      for (const m of g.materias) {
        let docenteId = null

        if (m.docente) {
          const docente = await prisma.docente.upsert({
            where:  { nombre: m.docente },
            update: {},
            create: { nombre: m.docente, email: '' }
          })
          docenteId = docente.id
        }

        await prisma.materia.create({
          data: {
            grupoId:    grupo.id,
            docenteId,
            nombre:     m.nombre,
            promedio:   m.promedio,
            reprobados: m.reprobados
          }
        })
      }
    }

    res.json({ ok: true, gruposImportados: datos.length })
  } catch (e) {
    next(e)
  }
})

// POST /parciales/:id/enviar-correos
// Envía el reporte por correo a los docentes seleccionados
router.post('/:id/enviar-correos', async (req, res, next) => {
  try {
    const { asunto, mensajeExtra = '', destinatarios } = req.body

    const parcial = await prisma.parcial.findUnique({
      where:   { id: Number(req.params.id) },
      include: {
        cuatrimestre: true,
        grupos: { include: { materias: true } }
      }
    })

    if (!parcial) {
      return res.status(404).json({ error: 'Parcial no encontrado' })
    }

    const mapaDocente = {}
    for (const grupo of parcial.grupos) {
      for (const mat of grupo.materias) {
        if (!mat.docenteId) continue
        if (!mapaDocente[mat.docenteId]) mapaDocente[mat.docenteId] = []
        mapaDocente[mat.docenteId].push({
          grupo:      grupo.nombre,
          promedio:   mat.promedio,
          reprobados: mat.reprobados
        })
      }
    }

    const enviados = []
    const errores  = []

    for (const dest of destinatarios) {
      const grupos = mapaDocente[dest.docenteId] || []

      if (!grupos.length) {
        errores.push({ docenteId: dest.docenteId, razon: 'Sin datos en este parcial' })
        continue
      }

      const docente = await prisma.docente.findUnique({ where: { id: dest.docenteId } })

      const cuerpo = construirCuerpo({
        docenteNombre: docente?.nombre ?? 'Docente',
        cuatrimestre:  parcial.cuatrimestre.nombre,
        parcialLabel:  parcial.label,
        licenciatura:  parcial.cuatrimestre.licenciatura,
        grupos,
        mensajeExtra
      })

      try {
        await enviarCorreo({ to: dest.email, subject: asunto, text: cuerpo })
        enviados.push(dest.email)
      } catch (e) {
        errores.push({ email: dest.email, razon: e.message })
      }
    }

    res.json({ enviados: enviados.length, errores })
  } catch (e) {
    next(e)
  }
})

export default router