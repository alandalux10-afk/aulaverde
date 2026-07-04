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

  // Se ejecuta siempre: añade tablas nuevas si no existen
  migrarTablas()

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

function migrarTablas() {
  // Tablas del módulo de compras a proveedores
  // Se crean solo si no existen — seguro de ejecutar siempre

  db.run(`
    CREATE TABLE IF NOT EXISTS PROVEEDORES (
      id_proveedor INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre VARCHAR(255) NOT NULL,
      nif VARCHAR(20),
      direccion VARCHAR(255),
      telefono VARCHAR(50),
      email VARCHAR(255),
      activo BOOLEAN NOT NULL DEFAULT 1
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS COMPRAS (
      id_compra INTEGER PRIMARY KEY AUTOINCREMENT,
      id_proveedor INTEGER NOT NULL,
      numero_factura VARCHAR(50) NOT NULL,
      fecha DATE NOT NULL,
      estado TEXT NOT NULL DEFAULT 'PENDIENTE',
      base_imponible DECIMAL(10,2),
      total_iva DECIMAL(10,2),
      total_compra DECIMAL(10,2),
      pdf_path VARCHAR(500),
      FOREIGN KEY (id_proveedor) REFERENCES PROVEEDORES(id_proveedor)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS LINEAS_COMPRA (
      id_linea INTEGER PRIMARY KEY AUTOINCREMENT,
      id_compra INTEGER NOT NULL,
      numero_linea INTEGER,
      nombre_proveedor VARCHAR(255),
      codigo_proveedor VARCHAR(100),
      id_producto INTEGER,
      cantidad DECIMAL(10,3),
      precio_unitario DECIMAL(10,2),
      porcentaje_iva DECIMAL(5,2),
      importe_iva DECIMAL(10,2),
      total_linea DECIMAL(10,2),
      FOREIGN KEY (id_compra) REFERENCES COMPRAS(id_compra),
      FOREIGN KEY (id_producto) REFERENCES PRODUCTOS(id_producto)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS PRODUCTOS_PROVEEDOR (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_proveedor INTEGER NOT NULL,
      nombre_proveedor VARCHAR(255) NOT NULL,
      codigo_proveedor VARCHAR(100),
      id_producto INTEGER NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT 1,
      UNIQUE(id_proveedor, nombre_proveedor),
      FOREIGN KEY (id_proveedor) REFERENCES PROVEEDORES(id_proveedor),
      FOREIGN KEY (id_producto) REFERENCES PRODUCTOS(id_producto)
    )
  `)

  // ===== MVP v2.0 — Fase 1: Módulo CLIENTES =====
  db.run(`
    CREATE TABLE IF NOT EXISTS CLIENTES (
      id_cliente INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre VARCHAR(255) NOT NULL,
      telefono VARCHAR(50),
      email VARCHAR(255),
      fecha_nacimiento DATE,
      direccion VARCHAR(255),
      nif VARCHAR(20),
      notas TEXT,
      fecha_alta DATE NOT NULL DEFAULT (date('now')),
      activo BOOLEAN NOT NULL DEFAULT 1,
      descuento DECIMAL(5,2) NOT NULL DEFAULT 0
    )
  `)

  // ===== MVP v2.0 — Fase 2: Módulo FIDELIZACIÓN =====
  db.run(`
    CREATE TABLE IF NOT EXISTS MOVIMIENTOS_PUNTOS (
      id_movimiento INTEGER PRIMARY KEY AUTOINCREMENT,
      id_cliente INTEGER NOT NULL,
      id_venta INTEGER,
      tipo TEXT NOT NULL,
      puntos INTEGER NOT NULL,
      fecha DATE NOT NULL DEFAULT (date('now')),
      descripcion VARCHAR(255),
      FOREIGN KEY (id_cliente) REFERENCES CLIENTES(id_cliente),
      FOREIGN KEY (id_venta) REFERENCES VENTAS(id_venta)
    )
  `)

  // ===== MVP v2.0 — Fase 3: Módulo COMUNICACIÓN EMAIL =====
  db.run(`
    CREATE TABLE IF NOT EXISTS PLANTILLAS_EMAIL (
      id_plantilla INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL UNIQUE,
      asunto VARCHAR(255) NOT NULL,
      cuerpo TEXT NOT NULL
    )
  `)
  db.run(`INSERT OR IGNORE INTO PLANTILLAS_EMAIL (tipo, asunto, cuerpo) VALUES (
    'BIENVENIDA',
    'Bienvenido/a a Aula Verde',
    'Hola {nombre}, gracias por confiar en Aula Verde. Estamos encantados de tenerte como cliente. Un saludo, Aula Verde'
  )`)
  db.run(`INSERT OR IGNORE INTO PLANTILLAS_EMAIL (tipo, asunto, cuerpo) VALUES (
    'OFERTA',
    'Una oferta especial para ti',
    'Hola {nombre}, tenemos una oferta especial que no te puedes perder. Pásate por la tienda y descúbrela. Un saludo, Aula Verde'
  )`)
  db.run(`INSERT OR IGNORE INTO PLANTILLAS_EMAIL (tipo, asunto, cuerpo) VALUES (
    'CUMPLEANOS',
    '¡Feliz cumpleaños!',
    'Hola {nombre}, desde Aula Verde queremos desearte un feliz cumpleaños. Como regalo, ¡pásate por la tienda y te haremos un descuento especial! Un saludo, Aula Verde'
  )`)

  // ===== MVP v2.0 — Fase 4: Módulo COMUNICACIÓN WHATSAPP =====
  db.run(`
    CREATE TABLE IF NOT EXISTS PLANTILLAS_WHATSAPP (
      id_plantilla INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL UNIQUE,
      mensaje TEXT NOT NULL
    )
  `)
  db.run(`INSERT OR IGNORE INTO PLANTILLAS_WHATSAPP (tipo, mensaje) VALUES (
    'BIENVENIDA',
    'Hola {nombre}, bienvenido/a a Aula Verde. Gracias por confiar en nosotros, estamos encantados de tenerte como cliente.'
  )`)
  db.run(`INSERT OR IGNORE INTO PLANTILLAS_WHATSAPP (tipo, mensaje) VALUES (
    'OFERTA',
    'Hola {nombre}, tenemos una oferta especial para ti en Aula Verde. ¡Pásate por la tienda y descúbrela!'
  )`)
  db.run(`INSERT OR IGNORE INTO PLANTILLAS_WHATSAPP (tipo, mensaje) VALUES (
    'CUMPLEANOS',
    'Hola {nombre}, ¡feliz cumpleaños de parte de todo el equipo de Aula Verde! Pásate por la tienda y te haremos un descuento especial.'
  )`)

  // Añadir columna recargo_equivalencia a PROVEEDORES si no existe
  try {
    db.run(`ALTER TABLE PROVEEDORES ADD COLUMN recargo_equivalencia BOOLEAN NOT NULL DEFAULT 0`)
  } catch (e) {}

  // Añadir columna api_key_anthropic si no existe todavía
  try {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN api_key_anthropic VARCHAR(255)`)
  } catch (e) {}

  // Añadir columnas de fidelización a CONFIGURACION si no existen todavía (MVP v2.0 - Fase 2)
  try {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN puntos_euros_por_punto DECIMAL(10,2) NOT NULL DEFAULT 10`)
  } catch (e) {}
  try {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN puntos_valor_canje DECIMAL(10,2) NOT NULL DEFAULT 5`)
  } catch (e) {}

  // Añadir columnas SMTP a CONFIGURACION si no existen todavía (MVP v2.0 - Fase 3)
  try {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN smtp_host VARCHAR(255)`)
  } catch (e) {}
  try {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN smtp_puerto INTEGER`)
  } catch (e) {}
  try {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN smtp_usuario VARCHAR(255)`)
  } catch (e) {}
  try {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN smtp_password VARCHAR(255)`)
  } catch (e) {}
  try {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN smtp_email_remitente VARCHAR(255)`)
  } catch (e) {}

  // Añadir columna prefijo_telefono a CLIENTES si no existe todavía (MVP v2.0 - Fase 4)
  try {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN prefijo_telefono VARCHAR(5) NOT NULL DEFAULT '+34'`)
  } catch (e) {}

  // Añadir columna id_cliente a VENTAS si no existe todavía (MVP v2.0 - Fase 1)
  try {
    db.run(`ALTER TABLE VENTAS ADD COLUMN id_cliente INTEGER REFERENCES CLIENTES(id_cliente)`)
  } catch (e) {}

  // Añadir columna ruta_descargas a CONFIGURACION si no existe todavía
  try {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN ruta_descargas VARCHAR(500) DEFAULT 'C:\\AulaVerde\\descargas'`)
  } catch (e) {}

  // ===== Consentimiento RGPD y marketing (cumplimiento legal) =====
  try {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN consentimiento_rgpd BOOLEAN NOT NULL DEFAULT 0`)
  } catch (e) {}
  try {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN fecha_consentimiento_rgpd DATE`)
  } catch (e) {}
  try {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN consentimiento_email_marketing BOOLEAN NOT NULL DEFAULT 0`)
  } catch (e) {}
  try {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN consentimiento_whatsapp_marketing BOOLEAN NOT NULL DEFAULT 0`)
  } catch (e) {}
  try {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN metodo_consentimiento VARCHAR(20)`)
  } catch (e) {}
  try {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN pdf_consentimiento_path VARCHAR(500)`)
  } catch (e) {}
