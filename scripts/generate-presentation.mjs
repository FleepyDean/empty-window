// Generates a PowerPoint presentation about the Nishinae Store project.
// Run: node scripts/generate-presentation.mjs
// Output: Nishinae-Store-Presentation.pptx at project root.

import pptxgen from "pptxgenjs";

const pres = new pptxgen();
pres.author = "Nishinae Store";
pres.company = "Nishinae";
pres.title = "Nishinae Store — Project Presentation";
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in

// Brand colors
const COLOR = {
  violet: "7C3AED",
  cyan: "06B6D4",
  bgDark: "0F172A",
  slate900: "0F172A",
  slate700: "334155",
  slate500: "64748B",
  slate300: "CBD5E1",
  slate100: "F1F5F9",
  white: "FFFFFF",
  amber: "F59E0B",
  red: "EF4444",
  green: "10B981",
};

// Slide master
pres.defineSlideMaster({
  title: "MASTER",
  background: { color: COLOR.white },
  objects: [
    { rect: { x: 0, y: 0, w: 13.333, h: 0.35, fill: { color: COLOR.violet } } },
    { rect: { x: 0, y: 7.15, w: 13.333, h: 0.35, fill: { color: COLOR.slate100 } } },
    {
      text: {
        text: "Nishinae Store",
        options: {
          x: 0.4, y: 7.17, w: 6, h: 0.3,
          fontSize: 10, fontFace: "Calibri", color: COLOR.slate500, bold: true,
        },
      },
    },
    {
      text: {
        text: "—",
        options: {
          x: 12.5, y: 7.17, w: 0.4, h: 0.3,
          fontSize: 10, fontFace: "Calibri", color: COLOR.slate500, align: "right",
        },
      },
    },
  ],
  slideNumber: { x: 12.8, y: 7.17, w: 0.4, h: 0.3, fontSize: 10, color: COLOR.slate500, fontFace: "Calibri" },
});

// Helpers
function addTitle(slide, title, subtitle) {
  slide.addText(title, {
    x: 0.5, y: 0.55, w: 12.3, h: 0.7,
    fontSize: 32, bold: true, color: COLOR.slate900, fontFace: "Calibri",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 1.2, w: 12.3, h: 0.4,
      fontSize: 14, color: COLOR.violet, fontFace: "Calibri", italic: true,
    });
  }
  slide.addShape(pres.ShapeType.line, {
    x: 0.5, y: 1.65, w: 2, h: 0, line: { color: COLOR.cyan, width: 3 },
  });
}

function imagePlaceholder(slide, x, y, w, h, label) {
  slide.addShape(pres.ShapeType.rect, {
    x, y, w, h,
    fill: { color: COLOR.slate100 },
    line: { color: COLOR.slate300, width: 1, dashType: "dash" },
  });
  slide.addText(
    [
      { text: "📸  ", options: { fontSize: 20 } },
      { text: label, options: { fontSize: 14, bold: true, color: COLOR.slate700 } },
      { text: "\n(insert screenshot here)", options: { fontSize: 10, color: COLOR.slate500, italic: true } },
    ],
    { x, y, w, h, align: "center", valign: "middle", fontFace: "Calibri" },
  );
}

function bulletList(slide, items, opts = {}) {
  slide.addText(
    items.map((t) => ({ text: t, options: { bullet: { code: "25A0" }, breakLine: true } })),
    {
      x: opts.x ?? 0.5, y: opts.y ?? 2.0, w: opts.w ?? 12.3, h: opts.h ?? 4.8,
      fontSize: opts.fontSize ?? 16, color: COLOR.slate700, fontFace: "Calibri",
      paraSpaceAfter: 6,
    },
  );
}

// =============================================================
// SLIDE 1 — Title
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  s.background = { color: COLOR.bgDark };
  s.addText("NISHINAE STORE", {
    x: 0.5, y: 2.4, w: 12.3, h: 1.2,
    fontSize: 60, bold: true, color: COLOR.white, align: "center", fontFace: "Calibri",
  });
  s.addText("Your Daily Life Necessities", {
    x: 0.5, y: 3.5, w: 12.3, h: 0.6,
    fontSize: 22, color: COLOR.cyan, align: "center", italic: true, fontFace: "Calibri",
  });
  s.addShape(pres.ShapeType.line, {
    x: 5.5, y: 4.3, w: 2.3, h: 0, line: { color: COLOR.violet, width: 3 },
  });
  s.addText("An e-commerce platform for OTP voucher purchase & redemption", {
    x: 0.5, y: 4.5, w: 12.3, h: 0.5,
    fontSize: 14, color: COLOR.slate300, align: "center", fontFace: "Calibri",
  });
  s.addText("Presented by: [Your Name]   •   [Date]", {
    x: 0.5, y: 6.3, w: 12.3, h: 0.4,
    fontSize: 12, color: COLOR.slate500, align: "center", fontFace: "Calibri",
  });
}

