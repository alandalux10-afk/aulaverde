const { ipcRenderer } = require('electron')

let clientes = []
let idEditando = null
let clienteEmailActual = null
let plantillasCache = []
let clienteWhatsappActual = null
let plantillasWhatsappCache = []
let idClienteConsentimientoActual = null
let metodoPendiente = null
let pdfConsentimientoGenerado = null

document.addEventListener('DOMContentLoaded', () => {
  cargarClientes()
  cargarAlertas()
})

async function cargarClientes() {
  clientes = await ipcRenderer.invoke('obtener-clientes')
  renderizarTabla(clientes)
}

async function cargarAlertas() {
  const alertas = await ipcRenderer.invoke('obtener-alertas-crm')
  const panel = document.getElementById('panel-alertas')
  const contenido = document.getElementById('contenido-alertas')
  contenido.innerHTML = ''
  let hayAlertas = false

  alertas.cumpleanos.forEach(c => {
    hayAlertas = true
    const texto = c.dias === 0 ? '¡hoy!' : `en ${c.dias} día(s)`
    const linea = document.createElement('div')
    linea.className = 'linea-alerta'
    linea.textContent = `🎂 ${c.nombre} cumple años ${texto}`
    contenido.appendChild(linea)
  })

  alertas.inactivos.forEach(c => {
    hayAlertas = true
    const linea = document.createElement('div')
    linea.className = 'linea-alerta'
    linea.textContent = `⏳ ${c.nombre} no compra desde el ${c.ultima_compra}`
    contenido.appendChild(linea)
  })

  panel.style.display = hayAlertas ? 'block' : 'none'
}

function badgeRGPD(c) {
  if (c.consentimiento_rgpd) {
    const iconEmail = c.consentimiento_email_marketing ? '📧' : ''
    const iconWA = c.consentimiento_whatsapp_marketing ? '📱' : ''
    return `<span class="badge-rgpd-ok" title="RGPD aceptado el ${c.fecha_consentimiento_rgpd || ''}. Email: ${c.consentimiento_email_marketing ? 'Sí' : 'No'}. WhatsApp: ${c.consentimiento_whatsapp_marketing ? 'Sí' : 'No'}">✅${iconEmail}${iconWA}</span>`
  } else {
    return `<span class="badge-rgpd-pendiente" title="Consentimiento pendiente">⚠️ Pendiente</span>`
  }
}

