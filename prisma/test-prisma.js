const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    await prisma.$connect();
    console.log('✅ Prisma Client connected successfully!');
  } catch (error) {
    console.error('❌ Prisma Client connection failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
