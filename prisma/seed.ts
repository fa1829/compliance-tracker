import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@example.com";
  const passwordHash = await bcrypt.hash("demo1234", 12);

  // upsert makes the seed idempotent: running it twice does not create duplicates.
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Demo User", passwordHash },
  });

  // Clear existing demo assets so re-seeding gives a predictable state.
  await prisma.asset.deleteMany({ where: { userId: user.id } });

  await prisma.asset.create({
    data: {
      name: "prod-web-01",
      type: "SERVER",
      owner: "Platform team",
      description: "Public-facing web server",
      userId: user.id,
      checks: {
        create: [
          { framework: "PCI-DSS 8.3.4", status: "COMPLIANT", notes: "Account lockout enforced", lastChecked: new Date() },
          { framework: "PCI-DSS 10.2.1", status: "IN_REVIEW", notes: "Audit logging being verified", lastChecked: new Date() },
        ],
      },
    },
  });

  await prisma.asset.create({
    data: {
      name: "customer-db",
      type: "DATABASE",
      owner: "Data team",
      description: "Primary customer datastore",
      userId: user.id,
      checks: {
        create: [
          { framework: "ISO 27001 A.10.1.1", status: "COMPLIANT", notes: "Encryption at rest enabled", lastChecked: new Date() },
          { framework: "PCI-DSS 3.4", status: "NON_COMPLIANT", notes: "Key rotation overdue", lastChecked: new Date() },
        ],
      },
    },
  });

  await prisma.asset.create({
    data: {
      name: "vpn-gateway",
      type: "NETWORK_DEVICE",
      owner: "Network team",
      userId: user.id,
      checks: {
        create: [
          { framework: "ISO 27001 A.9.4.2", status: "NOT_ASSESSED", lastChecked: null },
        ],
      },
    },
  });

  console.log(`Seeded. Sign in with ${email} / demo1234`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