async function renderizarTabla(lista) {
  const cuerpo = document.getElementById('cuerpo-tabla')
  cuerpo.innerHTML = ''

  if (lista.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#888;">No hay clientes registrados</td></tr>'
    return
  }

  for (const c of lista) {
    const datosPuntos = await ipcRenderer.invoke('obtener-puntos-cliente', c.id_cliente)

    // Bloquear email si no tiene consentimiento de email marketing
    const puedeEmail = c.email && c.consentimiento_email_marketing
    const emailTitle = !c.email ? 'Sin email' : !c.consentimiento_email_marketing ? 'No ha aceptado email marketing' : 'Enviar email'

    // Bloquear WhatsApp si no tiene consentimiento de WhatsApp marketing
    const puedeWA = c.telefono && c.consentimiento_whatsapp_marketing
    const waTitle = !c.telefono ? 'Sin teléfono' : !c.consentimiento_whatsapp_marketing ? 'No ha aceptado WhatsApp marketing' : 'Enviar WhatsApp'

    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${c.nombre}</td>
      <td>${c.telefono ? (c.prefijo_telefono || '+34') + ' ' + c.telefono : '—'}</td>
      <td>${c.email || '—'}</td>
      <td>${c.descuento > 0 ? `<span class="badge-descuento">${c.descuento}%</span>` : '—'}</td>
      <td><span class="badge-puntos">${datosPuntos.saldo}</span></td>
      <td>${badgeRGPD(c)}</td>
      <td><span class="${c.activo ? 'badge-activo' : 'badge-inactivo'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn-historial" onclick="verHistorial(${c.id_cliente})">Historial</button>
        <button class="btn-editar" onclick="abrirModalEditar(${c.id_cliente})">Editar</button>
        <button class="btn-email" ${puedeEmail ? '' : 'disabled'} title="${emailTitle}" onclick="${puedeEmail ? `abrirModalEmail(${c.id_cliente})` : ''}">📧</button>
        <button class="btn-whatsapp-fila" ${puedeWA ? '' : 'disabled'} title="${waTitle}" onclick="${puedeWA ? `abrirModalWhatsapp(${c.id_cliente})` : ''}">📱</button>
        <button class="${c.activo ? 'btn-toggle-activo' : 'btn-toggle-inactivo'}" onclick="toggleCliente(${c.id_cliente}, ${c.activo ? 0 : 1})">
          ${c.activo ? 'Desactivar' : 'Activar'}
        </button>
      </td>
    `
    cuerpo.appendChild(tr)
  }
}

function filtrarClientes() {
  const texto = document.getElementById('filtro-nombre').value.toLowerCase()
  const activo = document.getElementById('filtro-activo').value
  const filtrados = clientes.filter(c => {
    const coincideTexto =
      c.nombre.toLowerCase().includes(texto) ||
      (c.telefono || '').toLowerCase().includes(texto) ||
      (c.email || '').toLowerCase().includes(texto)
    const coincideActivo = activo === '' || String(c.activo) === activo
    return coincideTexto && coincideActivo
  })
  renderizarTabla(filtrados)
}

function abrirModalNuevo() {
  idEditando = null
  document.getElementById('modal-titulo').textContent = 'Nuevo cliente'
  document.getElementById('campo-nombre').value = ''
  document.getElementById('campo-prefijo').value = '+34'
  document.getElementById('campo-telefono').value = ''
  document.getElementById('campo-email').value = ''
  document.getElementById('campo-fecha-nacimiento').value = ''
  document.getElementById('campo-direccion').value = ''
  document.getElementById('campo-nif').value = ''
  document.getElementById('campo-descuento').value = '0'
  document.getElementById('campo-notas').value = ''
  document.getElementById('campo-tipo-cliente').value = 'PARTICULAR'
  document.getElementById('bloque-nif').style.display = 'none'
  ocultarError()
  document.getElementById('modal-cliente').style.display = 'flex'
  document.getElementById('campo-nombre').focus()
}

function abrirModalEditar(idCliente) {
  const c = clientes.find(x => x.id_cliente === idCliente)
  if (!c) return
  idEditando = idCliente
  document.getElementById('modal-titulo').textContent = 'Editar cliente'
  document.getElementById('campo-nombre').value = c.nombre
  document.getElementById('campo-prefijo').value = c.prefijo_telefono || '+34'
  document.getElementById('campo-telefono').value = c.telefono || ''
  document.getElementById('campo-email').value = c.email || ''
  document.getElementById('campo-fecha-nacimiento').value = c.fecha_nacimiento || ''
  document.getElementById('campo-direccion').value = c.direccion || ''
  document.getElementById('campo-tipo-cliente').value = c.tipo_cliente || 'PARTICULAR'
  document.getElementById('bloque-nif').style.display = (c.tipo_cliente === 'PROFESIONAL') ? 'block' : 'none'
  document.getElementById('campo-nif').value = c.nif || ''
  document.getElementById('campo-descuento').value = c.descuento || 0
  document.getElementById('campo-notas').value = c.notas || ''
  ocultarError()
  document.getElementById('modal-cliente').style.display = 'flex'
  document.getElementById('campo-nombre').focus()
}

function cerrarModal() {
  document.getElementById('modal-cliente').style.display = 'none'
  idEditando = null
}

async function guardarCliente() {
  const nombre = document.getElementById('campo-nombre').value.trim()
  if (!nombre) {
    mostrarError('El nombre del cliente es obligatorio.')
    return
  }
  const descuento = parseFloat(document.getElementById('campo-descuento').value) || 0
  if (descuento < 0 || descuento > 100) {
    mostrarError('El descuento debe estar entre 0 y 100.')
    return
  }

const tipoCliente = document.getElementById('campo-tipo-cliente').value
  const datos = {
    nombre,
    tipo_cliente: tipoCliente,
    prefijo_telefono: document.getElementById('campo-prefijo').value.trim() || '+34',
    telefono: document.getElementById('campo-telefono').value.trim(),
    email: document.getElementById('campo-email').value.trim(),
    fecha_nacimiento: document.getElementById('campo-fecha-nacimiento').value,
    direccion: document.getElementById('campo-direccion').value.trim(),
    nif: tipoCliente === 'PROFESIONAL' ? document.getElementById('campo-nif').value.trim() : '',
    descuento,
    notas: document.getElementById('campo-notas').value.trim()
  }

  let resultado
  if (idEditando) {
    resultado = await ipcRenderer.invoke('editar-cliente', idEditando, datos)
  } else {
    resultado = await ipcRenderer.invoke('crear-cliente', datos)
  }

  if (resultado.ok) {
    cerrarModal()
    await cargarClientes()

    // Si es un cliente nuevo, lanzar el flujo de consentimiento RGPD
    if (!idEditando) {
      const clienteNuevo = clientes.find(c => c.nombre === datos.nombre && c.telefono === datos.telefono)
      if (clienteNuevo) {
        abrirModalConsentimiento(clienteNuevo)
      }
    }
  } else {
    mostrarError(resultado.mensaje || 'Error al guardar el cliente.')
  }
}

// ───────── Consentimiento RGPD ─────────

function abrirModalConsentimiento(cliente) {
  idClienteConsentimientoActual = cliente.id_cliente
  pdfConsentimientoGenerado = null
  metodoPendiente = null

  document.getElementById('bloque-registrar-consentimiento').style.display = 'none'
  document.getElementById('check-rgpd').checked = false
  document.getElementById('check-email-marketing').checked = false
  document.getElementById('check-whatsapp-marketing').checked = false
  document.getElementById('consentimiento-mensaje').style.display = 'none'

  document.getElementById('modal-consentimiento').style.display = 'flex'

  // Desactivar botones de email/WA si el cliente no tiene esos datos
  document.getElementById('btn-cons-email').disabled = !cliente.email
  document.getElementById('btn-cons-email').title = cliente.email ? '' : 'Este cliente no tiene email registrado'
  document.getElementById('btn-cons-whatsapp').disabled = !cliente.telefono
  document.getElementById('btn-cons-whatsapp').title = cliente.telefono ? '' : 'Este cliente no tiene teléfono registrado'
}

function mostrarBloqueFirma(metodo) {
  metodoPendiente = metodo
  document.getElementById('bloque-registrar-consentimiento').style.display = 'block'
}

document.getElementById('btn-cons-imprimir').addEventListener('click', async () => {
  const cliente = clientes.find(c => c.id_cliente === idClienteConsentimientoActual)
  if (!cliente) return
  const btn = document.getElementById('btn-cons-imprimir')
  btn.textContent = '🖨️ Imprimiendo...'
  btn.disabled = true

  const resGuardar = await ipcRenderer.invoke('generar-consentimiento-pdf', cliente)
  if (resGuardar.ok) pdfConsentimientoGenerado = resGuardar.ruta

  await ipcRenderer.invoke('imprimir-consentimiento', cliente)
  btn.textContent = '🖨️ Imprimir para firmar en papel'
  btn.disabled = false
  mostrarBloqueFirma('FISICO')
})

document.getElementById('btn-cons-email').addEventListener('click', async () => {
  const cliente = clientes.find(c => c.id_cliente === idClienteConsentimientoActual)
  if (!cliente) return
  const btn = document.getElementById('btn-cons-email')
  btn.textContent = '📧 Enviando...'
  btn.disabled = true

  const resGuardar = await ipcRenderer.invoke('generar-consentimiento-pdf', cliente)
  if (resGuardar.ok) pdfConsentimientoGenerado = resGuardar.ruta

  const { enviarEmailCliente } = await import('./email.js').catch(() => null)
  const plantilla = {
    asunto: 'Formulario de consentimiento — ' + (cliente.nombre || 'Cliente'),
    cuerpo: `Estimado/a ${cliente.nombre},\n\nAdjunto encontrará su formulario de consentimiento de Aula Verde. Por favor, revíselo y contacte con nosotros para confirmar su aceptación.\n\nGracias.\nAula Verde`
  }
  await ipcRenderer.invoke('enviar-email-cliente', cliente.id_cliente, 'BIENVENIDA')

  btn.textContent = '📧 Enviar por email'
  btn.disabled = false
  mostrarBloqueFirma('EMAIL')
})

document.getElementById('btn-cons-whatsapp').addEventListener('click', async () => {
  const cliente = clientes.find(c => c.id_cliente === idClienteConsentimientoActual)
  if (!cliente) return

  const resGuardar = await ipcRenderer.invoke('generar-consentimiento-pdf', cliente)
  if (resGuardar.ok) pdfConsentimientoGenerado = resGuardar.ruta

  const mensaje = `Hola ${cliente.nombre}, le enviamos el formulario de consentimiento de Aula Verde. Por favor, revíselo y confirme su aceptación respondiendo a este mensaje. Gracias.`
  const prefijo = cliente.prefijo_telefono || '+34'
  await ipcRenderer.invoke('abrir-whatsapp', prefijo + cliente.telefono, mensaje)

  mostrarBloqueFirma('WHATSAPP')
})

document.getElementById('btn-cons-saltar').addEventListener('click', () => {
  mostrarBloqueFirma('FISICO')
})

document.getElementById('btn-guardar-consentimiento').addEventListener('click', async () => {
  const rgpd = document.getElementById('check-rgpd').checked
  if (!rgpd) {
    const msgEl = document.getElementById('consentimiento-mensaje')
    msgEl.textContent = 'El consentimiento RGPD es obligatorio para registrar al cliente correctamente.'
    msgEl.style.display = 'block'
    return
  }

  const datos = {
    consentimiento_rgpd: rgpd,
    consentimiento_email_marketing: document.getElementById('check-email-marketing').checked,
    consentimiento_whatsapp_marketing: document.getElementById('check-whatsapp-marketing').checked,
    metodo_consentimiento: metodoPendiente || 'FISICO',
    pdf_consentimiento_path: pdfConsentimientoGenerado || null
  }

  const resultado = await ipcRenderer.invoke('guardar-consentimiento-cliente', idClienteConsentimientoActual, datos)
  if (resultado.ok) {
    document.getElementById('modal-consentimiento').style.display = 'none'
    await cargarClientes()
  } else {
    const msgEl = document.getElementById('consentimiento-mensaje')
    msgEl.textContent = 'Error al guardar: ' + resultado.mensaje
    msgEl.style.display = 'block'
  }
})

async function toggleCliente(idCliente, nuevoEstado) {
  const resultado = await ipcRenderer.invoke('toggle-cliente', idCliente, nuevoEstado)
  if (resultado.ok) cargarClientes()
}

async function verHistorial(idCliente) {
  const c = clientes.find(x => x.id_cliente === idCliente)
  if (!c) return
  document.getElementById('historial-titulo').textContent = 'Historial de compras — ' + c.nombre
  const historial = await ipcRenderer.invoke('obtener-historial-cliente', idCliente)
  const cuerpo = document.getElementById('cuerpo-historial')
  cuerpo.innerHTML = ''
  if (historial.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#888;">Sin compras registradas</td></tr>'
  } else {
    historial.forEach(v => {
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>${v.fecha}</td>
        <td>${v.numero_documento}</td>
        <td>${v.tipo_documento === 'FACTURA_SIMPLIFICADA' ? 'Factura' : 'Ticket'}</td>
        <td>${v.estado === 'COBRADO' ? 'Cobrado' : 'Pendiente'}</td>
        <td>${Number(v.total_venta).toFixed(2).replace('.', ',')} €</td>
      `
      cuerpo.appendChild(tr)
    })
  }
  document.getElementById('modal-historial').style.display = 'flex'
}

