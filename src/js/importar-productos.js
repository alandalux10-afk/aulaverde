const fs = require('fs')
const path = require('path')
const { getDB, guardarDB } = require('./database')

const CSV_PATH = path.join(__dirname, '../../data/productos_aula_verde.csv')

function parsearCSV(contenido) {
  const lineas = contenido.split('\n').filter(l => l.trim() !== '')
  const cabecera = lineas[0].split(',').map(c => c.trim())
  const filas = []

  for (let i = 1; i < lineas.length; i++) {
    const valores = lineas[i].split(',')
    const fila = {}
    cabecera.forEach((col, idx) => {
      fila[col] = (valores[idx] || '').trim().replace(/"/g, '')
    })
    filas.push(fila)
  }

  return filas
}

function importarProductos() {
  const db = getDB()

  if (!fs.existsSync(CSV_PATH)) {
    console.error('No se encontró el archivo CSV en:', CSV_PATH)
    return { ok: false, mensaje: 'Archivo CSV no encontrado' }
  }

  const contenido = fs.readFileSync(CSV_PATH, 'latin1')
  const productos = parsearCSV(contenido)

  let importados = 0
  let errores = 0

  db.run('DELETE FROM PRODUCTOS')

  for (const p of productos) {
    try {
      const codigo = p.codigo || ''
      const codigo_barras = p.codigo_barras || ''
      const nombre = p.nombre || ''
      const familia = p.familia || ''
      const tipo_venta = p.tipo_venta === 'PESO' ? 'PESO' : 'UNIDAD'
      const precio_venta = parseFloat(p.precio_venta) || 0
      const id_iva = parseInt(p.id_iva) || 2
      const activo = p.activo === '1' ? 1 : 0

      if (!codigo || !nombre) {
        errores++
        continue
      }

      db.run(`
        INSERT INTO PRODUCTOS (codigo, codigo_barras, nombre, familia, tipo_venta, precio_venta, id_iva, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [codigo, codigo_barras, nombre, familia, tipo_venta, precio_venta, id_iva, activo])

      importados++
    } catch (e) {
      console.error('Error importando producto:', p.nombre, e.message)
      errores++
    }
  }

  guardarDB()

  console.log(`Importación completada: ${importados} productos importados, ${errores} errores`)
  return { ok: true, importados, errores }
}

module.exports = { importarProductos }