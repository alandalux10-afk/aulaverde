// src/handlers/compras.js
//
// Módulo de compras a proveedores: gestión de proveedores, importación
// desde Excel, subida y extracción de facturas por IA, revisión y
// correspondencia de productos, histórico y exportación a Excel.
//
// Extraído de main.js como parte de la reorganización del código en
// módulos más pequeños. La lógica de cada handler es EXACTAMENTE la misma
// que tenía antes en main.js, solo ha cambiado el sitio donde vive.

const path = require('path')
const { getDB, guardarDB, descifrar } = require('../js/database')
const { getRutaDescargas } = require('../js/rutas')

function registrar(ipcMain, BrowserWindow) {
  ipcMain.handle('importar-proveedores-excel', async (event) => {
    try {
      const { dialog } = require('electron')
      const XLSX = require('xlsx')

      const win = BrowserWindow.fromWebContents(event.sender)
      const { filePaths, canceled } = await dialog.showOpenDialog(win, {
        title: 'Selecciona el Excel de proveedores',
        filters: [{ name: 'Excel', extensions: ['xls', 'xlsx'] }],
        properties: ['openFile']
      })

      if (canceled || !filePaths || filePaths.length === 0) {
        return { ok: false, mensaje: 'No se seleccionó ningún archivo' }
      }

      const rutaExcel = filePaths[0]
      const libro = XLSX.readFile(rutaExcel)
      const hoja = libro.Sheets[libro.SheetNames[0]]
      const filas = XLSX.utils.sheet_to_json(hoja)

      const db = getDB()

      let importados = 0
      let omitidos = 0

      filas.forEach(fila => {
        const nombre = (fila['Nombre'] || '').toString().trim()
        if (!nombre) return

        const existe = db.exec(`SELECT id_proveedor FROM PROVEEDORES WHERE nombre = ?`, [nombre])
        if (existe.length && existe[0].values.length) {
          omitidos++
          return
        }

        const partesDireccion = [
          fila['Dirección'] || '',
          fila['C.P.'] ? String(Math.round(fila['C.P.'])).padStart(5, '0') : '',
          fila['Población'] || '',
          fila['Provincia'] || ''
        ].map(s => s.toString().trim()).filter(s => s !== '' && s !== '0')
        const direccion = partesDireccion.join(', ')

        const nif = (fila['N.I.F.'] || '').toString().trim()
        const telefono = fila['Teléfono'] ? String(Math.round(fila['Teléfono'])) : ''

        db.run(
          'INSERT INTO PROVEEDORES (nombre, nif, direccion, telefono, email, activo, recargo_equivalencia) VALUES (?, ?, ?, ?, ?, 1, 1)',
          [nombre, nif, direccion, telefono, '']
        )
        importados++
      })

      guardarDB()
      return { ok: true, importados, omitidos }

    } catch (e) {
      return { ok: false, mensaje: e.message }
    }
  })

  ipcMain.handle('abrir-nueva-compra', () => {
    const win = new BrowserWindow({
      width: 720,
      height: 620,
      title: 'Nueva compra - Aula Verde',
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    win.loadFile('src/html/nueva-compra.html')
  })

  ipcMain.handle('extraer-factura-pdf', async (event, datos) => {
    try {
      const fs = require('fs')
      const pathMod = require('path')

      const db = getDB()
      const cfgResult = db.exec('SELECT api_key_anthropic FROM CONFIGURACION WHERE id_configuracion = 1')
      if (!cfgResult.length || !cfgResult[0].values[0][0]) {
        return { ok: false, mensaje: 'No hay clave API configurada. Ve a Configuración y añade tu clave API de Anthropic.' }
      }
      const apiKey = descifrar(cfgResult[0].values[0][0])

      const ahora = new Date()
      const sufijo = `${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}_${Date.now()}`
      const nombreArchivo = `factura_${sufijo}.pdf`
      const carpetaLocal = getRutaDescargas()
      const cfgFacturas = db.exec('SELECT ruta_backup_facturas FROM CONFIGURACION WHERE id_configuracion = 1')
      const carpetaDrive = (cfgFacturas.length && cfgFacturas[0].values[0][0]) || 'G:\\Mi unidad\\AulaVerde Facturas'
      const rutaLocal = pathMod.join(carpetaLocal, nombreArchivo)

      const bufferPdf = Buffer.from(datos.base64, 'base64')
      fs.writeFileSync(rutaLocal, bufferPdf)

      try {
        if (!fs.existsSync(carpetaDrive)) fs.mkdirSync(carpetaDrive, { recursive: true })
        fs.copyFileSync(rutaLocal, pathMod.join(carpetaDrive, nombreArchivo))
      } catch (e) {
        console.log('Google Drive no disponible, solo guardado local')
      }

      const fetch = require('electron').net.fetch
      const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: datos.base64
                  }
                },
                {
                  type: 'text',
                  text: `Analiza esta factura de proveedor y extrae los datos en formato JSON.
Responde ÚNICAMENTE con el JSON, sin texto adicional, sin explicaciones, sin bloques de código.

El JSON debe tener exactamente esta estructura:
{
  "proveedor_nombre": "nombre del proveedor tal como aparece en la factura",
  "proveedor_nif": "NIF o CIF del proveedor",
  "numero_factura": "número de factura",
  "fecha": "fecha en formato YYYY-MM-DD",
  "lineas": [
    {
      "nombre_proveedor": "nombre del producto tal como aparece en la factura",
      "codigo_proveedor": "referencia o código del producto, vacío si no hay",
      "cantidad": 0.000,
      "precio_unitario": 0.00,
      "porcentaje_iva": 0.00,
      "importe_iva": 0.00,
      "total_linea": 0.00
    }
  ],
  "base_imponible": 0.00,
  "total_iva": 0.00,
  "total_factura": 0.00
}`
                }
              ]
            }
          ]
        })
      })

      const json = await respuesta.json()
      if (!respuesta.ok) {
        return { ok: false, mensaje: 'Error de la API: ' + (json.error?.message || 'Error desconocido') }
      }

      const textoRespuesta = json.content[0].text.trim()
      const datosFactura = JSON.parse(textoRespuesta)
      return { ok: true, datos: datosFactura, rutaPdf: rutaLocal }

    } catch (e) {
      return { ok: false, mensaje: e.message }
    }
  })

  ipcMain.handle('abrir-revision-compra', (event, datosFactura, idProveedor, nombreProveedor, rutaPdf) => {
    const win = new BrowserWindow({
      width: 1300,
      height: 750,
      title: 'Revisión de compra - Aula Verde',
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    win.loadFile('src/html/revision-compra.html')
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('iniciar-revision', {
        datosFactura,
        idProveedor,
        nombreProveedor,
        rutaPdf
      })
    })
  })

  ipcMain.handle('obtener-siguiente-codigo-producto', () => {
    try {
      const db = getDB()
      const result = db.exec("SELECT MAX(CAST(codigo AS INTEGER)) FROM PRODUCTOS WHERE codigo GLOB '[0-9]*'")
      const maximo = result.length && result[0].values[0][0] ? result[0].values[0][0] : 0
      const siguiente = String(Number(maximo) + 1).padStart(5, '0')
      return siguiente
    } catch (e) {
      return '00001'
    }
  })

  ipcMain.handle('obtener-id-iva-por-porcentaje', (event, porcentaje) => {
    const db = getDB()
    const result = db.exec(`SELECT id_iva FROM TIPOS_IVA WHERE porcentaje = ? AND activo = 1 LIMIT 1`, [porcentaje])
    if (result.length && result[0].values.length) return result[0].values[0][0]
    return 2
  })

  ipcMain.handle('obtener-productos-para-selector', () => {
    const db = getDB()
    const result = db.exec('SELECT id_producto, codigo, nombre FROM PRODUCTOS WHERE activo = 1 ORDER BY nombre ASC')
    if (!result.length) return []
    const cols = result[0].columns
    return result[0].values.map(row => {
      const obj = {}
      cols.forEach((col, i) => obj[col] = row[i])
      return obj
    })
  })

  ipcMain.handle('obtener-correspondencias', (event, idProveedor) => {
    const db = getDB()
    const result = db.exec(`SELECT * FROM PRODUCTOS_PROVEEDOR WHERE id_proveedor = ? AND activo = 1`, [idProveedor])
    if (!result.length) return []
    const cols = result[0].columns
    return result[0].values.map(row => {
      const obj = {}
      cols.forEach((col, i) => obj[col] = row[i])
      return obj
    })
  })

  ipcMain.handle('guardar-compra', (event, datos) => {
    try {
      const db = getDB()

      db.run(
        'INSERT INTO COMPRAS (id_proveedor, numero_factura, fecha, estado, base_imponible, total_iva, total_compra, pdf_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          datos.idProveedor,
          datos.datosFactura.numero_factura,
          datos.datosFactura.fecha,
          'REGISTRADA',
          datos.datosFactura.base_imponible,
          datos.datosFactura.total_iva,
          datos.datosFactura.total_factura,
          datos.rutaPdf
        ]
      )

      const idCompraResult = db.exec('SELECT last_insert_rowid()')
      const idCompra = idCompraResult[0].values[0][0]

      datos.lineas.forEach((linea, index) => {
        db.run(
          'INSERT INTO LINEAS_COMPRA (id_compra, numero_linea, nombre_proveedor, codigo_proveedor, id_producto, cantidad, precio_unitario, porcentaje_iva, importe_iva, total_linea) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            idCompra, index + 1, linea.nombre_proveedor, linea.codigo_proveedor || '',
            linea.id_producto || null, linea.cantidad, linea.precio_unitario,
            linea.porcentaje_iva, linea.importe_iva, linea.total_linea
          ]
        )
      })

      let correspondenciasNuevas = 0
      datos.lineas.forEach(linea => {
        if (!linea.id_producto) return
        try {
          db.run(
            'INSERT OR IGNORE INTO PRODUCTOS_PROVEEDOR (id_proveedor, nombre_proveedor, codigo_proveedor, id_producto, activo) VALUES (?, ?, ?, ?, 1)',
            [datos.idProveedor, linea.nombre_proveedor, linea.codigo_proveedor || '', linea.id_producto]
          )
          correspondenciasNuevas++
        } catch (e) {}
      })

      guardarDB()
      return { ok: true, correspondenciasNuevas }

    } catch (e) {
      return { ok: false, mensaje: e.message }
    }
  })

  ipcMain.handle('abrir-historico-compras', () => {
    const win = new BrowserWindow({
      width: 1100,
      height: 700,
      title: 'Histórico de compras - Aula Verde',
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    win.loadFile('src/html/historico-compras.html')
  })

  ipcMain.handle('obtener-compras', (event, filtros) => {
    const db = getDB()
    let sql = `
      SELECT c.id_compra, c.numero_factura, c.fecha, c.estado,
      c.base_imponible, c.total_iva, c.total_compra, c.pdf_path,
      p.nombre as nombre_proveedor
      FROM COMPRAS c
      JOIN PROVEEDORES p ON c.id_proveedor = p.id_proveedor
      WHERE 1=1
    `
    const params = []
    if (filtros.idProveedor) {
      sql += ` AND c.id_proveedor = ?`
      params.push(filtros.idProveedor)
    }
    if (filtros.desde) {
      sql += ` AND c.fecha >= ?`
      params.push(filtros.desde)
    }
    if (filtros.hasta) {
      sql += ` AND c.fecha <= ?`
      params.push(filtros.hasta)
    }
    sql += ' ORDER BY c.fecha DESC, c.id_compra DESC'

    const result = db.exec(sql, params)
    if (!result.length) return []
    const cols = result[0].columns
    return result[0].values.map(row => {
      const obj = {}
      cols.forEach((col, i) => obj[col] = row[i])
      return obj
    })
  })

  ipcMain.handle('exportar-listado-facturas', async (event, filtros) => {
    try {
      const db = getDB()
      const pathMod = require('path')
      const XLSX = require('xlsx')

      const comprasResult = db.exec(`
        SELECT c.id_compra, c.numero_factura, c.fecha, c.total_compra,
               p.nombre as nombre_proveedor, p.recargo_equivalencia
        FROM COMPRAS c
        JOIN PROVEEDORES p ON c.id_proveedor = p.id_proveedor
        WHERE c.fecha >= ? AND c.fecha <= ?
        ORDER BY c.fecha ASC, c.id_compra ASC
      `, [filtros.desde, filtros.hasta])

      if (!comprasResult.length || !comprasResult[0].values.length) {
        return { ok: false, mensaje: 'No hay facturas en el período seleccionado.' }
      }

      const colsCompra = comprasResult[0].columns
      const compras = comprasResult[0].values.map(row => {
        const obj = {}
        colsCompra.forEach((col, i) => obj[col] = row[i])
        return obj
      })

      const filas = []
      compras.forEach(compra => {
        const lineasResult = db.exec(`
          SELECT porcentaje_iva, SUM(total_linea / (1 + porcentaje_iva / 100.0)) as base,
                 SUM(importe_iva) as iva
          FROM LINEAS_COMPRA
          WHERE id_compra = ?
          GROUP BY porcentaje_iva
        `, [compra.id_compra])

        let base4=0,iva4=0,recargo4=0,base10=0,iva10=0,recargo10=0,base21=0,iva21=0,recargo21=0,base0=0,iva0=0,recargo0=0,baseTotal=0

        if (lineasResult.length && lineasResult[0].values.length) {
          lineasResult[0].values.forEach(row => {
            const pct=Number(row[0]),base=Number(Number(row[1]).toFixed(2)),iva=Number(Number(row[2]).toFixed(2))
            baseTotal+=base
            const tieneRecargo=compra.recargo_equivalencia===1
            if(pct===4){base4=base;iva4=iva;recargo4=tieneRecargo?Number((base*0.005).toFixed(2)):0}
            else if(pct===10){base10=base;iva10=iva;recargo10=tieneRecargo?Number((base*0.014).toFixed(2)):0}
            else if(pct===21){base21=base;iva21=iva;recargo21=tieneRecargo?Number((base*0.052).toFixed(2)):0}
            else if(pct===0){base0=base;iva0=iva;recargo0=0}
          })
        }

        filas.push({
          'Nº Factura': compra.numero_factura, 'Fecha': compra.fecha, 'Proveedor': compra.nombre_proveedor,
          'Base': Number(baseTotal.toFixed(2)),
          'Base IVA 4%': base4||'', 'IVA 4% Superreducido': iva4||'', 'Rec. Equiv. 4%': recargo4||'',
          'Base IVA 10%': base10||'', 'IVA 10% Reducido': iva10||'', 'Rec. Equiv. 10%': recargo10||'',
          'Base IVA 21%': base21||'', 'IVA 21% General': iva21||'', 'Rec. Equiv. 21%': recargo21||'',
          'Base IVA 0%': base0||'', 'IVA 0% Exento': iva0||'', 'Rec. Equiv. 0%': recargo0||'',
          'Total': Number(compra.total_compra.toFixed(2))
        })
      })

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(filas)
      ws['!cols'] = [{wch:15},{wch:12},{wch:30},{wch:10},{wch:12},{wch:18},{wch:15},{wch:12},{wch:18},{wch:15},{wch:12},{wch:18},{wch:15},{wch:12},{wch:18},{wch:15},{wch:10}]
      XLSX.utils.book_append_sheet(wb, ws, 'Facturas recibidas')

      const nombreArchivo = `facturas_recibidas_${filtros.desde}_${filtros.hasta}.xlsx`
      const ruta = pathMod.join(getRutaDescargas(), nombreArchivo)
      XLSX.writeFile(wb, ruta)
      return { ok: true, ruta }

    } catch (e) {
      return { ok: false, mensaje: e.message }
    }
  })

  ipcMain.handle('obtener-detalle-compra', (event, idCompra) => {
    const db = getDB()
    const result = db.exec(`
      SELECT lc.*, p.nombre as nombre_producto
      FROM LINEAS_COMPRA lc
      LEFT JOIN PRODUCTOS p ON lc.id_producto = p.id_producto
      WHERE lc.id_compra = ?
      ORDER BY lc.numero_linea ASC
    `, [idCompra])
    if (!result.length) return []
    const cols = result[0].columns
    return result[0].values.map(row => {
      const obj = {}
      cols.forEach((col, i) => obj[col] = row[i])
      return obj
    })
  })

  ipcMain.handle('abrir-proveedores', () => {
    const win = new BrowserWindow({
      width: 900,
      height: 650,
      title: 'Proveedores - Aula Verde',
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    win.loadFile('src/html/proveedores.html')
  })

  ipcMain.handle('obtener-proveedores', () => {
    const db = getDB()
    const result = db.exec('SELECT * FROM PROVEEDORES ORDER BY nombre ASC')
    if (!result.length) return []
    const cols = result[0].columns
    return result[0].values.map(row => {
      const obj = {}
      cols.forEach((col, i) => obj[col] = row[i])
      return obj
    })
  })

  ipcMain.handle('crear-proveedor', (event, datos) => {
    try {
      const db = getDB()
      db.run(
        'INSERT INTO PROVEEDORES (nombre, nif, direccion, telefono, email, activo, recargo_equivalencia) VALUES (?, ?, ?, ?, ?, 1, ?)',
        [datos.nombre, datos.nif, datos.direccion, datos.telefono, datos.email, datos.recargo_equivalencia]
      )
      guardarDB()
      return { ok: true }
    } catch (e) {
      return { ok: false, mensaje: e.message }
    }
  })

  ipcMain.handle('editar-proveedor', (event, idProveedor, datos) => {
    try {
      const db = getDB()
      db.run(
        'UPDATE PROVEEDORES SET nombre=?, nif=?, direccion=?, telefono=?, email=?, recargo_equivalencia=? WHERE id_proveedor=?',
        [datos.nombre, datos.nif, datos.direccion, datos.telefono, datos.email, datos.recargo_equivalencia, idProveedor]
      )
      guardarDB()
      return { ok: true }
    } catch (e) {
      return { ok: false, mensaje: e.message }
    }
  })

  ipcMain.handle('toggle-proveedor', (event, idProveedor, nuevoEstado) => {
    try {
      const db = getDB()
      db.run('UPDATE PROVEEDORES SET activo=? WHERE id_proveedor=?', [nuevoEstado, idProveedor])
      guardarDB()
      return { ok: true }
    } catch (e) {
      return { ok: false, mensaje: e.message }
    }
  })
}

module.exports = { registrar }