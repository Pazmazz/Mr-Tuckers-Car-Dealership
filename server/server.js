const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const prisma = require('../prisma/prisma');

app.use(cors());
app.use(express.json());

const customerRoutes = require("./routes/customerRoutes");
const creditcardRoutes = require("./routes/creditcardRoutes");
const driverlicenseRoutes = require("./routes/driverslicenseRoutes");
const employeeRoutes = require("./routes/employeeRoutes");

app.use("/api/customers", customerRoutes);
app.use("/api/creditcard", creditcardRoutes);
app.use("/api/driver-license", driverlicenseRoutes);
app.use("/api/register-employee", employeeRoutes);

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
