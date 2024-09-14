const express = require('express');
const router = express.Router();
const Vehicle = require('../models/Vehicle');
const mqtt = require('mqtt');
const { check, validationResult } = require('express-validator');

// Conexión al broker MQTT público
const client = mqtt.connect('mqtt://broker.hivemq.com:1883'); // Conexión al broker público

client.on('connect', () => {
  console.log('Conectado al broker MQTT');
});

// Crear nuevo vehículo (entrada al parqueadero)
router.post('/vehicle', [
  check('placa').isLength({ min: 1 }).withMessage('La placa es requerida').isAlphanumeric().withMessage('La placa debe contener solo caracteres alfanuméricos'),
  check('tipo').isIn(['motocicleta', 'vehiculo_ligero']).withMessage('Tipo de vehículo debe ser "motocicleta" o "vehiculo_ligero"'),
  check('plazaAsignada').isInt({ min: 1 }).withMessage('La plaza asignada debe ser un número entero positivo')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { placa, tipo, esElectricoOHibrido, plazaAsignada } = req.body;

    // Verificar disponibilidad de plazas y que la plaza asignada sea única
    const plazaDisponibles = tipo === 'motocicleta' ? 6 : 5;
    const ocupadas = await Vehicle.countDocuments({ tipo, plazaAsignada, horaSalida: null });
    
    if (ocupadas >= plazaDisponibles) {
      return res.status(400).json({ error: 'No hay plazas disponibles para este tipo de vehículo' });
    }

    // Coste por tipo de vehículo
    let coste = tipo === 'motocicleta' ? 62 : 120;
    if (esElectricoOHibrido) {
      coste *= 0.75; // Descuento del 25% por ser eléctrico o híbrido
    }

    const nuevoVehiculo = new Vehicle({
      placa,
      tipo,
      esElectricoOHibrido,
      plazaAsignada,
      horaIngreso: new Date(), // Agregar hora de ingreso
      coste,
      horaSalida: null // Inicialmente sin hora de salida
    });

    await nuevoVehiculo.save();

    // Publicar mensaje en el broker MQTT
    const message = JSON.stringify({ event: 'nuevoVehiculo', placa, tipo, plazaAsignada });
    client.publish('parqueadero/vehiculos', message);

    res.status(201).json(nuevoVehiculo);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear el vehículo', details: err.message });
  }
});

// Listar todos los vehículos
router.get('/vehicles', async (req, res) => {
  try {
    const vehicles = await Vehicle.find();
    res.status(200).json(vehicles);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los vehículos', details: err.message });
  }
});

// Actualizar vehículo (por ejemplo, al cambiar la hora de salida)
router.put('/vehicle/:id', [
  check('horaSalida').optional().isISO8601().withMessage('La hora de salida debe ser una fecha válida en formato ISO 8601'),
  check('plazaAsignada').optional().isInt({ min: 1 }).withMessage('La plaza asignada debe ser un número entero positivo'),
  check('esElectricoOHibrido').optional().isBoolean().withMessage('El valor de esElectricoOHibrido debe ser verdadero o falso')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const updatedVehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, { new: true });
    
    if (!updatedVehicle) {
      return res.status(404).json({ error: 'Vehículo no encontrado' });
    }

    // Publicar actualización en el broker MQTT
    const message = JSON.stringify({ event: 'actualizarVehiculo', id: req.params.id, update: req.body });
    client.publish('parqueadero/vehiculos', message);

    res.status(200).json(updatedVehicle);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar el vehículo', details: err.message });
  }
});

// Eliminar vehículo
router.delete('/vehicle/:id', async (req, res) => {
    try {
      const deletedVehicle = await Vehicle.findByIdAndDelete(req.params.id);
  
      if (!deletedVehicle) {
        return res.status(404).json({ error: 'Vehículo no encontrado' });
      }
  
      // Publicar mensaje de eliminación en el broker MQTT
      const message = JSON.stringify({ event: 'eliminarVehiculo', id: req.params.id });
      client.publish('parqueadero/vehiculos', message);
  
      // Responder con un mensaje confirmando la eliminación
      res.status(200).json({ message: 'Vehículo eliminado exitosamente' });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar el vehículo', details: err.message });
    }
  });
  

// Calcular ganancias del día y forzar salida de vehículos que no han salido
router.post('/close-day', async (req, res) => {
  try {
    const now = new Date();

    // Buscar vehículos que aún no han salido
    const vehiclesWithoutExit = await Vehicle.find({ horaSalida: null });

    let totalGanancias = 0;
    for (let vehicle of vehiclesWithoutExit) {
      const horasParqueado = Math.ceil((now - vehicle.horaIngreso) / (1000 * 60 * 60)); // Diferencia en horas

      // Asignar la hora de salida
      vehicle.horaSalida = now;

      // Calcular el coste adicional en función de las horas estacionadas
      const costeTotal = vehicle.coste * horasParqueado;
      totalGanancias += costeTotal;
      vehicle.coste = costeTotal;

      // Guardar cambios
      await vehicle.save();

      // Publicar mensaje en el broker MQTT sobre el vehículo que salió
      const message = JSON.stringify({ event: 'vehiculoSalio', placa: vehicle.placa, costeTotal });
      client.publish('parqueadero/vehiculos', message);
    }

    res.status(200).json({ message: 'Día cerrado exitosamente', totalGanancias });
  } catch (err) {
    res.status(500).json({ error: 'Error al cerrar el día', details: err.message });
  }
});

module.exports = router;
