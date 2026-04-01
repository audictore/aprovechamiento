import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

export async function enviarCorreo({ to, subject, text }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('Configura SMTP_USER y SMTP_PASS en el archivo .env')
  }
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto">
      <div style="background:#1D9E75;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
        <h2 style="margin:0;font-size:18px">Reporte de Aprovechamiento Académico</h2>
        <p style="margin:4px 0 0;font-size:12px;opacity:.8">Universidad Politécnica Metropolitana de Hidalgo</p>
      </div>
      <div style="background:#f9f9f9;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 10px 10px;padding:24px;font-size:14px;line-height:1.7;color:#333">
        ${text.replace(/\n/g, '<br>')}
      </div>
    </div>`
  await transporter.sendMail({
    from: `"UPMH Académico" <${process.env.SMTP_USER}>`,
    to, subject, text, html
  })
}

export function construirCuerpo({ docenteNombre, cuatrimestre, parcialLabel, programa, grupos, mensajeExtra }) {
  const promGeneral = grupos.length
    ? (grupos.reduce((s, g) => s + g.promedio, 0) / grupos.length).toFixed(2)
    : '—'
  const totalRep    = grupos.reduce((s, g) => s + g.reprobados, 0)
  const lineasGrupos = grupos
    .map(g => `  • Grupo ${g.grupo}: Promedio ${g.promedio.toFixed(2)}  |  Reprobados: ${g.reprobados}`)
    .join('\n')
  const extra = mensajeExtra ? `\n${mensajeExtra}\n` : ''

  return `Estimado(a) ${docenteNombre},
${extra}
Le compartimos su reporte de aprovechamiento académico:

  Cuatrimestre        : ${cuatrimestre}
  Programa educativo  : ${programa}
  Parcial             : ${parcialLabel}

RESULTADOS POR GRUPO:
${lineasGrupos}

  Promedio general entre grupos : ${promGeneral}
  Total de alumnos reprobados   : ${totalRep}

Este correo fue generado automáticamente por el sistema de seguimiento académico.

Atentamente,
Coordinación Académica — UPMH`
}