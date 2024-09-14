const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const vehicleRoutes = require('./routes/vehicleRoutes');

// Inicializamos Express
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

app.use('/api', vehicleRoutes);

// Conectar a MongoDB
mongoose.connect('mongodb://localhost:27017/parking', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("Conectado a MongoDB");
}).catch((err) => {
  console.log("Error al conectar a MongoDB:", err);
});

// Configurar el puerto
const port = process.env.PORT || 3000;

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});



