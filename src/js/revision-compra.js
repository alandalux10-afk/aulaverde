// Nota de seguridad: antes se hacía "const { ipcRenderer } = require('electron')"
// aquí. Ya no hace falta ni es posible: con nodeIntegration desactivado esta
// ventana no tiene acceso a Node.js. El objeto "ipcRenderer" que se usa más
// abajo lo proporciona ahora preload.js de forma controlada y segura.
let datosFactura = null
let idProveedor = null
let nombreProveedor = null
let rutaPdf = null
let productosInternos = []
let lineaParaCrearProducto = null

window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.on('iniciar-revision', (event, datos) => {
    datosFactura = datos.datosFactura
    idProveedor = datos.idProveedor
    nombreProveedor = datos.nombreProveedor
    rutaPdf = datos.rutaPdf
    iniciarRevision()
  })
})

async function iniciarRevision() {
  productosInternos = await ipcRenderer.invoke('obtener-productos-para-selector')

  document.getElementById('dato-proveedor').textContent = nombreProveedor
  document.getElementById('dato-numero').textContent = datosFactura.numero_factura || '—'
  document.getElementById('dato-fecha').textContent = datosFactura.fecha || '—'
  document.getElementById('dato-base').textContent = formatearEuros(datosFactura.base_imponible)
  document.getElementById('dato-iva').textContent = formatearEuros(datosFactura.total_iva)
  document.getElementById('dato-total').textContent = formatearEuros(datosFactura.total_factura)

  const correspondencias = await ipcRenderer.invoke('obtener-correspondencias', idProveedor)

  const tbody = document.getElementById('cuerpo-tabla')
  tbody.innerHTML = ''

  datosFactura.lineas.forEach((linea, index) => {
    const corr = correspondencias.find(c =>
      c.nombre_proveedor.toLowerCase() === linea.nombre_proveedor.toLowerCase()
    )
    const reconocida = !!corr

    const tr = document.createElement('tr')
    tr.className = reconocida ? 'reconocida' : 'pendiente'
    tr.dataset.index = index

    let opcionesSelector = '<option value="">— Sin asignar —</option>'
    productosInternos.forEach(p => {
      const seleccionado = corr && corr.id_producto === p.id_producto ? 'selected' : ''
      opcionesSelector += `<option value="${p.id_producto}" ${seleccionado}>${p.nombre}</option>`
    })

    const claseSelector = reconocida ? 'asignado' : 'sin-asignar'
    const badgeEstado = reconocida
      ? '<span class="badge-reconocido">✅ Reconocido</span>'
      : '<span class="badge-pendiente">⚠️ Pendiente</span>'

    // El botón + Crear solo aparece en líneas pendientes
    const botonCrear = reconocida ? '' : `
      <button
        class="btn-crear-producto"
        data-index="${index}"
        title="Crear este producto en el catálogo"
      >+ Crear producto nuevo</button>
    `

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${linea.nombre_proveedor}</strong><br><small style="color:#888">${badgeEstado}</small></td>
      <td>${linea.codigo_proveedor || '—'}</td>
      <td>${linea.cantidad}</td>
      <td>${formatearEuros(linea.precio_unitario)}</td>
      <td>${linea.porcentaje_iva}%</td>
      <td>${formatearEuros(linea.total_linea)}</td>
      <td>
        <select class="selector-producto ${claseSelector}" data-index="${index}">
          ${opcionesSelector}
        </select>
        ${botonCrear}
      </td>
    `
    tbody.appendChild(tr)

    const selector = tr.querySelector('.selector-producto')
    selector.addEventListener('change', function () {
      if (this.value) {
        this.className = 'selector-producto asignado'
        tr.className = 'reconocida'
        const btn = tr.querySelector('.btn-crear-producto')
        if (btn) btn.style.display = 'none'
      } else {
        this.className = 'selector-producto sin-asignar'
        tr.className = 'pendiente'
        const btn = tr.querySelector('.btn-crear-producto')
        if (btn) btn.style.display = 'block'
      }
    })

    const btnCrear = tr.querySelector('.btn-crear-producto')
    if (btnCrear) {
      btnCrear.addEventListener('click', () => abrirModalCrearProducto(index))
    }
  })

  document.getElementById('btn-cancelar').addEventListener('click', () => window.close())
  document.getElementById('btn-confirmar').addEventListener('click', confirmarCompra)
  document.getElementById('np-cancelar').addEventListener('click', cerrarModalCrearProducto)
  document.getElementById('np-guardar').addEventListener('click', guardarProductoNuevo)
}

async function abrirModalCrearProducto(index) {
  lineaParaCrearProducto = index
  const linea = datosFactura.lineas[index]

  const siguienteCodigo = await ipcRenderer.invoke('obtener-siguiente-codigo-producto')

  document.getElementById('np-codigo').value = siguienteCodigo
  document.getElementById('np-nombre').value = linea.nombre_proveedor
  document.getElementById('np-familia').value = ''
  document.getElementById('np-tipo-venta').value = 'UNIDAD'
  document.getElementById('np-precio-coste').value = linea.precio_unitario || ''
  document.getElementById('np-precio-venta').value = ''

  const ivaLinea = linea.porcentaje_iva || 10
  const selectIva = document.getElementById('np-iva')
  const opciones = Array.from(selectIva.options)
  const masCercana = opciones.reduce((prev, curr) =>
    Math.abs(Number(curr.value) - ivaLinea) < Math.abs(Number(prev.value) - ivaLinea) ? curr : prev
  )
  selectIva.value = masCercana.value

  document.getElementById('np-error').style.display = 'none'
  document.getElementById('modal-crear-producto').style.display = 'flex'
  document.getElementById('np-nombre').focus()
}

function cerrarModalCrearProducto() {
  document.getElementById('modal-crear-producto').style.display = 'none'
  lineaParaCrearProducto = null
}

async function guardarProductoNuevo() {
  const nombre = document.getElementById('np-nombre').value.trim()
  const precioVenta = parseFloat(document.getElementById('np-precio-venta').value)

  if (!nombre) {
    mostrarErrorModal('El nombre es obligatorio.')
    return
  }
  if (!precioVenta || precioVenta <= 0) {
    mostrarErrorModal('El precio de venta es obligatorio.')
    return
  }

  const ivaPorcentaje = parseFloat(document.getElementById('np-iva').value)
  const idIva = await ipcRenderer.invoke('obtener-id-iva-por-porcentaje', ivaPorcentaje)

  const datos = {
    codigo: document.getElementById('np-codigo').value,
    nombre,
    familia: document.getElementById('np-familia').value.trim(),
    tipo_venta: document.getElementById('np-tipo-venta').value,
    precio_coste: parseFloat(document.getElementById('np-precio-coste').value) || 0,
    precio_venta: precioVenta,
    id_iva: idIva
  }

  const resultado = await ipcRenderer.invoke('crear-producto', datos)

  if (resultado.ok) {
    productosInternos = await ipcRenderer.invoke('obtener-productos-para-selector')

    const nuevoProducto = productosInternos.find(p => p.nombre === nombre)
    if (nuevoProducto) {
      const selectores = document.querySelectorAll('.selector-producto')
      const selector = selectores[lineaParaCrearProducto]

      const option = document.createElement('option')
      option.value = nuevoProducto.id_producto
      option.textContent = nuevoProducto.nombre
      option.selected = true
      selector.appendChild(option)
      selector.className = 'selector-producto asignado'

      const tr = document.querySelector(`tr[data-index="${lineaParaCrearProducto}"]`)
      if (tr) {
        tr.className = 'reconocida'
        const btn = tr.querySelector('.btn-crear-producto')
        if (btn) btn.style.display = 'none'
      }
    }

    cerrarModalCrearProducto()
    alert(`✅ Producto "${nombre}" creado correctamente y asignado a esta línea.`)
  } else {
    mostrarErrorModal(resultado.mensaje || 'Error al crear el producto.')
  }
}

async function confirmarCompra() {
  const selectores = document.querySelectorAll('.selector-producto')
  const lineasConProducto = datosFactura.lineas.map((linea, index) => {
    const idProducto = selectores[index].value ? parseInt(selectores[index].value) : null
    return { ...linea, id_producto: idProducto }
  })

  const resultado = await ipcRenderer.invoke('guardar-compra', {
    idProveedor,
    nombreProveedor,
    rutaPdf,
    datosFactura,
    lineas: lineasConProducto
  })

  if (resultado.ok) {
    alert(`✅ Compra guardada correctamente.\n\nNº factura: ${datosFactura.numero_factura}\nTotal: ${formatearEuros(datosFactura.total_factura)}\n\nCorrespondencias nuevas aprendidas: ${resultado.correspondenciasNuevas}`)
    window.close()
  } else {
    alert('❌ Error al guardar: ' + resultado.mensaje)
  }
}

function mostrarErrorModal(texto) {
  const el = document.getElementById('np-error')
  el.textContent = texto
  el.style.display = 'block'
}

function formatearEuros(numero) {
  if (numero === null || numero === undefined) return '—'
  return Number(numero).toFixed(2).replace('.', ',') + ' €'
}
