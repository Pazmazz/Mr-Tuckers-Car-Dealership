const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Car Dealership API Running");
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});

const vehicleRoutes = require("./routes/vehicleRoutes");
app.use("/api/vehicles", vehicleRoutes);

// ===== (Zaid) START =====
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

// ── Customers ─────────────────────────────────────────────────────────────
app.get("/api/customers", async (req, res) => {
  try {
    const customers = await prisma.customer.findMany();
    res.json(customers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/customers", async (req, res) => {
  try {
    const { customer_name, credit_score, drivers_license_id, credit_card_number } = req.body;
    const customer = await prisma.customer.create({
      data: {
        customer_name: String(customer_name),
        credit_score: Number(credit_score),
        drivers_license_id: Number(drivers_license_id),
        credit_card_number: Number(credit_card_number)
      }
    });
    res.status(201).json(customer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Credit Cards ───────────────────────────────────────────────────────────
app.get("/api/credit-cards", async (req, res) => {
  try {
    const cards = await prisma.credit_card.findMany();
    res.json(cards);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/credit-cards", async (req, res) => {
  try {
    const { credit_card_number, holder_name, security_code, expiration_date, zip_code } = req.body;
    const card = await prisma.credit_card.create({
      data: {
        credit_card_number: Number(credit_card_number),
        holder_name: String(holder_name),
        security_code: Number(security_code),
        expiration_date: String(expiration_date),
        zip_code: Number(zip_code)
      }
    });
    res.status(201).json(card);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Driver's Licenses ──────────────────────────────────────────────────────
app.get("/api/driver-licenses", async (req, res) => {
  try {
    const licenses = await prisma.driver_s_License.findMany();
    res.json(licenses);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/driver-licenses", async (req, res) => {
  try {
    const {
      drivers_license_id, holder_name, expiration_date, address,
      birth_date, sex, eye_color, weight, restrictions
    } = req.body;
    const license = await prisma.driver_s_License.create({
      data: {
        drivers_license_id: Number(drivers_license_id),
        holder_name: String(holder_name),
        expiration_date: String(expiration_date),
        address: String(address || ""),
        birth_date: String(birth_date || ""),
        sex: String(sex || ""),
        eye_color: String(eye_color || ""),
        weight: Number(weight || 0),
        restrictions: String(restrictions || "")
      }
    });
    res.status(201).json(license);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Employees ──────────────────────────────────────────────────────────────
app.get("/api/employees", async (req, res) => {
  try {
    const employees = await prisma.employee.findMany();
    res.json(employees);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/employees", async (req, res) => {
  try {
    const { employee_name, department, manager, commission } = req.body;
    const employee = await prisma.employee.create({
      data: {
        employee_name: String(employee_name),
        department: String(department || ""),
        manager: Number(manager) || 0,
        commission: Number(commission) || 0
      }
    });
    res.status(201).json(employee);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Vehicles — write operations (POST / PUT / DELETE) ─────────────────────
// GET /api/vehicles/ is handled by vehicleRoutes above.
app.post("/api/vehicles", async (req, res) => {
  try {
    const { vehicle_type, vehicle_brand, model_year, is_used, mileage, vehicle_price } = req.body;
    const vehicle = await prisma.vehicle.create({
      data: {
        vehicle_type: String(vehicle_type || ""),
        vehicle_brand: String(vehicle_brand || ""),
        model_year: Number(model_year) || 0,
        is_used: Number(is_used) || 0,
        mileage: Number(mileage) || 0,
        vehicle_price: Number(vehicle_price) || 0
      }
    });
    res.status(201).json(vehicle);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/vehicles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { vehicle_type, vehicle_brand, model_year, is_used, mileage, vehicle_price } = req.body;
    const vehicle = await prisma.vehicle.update({
      where: { vehicle_id: id },
      data: {
        ...(vehicle_type  !== undefined && { vehicle_type:  String(vehicle_type)  }),
        ...(vehicle_brand !== undefined && { vehicle_brand: String(vehicle_brand) }),
        ...(model_year    !== undefined && { model_year:    Number(model_year)    }),
        ...(is_used       !== undefined && { is_used:       Number(is_used)       }),
        ...(mileage       !== undefined && { mileage:       Number(mileage)       }),
        ...(vehicle_price !== undefined && { vehicle_price: Number(vehicle_price) })
      }
    });
    res.json(vehicle);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/vehicles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.vehicle.delete({ where: { vehicle_id: id } });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ===== (Zaid) END =====
