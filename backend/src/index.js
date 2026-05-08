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

app.use('/auth',          authRouter)
app.use('/cuatrimestres', cuatrimestresRouter)  // sin requireAuth
app.use('/docentes',      requireAuth, docentesRouter)
app.use('/parciales', parcialesRouter)
// Para SSE y descargas: links <a> y EventSource no mandan headers, el token llega por ?token=
app.use('/memos', (req, _res, next) => {
  if (req.query.token && !req.headers.authorization)
    req.headers.authorization = `Bearer ${req.query.token}`
  next()
})
app.use('/memos',       requireAuth, memosRouter)
app.use('/auditorias',  requireAuth, auditoriasRouter)

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