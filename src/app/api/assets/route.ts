import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assetSchema } from "@/lib/validation";

// GET /api/assets — list the signed-in user's assets
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assets = await prisma.asset.findMany({
    // Scoping by userId is the tenant boundary: a user can only ever read
    // their own rows, no matter what they send.
    where: { userId: session.user.id },
    include: { checks: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(assets);
}

// POST /api/assets — create an asset for the signed-in user
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = assetSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const asset = await prisma.asset.create({
    // userId comes from the server-side session, never from the request body.
    // Taking it from the body would let a caller create rows owned by someone else.
    data: { ...parsed.data, userId: session.user.id },
  });

  return NextResponse.json(asset, { status: 201 });
}
