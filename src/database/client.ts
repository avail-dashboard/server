import { PrismaClient } from '@prisma/client';
import { createPrismaCacheMiddleware } from '../middleware/prisma-cache-middleware';

// Global for Next.js hot reload (avoid multiple instances)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Create Prisma client with proper configuration and connection pooling
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  errorFormat: 'pretty',
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'stdout',
      level: 'error',
    },
    {
      emit: 'stdout',
      level: 'info',
    },
    {
      emit: 'stdout',
      level: 'warn',
    },
  ],
});

// Add cache middleware
prisma.$use(createPrismaCacheMiddleware());

// Add performance monitoring middleware
prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();
  
  if (after - before > 1000) { // Log slow queries > 1s
    console.warn(`Slow query detected: ${params.model}.${params.action} took ${after - before}ms`);
  }
  
  return result;
});

// Add query event listener for monitoring (disabled - not supported in this Prisma version)
// if (prisma.$on) {
//   prisma.$on('query', (e: { query: string; duration: number }) => {
//     if (e.duration > 1000) { // Log slow queries > 1s
//       console.warn(`Slow query: ${e.query} took ${e.duration}ms`);
//     }
//   });
// }

// Ensure single instance in development
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown with proper cleanup
process.on('beforeExit', async () => {
  try {
    // Remove event listeners to prevent memory leaks (not supported in this Prisma version)
    // if (prisma.$off) {
    //   prisma.$off('query', () => {});
    // }
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error during Prisma disconnect:', error);
  }
});

export default prisma;