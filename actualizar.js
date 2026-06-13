const fs = require('fs')

let contenido = fs.readFileSync('src/js/impresora.js', 'utf8')

contenido = contenido.replace(
  'body { font-family: monospace; font-size: 10px; width: 68mm; padding: 0 1mm; margin: 0; }',
  'body { font-family: monospace; font-size: 11px; width: 68mm; padding: 0 1mm; margin: 0; font-weight: bold; -webkit-font-smoothing: none; }'
)

fs.writeFileSync('src/js/impresora.js', contenido)
console.log('OK')
