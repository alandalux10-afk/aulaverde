const path = require('path')
const fs = require('fs')
const { BrowserWindow } = require('electron')

function generarHtmlTicket(venta, lineas, configuracion) {
  const logoBase64 = fs.readFileSync(path.join(__dirname, '../logo.png')).toString('base64')
  let lineasHtml = ''
  lineas.forEach(l => {
    lineasHtml += '<tr><td style="width:60%">' + (l.nombre_producto || '').substring(0, 22) + '</td><td style="text-align:center;width:15%">' + l.cantidad + '</td><td style="text-align:right;width:25%">' + Number(l.total_linea).toFixed(2) + '</td></tr>'
  })

  // Bloque de descuentos (MVP v2.0 - Fase 1 y 2): descuento por % de cliente y/o canje de puntos
  let descuentosHtml = ''
  if (venta.descuento_cliente_porcentaje && venta.descuento_cliente_euros) {
    descuentosHtml += '<div class="sub">Descuento cliente (' + venta.descuento_cliente_porcentaje + '%): -' + Number(venta.descuento_cliente_euros).toFixed(2) + '</div>'
  }
  if (venta.puntos_canjeados && venta.descuento_puntos_euros) {
    descuentosHtml += '<div class="sub">Descuento puntos (' + venta.puntos_canjeados + ' pts): -' + Number(venta.descuento_puntos_euros).toFixed(2) + '</div>'
  }

  // Bloque de información de puntos al final del ticket
  let puntosHtml = ''
  if (venta.puntos_canjeados || venta.puntos_ganados) {
    puntosHtml += '<hr>'
    if (venta.puntos_canjeados) {
      puntosHtml += '<div class="sub">Puntos canjeados: ' + venta.puntos_canjeados + '</div>'
    }
    if (venta.puntos_ganados) {
      puntosHtml += '<div class="sub">Puntos ganados: ' + venta.puntos_ganados + '</div>'
    }
    if (venta.puntos_saldo !== undefined && venta.puntos_saldo !== null) {
      puntosHtml += '<div class="sub">Puntos saldo actual: ' + venta.puntos_saldo + '</div>'
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@page { margin: 0; size: 80mm 297mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: monospace; font-size: 11px; width: 68mm; padding: 0 1mm; margin: 0; font-weight: bold; -webkit-font-smoothing: none; }
img { width: 55mm; display: block; margin: 0 auto 3px; }
h2 { text-align: center; font-size: 12px; margin: 2px 0; }
.c { text-align: center; font-size: 10px; }
hr { border: none; border-top: 1px dashed #000; margin: 3px 0; }
table { width: 100%; border-collapse: collapse; font-size: 10px; }
td { padding: 1px 0; vertical-align: top; }
.tot { font-size: 13px; font-weight: bold; text-align: right; margin: 3px 0; }
.sub { font-size: 10px; text-align: left; }
.pie { text-align: center; font-size: 10px; margin-top: 4px; }
</style>
</head>
<body>
<img src="data:image/png;base64,${logoBase64}">
<h2>${configuracion.nombre_tienda || 'Aula Verde'}</h2>
<div class="c">${configuracion.direccion || ''}</div>
<div class="c">Tel: ${configuracion.telefono || ''}</div>
<div class="c">NIF: ${configuracion.nif_vendedor || ''}</div>
<hr>
<div>Ticket: ${venta.numero_documento}</div>
<div>Fecha: ${venta.fecha} ${venta.hora}</div>
<div>Cliente: ${venta.cliente || 'Cliente contado'}</div>
<hr>
<table>
  <tr><th style="text-align:left">Producto</th><th>Ud.</th><th style="text-align:right">EUR</th></tr>
  ${lineasHtml}
</table>
<hr>
${descuentosHtml}
<div class="tot">TOTAL: ${Number(venta.total_venta).toFixed(2)} EUR</div>
<div class="sub">Base: ${Number(venta.base_imponible).toFixed(2)} &nbsp; IVA: ${Number(venta.total_iva).toFixed(2)}</div>
<hr>
<div>Pago: ${venta.forma_pago}</div>
${puntosHtml}
<hr>
<div class="pie">Gracias por su compra</div>
<div class="pie">www.aulaverde.es</div>
</body>
</html>`
}

function imprimirTicket(venta, lineas, configuracion) {
  return new Promise((resolve, reject) => {
    try {
      const html = generarHtmlTicket(venta, lineas, configuracion)
      const tmpPath = path.join(__dirname, '../../data/ticket_tmp.html')
      fs.writeFileSync(tmpPath, html)
      const win = new BrowserWindow({
        width: 320,
        height: 900,
        show: false,
        webPreferences: { nodeIntegration: false }
      })
      win.loadFile(tmpPath)
      win.webContents.on('did-finish-load', () => {
        setTimeout(() => {
          win.webContents.print({
            silent: true,
            printBackground: false,
            deviceName: 'appPOS80AMUSE',
            margins: { marginType: 'none' },
            pageSize: { width: 80000, height: 297000 }
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

module.exports = { imprimirTicket, generarHtmlTicket }