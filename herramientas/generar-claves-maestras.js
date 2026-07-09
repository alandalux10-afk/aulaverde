// herramientas/generar-claves-maestras.js
//
// EJECUTAR UNA SOLA VEZ, en tu propio ordenador. Genera el par de claves
// que va a proteger todas las licencias de Puntal TPV:
//
//   - clave-privada.pem  → SECRETÍSIMA. Con ella se generan licencias
//     válidas. Si alguien la consigue, puede fabricar licencias falsas
//     indistinguibles de las tuyas. NUNCA la subas a GitHub, ni la mandes
//     por email, ni la guardes en Google Drive sin cifrar. Idealmente,
//     guárdala en un USB aparte además de en tu ordenador, por si acaso.
//
//   - clave-publica.pem  → esta sí va dentro de la aplicación (la necesita
//     para poder comprobar que una licencia es válida). No pasa nada si
//     alguien la ve; con la pública NO se pueden fabricar licencias, solo
//     comprobarlas.
//
// Uso:
//   node herramientas/generar-claves-maestras.js

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const CARPETA = __dirname
const RUTA_PRIVADA = path.join(CARPETA, 'clave-privada.pem')
const RUTA_PUBLICA = path.join(CARPETA, 'clave-publica.pem')

if (fs.existsSync(RUTA_PRIVADA) || fs.existsSync(RUTA_PUBLICA)) {
  console.log('⚠️  Ya existen claves generadas en esta carpeta.')
  console.log('    Si generas unas nuevas, todas las licencias que hayas repartido')
  console.log('    hasta ahora dejarán de funcionar (se validan contra la clave pública actual).')
  console.log('    Si de verdad quieres regenerarlas, borra a mano clave-privada.pem y clave-publica.pem primero.')
  process.exit(1)
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')

fs.writeFileSync(RUTA_PRIVADA, privateKey.export({ type: 'pkcs8', format: 'pem' }))
fs.writeFileSync(RUTA_PUBLICA, publicKey.export({ type: 'spki', format: 'pem' }))

console.log('✅ Par de claves generado correctamente:')
console.log('   ' + RUTA_PRIVADA + '  (SECRETA — no la compartas ni la subas a git)')
console.log('   ' + RUTA_PUBLICA + '  (esta se incorporará al código de la app)')
console.log('')
console.log('Siguiente paso: copia el contenido de clave-publica.pem dentro de src/js/licencia.js')
console.log('(te doy el paso a paso a continuación).')
