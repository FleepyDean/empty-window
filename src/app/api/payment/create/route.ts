import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createBill, getPaymentUrl } from "@/lib/toyyibpay";
import { getProductCatalogWithPrices, isProductKey } from "@/lib/products";
import { generateOrderId } from "@/lib/orders";

// Helper to parse price from "RM X.XX" format
function parsePrice(priceLabel: string): number {
  const priceMatch = priceLabel.match(/RM\s+(\d+\.?\d*)/);
  return priceMatch ? parseFloat(priceMatch[1]) : 0;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { productKey, quantity, cart, customerName, customerEmail, customerPhone } = body;

    // Get product catalog
    const catalog = await getProductCatalogWithPrices();

    const orderItems: Array<{
      productKey: string;
      productName: string;
      serviceCode: string;
      heroServiceCode: string;
      quantity: number;
      unitPrice: number;
    }> = [];

    // Check if this is a cart order or single product order
    if (cart && Array.isArray(cart) && cart.length > 0) {
      // Cart order - multiple products
      for (const item of cart) {
        if (!isProductKey(item.productKey)) {
          return NextResponse.json({ message: `Invalid product key: ${item.productKey}` }, { status: 400 });
        }
        if (!item.quantity || item.quantity < 1) {
          return NextResponse.json({ message: "Quantity must be at least 1 for all items." }, { status: 400 });
        }

        const product = catalog.find((p) => p.key === item.productKey);
        if (!product) {
          return NextResponse.json({ message: `Product not found: ${item.productKey}` }, { status: 404 });
        }

        orderItems.push({
          productKey: item.productKey,
          productName: product.name,
          serviceCode: product.serviceCode,
          heroServiceCode: product.heroServiceCode,
          quantity: item.quantity,
          unitPrice: parsePrice(product.priceLabel),
        });
      }
    } else if (productKey && isProductKey(productKey)) {
      // Legacy single product order
      if (!quantity || quantity < 1) {
        return NextResponse.json({ message: "Quantity must be at least 1." }, { status: 400 });
      }

      const product = catalog.find((p) => p.key === productKey);
      if (!product) {
        return NextResponse.json({ message: "Product not found." }, { status: 404 });
      }

      orderItems.push({
        productKey,
        productName: product.name,
        serviceCode: product.serviceCode,
        heroServiceCode: product.heroServiceCode,
        quantity,
        unitPrice: parsePrice(product.priceLabel),
      });
    } else {
      return NextResponse.json({ message: "Invalid request. Provide either 'cart' array or 'productKey' with 'quantity'." }, { status: 400 });
    }

    // Calculate total amount
    const totalPrice = orderItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const amountInCents = Math.round(totalPrice * 100); // ToyyibPay expects cents

    if (amountInCents < 100) { // Minimum RM 1.00
      return NextResponse.json({ message: "Minimum amount is RM 1.00." }, { status: 400 });
    }

    // Generate order ID
    const orderId = generateOrderId();

    // Determine if this is a cart order
    const isCartOrder = orderItems.length > 1;

    // Create order in database (pending payment)
    // For cart orders: primary product is the first item, with isCartOrder flag
    // For single orders: standard behavior
    const primaryItem = orderItems[0];
    const order = await prisma.order.create({
      data: {
        orderId,
        productKey: primaryItem.productKey,
        productName: primaryItem.productName,
        serviceCode: primaryItem.serviceCode,
        heroServiceCode: primaryItem.heroServiceCode,
        quantity: isCartOrder ? orderItems.reduce((sum, item) => sum + item.quantity, 0) : primaryItem.quantity,
        isCartOrder,
        status: "pending_payment",
        totalPrice: totalPrice,
        // For cart orders, create OrderItem records
        items: isCartOrder ? {
          create: orderItems.map((item) => ({
            productKey: item.productKey,
            productName: item.productName,
            serviceCode: item.serviceCode,
            heroServiceCode: item.heroServiceCode,
            quantity: item.quantity,
            remainingQty: item.quantity,
            pricePerUnit: item.unitPrice,
          }))
        } : undefined,
      },
      include: {
        items: true,
      },
    });

    // Create bill description
    let billDescription: string;
    let billProductName: string;
    if (isCartOrder) {
      billProductName = `Cart Order (${orderItems.length} items)`;
      billDescription = orderItems.map((item) => `${item.productName} x${item.quantity}`).join(" + ");
    } else {
      billProductName = `${primaryItem.productName} x${primaryItem.quantity}`;
      billDescription = `Purchase of ${primaryItem.quantity} ${primaryItem.productName} voucher(s)`;
    }

    // Create ToyyibPay bill
    const bill = await createBill({
      productName: billProductName,
      description: billDescription,
      amount: amountInCents,
      orderId: orderId,
      customerName: customerName || "Customer",
      customerEmail: customerEmail || "customer@example.com",
      customerPhone: customerPhone || "0123456789",
    });

    // Create payment record
    await prisma.payment.create({
      data: {
        orderId: order.orderId,
        billCode: bill.BillCode,
        billExternalRef: orderId,
        amount: totalPrice,
        status: "pending",
      },
    });

    // Return payment URL
    const paymentUrl = getPaymentUrl(bill.BillCode);

    return NextResponse.json({
      success: true,
      orderId: order.orderId,
      paymentUrl,
      amount: totalPrice,
      itemCount: orderItems.length,
      message: "Redirect to payment page.",
    });

  } catch (error) {
    console.error("Payment creation error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create payment." },
      { status: 500 }
    );
  }
}
