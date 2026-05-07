/**
 * Script de regeneración de memos con el nuevo código.
 * Ejecutar desde backend/: node runMemos.mjs
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { buildJobs } from './src/lib/memos/buildJobs.js'
import { generateDocx } from './src/lib/memos/generateDocx.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const inputDir  = path.join(__dirname, 'data', 'memos-input')
const outputDir = path.join(__dirname, 'data', 'memos-output')

// Leer config
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'memos-config.json'), 'utf8'))

console.log('=== Regenerando memos ===')
console.log('Input:', inputDir)
console.log('Output:', outputDir)

const jobs = await buildJobs(config, inputDir, outputDir, t => console.log(t))

console.log(`\nGenerando ${jobs.length} documentos...`)
let ok = 0, err = 0
for (const job of jobs) {
  try {
    await generateDocx(job)
    console.log(`  ✓ ${path.basename(job.outputPath)}`)
    ok++
  } catch (e) {
    console.error(`  ✗ ${job.docente.nombre}: ${e.message}`)
    err++
  }
}
console.log(`\nListo: ${ok} OK, ${err} errores`)
