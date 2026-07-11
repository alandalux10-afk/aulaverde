const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { inicializarDB, getDB } = require('./src/js/database')
const { importarProductos } = require('./src/js/importar-productos')

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

// ─── MÓDULO VENTAS (núcleo del TPV) ──────────────────────────────────────────
// (extraído a src/handlers/ventas.js — misma lógica, otro archivo)
require('./src/handlers/ventas').registrar(ipcMain, BrowserWindow)

// ─── MÓDULO CONFIGURACIÓN ────────────────────────────────────────────────────
// (extraído a src/handlers/configuracion.js — misma lógica, otro archivo)
require('./src/handlers/configuracion').registrar(ipcMain, BrowserWindow)

// ─── MÓDULO CATÁLOGO ──────────────────────────────────────────────────────────
// (extraído a src/handlers/catalogo.js — misma lógica, otro archivo)
require('./src/handlers/catalogo').registrar(ipcMain, BrowserWindow)

// ─── MÓDULO COMPRAS Y PROVEEDORES ────────────────────────────────────────────
// (extraído a src/handlers/compras.js — misma lógica, otro archivo)
require('./src/handlers/compras').registrar(ipcMain, BrowserWindow)

// ─── MÓDULO CLIENTES ─────────────────────────────────────────────────────
// (extraído a src/handlers/clientes.js — misma lógica, otro archivo)
require('./src/handlers/clientes').registrar(ipcMain, BrowserWindow)

// ─── MÓDULO COMUNICACIÓN (Email, WhatsApp, Campañas) ─────────────────────────
// (extraído a src/handlers/comunicacion.js — misma lógica, otro archivo)
require('./src/handlers/comunicacion').registrar(ipcMain, BrowserWindow)

// ─── MÓDULO CONSENTIMIENTO RGPD ──────────────────────────────────────────────
// (extraído a src/handlers/consentimiento.js — misma lógica, otro archivo)
require('./src/handlers/consentimiento').registrar(ipcMain, BrowserWindow)