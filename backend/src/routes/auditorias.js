import { Router }                        from 'express'
import { readdirSync, readFileSync,
         writeFileSync, mkdirSync }     from 'fs'
import { join, dirname }               from 'path'
import { fileURLToPath }               from 'url'
import prisma                           from '../lib/prisma.js'
import { enviarCorreo }                 from '../lib/emailService.js'
import { requireAuth }                  from '../middleware/auth.js'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const DATA_DIR   = join(__dirname, '../../data')
const CFG_FILE   = join(DATA_DIR, 'auditorias-config.json')
mkdirSync(DATA_DIR, { recursive: true })

function readConfig() {
  try { return JSON.parse(readFileSync(CFG_FILE, 'utf8')) } catch { return {} }
}
function saveConfig(data) {
  writeFileSync(CFG_FILE, JSON.stringify({ ...readConfig(), ...data }, null, 2))
}

// ── Utilidades para escaneo de carpetas ───────────────────────────────────────

/** Normaliza texto: minúsculas, sin acentos, solo alfanumérico + espacios */
function norm(s) {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Mn}/gu, '')   // elimina marcas diacríticas
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** ¿La cadena b está "contenida" en a, o viceversa? (mínimo 3 chars) */
function similar(a, b) {
  const na = norm(a), nb = norm(b)
  if (!na || !nb || na.length < 3 || nb.length < 3) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

/** Detecta a qué corte (1, 2 o 3) pertenece una carpeta por su nombre */
function detectCorte(name) {
  const n = norm(name)
  if (!/corte|parcial/.test(n)) return null
  if (/\b(primer|primero|1er|1ro|uno|1)\b/.test(n)) return 1
  if (/\b(segund|2do|2o|dos|2)\b/.test(n))          return 2
  if (/\b(tercer|tercero|3er|3ro|tres|3)\b/.test(n)) return 3
  return null
}

/** Detecta qué evidencia representa una carpeta */
function detectEvidencia(name) {
  const n = norm(name)
  if (/conoc/.test(n))              return 'Conocimiento'
  if (/prod/.test(n))               return 'Producto'
  if (/desemp|desem/.test(n))       return 'Desempeno'
  if (/asist/.test(n))              return 'Asistencia'
  if (/calif/.test(n))              return 'Calificaciones'
  return null
}

/** ¿Es un archivo de planeación? */
const isPlaneacion   = f => /planeac/i.test(f)

/** ¿Es un archivo de presentación? */
const isPresentacion = f => /presentac|encuadre|primera\s*clase/i.test(norm(f)) || /\.pptx$/i.test(f)

/** Lista subdirectorios de una ruta */
function getDirs(p) {
  try {
    return readdirSync(p, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  } catch { return [] }
}

/** Lista archivos de una ruta */
function getFiles(p) {
  try {
    return readdirSync(p, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name)
  } catch { return [] }
}

/** ¿Tiene al menos un archivo la carpeta? */
const hasFiles = p => getFiles(p).length > 0

const router = Router()

// ── GET /auditorias/config ────────────────────────────────────────────────────
router.get('/config', requireAuth, (_req, res) => res.json(readConfig()))

// ── POST /auditorias/config ───────────────────────────────────────────────────
router.post('/config', requireAuth, (req, res) => {
  saveConfig(req.body)
  res.json(readConfig())
})

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

// ── POST /auditorias/sincronizar ──────────────────────────────────────────────
// Escanea la carpeta raíz de Materias descargada de Drive y actualiza checkboxes.
// Acepta `rutaMaterias` opcional para sobreescribir la config guardada.
router.post('/sincronizar', requireAuth, async (req, res, next) => {
  try {
    const { cuatrimestreId, rutaMaterias: rutaOverride } = req.body
    if (!cuatrimestreId)
      return res.status(400).json({ error: 'cuatrimestreId es requerido' })

    // Ruta raíz: la que viene en el body tiene prioridad; si no, la de la config
    const cfg = readConfig()
    const rutaMaterias = rutaOverride ?? cfg.rutaMaterias
    if (!rutaMaterias)
      return res.status(400).json({ error: 'No hay ruta de carpeta configurada. Configúrala primero.' })

    // Si viene ruta nueva, guardarla para la próxima vez
    if (rutaOverride) saveConfig({ rutaMaterias: rutaOverride })

    // Buscar el cuatrimestre en BD para conocer su nombre
    const cuatrimestre = await prisma.cuatrimestre.findUnique({ where: { id: Number(cuatrimestreId) } })
    if (!cuatrimestre)
      return res.status(404).json({ error: 'Cuatrimestre no encontrado' })

    // Encontrar la subcarpeta que corresponde al cuatrimestre dentro de rutaMaterias
    const subfolders = getDirs(rutaMaterias)
    const cuatriFolder = subfolders.find(d => similar(d, cuatrimestre.nombre)) ?? null

    // Si no hay subcarpeta, asumir que rutaMaterias YA ES la carpeta del cuatrimestre
    const rutaBase = cuatriFolder ? join(rutaMaterias, cuatriFolder) : rutaMaterias

    // Cargar todos los registros del cuatrimestre
    const auditorias = await prisma.auditoria.findMany({
      where: { cuatrimestreId: Number(cuatrimestreId) },
      include: { docente: true },
    })

    if (!auditorias.length)
      return res.status(400).json({ error: 'No hay registros de auditoría para este cuatrimestre' })

    const actualizados = []
    const sinCoincidencia = []

    // Nivel 1: carpetas de materia
    for (const materiaFolder of getDirs(rutaBase)) {
      const materiaPath = join(rutaBase, materiaFolder)

      // Nivel 2: carpetas de docente
      for (const docenteFolder of getDirs(materiaPath)) {
        const docentePath = join(materiaPath, docenteFolder)

        // Archivos en nivel docente → planeación y presentación
        const docFiles      = getFiles(docentePath)
        const tieneplan     = docFiles.some(isPlaneacion)
        const tienePresent  = docFiles.some(isPresentacion)

        // Nivel 3: carpetas de grupo (ignorar si parecen carpetas de corte)
        const grupoFolders = getDirs(docentePath).filter(d => detectCorte(d) === null)

        for (const grupoFolder of grupoFolders) {
          const grupoPath = join(docentePath, grupoFolder)

          // Construir objeto de actualización — solo marcar true, nunca desmarcar
          const update = {}
          if (tieneplan)    update.planProfesor  = true
          if (tienePresent) update.presentacion   = true

          // Nivel 4: carpetas de corte
          for (const corteFolder of getDirs(grupoPath)) {
            const corteNum = detectCorte(corteFolder)
            if (!corteNum) continue

            const cortePath = join(grupoPath, corteFolder)

            // Nivel 5: carpetas de evidencia
            for (const evidFolder of getDirs(cortePath)) {
              const evid = detectEvidencia(evidFolder)
              if (!evid) continue

              const evidPath = join(cortePath, evidFolder)
              if (hasFiles(evidPath)) {
                update[`p${corteNum}${evid}`] = true
              }
            }
          }

          // Buscar registro coincidente en BD
          const match = auditorias.find(a =>
            similar(a.materia,        materiaFolder) &&
            similar(a.docente.nombre, docenteFolder) &&
            similar(a.grupo,          grupoFolder)
          )

          if (!match) {
            sinCoincidencia.push({ materia: materiaFolder, docente: docenteFolder, grupo: grupoFolder })
            continue
          }

          // Solo actualizar campos que cambian de false → true
          const campos = Object.entries(update)
            .filter(([k, v]) => v === true && !match[k])
            .map(([k]) => k)

          if (campos.length) {
            const data = Object.fromEntries(campos.map(k => [k, true]))
            await prisma.auditoria.update({ where: { id: match.id }, data })
            actualizados.push({
              id:      match.id,
              materia: match.materia,
              docente: match.docente.nombre,
              grupo:   match.grupo,
              campos,
            })
          }
        }

        // Si el docente no tiene subcarpetas de grupo, buscar registros por materia+docente sin grupo
        if (grupoFolders.length === 0) {
          const update = {}
          if (tieneplan)    update.planProfesor = true
          if (tienePresent) update.presentacion  = true

          const matches = auditorias.filter(a =>
            similar(a.materia,        materiaFolder) &&
            similar(a.docente.nombre, docenteFolder)
          )

          for (const match of matches) {
            const campos = Object.entries(update)
              .filter(([k, v]) => v === true && !match[k])
              .map(([k]) => k)

            if (campos.length) {
              const data = Object.fromEntries(campos.map(k => [k, true]))
              await prisma.auditoria.update({ where: { id: match.id }, data })
              actualizados.push({ id: match.id, materia: match.materia, docente: match.docente.nombre, grupo: match.grupo, campos })
            }
          }
        }
      }
    }

    res.json({ actualizados, sinCoincidencia, total: actualizados.length, carpetaUsada: rutaBase })
  } catch (e) { next(e) }
})

export default router
