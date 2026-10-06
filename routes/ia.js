const express = require('express');
const { sugerirDesdeFoto, leyendaDefinida } = require('../services/ia');

const router = express.Router();

const MAX_HORA = parseInt(process.env.IA_MAX_POR_HORA || '20', 10); // por IP
const MAX_DIARIO = parseInt(process.env.IA_MAX_DIARIO || '200', 10); // global
const TIPOS = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 };

const porIp = new Map();
let dia = { fecha: '', n: 0 };

function hoy() { return new Date().toISOString().slice(0, 10); }

function revisarLimites(ip) {
  if (dia.fecha !== hoy()) dia = { fecha: hoy(), n: 0 };
  if (dia.n >= MAX_DIARIO) return 'Se alcanzó el límite diario de consultas de IA. Intenta mañana.';
  const ahora = Date.now();
  const lista = (porIp.get(ip) || []).filter((t) => ahora - t < 3600000);
  if (lista.length >= MAX_HORA) return 'Demasiadas consultas de IA en la última hora.';
  lista.push(ahora);
  porIp.set(ip, lista);
  dia.n++;
  return null;
}

router.get('/estado', (req, res) => {
  res.json({
    disponible: !!process.env.ANTHROPIC_API_KEY,
    requiereCodigo: !!process.env.IA_CODIGO_ACCESO,
    leyendaCompleta: leyendaDefinida('tipoResiduo') && leyendaDefinida('clasificacion'),
  });
});

router.post('/clasificar', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'La IA no está configurada en el servidor.' });

  const codigo = process.env.IA_CODIGO_ACCESO;
  if (codigo && req.get('x-codigo-ia') !== codigo) return res.status(401).json({ error: 'Código de acceso de IA incorrecto.' });

  const { imagen, descripcion } = req.body || {};
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(imagen || '');
  if (!m || !TIPOS[m[1]]) return res.status(400).json({ error: 'Imagen inválida (usa JPG, PNG o WebP).' });
  if (m[2].length > 5 * 1024 * 1024 * 1.37) return res.status(413).json({ error: 'La imagen es demasiado grande.' });

  const limite = revisarLimites(req.ip);
  if (limite) return res.status(429).json({ error: limite });

  try {
    const sugerencia = await sugerirDesdeFoto({ base64: m[2], mediaType: m[1], descripcion });
    res.json({ sugerencia });
  } catch (err) {
    const st = err.response && err.response.status;
    console.error('Error IA:', st || '', err.response ? JSON.stringify(err.response.data) : err.message);
    if (st === 401) return res.status(502).json({ error: 'La clave de la IA no es válida.' });
    if (st === 429 || st === 529) return res.status(503).json({ error: 'La IA está saturada, intenta en un momento.' });
    res.status(502).json({ error: 'No se pudo obtener una sugerencia de la IA.' });
  }
});

module.exports = router;
