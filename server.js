require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mobiliarioRoutes = require('./routes/mobiliario');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // limite mayor para permitir fotos en base64

app.use('/api/mobiliario', mobiliarioRoutes);

// Sirve la app web (frontend) desde el mismo servidor
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', mensaje: 'Servidor de gestión de mobiliario activo' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
