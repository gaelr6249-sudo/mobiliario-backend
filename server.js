require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mobiliarioRoutes = require('./routes/mobiliario');
const iaRoutes = require('./routes/ia');

const app = express();
app.set('trust proxy', 1); // Render está detrás de un proxy (para req.ip)
app.use(cors());
app.use(express.json({ limit: '10mb' })); // limite mayor para permitir fotos en base64

app.use('/api/mobiliario', mobiliarioRoutes);
app.use('/api/ia', iaRoutes);

// Sirve la app web (frontend) desde el mismo servidor
const carpetaFrontend = [path.join(__dirname, 'frontend'), path.join(__dirname, '..', 'frontend')]
  .find((p) => fs.existsSync(p)) || path.join(__dirname, 'frontend');
app.use(express.static(carpetaFrontend));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', mensaje: 'Servidor de gestión de mobiliario activo' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
