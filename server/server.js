const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const prisma = require('../prisma/prisma');

app.use(cors());
app.use(express.json());

const vehicleRoutes = require("./routes/vehicleRoutes");
const customerRoutes = require("./routes/customerRoutes");

app.use("/vehicleRoutes", vehicleRoutes);
app.use("/customerRoutes", customerRoutes);

app.get("/", (req, res) => {
  res.send("Car Dealership API Running");
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
