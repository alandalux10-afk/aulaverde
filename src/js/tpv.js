
const { ipcRenderer } = require('electron')

// Estado de la venta actual
let lineas = []
let lineaSeleccionada = null
let displayCalc = ''
let modoCalc = 'cantidad'

// Actualizar fecha y hora en cabecera
function actualizarFechaHora() {
  const ahora = new Date()
  const fecha = ahora.toLocaleDateString('es-ES')
  const hora = ahora.toLocaleTimeString('es-ES')
  document.getElementById('fecha-hora').textContent = `${fecha} ${hora}`
}

setInterval(actualizarFechaHora, 1000)
actualizarFechaHora()

// Formatear número como moneda
function formatearEuros(numero) {
  return Number(numero).toFixed(2).replace('.', ',') + ' €'
}

// Calcular total de una línea
function calcularTotalLinea(linea) {
  const total = linea.cantidad * linea.precio * (1 - linea.descuento / 100)
  return Number(total.toFixed(2))
}

// Recalcular totales del documento
function recalcularTotales() {
  let base = 0
  let totalIva = 0
  let totalDescuento = 0
  let totalVenta = 0

  lineas.forEach(linea => {
    const bruto = linea.cantidad * linea.precio
    const descuento = bruto * (linea.descuento / 100)
    const totalConIva = bruto - descuento
    const divisor = 1 + linea.iva / 100
    const baseLinea = totalConIva / divisor
    const ivaLinea = totalConIva - baseLinea

    base += baseLinea
    totalIva += ivaLinea
    totalDescuento += descuento / divisor
    totalVenta += totalConIva
  })

  document.getElementById('total-base').textContent = formatearEuros(base)
  document.getElementById('total-iva').textContent = formatearEuros(totalIva)
  document.getElementById('total-descuento').textContent = formatearEuros(totalDescuento)
  document.getElementById('total-venta').textContent = formatearEuros(totalVenta)
}

// Renderizar tabla de líneas
function renderizarLineas() {
  const tbody = document.getElementById('cuerpo-tabla')
  tbody.innerHTML = ''

  lineas.forEach((linea, index) => {
    const tr = document.createElement('tr')
    if (lineaSeleccionada === index) {
      tr.classList.add('seleccionada')
    }

    tr.innerHTML = `
      <td>${linea.numero}</td>
      <td>${linea.codigo}</td>
      <td>${linea.nombre}</td>
      <td>${linea.cantidad}</td>
      <td>${formatearEuros(linea.precio)}</td>
      <td>${linea.descuento}%</td>
      <td>${linea.iva}%</td>
      <td>${formatearEuros(linea.total)}</td>
    `

    tr.addEventListener('click', () => {
      lineaSeleccionada = index
      renderizarLineas()
    })

    tbody.appendChild(tr)
  })

  recalcularTotales()
}

// Crear línea en blanco
function crearLinea() {
  const nuevaLinea = {
    numero: lineas.length + 1,
    codigo: '',
    nombre: 'Línea manual',
    cantidad: 1,
    precio: 0,
    descuento: 0,
    iva: 10,
    total: 0
  }
  lineas.push(nuevaLinea)
  lineaSeleccionada = lineas.length - 1
  renderizarLineas()
}

// Eliminar línea seleccionada
function eliminarLinea() {
  if (lineaSeleccionada === null) {
    alert('Selecciona una línea para eliminar')
    return
  }
  lineas.splice(lineaSeleccionada, 1)
  lineas.forEach((l, i) => l.numero = i + 1)
  lineaSeleccionada = null
  renderizarLineas()
}

// Calculadora
function pulsarNumero(num) {
  displayCalc += num
  document.getElementById('display-calc').textContent = displayCalc
}

function pulsarBorrar() {
  displayCalc = displayCalc.slice(0, -1)
  document.getElementById('display-calc').textContent = displayCalc
}

function pulsarLimpiar() {
  displayCalc = ''
  document.getElementById('display-calc').textContent = ''
}

function aplicarCalculadora(accion) {
  if (accion === 'ud') modoCalc = 'cantidad'
  if (accion === 'precio') modoCalc = 'precio'
  if (accion === 'dto') modoCalc = 'descuento'

  if (accion === 'enter' && lineaSeleccionada !== null && displayCalc !== '') {
    const valor = parseFloat(displayCalc.replace(',', '.'))
    if (!isNaN(valor)) {
      const linea = lineas[lineaSeleccionada]
      if (modoCalc === 'cantidad') linea.cantidad = valor
      if (modoCalc === 'precio') linea.precio = valor
      if (modoCalc === 'descuento') linea.descuento = valor
      linea.total = calcularTotalLinea(linea)
      pulsarLimpiar()
      renderizarLineas()
    }
  }

  document.getElementById('display-calc').textContent = 
    accion !== 'enter' ? `[${modoCalc}] ${displayCalc}` : displayCalc
}
// Buscar productos en la base de datos
document.getElementById('input-busqueda').addEventListener('input', async function() {
  const texto = this.value.trim()
  const contenedor = document.getElementById('resultados-busqueda')

  if (texto.length < 2) {
    contenedor.style.display = 'none'
    contenedor.innerHTML = ''
    return
  }

  const productos = await ipcRenderer.invoke('buscar-productos', texto)

  if (productos.length === 0) {
    contenedor.style.display = 'none'
    return
  }

  contenedor.innerHTML = ''
  productos.forEach(p => {
    const div = document.createElement('div')
    div.className = 'resultado-item'
    div.textContent = `${p.codigo} · ${p.nombre} · ${p.precio_venta.toFixed(2).replace('.', ',')} €`
    div.addEventListener('click', () => {
      agregarProductoALinea(p)
      contenedor.style.display = 'none'
      contenedor.innerHTML = ''
      document.getElementById('input-busqueda').value = ''
    })
    contenedor.appendChild(div)
  })

  contenedor.style.display = 'block'
})

