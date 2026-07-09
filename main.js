const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { inicializarDB, getDB } = require('./src/js/database')
const { importarProductos } = require('./src/js/importar-productos')
const { guardarVenta } = require('./src/js/ventas')
const { imprimirTicket } = require('./src/js/impresora')
const { imprimirFactura } = require('./src/js/factura')
const { guardarConsentimientoPDF, imprimirConsentimiento } = require('./src/js/consentimiento')
let idVentaModificar = null

// ─── Helper: obtener ruta de descargas configurada ───────────────────────────
function getRutaDescargas() {
  const fs = require('fs')
  const db = getDB()
  const result = db.exec('SELECT ruta_descargas FROM CONFIGURACION WHERE id_configuracion = 1')
  const ruta = (result.length && result[0].values[0][0])
    ? result[0].values[0][0]
    : 'C:\\AulaVerde\\descargas'
  if (!fs.existsSync(ruta)) fs.mkdirSync(ruta, { recursive: true })
  return ruta
}

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

ipcMain.handle('obtener-configuracion', () => {
  const db = getDB()
  const { descifrar } = require('./src/js/database')
  const result = db.exec('SELECT * FROM CONFIGURACION WHERE id_configuracion = 1')
  if (!result.length || !result[0].values.length) return null
  const cols = result[0].columns
  const cfg = {}
  result[0].values[0].forEach((val, i) => cfg[cols[i]] = val)
  cfg.api_key_anthropic = descifrar(cfg.api_key_anthropic)
  cfg.smtp_password = descifrar(cfg.smtp_password)
  return cfg
})

