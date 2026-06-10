const fs = require('fs')

let contenido = fs.readFileSync('src/js/tpv.js', 'utf8')

contenido = contenido.replace(
  "  cerrarCobro()\r\n  alert('Venta cobrada correctamente')\r\n  lineas = []\r\n  lineaSeleccionada = null\r\n  renderizarLineas()",
  `  const resultado = await ipcRenderer.invoke('guardar-venta', lineas, formaPagoSeleccionada, 'TICKET')
  cerrarCobro()
  if (resultado.ok) {
    alert('Venta cobrada correctamente\\nDocumento: ' + resultado.numeroDocumento)
  }
  lineas = []
  lineaSeleccionada = null
  renderizarLineas()`
)

fs.writeFileSync('src/js/tpv.js', contenido)
console.log('Cambios aplicados: ' + (contenido.includes('guardar-venta') ? 'OK' : 'FALLIDO'))
