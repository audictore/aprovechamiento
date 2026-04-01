import 'dotenv/config'
import express    from 'express'
import cors       from 'cors'
import authRouter          from './routes/auth.js'
import cuatrimestresRouter from './routes/cuatrimestres.js'
import parcialesRouter     from './routes/parciales.js'
import docentesRouter      from './routes/docentes.js'
import { requireAuth } from './middleware/auth.js'

const app  = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

app.get('/', (_req, res) => res.json({ status: 'ok', app: 'Aprovechamiento UPMH' }))

app.use('/auth',          authRouter)
app.use('/cuatrimestres', requireAuth, cuatrimestresRouter)
app.use('/docentes',      requireAuth, docentesRouter)
app.use('/parciales',     requireAuth, parcialesRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Error interno' })
})

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`))

