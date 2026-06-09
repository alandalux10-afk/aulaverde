
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
  const base = linea.cantidad * linea.precio
  const descuento = base * (linea.descuento / 100)
  const baseConDto = base - descuento
  const iva = baseConDto * (linea.iva / 100)
  return Number((baseConDto + iva).toFixed(2))
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
    const baseLinea = bruto - descuento
    const ivaLinea = baseLinea * (linea.iva / 100)

    base += baseLinea
    totalIva += ivaLinea
    totalDescuento += descuento
    totalVenta += baseLinea + ivaLinea
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