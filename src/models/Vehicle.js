const mongoose = require('mongoose');

const VehicleSchema = new mongoose.Schema({
  placa: { type: String, required: true },
  tipo: { type: String, required: true },
  esElectricoOHibrido: { type: Boolean, default: false },
  plazaAsignada: { type: String, required: true },
  horaIngreso: { type: Date, default: Date.now },
  horaSalida: { type: Date },
  coste: { type: Number, required: true },
  esFalsoPositivo: { type: Boolean, default: false },
});

module.exports = mongoose.model('Vehicle', VehicleSchema);
