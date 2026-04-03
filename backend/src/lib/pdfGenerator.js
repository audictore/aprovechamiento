import PDFDocument from 'pdfkit'

export function generarReportePDF({ cuatrimestre, parciales }) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 40, size: 'A4' })
    const chunks = []

    doc.on('data',  chunk => chunks.push(chunk))
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)))
    doc.on('error', err   => reject(err))

    const W      = doc.page.width - 80
    const GREEN  = '#1D9E75'
    const RED    = '#A32D2D'
    const GRAY   = '#888888'

    // Portada
    doc.rect(0, 0, doc.page.width, 100).fill(GREEN)
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
       .text('Reporte de Aprovechamiento Académico', 40, 30)
    doc.fontSize(11).font('Helvetica')
       .text('Universidad Politécnica Metropolitana de Hidalgo', 40, 58)
    doc.fontSize(9)
       .text(`Cuatrimestre: ${cuatrimestre}  ·  Fecha: ${new Date().toLocaleDateString('es-MX')}`, 40, 78)

    doc.moveDown(4)

    for (const parcial of parciales) {
      doc.addPage()

      // Encabezado del programa
      doc.rect(0, 0, doc.page.width, 60).fill(GREEN)
      doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold')
         .text(parcial.programa, 40, 15, { width: W })
      doc.fontSize(10).font('Helvetica')
         .text(parcial.label, 40, 38)

      doc.moveDown(2)

      // Encabezado tabla
      const rowY = doc.y + 10
      doc.rect(40, rowY, W, 20).fill('#f0f0f0')
      doc.fillColor('#555555').fontSize(9).font('Helvetica-Bold')
      doc.text('Grupo',    50,  rowY + 6)
      doc.text('Promedio', 170, rowY + 6)
      doc.text('Alumnos',  270, rowY + 6)
      doc.text('Estado',   370, rowY + 6)

      let y = rowY + 22

      parcial.grupos.forEach((g, i) => {
        const enRiesgo = g.promedio < 8
        if (i % 2 === 0) {
          doc.rect(40, y - 2, W, 18).fill('#fafafa')
        }
        doc.fillColor('#000000').fontSize(9).font('Helvetica')
        doc.text(g.nombre,              50,  y + 2)
        doc.fillColor(enRiesgo ? RED : GREEN).font('Helvetica-Bold')
        doc.text(g.promedio.toFixed(2), 170, y + 2)
        doc.fillColor('#000000').font('Helvetica')
        doc.text(String(g.alumnos),     270, y + 2)
        doc.fillColor(enRiesgo ? RED : GREEN)
        doc.text(enRiesgo ? 'En riesgo' : 'Bien', 370, y + 2)
        y += 20

        if (y > doc.page.height - 80) {
          doc.addPage()
          y = 40
        }
      })

      doc.moveDown(1)

      if (parcial.materiasEnRiesgo.length) {
        doc.fillColor(RED).fontSize(11).font('Helvetica-Bold')
           .text('Materias en riesgo (promedio < 8):', 40)
        doc.moveDown(0.3)
        parcial.materiasEnRiesgo.forEach(m => {
          doc.fillColor('#333333').fontSize(9).font('Helvetica')
             .text(`• ${m.nombre}: ${m.promedio.toFixed(2)}`, 55)
        })
      } else {
        doc.fillColor(GREEN).fontSize(9).font('Helvetica')
           .text('✓ Todas las materias se encuentran por encima de 8.', 40)
      }
    }

    doc.end()
  })
}