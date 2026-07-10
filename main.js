const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { inicializarDB, getDB } = require('./src/js/database')
const { getRutaDescargas } = require('./src/js/rutas')
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
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
        const { obtenerRutaBD } = require('./src/js/database')
        const ahora = new Date()
        const año = ahora.getFullYear()
        const mes = String(ahora.getMonth() + 1).padStart(2, '0')
        const dia = String(ahora.getDate()).padStart(2, '0')
        const sufijo = `${año}${mes}${dia}`
        const origen = obtenerRutaBD()
        const dbTmp = getDB()
        const cfgTmp = dbTmp.exec('SELECT ruta_backup_bd FROM CONFIGURACION WHERE id_configuracion = 1')
        const carpetaDestino = (cfgTmp.length && cfgTmp[0].values[0][0]) || 'G:\\Mi unidad\\AulaVerde Backups'
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

function abrirVentanaActivacion() {
  const win = new BrowserWindow({
    width: 560,
    height: 480,
    resizable: false,
    title: 'Activación - Puntal TPV',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  win.loadFile('src/html/activacion.html')
  return win
}

app.whenReady().then(async () => {
  await inicializarDB()

  const { verificarLicencia } = require('./src/js/licencia')
  const db = getDB()
  const cfgLicencia = db.exec('SELECT licencia_clave FROM CONFIGURACION WHERE id_configuracion = 1')
  const claveGuardada = cfgLicencia.length && cfgLicencia[0].values[0][0]
  const estado = verificarLicencia(claveGuardada)

  if (estado.valida) {
    createWindow()
  } else {
    // Licencia ausente, inválida o caducada: se bloquea el uso normal de la
    // app y se muestra la pantalla de activación en su lugar.
    abrirVentanaActivacion()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── MÓDULO LICENCIA ─────────────────────────────────────────────────────────

ipcMain.handle('activar-licencia', (event, claveLicencia) => {
  const { verificarLicencia } = require('./src/js/licencia')
  const resultado = verificarLicencia(claveLicencia)

  if (!resultado.valida) {
    return { ok: false, motivo: resultado.motivo }
  }

  const db = getDB()
  const { guardarDB } = require('./src/js/database')
  db.run('UPDATE CONFIGURACION SET licencia_clave = ? WHERE id_configuracion = 1', [claveLicencia.trim()])
  guardarDB()

  // Licencia activada: se abre el TPV y se cierra la ventana de activación
  createWindow()
  const ventanaActivacion = BrowserWindow.fromWebContents(event.sender)
  if (ventanaActivacion) ventanaActivacion.close()

  return { ok: true, payload: resultado.payload }
})

ipcMain.handle('importar-productos', () => {
  return importarProductos()
})

ipcMain.handle('buscar-productos', (event, texto) => {
  const db = getDB()
  // Nota: se incluye p.id_producto (antes no se seleccionaba, lo que obligaba
  // a guardar un id_producto falso al añadir el producto a una venta).
  // Consulta parametrizada para evitar inyección SQL desde el texto de búsqueda.
  const patron = `%${texto}%`
  const resultados = db.exec(`
    SELECT p.id_producto, p.codigo, p.nombre, p.precio_venta, t.porcentaje as porcentaje_iva
    FROM PRODUCTOS p
    JOIN TIPOS_IVA t ON p.id_iva = t.id_iva
    WHERE p.activo = 1 AND (p.nombre LIKE ? OR p.codigo LIKE ?)
    LIMIT 10
  `, [patron, patron])
  if (!resultados.length) return []
  const cols = resultados[0].columns
  return resultados[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('guardar-venta', (event, lineas, formaPago, tipoDocumento, cliente, puntosCanjear) => {
  return guardarVenta(lineas, formaPago, tipoDocumento, cliente, puntosCanjear)
})

ipcMain.handle('abrir-consultas', () => {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    title: 'Consultas - Aula Verde',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  win.loadFile('src/html/consultas.html')
})

ipcMain.handle('obtener-ventas', (event, desde, hasta) => {
  const db = getDB()
  const sql = "SELECT v.id_venta, v.numero_documento, v.fecha, v.hora, v.cliente, v.estado, v.tipo_documento, v.total_venta, f.nombre as forma_pago FROM VENTAS v JOIN FORMAS_PAGO f ON v.id_forma_pago = f.id_forma_pago WHERE v.fecha >= ? AND v.fecha <= ? ORDER BY v.id_venta DESC"
  const resultados = db.exec(sql, [desde, hasta])
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  win.loadFile('src/html/resumen.html')
})

ipcMain.handle('obtener-resumen', (event, fecha) => {
  const db = getDB()
  const ventas = db.exec("SELECT v.total_venta, v.estado, f.nombre as forma_pago FROM VENTAS v JOIN FORMAS_PAGO f ON v.id_forma_pago = f.id_forma_pago WHERE v.fecha = ?", [fecha])
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
  const top = db.exec("SELECT lv.nombre_producto, SUM(lv.cantidad) as cantidad, SUM(lv.total_linea) as total FROM LINEAS_VENTA lv JOIN VENTAS v ON lv.id_venta = v.id_venta WHERE v.fecha = ? GROUP BY lv.nombre_producto ORDER BY cantidad DESC LIMIT 5", [fecha])
  const topProductos = []
  if (top.length && top[0].values.length) {
    top[0].values.forEach(row => topProductos.push({ nombre: row[0], cantidad: row[1], total: row[2] }))
  }
  const beneficioResult = db.exec(`
    SELECT SUM((lv.precio_unitario - COALESCE(p.precio_coste, 0)) * lv.cantidad) as beneficio
    FROM LINEAS_VENTA lv
    JOIN VENTAS v ON lv.id_venta = v.id_venta
    JOIN PRODUCTOS p ON lv.codigo_producto = p.codigo
    WHERE v.fecha = ? AND v.estado = 'COBRADO'
  `, [fecha])
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
      WHERE v.id_venta = ?
    `, [idVenta])
    if (!ventaResult.length) return { ok: false, mensaje: 'Venta no encontrada' }
    const cols = ventaResult[0].columns
    const venta = {}
    ventaResult[0].values[0].forEach((val, i) => venta[cols[i]] = val)
    const lineasResult = db.exec(`SELECT * FROM LINEAS_VENTA WHERE id_venta = ?`, [idVenta])
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

// ─── MÓDULO CONFIGURACIÓN ────────────────────────────────────────────────────
// (extraído a src/handlers/configuracion.js — misma lógica, otro archivo)
require('./src/handlers/configuracion').registrar(ipcMain, BrowserWindow)

ipcMain.handle('abrir-modificar-venta', (event, idVenta) => {
  idVentaModificar = idVenta
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    title: 'Modificar venta - Aula Verde',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
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
    WHERE v.id_venta = ?
  `, [idVenta])
  if (!ventaResult.length) return null
  const vCols = ventaResult[0].columns
  const venta = {}
  ventaResult[0].values[0].forEach((val, i) => venta[vCols[i]] = val)
  const lineasResult = db.exec(`SELECT * FROM LINEAS_VENTA WHERE id_venta = ? ORDER BY numero_linea`, [idVenta])
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
      // Igual que en el cobro normal (ventas.js): usar el id_producto real
      // de la línea, resolviéndolo por código si no llega, en vez de un
      // valor fijo. 0 solo se usa para líneas manuales sin producto real.
      let idProducto = l.id_producto || null
      if (!idProducto && l.codigo) {
        const prodResult = db.exec('SELECT id_producto FROM PRODUCTOS WHERE codigo = ?', [l.codigo])
        if (prodResult.length && prodResult[0].values.length) {
          idProducto = prodResult[0].values[0][0]
        }
      }
      if (!idProducto) idProducto = 0
      db.run(
        'INSERT INTO LINEAS_VENTA (id_venta, numero_linea, id_producto, codigo_producto, nombre_producto, cantidad, precio_unitario, descuento, porcentaje_iva, importe_iva, total_linea) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [idVenta, i + 1, idProducto, l.codigo, l.nombre, l.cantidad, l.precio, l.descuento, l.iva, Number(ivaLinea.toFixed(2)), Number(conIva.toFixed(2))]
      )
    })
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

// ─── MÓDULO CATÁLOGO ──────────────────────────────────────────────────────────
// (extraído a src/handlers/catalogo.js — misma lógica, otro archivo)
require('./src/handlers/catalogo').registrar(ipcMain, BrowserWindow)

ipcMain.handle('abrir-nueva-venta', () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Aula Verde TPV',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
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
      WHERE v.id_venta = ?
    `, [idVenta])
    if (!ventaResult.length) return { ok: false }
    const cols = ventaResult[0].columns
    const venta = {}
    ventaResult[0].values[0].forEach((val, i) => venta[cols[i]] = val)
    const lineasResult = db.exec(`SELECT * FROM LINEAS_VENTA WHERE id_venta = ? ORDER BY numero_linea`, [idVenta])
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
    const { obtenerCarpetaDatos } = require('./src/js/database')
    const tmpPath = pathMod.join(obtenerCarpetaDatos(), 'vista_previa_tmp.html')
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

ipcMain.handle('obtener-resumen-periodo', (event, desde, hasta) => {
  const db = getDB()
  const ventas = db.exec("SELECT v.total_venta, v.estado, f.nombre as forma_pago FROM VENTAS v JOIN FORMAS_PAGO f ON v.id_forma_pago = f.id_forma_pago WHERE v.fecha >= ? AND v.fecha <= ?", [desde, hasta])
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
  const top = db.exec("SELECT lv.nombre_producto, SUM(lv.cantidad) as cantidad, SUM(lv.total_linea) as total FROM LINEAS_VENTA lv JOIN VENTAS v ON lv.id_venta = v.id_venta WHERE v.fecha >= ? AND v.fecha <= ? GROUP BY lv.nombre_producto ORDER BY cantidad DESC LIMIT 5", [desde, hasta])
  const topProductos = []
  if (top.length && top[0].values.length) {
    top[0].values.forEach(row => topProductos.push({ nombre: row[0], cantidad: row[1], total: row[2] }))
  }
  const beneficioResult = db.exec(`
    SELECT SUM((lv.precio_unitario - COALESCE(p.precio_coste, 0)) * lv.cantidad) as beneficio
    FROM LINEAS_VENTA lv
    JOIN VENTAS v ON lv.id_venta = v.id_venta
    JOIN PRODUCTOS p ON lv.codigo_producto = p.codigo
    WHERE v.fecha >= ? AND v.fecha <= ? AND v.estado = 'COBRADO'
  `, [desde, hasta])
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

// ─── MÓDULO COMPRAS Y PROVEEDORES ────────────────────────────────────────────
// (extraído a src/handlers/compras.js — misma lógica, otro archivo)
require('./src/handlers/compras').registrar(ipcMain, BrowserWindow)

ipcMain.handle('exportar-listado-ventas', async (event, filtros) => {
  try {
    const db = getDB()
    const pathMod = require('path')
    const XLSX = require('xlsx')

    const ventasResult = db.exec(`
      SELECT v.id_venta, v.numero_documento, v.fecha, v.cliente, v.total_venta
      FROM VENTAS v
      WHERE v.fecha >= ? AND v.fecha <= ?
      AND v.estado = 'COBRADO'
      ORDER BY v.fecha ASC, v.id_venta ASC
    `, [filtros.desde, filtros.hasta])

    if (!ventasResult.length || !ventasResult[0].values.length) {
      return { ok: false, mensaje: 'No hay ventas en el período seleccionado.' }
    }

    const colsVenta = ventasResult[0].columns
    const ventas = ventasResult[0].values.map(row => {
      const obj = {}
      colsVenta.forEach((col, i) => obj[col] = row[i])
      return obj
    })

    const filas = []
    ventas.forEach(venta => {
      const lineasResult = db.exec(`
        SELECT porcentaje_iva,
               SUM(total_linea / (1 + porcentaje_iva / 100.0)) as base,
               SUM(importe_iva) as iva
        FROM LINEAS_VENTA
        WHERE id_venta = ?
        GROUP BY porcentaje_iva
      `, [venta.id_venta])

      let base4=0,iva4=0,base10=0,iva10=0,base21=0,iva21=0,base0=0,iva0=0,baseTotal=0

      if (lineasResult.length && lineasResult[0].values.length) {
        lineasResult[0].values.forEach(row => {
          const pct=Number(row[0]),base=Number(Number(row[1]).toFixed(2)),iva=Number(Number(row[2]).toFixed(2))
          baseTotal+=base
          if(pct===4){base4=base;iva4=iva}
          else if(pct===10){base10=base;iva10=iva}
          else if(pct===21){base21=base;iva21=iva}
          else if(pct===0){base0=base;iva0=iva}
        })
      }

      filas.push({
        'Nº Factura': venta.numero_documento, 'Fecha': venta.fecha,
        'Cliente': venta.cliente||'Cliente contado', 'Base': Number(baseTotal.toFixed(2)),
        'Base IVA 4%': base4||'', 'IVA 4% Superreducido': iva4||'', 'Rec. Equiv. 4%': base4?Number((base4*0.005).toFixed(2)):'',
        'Base IVA 10%': base10||'', 'IVA 10% Reducido': iva10||'', 'Rec. Equiv. 10%': base10?Number((base10*0.014).toFixed(2)):'',
        'Base IVA 21%': base21||'', 'IVA 21% General': iva21||'', 'Rec. Equiv. 21%': base21?Number((base21*0.052).toFixed(2)):'',
        'Base IVA 0%': base0||'', 'IVA 0% Exento': iva0||'', 'Rec. Equiv. 0%': '',
        'Total': Number(venta.total_venta.toFixed(2))
      })
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [{wch:15},{wch:12},{wch:25},{wch:10},{wch:12},{wch:18},{wch:15},{wch:12},{wch:18},{wch:15},{wch:12},{wch:18},{wch:15},{wch:12},{wch:18},{wch:15},{wch:10}]
    XLSX.utils.book_append_sheet(wb, ws, 'Listado de ventas')

    const nombreArchivo = `listado_ventas_${filtros.desde}_${filtros.hasta}.xlsx`
    const ruta = pathMod.join(getRutaDescargas(), nombreArchivo)
    XLSX.writeFile(wb, ruta)
    return { ok: true, ruta }

  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

// ─── MÓDULO CLIENTES ─────────────────────────────────────────────────────
// (extraído a src/handlers/clientes.js — misma lógica, otro archivo)
require('./src/handlers/clientes').registrar(ipcMain, BrowserWindow)

// ─── MÓDULO EMAIL ─────────────────────────────────────────────────────────

ipcMain.handle('obtener-plantillas-email', () => {
  const db = getDB()
  const result = db.exec('SELECT * FROM PLANTILLAS_EMAIL ORDER BY tipo ASC')
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('editar-plantilla-email', (event, idPlantilla, datos) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    db.run('UPDATE PLANTILLAS_EMAIL SET asunto=?, cuerpo=? WHERE id_plantilla=?', [datos.asunto, datos.cuerpo, idPlantilla])
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('probar-conexion-smtp', async () => {
  const { probarConexionSmtp } = require('./src/js/email')
  return await probarConexionSmtp()
})

ipcMain.handle('enviar-email-cliente', async (event, idCliente, tipoPlantilla) => {
  try {
    const db = getDB()
    const clienteResult = db.exec(`SELECT id_cliente, nombre, email FROM CLIENTES WHERE id_cliente = ?`, [idCliente])
    if (!clienteResult.length || !clienteResult[0].values.length) {
      return { ok: false, mensaje: 'Cliente no encontrado' }
    }
    const cliente = {
      id_cliente: clienteResult[0].values[0][0],
      nombre: clienteResult[0].values[0][1],
      email: clienteResult[0].values[0][2]
    }
    const plantillaResult = db.exec(`SELECT asunto, cuerpo FROM PLANTILLAS_EMAIL WHERE tipo = ?`, [tipoPlantilla])
    if (!plantillaResult.length || !plantillaResult[0].values.length) {
      return { ok: false, mensaje: 'Plantilla no encontrada' }
    }
    const plantilla = { asunto: plantillaResult[0].values[0][0], cuerpo: plantillaResult[0].values[0][1] }
    const { enviarEmailCliente } = require('./src/js/email')
    return await enviarEmailCliente(cliente, plantilla)
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

// ─── MÓDULO WHATSAPP ────────────────────────────────────────────────────────

ipcMain.handle('obtener-plantillas-whatsapp', () => {
  const db = getDB()
  const result = db.exec('SELECT * FROM PLANTILLAS_WHATSAPP ORDER BY tipo ASC')
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('editar-plantilla-whatsapp', (event, idPlantilla, datos) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    db.run('UPDATE PLANTILLAS_WHATSAPP SET mensaje=? WHERE id_plantilla=?', [datos.mensaje, idPlantilla])
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('abrir-whatsapp', (event, telefonoCompleto, mensaje) => {
  try {
    const { shell } = require('electron')
    const numeroLimpio = telefonoCompleto.replace(/[^0-9]/g, '')
    const url = `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(mensaje)}`
    shell.openExternal(url)
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

// ─── MÓDULO CAMPAÑAS ────────────────────────────────────────────────────────

ipcMain.handle('abrir-campanas', () => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Campañas - Aula Verde',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true }
  })
  win.loadFile('src/html/campanas.html')
})

ipcMain.handle('obtener-clientes-campana', (event, filtros) => {
  const db = getDB()
  let sql = `SELECT id_cliente, nombre, email, telefono, prefijo_telefono, fecha_nacimiento FROM CLIENTES WHERE activo = 1`
  const params = []
  if (filtros.tipo === 'cumpleanos' && filtros.mes) {
    sql += ` AND strftime('%m', fecha_nacimiento) = ?`
    params.push(String(filtros.mes).padStart(2, '0'))
  }
  if (filtros.tipo === 'inactivos') {
    const dias = filtros.dias || 90
    const fechaLimite = new Date()
    fechaLimite.setDate(fechaLimite.getDate() - dias)
    const fechaLimiteStr = fechaLimite.toISOString().split('T')[0]
    sql += ` AND id_cliente IN (
      SELECT c.id_cliente FROM CLIENTES c
      JOIN VENTAS v ON v.id_cliente = c.id_cliente
      GROUP BY c.id_cliente HAVING MAX(v.fecha) < ?
    )`
    params.push(fechaLimiteStr)
  }
  sql += ' ORDER BY nombre ASC'
  const result = db.exec(sql, params)
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('enviar-campana-email', async (event, clientes, asunto, cuerpo) => {
  const { enviarEmailCliente } = require('./src/js/email')
  const resultados = { enviados: 0, errores: 0, sinEmail: 0 }
  for (const cliente of clientes) {
    if (!cliente.email) { resultados.sinEmail++; continue }
    const plantilla = {
      asunto: asunto.replace(/{nombre}/g, cliente.nombre),
      cuerpo: cuerpo.replace(/{nombre}/g, cliente.nombre)
    }
    const res = await enviarEmailCliente(
      { id_cliente: cliente.id_cliente, nombre: cliente.nombre, email: cliente.email },
      plantilla
    )
    if (res.ok) resultados.enviados++
    else resultados.errores++
  }
  return { ok: true, ...resultados }
})

// ─── MÓDULO CONSENTIMIENTO RGPD ──────────────────────────────────────────────
// (extraído a src/handlers/consentimiento.js — misma lógica, otro archivo)
require('./src/handlers/consentimiento').registrar(ipcMain, BrowserWindow)