// Tipo de cliente: PARTICULAR o PROFESIONAL (cumplimiento RGPD - minimización de datos)
  try {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN tipo_cliente VARCHAR(20) NOT NULL DEFAULT 'PARTICULAR'`)
  } catch (e) {}

  // ===== Índices de rendimiento =====
  // El esquema original no tenía ningún índice más allá de las claves primarias.
  // Con pocos cientos de productos y ventas no se nota, pero a medida que crece
  // el histórico las búsquedas y filtros más usados (buscador de productos,
  // consultas por fecha, listados de compras) se van haciendo más lentos.
  // CREATE INDEX IF NOT EXISTS es seguro de ejecutar en cada arranque, sin
  // necesidad de try/catch: si el índice ya existe, SQLite simplemente no hace nada.
  db.run(`CREATE INDEX IF NOT EXISTS idx_productos_codigo ON PRODUCTOS(codigo)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_productos_nombre ON PRODUCTOS(nombre)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_productos_activo ON PRODUCTOS(activo)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON VENTAS(fecha)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_ventas_id_cliente ON VENTAS(id_cliente)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_lineas_venta_id_venta ON LINEAS_VENTA(id_venta)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_lineas_venta_codigo_producto ON LINEAS_VENTA(codigo_producto)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON CLIENTES(nombre)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON CLIENTES(telefono)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_compras_id_proveedor ON COMPRAS(id_proveedor)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_compras_fecha ON COMPRAS(fecha)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_lineas_compra_id_compra ON LINEAS_COMPRA(id_compra)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_proveedores_nombre ON PROVEEDORES(nombre)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_movimientos_puntos_id_cliente ON MOVIMIENTOS_PUNTOS(id_cliente)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_productos_proveedor_id_proveedor ON PRODUCTOS_PROVEEDOR(id_proveedor)`)

  guardarDB()
  console.log('Migración de tablas completada')
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
