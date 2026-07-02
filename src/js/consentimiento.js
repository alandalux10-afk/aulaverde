const fs = require('fs')
const path = require('path')
const { BrowserWindow } = require('electron')

// Genera el HTML completo del documento de consentimiento bilingüe
function generarHtmlConsentimiento(cliente, configuracion) {
  const ahora = new Date()
  const fecha = ahora.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const fechaISO = ahora.toISOString()

  const tienda = configuracion.nombre_tienda || 'Aula Verde'
  const nif = configuracion.nif_vendedor || ''
  const direccion = configuracion.direccion || ''
  const telefono = configuracion.telefono || ''
  const email = configuracion.email || ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 20mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; line-height: 1.5; }
  h1 { font-size: 14px; text-align: center; color: #2d6a2d; margin-bottom: 4px; }
  h2 { font-size: 12px; text-align: center; color: #555; margin-bottom: 16px; font-weight: normal; font-style: italic; }
  .separador { border: none; border-top: 1px solid #2d6a2d; margin: 14px 0; }
  .seccion { margin-bottom: 14px; }
  .seccion-titulo { font-size: 11px; font-weight: bold; color: #2d6a2d; margin-bottom: 6px; text-transform: uppercase; }
  .seccion-titulo-en { font-size: 10px; font-weight: bold; color: #888; margin-bottom: 6px; text-transform: uppercase; font-style: italic; }
  .datos-cliente { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-bottom: 10px; }
  .dato { border-bottom: 1px solid #ccc; padding-bottom: 2px; }
  .dato label { font-size: 9px; color: #888; display: block; }
  .dato span { font-size: 11px; font-weight: bold; }
  .bloque-consentimiento { border: 1px solid #ccc; border-radius: 4px; padding: 10px 12px; margin-bottom: 10px; }
  .bloque-consentimiento.rgpd { border-color: #2d6a2d; background: #f9fff9; }
  .checkbox-fila { display: flex; align-items: flex-start; gap: 8px; margin-top: 8px; }
  .caja { width: 14px; height: 14px; border: 1.5px solid #333; flex-shrink: 0; margin-top: 1px; }
  .texto-legal { font-size: 10px; color: #444; }
  .texto-legal-en { font-size: 9px; color: #888; font-style: italic; }
  .firma-seccion { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
  .firma-bloque { border-top: 1px solid #333; padding-top: 6px; }
  .firma-bloque label { font-size: 9px; color: #666; }
  .firma-espacio { height: 35px; }
  .pie { font-size: 9px; color: #888; text-align: center; margin-top: 16px; border-top: 1px dashed #ccc; padding-top: 8px; }
  .ref { font-size: 8px; color: #bbb; text-align: right; margin-top: 4px; }
</style>
</head>
<body>

<h1>FORMULARIO DE CONSENTIMIENTO — CONSENT FORM</h1>
<h2>${tienda} · ${nif} · ${direccion}</h2>
<hr class="separador">

<!-- DATOS DEL CLIENTE / CUSTOMER DATA -->
<div class="seccion">
  <div class="seccion-titulo">Datos del cliente / Customer data</div>
  <div class="datos-cliente">
    <div class="dato"><label>Nombre / Name</label><span>${cliente.nombre || ''}</span></div>
    <div class="dato"><label>NIF / ID</label><span>${cliente.nif || ''}</span></div>
    <div class="dato"><label>Email</label><span>${cliente.email || ''}</span></div>
    <div class="dato"><label>Teléfono / Phone</label><span>${(cliente.prefijo_telefono || '+34') + ' ' + (cliente.telefono || '')}</span></div>
    <div class="dato"><label>Fecha / Date</label><span>${fecha} ${hora}</span></div>
    <div class="dato"><label>Dirección / Address</label><span>${cliente.direccion || ''}</span></div>
  </div>
</div>

<hr class="separador">

<!-- CONSENTIMIENTO 1: RGPD — OBLIGATORIO -->
<div class="bloque-consentimiento rgpd">
  <div class="seccion-titulo">1. Protección de datos (RGPD) — Data protection (GDPR) *obligatorio / *mandatory</div>
  <div class="texto-legal">
    <strong>${tienda}</strong>, con NIF <strong>${nif}</strong> y domicilio en <strong>${direccion}</strong>, le informa de que sus datos personales serán tratados para la gestión de la relación comercial, historial de compras y programa de fidelización. Base jurídica: Art. 6.1.a RGPD (consentimiento). Los datos no serán cedidos a terceros salvo obligación legal. Puede ejercer sus derechos de acceso, rectificación, supresión, portabilidad y oposición dirigiéndose a <strong>${email}</strong>. Tiene derecho a retirar su consentimiento en cualquier momento sin que ello afecte a la licitud del tratamiento previo.
  </div>
  <div class="texto-legal-en" style="margin-top:6px;">
    <strong>${tienda}</strong> (VAT: ${nif}, ${direccion}) informs you that your personal data will be processed for commercial relationship management, purchase history and loyalty program. Legal basis: Art. 6.1.a GDPR (consent). Data will not be shared with third parties except by legal obligation. You may exercise your rights of access, rectification, erasure, portability and objection by contacting <strong>${email}</strong>. You have the right to withdraw consent at any time without affecting prior processing.
  </div>
  <div class="checkbox-fila">
    <div class="caja"></div>
    <div>
      <div class="texto-legal"><strong>Acepto el tratamiento de mis datos personales según lo descrito anteriormente.</strong></div>
      <div class="texto-legal-en">I accept the processing of my personal data as described above.</div>
    </div>
  </div>
</div>

<!-- CONSENTIMIENTO 2: EMAIL MARKETING -->
<div class="bloque-consentimiento">
  <div class="seccion-titulo">2. Comunicaciones comerciales por email — Commercial communications by email</div>
  <div class="texto-legal">
    Autorizo a <strong>${tienda}</strong> a enviarme comunicaciones comerciales, promociones y ofertas personalizadas a través de mi dirección de correo electrónico. Puedo retirar este consentimiento en cualquier momento contactando con <strong>${email}</strong> o en la tienda.
  </div>
  <div class="texto-legal-en" style="margin-top:4px;">
    I authorize <strong>${tienda}</strong> to send me commercial communications, promotions and personalized offers via email. I can withdraw this consent at any time by contacting <strong>${email}</strong> or at the store.
  </div>
  <div class="checkbox-fila">
    <div class="caja"></div>
    <div>
      <div class="texto-legal"><strong>Sí, acepto recibir comunicaciones comerciales por email.</strong></div>
      <div class="texto-legal-en">Yes, I accept receiving commercial communications by email.</div>
    </div>
  </div>
  <div class="checkbox-fila">
    <div class="caja"></div>
    <div>
      <div class="texto-legal"><strong>No, no deseo recibir comunicaciones comerciales por email.</strong></div>
      <div class="texto-legal-en">No, I do not wish to receive commercial communications by email.</div>
    </div>
  </div>
</div>

<!-- CONSENTIMIENTO 3: WHATSAPP MARKETING -->
<div class="bloque-consentimiento">
  <div class="seccion-titulo">3. Comunicaciones comerciales por WhatsApp — Commercial communications by WhatsApp</div>
  <div class="texto-legal">
    Autorizo a <strong>${tienda}</strong> a enviarme comunicaciones comerciales, promociones y ofertas personalizadas a través de WhatsApp al número de teléfono facilitado. Puedo retirar este consentimiento en cualquier momento contactando con la tienda.
  </div>
  <div class="texto-legal-en" style="margin-top:4px;">
    I authorize <strong>${tienda}</strong> to send me commercial communications, promotions and personalized offers via WhatsApp to the phone number provided. I can withdraw this consent at any time by contacting the store.
  </div>
  <div class="checkbox-fila">
    <div class="caja"></div>
    <div>
      <div class="texto-legal"><strong>Sí, acepto recibir comunicaciones comerciales por WhatsApp.</strong></div>
      <div class="texto-legal-en">Yes, I accept receiving commercial communications by WhatsApp.</div>
    </div>
  </div>
  <div class="checkbox-fila">
    <div class="caja"></div>
    <div>
      <div class="texto-legal"><strong>No, no deseo recibir comunicaciones comerciales por WhatsApp.</strong></div>
      <div class="texto-legal-en">No, I do not wish to receive commercial communications via WhatsApp.</div>
    </div>
  </div>
</div>

<!-- FIRMA / SIGNATURE -->
<div class="firma-seccion">
  <div class="firma-bloque">
    <label>Firma del cliente / Customer signature</label>
    <div class="firma-espacio"></div>
    <label>Nombre: ${cliente.nombre || '____________________'}</label>
  </div>
  <div class="firma-bloque">
    <label>Fecha y lugar / Date and place</label>
    <div class="firma-espacio"></div>
    <label>${fecha} — ${configuracion.direccion ? configuracion.direccion.split(',')[0] : ''}</label>
  </div>
</div>

<div class="pie">
  ${tienda} · ${nif} · ${direccion} · Tel: ${telefono} · ${email}<br>
  De conformidad con el RGPD (UE) 2016/679 y la LOPDGDD (LO 3/2018) · In accordance with GDPR (EU) 2016/679
</div>
<div class="ref">Ref: RGPD-${cliente.id_cliente || 'NUEVO'}-${ahora.getTime()}</div>

</body>
</html>`
}

// Guarda el documento como PDF en la carpeta de descargas
async function guardarConsentimientoPDF(cliente, configuracion, rutaDescargas) {
  const html = generarHtmlConsentimiento(cliente, configuracion)
  const ahora = new Date()
  const sufijo = `${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}_${ahora.getHours()}${String(ahora.getMinutes()).padStart(2,'0')}`
  const nombreArchivo = `consentimiento_${(cliente.nombre || 'cliente').replace(/[^a-zA-Z0-9]/g, '_')}_${sufijo}.pdf`
  const rutaPDF = path.join(rutaDescargas, nombreArchivo)

  if (!fs.existsSync(rutaDescargas)) fs.mkdirSync(rutaDescargas, { recursive: true })

  const tmpPath = path.join(__dirname, '../../data/consentimiento_tmp.html')
  fs.writeFileSync(tmpPath, html, 'utf8')

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 794, height: 1123, show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    win.loadFile(tmpPath)
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const pdfData = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: { marginType: 'default' }
          })
          fs.writeFileSync(rutaPDF, pdfData)
          win.close()
          resolve({ ok: true, ruta: rutaPDF, nombreArchivo })
        } catch (e) {
          win.close()
          reject(e)
        }
      }, 800)
    })
  })
}

// Imprime el documento en la impresora A4
async function imprimirConsentimiento(cliente, configuracion) {
  const html = generarHtmlConsentimiento(cliente, configuracion)
  const tmpPath = path.join(__dirname, '../../data/consentimiento_tmp.html')
  fs.writeFileSync(tmpPath, html, 'utf8')

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 794, height: 1123, show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    win.loadFile(tmpPath)
    win.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        win.webContents.print({
          silent: false,
          printBackground: true,
          pageSize: 'A4'
        }, (success, reason) => {
          win.close()
          if (success) resolve({ ok: true })
          else resolve({ ok: false, mensaje: reason })
        })
      }, 800)
    })
  })
}

module.exports = { generarHtmlConsentimiento, guardarConsentimientoPDF, imprimirConsentimiento }
