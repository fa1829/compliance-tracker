import { PrismaClient } from "@prisma/client";

// In development, Next.js hot-reloading re-executes modules on every change.
// Without this guard a new PrismaClient (and a new DB connection pool) would be
// created on each reload, eventually exhausting database connections. Caching the
// instance on `globalThis` keeps exactly one client alive across reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
