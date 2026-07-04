// Nota de seguridad: antes se hacía "const { ipcRenderer } = require('electron')"
// aquí. Ya no hace falta ni es posible: con nodeIntegration desactivado esta
// ventana no tiene acceso a Node.js. El objeto "ipcRenderer" que se usa más
// abajo lo proporciona ahora preload.js de forma controlada y segura.
let lineas = []
let lineaSeleccionada = null
let idVenta = null

function formatearEuros(n) {
  return Number(n).toFixed(2).replace('.', ',') + ' €'
}

function calcularTotalLinea(l) {
  return Number((l.cantidad * l.precio * (1 - l.descuento / 100)).toFixed(2))
}

function recalcularTotales() {
  let base = 0, iva = 0, dto = 0, total = 0
  lineas.forEach(l => {
    const bruto = l.cantidad * l.precio
    const descuento = bruto * (l.descuento / 100)
    const conIva = bruto - descuento
    const divisor = 1 + l.iva / 100
    base += conIva / divisor
    iva += conIva - conIva / divisor
    dto += descuento / divisor
    total += conIva
  })
  document.getElementById('mod-base').textContent = formatearEuros(base)
  document.getElementById('mod-iva').textContent = formatearEuros(iva)
  document.getElementById('mod-dto').textContent = formatearEuros(dto)
  document.getElementById('mod-total').textContent = formatearEuros(total)
}

function renderizarLineas() {
  const tbody = document.getElementById('cuerpo-mod')
  tbody.innerHTML = ''
  lineas.forEach((l, index) => {
    const tr = document.createElement('tr')
    if (lineaSeleccionada === index) tr.classList.add('seleccionada')
    tr.innerHTML = `
      <td>${l.numero}</td>
      <td>${l.codigo}</td>
      <td>${l.nombre}</td>
      <td>${l.cantidad}</td>
      <td>${formatearEuros(l.precio)}</td>
      <td>${l.descuento}%</td>
      <td>${l.iva}%</td>
      <td>${formatearEuros(l.total)}</td>
    `
    tr.addEventListener('click', () => {
      lineaSeleccionada = index
      renderizarLineas()
    })
    tr.addEventListener('dblclick', () => {
      lineaSeleccionada = index
      abrirEditarLinea()
    })
    tbody.appendChild(tr)
  })
  recalcularTotales()
}

async function cargarVentaConId(id) {
  const datos = await ipcRenderer.invoke('obtener-venta-detalle', parseInt(id))
  if (!datos) return
  document.getElementById('info-doc').textContent =
    `${datos.venta.numero_documento} — ${datos.venta.fecha} — ${datos.venta.cliente}`
  lineas = datos.lineas.map((l, i) => ({
    numero: i + 1,
    id_linea: l.id_linea,
    id_producto: l.id_producto,
    codigo: l.codigo_producto,
    nombre: l.nombre_producto,
    cantidad: l.cantidad,
    precio: l.precio_unitario,
    descuento: l.descuento,
    iva: l.porcentaje_iva,
    total: l.total_linea
  }))
  renderizarLineas()
}

document.getElementById('input-busqueda-mod').addEventListener('input', async function() {
  const texto = this.value.trim()
  const contenedor = document.getElementById('resultados-busqueda-mod')
  if (texto.length < 2) { contenedor.style.display = 'none'; return }
  const productos = await ipcRenderer.invoke('buscar-productos', texto)
  if (!productos.length) { contenedor.style.display = 'none'; return }
  contenedor.innerHTML = ''
  productos.forEach(p => {
    const div = document.createElement('div')
    div.className = 'resultado-item-mod'
    div.textContent = `${p.codigo} · ${p.nombre} · ${p.precio_venta.toFixed(2).replace('.', ',')} €`
    div.addEventListener('click', () => {
      const nueva = {
        numero: lineas.length + 1,
        id_producto: p.id_producto,
        codigo: p.codigo,
        nombre: p.nombre,
        cantidad: 1,
        precio: Number((p.precio_venta * (1 + (p.porcentaje_iva || 10) / 100)).toFixed(2)),
        descuento: 0,
        iva: p.porcentaje_iva || 10,
        total: 0
      }
      nueva.total = calcularTotalLinea(nueva)
      lineas.push(nueva)
      lineaSeleccionada = lineas.length - 1
      renderizarLineas()
      contenedor.style.display = 'none'
      document.getElementById('input-busqueda-mod').value = ''
    })
    contenedor.appendChild(div)
  })
  contenedor.style.display = 'block'
})

