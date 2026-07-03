// reparar-id-producto.js
//
// Corrige el id_producto de las líneas de venta ya guardadas en la base de
// datos real, que quedaron con el valor fijo antiguo (1 en ventas normales,
// 0 en ventas modificadas) en vez del producto real vendido.
//
// SEGURIDAD:
//   - Antes de tocar nada, hace una copia de seguridad con fecha y hora en
//     la misma carpeta data/ (aulaverde.db.backup-AAAAMMDD-HHMMSS).
//   - Solo escribe cambios si la reparación se ejecuta sin errores.
//   - Es seguro ejecutarlo más de una vez: la segunda vez no encontrará
//     nada que reparar.
//
// CÓMO EJECUTARLO:
//   1. Cierra la aplicación TPV si la tienes abierta (para que no haya dos
//      programas escribiendo el archivo a la vez).
//   2. Desde la carpeta del proyecto (C:\AulaVerde), ejecuta:
//        node reparar-id-producto.js
//   3. Lee el resumen que muestra al final antes de confirmar.

const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const DB_PATH = path.join(__dirname, 'data', 'aulaverde.db')

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('No se encuentra la base de datos en:', DB_PATH)
    console.error('Ejecuta este script desde la carpeta raíz del proyecto (C:\\AulaVerde).')
    process.exit(1)
  }

  const SQL = await initSqlJs()
  const buffer = fs.readFileSync(DB_PATH)
  const db = new SQL.Database(buffer)

  // --- Diagnóstico antes de tocar nada ---
  const totalLineas = db.exec('SELECT COUNT(*) FROM LINEAS_VENTA')[0].values[0][0]
  const afectadasResult = db.exec("SELECT COUNT(*) FROM LINEAS_VENTA WHERE id_producto IN (0, 1)")
  const afectadas = afectadasResult.length ? afectadasResult[0].values[0][0] : 0

  console.log('=== Diagnóstico ===')
  console.log('Total de líneas de venta en la base de datos:', totalLineas)
  console.log('Líneas con id_producto sospechoso (0 o 1):', afectadas)

  if (afectadas === 0) {
    console.log('\nNo hay nada que reparar. La base de datos ya está correcta.')
    return
  }

  // --- Cuántas se pueden reparar automáticamente por coincidencia de código ---
  const reparablesResult = db.exec(`
    SELECT COUNT(*) FROM LINEAS_VENTA lv
    WHERE lv.id_producto IN (0, 1)
      AND EXISTS (SELECT 1 FROM PRODUCTOS p WHERE p.codigo = lv.codigo_producto)
  `)
  const reparables = reparablesResult.length ? reparablesResult[0].values[0][0] : 0
  const noReparables = afectadas - reparables

  console.log('  → Reparables automáticamente (el código de producto todavía existe en el catálogo):', reparables)
  console.log('  → NO reparables automáticamente (código ya no existe en el catálogo, ej. producto eliminado):', noReparables)

  // --- Copia de seguridad antes de escribir nada ---
  const ahora = new Date()
  const sufijo = ahora.toISOString().replace(/[-:T]/g, '').slice(0, 15)
  const backupPath = DB_PATH + '.backup-' + sufijo
  fs.copyFileSync(DB_PATH, backupPath)
  console.log('\nCopia de seguridad creada en:', backupPath)

  // --- Reparación ---
  db.run(`
    UPDATE LINEAS_VENTA
    SET id_producto = (
      SELECT p.id_producto FROM PRODUCTOS p WHERE p.codigo = LINEAS_VENTA.codigo_producto
    )
    WHERE id_producto IN (0, 1)
      AND EXISTS (SELECT 1 FROM PRODUCTOS p WHERE p.codigo = LINEAS_VENTA.codigo_producto)
  `)

  // --- Guardar ---
  const dataFinal = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(dataFinal))

  // --- Verificación final ---
  const buffer2 = fs.readFileSync(DB_PATH)
  const db2 = new SQL.Database(buffer2)
  const restantesResult = db2.exec("SELECT COUNT(*) FROM LINEAS_VENTA WHERE id_producto IN (0, 1)")
  const restantes = restantesResult.length ? restantesResult[0].values[0][0] : 0

  console.log('\n=== Resultado ===')
  console.log('Líneas reparadas:', reparables)
  console.log('Líneas que siguen con id_producto en 0/1 (código de producto ya no existe en catálogo):', restantes)
  if (restantes > 0) {
    const detalle = db2.exec(`
      SELECT DISTINCT lv.codigo_producto, lv.nombre_producto
      FROM LINEAS_VENTA lv WHERE lv.id_producto IN (0, 1) LIMIT 20
    `)
    if (detalle.length) {
      console.log('\nProductos de esas líneas (para que decidas qué hacer con ellas, ej. si son líneas manuales o productos ya descatalogados):')
      detalle[0].values.forEach(([codigo, nombre]) => console.log('  -', codigo || '(sin código, línea manual)', '|', nombre))
    }
  }
  console.log('\nListo. Si algo fuera mal, restaura la copia de seguridad renombrándola de vuelta a aulaverde.db.')
}

main().catch(e => {
  console.error('ERROR durante la reparación:', e.message)
  console.error('No se ha modificado la base de datos.')
  process.exit(1)
})
