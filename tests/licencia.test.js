// tests/licencia.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const { verificarLicencia } = require('../src/js/licencia')

// Estos tests generan SU PROPIO par de claves de prueba en cada ejecución
// (nunca la clave privada real del producto, que no debe estar jamás en
// el repositorio). verificarLicencia() acepta opcionalmente una clave
// pública alternativa — solo para que estos tests puedan comprobar el
// caso de "licencia válida de verdad" sin necesitar la clave real.

function generarParDePrueba() {
  return crypto.generateKeyPairSync('ed25519')
}

function firmarLicencia(clavePrivada, payload) {
  const payloadTexto = JSON.stringify(payload)
  const firma = crypto.sign(null, Buffer.from(payloadTexto, 'utf8'), clavePrivada)
  return Buffer.from(payloadTexto, 'utf8').toString('base64url') + '.' + firma.toString('base64url')
}

test('verificarLicencia: acepta una licencia válida, correctamente firmada, sin caducar', () => {
  const { publicKey, privateKey } = generarParDePrueba()
  const clavePublicaPEM = publicKey.export({ type: 'spki', format: 'pem' })

  const licencia = firmarLicencia(privateKey, {
    producto: 'puntal-tpv',
    cliente: 'Ferretería López',
    emitida: '2026-01-01',
    expira: null
  })

  const r = verificarLicencia(licencia, clavePublicaPEM)
  assert.equal(r.valida, true)
  assert.equal(r.payload.cliente, 'Ferretería López')
})

test('verificarLicencia: acepta una licencia con fecha de caducidad futura', () => {
  const { publicKey, privateKey } = generarParDePrueba()
  const clavePublicaPEM = publicKey.export({ type: 'spki', format: 'pem' })

  const dentroDeUnAño = new Date()
  dentroDeUnAño.setFullYear(dentroDeUnAño.getFullYear() + 1)
  const fechaFutura = dentroDeUnAño.toISOString().split('T')[0]

  const licencia = firmarLicencia(privateKey, {
    producto: 'puntal-tpv', cliente: 'Tienda X', emitida: '2026-01-01', expira: fechaFutura
  })
  const r = verificarLicencia(licencia, clavePublicaPEM)
  assert.equal(r.valida, true)
})

test('REGRESIÓN — verificarLicencia: rechaza una licencia con fecha de caducidad pasada', () => {
  const { publicKey, privateKey } = generarParDePrueba()
  const clavePublicaPEM = publicKey.export({ type: 'spki', format: 'pem' })

  const licencia = firmarLicencia(privateKey, {
    producto: 'puntal-tpv', cliente: 'Tienda Caducada', emitida: '2020-01-01', expira: '2020-06-01'
  })
  const r = verificarLicencia(licencia, clavePublicaPEM)
  assert.equal(r.valida, false)
  assert.match(r.motivo, /caduc/i)
})

test('verificarLicencia: rechaza una licencia vacía o ausente', () => {
  assert.equal(verificarLicencia(null).valida, false)
  assert.equal(verificarLicencia('').valida, false)
  assert.equal(verificarLicencia(undefined).valida, false)
})

test('verificarLicencia: rechaza texto que no tiene el formato de una licencia', () => {
  assert.equal(verificarLicencia('esto-no-es-una-licencia-de-verdad').valida, false)
  assert.equal(verificarLicencia('parte1.parte2.parte3').valida, false)
})

test('SEGURIDAD — verificarLicencia: rechaza una licencia firmada con una clave que NO es la del producto', () => {
  // El caso más importante de todos: alguien intenta fabricarse su propia
  // licencia con su propia clave privada, sin tener la clave privada real
  // de Mario. Debe rechazarse siempre.
  const { privateKey: clavePrivadaAtacante } = generarParDePrueba()
  const { publicKey: clavePublicaDelProducto } = generarParDePrueba() // clave distinta, simula la real

  const licenciaFalsa = firmarLicencia(clavePrivadaAtacante, {
    producto: 'puntal-tpv', cliente: 'Licencia Fabricada Sin Permiso', emitida: '2026-01-01', expira: null
  })

  const r = verificarLicencia(licenciaFalsa, clavePublicaDelProducto.export({ type: 'spki', format: 'pem' }))
  assert.equal(r.valida, false, 'una licencia firmada con una clave que no es la del producto nunca debe aceptarse')
})

test('SEGURIDAD — verificarLicencia: detecta el payload manipulado (cambiar el nombre del cliente sin la clave privada)', () => {
  const { publicKey, privateKey } = generarParDePrueba()
  const clavePublicaPEM = publicKey.export({ type: 'spki', format: 'pem' })

  const original = firmarLicencia(privateKey, {
    producto: 'puntal-tpv', cliente: 'Cliente Original', emitida: '2026-01-01', expira: null
  })
  const [, firma] = original.split('.')
  const payloadManipulado = Buffer.from(JSON.stringify({
    producto: 'puntal-tpv', cliente: 'Cliente Cambiado Sin Permiso', emitida: '2026-01-01', expira: null
  })).toString('base64url')

  const r = verificarLicencia(payloadManipulado + '.' + firma, clavePublicaPEM)
  assert.equal(r.valida, false)
})

test('verificarLicencia: rechaza una licencia de otro producto distinto (mismo firmante, "producto" incorrecto)', () => {
  const { publicKey, privateKey } = generarParDePrueba()
  const clavePublicaPEM = publicKey.export({ type: 'spki', format: 'pem' })

  const licencia = firmarLicencia(privateKey, {
    producto: 'otro-producto-cualquiera', cliente: 'Tienda Y', emitida: '2026-01-01', expira: null
  })
  const r = verificarLicencia(licencia, clavePublicaPEM)
  assert.equal(r.valida, false)
})
