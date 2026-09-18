const axios = require('axios');

const APP_ID = process.env.APPSHEET_APP_ID;
const ACCESS_KEY = process.env.APPSHEET_ACCESS_KEY;
const TABLE_NAME = process.env.APPSHEET_TABLE_NAME;

const BASE_URL = `https://api.appsheet.com/api/v2/apps/${APP_ID}/tables/${encodeURIComponent(TABLE_NAME)}/Action`;

/**
 * Llama a la API de AppSheet con una acción específica (Find, Add, Edit, Delete).
 * Documentación oficial: https://support.google.com/appsheet/answer/10105398
 */
async function callAppSheet(action, rows = []) {
  const body = {
    Action: action,
    Properties: {
      Locale: 'es-MX',
      Timezone: 'America/Mexico_City',
    },
    Rows: rows,
  };

  const response = await axios.post(BASE_URL, body, {
    headers: {
      'Content-Type': 'application/json',
      ApplicationAccessKey: ACCESS_KEY,
    },
  });

  return response.data;
}

// Obtener todos los registros de mobiliario
async function obtenerTodos() {
  return callAppSheet('Find');
}

// Agregar un nuevo mueble. `datos` es un objeto con las columnas de la tabla.
// Para incluir una foto, la columna de imagen debe llevar el contenido en base64
// con el formato que espera AppSheet: "data:image/jpeg;base64,....;filename:nombre.jpg"
async function agregarMueble(datos) {
  return callAppSheet('Add', [datos]);
}

// Editar un mueble existente (por ejemplo, cambiar el Estado)
async function editarMueble(datos) {
  return callAppSheet('Edit', [datos]);
}

// Eliminar un mueble (requiere solo la columna clave, ej: { ID: '123' })
async function eliminarMueble(datosClave) {
  return callAppSheet('Delete', [datosClave]);
}

module.exports = {
  obtenerTodos,
  agregarMueble,
  editarMueble,
  eliminarMueble,
};
