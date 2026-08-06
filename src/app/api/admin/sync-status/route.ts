import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const status = await prisma.syncStatus.findUnique({ where: { id: 1 } });

  if (!status) {
    return NextResponse.json({
      lastSyncAt: null,
      lastStatus: "pending",
      lastSummary: null,
      lastError: null
    });
  }

  return NextResponse.json({
    lastSyncAt: status.lastSyncAt,
    lastStatus: status.lastStatus,
    lastSummary: status.lastSummary,
    lastError: status.lastError
  });
}
