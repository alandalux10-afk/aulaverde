const { ipcRenderer } = require('electron')

let canalSeleccionado = 'email'
let segmentoSeleccionado = 'todos'
let tipoMensaje = 'plantilla'
let destinatarios = []
let plantillasEmail = []
let plantillasWhatsapp = []

document.addEventListener('DOMContentLoaded', async () => {
  plantillasEmail = await ipcRenderer.invoke('obtener-plantillas-email')
  plantillasWhatsapp = await ipcRenderer.invoke('obtener-plantillas-whatsapp')
})

// ─── Canal ───────────────────────────────────────────────────────────────────

document.querySelectorAll('.btn-canal').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-canal').forEach(b => b.classList.remove('activo'))
    btn.classList.add('activo')
    canalSeleccionado = btn.dataset.canal
    actualizarVisibilidadAsunto()
    document.getElementById('bloque-destinatarios').style.display = 'none'
    document.getElementById('bloque-resultado').style.display = 'none'
  })
})

// ─── Segmentación ────────────────────────────────────────────────────────────

document.querySelectorAll('.btn-segmento').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-segmento').forEach(b => b.classList.remove('activo'))
    btn.classList.add('activo')
    segmentoSeleccionado = btn.dataset.segmento
    document.getElementById('filtro-cumpleanos').style.display = segmentoSeleccionado === 'cumpleanos' ? 'flex' : 'none'
    document.getElementById('filtro-inactivos').style.display = segmentoSeleccionado === 'inactivos' ? 'flex' : 'none'
    document.getElementById('bloque-destinatarios').style.display = 'none'
    document.getElementById('bloque-resultado').style.display = 'none'
  })
})

document.getElementById('btn-buscar-destinatarios').addEventListener('click', async () => {
  const filtros = { tipo: segmentoSeleccionado }
  if (segmentoSeleccionado === 'cumpleanos') {
    filtros.mes = parseInt(document.getElementById('select-mes').value)
  }
  if (segmentoSeleccionado === 'inactivos') {
    filtros.dias = parseInt(document.getElementById('input-dias').value) || 90
  }

  destinatarios = await ipcRenderer.invoke('obtener-clientes-campana', filtros)
  mostrarDestinatarios()
})

function mostrarDestinatarios() {
  const bloque = document.getElementById('bloque-destinatarios')
  const lista = document.getElementById('lista-destinatarios')
  document.getElementById('contador-destinatarios').textContent = destinatarios.length
  document.getElementById('bloque-resultado').style.display = 'none'

  if (destinatarios.length === 0) {
    lista.innerHTML = '<p style="color:#888;font-size:13px;">No se encontraron clientes con los filtros seleccionados.</p>'
    bloque.style.display = 'block'
    document.getElementById('btn-lanzar').style.display = 'none'
    return
  }

  const esEmail = canalSeleccionado === 'email'

  let html = `<table class="tabla-destinatarios">
    <thead><tr>
      <th>Nombre</th>
      <th>${esEmail ? 'Email' : 'Teléfono'}</th>
      <th>Estado</th>
      ${!esEmail ? '<th>Acción</th>' : ''}
    </tr></thead><tbody>`

  destinatarios.forEach(c => {
    const contacto = esEmail ? (c.email || '—') : ((c.prefijo_telefono || '+34') + ' ' + (c.telefono || '—'))
    const tieneContacto = esEmail ? !!c.email : !!c.telefono
    const estadoBadge = tieneContacto
      ? '<span style="color:#2d6a2d;font-size:12px;">✅ OK</span>'
      : '<span style="color:#b71c1c;font-size:12px;">⚠️ Sin ' + (esEmail ? 'email' : 'teléfono') + '</span>'

    html += `<tr>
      <td>${c.nombre}</td>
      <td>${contacto}</td>
      <td>${estadoBadge}</td>`

    if (!esEmail) {
      const prefijo = c.prefijo_telefono || '+34'
      const tel = c.telefono || ''
      html += `<td>
        <button class="btn-wa-campana" ${tieneContacto ? '' : 'disabled'}
          onclick="abrirWhatsappCampana('${prefijo}', '${tel}', '${c.nombre.replace(/'/g, "\\'")}')">
          📱 Enviar
        </button>
      </td>`
    }

    html += '</tr>'
  })

  html += '</tbody></table>'
  lista.innerHTML = html
  bloque.style.display = 'block'
  document.getElementById('btn-lanzar').style.display = esEmail ? 'inline-block' : 'none'
}

