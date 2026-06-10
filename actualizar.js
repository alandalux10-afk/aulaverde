const fs = require('fs')

let contenido = fs.readFileSync('src/js/tpv.js', 'utf8')

contenido = contenido.replace(
  "  lineas.forEach(linea => {\r\n    const bruto = linea.cantidad * linea.precio\r\n    const descuento = bruto * (linea.descuento / 100)\r\n    const baseLinea = bruto - descuento\r\n    const ivaLinea = baseLinea * (linea.iva / 100)\r\n\r\n    base += baseLinea\r\n    totalIva += ivaLinea\r\n    totalDescuento += descuento\r\n    totalVenta += baseLinea + ivaLinea\r\n  })",
  "  lineas.forEach(linea => {\r\n    const bruto = linea.cantidad * linea.precio\r\n    const descuento = bruto * (linea.descuento / 100)\r\n    const totalConIva = bruto - descuento\r\n    const divisor = 1 + linea.iva / 100\r\n    const baseLinea = totalConIva / divisor\r\n    const ivaLinea = totalConIva - baseLinea\r\n\r\n    base += baseLinea\r\n    totalIva += ivaLinea\r\n    totalDescuento += descuento / divisor\r\n    totalVenta += totalConIva\r\n  })"
)

fs.writeFileSync('src/js/tpv.js', contenido)
console.log('Cambios aplicados: ' + (contenido.includes('totalConIva') ? 'OK' : 'FALLIDO'))
