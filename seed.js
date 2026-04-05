require('dotenv').config()
const { PrismaClient } = require('./generated/prisma')
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3')

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db"
})

const prisma = new PrismaClient({ adapter })

console.log("DB URL:", process.env.DATABASE_URL)

async function main() {
  // Create a manager  
  const manager = await prisma.employee.create({
    data: {
      department: "Sales",
      manager: 1,
      commission: 0,
      employee_name: "W.D. Gaster"
    }
  })

  // Create an employee
  const employee = await prisma.employee.create({
    data: {
      department: "Sales",
      manager: 0,
      commission: 7,
      employee_name: "Leo Ni"
    }
  })

  // Create a credit card
  const card = await prisma.credit_card.create({
    data: {
      credit_card_number: 123456789012,
      holder_name: "Dio Brando",
      security_code: 679,
      expiration_date: "04-04-28",
      zip_code: 29501
    }
  })

  // Create a driver's license
  const license = await prisma.driver_s_License.create({
    data: {
      drivers_license_id: 653291749,
      holder_name: "Dio Brando",
      expiration_date: "04-04-28",
      address: "43 Heaven Drive London, England",
      birth_date: "04-10-90",
      sex: "M",
      eye_color: "Brown",
      weight: 231,
      restrictions: "None"
    }
  })

  // Create a customer linked to the card and license
  const customer = await prisma.customer.create({
    data: {
      customer_name: "Dio Brando", 
      credit_score: 350,
      drivers_license_id: license.drivers_license_id,
      credit_card_number: card.credit_card_number
    }
  })

  // Create a vehicle
  const vehicle = await prisma.vehicle.create({
    data: {
      vehicle_type: "Mustang",
      vehicle_brand: "Ford",
      model_year: 2026,
      is_used: 0,
      mileage: 0,
      vehicle_price: 33000
    }
  })

  // Create a transaction
  await prisma.transactions.create({
    data: {
      date: "03-22-26",
      time: "12:00",
      discount: 13000,
      price_paid: 20000,
      price_offered: 33000,
      employee_id: employee.employee_id,
      customer_id: customer.customer_id,
      vehicle_id: vehicle.vehicle_id
    }
  })

  const check = await prisma.customer.findMany()
  console.log("Customers in DB:", check)
}

main()
  .then(() => {
    console.log("Seed data succesfully inserted")
  })
  .catch((e) => {
    console.error(e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })