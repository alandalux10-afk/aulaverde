// tests/mocks/electron-mock.js
//
// Sustituye el módulo 'electron' por una versión simulada, para poder
// probar el código que depende de Electron (safeStorage, app.getPath...)
// sin necesidad de arrancar la aplicación de verdad. Se usa cifrado real
// (AES-256-GCM de Node) para que las pruebas de cifrado sean representativas,
// no un simulacro vacío.
//
// Cómo se usa: cada archivo de test debe requerir 'tests/setup.js' ANTES
// de requerir cualquier módulo de src/js/ que a su vez requiera 'electron'
// (database.js, etc.), para que el "require" quede interceptado a tiempo.

const crypto = require('crypto')

const CLAVE_SIMULADA = crypto.scryptSync('clave-de-pruebas-no-real', 'sal-de-pruebas', 32)

function crear({ isPackaged = false, rutaDocuments = '/tmp/pruebas-documents', rutaUserData = '/tmp/pruebas-userdata' } = {}) {
  return {
    app: {
      isPackaged,
      getPath(nombre) {
        if (nombre === 'documents') return rutaDocuments
        if (nombre === 'userData') return rutaUserData
        return '/tmp'
      }
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString(texto) {
        const iv = crypto.randomBytes(12)
        const cipher = crypto.createCipheriv('aes-256-gcm', CLAVE_SIMULADA, iv)
        const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
        const tag = cipher.getAuthTag()
        return Buffer.concat([iv, tag, cifrado])
      },
      decryptString(buffer) {
        const iv = buffer.subarray(0, 12)
        const tag = buffer.subarray(12, 28)
        const cifrado = buffer.subarray(28)
        const decipher = crypto.createDecipheriv('aes-256-gcm', CLAVE_SIMULADA, iv)
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8')
      }
    }
  }
}

module.exports = { crear }
