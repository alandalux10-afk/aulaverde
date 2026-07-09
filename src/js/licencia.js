// src/js/licencia.js
//
// Comprueba si la licencia introducida por el usuario es válida, usando
// únicamente la clave PÚBLICA (nunca la privada, que no debe estar nunca
// dentro del código de la aplicación). Con la clave pública se puede
// comprobar una firma, pero NO se pueden fabricar licencias nuevas —
// para eso hace falta la clave privada, que solo tiene Mario.

const crypto = require('crypto')

const CLAVE_PUBLICA_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAkt0J4rbBITxXB4Py7p/5Yz0jyEBq3MzDNuer2MHDeDs=
-----END PUBLIC KEY-----`

const NOMBRE_PRODUCTO = 'puntal-tpv'

// Comprueba una licencia (el texto largo que pega el cliente). Devuelve
// { valida: true, payload } o { valida: false, motivo }.
// El segundo parámetro es opcional y solo lo usan los tests automáticos,
// para poder probar una licencia "válida de verdad" firmada con una clave
// de prueba, sin tener que exponer la clave pública real del producto
// como si fuera un caso de test más.
function verificarLicencia(licenciaTexto, clavePublicaPEM = CLAVE_PUBLICA_PEM) {
  if (!licenciaTexto || typeof licenciaTexto !== 'string' || !licenciaTexto.trim()) {
    return { valida: false, motivo: 'No hay ninguna licencia introducida' }
  }

  const partes = licenciaTexto.trim().split('.')
  if (partes.length !== 2) {
    return { valida: false, motivo: 'El formato de la licencia no es válido. Comprueba que la has copiado completa.' }
  }
  const [payloadB64, firmaB64] = partes

  let payloadTexto, payload
  try {
    payloadTexto = Buffer.from(payloadB64, 'base64url').toString('utf8')
    payload = JSON.parse(payloadTexto)
  } catch (e) {
    return { valida: false, motivo: 'La licencia está corrupta o incompleta' }
  }

  let firma
  try {
    firma = Buffer.from(firmaB64, 'base64url')
    if (!firma.length) throw new Error('vacío')
  } catch (e) {
    return { valida: false, motivo: 'La licencia está corrupta o incompleta' }
  }

  let clavePublica
  try {
    clavePublica = crypto.createPublicKey(clavePublicaPEM)
  } catch (e) {
    return { valida: false, motivo: 'Error interno al comprobar la licencia (clave pública no configurada correctamente)' }
  }

  let firmaValida = false
  try {
    firmaValida = crypto.verify(null, Buffer.from(payloadTexto, 'utf8'), clavePublica, firma)
  } catch (e) {
    firmaValida = false
  }

  if (!firmaValida) {
    return { valida: false, motivo: 'La licencia no es válida' }
  }

  if (payload.producto !== NOMBRE_PRODUCTO) {
    return { valida: false, motivo: 'Esta licencia no corresponde a este producto' }
  }

  if (payload.expira) {
    const fechaExpira = new Date(payload.expira + 'T23:59:59')
    if (fechaExpira < new Date()) {
      return { valida: false, motivo: `La licencia caducó el ${payload.expira}`, payload }
    }
  }

  return { valida: true, payload }
}

module.exports = { verificarLicencia }