// =============================================================
// SLIDE 2 — Agenda
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "Agenda", "What we'll cover today");
  const items = [
    "1.  Project Overview & Problem Statement",
    "2.  Key Features",
    "3.  Tech Stack",
    "4.  System Architecture",
    "5.  User Flow — Store & Checkout",
    "6.  Payment Integration (ToyyibPay)",
    "7.  User Flow — Redemption & OTP",
    "8.  Admin Dashboard",
    "9.  Database Schema",
    "10. Deployment & Hosting",
    "11. Challenges & Solutions",
    "12. Future Improvements",
    "13. Demo & Q&A",
  ];
  bulletList(s, items, { fontSize: 18, y: 2.0 });
}

// =============================================================
// SLIDE 3 — Project Overview
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "Project Overview", "What is Nishinae Store?");
  s.addText(
    [
      { text: "The Problem\n", options: { bold: true, fontSize: 18, color: COLOR.violet } },
      { text: "Users need temporary phone numbers to receive OTPs for account registrations, verifications, and promo redemptions — but accessing such services is often inconvenient and requires technical knowledge.\n\n", options: { fontSize: 14, color: COLOR.slate700 } },
      { text: "The Solution\n", options: { bold: true, fontSize: 18, color: COLOR.cyan } },
      { text: "A simple, consumer-friendly store where customers can purchase vouchers, pay via FPX/card, and instantly claim a temporary number to receive OTPs — all in one place.\n\n", options: { fontSize: 14, color: COLOR.slate700 } },
      { text: "Target Audience\n", options: { bold: true, fontSize: 18, color: COLOR.amber } },
      { text: "Malaysian consumers who want quick access to disposable phone numbers for services like ZUS Coffee, Chagee, and other OTP-based promotions.", options: { fontSize: 14, color: COLOR.slate700 } },
    ],
    { x: 0.5, y: 2.0, w: 7.5, h: 5.0, fontFace: "Calibri", paraSpaceAfter: 4 },
  );
  imagePlaceholder(s, 8.5, 2.0, 4.3, 4.8, "Store Homepage");
}

// =============================================================
// SLIDE 4 — Key Features
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "Key Features", "What the platform offers");

  const features = [
    { icon: "🛒", title: "Product Catalog", desc: "Browse available OTP voucher products with dynamic pricing" },
    { icon: "💳", title: "Secure Payment", desc: "Integrated ToyyibPay (FPX + card) for Malaysian customers" },
    { icon: "📱", title: "Instant OTP Claim", desc: "Real-time phone number claim after successful payment" },
    { icon: "🔐", title: "Order Redemption", desc: "Unique order ID system for voucher redemption" },
    { icon: "⚙️", title: "Admin Dashboard", desc: "Inline editing of products, prices, and orders" },
    { icon: "🌓", title: "Dark / Light Mode", desc: "Responsive design with theme toggle" },
  ];

  features.forEach((f, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.5 + col * 4.3;
    const y = 2.0 + row * 2.3;
    s.addShape(pres.ShapeType.rect, {
      x, y, w: 4.0, h: 2.0,
      fill: { color: COLOR.slate100 },
      line: { color: COLOR.violet, width: 0 },
    });
    s.addShape(pres.ShapeType.rect, {
      x, y, w: 0.1, h: 2.0,
      fill: { color: COLOR.violet }, line: { color: COLOR.violet, width: 0 },
    });
    s.addText(f.icon, { x: x + 0.2, y: y + 0.15, w: 0.8, h: 0.6, fontSize: 28 });
    s.addText(f.title, {
      x: x + 0.9, y: y + 0.2, w: 3.0, h: 0.5,
      fontSize: 16, bold: true, color: COLOR.slate900, fontFace: "Calibri",
    });
    s.addText(f.desc, {
      x: x + 0.2, y: y + 0.85, w: 3.7, h: 1.1,
      fontSize: 12, color: COLOR.slate700, fontFace: "Calibri",
    });
  });
}

