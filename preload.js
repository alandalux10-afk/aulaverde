// preload.js
//
// Puente seguro entre las ventanas (renderer) y el proceso principal.
// Con nodeIntegration desactivado y contextIsolation activado, las ventanas
// ya NO tienen acceso directo a Node.js ni a Electron. Este archivo es el
// único punto por el que pueden pedir cosas al proceso principal, y solo
// puede pedir exactamente lo que está en esta lista — nada más.
//
// Por qué esto es más seguro que antes:
//   Antes, cualquier contenido que acabara ejecutándose dentro de una ventana
//   (por ejemplo, un nombre de producto con código malicioso colado desde una
//   factura de proveedor) tenía acceso completo a Node.js: podía leer/escribir
//   cualquier archivo, ejecutar comandos, etc.
//   Ahora, aunque eso ocurriera, lo máximo que podría hacer es invocar uno de
//   los canales de esta lista — ni uno más.

const { contextBridge, ipcRenderer } = require('electron')

// Canales de tipo "pregunta y espera respuesta" (invoke) que usan las
// pantallas de la aplicación. Debe coincidir con los handlers registrados
// en main.js — si se añade un handler nuevo allí, hay que añadirlo aquí también.
const CANALES_INVOKE = [
  'abrir-campanas', 'abrir-catalogo', 'abrir-clientes', 'abrir-configuracion',
  'abrir-consultas', 'abrir-documento-consentimiento', 'abrir-historico-compras',
  'abrir-modificar-venta', 'abrir-nueva-compra', 'abrir-nueva-venta',
  'abrir-proveedores', 'abrir-resumen', 'abrir-revision-compra',
  'abrir-vista-previa', 'abrir-whatsapp', 'adjuntar-documento-firmado',
  'buscar-productos', 'crear-cliente', 'crear-producto', 'crear-proveedor',
  'dialogo-error', 'dialogo-imprimir', 'editar-cliente', 'editar-producto',
  'editar-proveedor', 'eliminar-venta', 'enviar-campana-email',
  'enviar-email-cliente', 'exportar-catalogo-excel', 'exportar-csv',
  'exportar-listado-facturas', 'exportar-listado-ventas', 'extraer-factura-pdf',
  'generar-consentimiento-pdf', 'guardar-compra', 'guardar-configuracion',
  'guardar-consentimiento-cliente', 'guardar-venta', 'hacer-backup',
  'importar-clientes-excel', 'importar-productos', 'importar-proveedores-excel',
  'imprimir-consentimiento', 'imprimir-factura', 'imprimir-ticket',
  'modificar-venta', 'obtener-alertas-crm', 'obtener-clientes',
  'obtener-clientes-campana', 'obtener-clientes-para-selector', 'obtener-compras',
  'obtener-configuracion', 'obtener-correspondencias', 'obtener-detalle-compra',
  'obtener-historial-cliente', 'obtener-id-iva-por-porcentaje',
  'obtener-id-venta-modificar', 'obtener-plantillas-email',
  'obtener-plantillas-whatsapp', 'obtener-productos-catalogo',
  'obtener-productos-para-selector', 'obtener-proveedores',
  'obtener-puntos-cliente', 'obtener-resumen', 'obtener-resumen-periodo',
  'obtener-siguiente-codigo-producto', 'obtener-siguiente-codigo-catalogo',
  'obtener-venta-detalle', 'obtener-ventas',
  'probar-conexion-smtp', 'reimprimir-ticket', 'seleccionar-carpeta-descargas',
  'toggle-cliente', 'toggle-producto', 'toggle-proveedor'
]

// Canales de tipo "el main avisa a la ventana" (on) que usan modificar-venta
// (para recibir el id de la venta a editar) y revision-compra (para recibir
// los datos de la factura extraída por la IA).
const CANALES_ON = ['iniciar-carga', 'iniciar-revision']

contextBridge.exposeInMainWorld('ipcRenderer', {
  invoke: (canal, ...args) => {
    if (!CANALES_INVOKE.includes(canal)) {
      return Promise.reject(new Error(`Canal IPC no permitido: "${canal}"`))
    }
    return ipcRenderer.invoke(canal, ...args)
  },
  on: (canal, callback) => {
    if (!CANALES_ON.includes(canal)) {
      console.error(`Canal IPC no permitido para escuchar: "${canal}"`)
      return
    }
    // Se envuelve el callback para no exponer el objeto "event" interno de
    // Electron a la ventana, solo los datos que envía el proceso principal.
    ipcRenderer.on(canal, (event, ...args) => callback(...args))
  }
})
