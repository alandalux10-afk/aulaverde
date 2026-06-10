const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { inicializarDB, getDB } = require('./src/js/database')
const { importarProductos } = require('./src/js/importar-productos')
const { guardarVenta } = require('./src/js/ventas')

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
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
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