function mostrarError(texto) {
  const el = document.getElementById('mensaje-error')
  el.textContent = texto
  el.style.display = 'block'
}

function ocultarError() {
  document.getElementById('mensaje-error').style.display = 'none'
}

async function importarClientes() {
  const confirmar = confirm('¿Importar clientes desde Excel o CSV?\n\nSe añadirán los nuevos. Los existentes no se duplicarán.')
  if (!confirmar) return
  const resultado = await ipcRenderer.invoke('importar-clientes-excel')
  if (resultado.ok) {
    alert(`✅ Importación completada:\n${resultado.importados} importados\n${resultado.omitidos} ya existían`)
    cargarClientes()
    cargarAlertas()
  } else {
    alert('❌ Error: ' + resultado.mensaje)
  }
}

// ───────── Email ─────────

async function abrirModalEmail(idCliente) {
  const c = clientes.find(x => x.id_cliente === idCliente)
  if (!c || !c.consentimiento_email_marketing) return
  clienteEmailActual = c
  document.getElementById('email-titulo').textContent = 'Enviar email — ' + c.nombre
  document.getElementById('email-mensaje').style.display = 'none'
  if (plantillasCache.length === 0) plantillasCache = await ipcRenderer.invoke('obtener-plantillas-email')
  document.getElementById('campo-plantilla').value = 'BIENVENIDA'
  actualizarPreviewEmail()
  document.getElementById('modal-email').style.display = 'flex'
}

