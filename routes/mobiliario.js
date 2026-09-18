const express = require('express');
const router = express.Router();
const appsheet = require('../services/appsheet');

// GET /api/mobiliario -> lista completa (usado por dashboard, lista y polling en tiempo real)
router.get('/', async (req, res) => {
  try {
    const datos = await appsheet.obtenerTodos();
    res.json(datos);
  } catch (error) {
    console.error('Error al obtener mobiliario:', error.response?.data || error.message);
    res.status(500).json({ error: 'No se pudo obtener el mobiliario' });
  }
});

// POST /api/mobiliario -> dar de alta un registro nuevo
// Body esperado: objeto con las columnas exactas de la tabla "Sistema" en AppSheet
// (ej. "ID Unico", "Nombre de Residuo", "Estatus", "Foto de Evidencia", etc.)
router.post('/', async (req, res) => {
  try {
    const datos = req.body;

    if (!datos['ID Unico']) {
      return res.status(400).json({ error: 'El campo "ID Unico" es obligatorio' });
    }

    const resultado = await appsheet.agregarMueble(datos);
    res.json(resultado);
  } catch (error) {
    console.error('Error al agregar mueble:', error.response?.data || error.message);
    res.status(500).json({ error: 'No se pudo agregar el mueble' });
  }
});

// PUT /api/mobiliario/:id -> actualizar (ej. cambiar Estatus)
router.put('/:id', async (req, res) => {
  try {
    const datos = { 'ID Unico': req.params.id, ...req.body };
    const resultado = await appsheet.editarMueble(datos);
    res.json(resultado);
  } catch (error) {
    console.error('Error al editar registro:', error.response?.data || error.message);
    res.status(500).json({ error: 'No se pudo editar el registro' });
  }
});

// DELETE /api/mobiliario/:id
router.delete('/:id', async (req, res) => {
  try {
    const resultado = await appsheet.eliminarMueble({ 'ID Unico': req.params.id });
    res.json(resultado);
  } catch (error) {
    console.error('Error al eliminar registro:', error.response?.data || error.message);
    res.status(500).json({ error: 'No se pudo eliminar el registro' });
  }
});

module.exports = router;
