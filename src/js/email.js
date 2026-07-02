const nodemailer = require('nodemailer')
const { getDB } = require('./database')

// Construye el transportador de nodemailer a partir de la configuración SMTP guardada
function obtenerTransportador() {
  const db = getDB()
  const result = db.exec('SELECT smtp_host, smtp_puerto, smtp_usuario, smtp_password FROM CONFIGURACION WHERE id_configuracion = 1')

  if (!result.length || !result[0].values.length) {
    return null
  }

  const [host, puerto, usuario, password] = result[0].values[0]

  if (!host || !puerto || !usuario || !password) {
    return null
  }

  return nodemailer.createTransport({
    host,
    port: puerto,
    secure: puerto === 465, // true para puerto 465 (SSL), false para 587 (TLS)
    auth: {
      user: usuario,
      pass: password
    }
  })
}

// Sustituye las variables de la plantilla (por ahora solo {nombre}) por los datos reales del cliente
function aplicarVariables(texto, cliente) {
  return texto.replace(/{nombre}/g, cliente.nombre || '')
}

// Envía un email a un cliente usando una plantilla ya cargada (con asunto y cuerpo)
// cliente: { nombre, email }
// plantilla: { asunto, cuerpo }
async function enviarEmailCliente(cliente, plantilla) {
  if (!cliente.email) {
    return { ok: false, mensaje: 'Este cliente no tiene email registrado.' }
  }

  const transportador = obtenerTransportador()
  if (!transportador) {
    return { ok: false, mensaje: 'No hay configuración SMTP completa. Ve a Configuración y rellena los datos del servidor de correo.' }
  }

  const db = getDB()
  const cfgResult = db.exec('SELECT smtp_email_remitente, nombre_tienda FROM CONFIGURACION WHERE id_configuracion = 1')
  const emailRemitente = cfgResult.length && cfgResult[0].values.length ? cfgResult[0].values[0][0] : null
  const nombreTienda = cfgResult.length && cfgResult[0].values.length ? cfgResult[0].values[0][1] : 'Aula Verde'

  if (!emailRemitente) {
    return { ok: false, mensaje: 'No hay email remitente configurado. Ve a Configuración.' }
  }

  const asunto = aplicarVariables(plantilla.asunto, cliente)
  const cuerpo = aplicarVariables(plantilla.cuerpo, cliente)

  try {
    await transportador.sendMail({
      from: `"${nombreTienda}" <${emailRemitente}>`,
      to: cliente.email,
      subject: asunto,
      text: cuerpo
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: 'Error al enviar: ' + e.message }
  }
}

// Verifica la conexión SMTP sin enviar ningún correo (para el botón "Probar conexión")
async function probarConexionSmtp() {
  const transportador = obtenerTransportador()
  if (!transportador) {
    return { ok: false, mensaje: 'Faltan datos de configuración SMTP.' }
  }
  try {
    await transportador.verify()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
}

module.exports = { enviarEmailCliente, probarConexionSmtp, aplicarVariables }
