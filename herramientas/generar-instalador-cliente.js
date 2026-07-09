// herramientas/generar-instalador-cliente.js
//
// Genera un instalador de Windows personalizado para un cliente concreto:
// mismo código y funcionalidad de siempre, pero con el nombre de la app y
// (si se indica) el icono cambiados, para que en el ordenador del cliente
// se vea como "su" programa en vez de "Aula Verde TPV" en el Explorador de
// Windows, el acceso directo y el instalador.
//
// IMPORTANTE — qué cambia y qué no:
//   Cambia: el nombre del archivo instalador, el nombre del acceso directo,
//   el icono, y el nombre que ve Windows en "Aplicaciones instaladas".
//   NO cambia: el contenido de dentro de la aplicación (tickets, facturas,
//   la cabecera del TPV), que sigue diciendo "Aula Verde", igual que ahora.
//
// Uso:
//   node herramientas/generar-instalador-cliente.js "Ferretería López TPV"
//   node herramientas/generar-instalador-cliente.js "Ferretería López TPV" ruta\al\icono.ico
//
// El icono (segundo argumento, opcional) debe ser un archivo .ico real de
// verdad (no un .png o .jpg renombrado). Si no se indica ninguno, se usa
// el icono genérico de Electron, igual que en el instalador de siempre.
//
// Este script SIEMPRE deja package.json exactamente como estaba al
// terminar (tanto si todo va bien como si hay un error a mitad), para que
// nunca quede "contaminado" con el nombre de un cliente concreto.

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const RUTA_PACKAGE = path.join(__dirname, '..', 'package.json')
const RUTA_BACKUP = path.join(__dirname, '..', 'package.json.backup-temporal')

function slug(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos (é, í, ñ...)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function main() {
  const nombreProducto = process.argv[2]
  const rutaIcono = process.argv[3]

  if (!nombreProducto) {
    console.log('Uso: node herramientas/generar-instalador-cliente.js "Nombre para el cliente" [ruta\\al\\icono.ico]')
    process.exit(1)
  }

  if (rutaIcono) {
    if (!fs.existsSync(rutaIcono)) {
      console.error(`❌ No se encuentra el icono en: ${rutaIcono}`)
      process.exit(1)
    }
    if (path.extname(rutaIcono).toLowerCase() !== '.ico') {
      console.error('❌ El icono debe ser un archivo .ico de verdad (no .png ni .jpg renombrado).')
      console.error('   Puedes convertir una imagen cuadrada a .ico en convertio.co o icoconvert.com')
      process.exit(1)
    }
  }

  if (fs.existsSync(RUTA_BACKUP)) {
    console.error('❌ Ya existe package.json.backup-temporal — parece que una generación anterior no terminó bien.')
    console.error('   Antes de continuar: comprueba a mano si package.json tiene el nombre de un cliente antiguo')
    console.error('   (en ese caso, copia package.json.backup-temporal encima de package.json), y luego borra')
    console.error('   package.json.backup-temporal para poder volver a usar esta herramienta.')
    process.exit(1)
  }

  const original = fs.readFileSync(RUTA_PACKAGE, 'utf8')
  const config = JSON.parse(original)

  fs.writeFileSync(RUTA_BACKUP, original)

  try {
    config.build.productName = nombreProducto
    config.build.appId = 'es.aulaverde.tpv.' + slug(nombreProducto)
    if (rutaIcono) {
      config.build.win = config.build.win || {}
      config.build.win.icon = path.resolve(rutaIcono)
    }

    fs.writeFileSync(RUTA_PACKAGE, JSON.stringify(config, null, 2) + '\n')

    console.log(`\n🔨 Generando instalador para: ${nombreProducto}`)
    if (rutaIcono) console.log(`   Icono: ${rutaIcono}`)
    console.log('   (esto puede tardar varios minutos)\n')

    execSync('npx electron-builder', { stdio: 'inherit', cwd: path.join(__dirname, '..') })

    console.log(`\n✅ Instalador generado en la carpeta dist\\, con el nombre "${nombreProducto} Setup <version>.exe"`)
  } finally {
    // Pase lo que pase (éxito o error a mitad), se restaura SIEMPRE el
    // package.json original, para no dejar el proyecto compartido
    // "contaminado" con el nombre de un cliente concreto.
    fs.writeFileSync(RUTA_PACKAGE, original)
    fs.unlinkSync(RUTA_BACKUP)
    console.log('↩️  package.json restaurado a su estado original.')
  }
}

main()
