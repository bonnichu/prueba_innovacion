/**
 * TABÚ APP — Google Apps Script backend
 * Despliegue: Implementar > Nueva implementación > Aplicación web
 * - Ejecutar como: Yo
 * - Quién tiene acceso: Cualquier usuario
 */

const APP_TITLE = 'TABÚ APP';
const REVIEWS_SHEET = 'Reseñas';
const REVIEW_HEADERS = ['Fecha', 'Establecimiento', 'Calificación', 'Comentario', 'Estado'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function askTabu(question) {
  const q = String(question || '').trim().slice(0, 1500);
  if (!q) return { ok: false, answer: 'Escribe una pregunta para comenzar.' };

  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    return {
      ok: true,
      demo: true,
      answer: demoAnswer_(q)
    };
  }

  const systemInstruction = [
    'Eres TABÚ, un asistente educativo de salud sexual y reproductiva para adolescentes y jóvenes de 13 a 25 años en Perú.',
    'Responde en español, con respeto, sin juzgar, de forma clara, breve y basada en evidencia.',
    'No diagnostiques, no prescribas ni reemplaces a un profesional de salud.',
    'No solicites nombre, correo, teléfono, dirección ni otros datos identificables.',
    'En situaciones de violencia, coerción, abuso, peligro o emergencia, prioriza la seguridad y recomienda acudir a servicios de emergencia o salud confiables.'
  ].join(' ');

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key);
  const payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: q }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 700 }
  };

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    const data = JSON.parse(response.getContentText() || '{}');
    if (status < 200 || status >= 300) {
      return { ok: true, demo: true, answer: demoAnswer_(q) };
    }
    const answer = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const text = answer.map(p => p.text || '').join('').trim();
    return { ok: true, demo: false, answer: text || demoAnswer_(q) };
  } catch (err) {
    return { ok: true, demo: true, answer: demoAnswer_(q) };
  }
}

function demoAnswer_(q) {
  const s = q.toLowerCase();
  if (s.includes('emergencia') || s.includes('día siguiente') || s.includes('día después') || s.includes('pastilla de')) {
    return 'La anticoncepción oral de emergencia ayuda a prevenir un embarazo después de una relación sin protección o falla del método. Es más eficaz cuanto antes se tome (idealmente dentro de las primeras 72 horas). No interrumpe un embarazo ya iniciado ni protege frente a ITS. Puedes pedir orientación en un establecimiento de salud del MINSA o farmacia autorizada.';
  }
  if (s.includes('condón') || s.includes('preservativo')) {
    return 'El preservativo es el único método de uso común que ofrece doble protección: ayuda a prevenir embarazos y reduce significativamente el riesgo de infecciones de transmisión sexual (ITS). Úsalo desde el inicio hasta el final de la relación, revisa la fecha de vencimiento y usa uno nuevo cada vez.';
  }
  if (s.includes('píldora') || s.includes('pastilla') || s.includes('inyectable') || s.includes('implante') || s.includes('diu') || s.includes('método')) {
    return 'Existen métodos de corta duración (píldoras, inyectables mensuales o trimestrales) y de larga duración (implante subdérmico, DIU de cobre u hormonal). Cada cuerpo es distinto: en los centros de salud del MINSA brindan consejería gratuita en planificación familiar para elegir el más adecuado según tu salud y rutina.';
  }
  if (s.includes('its') || s.includes('ets') || s.includes('infección') || s.includes('prueba') || s.includes('vih')) {
    return 'Muchas infecciones de transmisión sexual (ITS) no presentan síntomas al inicio, por eso hacerse pruebas periódicas es una medida de autocuidado responsable. En establecimientos de salud públicos en Perú puedes acceder a consejería y pruebas de tamizaje confidenciales.';
  }
  if (s.includes('dónde') || s.includes('donde') || s.includes('centro') || s.includes('minsa') || s.includes('gratis') || s.includes('gratuito')) {
    return 'En Perú puedes acudir a los servicios diferenciados para adolescentes y consultorios de planificación familiar de los centros de salud del MINSA, o llamar gratis a la Línea 113 (opción 3) las 24 horas para recibir orientación confidencial.';
  }
  if (s.includes('privacidad') || s.includes('anónimo') || s.includes('seguro') || s.includes('datos')) {
    return 'En TABÚ no necesitas crear cuenta ni ingresar tu nombre, correo o teléfono. Tus preguntas en este chat no se almacenan en bases de datos públicas y puedes explorar farmacias o métodos libremente.';
  }
  return 'Gracias por escribir en TABÚ. Puedo orientarte sobre preservativos, métodos anticonceptivos, anticoncepción de emergencia, prevención de ITS o dónde acudir en Perú (como la Línea 113 del MINSA). Esta información es educativa y no reemplaza una consulta médica.';
}