// =============================================================
// SLIDE 5 — Tech Stack
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "Tech Stack", "Tools & technologies used");

  const techCategories = [
    ["Frontend", ["Next.js 15 (App Router)", "React 19", "TypeScript", "Tailwind CSS", "Framer Motion", "Sonner (toasts)"], COLOR.cyan],
    ["Backend", ["Next.js API Routes", "Prisma ORM", "SQLite (file-based)", "JWT + HMAC auth"], COLOR.violet],
    ["External APIs", ["ToyyibPay (payments)", "HeroSMS (OTP numbers)"], COLOR.amber],
    ["Deployment", ["Railway (hosting)", "Persistent Volume (/data)", "GitHub (version control)"], COLOR.green],
  ];

  techCategories.forEach((cat, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.5 + col * 6.4;
    const y = 2.0 + row * 2.5;
    s.addShape(pres.ShapeType.rect, {
      x, y, w: 6.0, h: 2.2,
      fill: { color: COLOR.white }, line: { color: cat[2], width: 2 },
    });
    s.addText(cat[0], {
      x: x + 0.2, y: y + 0.15, w: 5.6, h: 0.5,
      fontSize: 18, bold: true, color: cat[2], fontFace: "Calibri",
    });
    s.addText(
      cat[1].map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
      {
        x: x + 0.2, y: y + 0.7, w: 5.6, h: 1.45,
        fontSize: 13, color: COLOR.slate700, fontFace: "Calibri", paraSpaceAfter: 2,
      },
    );
  });
}

// =============================================================
// SLIDE 6 — System Architecture
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "System Architecture", "How the components connect");

  // Customer box
  const drawBox = (x, y, w, h, label, color, textColor = COLOR.white) => {
    s.addShape(pres.ShapeType.roundRect, {
      x, y, w, h, fill: { color }, line: { color, width: 0 }, rectRadius: 0.1,
    });
    s.addText(label, {
      x, y, w, h, align: "center", valign: "middle",
      fontSize: 13, bold: true, color: textColor, fontFace: "Calibri",
    });
  };

  drawBox(0.5, 2.3, 2.2, 0.9, "👤 Customer\n(Browser)", COLOR.slate700);
  drawBox(5.5, 2.3, 2.3, 0.9, "🌐 Next.js App\n(Railway)", COLOR.violet);
  drawBox(10.5, 1.5, 2.3, 0.9, "💳 ToyyibPay\n(Payment)", COLOR.amber, COLOR.slate900);
  drawBox(10.5, 2.8, 2.3, 0.9, "📱 HeroSMS\n(OTP API)", COLOR.cyan, COLOR.slate900);
  drawBox(5.5, 4.5, 2.3, 0.9, "💾 SQLite DB\n(/data volume)", COLOR.green, COLOR.slate900);
  drawBox(0.5, 4.5, 2.2, 0.9, "🔧 Admin\n(Dashboard)", COLOR.red);

  // Arrows
  const arrow = (x1, y1, x2, y2) => {
    s.addShape(pres.ShapeType.line, {
      x: x1, y: y1, w: x2 - x1, h: y2 - y1,
      line: { color: COLOR.slate500, width: 2, endArrowType: "triangle" },
    });
  };
  arrow(2.7, 2.75, 5.5, 2.75); // customer -> app
  arrow(7.8, 2.55, 10.5, 2.0); // app -> toyyibpay
  arrow(7.8, 2.95, 10.5, 3.2); // app -> herosms
  arrow(6.65, 3.2, 6.65, 4.5); // app -> db
  arrow(2.7, 4.95, 5.5, 4.95); // admin -> db (via app)

  s.addText(
    [
      { text: "Flow: ", options: { bold: true, color: COLOR.slate900 } },
      { text: "Customer → App → (Payment + OTP APIs) → Database", options: { color: COLOR.slate700 } },
    ],
    { x: 0.5, y: 6.0, w: 12.3, h: 0.4, fontSize: 14, fontFace: "Calibri", align: "center" },
  );
}