document.getElementById('input-busqueda-mod').addEventListener('keydown', function(e) {
  const contenedor = document.getElementById('resultados-busqueda-mod')
  const items = contenedor.querySelectorAll('.resultado-item-mod')
  if (!items.length) return
  const activo = contenedor.querySelector('.resultado-item-mod.activo')
  let index = Array.from(items).indexOf(activo)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (activo) activo.classList.remove('activo')
    index = (index + 1) % items.length
    items[index].classList.add('activo')
    items[index].scrollIntoView({ block: 'nearest' })
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (activo) activo.classList.remove('activo')
    index = (index - 1 + items.length) % items.length
    items[index].classList.add('activo')
    items[index].scrollIntoView({ block: 'nearest' })
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activo) activo.click()
  } else if (e.key === 'Escape') {
    contenedor.style.display = 'none'
    contenedor.innerHTML = ''
  }
})

document.getElementById('btn-mod-crear').addEventListener('click', () => {
  lineas.push({
    numero: lineas.length + 1,
    codigo: '',
    nombre: 'Línea manual',
    cantidad: 1,
    precio: 0,
    descuento: 0,
    iva: 10,
    total: 0
  })
  lineaSeleccionada = lineas.length - 1
  renderizarLineas()
})

document.getElementById('btn-mod-eliminar').addEventListener('click', () => {
  if (lineaSeleccionada === null) { alert('Selecciona una línea'); return }
  lineas.splice(lineaSeleccionada, 1)
  lineas.forEach((l, i) => l.numero = i + 1)
  lineaSeleccionada = null
  renderizarLineas()
})

document.getElementById('btn-mod-guardar').addEventListener('click', async () => {
  if (lineas.length === 0) { alert('La venta no puede quedar vacía'); return }
  const resultado = await ipcRenderer.invoke('modificar-venta', parseInt(idVenta), lineas)
  if (resultado.ok) {
    alert('Venta modificada correctamente')
    window.close()
  } else {
    alert('Error al guardar: ' + resultado.mensaje)
  }
})

document.getElementById('btn-mod-cancelar').addEventListener('click', () => {
  window.close()
})

function abrirEditarLinea() {
  if (lineaSeleccionada === null) { alert('Selecciona una línea para editar'); return }
  const l = lineas[lineaSeleccionada]
  document.getElementById('ed-cantidad').value = l.cantidad
  document.getElementById('ed-precio').value = l.precio
  document.getElementById('ed-descuento').value = l.descuento
  document.getElementById('ed-iva').value = l.iva
  document.getElementById('modal-editar-linea').style.display = 'block'
}

document.getElementById('btn-ed-cancelar').addEventListener('click', () => {
  document.getElementById('modal-editar-linea').style.display = 'none'
})

document.getElementById('btn-ed-aceptar').addEventListener('click', () => {
  const l = lineas[lineaSeleccionada]
  l.cantidad = parseFloat(document.getElementById('ed-cantidad').value) || 0
  l.precio = parseFloat(document.getElementById('ed-precio').value) || 0
  l.descuento = parseFloat(document.getElementById('ed-descuento').value) || 0
  l.iva = parseFloat(document.getElementById('ed-iva').value) || 0
  l.total = calcularTotalLinea(l)
  document.getElementById('modal-editar-linea').style.display = 'none'
  renderizarLineas()
})

ipcRenderer.on('iniciar-carga', (id) => {
  idVenta = id
  cargarVentaConId(id)
})

setTimeout(async () => {
  if (!idVenta) {
    idVenta = await ipcRenderer.invoke('obtener-id-venta-modificar')
    if (idVenta) cargarVentaConId(idVenta)
  }
}, 500)
