import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/checks/:id — update a compliance check
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = checkSchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Ownership is established through the relation: the check's asset must
  // belong to the caller. Prisma expresses this as a nested filter.
  const owned = await prisma.complianceCheck.findFirst({
    where: { id, asset: { userId: session.user.id } },
  });
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const check = await prisma.complianceCheck.update({
    where: { id },
    data: { ...parsed.data, lastChecked: new Date() },
  });

  return NextResponse.json(check);
}

// DELETE /api/checks/:id
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const owned = await prisma.complianceCheck.findFirst({
    where: { id, asset: { userId: session.user.id } },
  });
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.complianceCheck.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
