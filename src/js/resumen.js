const { ipcRenderer } = require('electron')

function formatearEuros(numero) {
  return Number(numero).toFixed(2).replace('.', ',') + ' €'
}

function hoy() {
  return new Date().toISOString().split('T')[0]
}

async function cargarResumen(desde, hasta) {
  const fechaTexto = desde === hasta
    ? new Date(desde + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : `${new Date(desde + 'T12:00:00').toLocaleDateString('es-ES')} — ${new Date(hasta + 'T12:00:00').toLocaleDateString('es-ES')}`

  document.getElementById('fecha-resumen').textContent = 'Período: ' + fechaTexto

  const datos = await ipcRenderer.invoke('obtener-resumen-periodo', desde, hasta)

  document.getElementById('num-operaciones').textContent = datos.numOperaciones
  document.getElementById('total-ventas').textContent = formatearEuros(datos.totalVentas)
  document.getElementById('ventas-efectivo').textContent = formatearEuros(datos.efectivo)
  document.getElementById('ventas-tarjeta').textContent = formatearEuros(datos.tarjeta)
  document.getElementById('ticket-medio').textContent = formatearEuros(datos.ticketMedio)
  document.getElementById('ventas-pendientes').textContent = datos.pendientes
  document.getElementById('beneficio-estimado').textContent = formatearEuros(datos.beneficio || 0)

  const tbody = document.getElementById('cuerpo-top-productos')
  tbody.innerHTML = ''
  datos.topProductos.forEach(p => {
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${p.nombre}</td><td>${p.cantidad}</td><td>${formatearEuros(p.total)}</td>`
    tbody.appendChild(tr)
  })
}

const fechaHoy = hoy()
document.getElementById('resumen-desde').value = fechaHoy
document.getElementById('resumen-hasta').value = fechaHoy
cargarResumen(fechaHoy, fechaHoy)

document.getElementById('btn-filtrar-resumen').addEventListener('click', () => {
  const desde = document.getElementById('resumen-desde').value
  const hasta = document.getElementById('resumen-hasta').value
  if (!desde || !hasta) {
    alert('Selecciona las fechas de inicio y fin')
    return
  }
  cargarResumen(desde, hasta)
})

document.getElementById('btn-hoy-resumen').addEventListener('click', () => {
  const fechaHoy = hoy()
  document.getElementById('resumen-desde').value = fechaHoy
  document.getElementById('resumen-hasta').value = fechaHoy
  cargarResumen(fechaHoy, fechaHoy)
})

document.getElementById('btn-cerrar-resumen').addEventListener('click', () => {
  window.close()
})
