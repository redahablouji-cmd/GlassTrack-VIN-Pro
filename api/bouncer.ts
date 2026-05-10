import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, part } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // We strictly use 2.5 Flash here because it is the fastest model for image validation
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // === THIS IS THE "PROMPT" HARDCODED INTO YOUR APP ===
    const gatekeeperInstructions = `You are a strict Image Validation Gatekeeper for an automotive B2B inventory system. 
    YOUR ONLY JOB: Verify that the technician captured the requested physical area of the vehicle from the correct angle, and that the image is in focus.

    CRITICAL DIRECTIVE: DO NOT evaluate the car parts themselves. DO NOT look for specific features (e.g., do not look for wires, rain sensors, HUD holes, or wiper motors). Your only job is to confirm the required physical ZONE is visible. If the requested area is clearly visible, properly framed, and in focus, the photo PASSES—even if that area is completely empty, bare, or devoid of specific hardware.

    You are evaluating the following Expected Photo Type: "${part}"

    Evaluate the image strictly against these rules:

    === 1. INTACT FRONT WINDSHIELD ===
    * Photo A (Sensor Depth): PASS if the side profile of the rearview mirror mount is visible. FAIL if straight-on or blurry.
    * Photo B (Heater Grid): PASS if the black bottom edge where wipers rest is in focus. FAIL if glare ruins it or zoomed out too far.
    * Photo C (Silhouette & Tint): PASS if the entire front windshield is visible straight-on. FAIL if corners are cut off.

    === 2. INTACT LATERAL GLASS ===
    * Photo A (Position Check): PASS if the entire car door and window are fully visible straight-on. FAIL if distorted angle.
    * Photo B (The "Bug" Stamp): PASS if text/logos on the glass are clear and in focus. FAIL if unreadable.

    === 3. INTACT TRUNK / REAR GLASS ===
    * Photo A (Hardware Check): PASS if the entire rear window is visible straight-on. FAIL if corners cut off.
    * Photo B (Technology Grid): PASS if the glass surface is in focus. FAIL if focused on a reflection instead.

    === 4. MISSING / BROKEN GLASS (PROXY PHOTOS) ===
    * The Service Sticker: PASS if the white/silver build sticker text is readable. FAIL if blurry.
    * Headliner Harness: PASS if the interior roof liner above the rearview mirror is in focus. FAIL if pointed down.
    * HUD Dashboard Check: PASS if flat view across the driver dashboard top. FAIL if pointed at steering wheel.
    * Master Window Switch: PASS if driver door buttons are in clear macro focus. FAIL if taken from afar.
    * The Door Channel: PASS if the empty rubber window track is in focus. FAIL if track is in dark shadows.
    * Wiper Motor Stub Area: PASS if center tailgate metal (under window) is in focus. FAIL if pointed at bumper.
    * C-Pillar Connectors: PASS if interior trunk side-frame near hinges is visible. FAIL if pointed at trunk floor.

    === REQUIRED OUTPUT ===
    Respond ONLY with a valid JSON object:
    {
      "isPerfect": boolean,
      "arabicInstruction": "If true, return '✅'. If false, give a short, specific Arabic instruction to the technician on how to fix the angle, focus, or lighting based on your failure criteria."
    }`;

    // Convert the base64 string back into a format Gemini can read
    const base64Data = image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    // Send the image AND the strict rules to Gemini 2.5 Flash
    const result = await model.generateContent([
      gatekeeperInstructions,
      { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
    ]);

    // Clean up the response and send it back to your HomeScreen
    const cleanJson = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    return res.status(200).json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error("Gatekeeper Error:", error);
    return res.status(500).json({ error: error.message || "Unknown AI Error" });
  }
}