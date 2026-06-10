const fs = require('fs')

let contenido = fs.readFileSync('src/js/tpv.js', 'utf8')

// Normalizar saltos de línea
contenido = contenido.replace(/\r\n/g, '\n')

// Cambio 1: calcularTotalLinea sin IVA
contenido = contenido.replace(
  `function calcularTotalLinea(linea) {\n  const base = linea.cantidad * linea.precio\n  const descuento = base * (linea.descuento / 100)\n  const baseConDto = base - descuento\n  const iva = baseConDto * (linea.iva / 100)\n  return Number((baseConDto + iva).toFixed(2))\n}`,
  `function calcularTotalLinea(linea) {\n  const total = linea.cantidad * linea.precio * (1 - linea.descuento / 100)\n  return Number(total.toFixed(2))\n}`
)

// Cambio 2: recalcularTotales descomponiendo IVA
contenido = contenido.replace(
  `  lineas.forEach(linea => {\n    const bruto = linea.cantidad * linea.precio\n    const descuento = bruto * (linea.descuento / 100)\n    const baseLinea = bruto - descuento\n    const ivaLinea = baseLinea * (linea.iva / 100)\n\n    base += baseLinea\n    totalIva += ivaLinea\n    totalDescuento += descuento\n    totalVenta += baseLinea + ivaLinea\n  })`,
  `  lineas.forEach(linea => {\n    const bruto = linea.cantidad * linea.precio\n    const descuento = bruto * (linea.descuento / 100)\n    const totalConIva = bruto - descuento\n    const divisor = 1 + linea.iva / 100\n    const baseLinea = totalConIva / divisor\n    const ivaLinea = totalConIva - baseLinea\n\n    base += baseLinea\n    totalIva += ivaLinea\n    totalDescuento += descuento / divisor\n    totalVenta += totalConIva\n  })`
)

fs.writeFileSync('src/js/tpv.js', contenido)
console.log('Cambios aplicados: ' + (contenido.includes('const total = linea.cantidad') ? 'OK' : 'FALLIDO'))
