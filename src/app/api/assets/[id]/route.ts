import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assetSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/assets/:id — update one asset
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = assetSchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // updateMany with BOTH id and userId in the where clause is the fix for
  // Insecure Direct Object Reference (IDOR): matching on id alone would let a
  // signed-in user edit anyone's asset just by changing the id in the URL.
  // If the asset is not theirs, zero rows match and nothing is modified.
  const result = await prisma.asset.updateMany({
    where: { id, userId: session.user.id },
    data: parsed.data,
  });

  if (result.count === 0) {
    // Return 404 rather than 403: do not reveal that the resource exists.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const asset = await prisma.asset.findUnique({ where: { id } });
  return NextResponse.json(asset);
}

// DELETE /api/assets/:id — delete one asset (and, by cascade, its checks)
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const result = await prisma.asset.deleteMany({
    where: { id, userId: session.user.id },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