// =============================================================
// SLIDE 7 — Store & Checkout Flow
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "User Flow — Store & Checkout", "From browsing to payment");
  const steps = [
    "1.  Customer visits store homepage and browses product catalog",
    "2.  Selects a product and chooses quantity",
    "3.  Clicks \"Buy Now\" — checkout modal opens",
    "4.  Fills in Full Name, Email, Phone Number",
    "5.  Confirms order with dynamic total price calculation",
    "6.  Clicks \"Pay Now\" → redirected to ToyyibPay payment page",
    "7.  Completes FPX / card payment via bank login",
    "8.  Redirected back to success page with unique Order ID",
  ];
  bulletList(s, steps, { x: 0.5, y: 2.0, w: 7.5, h: 5.0, fontSize: 14 });
  imagePlaceholder(s, 8.5, 2.0, 4.3, 2.3, "Product Card");
  imagePlaceholder(s, 8.5, 4.5, 4.3, 2.3, "Checkout Modal");
}

// =============================================================
// SLIDE 8 — Payment Integration
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "Payment Integration", "ToyyibPay — FPX & Card payments");

  s.addText(
    [
      { text: "Why ToyyibPay?\n", options: { bold: true, fontSize: 16, color: COLOR.violet } },
      { text: "• Malaysian-native gateway (FPX + card)\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• Simple bill-based API\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• Low transaction fees\n\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "Integration Flow\n", options: { bold: true, fontSize: 16, color: COLOR.cyan } },
      { text: "1. Create Bill via API (server-side)\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "2. Receive BillCode → redirect customer\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "3. Customer pays on ToyyibPay page\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "4. Callback URL receives payment status\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "5. Return URL redirects to success/fail page\n\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "Environments\n", options: { bold: true, fontSize: 16, color: COLOR.amber } },
      { text: "• Sandbox (dev.toyyibpay.com) for local testing\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• Production (toyyibpay.com) for live payments", options: { fontSize: 13, color: COLOR.slate700 } },
    ],
    { x: 0.5, y: 2.0, w: 7.5, h: 5.0, fontFace: "Calibri", paraSpaceAfter: 2 },
  );
  imagePlaceholder(s, 8.5, 2.0, 4.3, 4.8, "ToyyibPay Page");
}

// =============================================================
// SLIDE 9 — Redemption Flow
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "User Flow — Redemption & OTP", "Using your purchased voucher");
  const steps = [
    "1.  Customer navigates to /redeem with their Order ID",
    "2.  System validates the Order ID against the database",
    "3.  User clicks \"Claim Number\" to request a phone number",
    "4.  HeroSMS API returns a temporary phone number (15-min window)",
    "5.  Customer uses the number on target service (ZUS, Chagee, etc.)",
    "6.  App polls HeroSMS every 5 seconds for incoming OTP",
    "7.  OTP displayed instantly upon arrival",
    "8.  Customer can cancel claim (with 2-minute cooldown protection)",
  ];
  bulletList(s, steps, { x: 0.5, y: 2.0, w: 7.5, h: 5.0, fontSize: 14 });
  imagePlaceholder(s, 8.5, 2.0, 4.3, 2.3, "Redeem Page");
  imagePlaceholder(s, 8.5, 4.5, 4.3, 2.3, "OTP Received");
}

