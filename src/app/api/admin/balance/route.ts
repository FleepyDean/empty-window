import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getBalance } from "@/lib/herosms";
import { NextResponse } from "next/server";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const data = await getBalance();
    return NextResponse.json({ balance: data.balance });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to fetch balance." },
      { status: 500 }
    );
  }
}
