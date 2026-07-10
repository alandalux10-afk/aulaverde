// src/handlers/clientes.js
//
// Módulo de clientes (CRM): alta, edición, activar/desactivar, historial de
// compras, puntos de fidelización, importación desde Excel/CSV, y alertas
// de cumpleaños/inactividad.
//
// Extraído de main.js como parte de la reorganización del código en
// módulos más pequeños. La lógica de cada handler es EXACTAMENTE la misma
// que tenía antes en main.js, solo ha cambiado el sitio donde vive.

const path = require('path')
const { getDB, guardarDB } = require('../js/database')

function registrar(ipcMain, BrowserWindow) {
  ipcMain.handle('abrir-clientes', () => {
    const win = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'Clientes - Aula Verde',
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
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
}

module.exports = { registrar }