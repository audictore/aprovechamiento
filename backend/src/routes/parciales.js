import { Router }  from 'express'
import multer      from 'multer'
import prisma      from '../lib/prisma.js'
import { parsearReporte }                from '../lib/excelParser.js'
import { enviarCorreo, construirCuerpo } from '../lib/emailService.js'
import { parsearPDF }                    from '../lib/pdfParser.js'
import { requireAuth }                   from '../middleware/auth.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.get('/:id/reporte', async (req, res, next) => {
  try {
    const parcial = await prisma.parcial.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        programa: {
          include: { cuatrimestre: true }
        },
        grupos: {
          include: {
            materias: { include: { docente: true } }
          }
        }
      }
    })

    if (!parcial) return res.status(404).json({ error: 'Parcial no encontrado' })

    res.json({
      parcialId:    parcial.id,
      parcialLabel: parcial.label,
      programa:     parcial.programa.nombre,
      programaId:   parcial.programa.id,
      cuatrimestre: parcial.programa.cuatrimestre.nombre,
      grupos: parcial.grupos.map(g => ({
        id:         g.id,
        nombre:     g.nombre,
        tutor:      g.tutor,
        alumnos:    g.alumnos,
        bajas:      g.bajas,
        reprobados: g.reprobados,
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
  } catch (e) { next(e) }
})

router.post('/:cuatriId/:programaNombre/:numParcial/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const cuatriId       = Number(req.params.cuatriId)
    const programaNombre = decodeURIComponent(req.params.programaNombre)
    const numParcial     = Number(req.params.numParcial)

    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' })

    const ext = req.file.originalname.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls'].includes(ext)) {
      return res.status(400).json({ error: 'Solo se aceptan archivos .xlsx o .xls' })
    }

    const datos = parsearReporte(req.file.buffer, numParcial)

    const programa = await prisma.programaEducativo.upsert({
      where:  { cuatrimestreId_nombre: { cuatrimestreId: cuatriId, nombre: programaNombre } },
      update: {},
      create: { cuatrimestreId: cuatriId, nombre: programaNombre }
    })

    const labels = { 1: '1er Parcial', 2: '2do Parcial', 3: '3er Parcial' }

    const parcial = await prisma.parcial.upsert({
      where:  { programaId_numero: { programaId: programa.id, numero: numParcial } },
      update: {},
      create: {
        programaId: programa.id,
        numero:     numParcial,
        label:      labels[numParcial] ?? `${numParcial}° Parcial`
      }
    })

    await prisma.grupo.deleteMany({ where: { parcialId: parcial.id } })

    for (const g of datos) {
      const grupo = await prisma.grupo.create({
        data: {
          parcialId:  parcial.id,
          nombre:     g.grupo,
          tutor:      g.tutor,
          alumnos:    g.alumnos,
          bajas:      g.bajas,
          reprobados: 0
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
  } catch (e) { next(e) }
})

router.post('/:parcialId/upload-pdfs', requireAuth, upload.array('files', 20), async (req, res, next) => {
  try {
    const parcialId  = Number(req.params.parcialId)
    const numParcial = Number(req.body.numParcial)

    if (!req.files?.length) {
      return res.status(400).json({ error: 'No se recibieron archivos' })
    }

    const resultados = []

    for (const file of req.files) {
      try {
        const resultado = await parsearPDF(file.buffer, numParcial)
        if (!resultado) {
          resultados.push({ archivo: file.originalname, error: 'No se pudo leer el grupo' })
          continue
        }

        const grupo = await prisma.grupo.findFirst({
          where: { parcialId, nombre: resultado.grupo }
        })

        if (!grupo) {
          resultados.push({ archivo: file.originalname, error: `Grupo ${resultado.grupo} no encontrado` })
          continue
        }

        await prisma.grupo.update({
          where: { id: grupo.id },
          data:  { reprobados: resultado.reprobados, alumnos: resultado.totalAlumnos }
        })

        resultados.push({
          archivo:    file.originalname,
          grupo:      resultado.grupo,
          reprobados: resultado.reprobados,
          alumnos:    resultado.totalAlumnos
        })
      } catch (e) {
        resultados.push({ archivo: file.originalname, error: e.message })
      }
    }

    res.json({ ok: true, resultados })
  } catch (e) { next(e) }
})

router.post('/:id/enviar-correos', requireAuth, async (req, res, next) => {
  try {
    const { asunto, mensajeExtra = '', destinatarios } = req.body

    const parcial = await prisma.parcial.findUnique({
      where:   { id: Number(req.params.id) },
      include: {
        programa: { include: { cuatrimestre: true } },
        grupos:   { include: { materias: true } }
      }
    })

    if (!parcial) return res.status(404).json({ error: 'Parcial no encontrado' })

    const mapaDocente = {}
    for (const grupo of parcial.grupos) {
      for (const mat of grupo.materias) {
        if (!mat.docenteId) continue
        if (!mapaDocente[mat.docenteId]) mapaDocente[mat.docenteId] = []
        mapaDocente[mat.docenteId].push({
          grupo:      grupo.nombre,
          promedio:   mat.promedio,
          reprobados: grupo.reprobados
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
      const cuerpo  = construirCuerpo({
        docenteNombre: docente?.nombre ?? 'Docente',
        cuatrimestre:  parcial.programa.cuatrimestre.nombre,
        parcialLabel:  parcial.label,
        programa:      parcial.programa.nombre,
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
  } catch (e) { next(e) }
})

router.delete('/:id/datos', requireAuth, async (req, res, next) => {
  try {
    await prisma.grupo.deleteMany({
      where: { parcialId: Number(req.params.id) }
    })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router