function actualizarPreviewEmail() {
  const tipo = document.getElementById('campo-plantilla').value
  const plantilla = plantillasCache.find(p => p.tipo === tipo)
  const preview = document.getElementById('email-preview')
  if (!plantilla || !clienteEmailActual) { preview.textContent = ''; return }
  preview.textContent = 'Asunto: ' + plantilla.asunto.replace(/{nombre}/g, clienteEmailActual.nombre) + '\n\n' + plantilla.cuerpo.replace(/{nombre}/g, clienteEmailActual.nombre)
}

function cerrarModalEmail() {
  document.getElementById('modal-email').style.display = 'none'
  clienteEmailActual = null
}

async function enviarEmail() {
  if (!clienteEmailActual) return
  const tipo = document.getElementById('campo-plantilla').value
  const mensajeEl = document.getElementById('email-mensaje')
  mensajeEl.style.display = 'none'
  const btn = document.getElementById('btn-enviar-email')
  btn.disabled = true
  btn.textContent = 'Enviando...'
  const resultado = await ipcRenderer.invoke('enviar-email-cliente', clienteEmailActual.id_cliente, tipo)
  btn.disabled = false
  btn.textContent = '📧 Enviar'
  if (resultado.ok) {
    alert('✅ Email enviado correctamente a ' + clienteEmailActual.email)
    cerrarModalEmail()
  } else {
    mensajeEl.textContent = resultado.mensaje || 'Error al enviar.'
    mensajeEl.style.display = 'block'
  }
}

