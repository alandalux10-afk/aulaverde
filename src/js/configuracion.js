const { ipcRenderer } = require('electron')

// Cargar datos al abrir la pantalla
async function cargarConfiguracion() {
  const cfg = await ipcRenderer.invoke('obtener-configuracion')
  if (cfg) {
    document.getElementById('nombre_tienda').value = cfg.nombre_tienda || ''
    document.getElementById('razon_social').value = cfg.razon_social || ''
    document.getElementById('nif_vendedor').value = cfg.nif_vendedor || ''
    document.getElementById('direccion').value = cfg.direccion || ''
    document.getElementById('telefono').value = cfg.telefono || ''
    document.getElementById('email').value = cfg.email || ''
    document.getElementById('impresora_ticket').value = cfg.impresora_ticket || ''
    document.getElementById('impresora_factura').value = cfg.impresora_factura || ''
  }
}

// Guardar cambios
document.getElementById('btn-guardar').addEventListener('click', async () => {
  const datos = {
    nombre_tienda: document.getElementById('nombre_tienda').value,
    razon_social: document.getElementById('razon_social').value,
    nif_vendedor: document.getElementById('nif_vendedor').value,
    direccion: document.getElementById('direccion').value,
    telefono: document.getElementById('telefono').value,
    email: document.getElementById('email').value,
    impresora_ticket: document.getElementById('impresora_ticket').value,
    impresora_factura: document.getElementById('impresora_factura').value
  }

  const resultado = await ipcRenderer.invoke('guardar-configuracion', datos)
  const msg = document.getElementById('mensaje')

 if (resultado.ok) {
    alert('✅ Configuración guardada correctamente')
  } else {
    alert('❌ Error al guardar: ' + resultado.mensaje)
  }
})

// Cerrar ventana
document.getElementById('btn-backup').addEventListener('click', async () => {
  const resultado = await ipcRenderer.invoke('hacer-backup')
  if (resultado.ok) {
    alert('✅ Copia de seguridad guardada en:\n' + resultado.ruta)
  } else {
    alert('❌ Error al hacer la copia: ' + resultado.mensaje)
  }
})
document.getElementById('btn-cerrar').addEventListener('click', () => {
  window.close()
})

cargarConfiguracion()
