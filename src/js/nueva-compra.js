// Nota de seguridad: antes se hacía "const { ipcRenderer } = require('electron')"
// aquí. Ya no hace falta ni es posible: con nodeIntegration desactivado esta
// ventana no tiene acceso a Node.js. El objeto "ipcRenderer" que se usa más
// abajo lo proporciona ahora preload.js de forma controlada y segura.
let archivoSeleccionado = null

// Cargar proveedores activos en el selector
async function cargarProveedores() {
  const proveedores = await ipcRenderer.invoke('obtener-proveedores')
  const select = document.getElementById('selector-proveedor')
  proveedores
    .filter(p => p.activo)
    .forEach(p => {
      const option = document.createElement('option')
      option.value = p.id_proveedor
      option.textContent = p.nombre
      select.appendChild(option)
    })
}

// Activar botón solo si hay proveedor y PDF seleccionados
function verificarListo() {
  const proveedorOk = document.getElementById('selector-proveedor').value !== ''
  const pdfOk = archivoSeleccionado !== null
  document.getElementById('btn-extraer').disabled = !(proveedorOk && pdfOk)
}

document.getElementById('selector-proveedor').addEventListener('change', verificarListo)

// Selección de archivo por clic
document.getElementById('input-pdf').addEventListener('change', function () {
  if (this.files.length > 0) {
    seleccionarArchivo(this.files[0])
  }
})

// Arrastrar y soltar
const zonaDrop = document.getElementById('zona-drop')

zonaDrop.addEventListener('dragover', (e) => {
  e.preventDefault()
  zonaDrop.classList.add('arrastrando')
})

zonaDrop.addEventListener('dragleave', () => {
  zonaDrop.classList.remove('arrastrando')
})

zonaDrop.addEventListener('drop', (e) => {
  e.preventDefault()
  zonaDrop.classList.remove('arrastrando')
  const archivo = e.dataTransfer.files[0]
  if (archivo && archivo.type === 'application/pdf') {
    seleccionarArchivo(archivo)
  } else {
    mostrarEstado('Solo se admiten archivos PDF.', 'error')
  }
})

function seleccionarArchivo(archivo) {
  archivoSeleccionado = archivo
  document.getElementById('nombre-archivo').textContent = archivo.name
  document.getElementById('archivo-seleccionado').style.display = 'flex'
  document.getElementById('zona-drop').style.display = 'none'
  ocultarEstado()
  verificarListo()
}

document.getElementById('btn-quitar-archivo').addEventListener('click', () => {
  archivoSeleccionado = null
  document.getElementById('archivo-seleccionado').style.display = 'none'
  document.getElementById('zona-drop').style.display = 'block'
  document.getElementById('input-pdf').value = ''
  ocultarEstado()
  verificarListo()
})

// Botón cancelar
document.getElementById('btn-cancelar').addEventListener('click', () => {
  window.close()
})

// Botón extraer datos con IA
document.getElementById('btn-extraer').addEventListener('click', async () => {
  const idProveedor = document.getElementById('selector-proveedor').value
  const nombreProveedor = document.getElementById('selector-proveedor').selectedOptions[0].textContent

  mostrarEstado('🤖 Enviando factura a la IA... esto puede tardar unos segundos.', 'procesando')
  document.getElementById('btn-extraer').disabled = true

  try {
    // Leer el PDF como base64
    const base64 = await leerArchivoComoBase64(archivoSeleccionado)

    // Llamar al handler IPC que hace la llamada a la API
    const resultado = await ipcRenderer.invoke('extraer-factura-pdf', {
      idProveedor,
      nombreProveedor,
      nombreArchivo: archivoSeleccionado.name,
      base64
    })

    if (resultado.ok) {
      mostrarEstado('✅ Datos extraídos correctamente. Abriendo ventana de revisión...', 'exito')
      // Pequeña pausa para que el usuario vea el mensaje
      setTimeout(() => {
        ipcRenderer.invoke('abrir-revision-compra', resultado.datos, idProveedor, nombreProveedor, resultado.rutaPdf)
        window.close()
      }, 1000)
    } else {
      mostrarEstado('❌ Error: ' + resultado.mensaje, 'error')
      document.getElementById('btn-extraer').disabled = false
    }
  } catch (e) {
    mostrarEstado('❌ Error inesperado: ' + e.message, 'error')
    document.getElementById('btn-extraer').disabled = false
  }
})

function leerArchivoComoBase64(archivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(archivo)
  })
}

function mostrarEstado(texto, tipo) {
  const zona = document.getElementById('zona-estado')
  const msg = document.getElementById('mensaje-estado')
  msg.textContent = texto
  msg.className = tipo
  zona.style.display = 'block'
}

function ocultarEstado() {
  document.getElementById('zona-estado').style.display = 'none'
}

cargarProveedores()
