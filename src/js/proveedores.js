const { ipcRenderer } = require('electron')

let proveedores = []
let idEditando = null

document.addEventListener('DOMContentLoaded', () => {
  cargarProveedores()
})

async function cargarProveedores() {
  proveedores = await ipcRenderer.invoke('obtener-proveedores')
  renderizarTabla(proveedores)
}

function renderizarTabla(lista) {
  const cuerpo = document.getElementById('cuerpo-tabla')
  cuerpo.innerHTML = ''

  if (lista.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888;">No hay proveedores registrados</td></tr>'
    return
  }

  lista.forEach(p => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${p.nombre}</td>
      <td>${p.nif || '—'}</td>
      <td>${p.telefono || '—'}</td>
      <td>${p.email || '—'}</td>
      <td>${p.recargo_equivalencia ? '<span class="badge-recargo">Sí</span>' : '—'}</td>
      <td><span class="${p.activo ? 'badge-activo' : 'badge-inactivo'}">${p.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn-editar" onclick="abrirModalEditar(${p.id_proveedor})">Editar</button>
        <button class="${p.activo ? 'btn-toggle-activo' : 'btn-toggle-inactivo'}" onclick="toggleProveedor(${p.id_proveedor}, ${p.activo ? 0 : 1})">
          ${p.activo ? 'Desactivar' : 'Activar'}
        </button>
      </td>
    `
    cuerpo.appendChild(tr)
  })
}

function filtrarProveedores() {
  const texto = document.getElementById('filtro-nombre').value.toLowerCase()
  const activo = document.getElementById('filtro-activo').value

  const filtrados = proveedores.filter(p => {
    const coincideNombre = p.nombre.toLowerCase().includes(texto)
    const coincideActivo = activo === '' || String(p.activo) === activo
    return coincideNombre && coincideActivo
  })

  renderizarTabla(filtrados)
}

function abrirModalNuevo() {
  idEditando = null
  document.getElementById('modal-titulo').textContent = 'Nuevo proveedor'
  document.getElementById('campo-nombre').value = ''
  document.getElementById('campo-nif').value = ''
  document.getElementById('campo-direccion').value = ''
  document.getElementById('campo-telefono').value = ''
  document.getElementById('campo-email').value = ''
  document.getElementById('campo-recargo').checked = false
  ocultarError()
  document.getElementById('modal-proveedor').style.display = 'flex'
  document.getElementById('campo-nombre').focus()
}

function abrirModalEditar(idProveedor) {
  const p = proveedores.find(x => x.id_proveedor === idProveedor)
  if (!p) return

  idEditando = idProveedor
  document.getElementById('modal-titulo').textContent = 'Editar proveedor'
  document.getElementById('campo-nombre').value = p.nombre
  document.getElementById('campo-nif').value = p.nif || ''
  document.getElementById('campo-direccion').value = p.direccion || ''
  document.getElementById('campo-telefono').value = p.telefono || ''
  document.getElementById('campo-email').value = p.email || ''
  document.getElementById('campo-recargo').checked = p.recargo_equivalencia === 1
  ocultarError()
  document.getElementById('modal-proveedor').style.display = 'flex'
  document.getElementById('campo-nombre').focus()
}

function cerrarModal() {
  document.getElementById('modal-proveedor').style.display = 'none'
  idEditando = null
}

async function guardarProveedor() {
  const nombre = document.getElementById('campo-nombre').value.trim()
  if (!nombre) {
    mostrarError('El nombre del proveedor es obligatorio.')
    return
  }

  const datos = {
    nombre,
    nif: document.getElementById('campo-nif').value.trim(),
    direccion: document.getElementById('campo-direccion').value.trim(),
    telefono: document.getElementById('campo-telefono').value.trim(),
    email: document.getElementById('campo-email').value.trim(),
    recargo_equivalencia: document.getElementById('campo-recargo').checked ? 1 : 0
  }

  let resultado
  if (idEditando) {
    resultado = await ipcRenderer.invoke('editar-proveedor', idEditando, datos)
  } else {
    resultado = await ipcRenderer.invoke('crear-proveedor', datos)
  }

  if (resultado.ok) {
    cerrarModal()
    cargarProveedores()
  } else {
    mostrarError(resultado.mensaje || 'Error al guardar el proveedor.')
  }
}

async function toggleProveedor(idProveedor, nuevoEstado) {
  const resultado = await ipcRenderer.invoke('toggle-proveedor', idProveedor, nuevoEstado)
  if (resultado.ok) {
    cargarProveedores()
  }
}

function mostrarError(texto) {
  const el = document.getElementById('mensaje-error')
  el.textContent = texto
  el.style.display = 'block'
}

function ocultarError() {
  document.getElementById('mensaje-error').style.display = 'none'
}

function nuevaCompra() {
  ipcRenderer.invoke('abrir-nueva-compra')
}

async function importarProveedores() {
  const confirmar = confirm('¿Importar proveedores desde Excel?\n\nSe añadirán los proveedores nuevos. Los que ya existan no se duplicarán.')
  if (!confirmar) return
  const resultado = await ipcRenderer.invoke('importar-proveedores-excel')
  if (resultado.ok) {
    alert(`✅ Importación completada:\n${resultado.importados} proveedores importados\n${resultado.omitidos} ya existían (omitidos)`)
    cargarProveedores()
  } else {
    alert('❌ Error: ' + resultado.mensaje)
  }
}
function abrirHistorico() {
  ipcRenderer.invoke('abrir-historico-compras')
}