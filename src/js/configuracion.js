// Nota de seguridad: antes se hacía "const { ipcRenderer } = require('electron')"
// aquí. Ya no hace falta ni es posible: con nodeIntegration desactivado esta
// ventana no tiene acceso a Node.js. El objeto "ipcRenderer" que se usa más
// abajo lo proporciona ahora preload.js de forma controlada y segura.
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
    document.getElementById('api_key_anthropic').value = cfg.api_key_anthropic || ''
    document.getElementById('puntos_euros_por_punto').value = cfg.puntos_euros_por_punto || 10
    document.getElementById('puntos_valor_canje').value = cfg.puntos_valor_canje || 5
    document.getElementById('smtp_host').value = cfg.smtp_host || ''
    document.getElementById('smtp_puerto').value = cfg.smtp_puerto || ''
    document.getElementById('smtp_usuario').value = cfg.smtp_usuario || ''
    document.getElementById('smtp_password').value = cfg.smtp_password || ''
    document.getElementById('smtp_email_remitente').value = cfg.smtp_email_remitente || ''
    document.getElementById('ruta_descargas').value = cfg.ruta_descargas || 'C:\\AulaVerde\\descargas'
  }
}

function recogerDatos() {
  return {
    nombre_tienda: document.getElementById('nombre_tienda').value,
    razon_social: document.getElementById('razon_social').value,
    nif_vendedor: document.getElementById('nif_vendedor').value,
    direccion: document.getElementById('direccion').value,
    telefono: document.getElementById('telefono').value,
    email: document.getElementById('email').value,
    impresora_ticket: document.getElementById('impresora_ticket').value,
    impresora_factura: document.getElementById('impresora_factura').value,
    api_key_anthropic: document.getElementById('api_key_anthropic').value,
    puntos_euros_por_punto: parseFloat(document.getElementById('puntos_euros_por_punto').value) || 10,
    puntos_valor_canje: parseFloat(document.getElementById('puntos_valor_canje').value) || 5,
    smtp_host: document.getElementById('smtp_host').value,
    smtp_puerto: parseInt(document.getElementById('smtp_puerto').value) || null,
    smtp_usuario: document.getElementById('smtp_usuario').value,
    smtp_password: document.getElementById('smtp_password').value,
    smtp_email_remitente: document.getElementById('smtp_email_remitente').value,
    ruta_descargas: document.getElementById('ruta_descargas').value || 'C:\\AulaVerde\\descargas'
  }
}

document.getElementById('btn-guardar').addEventListener('click', async () => {
  const resultado = await ipcRenderer.invoke('guardar-configuracion', recogerDatos())
  if (resultado.ok) {
    alert('✅ Configuración guardada correctamente')
  } else {
    alert('❌ Error al guardar: ' + resultado.mensaje)
  }
})

document.getElementById('btn-seleccionar-carpeta').addEventListener('click', async () => {
  const carpeta = await ipcRenderer.invoke('seleccionar-carpeta-descargas')
  if (carpeta) {
    document.getElementById('ruta_descargas').value = carpeta
  }
})

document.getElementById('btn-probar-smtp').addEventListener('click', async () => {
  const resultadoEl = document.getElementById('smtp-resultado')
  resultadoEl.textContent = 'Probando conexión...'
  resultadoEl.style.color = '#555'

  await ipcRenderer.invoke('guardar-configuracion', recogerDatos())

  const resultado = await ipcRenderer.invoke('probar-conexion-smtp')
  if (resultado.ok) {
    resultadoEl.textContent = '✅ Conexión correcta'
    resultadoEl.style.color = '#155724'
  } else {
    resultadoEl.textContent = '❌ ' + resultado.mensaje
    resultadoEl.style.color = '#721c24'
  }
})

document.getElementById('btn-backup').addEventListener('click', async () => {
  const resultado = await ipcRenderer.invoke('hacer-backup')
  if (resultado.ok) {
    alert('✅ Copia de seguridad guardada en:\n' + resultado.ruta)
  } else {
    alert('❌ Error al hacer la copia: ' + resultado.mensaje)
  }
})

document.getElementById('btn-importar-csv').addEventListener('click', async () => {
  const confirmar = confirm('¿Importar productos desde el CSV? Esto reemplazará todos los productos actuales.')
  if (!confirmar) return
  const resultado = await ipcRenderer.invoke('importar-productos')
  if (resultado.ok) {
    alert(`✅ Importación completada:\n${resultado.importados} productos importados\n${resultado.errores} errores`)
  } else {
    alert('❌ Error: ' + resultado.mensaje)
  }
})

document.getElementById('btn-exportar-csv').addEventListener('click', async () => {
  const resultado = await ipcRenderer.invoke('exportar-csv')
  if (resultado.ok) {
    alert('✅ CSV exportado correctamente en:\n' + resultado.ruta)
  } else {
    alert('❌ Error al exportar: ' + resultado.mensaje)
  }
})

document.getElementById('btn-exportar-excel-cat').addEventListener('click', async () => {
  const resultado = await ipcRenderer.invoke('exportar-catalogo-excel')
  if (resultado.ok) {
    alert('✅ Catálogo Excel exportado en:\n' + resultado.ruta)
  } else {
    alert('❌ Error al exportar: ' + resultado.mensaje)
  }
})

document.getElementById('btn-cerrar').addEventListener('click', () => {
  window.close()
})

cargarConfiguracion()
