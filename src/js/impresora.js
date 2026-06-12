const path = require('path')
const fs = require('fs')
const { exec } = require('child_process')

async function imprimirTicket(venta, lineas, configuracion) {
  try {
    const ESC = String.fromCharCode(27)
    const GS = String.fromCharCode(29)

    let ticket = ''

    // Inicializar impresora
    ticket += ESC + '@'

    // Centrar e imprimir nombre tienda
    ticket += ESC + 'a' + String.fromCharCode(1)
    ticket += ESC + '!' + String.fromCharCode(16)
    ticket += (configuracion.nombre_tienda || 'Aula Verde') + '\n'
    ticket += ESC + '!' + String.fromCharCode(0)

    if (configuracion.direccion) ticket += configuracion.direccion + '\n'
    if (configuracion.telefono) ticket += 'Tel: ' + configuracion.telefono + '\n'
    ticket += 'NIF: ' + (configuracion.nif_vendedor || '') + '\n'

    // Línea separadora
    ticket += '--------------------------------\n'

    // Alinear izquierda
    ticket += ESC + 'a' + String.fromCharCode(0)
    ticket += 'Ticket: ' + venta.numero_documento + '\n'
    ticket += 'Fecha:  ' + venta.fecha + ' ' + venta.hora + '\n'
    ticket += 'Cliente: ' + (venta.cliente || 'Cliente contado') + '\n'
    ticket += '--------------------------------\n'

    lineas.forEach(l => {
      const nombre = (l.nombre_producto || '').substring(0, 24)
      const cantidad = String(l.cantidad).padStart(3)
      const total = Number(l.total_linea).toFixed(2).padStart(8)
      ticket += nombre.padEnd(24) + cantidad + total + '\n'
    })

    ticket += '--------------------------------\n'

    // Total en negrita
    ticket += ESC + 'a' + String.fromCharCode(2)
    ticket += ESC + '!' + String.fromCharCode(16)
    ticket += 'TOTAL: ' + Number(venta.total_venta).toFixed(2) + ' EUR\n'
    ticket += ESC + '!' + String.fromCharCode(0)
    ticket += ESC + 'a' + String.fromCharCode(0)
    ticket += 'Base: ' + Number(venta.base_imponible).toFixed(2) + '  IVA: ' + Number(venta.total_iva).toFixed(2) + '\n'
    ticket += '--------------------------------\n'
    ticket += 'Pago: ' + venta.forma_pago + '\n'
    ticket += '--------------------------------\n'
    ticket += ESC + 'a' + String.fromCharCode(1)
    ticket += 'Gracias por su compra\n'
    ticket += 'www.aulaverde.es\n'
    ticket += '\n\n\n'

    // Corte automático
    ticket += GS + 'V' + String.fromCharCode(1)

    const tmpPath = path.join(__dirname, '../../data/ticket.bin')
    fs.writeFileSync(tmpPath, ticket, 'binary')

    await new Promise((resolve, reject) => {
      exec('copy /b "' + tmpPath + '" LPT1', (err, stdout, stderr) => {
        if (err) reject(err)
        else resolve()
      })
    })

    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
}

module.exports = { imprimirTicket }
