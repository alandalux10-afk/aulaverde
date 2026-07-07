// tests/setup.js
//
// Intercepta require('electron') en TODO el proceso de pruebas, para que
// database.js y los demás módulos puedan cargarse fuera de una app de
// Electron real. Debe requerirse antes que cualquier módulo de src/js/.
//
// Importante: el mock se configura con isPackaged=true y una carpeta de
// datos de usuario TEMPORAL y distinta en cada test (ver crearMockAislado),
// para que las pruebas nunca lean ni escriban tu base de datos real de
// desarrollo (C:\AulaVerde\data\aulaverde.db).

const Module = require('module')
const fs = require('fs')
const os = require('os')
const path = require('path')
const electronMock = require('./mocks/electron-mock')

let mockActual = electronMock.crear({ isPackaged: true, rutaUserData: fs.mkdtempSync(path.join(os.tmpdir(), 'aulaverde-test-')) })

const originalRequire = Module.prototype.require
Module.prototype.require = function (id) {
  if (id === 'electron') return mockActual
  return originalRequire.apply(this, arguments)
}

// Crea un mock nuevo con su propia carpeta temporal aislada (para que cada
// archivo de test tenga su propia base de datos de prueba, sin interferir
// entre ellos ni con la base de datos real).
function crearMockAislado() {
  const carpetaTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'aulaverde-test-'))
  mockActual = electronMock.crear({ isPackaged: true, rutaUserData: carpetaTemporal })
  return mockActual
}

module.exports = { crearMockAislado }
