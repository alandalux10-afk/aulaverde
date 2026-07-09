// src/handlers/consentimiento.js
//
// Módulo de consentimiento RGPD: generación y envío del documento de
// consentimiento, y registro de qué ha aceptado cada cliente.
//
// Extraído de main.js como parte de la reorganización del código en
// módulos más pequeños y fáciles de mantener (antes todo — 78 canales de
// 8 áreas distintas — estaba junto en un único archivo de casi 2000
// líneas). La lógica de cada handler es EXACTAMENTE la misma que tenía
// antes en main.js, solo ha cambiado el sitio donde vive.

const { getDB, guardarDB } = require('../js/database')
const { guardarConsentimientoPDF, imprimirConsentimiento } = require('../js/consentimiento')

function registrar(ipcMain, BrowserWindow) {
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
}

module.exports = { registrar }
