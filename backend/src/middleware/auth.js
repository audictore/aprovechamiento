import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'upmh_secret_2026'

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' })
  }
  try {
    req.user = jwt.verify(auth.slice(7), SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede hacer esto' })
    }
    next()
  })
}