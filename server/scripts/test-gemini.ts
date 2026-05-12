import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const key = process.env.GEMINI_API_KEY;
console.log("Key present:", !!key, "Length:", key?.length);

const ai = new GoogleGenAI({ apiKey: key as string });
try {
  const r = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: 'Reply ONLY with raw JSON: {"ok":true}' }] }],
  });
  console.log("SUCCESS. Response:", r.text);
} catch (e: any) {
  console.error("FAILED:", e.message);
  console.error("Status:", e.status);
  console.error("Details:", e.errorDetails || e.detail);
}
