export type ProductKey = "zus" | "chagee" | "tealive" | "kfc" | "cbtl" | "gigi" | "winrar";

export type ProductConfig = {
  key: ProductKey;
  name: string;
  serviceCode: string;
  heroServiceCode: string; // HeroSMS service code (can be shared across products)
  priceLabel: string;
  logoUrl: string;
  redemptionInstructions: string;
  productType: "otp" | "link";
  linkUrl?: string; // Static link for link-type products
};

const ZUS_INSTRUCTIONS = `📦 Preferably for PICKUP — If want DELIVERY, remark your own phone number before checkout.

✅ Steps to Redeem the Voucher (READ CAREFULLY):
- Open ZUS Coffee app and make sure you're logged out
- Insert phone number given and click send "SMS" - NOT "WHATSAPP" (IMPORTANT)
- Insert random name and email
- For Date of Birth, fill in tomorrow's date with any year. (Receive Buy 1 Free 1 Cake birthday redemption the next day)
- DO NOT ENTER ANY REFERRAL CODE! SKIP THE REFERRAL SECTION!
- Maximum of RM10.50 only for free drink redemption

After registration and login:
Go to: Account → My Vouchers → Enter "BUY1FREE1" and CLAIM
The Buy 1 Free 1 Cake voucher will appear in the account the next day

Enable Biometric Login in the ZUS app settings (important if the account auto-logs out later).
🔁 If the account logs out automatically:
Tap "Login with Biometric" only.
Even if the phone number shown is different, it will log back into the same account.

⚠️ Do not log into any other ZUS account — the number will be burned after 15 minutes and you won't be able to log in again.
✅ Please follow all instructions carefully.

We do not take any responsibility for any errors caused by own failure to follow the steps above.

---

⚠️ BUY1FREE1 Voucher Not Appearing / "Maximum Usage" Error?

Some accounts may encounter a "Sorry, you have reached the maximum usage limit of this voucher" error when trying to claim the BUY1FREE1 code, even on a brand new account. This is a known issue on ZUS Coffee's end.

To fix this, contact ZUS Coffee Customer Service directly on WhatsApp:

📞 WhatsApp: 0128161340

What to say:
1. Tell them you are a first-time user and just downloaded the app
2. Say you are unable to claim the BUY1FREE1 voucher
3. Send a screenshot of your Voucher/Wallet page showing the error
4. Provide your registered phone number in the app

⚠️ Important: Do NOT mention anything about purchasing or buying the number. Simply say you are a new user registering for the first time.

ZUS Coffee support will manually add the voucher to your account. This usually takes a short while after the chat.`;

const CHAGEE_INSTRUCTIONS = `📦 Strictly for PICKUP

✅ Steps to Redeem the Voucher (READ CAREFULLY):
- Open Chagee app and make sure you're logged out
- Insert phone number given and wait for OTP
- Insert random name and email
- For Date of Birth, fill in tomorrow's date with any year. (For any birthday rewards)
- DO NOT ENTER ANY REFERRAL CODE! SKIP THE REFERRAL SECTION!

After registration and login:
Go to: Me → My Account → Check for the vouchers

⚠️ Do not log into any other Chagee account — the number will be burned after 15 minutes and you won't be able to log in again.
✅ Please follow all instructions carefully.

We do not take any responsibility for any errors caused by own failure to follow the steps above.`;

const CBTL_INSTRUCTIONS = `📦 Strictly for PICKUP

✅ Steps to Redeem the Voucher (READ CAREFULLY):
- Open MyCBTL app and make sure you're logged out
- Insert random name and your valid email
📧 Email tip: You need a valid email for verification.
Only have 1 email? Add a dot anywhere in it — e.g., yourname@gmail.com → your.name@gmail.com (Gmail ignores dots).
- Verify OTP sent to your email
- Insert phone number given and wait for OTP
- DO NOT ENTER ANY REFERRAL CODE! SKIP THE REFERRAL SECTION!

After registration and login:
Go to: Home → View My Vouchers → Check for the vouchers

⚠️ Do not log into any other MyCBTL account — the number will be burned after 15 minutes and you won't be able to log in again.
✅ Please follow all instructions carefully.

We do not take any responsibility for any errors caused by own failure to follow the steps above.`;

const GIGI_INSTRUCTIONS = `📦 Strictly for PICKUP

✅ Steps to Redeem the Voucher (READ CAREFULLY):
- Open Gigi Coffee app and make sure you're logged out
- Insert phone number given and wait for OTP
- Insert random name and email
- DO NOT ENTER ANY REFERRAL CODE! SKIP THE REFERRAL SECTION!

After registration and login:
Go to: Home → 1 Voucher → Check for the vouchers

⚠️ Do not log into any other Gigi Coffee account — the number will be burned after 15 minutes and you won't be able to log in again.
✅ Please follow all instructions carefully.

We do not take any responsibility for any errors caused by own failure to follow the steps above.`;

