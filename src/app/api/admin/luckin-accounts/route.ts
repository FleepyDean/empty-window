import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.luckinAccount.findMany({
    orderBy: [{ status: "asc" }, { id: "asc" }],
    include: {
      claim: {
        select: { claimId: true, status: true, createdAt: true }
      }
    }
  });

  return NextResponse.json({ accounts });
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id, status } = await request.json();

  if (!id || typeof id !== "number") {
    return NextResponse.json({ message: "id is required" }, { status: 400 });
  }

  const updated = await prisma.luckinAccount.update({
    where: { id },
    data: {
      ...(status !== undefined && { status })
    }
  });

  return NextResponse.json({ account: updated });
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  if (!id || typeof id !== "number") {
    return NextResponse.json({ message: "id is required" }, { status: 400 });
  }

  await prisma.luckinAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