// =============================================================
// SLIDE 10 — Admin Dashboard
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "Admin Dashboard", "Backend management tools");

  s.addText(
    [
      { text: "Authentication\n", options: { bold: true, fontSize: 16, color: COLOR.violet } },
      { text: "JWT-based login with HMAC-signed tokens, stored as HTTP-only cookies.\n\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "Features\n", options: { bold: true, fontSize: 16, color: COLOR.cyan } },
      { text: "• View HeroSMS balance in real-time\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• Inline edit product prices\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• View & manage all orders\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• Edit Order ID and quantity inline\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• Delete orders\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• Order statistics dashboard\n\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "Security\n", options: { bold: true, fontSize: 16, color: COLOR.red } },
      { text: "Routes protected via middleware that validates admin tokens on every request.", options: { fontSize: 13, color: COLOR.slate700 } },
    ],
    { x: 0.5, y: 2.0, w: 7.5, h: 5.0, fontFace: "Calibri", paraSpaceAfter: 2 },
  );
  imagePlaceholder(s, 8.5, 2.0, 4.3, 4.8, "Admin Dashboard");
}

// =============================================================
// SLIDE 11 — Database Schema
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "Database Schema", "Prisma + SQLite models");

  const tables = [
    {
      name: "Order",
      x: 0.5, y: 2.0, color: COLOR.violet,
      fields: ["id (PK)", "orderId (unique)", "productKey", "productName", "serviceCode", "quantity", "totalPrice", "status", "createdAt"],
    },
    {
      name: "Payment",
      x: 4.9, y: 2.0, color: COLOR.amber,
      fields: ["id (PK)", "orderId (FK)", "billCode", "billExternalRef", "amount", "status", "paidAt", "createdAt"],
    },
    {
      name: "Claim",
      x: 9.3, y: 2.0, color: COLOR.cyan,
      fields: ["id (PK)", "claimId (unique)", "orderId (FK)", "heroActivationId", "phoneNumber", "status", "otp", "expiresAt"],
    },
    {
      name: "ProductSetting",
      x: 0.5, y: 5.0, color: COLOR.green,
      fields: ["id (PK)", "productKey (unique)", "priceOverride", "updatedAt"],
    },
    {
      name: "AdminUser",
      x: 4.9, y: 5.0, color: COLOR.red,
      fields: ["id (PK)", "username (unique)", "passwordHash", "createdAt"],
    },
  ];

  tables.forEach((t) => {
    s.addShape(pres.ShapeType.rect, {
      x: t.x, y: t.y, w: 3.8, h: 2.7,
      fill: { color: COLOR.white }, line: { color: t.color, width: 2 },
    });
    s.addShape(pres.ShapeType.rect, {
      x: t.x, y: t.y, w: 3.8, h: 0.5,
      fill: { color: t.color }, line: { color: t.color, width: 0 },
    });
    s.addText(t.name, {
      x: t.x, y: t.y, w: 3.8, h: 0.5,
      fontSize: 14, bold: true, color: COLOR.white, align: "center", valign: "middle", fontFace: "Calibri",
    });
    s.addText(
      t.fields.map((f) => ({ text: f, options: { breakLine: true } })),
      {
        x: t.x + 0.2, y: t.y + 0.55, w: 3.6, h: 2.1,
        fontSize: 11, color: COLOR.slate700, fontFace: "Consolas", paraSpaceAfter: 1,
      },
    );
  });
}

// =============================================================
// SLIDE 12 — Deployment
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "Deployment & Hosting", "Going live with Railway");

  s.addText(
    [
      { text: "Platform: Railway\n", options: { bold: true, fontSize: 18, color: COLOR.violet } },
      { text: "Node.js-based hosting with automatic builds from GitHub and persistent volume support.\n\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "Configuration\n", options: { bold: true, fontSize: 16, color: COLOR.cyan } },
      { text: "• Persistent volume mounted at /data\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• DATABASE_URL = file:/data/dev.db\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• Prisma db push runs on every startup\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• Environment variables for ToyyibPay + HeroSMS\n\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "CI/CD\n", options: { bold: true, fontSize: 16, color: COLOR.amber } },
      { text: "• railway up -s nishinae-store for manual deploy\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• Build logs streamed live\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "• Health check endpoint at /api/health\n\n", options: { fontSize: 13, color: COLOR.slate700 } },
      { text: "Domain\n", options: { bold: true, fontSize: 16, color: COLOR.green } },
      { text: "Custom domain with Google Search Console verification", options: { fontSize: 13, color: COLOR.slate700 } },
    ],
    { x: 0.5, y: 2.0, w: 7.5, h: 5.0, fontFace: "Calibri", paraSpaceAfter: 2 },
  );
  imagePlaceholder(s, 8.5, 2.0, 4.3, 4.8, "Railway Dashboard");
}

// =============================================================
// SLIDE 13 — Challenges & Solutions
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "Challenges & Solutions", "Problems solved during development");

  const challenges = [
    { p: "Database persistence on Railway (data wiped on redeploy)", s: "Mounted persistent volume at /data with updated DATABASE_URL" },
    { p: "ToyyibPay userSecretKey missing errors", s: "Added required userSecretKey parameter to all API calls" },
    { p: "Next.js build errors with useSearchParams", s: "Wrapped components in Suspense boundary" },
    { p: "HeroSMS early cancellation exposing raw error", s: "Sanitized error messages at API route layer" },
    { p: "ESLint no-explicit-any / no-require-imports blocking build", s: "Refactored imports + added targeted eslint-disable comments" },
    { p: "Cannot hide customer info on ToyyibPay page", s: "Accepted limitation; collect info upfront for transparency" },
  ];

  challenges.forEach((c, i) => {
    const y = 2.0 + i * 0.82;
    s.addShape(pres.ShapeType.rect, {
      x: 0.5, y, w: 0.15, h: 0.7, fill: { color: COLOR.red }, line: { color: COLOR.red, width: 0 },
    });
    s.addText(
      [
        { text: "Problem: ", options: { bold: true, color: COLOR.red, fontSize: 12 } },
        { text: c.p + "\n", options: { color: COLOR.slate700, fontSize: 12 } },
        { text: "Solution: ", options: { bold: true, color: COLOR.green, fontSize: 12 } },
        { text: c.s, options: { color: COLOR.slate700, fontSize: 12 } },
      ],
      { x: 0.75, y, w: 12.0, h: 0.72, fontFace: "Calibri", valign: "middle" },
    );
  });
}

