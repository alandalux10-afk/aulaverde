// tests/database.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { crearMockAislado } = require('./setup')

// Cada test pide un módulo "fresco" de database.js, con su propia carpeta
// de datos temporal y aislada, para que no se contaminen entre sí.
function cargarDatabaseFresco() {
  crearMockAislado()
  const rutaModulo = require.resolve('../src/js/database')
  delete require.cache[rutaModulo]
  return require('../src/js/database')
}

test('cifrar / descifrar: recupera el valor original', () => {
  const dbModule = cargarDatabaseFresco()
  const original = 'sk-ant-api03-CLAVE-DE-PRUEBA'
  const cifrado = dbModule.cifrar(original)
  assert.notEqual(cifrado, original, 'el valor cifrado debe ser distinto del original')
  assert.ok(cifrado.startsWith('ENC:'), 'el valor cifrado debe llevar el prefijo ENC:')
  assert.equal(dbModule.descifrar(cifrado), original, 'el descifrado debe recuperar el valor original exacto')
})

test('cifrar: es idempotente (no vuelve a cifrar algo ya cifrado)', () => {
  const dbModule = cargarDatabaseFresco()
  const cifradoUnaVez = dbModule.cifrar('un-valor-cualquiera')
  const cifradoDosVeces = dbModule.cifrar(cifradoUnaVez)
  assert.equal(cifradoDosVeces, cifradoUnaVez, 'cifrar un valor ya cifrado no debe cambiarlo')
})

test('descifrar: un valor antiguo sin cifrar (de antes de este cambio) se devuelve tal cual', () => {
  const dbModule = cargarDatabaseFresco()
  const valorAntiguo = 'Pulcher_79'
  assert.equal(dbModule.descifrar(valorAntiguo), valorAntiguo)
})

test('cifrar / descifrar: valores vacíos no dan error', () => {
  const dbModule = cargarDatabaseFresco()
  assert.equal(dbModule.cifrar(''), '')
  assert.equal(dbModule.cifrar(null), null)
  assert.equal(dbModule.descifrar(''), '')
  assert.equal(dbModule.descifrar(null), null)
})

test('inicializarDB: una instalación nueva crea las tablas y los datos iniciales', async () => {
  const dbModule = cargarDatabaseFresco()
  const db = await dbModule.inicializarDB()
  const tipos = db.exec('SELECT COUNT(*) FROM TIPOS_IVA')[0].values[0][0]
  assert.equal(tipos, 4, 'deben existir los 4 tipos de IVA iniciales')
  const config = db.exec('SELECT nombre_tienda FROM CONFIGURACION WHERE id_configuracion = 1')
  assert.equal(config[0].values[0][0], 'Aula Verde')
})

test('inicializarDB: la ruta de la base de datos vive en la carpeta de usuario cuando la app está empaquetada', async () => {
  const dbModule = cargarDatabaseFresco()
  await dbModule.inicializarDB()
  const ruta = dbModule.obtenerRutaBD()
  assert.ok(ruta.includes('aulaverde.db'), 'la ruta debe apuntar al archivo de la base de datos')
  // No debe apuntar nunca a la carpeta del proyecto de desarrollo (protección
  // adicional para que un test mal escrito no toque nunca la BD real de Mario)
  assert.ok(!ruta.includes(path.join('src', 'js')), 'no debe calcular la ruta relativa al código fuente en modo empaquetado')
})

test('REGRESIÓN — siguienteNumeroDocumento funciona con el valor real usado por la app (FACTURA_SIMPLIFICADA)', async () => {
  // Este test existe porque el 30/07 hubo un bug real: el contador se
  // sembraba con el tipo "FS" (un valor que en realidad no usa la app en
  // ningún sitio), en vez de "FACTURA_SIMPLIFICADA" (el valor real que
  // usa tpv.js). El contador de facturas quedaba roto en silencio.
  const dbModule = cargarDatabaseFresco()
  await dbModule.inicializarDB()
  const primero = dbModule.siguienteNumeroDocumento('FACTURA_SIMPLIFICADA')
  const segundo = dbModule.siguienteNumeroDocumento('FACTURA_SIMPLIFICADA')
  assert.equal(primero, 1)
  assert.equal(segundo, 2, 'debe incrementar de verdad en la segunda llamada')
})

test('REGRESIÓN — el número de documento no se repite aunque se borre la venta que lo generó', async () => {
  // Este es exactamente el escenario que reprodujimos manualmente hoy:
  // cobrar una factura, borrarla desde Consultas, y cobrar otra. Antes del
  // arreglo (leer la última venta y sumar 1), el segundo número repetía
  // el primero. Con el contador dedicado, esto ya no puede pasar.
  const dbModule = cargarDatabaseFresco()
  const db = await dbModule.inicializarDB()

  const numero1 = dbModule.siguienteNumeroDocumento('TICKET')
  db.run(
    "INSERT INTO VENTAS (numero_documento, fecha, hora, cliente, tipo_documento, id_forma_pago, estado, total_venta) VALUES (?, '2026-01-01', '10:00', 'Cliente contado', 'TICKET', 1, 'COBRADO', 5)",
    [`T-${String(numero1).padStart(4, '0')}`]
  )

  // Se borra la venta recién creada, simulando el botón "Eliminar"
  db.run("DELETE FROM VENTAS WHERE numero_documento = ?", [`T-${String(numero1).padStart(4, '0')}`])

  const numero2 = dbModule.siguienteNumeroDocumento('TICKET')
  assert.notEqual(numero2, numero1, 'el número no debe repetirse tras borrar la venta que lo generó')
  assert.equal(numero2, numero1 + 1)
})

test('siguienteNumeroDocumento: siembra el contador a partir del histórico real si ya había ventas antes de este cambio', async () => {
  const dbModule = cargarDatabaseFresco()
  const db = await dbModule.inicializarDB()

  // Simula ventas ya existentes de "antes" de que existiera el contador
  db.run("INSERT INTO VENTAS (numero_documento, fecha, hora, cliente, tipo_documento, id_forma_pago, estado, total_venta) VALUES ('T-0001','2026-01-01','10:00','Cliente contado','TICKET',1,'COBRADO',5)")
  db.run("INSERT INTO VENTAS (numero_documento, fecha, hora, cliente, tipo_documento, id_forma_pago, estado, total_venta) VALUES ('T-0002','2026-01-01','10:05','Cliente contado','TICKET',1,'COBRADO',7)")
  // A propósito, sin fila en CONTADORES_DOCUMENTOS todavía para "TICKET_HISTORICO"
  db.run("DELETE FROM CONTADORES_DOCUMENTOS WHERE tipo_documento = 'TICKET'")

  const siguiente = dbModule.siguienteNumeroDocumento('TICKET')
  assert.equal(siguiente, 3, 'debe continuar desde el máximo histórico real (2), no empezar de nuevo en 1')
})
