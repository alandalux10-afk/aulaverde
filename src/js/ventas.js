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
// cliente (opcional): { id_cliente, nombre, nif, descuento }
// puntosCanjear (opcional): cantidad de puntos que el cliente canjea como descuento en esta venta
function guardarVenta(lineas, formaPago, tipoDocumento, cliente, puntosCanjear) {
  const db = getDB()

  const ahora = new Date()
  const fecha = ahora.toISOString().split('T')[0]
  const hora = ahora.toTimeString().split(' ')[0]
  const numeroDocumento = generarNumeroDocumento(tipoDocumento)

  const idCliente = cliente && cliente.id_cliente ? cliente.id_cliente : null
  const nombreCliente = cliente && cliente.nombre ? cliente.nombre : 'Cliente contado'
  const nifCliente = cliente && cliente.nif ? cliente.nif : null
  const puntosACanjear = idCliente && puntosCanjear ? parseInt(puntosCanjear) : 0

  // Calcular totales de las líneas (sin descuento de puntos todavía)
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

  // Descuento automático por % de cliente, calculado ya dentro de las líneas (informativo para el ticket)
  const descuentoClientePorcentaje = (idCliente && cliente.descuento > 0 && puntosACanjear === 0) ? cliente.descuento : 0
  const descuentoClienteEuros = descuentoClientePorcentaje > 0 ? totalDescuento : 0

  // Aplicar descuento por canje de puntos (MVP v2.0 - Fase 2)
  // El descuento se resta del total y de la base imponible (simplificado, sin repartir por tipo de IVA)
  let descuentoPuntosEuros = 0
  if (puntosACanjear > 0) {
    const cfgPuntos = db.exec('SELECT puntos_valor_canje FROM CONFIGURACION WHERE id_configuracion = 1')
    const valorCanje = cfgPuntos.length && cfgPuntos[0].values.length ? cfgPuntos[0].values[0][0] : 5
    descuentoPuntosEuros = Number(((puntosACanjear / 100) * valorCanje).toFixed(2))
    if (descuentoPuntosEuros > totalVenta) descuentoPuntosEuros = totalVenta

    totalVenta = Number((totalVenta - descuentoPuntosEuros).toFixed(2))
    baseImponible = Number((baseImponible - descuentoPuntosEuros).toFixed(2))
    totalDescuento = Number((totalDescuento + descuentoPuntosEuros).toFixed(2))
  }

  // Insertar cabecera de venta
  db.run(`
    INSERT INTO VENTAS (
      numero_documento, fecha, hora, cliente, nif_cliente, tipo_documento,
      id_forma_pago, estado, base_imponible, total_iva,
      total_descuento, total_venta, id_cliente
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    numeroDocumento, fecha, hora, nombreCliente, nifCliente, tipoDocumento,
    formaPago, 'COBRADO', baseImponible, totalIva,
    totalDescuento, totalVenta, idCliente
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

  // Canje de puntos: registrar movimiento negativo (MVP v2.0 - Fase 2)
  if (puntosACanjear > 0) {
    db.run(
      'INSERT INTO MOVIMIENTOS_PUNTOS (id_cliente, id_venta, tipo, puntos, descripcion) VALUES (?, ?, ?, ?, ?)',
      [idCliente, idVenta, 'CANJEADO', -puntosACanjear, 'Canje en venta ' + numeroDocumento]
    )
  }

  // Generar puntos de fidelización si la venta tiene cliente asociado (MVP v2.0 - Fase 2)
  // Solo se generan puntos sobre ventas sin canje en la misma operación
  let puntosGanados = 0
  if (idCliente && puntosACanjear === 0) {
    const cfgPuntos = db.exec('SELECT puntos_euros_por_punto FROM CONFIGURACION WHERE id_configuracion = 1')
    const eurosPorPunto = cfgPuntos.length && cfgPuntos[0].values.length ? cfgPuntos[0].values[0][0] : 10
    puntosGanados = Math.floor(totalVenta / eurosPorPunto)
    if (puntosGanados > 0) {
      db.run(
        'INSERT INTO MOVIMIENTOS_PUNTOS (id_cliente, id_venta, tipo, puntos, descripcion) VALUES (?, ?, ?, ?, ?)',
        [idCliente, idVenta, 'GANADO', puntosGanados, 'Compra ' + numeroDocumento]
      )
    }
  }

  // Saldo de puntos actualizado del cliente, para mostrar en el ticket
  let puntosSaldo = null
  if (idCliente) {
    const saldoResult = db.exec(`SELECT COALESCE(SUM(puntos), 0) FROM MOVIMIENTOS_PUNTOS WHERE id_cliente = ${idCliente}`)
    puntosSaldo = saldoResult.length && saldoResult[0].values.length ? saldoResult[0].values[0][0] : 0
  }

  guardarDB()

  const ventaGuardada = {
    numero_documento: numeroDocumento,
    fecha,
    hora,
    cliente: nombreCliente,
    total_venta: totalVenta,
    base_imponible: baseImponible,
    total_iva: totalIva,
    forma_pago: formaPago === 1 ? 'Efectivo' : 'Tarjeta',
    descuento_cliente_porcentaje: descuentoClientePorcentaje,
    descuento_cliente_euros: descuentoClienteEuros,
    puntos_canjeados: puntosACanjear,
    descuento_puntos_euros: descuentoPuntosEuros,
    puntos_ganados: puntosGanados,
    puntos_saldo: puntosSaldo
  }
  const lineasGuardadas = lineas.map((l, i) => ({ nombre_producto: l.nombre, cantidad: l.cantidad, total_linea: l.total }))
  return { ok: true, numeroDocumento, totalVenta, venta: ventaGuardada, lineas: lineasGuardadas, puntosGanados, puntosCanjeados: puntosACanjear, descuentoPuntosEuros }
}

module.exports = { guardarVenta }
