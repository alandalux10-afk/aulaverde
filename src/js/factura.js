const path = require('path')
const fs = require('fs')
const { BrowserWindow } = require('electron')

function imprimirFactura(venta, lineas, configuracion) {
  return new Promise((resolve, reject) => {
    try {
      const logoBase64 = fs.readFileSync(path.join(__dirname, '../logo.png')).toString('base64')

      let lineasHtml = ''
      lineas.forEach((l, i) => {
        const baseLinea = (l.total_linea / (1 + l.porcentaje_iva / 100)).toFixed(2)
        const ivaLinea = (l.total_linea - baseLinea).toFixed(2)
        lineasHtml += `
          <tr>
            <td>${i + 1}</td>
            <td>${l.codigo_producto || ''}</td>
            <td>${l.nombre_producto || ''}</td>
            <td style="text-align:center">${l.cantidad}</td>
            <td style="text-align:right">${Number(l.precio_unitario).toFixed(2)} €</td>
            <td style="text-align:center">${l.descuento || 0}%</td>
            <td style="text-align:center">${l.porcentaje_iva}%</td>
            <td style="text-align:right">${Number(l.total_linea).toFixed(2)} €</td>
          </tr>`
      })

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 15mm 15mm 15mm 15mm; size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #222; }

  .cabecera { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .logo { width: 120px; }
  .datos-empresa { text-align: right; font-size: 11px; line-height: 1.6; }
  .datos-empresa h2 { font-size: 15px; color: #2d6a2d; margin-bottom: 4px; }

  .titulo-factura { text-align: center; margin: 16px 0; }
  .titulo-factura h1 { font-size: 20px; color: #2d6a2d; letter-spacing: 2px; }
  .titulo-factura p { font-size: 11px; color: #666; margin-top: 4px; }

  .info-venta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 11px; }
  .info-venta div { line-height: 1.8; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
  thead tr { background: #2d6a2d; color: white; }
  thead th { padding: 6px 8px; text-align: left; }
  tbody tr:nth-child(even) { background: #f5f5f5; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #eee; }

  .totales { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .totales-tabla { width: 280px; font-size: 11px; }
  .totales-tabla tr td { padding: 4px 8px; }
  .totales-tabla tr td:last-child { text-align: right; font-weight: bold; }
  .totales-tabla .total-final { background: #2d6a2d; color: white; font-size: 13px; }
  .totales-tabla .total-final td { padding: 6px 8px; }

  .pie { border-top: 1px solid #ccc; padding-top: 10px; text-align: center; font-size: 10px; color: #888; margin-top: 20px; }
</style>
</head>
<body>

  <div class="cabecera">
    <img class="logo" src="data:image/png;base64,${logoBase64}">
    <div class="datos-empresa">
      <h2>${configuracion.nombre_tienda || 'Aula Verde'}</h2>
      <div>${configuracion.razon_social || ''}</div>
      <div>${configuracion.direccion || ''}</div>
      <div>Tel: ${configuracion.telefono || ''}</div>
      <div>NIF: ${configuracion.nif_vendedor || ''}</div>
      <div>${configuracion.email || ''}</div>
    </div>
  </div>

  <div class="titulo-factura">
    <h1>FACTURA SIMPLIFICADA</h1>
    <p>Documento: ${venta.numero_documento}</p>
  </div>

  <div class="info-venta">
    <div>
      <strong>Fecha:</strong> ${venta.fecha}<br>
      <strong>Hora:</strong> ${venta.hora}<br>
      <strong>Forma de pago:</strong> ${venta.forma_pago}
    </div>
    <div>
      <strong>Cliente:</strong> ${venta.cliente || 'Cliente contado'}<br>
      <strong>NIF cliente:</strong> ${venta.nif_cliente || '—'}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Nº</th>
        <th>Código</th>
        <th>Descripción</th>
        <th style="text-align:center">Cant.</th>
        <th style="text-align:right">Precio</th>
        <th style="text-align:center">Dto.</th>
        <th style="text-align:center">IVA</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineasHtml}
    </tbody>
  </table>

  <div class="totales">
    <table class="totales-tabla">
      <tr><td>Base imponible:</td><td>${Number(venta.base_imponible).toFixed(2)} €</td></tr>
      <tr><td>Total IVA:</td><td>${Number(venta.total_iva).toFixed(2)} €</td></tr>
      <tr><td>Descuentos:</td><td>${Number(venta.total_descuento).toFixed(2)} €</td></tr>
      <tr class="total-final"><td>TOTAL:</td><td>${Number(venta.total_venta).toFixed(2)} €</td></tr>
    </table>
  </div>

  <div class="pie">
    ${configuracion.nombre_tienda || 'Aula Verde'} · ${configuracion.direccion || ''} · Tel: ${configuracion.telefono || ''} · ${configuracion.email || ''}
  </div>

</body>
</html>`

      const tmpPath = path.join(__dirname, '../../data/factura_tmp.html')
      fs.writeFileSync(tmpPath, html)

      const win = new BrowserWindow({
        width: 794,
        height: 1123,
        show: false,
        webPreferences: { nodeIntegration: false }
      })

      win.loadFile(tmpPath)
      win.webContents.on('did-finish-load', () => {
        setTimeout(() => {
          win.webContents.print({
            silent: true,
            printBackground: true,
            margins: { marginType: 'none' },
            pageSize: 'A4'
          }, (success, reason) => {
            win.close()
            if (success) resolve({ ok: true })
            else resolve({ ok: false, mensaje: reason })
          })
        }, 800)
      })
    } catch (e) {
      reject(e)
    }
  })
}

module.exports = { imprimirFactura }
