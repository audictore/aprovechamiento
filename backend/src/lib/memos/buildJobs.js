import path from 'path'
import fs from 'fs'
import { parseCarga } from './parseCarga.js'
import { parseHorario, parseHorarioMulti, isMultiSheetHorario } from './parseHorario.js'
import { normalize, stripTitle } from './parseCarga.js'

/**
 * Lee los archivos de carga y horarios, y construye la lista de jobs
 * (uno por docente) listos para pasarlos a generateDocx.
 *
 * @param {object} config  - Contenido de memos-config.json
 * @param {string} inputDir - Directorio backend/data/memos-input
 * @param {string} outputDir - Directorio backend/data/memos-output
 * @param {function} log - Callback(text) para logging
 * @returns {Promise<Array>} Lista de job objects
 */
export async function buildJobs(config, inputDir, outputDir, log = console.log) {
  const cargaFile    = path.join(inputDir, 'carga.xlsx')
  const horariosDir  = path.join(inputDir, 'horarios')

  if (!fs.existsSync(cargaFile)) throw new Error('Falta archivo carga.xlsx')

  log('Leyendo carga académica…')
  const { docentes, findByName } = await parseCarga(cargaFile)
  log(`  ${docentes.length} docentes encontrados en carga`)

  // Leer todos los archivos de horario
  const horarioFiles = fs.existsSync(horariosDir)
    ? fs.readdirSync(horariosDir).filter(f => /\.(xlsx|xls)$/i.test(f)).map(f => path.join(horariosDir, f))
    : []

  log(`  ${horarioFiles.length} archivo(s) de horario`)

  // Construir mapa nombre → { file, sheetName }
  const horarioMap = new Map()
  for (const file of horarioFiles) {
    try {
      const multi = await isMultiSheetHorario(file)
      if (multi) {
        const results = await parseHorarioMulti(file)
        for (const r of results) {
          const key = normalize(stripTitle(r.nombreDocente))
          horarioMap.set(key, { file, sheetName: r.sheetName })
        }
      } else {
        const r = await parseHorario(file)
        const key = normalize(stripTitle(r.nombreDocente))
        horarioMap.set(key, { file, sheetName: null })
      }
    } catch (e) {
      log(`  [WARN] No se pudo leer horario ${path.basename(file)}: ${e.message}`)
    }
  }

  // Determinar el PE de cada docente según su campo pe
  function getPE(docente) {
    const pe = (docente.pe || '').toUpperCase().trim()
    for (const key of Object.keys(config.programa_educativo)) {
      if (pe.includes(key)) return key
    }
    return Object.keys(config.programa_educativo)[0]
  }

  function getCargo(docente, cfg) {
    const cat = docente.categoria || ''
    for (const [k, v] of Object.entries(cfg.categoria_cargo)) {
      if (cat.toLowerCase().includes(k.toLowerCase())) return v
    }
    return cat || 'Docente'
  }

  function esTipoPTC(docente) {
    const cat = (docente.categoria || '').toLowerCase()
    return cat.includes('ptc') || cat.includes('técnico') || cat.includes('tecnico') || cat.includes('director')
  }

  // Número de referencia
  const { ref_prefix, ref_number, anio_ref, cuatrimestre } = config

  const jobs = []
  let refCounter = parseInt(ref_number, 10) || 1

  for (const docente of docentes) {
    const peKey = getPE(docente)
    const peCfg = config.programa_educativo[peKey]
    const coordinador = peCfg?.coordinador || config.programa_educativo[Object.keys(config.programa_educativo)[0]].coordinador
    const secretaria  = config.secretaria_academica

    const horKey = docente.nombreKey
    const horario = horarioMap.get(horKey) || null

    // Fecha
    const hoy = new Date()
    const fecha = hoy.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })

    // Cargo del emisor (docente)
    const cargoDocente = getCargo(docente, config)
    const tipoPTC = esTipoPTC(docente)

    // Divide el campo "asignatura" (multilínea) en líneas individuales
    function asigLineas() {
      return (docente.asignatura || '').split('\n').map(s => s.trim()).filter(Boolean)
    }

    // Observación para PTC: devuelve todas las líneas (asignatura + proyecto)
    function getObsTexto() {
      const lineas = [
        ...asigLineas(),
        ...(docente.proyectoInvestigacion || '').split('\n').map(s => s.trim()).filter(Boolean),
      ]
      return lineas.join('\n')
    }

    // Observación como array de strings (para renderizar como lista con bullets)
    function getObsLineas() {
      const lineas = [
        ...asigLineas(),
        ...(docente.proyectoInvestigacion || '').split('\n').map(s => s.trim()).filter(Boolean),
      ]
      return lineas.length ? lineas : []
    }

    // Para PA: observaciones filtradas por tipo de actividad (devuelve array)
    function getObsPorActividad(actividadLabel) {
      const al = actividadLabel.toLowerCase()
      const lineas = asigLineas()

      if (al.includes('docenci')) {
        const doc = lineas.filter(l => !/tutori/i.test(l) && !/asesor/i.test(l))
        return doc.length ? doc : []
      }
      if (al.includes('tutor')) {
        const tut = lineas.filter(l => /tutori/i.test(l))
        return tut.length ? tut : ['Tutoría']
      }
      if (al.includes('asesor')) {
        const ase = lineas.filter(l => /asesor/i.test(l))
        return ase.length ? ase : ['Asesoría']
      }
      if (al.includes('preparaci')) return ['Preparación de clase']
      if (al.includes('investigaci')) {
        const inv = (docente.proyectoInvestigacion || '').split('\n').map(s => s.trim()).filter(Boolean)
        return inv.length ? inv : ['Investigación']
      }
      if (al.includes('gesti')) return ['Gestión institucional']
      return []
    }

    const referencia = `${ref_prefix}/${peKey}/${String(refCounter).padStart(3, '0')}/${anio_ref}`
    refCounter++

    const asunto = config.asunto_por_pe?.[peKey] || 'Entrega de Horario.'

    const programaLargo = peCfg?.nombre_completo || peKey

    const actividades = [
      { label: 'Docencia',       horas: docente.horas.docencia },
      { label: 'Tutoría',        horas: docente.horas.tutoria },
      { label: 'Asesoría',       horas: docente.horas.asesoria },
      { label: 'Preparación',    horas: docente.horas.preparacion },
      { label: 'Investigación',  horas: docente.horas.investigacion },
      { label: 'Gestión',        horas: docente.horas.gestion },
    ].filter(a => a.horas > 0)

    const totalHoras = actividades.reduce((s, a) => s + a.horas, 0)

    const safeNombre = docente.nombre.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s_-]/g, '_').replace(/\s+/g, '_')
    const outputPath = path.join(outputDir, `${safeNombre}_${peKey}.docx`)

    jobs.push({
      docente,
      coordinador,
      secretaria,
      fecha,
      referencia,
      asunto,
      cuatrimestre,
      cargoDocente,
      tipoPTC,
      programaLargo,
      actividades,
      totalHoras,
      getObsTexto,
      getObsLineas,
      getObsPorActividad,
      horarioXlsx: horario?.file || null,
      horarioSheetName: horario?.sheetName || null,
      outputPath,
    })
  }

  log(`  ${jobs.length} jobs construidos`)
  return jobs
}
