import { Router } from 'express'
import jwt        from 'jsonwebtoken'

const router = Router()
const SECRET = process.env.JWT_SECRET || 'upmh_secret_2026'

const USUARIOS = {
  alflores: {
    password: process.env.ADMIN_PASS || 'admin',
    rol:      'admin'
  },
  observador: {
    password: null,
    rol:      'observador'
  }
}

router.post('/login', (req, res) => {
  const { usuario, password } = req.body

  if (!usuario) {
    return res.status(400).json({ error: 'Usuario requerido' })
  }

  const user = USUARIOS[usuario.toLowerCase()]
  if (!user) {
    return res.status(401).json({ error: 'Usuario incorrecto' })
  }

  if (user.password !== null && user.password !== password) {
    return res.status(401).json({ error: 'Contraseña incorrecta' })
  }

  const token = jwt.sign(
    { usuario: usuario.toLowerCase(), rol: user.rol },
    SECRET,
    { expiresIn: '8h' }
  )

  res.json({ token, rol: user.rol, usuario: usuario.toLowerCase() })
})

router.get('/verificar', (req, res) => {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' })
  }
  try {
    const datos = jwt.verify(auth.slice(7), SECRET)
    res.json({ usuario: datos.usuario, rol: datos.rol })
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
})

export default router