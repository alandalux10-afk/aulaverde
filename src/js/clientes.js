const { ipcRenderer } = require('electron')

let clientes = []
let idEditando = null

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

async function renderizarTabla(lista) {
  const cuerpo = document.getElementById('cuerpo-tabla')
  cuerpo.innerHTML = ''

  if (lista.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888;">No hay clientes registrados</td></tr>'
    return
  }

  for (const c of lista) {
    const datosPuntos = await ipcRenderer.invoke('obtener-puntos-cliente', c.id_cliente)
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${c.nombre}</td>
      <td>${c.telefono || '—'}</td>
      <td>${c.email || '—'}</td>
      <td>${c.descuento > 0 ? `<span class="badge-descuento">${c.descuento}%</span>` : '—'}</td>
      <td><span class="badge-puntos">${datosPuntos.saldo}</span></td>
      <td><span class="${c.activo ? 'badge-activo' : 'badge-inactivo'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn-historial" onclick="verHistorial(${c.id_cliente})">Historial</button>
        <button class="btn-editar" onclick="abrirModalEditar(${c.id_cliente})">Editar</button>
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
  document.getElementById('campo-telefono').value = ''
  document.getElementById('campo-email').value = ''
  document.getElementById('campo-fecha-nacimiento').value = ''
  document.getElementById('campo-direccion').value = ''
  document.getElementById('campo-nif').value = ''
  document.getElementById('campo-descuento').value = '0'
  document.getElementById('campo-notas').value = ''
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
  document.getElementById('campo-telefono').value = c.telefono || ''
  document.getElementById('campo-email').value = c.email || ''
  document.getElementById('campo-fecha-nacimiento').value = c.fecha_nacimiento || ''
  document.getElementById('campo-direccion').value = c.direccion || ''
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

  const datos = {
    nombre,
    telefono: document.getElementById('campo-telefono').value.trim(),
    email: document.getElementById('campo-email').value.trim(),
    fecha_nacimiento: document.getElementById('campo-fecha-nacimiento').value,
    direccion: document.getElementById('campo-direccion').value.trim(),
    nif: document.getElementById('campo-nif').value.trim(),
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
    cargarClientes()
  } else {
    mostrarError(resultado.mensaje || 'Error al guardar el cliente.')
  }
}

async function toggleCliente(idCliente, nuevoEstado) {
  const resultado = await ipcRenderer.invoke('toggle-cliente', idCliente, nuevoEstado)
  if (resultado.ok) {
    cargarClientes()
  }
}

async function verHistorial(idCliente) {
  const c = clientes.find(x => x.id_cliente === idCliente)
  if (!c) return

  document.getElementById('historial-titulo').textContent = 'Historial de compras — ' + c.nombre

  const historial = await ipcRenderer.invoke('obtener-historial-cliente', idCliente)
  const cuerpo = document.getElementById('cuerpo-historial')
  cuerpo.innerHTML = ''

  if (historial.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#888;">Este cliente todavía no tiene compras registradas</td></tr>'
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
  const confirmar = confirm('¿Importar clientes desde Excel o CSV?\n\nSe añadirán los clientes nuevos. Los que ya existan (mismo teléfono o nombre) no se duplicarán.')
  if (!confirmar) return
  const resultado = await ipcRenderer.invoke('importar-clientes-excel')
  if (resultado.ok) {
    alert(`✅ Importación completada:\n${resultado.importados} clientes importados\n${resultado.omitidos} ya existían (omitidos)`)
    cargarClientes()
    cargarAlertas()
  } else {
    alert('❌ Error: ' + resultado.mensaje)
  }
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
document.getElementById('btn-cerrar-clientes').addEventListener('click', () => {
  window.close()
})
