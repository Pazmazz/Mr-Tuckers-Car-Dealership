// ------- Dependencies -------
const express = require("express"); // Web framework for handling HTTP requests
const cors = require("cors"); // Middleware to allow cross-origin requests
require("dotenv").config(); // Loads environment variables from .env into process.env

// ------ Set up for the app and database -------
const app = express();
const prisma = require('../prisma/prisma');

// ------ Set up for middleware -------
app.use(cors());
app.use(express.json());

// ------ Routing imports for CRUD operations -------
const customerRoutes = require("./routes/customerRoutes"); // Routing for customer information
const creditcardRoutes = require("./routes/creditcardRoutes"); // Routing for customer credit cards
const driverlicenseRoutes = require("./routes/driverslicenseRoutes"); // Routing for customer driver's license
const employeeRoutes = require("./routes/employeeRoutes"); // Routing for employee information
const vehicleRoutes = require("./routes/vehicleRoutes"); // Routing for vehicle inventory information
const transactionRoutes = require("./routes/transactionsRoutes"); // Routing for transaction information

// ------ Sets up routing to be hooked to API ------
app.use("/api/customers", customerRoutes);
app.use("/api/creditcard", creditcardRoutes);
app.use("/api/driver-license", driverlicenseRoutes);
app.use("/api/register-employee", employeeRoutes);
app.use("/api/inventory", vehicleRoutes);
app.use("/api/transactions", transactionRoutes);

// -------- GET command that confirms the API server is running -------
app.get("/", (req, res) => {
  res.send("Car Dealership API Running");
});

// -------- Starts running the server ------------
// Listens on the port defined in the .env file (e.g. PORT=3000)
app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});

// Gracefully shut down the prisma connection when the script stops running
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
