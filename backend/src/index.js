import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cuatrimestresRouter from './routes/cuatrimestres.js'
import parcialesRouter from './routes/parciales.js'
import docentesRouter from './routes/docentes.js'

const app  = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({ status: 'ok', mensaje: 'Servidor funcionando' })
})

app.use('/cuatrimestres', cuatrimestresRouter)
app.use('/parciales',     parcialesRouter)
app.use('/docentes',      docentesRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Error interno' })
})

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
})
