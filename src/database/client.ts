import { PrismaClient } from '@prisma/client';
import { createPrismaCacheMiddleware } from '../middleware/prisma-cache-middleware';

// Global for Next.js hot reload (avoid multiple instances)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Create Prisma client with proper configuration
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  errorFormat: 'pretty',
});

// Add cache middleware
prisma.$use(createPrismaCacheMiddleware());

// Ensure single instance in development
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;