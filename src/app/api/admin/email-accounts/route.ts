import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.emailAccount.findMany({
    orderBy: [{ status: "asc" }, { id: "asc" }],
    include: {
      claim: {
        select: { claimId: true, status: true, emailOtp: true, createdAt: true }
      }
    }
  });

  return NextResponse.json({ accounts });
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id, status, voucherExpiresAt } = await request.json();

  if (!id || typeof id !== "number") {
    return NextResponse.json({ message: "id is required" }, { status: 400 });
  }

  const updated = await prisma.emailAccount.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(voucherExpiresAt !== undefined && {
        voucherExpiresAt: voucherExpiresAt ? new Date(voucherExpiresAt) : null
      })
    }
  });

  return NextResponse.json({ account: updated });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { emails } = await request.json();
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ message: "emails array is required" }, { status: 400 });
  }

  const created = await prisma.emailAccount.createMany({
    data: emails.map((email: string) => ({
      emailAddress: email.trim().toLowerCase(),
      status: "disabled"
    })),
    skipDuplicates: true
  });

  return NextResponse.json({ count: created.count });
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  if (!id || typeof id !== "number") {
    return NextResponse.json({ message: "id is required" }, { status: 400 });
  }

  await prisma.emailAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
