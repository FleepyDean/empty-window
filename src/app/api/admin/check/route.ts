import { isAdminAuthenticated } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET() {
  const authed = await isAdminAuthenticated();
  return NextResponse.json({ authenticated: authed });
}
