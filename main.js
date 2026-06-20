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
      'UPDATE CONFIGURACION SET nombre_tienda=?, razon_social=?, nif_vendedor=?, direccion=?, telefono=?, email=?, impresora_ticket=?, impresora_factura=? WHERE id_configuracion=1',
      [
        datos.nombre_tienda,
        datos.razon_social,
        datos.nif_vendedor,
        datos.direccion,
        datos.telefono,
        datos.email,
        datos.impresora_ticket,
        datos.impresora_factura
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
    win.once('ready-to-show', () => {
      win.show()
    })
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
