// src/js/rutas.js
//
// Función compartida para obtener la carpeta de descargas configurada por
// el usuario. Vivía antes dentro de main.js; se mueve aquí porque varios
// módulos de handlers distintos (ventas, catálogo, compras, configuración)
// la necesitan, y no tiene sentido que dependan de main.js para algo tan
// pequeño.

const fs = require('fs')
const { getDB } = require('./database')

function getRutaDescargas() {
  const db = getDB()
  const result = db.exec('SELECT ruta_descargas FROM CONFIGURACION WHERE id_configuracion = 1')
  const ruta = (result.length && result[0].values[0][0])
    ? result[0].values[0][0]
    : 'C:\\AulaVerde\\descargas'
  if (!fs.existsSync(ruta)) fs.mkdirSync(ruta, { recursive: true })
  return ruta
}

module.exports = { getRutaDescargas }