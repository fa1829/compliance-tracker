import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/assets/:id/checks — add a compliance check to an asset
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assetId } = await params;

  // Ownership is checked one level up: the check belongs to an asset, and the
  // asset belongs to a user. Confirm the parent asset is the caller's before
  // creating a child row against it.
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId: session.user.id },
  });
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = checkSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const check = await prisma.complianceCheck.create({
    data: { ...parsed.data, assetId, lastChecked: new Date() },
  });

  return NextResponse.json(check, { status: 201 });
}
