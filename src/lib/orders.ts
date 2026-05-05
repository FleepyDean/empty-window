// Order utilities

export function generateOrderId(productKey?: string): string {
  const prefix = productKey ? productKey.toUpperCase() : "ORD";
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${stamp}-${random}`;
}
