// tests/ventas.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { crearMockAislado } = require('./setup')

// Prepara una base de datos de pruebas real y completa (mismo esquema que
// usa la aplicación), con algunos productos y un tipo de IVA de ejemplo.
async function prepararEntorno() {
  crearMockAislado()
  const rutaDb = require.resolve('../src/js/database')
  const rutaVentas = require.resolve('../src/js/ventas')
  delete require.cache[rutaDb]
  delete require.cache[rutaVentas]

  const dbModule = require('../src/js/database')
  const ventasModule = require('../src/js/ventas')
  const db = await dbModule.inicializarDB()

  db.run("INSERT INTO PRODUCTOS (codigo, nombre, familia, tipo_venta, precio_venta, id_iva, activo) VALUES ('AV0001', 'Aceite de oliva', 'ALIMENTACION', 'UNIDAD', 8.50, 3, 1)")
  db.run("INSERT INTO CLIENTES (nombre, telefono, activo, descuento) VALUES ('Cliente Fiel', '600111222', 1, 10)")

  return { db, dbModule, ventasModule }
}

test('guardarVenta: calcula correctamente la base imponible y el IVA de una línea con IVA incluido', async () => {
  const { ventasModule } = await prepararEntorno()

  // Línea de 2 unidades a 12,10€ (precio con IVA incluido al 21%) = 24,20€ total
  const lineas = [{ id_producto: 1, codigo: 'AV0001', nombre: 'Aceite de oliva', cantidad: 2, precio: 12.10, descuento: 0, iva: 21, total: 24.20 }]

  const resultado = ventasModule.guardarVenta(lineas, 1, 'TICKET', null, 0)

  assert.equal(resultado.ok, true)
  assert.equal(resultado.totalVenta, 24.20)
  // Base imponible = 24.20 / 1.21 = 20.00 ; IVA = 4.20
  assert.equal(resultado.venta.base_imponible, 20.00)
  assert.equal(resultado.venta.total_iva, 4.20)
})

test('guardarVenta: aplica el descuento automático del cliente cuando no hay canje de puntos', async () => {
  const { db, ventasModule } = await prepararEntorno()
  const clienteId = db.exec("SELECT id_cliente FROM CLIENTES WHERE nombre = 'Cliente Fiel'")[0].values[0][0]

  const lineas = [{ id_producto: 1, codigo: 'AV0001', nombre: 'Aceite de oliva', cantidad: 1, precio: 12.10, descuento: 10, iva: 21, total: 10.89 }]
  const cliente = { id_cliente: clienteId, nombre: 'Cliente Fiel', descuento: 10 }

  const resultado = ventasModule.guardarVenta(lineas, 1, 'TICKET', cliente, 0)

  assert.equal(resultado.venta.descuento_cliente_porcentaje, 10)
  assert.ok(resultado.venta.descuento_cliente_euros > 0, 'debe reflejar algún descuento en euros')
})

test('guardarVenta: genera puntos de fidelización según la configuración (euros por punto)', async () => {
  const { db, ventasModule } = await prepararEntorno()
  db.run("UPDATE CONFIGURACION SET puntos_euros_por_punto = 10 WHERE id_configuracion = 1")
  const clienteId = db.exec("SELECT id_cliente FROM CLIENTES WHERE nombre = 'Cliente Fiel'")[0].values[0][0]

  // Venta de 30€ con 10€ por punto -> 3 puntos ganados
  const lineas = [{ id_producto: 1, codigo: 'AV0001', nombre: 'Aceite de oliva', cantidad: 1, precio: 30, descuento: 0, iva: 0, total: 30 }]
  const cliente = { id_cliente: clienteId, nombre: 'Cliente Fiel', descuento: 0 }

  const resultado = ventasModule.guardarVenta(lineas, 1, 'TICKET', cliente, 0)

  assert.equal(resultado.puntosGanados, 3)
})

