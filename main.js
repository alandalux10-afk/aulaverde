const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { inicializarDB, getDB } = require('./src/js/database')
const { importarProductos } = require('./src/js/importar-productos')
const { guardarVenta } = require('./src/js/ventas')
const { imprimirTicket } = require('./src/js/impresora')
const { imprimirFactura } = require('./src/js/factura')

let idVentaModificar = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Aula Verde TPV',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  win.loadFile('src/html/tpv.html')

  win.on('close', (e) => {
    e.preventDefault()
    const { dialog } = require('electron')
    dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Sí, hacer copia', 'No, salir sin copia', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
      title: 'Copia de seguridad',
      message: '¿Deseas hacer una copia de seguridad antes de cerrar?',
      detail: 'Se guardará en Google Drive con la fecha de hoy.'
    }).then(({ response }) => {
      if (response === 2) return
      if (response === 0) {
        const fs = require('fs')
        const pathMod = require('path')
        const ahora = new Date()
        const año = ahora.getFullYear()
        const mes = String(ahora.getMonth() + 1).padStart(2, '0')
        const dia = String(ahora.getDate()).padStart(2, '0')
        const sufijo = `${año}${mes}${dia}`
        const origen = pathMod.join(__dirname, 'data', 'aulaverde.db')
        const carpetaDestino = 'G:\\Mi unidad\\AulaVerde Backups'
        const destino = pathMod.join(carpetaDestino, `aulaverde_${sufijo}.db`)
        try {
          if (!fs.existsSync(carpetaDestino)) {
            fs.mkdirSync(carpetaDestino, { recursive: true })
          }
          fs.copyFileSync(origen, destino)
          dialog.showMessageBox({
            type: 'info',
            title: 'Copia guardada',
            message: '✅ Copia de seguridad guardada correctamente.',
            detail: destino
          }).then(() => {
            win.destroy()
          })
        } catch (err) {
          dialog.showMessageBox({
            type: 'error',
            title: 'Error',
            message: '❌ No se pudo guardar la copia.',
            detail: err.message
          }).then(() => {
            win.destroy()
          })
        }
      } else {
        win.destroy()
      }
    })
  })
}

