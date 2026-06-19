const { ipcRenderer } = require('electron')

function formatearEuros(numero) {
  return Number(numero).toFixed(2).replace('.', ',') + ' €'
}

async function cargarResumen() {
  const hoy = new Date().toISOString().split('T')[0]
  document.getElementById('fecha-resumen').textContent = 'Fecha: ' + new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const datos = await ipcRenderer.invoke('obtener-resumen', hoy)

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

cargarResumen()

document.getElementById('btn-cerrar-resumen').addEventListener('click', () => {
  window.close()
})
