import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/')) {
      localStorage.removeItem('token')
      localStorage.removeItem('rol')
      localStorage.removeItem('usuario')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

export const login                = (data)            => api.post('/auth/login', data)
export const verificar            = ()                => api.get('/auth/verificar')
export const getCuatrimestres     = ()                => api.get('/cuatrimestres')
export const crearCuatrimestre    = (data)            => api.post('/cuatrimestres', data)
export const getProgramas         = (cuatriId)        => api.get(`/cuatrimestres/${cuatriId}/programas`)
export const getReporte           = (parcialId)       => api.get(`/parciales/${parcialId}/reporte`)
export const getDocentes          = ()                => api.get('/docentes')
export const updateEmail          = (id, email)       => api.put(`/docentes/${id}/email`, { email })
export const enviarCorreos        = (parcialId, data) => api.post(`/parciales/${parcialId}/enviar-correos`, data)

export const enviarCorreosDirecto = (data, archivos = []) => {
  if (!archivos.length) return api.post('/docentes/enviar-correos', data)
  const fd = new FormData()
  fd.append('json', JSON.stringify(data))
  archivos.forEach((f, i) => fd.append(`file_${i}`, f, f.name))
  return api.post('/docentes/enviar-correos', fd, {
    headers: { 'Content-Type': undefined }
  })
}

export const uploadExcel = (cuatriId, programa, numParcial, file) => {
  const fd = new FormData()
  fd.append('file', file)
  const prog = encodeURIComponent(programa)
  return api.post(`/parciales/${cuatriId}/${prog}/${numParcial}/upload`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const uploadPDFs = (parcialId, numParcial, files) => {
  const fd = new FormData()
  Array.from(files).forEach(f => fd.append('files', f))
  fd.append('numParcial', String(numParcial))
  return api.post(`/parciales/${parcialId}/upload-pdfs`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const eliminarCuatrimestre = (id)                              => api.delete(`/cuatrimestres/${id}`)
export const eliminarPrograma     = (cuatriId, programaId)            => api.delete(`/cuatrimestres/${cuatriId}/programas/${programaId}`)
export const eliminarParcial      = (cuatriId, programaId, parcialId) => api.delete(`/cuatrimestres/${cuatriId}/programas/${programaId}/parciales/${parcialId}`)
export const limpiarParcial       = (parcialId)                       => api.delete(`/parciales/${parcialId}/datos`)
export const getEstadisticas      = (cuatriId)                        => api.get(`/cuatrimestres/${cuatriId}/estadisticas`)
export const getTendencia         = (cuatriId, programaId)            => api.get(`/cuatrimestres/${cuatriId}/programas/${programaId}/tendencia`)

export default api