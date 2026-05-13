import { Router }                        from 'express'
import { readdirSync, readFileSync,
         writeFileSync, mkdirSync }     from 'fs'
import { join, dirname, basename }     from 'path'
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

/** ¿La carpeta parece ser un contenedor de cuatrimestre? */
function isCuatrimestreFolder(name) {
  const n = norm(name)
  return /cuatrimestre/.test(n) ||
    /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(n) ||
    /\b(1er|2do|3er|4to|5to|6to|7mo|8vo|9no|primero|segundo|tercero|cuarto|quinto|sexto|septimo|octavo|noveno)\b/.test(n)
}

/** ¿La carpeta es un contenedor TSU? (ej. "TSU EFEP", "TSU GCH") */
function isTSUFolder(name) {
  return /\btsu\b/i.test(name)
}

/** Extrae el nombre del TSU de una carpeta (ej. "TSU GCH" → "GCH") */
function extractTSU(name) {
  return name.replace(/\btsu\b/i, '').trim().toUpperCase()
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
      orderBy: [{ programa: 'asc' }, { grupo: 'asc' }, { materia: 'asc' }],
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
// Fase 1 (siempre): lee la carga de la BD (Materia → Grupo → ProgramaEducativo)
//   y crea/actualiza registros con programa, grupo, docente y materia.
// Fase 2 (si hay ruta configurada): escanea la carpeta de Materias de Drive
//   y marca los checkboxes de evidencias.
router.post('/sincronizar', requireAuth, async (req, res, next) => {
  try {
    const { cuatrimestreId, rutaMaterias: rutaOverride } = req.body
    if (!cuatrimestreId)
      return res.status(400).json({ error: 'cuatrimestreId es requerido' })

    const cfg          = readConfig()
    const rutaMaterias = rutaOverride ?? cfg.rutaMaterias
    if (rutaOverride)  saveConfig({ rutaMaterias: rutaOverride })

    const cuatriId = Number(cuatrimestreId)

    // ── FASE 1: sync desde la carga en BD ────────────────────────────────────
    // Lee todos los grupos del primer parcial del cuatrimestre seleccionado.
    // Un Grupo → tiene Materias (cada una con docente).
    // Deduplicamos por (docenteId, materiaNombre, grupoNombre) para no crear
    // duplicados si el mismo grupo aparece en parcial 1, 2 y 3.
    const gruposDB = await prisma.grupo.findMany({
      where: {
        parcial: {
          numero: 1,
          programa: { cuatrimestreId: cuatriId },
        },
      },
      include: {
        materias: { include: { docente: true } },
        parcial:  { include: { programa: true } },
      },
    })

    let auditorias = await prisma.auditoria.findMany({
      where: { cuatrimestreId: cuatriId },
      include: { docente: true },
    })

    const creados      = []
    const actualizados = []
    const sinDocente   = []

    for (const grupo of gruposDB) {
      const grupoNombre  = grupo.nombre
      const programaNombre = grupo.parcial.programa.nombre

      for (const mat of grupo.materias) {
        if (!mat.docenteId) { sinDocente.push({ materia: mat.nombre, grupo: grupoNombre }); continue }

        // ¿Ya existe un registro para este (docente, materia, grupo)?
        const match = auditorias.find(a =>
          a.docenteId === mat.docenteId &&
          a.materia.trim().toUpperCase() === mat.nombre.trim().toUpperCase() &&
          a.grupo    === grupoNombre
        )

        if (match) {
          // Actualizar programa si estaba vacío
          if (!match.programa) {
            await prisma.auditoria.update({ where: { id: match.id }, data: { programa: programaNombre } })
            actualizados.push({ id: match.id, materia: mat.nombre, docente: mat.docente.nombre, grupo: grupoNombre, campos: ['programa'] })
          }
        } else {
          try {
            const nuevo = await prisma.auditoria.create({
              data: { cuatrimestreId: cuatriId, docenteId: mat.docenteId, materia: mat.nombre, grupo: grupoNombre, programa: programaNombre },
              include: { docente: true },
            })
            auditorias.push(nuevo)
            creados.push({ id: nuevo.id, materia: mat.nombre, docente: mat.docente.nombre, grupo: grupoNombre, campos: [] })
          } catch (e) {
            if (!e.message?.includes('Unique')) throw e
          }
        }
      }
    }

    // ── FASE 2: escaneo de carpetas (checkboxes) ──────────────────────────────
    let carpetaUsada    = rutaMaterias ?? null
    let carpetaExiste   = false
    let nivelCuatri     = false
    let carpetasMaterias = []

    if (rutaMaterias) {
      const nivel1 = getDirs(rutaMaterias)
      nivelCuatri  = nivel1.some(d => isCuatrimestreFolder(d))

      const carpetasMateriaRaices = nivelCuatri
        ? nivel1.filter(d => isCuatrimestreFolder(d)).map(d => join(rutaMaterias, d))
        : [rutaMaterias]

      carpetasMaterias = carpetasMateriaRaices.flatMap(r => getDirs(r))
      carpetaExiste    = carpetasMaterias.length > 0

      const todosDocentes = await prisma.docente.findMany()

      function buscarDocente(carpeta) {
        return todosDocentes.find(d => similar(d.nombre, carpeta)) ?? null
      }

      async function aplicarUpdate(auditoria, update) {
        const campos = Object.entries(update)
          .filter(([k, v]) => v === true && !auditoria[k])
          .map(([k]) => k)
        if (!campos.length) return
        const data = Object.fromEntries(campos.map(k => [k, true]))
        await prisma.auditoria.update({ where: { id: auditoria.id }, data })
        actualizados.push({ id: auditoria.id, materia: auditoria.materia, docente: auditoria.docente.nombre, grupo: auditoria.grupo, campos })
      }

      async function crearRegistroExtra(docenteId, nombreDocente, materia, grupo, update, programa = '') {
        try {
          const nuevo = await prisma.auditoria.create({
            data: { cuatrimestreId: cuatriId, docenteId, materia, grupo, programa, ...update },
            include: { docente: true },
          })
          auditorias.push(nuevo)
          creados.push({ id: nuevo.id, materia, docente: nombreDocente, grupo, campos: Object.keys(update) })
        } catch (e) {
          if (!e.message?.includes('Unique')) throw e
        }
      }

      for (const raiz of carpetasMateriaRaices) {
        // Detectar si este cuatrimestre tiene subcarpetas TSU (ej. "TSU GCH", "TSU EFEP")
        const nivel2       = getDirs(raiz)
        const hayNivelTSU  = nivel2.some(d => isTSUFolder(d))

        // Construir lista de { path, tsuNombre } para iterar materias
        const tsuRoots = hayNivelTSU
          ? nivel2.filter(d => isTSUFolder(d)).map(d => ({ path: join(raiz, d), tsu: extractTSU(d) }))
          : [{ path: raiz, tsu: null }]

        for (const { path: tsuPath, tsu: tsuNombre } of tsuRoots) {
          const cuatriFolder       = basename(raiz)
          const programaFromFolder = tsuNombre ? `${cuatriFolder} ${tsuNombre}` : cuatriFolder

        for (const materiaFolder of getDirs(tsuPath)) {
          const materiaPath = join(tsuPath, materiaFolder)

          for (const docenteFolder of getDirs(materiaPath)) {
            const docentePath = join(materiaPath, docenteFolder)

            let docente = buscarDocente(docenteFolder)
            if (!docente) {
              docente = await prisma.docente.create({ data: { nombre: docenteFolder, email: '' } })
              todosDocentes.push(docente)
              sinDocente.push({ materia: materiaFolder, carpetaDocente: docenteFolder, creado: true })
            }

            const docFiles     = getFiles(docentePath)
            const tieneplan    = docFiles.some(isPlaneacion)
            const tienePresent = docFiles.some(isPresentacion)

            const grupoFolders = getDirs(docentePath).filter(d => detectCorte(d) === null)
            const efectivos    = grupoFolders.length ? grupoFolders : ['']

            for (const grupoFolder of efectivos) {
              const grupoPath = grupoFolder ? join(docentePath, grupoFolder) : docentePath

              const update = {}
              if (tieneplan)    update.planProfesor = true
              if (tienePresent) update.presentacion  = true

              for (const corteFolder of getDirs(grupoPath)) {
                const corteNum = detectCorte(corteFolder)
                if (!corteNum) continue
                const cortePath = join(grupoPath, corteFolder)
                for (const evidFolder of getDirs(cortePath)) {
                  const evid = detectEvidencia(evidFolder)
                  if (evid && hasFiles(join(cortePath, evidFolder)))
                    update[`p${corteNum}${evid}`] = true
                }
              }

              // Buscar registro: si hay TSU, priorizamos match por programa también
              const match = auditorias.find(a =>
                similar(a.materia, materiaFolder) &&
                a.docenteId === docente.id &&
                similar(a.grupo, grupoFolder) &&
                (tsuNombre ? a.programa?.toUpperCase().includes(tsuNombre) : true)
              ) ?? auditorias.find(a =>
                // Fallback sin TSU por si el registro no tiene programa aún
                similar(a.materia, materiaFolder) &&
                a.docenteId === docente.id &&
                similar(a.grupo, grupoFolder)
              )

              if (match) {
                await aplicarUpdate(match, update)
                // Si el registro no tiene programa, rellenarlo desde la carpeta
                if (!match.programa && programaFromFolder) {
                  await prisma.auditoria.update({ where: { id: match.id }, data: { programa: programaFromFolder } })
                  match.programa = programaFromFolder
                }
              } else if (Object.keys(update).length > 0) {
                await crearRegistroExtra(docente.id, docente.nombre, materiaFolder, grupoFolder, update, programaFromFolder)
              }
            }
          }
        } // fin materiaFolder
        } // fin tsuRoots
      }
    }

    res.json({
      creados,
      actualizados,
      sinDocente,
      total:         creados.length + actualizados.length,
      carpetaUsada,
      carpetaExiste,
      nivelCuatri,
      carpetasMaterias,
    })
  } catch (e) { next(e) }
})

export default router
