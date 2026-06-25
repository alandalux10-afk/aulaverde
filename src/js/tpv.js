const { ipcRenderer } = require('electron')

let lineas = []
let lineaSeleccionada = null
let displayCalc = ''
let modoCalc = 'cantidad'

function actualizarFechaHora() {
  const ahora = new Date()
  const fecha = ahora.toLocaleDateString('es-ES')
  const hora = ahora.toLocaleTimeString('es-ES')
  document.getElementById('fecha-hora').textContent = `${fecha} ${hora}`
}
setInterval(actualizarFechaHora, 1000)
actualizarFechaHora()

function formatearEuros(numero) {
  return Number(numero).toFixed(2).replace('.', ',') + ' €'
}

function calcularTotalLinea(linea) {
  const total = linea.cantidad * linea.precio * (1 - linea.descuento / 100)
  return Number(total.toFixed(2))
}

function recalcularTotales() {
  let base = 0, totalIva = 0, totalDescuento = 0, totalVenta = 0
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

function renderizarLineas() {
  const tbody = document.getElementById('cuerpo-tabla')
  tbody.innerHTML = ''
  lineas.forEach((linea, index) => {
    const tr = document.createElement('tr')
    if (lineaSeleccionada === index) tr.classList.add('seleccionada')
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
      document.body.focus()
      renderizarLineas()
    })
    tbody.appendChild(tr)
  })
  recalcularTotales()
}

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

document.getElementById('btn-crear-linea').addEventListener('click', crearLinea)
document.getElementById('btn-eliminar-linea').addEventListener('click', eliminarLinea)

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

document.addEventListener('keydown', (e) => {
  if (e.key === 'F1') {
    e.preventDefault()
    crearLinea()
  }
})

let formaPagoSeleccionada = 1
let tipoDocumentoSeleccionado = 'TICKET'

function abrirCobro() {
  if (lineas.length === 0) {
    alert('No hay productos en la venta')
    return
  }
  const totalVenta = lineas.reduce((acc, l) => acc + l.total, 0)
  if (totalVenta === 0) {
    const confirmar = confirm('El total de la venta es 0,00 €. ¿Deseas continuar?')
    if (!confirmar) return
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
  tipoDocumentoSeleccionado = 'TICKET'
  document.querySelectorAll('.btn-tipo-doc').forEach(b => b.classList.remove('activo'))
  document.querySelector('.btn-tipo-doc[data-tipo="TICKET"]').classList.add('activo')
  document.getElementById('modal-cobro').style.display = 'block'
  setTimeout(() => document.getElementById('cobro-efectivo').focus(), 100)
}

function cerrarCobro() {
  document.getElementById('modal-cobro').style.display = 'none'
}

document.getElementById('btn-cobrar').addEventListener('click', abrirCobro)
document.getElementById('btn-cobro-cancelar').addEventListener('click', cerrarCobro)

document.querySelectorAll('.btn-tipo-doc').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-tipo-doc').forEach(b => b.classList.remove('activo'))
    btn.classList.add('activo')
    tipoDocumentoSeleccionado = btn.dataset.tipo
  })
})

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

document.getElementById('cobro-efectivo').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    document.getElementById('btn-cobro-aceptar').click()
  }
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
  const resultado = await ipcRenderer.invoke('guardar-venta', lineas, formaPagoSeleccionada, tipoDocumentoSeleccionado)
  cerrarCobro()
  if (resultado.ok) {
    lineas = []
    lineaSeleccionada = null
    renderizarLineas()
    const imprimir = await ipcRenderer.invoke('dialogo-imprimir', resultado.numeroDocumento)
    if (imprimir) {
      let resImp
      if (tipoDocumentoSeleccionado === 'FACTURA_SIMPLIFICADA') {
        resImp = await ipcRenderer.invoke('imprimir-factura', resultado.venta, resultado.lineas)
      } else {
        resImp = await ipcRenderer.invoke('imprimir-ticket', resultado.venta, resultado.lineas, {})
      }
      if (!resImp.ok) await ipcRenderer.invoke('dialogo-error', resImp.mensaje)
    }
   setTimeout(() => {
      window.focus()
      document.getElementById('input-busqueda').focus()
      document.getElementById('input-busqueda').click()
    }, 500)
  } else {
    await ipcRenderer.invoke('dialogo-error', resultado.mensaje)
  } 
})

document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'Enter') {
    e.preventDefault()
    abrirCobro()
  }
})

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

document.getElementById('btn-nueva-venta').addEventListener('click', () => {
  ipcRenderer.invoke('abrir-nueva-venta')
})
document.getElementById('btn-consultas').addEventListener('click', () => {
  ipcRenderer.invoke('abrir-consultas')
})

document.getElementById('btn-resumen').addEventListener('click', () => {
  ipcRenderer.invoke('abrir-resumen')
})

document.getElementById('btn-configuracion').addEventListener('click', () => {
  ipcRenderer.invoke('abrir-configuracion')
})
document.getElementById('btn-catalogo').addEventListener('click', () => {
  ipcRenderer.invoke('abrir-catalogo')
})

function abrirOpciones() {
  if (lineaSeleccionada === null) {
    alert('Selecciona una línea para editar')
    return
  }
  const linea = lineas[lineaSeleccionada]
  document.getElementById('op-codigo').value = linea.codigo
  document.getElementById('op-nombre').value = linea.nombre
  document.getElementById('op-cantidad').value = linea.cantidad
  document.getElementById('op-precio').value = linea.precio
  document.getElementById('op-descuento').value = linea.descuento
  document.getElementById('op-iva').value = linea.iva
  document.getElementById('modal-opciones').style.display = 'block'
}

function cerrarOpciones() {
  document.getElementById('modal-opciones').style.display = 'none'
}

document.getElementById('btn-opciones-linea').addEventListener('click', abrirOpciones)
document.getElementById('btn-opciones-cancelar').addEventListener('click', cerrarOpciones)

document.getElementById('btn-opciones-aceptar').addEventListener('click', () => {
  const linea = lineas[lineaSeleccionada]
  linea.codigo = document.getElementById('op-codigo').value
  linea.nombre = document.getElementById('op-nombre').value
  linea.cantidad = parseFloat(document.getElementById('op-cantidad').value) || 0
  linea.precio = parseFloat(document.getElementById('op-precio').value) || 0
  linea.descuento = parseFloat(document.getElementById('op-descuento').value) || 0
  linea.iva = parseFloat(document.getElementById('op-iva').value) || 0
  linea.total = calcularTotalLinea(linea)
  cerrarOpciones()
  renderizarLineas()
})

document.addEventListener('keydown', (e) => {
  const foco = document.activeElement
  if (foco && foco.id === 'cobro-efectivo') return
  if (document.getElementById('modal-opciones').style.display === 'block') return
  if (document.getElementById('modal-cobro').style.display === 'block') return
  if (lineaSeleccionada !== null) {
    if ((e.key >= '0' && e.key <= '9') || e.key === '.') {
      e.preventDefault()
      e.stopPropagation()
      pulsarNumero(e.key)
      return
    }
    if (e.key === 'Backspace') {
      e.preventDefault()
      pulsarBorrar()
      return
    }
    if (e.key === 'Escape') {
      pulsarLimpiar()
      return
    }
    if (e.key === 'Enter' && !e.altKey) {
      if (displayCalc !== '') {
        e.preventDefault()
        aplicarCalculadora('enter')
      }
      return
    }
  }
}, true)
