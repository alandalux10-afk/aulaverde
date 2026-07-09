// Nota de seguridad: esta ventana no tiene acceso a Node.js (nodeIntegration
// desactivado). El objeto "ipcRenderer" lo proporciona preload.js de forma
// controlada y segura.

document.getElementById('btn-activar').addEventListener('click', async () => {
  const campo = document.getElementById('campo-licencia')
  const mensajeEl = document.getElementById('mensaje')
  const btn = document.getElementById('btn-activar')
  const clave = campo.value.trim()

  mensajeEl.className = 'mensaje'
  mensajeEl.textContent = ''

  if (!clave) {
    mensajeEl.className = 'mensaje error'
    mensajeEl.textContent = 'Introduce la clave de licencia.'
    return
  }

  btn.disabled = true
  btn.textContent = 'Comprobando...'

  try {
    const resultado = await ipcRenderer.invoke('activar-licencia', clave)

    if (resultado.ok) {
      mensajeEl.className = 'mensaje ok'
      mensajeEl.textContent = `✅ Licencia activada correctamente para "${resultado.payload.cliente}". Abriendo la aplicación...`
      // La propia ventana se cierra desde main.js al abrir el TPV, no hace falta hacer nada más aquí.
    } else {
      btn.disabled = false
      btn.textContent = 'Activar'
      mensajeEl.className = 'mensaje error'
      mensajeEl.textContent = '❌ ' + resultado.motivo
    }
  } catch (e) {
    // Si esto sale, algo ha fallado de verdad en la comunicación con la app
    // (por ejemplo, un handler que no llegó a registrarse) — antes esto se
    // quedaba colgado en "Comprobando..." sin ninguna explicación.
    btn.disabled = false
    btn.textContent = 'Activar'
    mensajeEl.className = 'mensaje error'
    mensajeEl.textContent = '❌ Error inesperado: ' + e.message
  }
})

document.getElementById('campo-licencia').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    document.getElementById('btn-activar').click()
  }
})
