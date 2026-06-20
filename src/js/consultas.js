
const { ipcRenderer } = require('electron')

let ventaSeleccionada = null

function formatearEuros(numero) {
	return Number(numero).toFixed(2).replace('.', ',') + ' \u20ac'
}

function formatearFecha(fecha) {
	const d = new Date(fecha)
	return d.toLocaleDateString('es-ES')
}

async function cargarVentas(desde, hasta) {
	const ventas = await ipcRenderer.invoke('obtener-ventas', desde, hasta)
	const tbody = document.getElementById('cuerpo-consultas')
	tbody.innerHTML = ''
	ventaSeleccionada = null
	let totalImporte = 0

	ventas.forEach(venta => {
		const tr = document.createElement('tr')
		tr.innerHTML = `
			<td>${formatearFecha(venta.fecha)}</td>
			<td>${venta.numero_documento}</td>
			<td>${venta.cliente}</td>
			<td class="${venta.estado === 'COBRADO' ? 'estado-cobrado' : 'estado-pendiente'}">${venta.estado}</td>
			<td>${venta.forma_pago}</td>
			<td>${formatearEuros(venta.total_venta)}</td>
			<td>${venta.tipo_documento}</td>
		`
		tr.addEventListener('click', () => {
			document.querySelectorAll('#cuerpo-consultas tr').forEach(r => r.classList.remove('seleccionada'))
			tr.classList.add('seleccionada')
			ventaSeleccionada = venta
		})
		tbody.appendChild(tr)
		totalImporte += venta.total_venta
	})

	document.getElementById('total-operaciones').textContent = ventas.length + ' operaciones'
	document.getElementById('total-importe').textContent = 'Total: ' + formatearEuros(totalImporte)
}

function hoy() {
	return new Date().toISOString().split('T')[0]
}

document.getElementById('filtro-desde').value = hoy()
document.getElementById('filtro-hasta').value = hoy()
cargarVentas(hoy(), hoy())

document.getElementById('btn-filtrar').addEventListener('click', () => {
	const desde = document.getElementById('filtro-desde').value
	const hasta = document.getElementById('filtro-hasta').value
	cargarVentas(desde, hasta)
})

document.getElementById('btn-hoy').addEventListener('click', () => {
	document.getElementById('filtro-desde').value = hoy()
	document.getElementById('filtro-hasta').value = hoy()
	cargarVentas(hoy(), hoy())
})

document.getElementById('btn-eliminar-venta').addEventListener('click', async () => {
	if (!ventaSeleccionada) {
		alert('Selecciona una venta para eliminar')
		return
	}
	const confirmar = confirm('Eliminar la venta ' + ventaSeleccionada.numero_documento + '?')
	if (!confirmar) return
	await ipcRenderer.invoke('eliminar-venta', ventaSeleccionada.id_venta)
	const desde = document.getElementById('filtro-desde').value
	const hasta = document.getElementById('filtro-hasta').value
	cargarVentas(desde, hasta)
})
document.getElementById('btn-modificar-venta').addEventListener('click', async () => {
  if (!ventaSeleccionada) {
    alert('Selecciona una venta para modificar')
    return
  }
  await ipcRenderer.invoke('abrir-modificar-venta', ventaSeleccionada.id_venta)
})
document.getElementById('btn-reimprimir').addEventListener('click', async () => {
  if (!ventaSeleccionada) {
    alert('Selecciona una venta para reimprimir')
    return
  }
  const resultado = await ipcRenderer.invoke('reimprimir-ticket', ventaSeleccionada.id_venta)
  if (!resultado.ok) {
    alert('Error al reimprimir: ' + resultado.mensaje)
  }
})
document.getElementById('btn-vista-previa').addEventListener('click', async () => {
  if (!ventaSeleccionada) {
    alert('Selecciona una venta para ver la vista previa')
    return
  }
  await ipcRenderer.invoke('abrir-vista-previa', ventaSeleccionada.id_venta, ventaSeleccionada.tipo_documento)
})
document.getElementById('btn-cerrar-consultas').addEventListener('click', () => {
	window.close()
})
