import 'dotenv/config'
import express    from 'express'
import cors       from 'cors'
import path       from 'path'
import { fileURLToPath } from 'url'
import authRouter          from './routes/auth.js'
import cuatrimestresRouter from './routes/cuatrimestres.js'
import parcialesRouter     from './routes/parciales.js'
import docentesRouter      from './routes/docentes.js'
import memosRouter         from './routes/memos.js'
import auditoriasRouter    from './routes/auditorias.js'
import { requireAuth } from './middleware/auth.js'

const app     = express()
const PORT    = process.env.PORT || 4000
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(cors())
app.use(express.json())

// Rutas con prefijo /api (frontend compilado en producción)
app.use('/api/auth',          authRouter)
app.use('/api/cuatrimestres', cuatrimestresRouter)
app.use('/api/docentes',      requireAuth, docentesRouter)
app.use('/api/parciales',     parcialesRouter)
app.use('/api/auditorias',    requireAuth, auditoriasRouter)

// Rutas sin prefijo (compatibilidad con dev y SSE/descargas)
app.use('/auth',          authRouter)
app.use('/cuatrimestres', cuatrimestresRouter)
app.use('/docentes',      requireAuth, docentesRouter)
app.use('/parciales',     parcialesRouter)
app.use('/auditorias',    requireAuth, auditoriasRouter)

// Memos: token por query param para SSE y links de descarga
const memoTokenMiddleware = (req, _res, next) => {
  if (req.query.token && !req.headers.authorization)
    req.headers.authorization = `Bearer ${req.query.token}`
  next()
}
app.use('/api/memos', memoTokenMiddleware)
app.use('/api/memos', requireAuth, memosRouter)
app.use('/memos',     memoTokenMiddleware)
app.use('/memos',     requireAuth, memosRouter)

// Servir frontend en producción
const frontendDist = path.join(__dirname, '../../frontend/dist')
app.use(express.static(frontendDist))
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'))
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Error interno' })
})

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor corriendo en http://localhost:${PORT}`))