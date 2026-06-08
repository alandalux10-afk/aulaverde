const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const DB_PATH = path.join(__dirname, '../../data/aulaverde.db')

let db = null

async function inicializarDB() {
  const SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(fileBuffer)
    console.log('Base de datos cargada correctamente')
  } else {
    db = new SQL.Database()
    crearTablas()
    insertarDatosIniciales()
    guardarDB()
    console.log('Base de datos creada correctamente')
  }

  return db
}

function crearTablas() {
  db.run(`
    CREATE TABLE IF NOT EXISTS TIPOS_IVA (
      id_iva INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre VARCHAR(50) NOT NULL,
      porcentaje DECIMAL(5,2) NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT 1
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS FORMAS_PAGO (
      id_forma_pago INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre VARCHAR(50) NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT 1
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS PRODUCTOS (
      id_producto INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo VARCHAR(20) NOT NULL,
      codigo_barras VARCHAR(50),
      nombre VARCHAR(255) NOT NULL,
      familia VARCHAR(100),
      tipo_venta TEXT NOT NULL DEFAULT 'UNIDAD',
      precio_venta DECIMAL(10,2) NOT NULL,
      id_iva INTEGER NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT 1,
      FOREIGN KEY (id_iva) REFERENCES TIPOS_IVA(id_iva)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS VENTAS (
      id_venta INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_documento VARCHAR(20) NOT NULL,
      fecha DATE NOT NULL,
      hora TIME NOT NULL,
      cliente VARCHAR(255) NOT NULL DEFAULT 'Cliente contado',
      nif_cliente VARCHAR(20),
      tipo_documento TEXT NOT NULL DEFAULT 'TICKET',
      id_forma_pago INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'PENDIENTE',
      base_imponible DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_iva DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_descuento DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_venta DECIMAL(10,2) NOT NULL DEFAULT 0,
      FOREIGN KEY (id_forma_pago) REFERENCES FORMAS_PAGO(id_forma_pago)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS LINEAS_VENTA (
      id_linea INTEGER PRIMARY KEY AUTOINCREMENT,
      id_venta INTEGER NOT NULL,
      numero_linea INTEGER NOT NULL,
      id_producto INTEGER NOT NULL,
      codigo_producto VARCHAR(20) NOT NULL,
      nombre_producto VARCHAR(255) NOT NULL,
      cantidad DECIMAL(10,3) NOT NULL,
      precio_unitario DECIMAL(10,2) NOT NULL,
      descuento DECIMAL(5,2) NOT NULL DEFAULT 0,
      porcentaje_iva DECIMAL(5,2) NOT NULL,
      importe_iva DECIMAL(10,2) NOT NULL,
      total_linea DECIMAL(10,2) NOT NULL,
      FOREIGN KEY (id_venta) REFERENCES VENTAS(id_venta),
      FOREIGN KEY (id_producto) REFERENCES PRODUCTOS(id_producto)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS CONFIGURACION (
      id_configuracion INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_tienda VARCHAR(255) NOT NULL,
      razon_social VARCHAR(255),
      nif_vendedor VARCHAR(20) NOT NULL,
      direccion VARCHAR(255),
      telefono VARCHAR(50),
      email VARCHAR(255),
      impresora_ticket VARCHAR(255),
      impresora_factura VARCHAR(255),
      balanza_activa BOOLEAN NOT NULL DEFAULT 0,
      modelo_balanza VARCHAR(100),
      scanner_activo BOOLEAN NOT NULL DEFAULT 1
    )
  `)

  console.log('Tablas creadas correctamente')
}

function insertarDatosIniciales() {
  db.run(`INSERT INTO TIPOS_IVA (nombre, porcentaje, activo) VALUES ('Superreducido', 4.00, 1)`)
  db.run(`INSERT INTO TIPOS_IVA (nombre, porcentaje, activo) VALUES ('Reducido', 10.00, 1)`)
  db.run(`INSERT INTO TIPOS_IVA (nombre, porcentaje, activo) VALUES ('General', 21.00, 1)`)
  db.run(`INSERT INTO TIPOS_IVA (nombre, porcentaje, activo) VALUES ('Exento', 0.00, 1)`)

  db.run(`INSERT INTO FORMAS_PAGO (nombre, activo) VALUES ('Efectivo', 1)`)
  db.run(`INSERT INTO FORMAS_PAGO (nombre, activo) VALUES ('Tarjeta', 1)`)

  db.run(`
    INSERT INTO CONFIGURACION (nombre_tienda, nif_vendedor, scanner_activo, balanza_activa)
    VALUES ('Aula Verde', 'B00000000', 1, 0)
  `)

  console.log('Datos iniciales insertados correctamente')
}

function guardarDB() {
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
}

function getDB() {
  return db
}

module.exports = { inicializarDB, guardarDB, getDB }