// ───────── WhatsApp ─────────

async function abrirModalWhatsapp(idCliente) {
  const c = clientes.find(x => x.id_cliente === idCliente)
  if (!c || !c.consentimiento_whatsapp_marketing) return
  clienteWhatsappActual = c
  document.getElementById('whatsapp-titulo').textContent = 'Enviar WhatsApp — ' + c.nombre
  if (plantillasWhatsappCache.length === 0) plantillasWhatsappCache = await ipcRenderer.invoke('obtener-plantillas-whatsapp')
  document.getElementById('campo-plantilla-whatsapp').value = 'BIENVENIDA'
  actualizarPreviewWhatsapp()
  document.getElementById('modal-whatsapp').style.display = 'flex'
}

function actualizarPreviewWhatsapp() {
  const tipo = document.getElementById('campo-plantilla-whatsapp').value
  const plantilla = plantillasWhatsappCache.find(p => p.tipo === tipo)
  const preview = document.getElementById('whatsapp-preview')
  if (!plantilla || !clienteWhatsappActual) { preview.textContent = ''; return }
  preview.textContent = plantilla.mensaje.replace(/{nombre}/g, clienteWhatsappActual.nombre)
}

function cerrarModalWhatsapp() {
  document.getElementById('modal-whatsapp').style.display = 'none'
  clienteWhatsappActual = null
}

async function abrirWhatsapp() {
  if (!clienteWhatsappActual) return
  const mensaje = document.getElementById('whatsapp-preview').textContent
  const prefijo = clienteWhatsappActual.prefijo_telefono || '+34'
  const resultado = await ipcRenderer.invoke('abrir-whatsapp', prefijo + clienteWhatsappActual.telefono, mensaje)
  if (resultado.ok) cerrarModalWhatsapp()
  else alert('❌ Error: ' + resultado.mensaje)
}

// Eventos
document.getElementById('btn-nuevo-cliente').addEventListener('click', abrirModalNuevo)
document.getElementById('btn-importar-clientes').addEventListener('click', importarClientes)
document.getElementById('btn-cancelar').addEventListener('click', cerrarModal)
document.getElementById('btn-guardar').addEventListener('click', guardarCliente)
document.getElementById('btn-cerrar-historial').addEventListener('click', () => {
  document.getElementById('modal-historial').style.display = 'none'
})
document.getElementById('filtro-nombre').addEventListener('input', filtrarClientes)
document.getElementById('filtro-activo').addEventListener('change', filtrarClientes)
document.getElementById('btn-cerrar-clientes').addEventListener('click', () => window.close())
document.getElementById('campo-plantilla').addEventListener('change', actualizarPreviewEmail)
document.getElementById('btn-cancelar-email').addEventListener('click', cerrarModalEmail)
document.getElementById('btn-enviar-email').addEventListener('click', enviarEmail)
document.getElementById('campo-plantilla-whatsapp').addEventListener('change', actualizarPreviewWhatsapp)
document.getElementById('btn-cancelar-whatsapp').addEventListener('click', cerrarModalWhatsapp)
document.getElementById('btn-abrir-whatsapp').addEventListener('click', abrirWhatsapp)
document.getElementById('campo-tipo-cliente').addEventListener('change', function() {
  document.getElementById('bloque-nif').style.display = this.value === 'PROFESIONAL' ? 'block' : 'none'
})
