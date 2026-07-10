// src/handlers/comunicacion.js
//
// Módulo de comunicación con clientes: plantillas de email y WhatsApp,
// envío individual, prueba de conexión SMTP, y campañas masivas (por
// cumpleaños, inactividad, etc.).
//
// Extraído de main.js como parte de la reorganización del código en
// módulos más pequeños. La lógica de cada handler es EXACTAMENTE la misma
// que tenía antes en main.js, solo ha cambiado el sitio donde vive.

const path = require('path')
const { getDB, guardarDB } = require('../js/database')

function registrar(ipcMain, BrowserWindow) {
  // ─── Email ──────────────────────────────────────────────────────────────

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
      db.run('UPDATE PLANTILLAS_EMAIL SET asunto=?, cuerpo=? WHERE id_plantilla=?', [datos.asunto, datos.cuerpo, idPlantilla])
      guardarDB()
      return { ok: true }
    } catch (e) {
      return { ok: false, mensaje: e.message }
    }
  })

  ipcMain.handle('probar-conexion-smtp', async () => {
    const { probarConexionSmtp } = require('../js/email')
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
      const { enviarEmailCliente } = require('../js/email')
      return await enviarEmailCliente(cliente, plantilla)
    } catch (e) {
      return { ok: false, mensaje: e.message }
    }
  })

  // ─── WhatsApp ───────────────────────────────────────────────────────────

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

  // ─── Campañas ───────────────────────────────────────────────────────────

  ipcMain.handle('abrir-campanas', () => {
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      title: 'Campañas - Aula Verde',
      webPreferences: { preload: path.join(__dirname, '..', '..', 'preload.js'), nodeIntegration: false, contextIsolation: true }
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
    const { enviarEmailCliente } = require('../js/email')
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
}

module.exports = { registrar }