// =============================================================
// SLIDE 14 — Future Improvements
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  addTitle(s, "Future Improvements", "Roadmap & planned enhancements");

  const columns = [
    {
      title: "Near-term", color: COLOR.cyan,
      items: [
        "Email receipts via SMTP",
        "Order history for customers",
        "Bulk discount tiers",
        "Promo code system",
        "Analytics dashboard",
      ],
    },
    {
      title: "Mid-term", color: COLOR.violet,
      items: [
        "Multi-language (BM / EN)",
        "Customer accounts",
        "Wishlist feature",
        "Referral program",
        "Mobile app (PWA)",
      ],
    },
    {
      title: "Long-term", color: COLOR.amber,
      items: [
        "Multi-payment gateways",
        "Migrate to PostgreSQL",
        "Microservices architecture",
        "AI-powered support chat",
        "International expansion",
      ],
    },
  ];

  columns.forEach((col, i) => {
    const x = 0.5 + i * 4.3;
    s.addShape(pres.ShapeType.rect, {
      x, y: 2.0, w: 4.0, h: 4.8,
      fill: { color: COLOR.white }, line: { color: col.color, width: 2 },
    });
    s.addShape(pres.ShapeType.rect, {
      x, y: 2.0, w: 4.0, h: 0.6,
      fill: { color: col.color }, line: { color: col.color, width: 0 },
    });
    s.addText(col.title, {
      x, y: 2.0, w: 4.0, h: 0.6,
      fontSize: 18, bold: true, color: COLOR.white, align: "center", valign: "middle", fontFace: "Calibri",
    });
    s.addText(
      col.items.map((t) => ({ text: t, options: { bullet: { code: "25B8" }, breakLine: true } })),
      {
        x: x + 0.2, y: 2.8, w: 3.6, h: 3.9,
        fontSize: 14, color: COLOR.slate700, fontFace: "Calibri", paraSpaceAfter: 6,
      },
    );
  });
}

// =============================================================
// SLIDE 15 — Thank You
// =============================================================
{
  const s = pres.addSlide({ masterName: "MASTER" });
  s.background = { color: COLOR.bgDark };
  s.addText("Thank You", {
    x: 0.5, y: 2.5, w: 12.3, h: 1.5,
    fontSize: 72, bold: true, color: COLOR.white, align: "center", fontFace: "Calibri",
  });
  s.addShape(pres.ShapeType.line, {
    x: 5.5, y: 4.1, w: 2.3, h: 0, line: { color: COLOR.cyan, width: 3 },
  });
  s.addText("Questions & Discussion", {
    x: 0.5, y: 4.3, w: 12.3, h: 0.5,
    fontSize: 20, color: COLOR.cyan, align: "center", italic: true, fontFace: "Calibri",
  });
  s.addText(
    [
      { text: "🌐  ", options: { fontSize: 14 } },
      { text: "nishinae-store.up.railway.app\n", options: { fontSize: 14, color: COLOR.slate300 } },
      { text: "💬  ", options: { fontSize: 14 } },
      { text: "t.me/nishinaestore", options: { fontSize: 14, color: COLOR.slate300 } },
    ],
    { x: 0.5, y: 5.2, w: 12.3, h: 1.0, align: "center", fontFace: "Calibri" },
  );
}

// Save
const outPath = "Nishinae-Store-Presentation.pptx";
pres.writeFile({ fileName: outPath }).then((file) => {
  console.log(`✅ Presentation generated: ${file}`);
});
