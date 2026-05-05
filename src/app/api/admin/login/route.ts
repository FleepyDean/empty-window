import { validateCredentials, createAdminToken, ADMIN_TOKEN_NAME } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { username, password } = await request.json();

  if (!validateCredentials(username, password)) {
    return NextResponse.json({ message: "Invalid credentials." }, { status: 401 });
  }

  const token = createAdminToken();
  const response = NextResponse.json({ message: "Login successful." });
  response.cookies.set(ADMIN_TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400
  });

  return response;
}
