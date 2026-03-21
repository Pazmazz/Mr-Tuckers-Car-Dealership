import { PrismaClient } from '../generated/prisma'

const prisma = new PrismaClient()

async function main() {
    const card = await prisma.employee.create({
        data: {
            employee_id: 100,
            department: "Sales",
            manager: 1,
            commission: 0,
            employee_name: "W.D. Gaster"
        }
    })
}