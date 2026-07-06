const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')
const { safeStorage, app } = require('electron')

const DB_PATH = path.join(__dirname, '../../data/aulaverde.db')

let db = null

// ─── Cifrado de credenciales sensibles (clave API, contraseña SMTP) ──────────
// Usa safeStorage, el módulo nativo de Electron pensado exactamente para esto:
// cifra usando el almacén de credenciales del propio sistema operativo
// (DPAPI en Windows, Keychain en macOS, libsecret en Linux). Cada equipo cifra
// con su propia clave del sistema — nadie más, ni siquiera copiando el
// archivo de la base de datos a otro ordenador, puede leer el valor real.
// El prefijo "ENC:" distingue un valor ya cifrado de uno antiguo en texto
// plano (para no romper bases de datos ya en uso al actualizar la app).
function cifrar(texto) {
  if (!texto) return texto
  if (typeof texto === 'string' && texto.startsWith('ENC:')) return texto
  if (!safeStorage.isEncryptionAvailable()) return texto
  const buffer = safeStorage.encryptString(texto)
  return 'ENC:' + buffer.toString('base64')
}

function descifrar(valor) {
  if (!valor) return valor
  if (typeof valor === 'string' && valor.startsWith('ENC:')) {
    if (!safeStorage.isEncryptionAvailable()) return ''
    try {
      const buffer = Buffer.from(valor.slice(4), 'base64')
      return safeStorage.decryptString(buffer)
    } catch (e) {
      return ''
    }
  }
  // Valor de una base de datos anterior a este cambio, todavía sin cifrar
  return valor
}

// Migración de un solo uso: si hay credenciales de una versión anterior
// guardadas en texto plano, se cifran ahora y se guardan ya protegidas.
function migrarCredencialesACifrado() {
  const result = db.exec('SELECT api_key_anthropic, smtp_password FROM CONFIGURACION WHERE id_configuracion = 1')
  if (!result.length || !result[0].values.length) return
  const [apiKey, smtpPassword] = result[0].values[0]
  const necesitaApiKey = apiKey && !String(apiKey).startsWith('ENC:')
  const necesitaSmtp = smtpPassword && !String(smtpPassword).startsWith('ENC:')
  if (!necesitaApiKey && !necesitaSmtp) return
  db.run(
    'UPDATE CONFIGURACION SET api_key_anthropic = ?, smtp_password = ? WHERE id_configuracion = 1',
    [necesitaApiKey ? cifrar(apiKey) : apiKey, necesitaSmtp ? cifrar(smtpPassword) : smtpPassword]
  )
  console.log('Credenciales existentes cifradas correctamente')
}

// Calcula rutas de carpeta razonables para CUALQUIER sistema operativo
// (Windows, macOS, Linux), usando la carpeta de Documentos real del usuario
// que ha iniciado sesión en ese equipo — en vez de asumir una unidad C: o G:
// concretas, que solo existen tal cual en el ordenador donde se escribió
// originalmente el código. Se usa exclusivamente para instalaciones nuevas
// (ver más abajo); las ya existentes conservan su ruta actual sin cambios.
function calcularRutasPorDefecto() {
  const base = path.join(app.getPath('documents'), 'AulaVerde')
  return {
    ruta_descargas: path.join(base, 'descargas'),
    ruta_backup_bd: path.join(base, 'Backups'),
    ruta_backup_facturas: path.join(base, 'Facturas')
  }
}

// Se llama una sola vez, solo la primerísima vez que se crea la base de datos
// (instalación nueva en un ordenador nuevo, incluido el de un futuro cliente).
// No se ejecuta nunca sobre una base de datos ya existente.
function configurarRutasPorDefecto() {
  const rutas = calcularRutasPorDefecto()
  db.run(
    'UPDATE CONFIGURACION SET ruta_descargas = ?, ruta_backup_bd = ?, ruta_backup_facturas = ? WHERE id_configuracion = 1',
    [rutas.ruta_descargas, rutas.ruta_backup_bd, rutas.ruta_backup_facturas]
  )
  console.log('Rutas de carpeta configuradas automáticamente para esta instalación')
}

async function inicializarDB() {
  const SQL = await initSqlJs()
  let esInstalacionNueva = false

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(fileBuffer)
    console.log('Base de datos cargada correctamente')
  } else {
    db = new SQL.Database()
    crearTablas()
    insertarDatosIniciales()
    guardarDB()
    esInstalacionNueva = true
    console.log('Base de datos creada correctamente')
  }

  // Se ejecuta siempre: añade tablas nuevas si no existen
  migrarTablas()

  // Solo la primera vez que se crea la base de datos: fija rutas de carpeta
  // sensatas para este ordenador en concreto. Se hace después de migrarTablas()
  // porque las columnas ruta_descargas/ruta_backup_bd/ruta_backup_facturas
  // se crean ahí.
  if (esInstalacionNueva) {
    configurarRutasPorDefecto()
    guardarDB()
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

// Comprueba si una columna ya existe en una tabla, consultando el esquema real
// de SQLite en vez de intentar el ALTER TABLE y descartar cualquier error que
// dé (que era el patrón anterior: un try/catch vacío oculta tanto el error
// esperado de "columna duplicada" como cualquier otro problema real -
// disco lleno, base de datos corrupta, etc. - sin que nadie se entere).
function columnaExiste(tabla, columna) {
  const resultado = db.exec(`PRAGMA table_info(${tabla})`)
  if (!resultado.length) return false
  return resultado[0].values.some(fila => fila[1].toLowerCase() === columna.toLowerCase())
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
  if (!columnaExiste('PROVEEDORES', 'recargo_equivalencia')) {
    db.run(`ALTER TABLE PROVEEDORES ADD COLUMN recargo_equivalencia BOOLEAN NOT NULL DEFAULT 0`)
  }

  // Añadir columna api_key_anthropic si no existe todavía
  if (!columnaExiste('CONFIGURACION', 'api_key_anthropic')) {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN api_key_anthropic VARCHAR(255)`)
  }

  // Añadir columnas de fidelización a CONFIGURACION si no existen todavía (MVP v2.0 - Fase 2)
  if (!columnaExiste('CONFIGURACION', 'puntos_euros_por_punto')) {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN puntos_euros_por_punto DECIMAL(10,2) NOT NULL DEFAULT 10`)
  }
  if (!columnaExiste('CONFIGURACION', 'puntos_valor_canje')) {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN puntos_valor_canje DECIMAL(10,2) NOT NULL DEFAULT 5`)
  }

  // Añadir columnas SMTP a CONFIGURACION si no existen todavía (MVP v2.0 - Fase 3)
  if (!columnaExiste('CONFIGURACION', 'smtp_host')) {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN smtp_host VARCHAR(255)`)
  }
  if (!columnaExiste('CONFIGURACION', 'smtp_puerto')) {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN smtp_puerto INTEGER`)
  }
  if (!columnaExiste('CONFIGURACION', 'smtp_usuario')) {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN smtp_usuario VARCHAR(255)`)
  }
  if (!columnaExiste('CONFIGURACION', 'smtp_password')) {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN smtp_password VARCHAR(255)`)
  }
  if (!columnaExiste('CONFIGURACION', 'smtp_email_remitente')) {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN smtp_email_remitente VARCHAR(255)`)
  }

  // Añadir columna prefijo_telefono a CLIENTES si no existe todavía (MVP v2.0 - Fase 4)
  if (!columnaExiste('CLIENTES', 'prefijo_telefono')) {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN prefijo_telefono VARCHAR(5) NOT NULL DEFAULT '+34'`)
  }

  // Añadir columna id_cliente a VENTAS si no existe todavía (MVP v2.0 - Fase 1)
  if (!columnaExiste('VENTAS', 'id_cliente')) {
    db.run(`ALTER TABLE VENTAS ADD COLUMN id_cliente INTEGER REFERENCES CLIENTES(id_cliente)`)
  }

  // Añadir columna ruta_descargas a CONFIGURACION si no existe todavía
  if (!columnaExiste('CONFIGURACION', 'ruta_descargas')) {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN ruta_descargas VARCHAR(500) DEFAULT 'C:\\AulaVerde\\descargas'`)
  }

  // Rutas de copia de seguridad configurables (antes hardcodeadas en el código,
  // asumiendo que Google Drive siempre está montado como unidad G: — algo que
  // solo es cierto en este ordenador, no en el de un cliente nuevo).
  // El valor por defecto aquí es el mismo que ya se usaba hasta ahora, para no
  // cambiar nada en las instalaciones existentes; las instalaciones nuevas
  // reciben una ruta multiplataforma calculada más abajo, en configurarRutasPorDefecto().
  if (!columnaExiste('CONFIGURACION', 'ruta_backup_bd')) {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN ruta_backup_bd VARCHAR(500) DEFAULT 'G:\\Mi unidad\\AulaVerde Backups'`)
  }
  if (!columnaExiste('CONFIGURACION', 'ruta_backup_facturas')) {
    db.run(`ALTER TABLE CONFIGURACION ADD COLUMN ruta_backup_facturas VARCHAR(500) DEFAULT 'G:\\Mi unidad\\AulaVerde Facturas'`)
  }

  // ===== Consentimiento RGPD y marketing (cumplimiento legal) =====
  if (!columnaExiste('CLIENTES', 'consentimiento_rgpd')) {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN consentimiento_rgpd BOOLEAN NOT NULL DEFAULT 0`)
  }
  if (!columnaExiste('CLIENTES', 'fecha_consentimiento_rgpd')) {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN fecha_consentimiento_rgpd DATE`)
  }
  if (!columnaExiste('CLIENTES', 'consentimiento_email_marketing')) {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN consentimiento_email_marketing BOOLEAN NOT NULL DEFAULT 0`)
  }
  if (!columnaExiste('CLIENTES', 'consentimiento_whatsapp_marketing')) {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN consentimiento_whatsapp_marketing BOOLEAN NOT NULL DEFAULT 0`)
  }
  if (!columnaExiste('CLIENTES', 'metodo_consentimiento')) {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN metodo_consentimiento VARCHAR(20)`)
  }
  if (!columnaExiste('CLIENTES', 'pdf_consentimiento_path')) {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN pdf_consentimiento_path VARCHAR(500)`)
  }
// Tipo de cliente: PARTICULAR o PROFESIONAL (cumplimiento RGPD - minimización de datos)
  if (!columnaExiste('CLIENTES', 'tipo_cliente')) {
    db.run(`ALTER TABLE CLIENTES ADD COLUMN tipo_cliente VARCHAR(20) NOT NULL DEFAULT 'PARTICULAR'`)
  }

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

  migrarCredencialesACifrado()
  guardarDB()
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

module.exports = { inicializarDB, guardarDB, getDB, cifrar, descifrar }
