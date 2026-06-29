const { ipcRenderer } = require('electron')

let compras = []

document.addEventListener('DOMContentLoaded', async () => {
  await cargarProveedoresFiltro()
  inicializarFechas()
  await cargarCompras()

  document.getElementById('btn-filtrar').addEventListener('click', cargarCompras)
  document.getElementById('btn-hoy').addEventListener('click', () => {
    const hoy = new Date().toISOString().split('T')[0]
    document.getElementById('filtro-desde').value = hoy
    document.getElementById('filtro-hasta').value = hoy
    cargarCompras()
  })
  document.getElementById('btn-mes').addEventListener('click', () => {
    const ahora = new Date()
    const primero = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().split('T')[0]
    const ultimo = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).toISOString().split('T')[0]
    document.getElementById('filtro-desde').value = primero
    document.getElementById('filtro-hasta').value = ultimo
    cargarCompras()
  })
  document.getElementById('btn-listado-facturas').addEventListener('click', async () => {
    const desde = document.getElementById('filtro-desde').value
    const hasta = document.getElementById('filtro-hasta').value
    if (!desde || !hasta) {
      alert('Selecciona un rango de fechas antes de generar el listado.')
      return
    }
    const resultado = await ipcRenderer.invoke('exportar-listado-facturas', { desde, hasta })
    if (resultado.ok) {
      alert('✅ Excel generado correctamente en:\n' + resultado.ruta)
    } else {
      alert('❌ Error al generar el Excel: ' + resultado.mensaje)
    }
  })
  document.getElementById('btn-cerrar-detalle').addEventListener('click', cerrarDetalle)
  document.getElementById('btn-cerrar-detalle2').addEventListener('click', cerrarDetalle)
})

async function cargarProveedoresFiltro() {
  const proveedores = await ipcRenderer.invoke('obtener-proveedores')
  const select = document.getElementById('filtro-proveedor')
  proveedores.forEach(p => {
    const option = document.createElement('option')
    option.value = p.id_proveedor
    option.textContent = p.nombre
    select.appendChild(option)
  })
}

function inicializarFechas() {
  const ahora = new Date()
  const primero = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().split('T')[0]
  const ultimo = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).toISOString().split('T')[0]
  document.getElementById('filtro-desde').value = primero
  document.getElementById('filtro-hasta').value = ultimo
}

async function cargarCompras() {
  const idProveedor = document.getElementById('filtro-proveedor').value
  const desde = document.getElementById('filtro-desde').value
  const hasta = document.getElementById('filtro-hasta').value

  compras = await ipcRenderer.invoke('obtener-compras', { idProveedor, desde, hasta })
  renderizarTabla()
  actualizarResumen()
}

function renderizarTabla() {
  const tbody = document.getElementById('cuerpo-tabla')
  tbody.innerHTML = ''

  if (compras.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#888;">No hay compras en el período seleccionado</td></tr>'
    return
  }

  compras.forEach(c => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${c.fecha}</td>
      <td>${c.nombre_proveedor}</td>
      <td>${c.numero_factura}</td>
      <td>${formatearEuros(c.base_imponible)}</td>
      <td>${formatearEuros(c.total_iva)}</td>
      <td><strong>${formatearEuros(c.total_compra)}</strong></td>
      <td><span class="badge-${c.estado.toLowerCase()}">${c.estado}</span></td>
      <td><button class="btn-ver" data-id="${c.id_compra}">Ver detalle</button></td>
    `
    tbody.appendChild(tr)

    tr.querySelector('.btn-ver').addEventListener('click', () => abrirDetalle(c.id_compra))
  })
}

function actualizarResumen() {
  const num = compras.length
  const base = compras.reduce((acc, c) => acc + (c.base_imponible || 0), 0)
  const iva = compras.reduce((acc, c) => acc + (c.total_iva || 0), 0)
  const total = compras.reduce((acc, c) => acc + (c.total_compra || 0), 0)

  document.getElementById('resumen-num').textContent = num
  document.getElementById('resumen-base').textContent = formatearEuros(base)
  document.getElementById('resumen-iva').textContent = formatearEuros(iva)
  document.getElementById('resumen-total').textContent = formatearEuros(total)
}

async function abrirDetalle(idCompra) {
  const detalle = await ipcRenderer.invoke('obtener-detalle-compra', idCompra)
  if (!detalle) return

  const compra = compras.find(c => c.id_compra === idCompra)

  document.getElementById('detalle-titulo').textContent = `Factura ${compra.numero_factura}`
  document.getElementById('detalle-proveedor').textContent = compra.nombre_proveedor
  document.getElementById('detalle-numero').textContent = compra.numero_factura
  document.getElementById('detalle-fecha').textContent = compra.fecha
  document.getElementById('detalle-total').textContent = formatearEuros(compra.total_compra)

  const tbody = document.getElementById('cuerpo-detalle')
  tbody.innerHTML = ''

  detalle.forEach((linea, index) => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${linea.nombre_proveedor}</td>
      <td>${linea.codigo_proveedor || '—'}</td>
      <td>${linea.nombre_producto || '<span style="color:#888">Sin asignar</span>'}</td>
      <td>${linea.cantidad}</td>
      <td>${formatearEuros(linea.precio_unitario)}</td>
      <td>${linea.porcentaje_iva}%</td>
      <td>${formatearEuros(linea.total_linea)}</td>
    `
    tbody.appendChild(tr)
  })

  document.getElementById('modal-detalle').style.display = 'flex'
}

function cerrarDetalle() {
  document.getElementById('modal-detalle').style.display = 'none'
}

function formatearEuros(numero) {
  if (numero === null || numero === undefined) return '—'
  return Number(numero).toFixed(2).replace('.', ',') + ' €'
}