test('guardarVenta: el canje de puntos aplica un descuento y desactiva el descuento automático del cliente', async () => {
  const { db, ventasModule } = await prepararEntorno()
  db.run("UPDATE CONFIGURACION SET puntos_valor_canje = 5 WHERE id_configuracion = 1")
  const clienteId = db.exec("SELECT id_cliente FROM CLIENTES WHERE nombre = 'Cliente Fiel'")[0].values[0][0]

  const lineas = [{ id_producto: 1, codigo: 'AV0001', nombre: 'Aceite de oliva', cantidad: 1, precio: 30, descuento: 0, iva: 0, total: 30 }]
  const cliente = { id_cliente: clienteId, nombre: 'Cliente Fiel', descuento: 10 }

  // Canjear 100 puntos = 5€ de descuento (según puntos_valor_canje)
  const resultado = ventasModule.guardarVenta(lineas, 1, 'TICKET', cliente, 100)

  assert.equal(resultado.descuentoPuntosEuros, 5)
  assert.equal(resultado.venta.descuento_cliente_porcentaje, 0, 'el descuento automático debe desactivarse al canjear puntos')
  assert.equal(resultado.totalVenta, 25, '30€ - 5€ de canje = 25€')
})

test('REGRESIÓN — id_producto: usa el id real de la línea, no un valor fijo', async () => {
  // Este test existe porque hasta hace poco el código guardaba SIEMPRE
  // id_producto = 1 para cualquier venta cobrada normalmente, sin importar
  // qué producto se vendiera de verdad (ver informe, hallazgo H-2).
  const { db, ventasModule } = await prepararEntorno()
  db.run("INSERT INTO PRODUCTOS (codigo, nombre, familia, tipo_venta, precio_venta, id_iva, activo) VALUES ('AV0099', 'Miel cruda', 'ALIMENTACION', 'UNIDAD', 6.20, 3, 1)")
  const idMiel = db.exec("SELECT id_producto FROM PRODUCTOS WHERE codigo = 'AV0099'")[0].values[0][0]
  assert.notEqual(idMiel, 1, 'la prueba solo vale si el producto de ejemplo NO tiene id=1')

  const lineas = [{ id_producto: idMiel, codigo: 'AV0099', nombre: 'Miel cruda', cantidad: 1, precio: 6.20, descuento: 0, iva: 0, total: 6.20 }]
  ventasModule.guardarVenta(lineas, 1, 'TICKET', null, 0)

  const guardado = db.exec("SELECT id_producto FROM LINEAS_VENTA WHERE codigo_producto = 'AV0099'")[0].values[0][0]
  assert.equal(guardado, idMiel, 'debe guardar el id_producto real de la miel, no un valor fijo')
})

test('REGRESIÓN — id_producto: si la línea no trae el id, se resuelve por código en vez de usar un valor fijo', async () => {
  const { db, ventasModule } = await prepararEntorno()
  const idAceite = db.exec("SELECT id_producto FROM PRODUCTOS WHERE codigo = 'AV0001'")[0].values[0][0]

  // Línea SIN id_producto (como si viniera de una vía antigua que no lo pasara)
  const lineas = [{ codigo: 'AV0001', nombre: 'Aceite de oliva', cantidad: 1, precio: 8.50, descuento: 0, iva: 0, total: 8.50 }]
  ventasModule.guardarVenta(lineas, 1, 'TICKET', null, 0)

  const guardado = db.exec("SELECT id_producto FROM LINEAS_VENTA WHERE codigo_producto = 'AV0001'")[0].values[0][0]
  assert.equal(guardado, idAceite, 'debe resolver el id_producto real buscando por código')
})

test('numero_documento: dos ventas seguidas obtienen números consecutivos distintos', async () => {
  const { ventasModule } = await prepararEntorno()
  const lineas = [{ id_producto: 1, codigo: 'AV0001', nombre: 'Aceite de oliva', cantidad: 1, precio: 8.50, descuento: 0, iva: 0, total: 8.50 }]

  const venta1 = ventasModule.guardarVenta(lineas, 1, 'TICKET', null, 0)
  const venta2 = ventasModule.guardarVenta(lineas, 1, 'TICKET', null, 0)

  assert.notEqual(venta1.numeroDocumento, venta2.numeroDocumento)
  assert.equal(venta1.numeroDocumento, 'T-0001')
  assert.equal(venta2.numeroDocumento, 'T-0002')
})