const TEALIVE_INSTRUCTIONS = `📦 Available for PICKUP and WALK-IN

✅ Steps to Redeem the Voucher (READ CAREFULLY):
- Open Tealive app and make sure you're logged out
- Insert phone number given and wait for OTP
- Insert random name and email
- DO NOT ENTER ANY REFERRAL CODE! SKIP THE REFERRAL SECTION!

After registration and login:
Go to: Reward → My Vouchers → Check for the vouchers

⚠️ Do not log into any other Tealive account — the number will be burned after 15 minutes and you won't be able to log in again.
✅ Please follow all instructions carefully.

We do not take any responsibility for any errors caused by own failure to follow the steps above.`;

const KFC_INSTRUCTIONS = `📦 Strictly for PICKUP

✅ Steps to Redeem the Voucher (READ CAREFULLY):
- Open KFC app and make sure you're logged out
- Insert phone number given and wait for OTP
- Insert random name and email
- Enter referral code "W4PQJETW" for RM8 BONUS

After registration and login:
Go to: Order Now → Offers & Rewards → Check for the vouchers

⚠️ Do not log into any other KFC account — the number will be burned after 15 minutes and you won't be able to log in again.
✅ Please follow all instructions carefully.

We do not take any responsibility for any errors caused by own failure to follow the steps above.`;

const WINRAR_INSTRUCTIONS = `💻 WinRAR Lifetime License

✅ Steps to Activate:
1. Click the "Get Link" button to access the download folder
2. Download and install WinRAR from the folder
3. Follow the instructions in the README file included
4. Enjoy your lifetime WinRAR license!

⚠️ Do not share the link with anyone else.
✅ Please follow all instructions carefully.

We do not take any responsibility for any errors caused by own failure to follow the steps above.`;

export const PRODUCT_CATALOG: ProductConfig[] = [
  { key: "zus", productType: "otp", name: "ZUS Coffee", serviceCode: "aik", heroServiceCode: "aik", priceLabel: "RM 0.00", logoUrl: "https://resources.wobbjobs.com/jobs-malaysia/companies/2cced996-255d-4525-812b-e9319b8ce8f2/company_logo/original/13f90cff-059d-435e-b166-794a51360600-logo.jpg", redemptionInstructions: ZUS_INSTRUCTIONS },
  { key: "chagee", productType: "otp", name: "Chagee", serviceCode: "bwx", heroServiceCode: "ot", priceLabel: "RM 0.00", logoUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT5oclmn4Q6h0t7hgLN8_S2N7QzrlczmdW0rw&s", redemptionInstructions: CHAGEE_INSTRUCTIONS },
  { key: "tealive", productType: "otp", name: "Tealive", serviceCode: "avb", heroServiceCode: "avb", priceLabel: "RM 0.00", logoUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTEaSAISBahRRXbolEAdKw2fFKL6sqd0pOKyg&s", redemptionInstructions: TEALIVE_INSTRUCTIONS },
  { key: "kfc", productType: "otp", name: "KFC", serviceCode: "fz", heroServiceCode: "fz", priceLabel: "RM 0.00", logoUrl: "https://media.tenor.com/kkb548hIQfUAAAAe/kfc-logo.png", redemptionInstructions: KFC_INSTRUCTIONS },
  { key: "cbtl", productType: "otp", name: "Coffee Bean & Tea Leaf", serviceCode: "cbtl", heroServiceCode: "ot", priceLabel: "RM 0.00", logoUrl: "https://play-lh.googleusercontent.com/Qmm4QXPiOycGYwkaF9QFX1qxZKdMYHp-Ff8x7meL_T_ExwRyOb0An4WYkt53eN_Itg", redemptionInstructions: CBTL_INSTRUCTIONS },
  { key: "gigi", name: "Gigi Coffee", serviceCode: "gigi", heroServiceCode: "ot", priceLabel: "RM 0.00", logoUrl: "https://www.gigicoffee.com/wp-content/uploads/2023/04/logo-gigicoffee.png", redemptionInstructions: GIGI_INSTRUCTIONS, productType: "otp" },
  { key: "winrar", name: "WinRAR", serviceCode: "winrar", heroServiceCode: "", priceLabel: "RM 0.00", logoUrl: "https://images.wincrunch.com/winrar-logo.png", redemptionInstructions: WINRAR_INSTRUCTIONS, productType: "link", linkUrl: "https://drive.google.com/drive/folders/1oe2TmUmNGfG7iR5NK5e7E7NGdMemovK5?usp=sharing" }
];

export const PRODUCT_MAP: Record<ProductKey, ProductConfig> = PRODUCT_CATALOG.reduce(
  (acc, item) => {
    acc[item.key] = item;
    return acc;
  },
  {} as Record<ProductKey, ProductConfig>
);

export function isProductKey(value: string): value is ProductKey {
  return value in PRODUCT_MAP;
}

export async function getProductCatalogWithPrices(): Promise<ProductConfig[]> {
  const { prisma } = await import("@/lib/prisma");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overrides = await (prisma as any).productSetting.findMany() as {
    productKey: string;
    priceLabel: string;
    redemptionInstructions?: string | null;
  }[];
  const overrideMap = new Map(overrides.map((o) => [o.productKey, o]));

  return PRODUCT_CATALOG.map((p) => {
    const o = overrideMap.get(p.key);
    return {
      ...p,
      priceLabel: o?.priceLabel ?? p.priceLabel,
      redemptionInstructions: o?.redemptionInstructions ?? p.redemptionInstructions
    };
  });
}