ipcMain.handle('guardar-configuracion', (event, datos) => {
  try {
    const db = getDB()
    const { guardarDB, cifrar } = require('./src/js/database')
    db.run(
      'UPDATE CONFIGURACION SET nombre_tienda=?, razon_social=?, nif_vendedor=?, direccion=?, telefono=?, email=?, impresora_ticket=?, impresora_factura=?, api_key_anthropic=?, puntos_euros_por_punto=?, puntos_valor_canje=?, smtp_host=?, smtp_puerto=?, smtp_usuario=?, smtp_password=?, smtp_email_remitente=?, ruta_descargas=?, ruta_backup_bd=?, ruta_backup_facturas=? WHERE id_configuracion=1',
      [
        datos.nombre_tienda,
        datos.razon_social,
        datos.nif_vendedor,
        datos.direccion,
        datos.telefono,
        datos.email,
        datos.impresora_ticket,
        datos.impresora_factura,
        cifrar(datos.api_key_anthropic),
        datos.puntos_euros_por_punto,
        datos.puntos_valor_canje,
        datos.smtp_host,
        datos.smtp_puerto,
        datos.smtp_usuario,
        cifrar(datos.smtp_password),
        datos.smtp_email_remitente,
        datos.ruta_descargas,
        datos.ruta_backup_bd,
        datos.ruta_backup_facturas
      ]
    )
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('seleccionar-carpeta-descargas', async (event) => {
  const { dialog } = require('electron')
  const win = BrowserWindow.fromWebContents(event.sender)
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: 'Seleccionar carpeta de descargas',
    properties: ['openDirectory', 'createDirectory']
  })
  if (canceled || !filePaths || filePaths.length === 0) return null
  return filePaths[0]
})

ipcMain.handle('abrir-configuracion', () => {
  const win = new BrowserWindow({
    width: 680,
    height: 700,
    title: 'Configuración - Aula Verde',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
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

ipcMain.handle('obtener-productos-catalogo', (event, filtros) => {
  const db = getDB()
  let sql = `
    SELECT p.id_producto, p.codigo, p.nombre, p.familia, p.tipo_venta,
    p.precio_venta, p.precio_coste, p.activo, p.id_iva, t.porcentaje as porcentaje_iva
    FROM PRODUCTOS p
    JOIN TIPOS_IVA t ON p.id_iva = t.id_iva
    WHERE 1=1
  `
  const params = []
  if (filtros.nombre) {
    sql += ` AND (p.nombre LIKE ? OR p.codigo LIKE ?)`
    params.push(`%${filtros.nombre}%`, `%${filtros.nombre}%`)
  }
  if (filtros.familia) {
    sql += ` AND p.familia = ?`
    params.push(filtros.familia)
  }
  if (filtros.activo !== '') {
    sql += ` AND p.activo = ?`
    params.push(filtros.activo)
  }
  sql += ' ORDER BY p.codigo ASC'
  const result = db.exec(sql, params)
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
    const existe = db.exec(`SELECT id_producto FROM PRODUCTOS WHERE codigo = ?`, [datos.codigo])
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
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

ipcMain.handle('hacer-backup', () => {
  try {
    const fs = require('fs')
    const pathMod = require('path')
    const { obtenerRutaBD } = require('./src/js/database')
    const ahora = new Date()
    const año = ahora.getFullYear()
    const mes = String(ahora.getMonth() + 1).padStart(2, '0')
    const dia = String(ahora.getDate()).padStart(2, '0')
    const sufijo = `${año}${mes}${dia}`
    const origen = obtenerRutaBD()
    const db = getDB()
    const cfgResult = db.exec('SELECT ruta_backup_bd FROM CONFIGURACION WHERE id_configuracion = 1')
    const carpetaDestino = (cfgResult.length && cfgResult[0].values[0][0]) || 'G:\\Mi unidad\\AulaVerde Backups'
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
    const ruta = pathMod.join(getRutaDescargas(), `productos_export_${sufijo}.csv`)
    fs.writeFileSync(ruta, '\uFEFF' + csv, 'utf8')
    return { ok: true, ruta }
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

      const existe = db.exec(`SELECT id_proveedor FROM PROVEEDORES WHERE nombre = ?`, [nombre])
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  win.loadFile('src/html/nueva-compra.html')
})

ipcMain.handle('extraer-factura-pdf', async (event, datos) => {
  try {
    const fs = require('fs')
    const pathMod = require('path')

    const db = getDB()
    const { descifrar } = require('./src/js/database')
    const cfgResult = db.exec('SELECT api_key_anthropic FROM CONFIGURACION WHERE id_configuracion = 1')
    if (!cfgResult.length || !cfgResult[0].values[0][0]) {
      return { ok: false, mensaje: 'No hay clave API configurada. Ve a Configuración y añade tu clave API de Anthropic.' }
    }
    const apiKey = descifrar(cfgResult[0].values[0][0])

    const ahora = new Date()
    const sufijo = `${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}_${Date.now()}`
    const nombreArchivo = `factura_${sufijo}.pdf`
    const carpetaLocal = getRutaDescargas()
    const cfgFacturas = db.exec('SELECT ruta_backup_facturas FROM CONFIGURACION WHERE id_configuracion = 1')
    const carpetaDrive = (cfgFacturas.length && cfgFacturas[0].values[0][0]) || 'G:\\Mi unidad\\AulaVerde Facturas'
    const rutaLocal = pathMod.join(carpetaLocal, nombreArchivo)

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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
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

// Siguiente código para el catálogo general, respetando el formato real usado
// desde la importación inicial (AV0001...AV0715): prefijo "AV" + 4 dígitos.
// Es un handler distinto de obtener-siguiente-codigo-producto (usado solo al
// crear un producto desde la revisión de una factura de proveedor) porque
// ese otro busca códigos puramente numéricos y no vería estos códigos "AV...".
ipcMain.handle('obtener-siguiente-codigo-catalogo', () => {
  try {
    const db = getDB()
    const result = db.exec("SELECT codigo FROM PRODUCTOS WHERE codigo LIKE 'AV%'")
    let maximo = 0
    if (result.length) {
      result[0].values.forEach(row => {
        const numero = parseInt(String(row[0]).replace(/^AV/i, ''), 10)
        if (!isNaN(numero) && numero > maximo) maximo = numero
      })
    }
    return 'AV' + String(maximo + 1).padStart(4, '0')
  } catch (e) {
    return 'AV0001'
  }
})

ipcMain.handle('obtener-id-iva-por-porcentaje', (event, porcentaje) => {
  const db = getDB()
  const result = db.exec(`SELECT id_iva FROM TIPOS_IVA WHERE porcentaje = ? AND activo = 1 LIMIT 1`, [porcentaje])
  if (result.length && result[0].values.length) return result[0].values[0][0]
  return 2
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
  const result = db.exec(`SELECT * FROM PRODUCTOS_PROVEEDOR WHERE id_proveedor = ? AND activo = 1`, [idProveedor])
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

    const idCompraResult = db.exec('SELECT last_insert_rowid()')
    const idCompra = idCompraResult[0].values[0][0]

    datos.lineas.forEach((linea, index) => {
      db.run(
        'INSERT INTO LINEAS_COMPRA (id_compra, numero_linea, nombre_proveedor, codigo_proveedor, id_producto, cantidad, precio_unitario, porcentaje_iva, importe_iva, total_linea) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          idCompra, index + 1, linea.nombre_proveedor, linea.codigo_proveedor || '',
          linea.id_producto || null, linea.cantidad, linea.precio_unitario,
          linea.porcentaje_iva, linea.importe_iva, linea.total_linea
        ]
      )
    })

    let correspondenciasNuevas = 0
    datos.lineas.forEach(linea => {
      if (!linea.id_producto) return
      try {
        db.run(
          'INSERT OR IGNORE INTO PRODUCTOS_PROVEEDOR (id_proveedor, nombre_proveedor, codigo_proveedor, id_producto, activo) VALUES (?, ?, ?, ?, 1)',
          [datos.idProveedor, linea.nombre_proveedor, linea.codigo_proveedor || '', linea.id_producto]
        )
        correspondenciasNuevas++
      } catch (e) {}
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
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
  const params = []
  if (filtros.idProveedor) {
    sql += ` AND c.id_proveedor = ?`
    params.push(filtros.idProveedor)
  }
  if (filtros.desde) {
    sql += ` AND c.fecha >= ?`
    params.push(filtros.desde)
  }
  if (filtros.hasta) {
    sql += ` AND c.fecha <= ?`
    params.push(filtros.hasta)
  }
  sql += ' ORDER BY c.fecha DESC, c.id_compra DESC'

  const result = db.exec(sql, params)
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

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

ipcMain.handle('exportar-listado-facturas', async (event, filtros) => {
  try {
    const db = getDB()
    const pathMod = require('path')
    const XLSX = require('xlsx')

    const comprasResult = db.exec(`
      SELECT c.id_compra, c.numero_factura, c.fecha, c.total_compra,
             p.nombre as nombre_proveedor, p.recargo_equivalencia
      FROM COMPRAS c
      JOIN PROVEEDORES p ON c.id_proveedor = p.id_proveedor
      WHERE c.fecha >= ? AND c.fecha <= ?
      ORDER BY c.fecha ASC, c.id_compra ASC
    `, [filtros.desde, filtros.hasta])

    if (!comprasResult.length || !comprasResult[0].values.length) {
      return { ok: false, mensaje: 'No hay facturas en el período seleccionado.' }
    }

    const colsCompra = comprasResult[0].columns
    const compras = comprasResult[0].values.map(row => {
      const obj = {}
      colsCompra.forEach((col, i) => obj[col] = row[i])
      return obj
    })

    const filas = []
    compras.forEach(compra => {
      const lineasResult = db.exec(`
        SELECT porcentaje_iva, SUM(total_linea / (1 + porcentaje_iva / 100.0)) as base,
               SUM(importe_iva) as iva
        FROM LINEAS_COMPRA
        WHERE id_compra = ?
        GROUP BY porcentaje_iva
      `, [compra.id_compra])

      let base4=0,iva4=0,recargo4=0,base10=0,iva10=0,recargo10=0,base21=0,iva21=0,recargo21=0,base0=0,iva0=0,recargo0=0,baseTotal=0

      if (lineasResult.length && lineasResult[0].values.length) {
        lineasResult[0].values.forEach(row => {
          const pct=Number(row[0]),base=Number(Number(row[1]).toFixed(2)),iva=Number(Number(row[2]).toFixed(2))
          baseTotal+=base
          const tieneRecargo=compra.recargo_equivalencia===1
          if(pct===4){base4=base;iva4=iva;recargo4=tieneRecargo?Number((base*0.005).toFixed(2)):0}
          else if(pct===10){base10=base;iva10=iva;recargo10=tieneRecargo?Number((base*0.014).toFixed(2)):0}
          else if(pct===21){base21=base;iva21=iva;recargo21=tieneRecargo?Number((base*0.052).toFixed(2)):0}
          else if(pct===0){base0=base;iva0=iva;recargo0=0}
        })
      }

      filas.push({
        'Nº Factura': compra.numero_factura, 'Fecha': compra.fecha, 'Proveedor': compra.nombre_proveedor,
        'Base': Number(baseTotal.toFixed(2)),
        'Base IVA 4%': base4||'', 'IVA 4% Superreducido': iva4||'', 'Rec. Equiv. 4%': recargo4||'',
        'Base IVA 10%': base10||'', 'IVA 10% Reducido': iva10||'', 'Rec. Equiv. 10%': recargo10||'',
        'Base IVA 21%': base21||'', 'IVA 21% General': iva21||'', 'Rec. Equiv. 21%': recargo21||'',
        'Base IVA 0%': base0||'', 'IVA 0% Exento': iva0||'', 'Rec. Equiv. 0%': recargo0||'',
        'Total': Number(compra.total_compra.toFixed(2))
      })
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [{wch:15},{wch:12},{wch:30},{wch:10},{wch:12},{wch:18},{wch:15},{wch:12},{wch:18},{wch:15},{wch:12},{wch:18},{wch:15},{wch:12},{wch:18},{wch:15},{wch:10}]
    XLSX.utils.book_append_sheet(wb, ws, 'Facturas recibidas')

    const nombreArchivo = `facturas_recibidas_${filtros.desde}_${filtros.hasta}.xlsx`
    const ruta = pathMod.join(getRutaDescargas(), nombreArchivo)
    XLSX.writeFile(wb, ruta)
    return { ok: true, ruta }

  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('obtener-detalle-compra', (event, idCompra) => {
  const db = getDB()
  const result = db.exec(`
    SELECT lc.*, p.nombre as nombre_producto
    FROM LINEAS_COMPRA lc
    LEFT JOIN PRODUCTOS p ON lc.id_producto = p.id_producto
    WHERE lc.id_compra = ?
    ORDER BY lc.numero_linea ASC
  `, [idCompra])
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
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

// ─── MÓDULO CLIENTES ─────────────────────────────────────────────────────

ipcMain.handle('abrir-clientes', () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'Clientes - Aula Verde',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  win.loadFile('src/html/clientes.html')
})

ipcMain.handle('obtener-clientes', () => {
  const db = getDB()
  const result = db.exec('SELECT * FROM CLIENTES ORDER BY nombre ASC')
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('crear-cliente', (event, datos) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    db.run(
      'INSERT INTO CLIENTES (nombre, tipo_cliente, telefono, prefijo_telefono, email, fecha_nacimiento, direccion, nif, notas, activo, descuento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
      [datos.nombre, datos.tipo_cliente||'PARTICULAR', datos.telefono, datos.prefijo_telefono||'+34', datos.email, datos.fecha_nacimiento||null, datos.direccion, datos.nif||'', datos.notas, datos.descuento||0]
    )
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('editar-cliente', (event, idCliente, datos) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    db.run(
      'UPDATE CLIENTES SET nombre=?, tipo_cliente=?, telefono=?, prefijo_telefono=?, email=?, fecha_nacimiento=?, direccion=?, nif=?, notas=?, descuento=? WHERE id_cliente=?',
      [datos.nombre, datos.tipo_cliente||'PARTICULAR', datos.telefono, datos.prefijo_telefono||'+34', datos.email, datos.fecha_nacimiento||null, datos.direccion, datos.nif||'', datos.notas, datos.descuento||0, idCliente]
    )
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('toggle-cliente', (event, idCliente, nuevoEstado) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    db.run('UPDATE CLIENTES SET activo=? WHERE id_cliente=?', [nuevoEstado, idCliente])
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('obtener-puntos-cliente', (event, idCliente) => {
  const db = getDB()
  const result = db.exec(`SELECT COALESCE(SUM(puntos), 0) as saldo FROM MOVIMIENTOS_PUNTOS WHERE id_cliente = ?`, [idCliente])
  const saldo = result.length && result[0].values.length ? result[0].values[0][0] : 0
  const movimientosResult = db.exec(`
    SELECT id_movimiento, tipo, puntos, fecha, descripcion
    FROM MOVIMIENTOS_PUNTOS WHERE id_cliente = ?
    ORDER BY fecha DESC, id_movimiento DESC
  `, [idCliente])
  const movimientos = []
  if (movimientosResult.length && movimientosResult[0].values.length) {
    const cols = movimientosResult[0].columns
    movimientosResult[0].values.forEach(row => {
      const obj = {}
      cols.forEach((col, i) => obj[col] = row[i])
      movimientos.push(obj)
    })
  }
  return { saldo, movimientos }
})

ipcMain.handle('obtener-historial-cliente', (event, idCliente) => {
  const db = getDB()
  const result = db.exec(`
    SELECT v.id_venta, v.numero_documento, v.fecha, v.hora, v.tipo_documento, v.estado, v.total_venta
    FROM VENTAS v WHERE v.id_cliente = ?
    ORDER BY v.fecha DESC, v.id_venta DESC
  `, [idCliente])
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('obtener-clientes-para-selector', () => {
  const db = getDB()
  const result = db.exec('SELECT id_cliente, nombre, telefono, descuento FROM CLIENTES WHERE activo = 1 ORDER BY nombre ASC')
  if (!result.length) return []
  const cols = result[0].columns
  return result[0].values.map(row => {
    const obj = {}
    cols.forEach((col, i) => obj[col] = row[i])
    return obj
  })
})

ipcMain.handle('importar-clientes-excel', async (event) => {
  try {
    const { dialog } = require('electron')
    const XLSX = require('xlsx')
    const win = BrowserWindow.fromWebContents(event.sender)
    const { filePaths, canceled } = await dialog.showOpenDialog(win, {
      title: 'Selecciona el Excel o CSV de clientes',
      filters: [{ name: 'Excel o CSV', extensions: ['xls', 'xlsx', 'csv'] }],
      properties: ['openFile']
    })
    if (canceled || !filePaths || filePaths.length === 0) {
      return { ok: false, mensaje: 'No se seleccionó ningún archivo' }
    }
    const rutaArchivo = filePaths[0]
    const libro = XLSX.readFile(rutaArchivo)
    const hoja = libro.Sheets[libro.SheetNames[0]]
    const filas = XLSX.utils.sheet_to_json(hoja)
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    let importados = 0, omitidos = 0
    filas.forEach(fila => {
      const nombre = (fila['Nombre']||fila['nombre']||'').toString().trim()
      const telefono = (fila['Teléfono']||fila['Telefono']||fila['telefono']||'').toString().trim()
      if (!nombre && !telefono) return
      const nombreFinal = nombre || telefono
      let existe
      if (telefono) {
        existe = db.exec(`SELECT id_cliente FROM CLIENTES WHERE telefono = ?`, [telefono])
      } else {
        existe = db.exec(`SELECT id_cliente FROM CLIENTES WHERE nombre = ?`, [nombreFinal])
      }
      if (existe.length && existe[0].values.length) { omitidos++; return }
      const email = (fila['Email']||fila['email']||'').toString().trim()
      const direccion = (fila['Dirección']||fila['Direccion']||'').toString().trim()
      const nif = (fila['NIF']||fila['nif']||'').toString().trim()
      const notas = (fila['Notas']||fila['notas']||'').toString().trim()
      db.run('INSERT INTO CLIENTES (nombre, telefono, email, direccion, nif, notas, activo, descuento) VALUES (?, ?, ?, ?, ?, ?, 1, 0)',
        [nombreFinal, telefono, email, direccion, nif, notas])
      importados++
    })
    guardarDB()
    return { ok: true, importados, omitidos }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('obtener-alertas-crm', () => {
  const db = getDB()
  const hoy = new Date()
  const cumpleanos = []
  const todosResult = db.exec(`SELECT id_cliente, nombre, fecha_nacimiento FROM CLIENTES WHERE activo = 1 AND fecha_nacimiento IS NOT NULL AND fecha_nacimiento != ''`)
  if (todosResult.length && todosResult[0].values.length) {
    todosResult[0].values.forEach(row => {
      const [id, nombre, fechaNac] = row
      const partes = String(fechaNac).split('-')
      if (partes.length !== 3) return
      const cumpleEsteAno = new Date(hoy.getFullYear(), parseInt(partes[1])-1, parseInt(partes[2]))
      const diffDias = Math.ceil((cumpleEsteAno - hoy) / (1000*60*60*24))
      if (diffDias >= 0 && diffDias <= 7) {
        cumpleanos.push({ id_cliente: id, nombre, fecha_nacimiento: fechaNac, dias: diffDias })
      }
    })
  }
  const fechaLimite = new Date()
  fechaLimite.setDate(fechaLimite.getDate() - 90)
  const fechaLimiteStr = fechaLimite.toISOString().split('T')[0]
  const inactivosResult = db.exec(`
    SELECT c.id_cliente, c.nombre, MAX(v.fecha) as ultima_compra
    FROM CLIENTES c JOIN VENTAS v ON v.id_cliente = c.id_cliente
    WHERE c.activo = 1 GROUP BY c.id_cliente
    HAVING MAX(v.fecha) < ? ORDER BY ultima_compra ASC
  `, [fechaLimiteStr])
  const inactivos = []
  if (inactivosResult.length && inactivosResult[0].values.length) {
    inactivosResult[0].values.forEach(row => {
      inactivos.push({ id_cliente: row[0], nombre: row[1], ultima_compra: row[2] })
    })
  }
  return { cumpleanos, inactivos }
})

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

// ─── EXPORTAR CATÁLOGO EXCEL ────────────────────────────────────────────────

ipcMain.handle('exportar-catalogo-excel', () => {
  try {
    const db = getDB()
    const pathMod = require('path')
    const XLSX = require('xlsx')

    const result = db.exec(`
      SELECT p.codigo, p.nombre, p.familia, p.tipo_venta,
      p.precio_venta, p.precio_coste, t.porcentaje as iva,
      CASE WHEN p.activo = 1 THEN 'Sí' ELSE 'No' END as activo
      FROM PRODUCTOS p
      JOIN TIPOS_IVA t ON p.id_iva = t.id_iva
      ORDER BY p.codigo ASC
    `)

    if (!result.length || !result[0].values.length) {
      return { ok: false, mensaje: 'No hay productos en el catálogo.' }
    }

    const filas = result[0].values.map(row => ({
      'Código': row[0], 'Nombre': row[1], 'Familia': row[2]||'',
      'Tipo venta': row[3], 'Precio venta (€)': Number(Number(row[4]).toFixed(2)),
      'Precio coste (€)': row[5] ? Number(Number(row[5]).toFixed(2)) : '',
      'IVA (%)': Number(row[6]), 'Activo': row[7]
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [{wch:12},{wch:35},{wch:18},{wch:12},{wch:16},{wch:16},{wch:10},{wch:8}]
    XLSX.utils.book_append_sheet(wb, ws, 'Catálogo de productos')

    const ahora = new Date()
    const sufijo = `${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}`
    const ruta = pathMod.join(getRutaDescargas(), `catalogo_productos_${sufijo}.xlsx`)
    XLSX.writeFile(wb, ruta)
    return { ok: true, ruta }

  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})
// ─── MÓDULO CONSENTIMIENTO RGPD ──────────────────────────────────────────────

ipcMain.handle('generar-consentimiento-pdf', async (event, cliente) => {
  try {
    const db = getDB()
    const cfgResult = db.exec('SELECT * FROM CONFIGURACION WHERE id_configuracion = 1')
    const cfg = {}
    if (cfgResult.length && cfgResult[0].values.length) {
      const cols = cfgResult[0].columns
      cfgResult[0].values[0].forEach((val, i) => cfg[cols[i]] = val)
    }
    const rutaDescargas = cfg.ruta_descargas || 'C:\\AulaVerde\\descargas'
    return await guardarConsentimientoPDF(cliente, cfg, rutaDescargas)
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('imprimir-consentimiento', async (event, cliente) => {
  try {
    const db = getDB()
    const cfgResult = db.exec('SELECT * FROM CONFIGURACION WHERE id_configuracion = 1')
    const cfg = {}
    if (cfgResult.length && cfgResult[0].values.length) {
      const cols = cfgResult[0].columns
      cfgResult[0].values[0].forEach((val, i) => cfg[cols[i]] = val)
    }
    return await imprimirConsentimiento(cliente, cfg)
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('guardar-consentimiento-cliente', (event, idCliente, datos) => {
  try {
    const db = getDB()
    const { guardarDB } = require('./src/js/database')
    const hoy = new Date().toISOString().split('T')[0]
    db.run(
      `UPDATE CLIENTES SET
        consentimiento_rgpd = ?,
        fecha_consentimiento_rgpd = ?,
        consentimiento_email_marketing = ?,
        consentimiento_whatsapp_marketing = ?,
        metodo_consentimiento = ?,
        pdf_consentimiento_path = ?
      WHERE id_cliente = ?`,
      [
        datos.consentimiento_rgpd ? 1 : 0,
        datos.consentimiento_rgpd ? hoy : null,
        datos.consentimiento_email_marketing ? 1 : 0,
        datos.consentimiento_whatsapp_marketing ? 1 : 0,
        datos.metodo_consentimiento || null,
        datos.pdf_consentimiento_path || null,
        idCliente
      ]
    )
    guardarDB()
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('adjuntar-documento-firmado', async (event, idCliente) => {
  try {
    const { dialog } = require('electron')
    const fs = require('fs')
    const pathMod = require('path')
    const { guardarDB } = require('./src/js/database')

    const win = BrowserWindow.fromWebContents(event.sender)
    const { filePaths, canceled } = await dialog.showOpenDialog(win, {
      title: 'Seleccionar documento firmado escaneado',
      filters: [
        { name: 'Documentos e imágenes', extensions: ['pdf', 'png', 'jpg', 'jpeg'] }
      ],
      properties: ['openFile']
    })

    if (canceled || !filePaths || filePaths.length === 0) {
      return { ok: false, mensaje: 'No se seleccionó ningún archivo' }
    }

    const db = getDB()
    const cfgResult = db.exec('SELECT ruta_descargas, nombre_tienda FROM CONFIGURACION WHERE id_configuracion = 1')
    const rutaDescargas = cfgResult.length && cfgResult[0].values[0][0]
      ? cfgResult[0].values[0][0]
      : 'C:\\AulaVerde\\descargas'

    if (!fs.existsSync(rutaDescargas)) fs.mkdirSync(rutaDescargas, { recursive: true })

    const ext = pathMod.extname(filePaths[0])
    const ahora = new Date()
    const sufijo = `${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}`
    const nombreDestino = `consentimiento_firmado_cliente${idCliente}_${sufijo}${ext}`
    const rutaDestino = pathMod.join(rutaDescargas, nombreDestino)

    fs.copyFileSync(filePaths[0], rutaDestino)

    db.run('UPDATE CLIENTES SET pdf_consentimiento_path = ? WHERE id_cliente = ?', [rutaDestino, idCliente])
    guardarDB()

    return { ok: true, ruta: rutaDestino }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

ipcMain.handle('abrir-documento-consentimiento', async (event, rutaPdf) => {
  try {
    const { shell } = require('electron')
    await shell.openPath(rutaPdf)
    return { ok: true }
  } catch (e) {
    return { ok: false, mensaje: e.message }
  }
})

