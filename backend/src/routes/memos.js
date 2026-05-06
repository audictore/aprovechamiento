import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import multer from 'multer'
import jwt from 'jsonwebtoken'
import archiver from 'archiver'
import { buildJobs } from '../lib/memos/buildJobs.js'
import { generateDocx } from '../lib/memos/generateDocx.js'

const router = Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SECRET = process.env.JWT_SECRET || 'upmh_secret_2026'

// Rutas de datos
const DATA_DIR    = path.join(__dirname, '../../data')
const INPUT_DIR   = path.join(DATA_DIR, 'memos-input')
const HORARIOS_DIR = path.join(INPUT_DIR, 'horarios')
const OUTPUT_DIR  = path.join(DATA_DIR, 'memos-output')
const CONFIG_FILE = path.join(DATA_DIR, 'memos-config.json')

// Crear directorios si no existen
fs.mkdirSync(HORARIOS_DIR, { recursive: true })
fs.mkdirSync(OUTPUT_DIR,   { recursive: true })

// ─── Multer ────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (file.fieldname === 'carga') cb(null, INPUT_DIR)
    else cb(null, HORARIOS_DIR)
  },
  filename(req, file, cb) {
    if (file.fieldname === 'carga') cb(null, 'carga.xlsx')
    else cb(null, file.originalname)
  },
})
const upload = multer({ storage })

// ─── SSE: estado de generación ────────────────────────────────────────────

let sseClients = []  // { res }

function sseEmit(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  sseClients = sseClients.filter(c => {
    try { c.res.write(data); return true }
    catch { return false }
  })
}

// ─── Endpoints ────────────────────────────────────────────────────────────

// GET /memos/config
router.get('/config', (_req, res) => {
  if (!fs.existsSync(CONFIG_FILE)) return res.status(404).json({ error: 'Config no encontrada' })
  try {
    res.json(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')))
  } catch {
    res.status(500).json({ error: 'Error leyendo config' })
  }
})

// POST /memos/config
router.post('/config', (req, res) => {
  try {
    // Leer config actual y hacer merge
    const current = fs.existsSync(CONFIG_FILE)
      ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
      : {}
    const updated = { ...current, ...req.body }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /memos/upload — carga (campo: carga) + horarios (campo: horarios, múltiples)
router.post('/upload', upload.fields([
  { name: 'carga',    maxCount: 1 },
  { name: 'horarios', maxCount: 100 },
]), (req, res) => {
  const carga    = req.files?.carga?.length    ?? 0
  const horarios = req.files?.horarios?.length ?? 0
  res.json({ ok: true, carga, horarios })
})

// GET /memos/files — estado actual de archivos
router.get('/files', (_req, res) => {
  const carga = fs.existsSync(path.join(INPUT_DIR, 'carga.xlsx'))
    ? { name: 'carga.xlsx', size: fs.statSync(path.join(INPUT_DIR, 'carga.xlsx')).size }
    : null

  const horarios = fs.existsSync(HORARIOS_DIR)
    ? fs.readdirSync(HORARIOS_DIR).filter(f => /\.(xlsx|xls)$/i.test(f)).map(f => ({
        name: f,
        size: fs.statSync(path.join(HORARIOS_DIR, f)).size,
      }))
    : []

  const output = fs.existsSync(OUTPUT_DIR)
    ? fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.docx')).map(f => ({
        name: f,
        size: fs.statSync(path.join(OUTPUT_DIR, f)).size,
      }))
    : []

  res.json({ carga, horarios, output })
})

// POST /memos/generate — dispara generación async
router.post('/generate', async (req, res) => {
  res.json({ ok: true })

  // Ejecutar en background
  ;(async () => {
    sseEmit({ type: 'start' })
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
      const jobs = await buildJobs(config, INPUT_DIR, OUTPUT_DIR, text => {
        sseEmit({ type: 'log', text })
      })

      let ok = 0, errors = 0
      for (const job of jobs) {
        try {
          sseEmit({ type: 'log', text: `Generando: ${job.docente.nombre}…` })
          await generateDocx(job)
          ok++
          sseEmit({ type: 'log', text: `  ✓ ${path.basename(job.outputPath)}` })
        } catch (e) {
          errors++
          sseEmit({ type: 'error', text: `  ✗ ${job.docente.nombre}: ${e.message}` })
        }
      }

      sseEmit({ type: 'log', text: `\nListo: ${ok} generados, ${errors} errores.` })
      sseEmit({ type: 'done', code: errors > 0 ? 1 : 0 })
    } catch (e) {
      sseEmit({ type: 'error', text: `Error fatal: ${e.message}` })
      sseEmit({ type: 'done', code: 1 })
    }
  })()
})

// GET /memos/log-stream — SSE con auth por query param
router.get('/log-stream', (req, res) => {
  // Autenticación vía ?token= (EventSource no soporta headers)
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).end()
  try {
    jwt.verify(token, SECRET)
  } catch {
    return res.status(401).end()
  }

  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.flushHeaders()

  const client = { res }
  sseClients.push(client)

  // Heartbeat cada 25 s para mantener conexión
  const hb = setInterval(() => { try { res.write(': ping\n\n') } catch { clearInterval(hb) } }, 25000)

  req.on('close', () => {
    clearInterval(hb)
    sseClients = sseClients.filter(c => c !== client)
  })
})

// GET /memos/download/:filename
router.get('/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename)  // prevenir path traversal
  const filePath = path.join(OUTPUT_DIR, filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' })
  res.download(filePath, filename)
})

// GET /memos/download-all — descarga todos los .docx como ZIP
router.get('/download-all', (req, res) => {
  const archivos = fs.existsSync(OUTPUT_DIR)
    ? fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.docx'))
    : []

  if (!archivos.length) return res.status(404).json({ error: 'No hay documentos generados' })

  const fecha = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="memos_${fecha}.zip"`)

  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.on('error', err => { console.error(err); res.end() })
  archive.pipe(res)

  for (const f of archivos) archive.file(path.join(OUTPUT_DIR, f), { name: f })
  archive.finalize()
})

// DELETE /memos/horarios/:filename — eliminar un horario subido
router.delete('/horarios/:filename', (req, res) => {
  const filename = path.basename(req.params.filename)
  const filePath = path.join(HORARIOS_DIR, filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' })
  fs.unlinkSync(filePath)
  res.json({ ok: true })
})

export default router