function agregarProductoALinea(p) {
  const nuevaLinea = {
    numero: lineas.length + 1,
    codigo: p.codigo,
    nombre: p.nombre,
    cantidad: 1,
    precio: Number((p.precio_venta * (1 + (p.porcentaje_iva || 10) / 100)).toFixed(2)),
    descuento: 0,
    iva: p.porcentaje_iva || 10,
    total: 0
  }
  nuevaLinea.total = calcularTotalLinea(nuevaLinea)
  lineas.push(nuevaLinea)
  lineaSeleccionada = lineas.length - 1
  renderizarLineas()
}
// Navegación con teclado en el buscador
document.getElementById('input-busqueda').addEventListener('keydown', function(e) {
  const contenedor = document.getElementById('resultados-busqueda')
  const items = contenedor.querySelectorAll('.resultado-item')
  if (!items.length) return

  const activo = contenedor.querySelector('.resultado-item.activo')
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
// Eventos de botones
document.getElementById('btn-crear-linea').addEventListener('click', crearLinea)
document.getElementById('btn-eliminar-linea').addEventListener('click', eliminarLinea)

// Botones calculadora
document.querySelectorAll('.btn-calc[data-num]').forEach(btn => {
  btn.addEventListener('click', () => pulsarNumero(btn.dataset.num))
})

document.querySelectorAll('.btn-calc[data-accion]').forEach(btn => {
  btn.addEventListener('click', () => {
    const accion = btn.dataset.accion
    if (accion === 'borrar') pulsarBorrar()
    else if (accion === 'limpiar') pulsarLimpiar()
    else aplicarCalculadora(accion)
  })
})

// Atajo de teclado F1
document.addEventListener('keydown', (e) => {
  if (e.key === 'F1') {
    e.preventDefault()
    crearLinea()
   }
})
// Ventana de cobro
let formaPagoSeleccionada = 1

function abrirCobro() {
  if (lineas.length === 0) {
    alert('No hay productos en la venta')
    return
  }
  const total = lineas.reduce((acc, l) => acc + l.total, 0)
  document.getElementById('cobro-total').textContent = formatearEuros(total)
  document.getElementById('cobro-efectivo').value = ''
  document.getElementById('cobro-cambio').textContent = '0,00 €'
  document.getElementById('cobro-fila-efectivo').style.display = 'flex'
  document.getElementById('cobro-fila-cambio').style.display = 'flex'
  formaPagoSeleccionada = 1
  document.querySelectorAll('.btn-forma-pago').forEach(b => b.classList.remove('activo'))
  document.querySelector('.btn-forma-pago[data-forma="1"]').classList.add('activo')
  document.getElementById('modal-cobro').style.display = 'block'
  setTimeout(() => document.getElementById('cobro-efectivo').focus(), 100)
}

function cerrarCobro() {
  document.getElementById('modal-cobro').style.display = 'none'
}

document.getElementById('btn-cobrar').addEventListener('click', abrirCobro)
document.getElementById('btn-cobro-cancelar').addEventListener('click', cerrarCobro)

document.querySelectorAll('.btn-forma-pago').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-forma-pago').forEach(b => b.classList.remove('activo'))
    btn.classList.add('activo')
    formaPagoSeleccionada = parseInt(btn.dataset.forma)
    if (formaPagoSeleccionada === 2) {
      document.getElementById('cobro-fila-efectivo').style.display = 'none'
      document.getElementById('cobro-fila-cambio').style.display = 'none'
    } else {
      document.getElementById('cobro-fila-efectivo').style.display = 'flex'
      document.getElementById('cobro-fila-cambio').style.display = 'flex'
    }
  })
})

document.getElementById('cobro-efectivo').addEventListener('input', function() {
  const total = lineas.reduce((acc, l) => acc + l.total, 0)
  const efectivo = parseFloat(this.value) || 0
  const cambio = efectivo - total
  document.getElementById('cobro-cambio').textContent = cambio >= 0
    ? formatearEuros(cambio)
    : '0,00 €'
})

document.getElementById('btn-cobro-aceptar').addEventListener('click', async () => {
  const total = lineas.reduce((acc, l) => acc + l.total, 0)
  if (formaPagoSeleccionada === 1) {
    const efectivo = parseFloat(document.getElementById('cobro-efectivo').value) || 0
    if (efectivo < total) {
      alert('El efectivo entregado es menor que el total')
      return
    }
  }
  const resultado = await ipcRenderer.invoke('guardar-venta', lineas, formaPagoSeleccionada, 'TICKET')
  cerrarCobro()
  if (resultado.ok) {
    alert('Venta cobrada correctamente\nDocumento: ' + resultado.numeroDocumento)
  }
  lineas = []
  lineaSeleccionada = null
  renderizarLineas()
})

document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'Enter') {
    e.preventDefault()
    abrirCobro()
  }
})
// Importar productos desde CSV
async function importarProductos() {
  const confirmar = confirm('¿Importar productos desde el CSV? Esto reemplazará todos los productos actuales.')
  if (!confirmar) return

  try {
    const resultado = await ipcRenderer.invoke('importar-productos')
    if (resultado.ok) {
      alert(`Importación completada:\n${resultado.importados} productos importados\n${resultado.errores} errores`)
    } else {
      alert('Error: ' + resultado.mensaje)
    }
  } catch (e) {
    alert('Error durante la importación: ' + e.message)
  }
}