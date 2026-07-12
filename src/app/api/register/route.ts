import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const body = await req.json();

  // Validate before touching the database.
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Generic message: do not confirm which addresses are already registered.
    return NextResponse.json(
      { error: "Unable to register with those details" },
      { status: 409 }
    );
  }

  // bcrypt with a cost factor of 12. The password is never stored in plaintext
  // and the hash is deliberately slow to compute, which is what makes offline
  // brute-forcing a stolen database expensive.
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: { name, email, passwordHash },
  });

  // Never return the user object (it contains the hash).
  return NextResponse.json({ ok: true }, { status: 201 });
}