// ─── Tipo de mensaje ─────────────────────────────────────────────────────────

document.querySelectorAll('.btn-mensaje').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-mensaje').forEach(b => b.classList.remove('activo'))
    btn.classList.add('activo')
    tipoMensaje = btn.dataset.mensaje
    document.getElementById('bloque-plantilla').style.display = tipoMensaje === 'plantilla' ? 'block' : 'none'
    document.getElementById('bloque-libre').style.display = tipoMensaje === 'libre' ? 'block' : 'none'
  })
})

function actualizarVisibilidadAsunto() {
  const asuntoWrap = document.getElementById('campo-asunto-wrap')
  if (asuntoWrap) {
    asuntoWrap.style.display = canalSeleccionado === 'email' ? 'block' : 'none'
  }
}

// ─── Lanzar campaña por email ─────────────────────────────────────────────────

document.getElementById('btn-lanzar').addEventListener('click', async () => {
  const resultadoEl = document.getElementById('bloque-resultado')
  const btnLanzar = document.getElementById('btn-lanzar')

  let asunto = ''
  let cuerpo = ''

  if (tipoMensaje === 'plantilla') {
    const tipo = document.getElementById('select-plantilla').value
    const plantilla = plantillasEmail.find(p => p.tipo === tipo)
    if (!plantilla) {
      resultadoEl.className = 'resultado error'
      resultadoEl.textContent = '❌ No se encontró la plantilla seleccionada.'
      resultadoEl.style.display = 'block'
      return
    }
    asunto = plantilla.asunto
    cuerpo = plantilla.cuerpo
  } else {
    asunto = document.getElementById('campo-asunto').value.trim()
    cuerpo = document.getElementById('campo-mensaje').value.trim()
    if (!cuerpo) {
      resultadoEl.className = 'resultado error'
      resultadoEl.textContent = '❌ El mensaje no puede estar vacío.'
      resultadoEl.style.display = 'block'
      return
    }
  }

  btnLanzar.disabled = true
  btnLanzar.textContent = 'Enviando...'
  resultadoEl.style.display = 'none'

  const resultado = await ipcRenderer.invoke('enviar-campana-email', destinatarios, asunto, cuerpo)

  btnLanzar.disabled = false
  btnLanzar.textContent = '🚀 Lanzar campaña'

  resultadoEl.className = 'resultado ok'
  resultadoEl.innerHTML = `✅ Campaña completada:<br>
    <strong>${resultado.enviados}</strong> emails enviados correctamente<br>
    ${resultado.sinEmail > 0 ? `<strong>${resultado.sinEmail}</strong> clientes sin email (omitidos)<br>` : ''}
    ${resultado.errores > 0 ? `<strong>${resultado.errores}</strong> errores de envío` : ''}`
  resultadoEl.style.display = 'block'
})

// ─── WhatsApp por campaña (uno a uno) ────────────────────────────────────────

async function abrirWhatsappCampana(prefijo, telefono, nombre) {
  let mensaje = ''

  if (tipoMensaje === 'plantilla') {
    const tipo = document.getElementById('select-plantilla').value
    const plantilla = plantillasWhatsapp.find(p => p.tipo === tipo)
    if (plantilla) {
      mensaje = plantilla.mensaje.replace(/{nombre}/g, nombre)
    }
  } else {
    mensaje = document.getElementById('campo-mensaje').value.trim()
    mensaje = mensaje.replace(/{nombre}/g, nombre)
  }

  if (!mensaje) {
    alert('El mensaje no puede estar vacío.')
    return
  }

  await ipcRenderer.invoke('abrir-whatsapp', prefijo + telefono, mensaje)
}

document.getElementById('btn-cerrar').addEventListener('click', () => {
  window.close()
})
