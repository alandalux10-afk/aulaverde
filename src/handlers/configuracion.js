// src/handlers/configuracion.js
//
// Módulo de configuración de la tienda: datos fiscales, SMTP, rutas de
// backup, copia de seguridad manual y exportación de CSV de productos.
//
// Extraído de main.js como parte de la reorganización del código en
// módulos más pequeños. La lógica de cada handler es EXACTAMENTE la misma
// que tenía antes en main.js, solo ha cambiado el sitio donde vive.

const path = require('path')
const { getDB, guardarDB, cifrar, descifrar, obtenerRutaBD } = require('../js/database')
const { getRutaDescargas } = require('../js/rutas')

function registrar(ipcMain, BrowserWindow) {
  ipcMain.handle('obtener-configuracion', () => {
    const db = getDB()
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
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    win.loadFile('src/html/configuracion.html')
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
}

module.exports = { registrar }