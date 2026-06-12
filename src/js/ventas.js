const { getDB, guardarDB } = require('./database')

// Generar número de documento automático
function generarNumeroDocumento(tipo) {
  const db = getDB()
  const prefijo = tipo === 'TICKET' ? 'T' : 'FS'
  const resultado = db.exec(`
    SELECT numero_documento FROM VENTAS
    WHERE tipo_documento = '${tipo}'
    ORDER BY id_venta DESC LIMIT 1
  `)

  let numero = 1
  if (resultado.length && resultado[0].values.length) {
    const ultimo = resultado[0].values[0][0]
    const partes = ultimo.split('-')
    numero = parseInt(partes[1]) + 1
  }

  return `${prefijo}-${String(numero).padStart(4, '0')}`
}
// Guardar venta completa en la base de datos
function guardarVenta(lineas, formaPago, tipoDocumento) {
  const db = getDB()

  const ahora = new Date()
  const fecha = ahora.toISOString().split('T')[0]
  const hora = ahora.toTimeString().split(' ')[0]
  const numeroDocumento = generarNumeroDocumento(tipoDocumento)

  // Calcular totales
  let baseImponible = 0
  let totalIva = 0
  let totalDescuento = 0
  let totalVenta = 0

  lineas.forEach(linea => {
    const bruto = linea.cantidad * linea.precio
    const descuento = bruto * (linea.descuento / 100)                                   
    const totalConIva = bruto - descuento
    const divisor = 1 + linea.iva / 100
    const baseLinea = totalConIva / divisor
    const ivaLinea = totalConIva - baseLinea        

    baseImponible += baseLinea
    totalIva += ivaLinea
    totalDescuento += descuento / divisor
    totalVenta += totalConIva
  })    
  baseImponible = Number(baseImponible.toFixed(2))
  totalIva = Number(totalIva.toFixed(2))
  totalDescuento = Number(totalDescuento.toFixed(2))
  totalVenta = Number(totalVenta.toFixed(2))

  // Insertar cabecera de venta
  db.run(`
    INSERT INTO VENTAS (
      numero_documento, fecha, hora, cliente, tipo_documento,
      id_forma_pago, estado, base_imponible, total_iva,
      total_descuento, total_venta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    numeroDocumento, fecha, hora, 'Cliente contado', tipoDocumento,
    formaPago, 'COBRADO', baseImponible, totalIva,
    totalDescuento, totalVenta
  ])

  const idVenta = db.exec('SELECT last_insert_rowid()')[0].values[0][0]

  lineas.forEach((linea, index) => {
    const totalConIva = linea.total
    const divisor = 1 + linea.iva / 100
    const baseLinea = totalConIva / divisor
    const ivaLinea = totalConIva - baseLinea

    db.run(`
      INSERT INTO LINEAS_VENTA (
        id_venta, numero_linea, id_producto, codigo_producto,
        nombre_producto, cantidad, precio_unitario, descuento,
        porcentaje_iva, importe_iva, total_linea
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      idVenta, index + 1, 1, linea.codigo,
      linea.nombre, linea.cantidad, linea.precio, linea.descuento,
      linea.iva, Number(ivaLinea.toFixed(2)), totalConIva
    ])
  })

  guardarDB()

  const ventaGuardada = { numero_documento: numeroDocumento, fecha, hora, cliente: 'Cliente contado', total_venta: totalVenta, base_imponible: baseImponible, total_iva: totalIva, forma_pago: formaPago === 1 ? 'Efectivo' : 'Tarjeta' }
  const lineasGuardadas = lineas.map((l, i) => ({ nombre_producto: l.nombre, cantidad: l.cantidad, total_linea: l.total }))
  return { ok: true, numeroDocumento, totalVenta, venta: ventaGuardada, lineas: lineasGuardadas }
}

module.exports = { guardarVenta }
