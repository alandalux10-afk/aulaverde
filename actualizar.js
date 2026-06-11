const fs = require('fs')

let contenido = fs.readFileSync('src/js/tpv.js', 'utf8')

const codigo = "\r\n// Abrir resumen\r\ndocument.getElementById('btn-resumen').addEventListener('click', () => {\r\n  ipcRenderer.invoke('abrir-resumen')\r\n})\r\n"

fs.writeFileSync('src/js/tpv.js', contenido + codigo)
console.log('OK')