function getNearbyPharmacies(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!isFinite(latitude) || !isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('Coordenadas no válidas.');
  }

  const query = '[out:json][timeout:15];(node["amenity"="pharmacy"](around:3500,' +
    latitude + ',' + longitude + ');way["amenity"="pharmacy"](around:3500,' +
    latitude + ',' + longitude + '););out center tags;';
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  for (let i = 0; i < endpoints.length; i++) {
    try {
      const response = UrlFetchApp.fetch(endpoints[i], {
        method: 'post',
        payload: { data: query },
        muteHttpExceptions: true
      });
      if (response.getResponseCode() !== 200) continue;
      const data = JSON.parse(response.getContentText() || '{}');
      const elements = data.elements || [];
      return elements.slice(0, 40).map(function(el) {
        const tags = el.tags || {};
        const point = el.center || el;
        return {
          id: String(el.type) + '-' + String(el.id),
          name: String(tags.name || tags['name:es'] || 'Farmacia registrada').slice(0, 120),
          lat: Number(point.lat),
          lon: Number(point.lon),
          address: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']]
            .filter(Boolean).join(' '),
          phone: String(tags.phone || '').slice(0, 40),
          openingHours: String(tags.opening_hours || '').slice(0, 100),
          source: 'OpenStreetMap',
          verified: false
        };
      }).filter(function(p) { return isFinite(p.lat) && isFinite(p.lon); });
    } catch (err) {
      console.error('Overpass endpoint failed: ' + err);
    }
  }
  return [];
}

function getReviews() {
  const sheet = getReviewsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1)
    .filter(function(row) { return String(row[4]) === 'APROBADA'; })
    .slice(-50).reverse()
    .map(function(row) {
      return {
        place: String(row[1]),
        rating: Number(row[2]),
        comment: String(row[3])
      };
    });
}

function submitReview(place, rating, comment) {
  const p = cleanText_(place, 100);
  const c = cleanText_(comment, 600);
  const r = Number(rating);
  if (!p || !c || !Number.isInteger(r) || r < 1 || r > 5) {
    throw new Error('Completa el establecimiento, comentario y calificación.');
  }
  if (/(https?:\/\/|www\.|@|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(\+?51)?\s?9\d{8})/i.test(c)) {
    throw new Error('Por seguridad, no incluyas enlaces, correos ni números telefónicos.');
  }
  const sheet = getReviewsSheet_();
  sheet.appendRow([new Date(), p, r, c, 'PENDIENTE']);
  return {
    ok: true,
    message: 'Tu reseña fue recibida y quedó en estado PENDIENTE de moderación para proteger la seguridad de la comunidad.'
  };
}

function getReviewsSheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('REVIEWS_SPREADSHEET_ID');
  let ss;
  if (id) {
    try {
      ss = SpreadsheetApp.openById(id);
    } catch (e) {
      ss = null;
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('TABÚ APP - Moderación de reseñas');
    props.setProperty('REVIEWS_SPREADSHEET_ID', ss.getId());
  }
  let sheet = ss.getSheetByName(REVIEWS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(REVIEWS_SHEET);
    sheet.appendRow(REVIEW_HEADERS);
    sheet.setFrozenRows(1);
    sheet.appendRow([new Date(), 'Farmacia Av. Arequipa (Referencial)', 5, 'Atención rápida y respetuosa al consultar por métodos de barrera.', 'APROBADA']);
    sheet.appendRow([new Date(), 'Centro de Salud Juvenil (Referencial)', 5, 'Explicaron las opciones con claridad y sin hacer preguntas incómodas.', 'APROBADA']);
  }
  return sheet;
}

function approveReview(rowNumber) {
  const row = Number(rowNumber);
  if (!Number.isInteger(row) || row < 2) throw new Error('Fila no válida.');
  const sheet = getReviewsSheet_();
  sheet.getRange(row, 5).setValue('APROBADA');
  return 'Reseña aprobada.';
}

function rejectReview(rowNumber) {
  const row = Number(rowNumber);
  if (!Number.isInteger(row) || row < 2) throw new Error('Fila no válida.');
  const sheet = getReviewsSheet_();
  sheet.getRange(row, 5).setValue('RECHAZADA');
  return 'Reseña rechazada.';
}

function cleanText_(value, max) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/[ -]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}
