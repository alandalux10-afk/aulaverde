// Nota de seguridad: antes se hacía "const { ipcRenderer } = require('electron')"
// aquí. Ya no hace falta ni es posible: con nodeIntegration desactivado esta
// ventana no tiene acceso a Node.js. El objeto "ipcRenderer" que se usa más
// abajo lo proporciona ahora preload.js de forma controlada y segura.

let productoSeleccionado = null
let modoEdicion = false

function formatearEuros(n) {
  return Number(n || 0).toFixed(2).replace('.', ',') + ' €'
}

async function cargarProductos() {
  const nombre = document.getElementById('filtro-nombre').value.trim()
  const familia = document.getElementById('filtro-familia').value
  const activo = document.getElementById('filtro-activo').value

  const productos = await ipcRenderer.invoke('obtener-productos-catalogo', { nombre, familia, activo })
  const tbody = document.getElementById('cuerpo-cat')
  tbody.innerHTML = ''
  productoSeleccionado = null

  productos.forEach(p => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${p.codigo}</td>
      <td>${p.nombre}</td>
      <td>${p.familia || ''}</td>
      <td>${formatearEuros(p.precio_venta)}</td>
      <td>${formatearEuros(p.precio_coste)}</td>
      <td>${p.porcentaje_iva}%</td>
      <td class="${p.activo ? 'estado-activo' : 'estado-inactivo'}">${p.activo ? 'Activo' : 'Inactivo'}</td>
    `
    tr.addEventListener('click', () => {
      document.querySelectorAll('#cuerpo-cat tr').forEach(r => r.classList.remove('seleccionada'))
      tr.classList.add('seleccionada')
      productoSeleccionado = p
    })
    tbody.appendChild(tr)
  })

  document.getElementById('total-productos-cat').textContent = productos.length + ' productos'
}

async function abrirModalNuevo() {
  modoEdicion = false
  document.getElementById('modal-producto-titulo').textContent = 'Nuevo producto'
  document.getElementById('prod-codigo').value = ''
  document.getElementById('prod-nombre').value = ''
  document.getElementById('prod-familia').value = 'ALIMENTACIÓN'
  document.getElementById('prod-tipo').value = 'UNIDAD'
  document.getElementById('prod-precio-venta').value = ''
  document.getElementById('prod-precio-coste').value = ''
  document.getElementById('prod-iva').value = '2'
  document.getElementById('modal-producto').style.display = 'block'
  // Código correlativo automático (AV0001, AV0002...). Se rellena solo, pero
  // se puede editar a mano si hiciera falta un código distinto.
  const siguienteCodigo = await ipcRenderer.invoke('obtener-siguiente-codigo-catalogo')
  document.getElementById('prod-codigo').value = siguienteCodigo
}

function abrirModalEditar() {
  if (!productoSeleccionado) { alert('Selecciona un producto para editar'); return }
  modoEdicion = true
  document.getElementById('modal-producto-titulo').textContent = 'Editar producto'
  document.getElementById('prod-codigo').value = productoSeleccionado.codigo
  document.getElementById('prod-nombre').value = productoSeleccionado.nombre
  document.getElementById('prod-familia').value = productoSeleccionado.familia || 'ALIMENTACIÓN'
  document.getElementById('prod-tipo').value = productoSeleccionado.tipo_venta || 'UNIDAD'
  document.getElementById('prod-precio-venta').value = productoSeleccionado.precio_venta || ''
  document.getElementById('prod-precio-coste').value = productoSeleccionado.precio_coste || ''
  document.getElementById('prod-iva').value = productoSeleccionado.id_iva || '2'
  document.getElementById('modal-producto').style.display = 'block'
}

function cerrarModal() {
  document.getElementById('modal-producto').style.display = 'none'
}

document.getElementById('btn-nuevo-producto').addEventListener('click', abrirModalNuevo)
document.getElementById('btn-editar-producto').addEventListener('click', abrirModalEditar)
document.getElementById('btn-prod-cancelar').addEventListener('click', cerrarModal)
document.getElementById('modal-producto-overlay').addEventListener('click', cerrarModal)

document.getElementById('btn-prod-guardar').addEventListener('click', async () => {
  const datos = {
    codigo: document.getElementById('prod-codigo').value.trim(),
    nombre: document.getElementById('prod-nombre').value.trim(),
    familia: document.getElementById('prod-familia').value,
    tipo_venta: document.getElementById('prod-tipo').value,
    precio_venta: parseFloat(document.getElementById('prod-precio-venta').value) || 0,
    precio_coste: parseFloat(document.getElementById('prod-precio-coste').value) || 0,
    id_iva: parseInt(document.getElementById('prod-iva').value)
  }

  if (!datos.codigo || !datos.nombre) {
    alert('El código y el nombre son obligatorios')
    // En Electron/Windows, tras cerrar un aviso nativo (alert) la ventana
    // puede quedarse sin el foco de teclado, dando la sensación de que los
    // campos "no dejan escribir". Se fuerza el foco de vuelta al campo que
    // falta por rellenar para que se pueda seguir escribiendo sin más clics.
    const campoAFocar = !datos.codigo ? 'prod-codigo' : 'prod-nombre'
    window.focus()
    document.getElementById(campoAFocar).focus()
    return
  }

  let resultado
  if (modoEdicion) {
    resultado = await ipcRenderer.invoke('editar-producto', productoSeleccionado.id_producto, datos)
  } else {
    resultado = await ipcRenderer.invoke('crear-producto', datos)
  }

  if (resultado.ok) {
    cerrarModal()
    cargarProductos()
  } else {
    alert('Error: ' + resultado.mensaje)
  }
})

document.getElementById('btn-toggle-producto').addEventListener('click', async () => {
  if (!productoSeleccionado) { alert('Selecciona un producto'); return }
  const nuevoEstado = productoSeleccionado.activo ? 0 : 1
  const accion = nuevoEstado ? 'activar' : 'desactivar'
  const confirmar = confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} el producto "${productoSeleccionado.nombre}"?`)
  if (!confirmar) return
  const resultado = await ipcRenderer.invoke('toggle-producto', productoSeleccionado.id_producto, nuevoEstado)
  if (resultado.ok) {
    cargarProductos()
  } else {
    alert('Error: ' + resultado.mensaje)
  }
})

document.getElementById('btn-filtrar-cat').addEventListener('click', cargarProductos)

document.getElementById('filtro-nombre').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') cargarProductos()
})
document.getElementById('btn-exportar-excel-catalogo').addEventListener('click', async () => {
  const resultado = await ipcRenderer.invoke('exportar-catalogo-excel')
  if (resultado.ok) {
    alert('✅ Catálogo exportado correctamente en:\n' + resultado.ruta)
  } else {
    alert('❌ Error al exportar: ' + resultado.mensaje)
  }
})
document.getElementById('btn-cerrar-cat').addEventListener('click', () => {
  window.close()
})

cargarProductos()
