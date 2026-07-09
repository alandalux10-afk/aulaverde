// herramientas/generar-licencia.js
//
// Genera una licencia firmada para un cliente nuevo. Necesita el archivo
// clave-privada.pem en esta misma carpeta (generado con
// generar-claves-maestras.js).
//
// Uso:
//   node herramientas/generar-licencia.js "Nombre del cliente o tienda"
//   node herramientas/generar-licencia.js "Nombre del cliente o tienda" 2027-12-31
//
// El segundo argumento (fecha de caducidad, formato AAAA-MM-DD) es opcional.
// Si no se indica, la licencia no caduca nunca.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const RUTA_PRIVADA = path.join(__dirname, 'clave-privada.pem')

function generarLicencia(nombreCliente, fechaExpiracion) {
  if (!fs.existsSync(RUTA_PRIVADA)) {
    throw new Error('No se encuentra clave-privada.pem en la carpeta herramientas/. Ejecuta primero generar-claves-maestras.js')
  }
  if (!nombreCliente || !nombreCliente.trim()) {
    throw new Error('Falta el nombre del cliente')
  }
  if (fechaExpiracion && isNaN(Date.parse(fechaExpiracion))) {
    throw new Error('La fecha de caducidad no es válida. Usa el formato AAAA-MM-DD, por ejemplo 2027-12-31')
  }

  const clavePrivada = crypto.createPrivateKey(fs.readFileSync(RUTA_PRIVADA, 'utf8'))

  const payload = {
    producto: 'puntal-tpv',
    cliente: nombreCliente.trim(),
    emitida: new Date().toISOString().split('T')[0],
    expira: fechaExpiracion || null
  }

  const payloadTexto = JSON.stringify(payload)
  const firma = crypto.sign(null, Buffer.from(payloadTexto, 'utf8'), clavePrivada)

  const licencia =
    Buffer.from(payloadTexto, 'utf8').toString('base64url') +
    '.' +
    firma.toString('base64url')

  return { licencia, payload }
}

// Si se ejecuta directamente desde la terminal (no como módulo importado)
if (require.main === module) {
  const nombreCliente = process.argv[2]
  const fechaExpiracion = process.argv[3]

  if (!nombreCliente) {
    console.log('Uso: node herramientas/generar-licencia.js "Nombre del cliente" [AAAA-MM-DD]')
    process.exit(1)
  }

  try {
    const { licencia, payload } = generarLicencia(nombreCliente, fechaExpiracion)
    console.log('')
    console.log('✅ Licencia generada para:', payload.cliente)
    console.log('   Emitida:', payload.emitida)
    console.log('   Caduca:', payload.expira || 'nunca (licencia perpetua)')
    console.log('')
    console.log('Clave de licencia (envíasela al cliente para que la pegue en la pantalla de activación):')
    console.log('')
    console.log(licencia)
    console.log('')
  } catch (e) {
    console.error('❌ Error:', e.message)
    process.exit(1)
  }
}

module.exports = { generarLicencia }
