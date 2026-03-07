const express = require("express");
const router = express.Router();
const vehicleModel = require("../models/vehicleModel");

router.get("/", async (req, res) => {
  const vehicles = await vehicleModel.getAllVehicles();
  res.json(vehicles);
});

module.exports = router;
