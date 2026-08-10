import { isAdminAuthenticated } from "@/lib/admin-auth";
import { cancelNumber, getBalance, getNumber, getNumberCheapest, getOtp, resendOtp } from "@/lib/herosms";
import { NextResponse } from "next/server";

// POST /api/admin/cbtl-register/sms  — request a new phone number
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { service, maxPrice, operatorPriority, strictOperator } = await request.json().catch(() => ({}));

  try {
    const svc = service ?? "ot";
    const price = typeof maxPrice === "number" ? maxPrice : undefined;
    const op = typeof operatorPriority === "string" && operatorPriority ? operatorPriority : undefined;

    // Strict mode: only request from the specified operator, no fallback
    if (strictOperator && op) {
      const result = await getNumber(svc, price, op);
      return NextResponse.json({ ...result, operator: op });
    }

    const result = await getNumberCheapest(svc, price, op);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to get number." },
      { status: 500 }
    );
  }
}

// GET /api/admin/cbtl-register/sms?id=<activationId>  — poll OTP
export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  try {
    const result = await getOtp(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to get OTP." },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/cbtl-register/sms  — cancel a number
export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await request.json().catch(() => ({}));

  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  try {
    const result = await cancelNumber(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to cancel number." },
      { status: 500 }
    );
  }
}

// PUT /api/admin/cbtl-register/sms  — request SMS resend for an existing number
export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await request.json().catch(() => ({}));

  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  try {
    const result = await resendOtp(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to resend SMS." },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/cbtl-register/sms  — get balance
export async function PATCH() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

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
