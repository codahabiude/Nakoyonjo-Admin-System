import { db } from "@/lib/db";

interface SmsResult {
  success: boolean;
  error?: string;
}

/** Send an SMS via Africa's Talking API. Returns success/failure. */
export async function sendSMS(phone: string, message: string): Promise<SmsResult> {
  try {
    const settings = await db.schoolSetting.findMany({
      where: { key: { in: ["sms_username", "sms_api_key", "sms_sender_id"] } },
    });

    const get = (key: string) => settings.find((s) => s.key === key)?.value || "";
    const username = get("sms_username");
    const apiKey = get("sms_api_key");
    const senderId = get("sms_sender_id");

    if (!username || !apiKey) {
      console.log("[SMS] SMS not configured — missing username or API key");
      return { success: false, error: "SMS not configured" };
    }

    const response = await fetch("https://api.africastalking.com/v1/messaging", {
      method: "POST",
      headers: {
        apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        username,
        to: [phone],
        message,
        from: senderId || undefined,
      }),
    });

    const data = await response.json();

    if (data.numRecipients > 0 || data.status === "success") {
      console.log(`[SMS] Sent to ${phone}: success`);
      return { success: true };
    } else {
      const errorMessage =
        data.description || data.errorMessage || data.message || "Unknown error";
      console.error(`[SMS] Failed to send to ${phone}:`, errorMessage);
      return { success: false, error: String(errorMessage) };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "SMS request failed";
    console.error(`[SMS] Error sending to ${phone}:`, msg);
    return { success: false, error: msg };
  }
}