app.whenReady().then(async () => {
  await inicializarDB()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('importar-productos', () => {
  return importarProductos()
})

ipcMain.handle('buscar-productos', (event, texto) => {
  const db = getDB()
  const resultados = db.exec(`
    SELECT p.codigo, p.nombre, p.precio_venta, t.porcentaje as porcentaje_iva
    FROM PRODUCTOS p
    JOIN TIPOS_IVA t ON p.id_iva = t.id_iva
    WHERE p.activo = 1 AND (p.nombre LIKE '%${texto}%' OR p.codigo LIKE '%${texto}%')
    LIMIT 10
  `)
  if (!resultados.length) return []
  const cols = resultados[0].columns
  return resultados[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('guardar-venta', (event, lineas, formaPago, tipoDocumento) => {
  return guardarVenta(lineas, formaPago, tipoDocumento)
})

ipcMain.handle('abrir-consultas', () => {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    title: 'Consultas - Aula Verde',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  win.loadFile('src/html/consultas.html')
})

ipcMain.handle('obtener-ventas', (event, desde, hasta) => {
  const db = getDB()
  const sql = "SELECT v.id_venta, v.numero_documento, v.fecha, v.hora, v.cliente, v.estado, v.tipo_documento, v.total_venta, f.nombre as forma_pago FROM VENTAS v JOIN FORMAS_PAGO f ON v.id_forma_pago = f.id_forma_pago WHERE v.fecha >= '" + desde + "' AND v.fecha <= '" + hasta + "' ORDER BY v.id_venta DESC"
  const resultados = db.exec(sql)
  if (!resultados.length) return []
  const cols = resultados[0].columns
  return resultados[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('eliminar-venta', (event, idVenta) => {
  const db = getDB()
  const { guardarDB } = require('./src/js/database')
  db.run('DELETE FROM LINEAS_VENTA WHERE id_venta = ?', [idVenta])
  db.run('DELETE FROM VENTAS WHERE id_venta = ?', [idVenta])
  guardarDB()
  return { ok: true }
})

ipcMain.handle('abrir-resumen', () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Resumen - Aula Verde',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  win.loadFile('src/html/resumen.html')
})

ipcMain.handle('obtener-resumen', (event, fecha) => {
  const db = getDB()
  const ventas = db.exec("SELECT v.total_venta, v.estado, f.nombre as forma_pago FROM VENTAS v JOIN FORMAS_PAGO f ON v.id_forma_pago = f.id_forma_pago WHERE v.fecha = '" + fecha + "'")
  let numOperaciones = 0, totalVentas = 0, efectivo = 0, tarjeta = 0, pendientes = 0
  if (ventas.length && ventas[0].values.length) {
    ventas[0].values.forEach(row => {
      const total = row[0], estado = row[1], forma = row[2]
      numOperaciones++
      if (estado === 'COBRADO') {
        totalVentas += total
        if (forma === 'Efectivo') efectivo += total
        else tarjeta += total
      } else {
        pendientes++
      }
    })
  }
  const ticketMedio = numOperaciones > 0 ? totalVentas / numOperaciones : 0
  const top = db.exec("SELECT lv.nombre_producto, SUM(lv.cantidad) as cantidad, SUM(lv.total_linea) as total FROM LINEAS_VENTA lv JOIN VENTAS v ON lv.id_venta = v.id_venta WHERE v.fecha = '" + fecha + "' GROUP BY lv.nombre_producto ORDER BY cantidad DESC LIMIT 5")
  const topProductos = []
  if (top.length && top[0].values.length) {
    top[0].values.forEach(row => topProductos.push({ nombre: row[0], cantidad: row[1], total: row[2] }))
  }
  const beneficioResult = db.exec(`
    SELECT SUM((lv.precio_unitario - COALESCE(p.precio_coste, 0)) * lv.cantidad) as beneficio
    FROM LINEAS_VENTA lv
    JOIN VENTAS v ON lv.id_venta = v.id_venta
    JOIN PRODUCTOS p ON lv.codigo_producto = p.codigo
    WHERE v.fecha = '${fecha}' AND v.estado = 'COBRADO'
  `)
  const beneficio = beneficioResult.length && beneficioResult[0].values[0][0]
    ? beneficioResult[0].values[0][0]
    : 0
  return { numOperaciones, totalVentas, efectivo, tarjeta, ticketMedio, pendientes, topProductos, beneficio }
})

ipcMain.handle('imprimir-ticket', async (event, venta, lineas) => {
  try {
    const db = getDB()
    const cfgResult = db.exec('SELECT * FROM CONFIGURACION WHERE id_configuracion = 1')
    const cfg = {}
    if (cfgResult.length && cfgResult[0].values.length) {
      const cols = cfgResult[0].columns
      cfgResult[0].values[0].forEach((val, i) => cfg[cols[i]] = val)
    }
    return await imprimirTicket(venta, lineas, cfg)
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('imprimir-factura', async (event, venta, lineas) => {
  try {
    const db = getDB()
    const cfgResult = db.exec('SELECT * FROM CONFIGURACION WHERE id_configuracion = 1')
    const cfg = {}
    if (cfgResult.length && cfgResult[0].values.length) {
      const cols = cfgResult[0].columns
      cfgResult[0].values[0].forEach((val, i) => cfg[cols[i]] = val)
    }
    return await imprimirFactura(venta, lineas, cfg)
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('reimprimir-ticket', async (event, idVenta) => {
  try {
    const db = getDB()
    const ventaResult = db.exec(`
      SELECT v.*, f.nombre as forma_pago
      FROM VENTAS v
      JOIN FORMAS_PAGO f ON v.id_forma_pago = f.id_forma_pago
      WHERE v.id_venta = ${idVenta}
    `)
    if (!ventaResult.length) return { ok: false, mensaje: 'Venta no encontrada' }
    const cols = ventaResult[0].columns
    const venta = {}
    ventaResult[0].values[0].forEach((val, i) => venta[cols[i]] = val)
    const lineasResult = db.exec(`SELECT * FROM LINEAS_VENTA WHERE id_venta = ${idVenta}`)
    const lineas = []
    if (lineasResult.length && lineasResult[0].values.length) {
      const lCols = lineasResult[0].columns
      lineasResult[0].values.forEach(row => {
        const linea = {}
        lCols.forEach((col, i) => linea[col] = row[i])
        lineas.push(linea)
      })
    }
    const cfgResult = db.exec('SELECT * FROM CONFIGURACION WHERE id_configuracion = 1')
    const cfg = {}
    if (cfgResult.length && cfgResult[0].values.length) {
      const cCols = cfgResult[0].columns
      cfgResult[0].values[0].forEach((val, i) => cfg[cCols[i]] = val)
    }
    return await imprimirTicket(venta, lineas, cfg)
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('obtener-configuracion', () => {
  const db = getDB()
  const result = db.exec('SELECT * FROM CONFIGURACION WHERE id_configuracion = 1')
  if (!result.length || !result[0].values.length) return null
  const cols = result[0].columns
  const cfg = {}
  result[0].values[0].forEach((val, i) => cfg[cols[i]] = val)
  return cfg
})

ipcMain.handle('guardar-configuracion', (event, datos) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    db.run(
      'UPDATE CONFIGURACION SET nombre_tienda=?, razon_social=?, nif_vendedor=?, direccion=?, telefono=?, email=?, impresora_ticket=?, impresora_factura=?, api_key_anthropic=? WHERE id_configuracion=1',
      [
        datos.nombre_tienda,
        datos.razon_social,
        datos.nif_vendedor,
        datos.direccion,
        datos.telefono,
        datos.email,
        datos.impresora_ticket,
        datos.impresora_factura,
        datos.api_key_anthropic
      ]
    )
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('abrir-configuracion', () => {
  const win = new BrowserWindow({
    width: 680,
    height: 620,
    title: 'Configuración - Aula Verde',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  win.loadFile('src/html/configuracion.html')
})

ipcMain.handle('abrir-modificar-venta', (event, idVenta) => {
  idVentaModificar = idVenta
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    title: 'Modificar venta - Aula Verde',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  win.loadFile('src/html/modificar-venta.html')
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('iniciar-carga', idVentaModificar)
  })
})

ipcMain.handle('obtener-id-venta-modificar', () => {
  return idVentaModificar
})

ipcMain.handle('obtener-venta-detalle', (event, idVenta) => {
  const db = getDB()
  const ventaResult = db.exec(`
    SELECT v.*, f.nombre as forma_pago
    FROM VENTAS v
    JOIN FORMAS_PAGO f ON v.id_forma_pago = f.id_forma_pago
    WHERE v.id_venta = ${idVenta}
  `)
  if (!ventaResult.length) return null
  const vCols = ventaResult[0].columns
  const venta = {}
  ventaResult[0].values[0].forEach((val, i) => venta[vCols[i]] = val)
  const lineasResult = db.exec(`SELECT * FROM LINEAS_VENTA WHERE id_venta = ${idVenta} ORDER BY numero_linea`)
  const lineas = []
  if (lineasResult.length && lineasResult[0].values.length) {
    const lCols = lineasResult[0].columns
    lineasResult[0].values.forEach(row => {
      const l = {}
      lCols.forEach((col, i) => l[col] = row[i])
      lineas.push(l)
    })
  }
  return { venta, lineas }
})

ipcMain.handle('modificar-venta', (event, idVenta, lineas) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    let base = 0, totalIva = 0, totalDto = 0, totalVenta = 0
    lineas.forEach(l => {
      const bruto = l.cantidad * l.precio
      const dto = bruto * (l.descuento / 100)
      const conIva = bruto - dto
      const divisor = 1 + l.iva / 100
      base += conIva / divisor
      totalIva += conIva - conIva / divisor
      totalDto += dto / divisor
      totalVenta += conIva
    })
    db.run(
      'UPDATE VENTAS SET base_imponible=?, total_iva=?, total_descuento=?, total_venta=? WHERE id_venta=?',
      [
        Number(base.toFixed(2)),
        Number(totalIva.toFixed(2)),
        Number(totalDto.toFixed(2)),
        Number(totalVenta.toFixed(2)),
        idVenta
      ]
    )
    db.run('DELETE FROM LINEAS_VENTA WHERE id_venta = ?', [idVenta])
    lineas.forEach((l, i) => {
      const bruto = l.cantidad * l.precio
      const dto = bruto * (l.descuento / 100)
      const conIva = bruto - dto
      const divisor = 1 + l.iva / 100
      const ivaLinea = conIva - conIva / divisor
      db.run(
        'INSERT INTO LINEAS_VENTA (id_venta, numero_linea, id_producto, codigo_producto, nombre_producto, cantidad, precio_unitario, descuento, porcentaje_iva, importe_iva, total_linea) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [idVenta, i + 1, 0, l.codigo, l.nombre, l.cantidad, l.precio, l.descuento, l.iva, Number(ivaLinea.toFixed(2)), Number(conIva.toFixed(2))]
      )
    })
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('obtener-productos-catalogo', (event, filtros) => {
  const db = getDB()
  let sql = `
    SELECT p.id_producto, p.codigo, p.nombre, p.familia, p.tipo_venta,
    p.precio_venta, p.precio_coste, p.activo, p.id_iva, t.porcentaje as porcentaje_iva
    FROM PRODUCTOS p
    JOIN TIPOS_IVA t ON p.id_iva = t.id_iva
    WHERE 1=1
  `
  if (filtros.nombre) sql += ` AND (p.nombre LIKE '%${filtros.nombre}%' OR p.codigo LIKE '%${filtros.nombre}%')`
  if (filtros.familia) sql += ` AND p.familia = '${filtros.familia}'`
  if (filtros.activo !== '') sql += ` AND p.activo = ${filtros.activo}`
  sql += ' ORDER BY p.codigo ASC'
  const result = db.exec(sql)
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('crear-producto', (event, datos) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    const existe = db.exec(`SELECT id_producto FROM PRODUCTOS WHERE codigo = '${datos.codigo}'`)
    if (existe.length && existe[0].values.length) {
      return { ok: false, mensaje: 'Ya existe un producto con el código ' + datos.codigo }
    }
    db.run(
      'INSERT INTO PRODUCTOS (codigo, nombre, familia, tipo_venta, precio_venta, precio_coste, id_iva, activo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      [datos.codigo, datos.nombre, datos.familia, datos.tipo_venta, datos.precio_venta, datos.precio_coste, datos.id_iva]
    )
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('editar-producto', (event, idProducto, datos) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    db.run(
      'UPDATE PRODUCTOS SET codigo=?, nombre=?, familia=?, tipo_venta=?, precio_venta=?, precio_coste=?, id_iva=? WHERE id_producto=?',
      [datos.codigo, datos.nombre, datos.familia, datos.tipo_venta, datos.precio_venta, datos.precio_coste, datos.id_iva, idProducto]
    )
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('toggle-producto', (event, idProducto, nuevoEstado) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    db.run('UPDATE PRODUCTOS SET activo=? WHERE id_producto=?', [nuevoEstado, idProducto])
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('abrir-catalogo', () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'Catálogo de productos - Aula Verde',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  win.loadFile('src/html/catalogo.html')
})

ipcMain.handle('abrir-nueva-venta', () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Aula Verde TPV',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  win.loadFile('src/html/tpv.html')
})

ipcMain.handle('abrir-vista-previa', async (event, idVenta, tipoDocumento) => {
  try {
    const db = getDB()
    const ventaResult = db.exec(`
      SELECT v.*, f.nombre as forma_pago
      FROM VENTAS v
      JOIN FORMAS_PAGO f ON v.id_forma_pago = f.id_forma_pago
      WHERE v.id_venta = ${idVenta}
    `)
    if (!ventaResult.length) return { ok: false }
    const cols = ventaResult[0].columns
    const venta = {}
    ventaResult[0].values[0].forEach((val, i) => venta[cols[i]] = val)
    const lineasResult = db.exec(`SELECT * FROM LINEAS_VENTA WHERE id_venta = ${idVenta} ORDER BY numero_linea`)
    const lineas = []
    if (lineasResult.length && lineasResult[0].values.length) {
      const lCols = lineasResult[0].columns
      lineasResult[0].values.forEach(row => {
        const l = {}
        lCols.forEach((col, i) => l[col] = row[i])
        lineas.push(l)
      })
    }
    const cfgResult = db.exec('SELECT * FROM CONFIGURACION WHERE id_configuracion = 1')
    const cfg = {}
    if (cfgResult.length && cfgResult[0].values.length) {
      const cCols = cfgResult[0].columns
      cfgResult[0].values[0].forEach((val, i) => cfg[cCols[i]] = val)
    }
    let html
    if (tipoDocumento === 'FACTURA_SIMPLIFICADA') {
      const { generarHtmlFactura } = require('./src/js/factura')
      html = generarHtmlFactura(venta, lineas, cfg)
    } else {
      const { generarHtmlTicket } = require('./src/js/impresora')
      html = generarHtmlTicket(venta, lineas, cfg)
    }
    const fs = require('fs')
    const pathMod = require('path')
    const tmpPath = pathMod.join(__dirname, 'data/vista_previa_tmp.html')
    fs.writeFileSync(tmpPath, html)
    const ancho = tipoDocumento === 'FACTURA_SIMPLIFICADA' ? 794 : 420
    const win = new BrowserWindow({
      width: ancho,
      height: 850,
      title: 'Vista previa — ' + venta.numero_documento,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    win.loadFile(tmpPath)
    win.once('ready-to-show', () => { win.show() })
    win.webContents.on('did-finish-load', () => {
      win.webContents.executeJavaScript(`
        const btn = document.createElement('button')
        btn.textContent = '💾 Guardar como PDF'
        btn.style.cssText = 'position:fixed;bottom:16px;right:16px;padding:10px 20px;background:#2d6a2d;color:white;border:none;border-radius:4px;font-size:14px;font-weight:bold;cursor:pointer;z-index:9999;'
        btn.onclick = () => window.print()
        document.body.appendChild(btn)
      `)
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('hacer-backup', () => {
  try {
    const fs = require('fs')
    const pathMod = require('path')
    const ahora = new Date()
    const año = ahora.getFullYear()
    const mes = String(ahora.getMonth() + 1).padStart(2, '0')
    const dia = String(ahora.getDate()).padStart(2, '0')
    const sufijo = `${año}${mes}${dia}`
    const origen = pathMod.join(__dirname, 'data', 'aulaverde.db')
    const carpetaDestino = 'G:\\Mi unidad\\AulaVerde Backups'
    const nombreArchivo = `aulaverde_${sufijo}.db`
    const destino = pathMod.join(carpetaDestino, nombreArchivo)
    if (!fs.existsSync(carpetaDestino)) {
      fs.mkdirSync(carpetaDestino, { recursive: true })
    }
    fs.copyFileSync(origen, destino)
    return { ok: true, ruta: destino }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('exportar-csv', () => {
  try {
    const db = getDB()
    const fs = require('fs')
    const pathMod = require('path')
    const result = db.exec(`
      SELECT p.codigo, p.nombre, p.familia, p.tipo_venta,
      p.precio_venta, p.precio_coste, p.activo, t.porcentaje as iva
      FROM PRODUCTOS p
      JOIN TIPOS_IVA t ON p.id_iva = t.id_iva
      ORDER BY p.codigo ASC
    `)
    if (!result.length) return { ok: false, mensaje: 'No hay productos' }
    const cols = result[0].columns
    let csv = cols.join(';') + '\n'
    result[0].values.forEach(row => {
      csv += row.map(v => (v === null ? '' : String(v).replace(/;/g, ','))).join(';') + '\n'
    })
    const ahora = new Date()
    const sufijo = `${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}`
    const ruta = pathMod.join(__dirname, `data/productos_export_${sufijo}.csv`)
    fs.writeFileSync(ruta, '\uFEFF' + csv, 'utf8')
    return { ok: true, ruta }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('obtener-resumen-periodo', (event, desde, hasta) => {
  const db = getDB()
  const ventas = db.exec("SELECT v.total_venta, v.estado, f.nombre as forma_pago FROM VENTAS v JOIN FORMAS_PAGO f ON v.id_forma_pago = f.id_forma_pago WHERE v.fecha >= '" + desde + "' AND v.fecha <= '" + hasta + "'")
  let numOperaciones = 0, totalVentas = 0, efectivo = 0, tarjeta = 0, pendientes = 0
  if (ventas.length && ventas[0].values.length) {
    ventas[0].values.forEach(row => {
      const total = row[0], estado = row[1], forma = row[2]
      numOperaciones++
      if (estado === 'COBRADO') {
        totalVentas += total
        if (forma === 'Efectivo') efectivo += total
        else tarjeta += total
      } else {
        pendientes++
      }
    })
  }
  const ticketMedio = numOperaciones > 0 ? totalVentas / numOperaciones : 0
  const top = db.exec("SELECT lv.nombre_producto, SUM(lv.cantidad) as cantidad, SUM(lv.total_linea) as total FROM LINEAS_VENTA lv JOIN VENTAS v ON lv.id_venta = v.id_venta WHERE v.fecha >= '" + desde + "' AND v.fecha <= '" + hasta + "' GROUP BY lv.nombre_producto ORDER BY cantidad DESC LIMIT 5")
  const topProductos = []
  if (top.length && top[0].values.length) {
    top[0].values.forEach(row => topProductos.push({ nombre: row[0], cantidad: row[1], total: row[2] }))
  }
  const beneficioResult = db.exec(`
    SELECT SUM((lv.precio_unitario - COALESCE(p.precio_coste, 0)) * lv.cantidad) as beneficio
    FROM LINEAS_VENTA lv
    JOIN VENTAS v ON lv.id_venta = v.id_venta
    JOIN PRODUCTOS p ON lv.codigo_producto = p.codigo
    WHERE v.fecha >= '${desde}' AND v.fecha <= '${hasta}' AND v.estado = 'COBRADO'
  `)
  const beneficio = beneficioResult.length && beneficioResult[0].values[0][0]
    ? beneficioResult[0].values[0][0]
    : 0
  return { numOperaciones, totalVentas, efectivo, tarjeta, ticketMedio, pendientes, topProductos, beneficio }
})

ipcMain.handle('dialogo-imprimir', async (event, numeroDocumento) => {
  const { dialog } = require('electron')
  const win = BrowserWindow.fromWebContents(
    require('electron').webContents.fromId(event.sender.id)
  )
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Imprimir', 'No imprimir'],
    defaultId: 0,
    cancelId: 1,
    title: 'Venta cobrada',
    message: 'Venta cobrada correctamente',
    detail: 'Documento: ' + numeroDocumento + '\n\n¿Deseas imprimir el documento?'
  })
  return response === 0
})

ipcMain.handle('dialogo-error', async (event, mensaje) => {
  const { dialog } = require('electron')
  const win = BrowserWindow.fromWebContents(
    require('electron').webContents.fromId(event.sender.id)
  )
  await dialog.showMessageBox(win, {
    type: 'error',
    title: 'Error al imprimir',
    message: mensaje
  })
})

// ─── MÓDULO COMPRAS ─────────────────────────────────────────────────────────

ipcMain.handle('importar-proveedores-excel', async (event) => {
  try {
    const { dialog } = require('electron')
    const XLSX = require('xlsx')

    const win = BrowserWindow.fromWebContents(event.sender)
    const { filePaths, canceled } = await dialog.showOpenDialog(win, {
      title: 'Selecciona el Excel de proveedores',
      filters: [{ name: 'Excel', extensions: ['xls', 'xlsx'] }],
      properties: ['openFile']
    })

    if (canceled || !filePaths || filePaths.length === 0) {
      return { ok: false, mensaje: 'No se seleccionó ningún archivo' }
    }

    const rutaExcel = filePaths[0]
    const libro = XLSX.readFile(rutaExcel)
    const hoja = libro.Sheets[libro.SheetNames[0]]
    const filas = XLSX.utils.sheet_to_json(hoja)

    const db = getDB()
    const { guardarDB } = require('./src/js/database')

    let importados = 0
    let omitidos = 0

    filas.forEach(fila => {
      const nombre = (fila['Nombre'] || '').toString().trim()
      if (!nombre) return

      const existe = db.exec(`SELECT id_proveedor FROM PROVEEDORES WHERE nombre = '${nombre.replace(/'/g, "''")}'`)
      if (existe.length && existe[0].values.length) {
        omitidos++
        return
      }

      const partesDireccion = [
        fila['Dirección'] || '',
        fila['C.P.'] ? String(Math.round(fila['C.P.'])).padStart(5, '0') : '',
        fila['Población'] || '',
        fila['Provincia'] || ''
      ].map(s => s.toString().trim()).filter(s => s !== '' && s !== '0')
      const direccion = partesDireccion.join(', ')

      const nif = (fila['N.I.F.'] || '').toString().trim()
      const telefono = fila['Teléfono'] ? String(Math.round(fila['Teléfono'])) : ''

      db.run(
        'INSERT INTO PROVEEDORES (nombre, nif, direccion, telefono, email, activo, recargo_equivalencia) VALUES (?, ?, ?, ?, ?, 1, 1)',
        [nombre, nif, direccion, telefono, '']
      )
      importados++
    })

    guardarDB()
    return { ok: true, importados, omitidos }

  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('abrir-nueva-compra', () => {
  const win = new BrowserWindow({
    width: 720,
    height: 620,
    title: 'Nueva compra - Aula Verde',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  win.loadFile('src/html/nueva-compra.html')
})

ipcMain.handle('extraer-factura-pdf', async (event, datos) => {
  try {
    const fs = require('fs')
    const pathMod = require('path')

    const db = getDB()
    const cfgResult = db.exec('SELECT api_key_anthropic FROM CONFIGURACION WHERE id_configuracion = 1')
    if (!cfgResult.length || !cfgResult[0].values[0][0]) {
      return { ok: false, mensaje: 'No hay clave API configurada. Ve a Configuración y añade tu clave API de Anthropic.' }
    }
    const apiKey = cfgResult[0].values[0][0]

    const ahora = new Date()
    const sufijo = `${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}_${Date.now()}`
    const nombreArchivo = `factura_${sufijo}.pdf`
    const carpetaLocal = 'C:\\AulaVerde Facturas'
    const carpetaDrive = 'G:\\Mi unidad\\AulaVerde Facturas'
    const rutaLocal = pathMod.join(carpetaLocal, nombreArchivo)

    if (!fs.existsSync(carpetaLocal)) fs.mkdirSync(carpetaLocal, { recursive: true })
    const bufferPdf = Buffer.from(datos.base64, 'base64')
    fs.writeFileSync(rutaLocal, bufferPdf)

    try {
      if (!fs.existsSync(carpetaDrive)) fs.mkdirSync(carpetaDrive, { recursive: true })
      fs.copyFileSync(rutaLocal, pathMod.join(carpetaDrive, nombreArchivo))
    } catch (e) {
      console.log('Google Drive no disponible, solo guardado local')
    }

    const fetch = require('electron').net.fetch
    const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: datos.base64
                }
              },
              {
                type: 'text',
                text: `Analiza esta factura de proveedor y extrae los datos en formato JSON.
Responde ÚNICAMENTE con el JSON, sin texto adicional, sin explicaciones, sin bloques de código.

El JSON debe tener exactamente esta estructura:
{
  "proveedor_nombre": "nombre del proveedor tal como aparece en la factura",
  "proveedor_nif": "NIF o CIF del proveedor",
  "numero_factura": "número de factura",
  "fecha": "fecha en formato YYYY-MM-DD",
  "lineas": [
    {
      "nombre_proveedor": "nombre del producto tal como aparece en la factura",
      "codigo_proveedor": "referencia o código del producto, vacío si no hay",
      "cantidad": 0.000,
      "precio_unitario": 0.00,
      "porcentaje_iva": 0.00,
      "importe_iva": 0.00,
      "total_linea": 0.00
    }
  ],
  "base_imponible": 0.00,
  "total_iva": 0.00,
  "total_factura": 0.00
}`
              }
            ]
          }
        ]
      })
    })

    const json = await respuesta.json()
    if (!respuesta.ok) {
      return { ok: false, mensaje: 'Error de la API: ' + (json.error?.message || 'Error desconocido') }
    }

    const textoRespuesta = json.content[0].text.trim()
    const datosFactura = JSON.parse(textoRespuesta)
    return { ok: true, datos: datosFactura, rutaPdf: rutaLocal }

  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})
ipcMain.handle('abrir-revision-compra', (event, datosFactura, idProveedor, nombreProveedor, rutaPdf) => {
  const win = new BrowserWindow({
    width: 1300,
height: 750,
title: 'Revisión de compra - Aula Verde',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  win.loadFile('src/html/revision-compra.html')
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('iniciar-revision', {
      datosFactura,
      idProveedor,
      nombreProveedor,
      rutaPdf
    })
  })
})
ipcMain.handle('obtener-siguiente-codigo-producto', () => {
  try {
    const db = getDB()
    const result = db.exec("SELECT MAX(CAST(codigo AS INTEGER)) FROM PRODUCTOS WHERE codigo GLOB '[0-9]*'")
    const maximo = result.length && result[0].values[0][0] ? result[0].values[0][0] : 0
    const siguiente = String(Number(maximo) + 1).padStart(5, '0')
    return siguiente
  } catch (e) {
    return '00001'
  }
})

ipcMain.handle('obtener-id-iva-por-porcentaje', (event, porcentaje) => {
  const db = getDB()
  const result = db.exec(`SELECT id_iva FROM TIPOS_IVA WHERE porcentaje = ${porcentaje} AND activo = 1 LIMIT 1`)
  if (result.length && result[0].values.length) return result[0].values[0][0]
  return 2 // Por defecto IVA reducido 10%
})
ipcMain.handle('obtener-productos-para-selector', () => {
  const db = getDB()
  const result = db.exec('SELECT id_producto, codigo, nombre FROM PRODUCTOS WHERE activo = 1 ORDER BY nombre ASC')
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('obtener-correspondencias', (event, idProveedor) => {
  const db = getDB()
  const result = db.exec(`SELECT * FROM PRODUCTOS_PROVEEDOR WHERE id_proveedor = ${idProveedor} AND activo = 1`)
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('guardar-compra', (event, datos) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')

    // Insertar cabecera de compra
    db.run(
      'INSERT INTO COMPRAS (id_proveedor, numero_factura, fecha, estado, base_imponible, total_iva, total_compra, pdf_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        datos.idProveedor,
        datos.datosFactura.numero_factura,
        datos.datosFactura.fecha,
        'REGISTRADA',
        datos.datosFactura.base_imponible,
        datos.datosFactura.total_iva,
        datos.datosFactura.total_factura,
        datos.rutaPdf
      ]
    )

    // Obtener el id de la compra recién insertada
    const idCompraResult = db.exec('SELECT last_insert_rowid()')
    const idCompra = idCompraResult[0].values[0][0]

    // Insertar líneas
    datos.lineas.forEach((linea, index) => {
      db.run(
        'INSERT INTO LINEAS_COMPRA (id_compra, numero_linea, nombre_proveedor, codigo_proveedor, id_producto, cantidad, precio_unitario, porcentaje_iva, importe_iva, total_linea) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          idCompra,
          index + 1,
          linea.nombre_proveedor,
          linea.codigo_proveedor || '',
          linea.id_producto || null,
          linea.cantidad,
          linea.precio_unitario,
          linea.porcentaje_iva,
          linea.importe_iva,
          linea.total_linea
        ]
      )
    })

    // Guardar correspondencias nuevas
    let correspondenciasNuevas = 0
    datos.lineas.forEach(linea => {
      if (!linea.id_producto) return
      try {
        db.run(
          'INSERT OR IGNORE INTO PRODUCTOS_PROVEEDOR (id_proveedor, nombre_proveedor, codigo_proveedor, id_producto, activo) VALUES (?, ?, ?, ?, 1)',
          [datos.idProveedor, linea.nombre_proveedor, linea.codigo_proveedor || '', linea.id_producto]
        )
        correspondenciasNuevas++
      } catch (e) {
        // Ya existía la correspondencia, no pasa nada
      }
    })

    guardarDB()
    return { ok: true, correspondenciasNuevas }

  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})
ipcMain.handle('abrir-historico-compras', () => {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    title: 'Histórico de compras - Aula Verde',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  win.loadFile('src/html/historico-compras.html')
})

ipcMain.handle('obtener-compras', (event, filtros) => {
  const db = getDB()
  let sql = `
    SELECT c.id_compra, c.numero_factura, c.fecha, c.estado,
    c.base_imponible, c.total_iva, c.total_compra, c.pdf_path,
    p.nombre as nombre_proveedor
    FROM COMPRAS c
    JOIN PROVEEDORES p ON c.id_proveedor = p.id_proveedor
    WHERE 1=1
  `
  if (filtros.idProveedor) sql += ` AND c.id_proveedor = ${filtros.idProveedor}`
  if (filtros.desde) sql += ` AND c.fecha >= '${filtros.desde}'`
  if (filtros.hasta) sql += ` AND c.fecha <= '${filtros.hasta}'`
  sql += ' ORDER BY c.fecha DESC, c.id_compra DESC'

  const result = db.exec(sql)
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('obtener-detalle-compra', (event, idCompra) => {
  const db = getDB()
  const result = db.exec(`
    SELECT lc.*, p.nombre as nombre_producto
    FROM LINEAS_COMPRA lc
    LEFT JOIN PRODUCTOS p ON lc.id_producto = p.id_producto
    WHERE lc.id_compra = ${idCompra}
    ORDER BY lc.numero_linea ASC
  `)
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})
// ─── MÓDULO PROVEEDORES ─────────────────────────────────────────────────────

ipcMain.handle('abrir-proveedores', () => {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    title: 'Proveedores - Aula Verde',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  win.loadFile('src/html/proveedores.html')
})

ipcMain.handle('obtener-proveedores', () => {
  const db = getDB()
  const result = db.exec('SELECT * FROM PROVEEDORES ORDER BY nombre ASC')
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('crear-proveedor', (event, datos) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    db.run(
      'INSERT INTO PROVEEDORES (nombre, nif, direccion, telefono, email, activo, recargo_equivalencia) VALUES (?, ?, ?, ?, ?, 1, ?)',
      [datos.nombre, datos.nif, datos.direccion, datos.telefono, datos.email, datos.recargo_equivalencia]
    )
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('editar-proveedor', (event, idProveedor, datos) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    db.run(
      'UPDATE PROVEEDORES SET nombre=?, nif=?, direccion=?, telefono=?, email=?, recargo_equivalencia=? WHERE id_proveedor=?',
      [datos.nombre, datos.nif, datos.direccion, datos.telefono, datos.email, datos.recargo_equivalencia, idProveedor]
    )
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('toggle-proveedor', (event, idProveedor, nuevoEstado) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    db.run('UPDATE PROVEEDORES SET activo=? WHERE id_proveedor=?', [nuevoEstado, idProveedor])
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})
