// src/handlers/catalogo.js
//
// Módulo del catálogo de productos: listado con filtros, alta, edición,
// activar/desactivar, código automático y exportación a Excel.
//
// Extraído de main.js como parte de la reorganización del código en
// módulos más pequeños. La lógica de cada handler es EXACTAMENTE la misma
// que tenía antes en main.js, solo ha cambiado el sitio donde vive.

const path = require('path')
const { getDB, guardarDB } = require('../js/database')
const { getRutaDescargas } = require('../js/rutas')

function registrar(ipcMain, BrowserWindow) {
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
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    win.loadFile('src/html/catalogo.html')
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
}

module.exports = { registrar }