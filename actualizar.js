const fs = require('fs')

let contenido = fs.readFileSync('main.js', 'utf8')

const nuevoCodigo = [
  "",
  "ipcMain.handle('obtener-ventas', (event, desde, hasta) => {",
  "  const db = getDB()",
  "  const sql = \"SELECT v.id_venta, v.numero_documento, v.fecha, v.hora, v.cliente, v.estado, v.tipo_documento, v.total_venta, f.nombre as forma_pago FROM VENTAS v JOIN FORMAS_PAGO f ON v.id_forma_pago = f.id_forma_pago WHERE v.fecha >= '\" + desde + \"' AND v.fecha <= '\" + hasta + \"' ORDER BY v.id_venta DESC\"",
  "  const resultados = db.exec(sql)",
  "  if (!resultados.length) return []",
  "  const cols = resultados[0].columns",
  "  return resultados[0].values.map(row => {",
  "    const obj = {}",
  "    cols.forEach((col, i) => obj[col] = row[i])",
  "    return obj",
  "  })",
  "})",
  "",
  "ipcMain.handle('eliminar-venta', (event, idVenta) => {",
  "  const db = getDB()",
  "  const { guardarDB } = require('./src/js/database')",
  "  db.run('DELETE FROM LINEAS_VENTA WHERE id_venta = ?', [idVenta])",
  "  db.run('DELETE FROM VENTAS WHERE id_venta = ?', [idVenta])",
  "  guardarDB()",
  "  return { ok: true }",
  "})",
  ""
].join('\r\n')

fs.writeFileSync('main.js', contenido + nuevoCodigo)
console.log('OK: ' + (fs.readFileSync('main.js','utf8').includes('obtener-ventas') ? 'ENCONTRADO' : 'NO ENCONTRADO'))
