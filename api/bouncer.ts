import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, part } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Locked in to your remaining 2.5 Flash Lite quota
    // Replace the old model line with this:
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash" });

    const gatekeeperInstructions = `You are an Image Validation Gatekeeper for an automotive B2B inventory system. 
    YOUR ONLY JOB: Verify that the technician captured the requested physical area of the vehicle from the correct angle.

    CRITICAL "GARAGE REALITY" DIRECTIVE: You are evaluating photos taken by mechanics in messy garages with bad lighting, glare, and low-end phone cameras. 
    DO NOT BE A PERFECTIONIST. 
    PASS THE PHOTO even if it is blurry, low quality, has heavy glare, or poor lighting, AS LONG AS the target area is visible from the correct angle.
    ONLY FAIL THE PHOTO IF:
    1. The camera is pointing at completely the wrong part of the car.
    2. The angle is entirely wrong (e.g., straight-on when a side-angle is required).
    3. The image is 100% pitch black or completely washed out by light.

    You are evaluating the following Expected Photo Type: "${part}"

    Evaluate strictly against these angle rules:

    === 0. THE VIN (VEHICLE IDENTIFICATION NUMBER) ===
    * PASS if a 17-digit string or barcode is visible. IGNORE heavy glare, dust, or blur. The extraction model handles that later.

    === 1. INTACT FRONT WINDSHIELD ===
    * Photo A (Sensor Depth): PASS ONLY if taken from a side-angle (peek-behind) showing the bracket touching the glass. FAIL if taken straight-on where the mirror arm blocks the base.
    * Photo B (Heater Grid): PASS if the camera is pointing down at the black edge where wipers rest. 
    * Photo C (Silhouette): PASS if the overall front windshield is in the frame.

    === 2. INTACT LATERAL GLASS ===
    * Photo A (Position Check): PASS if the overall car door/window is visible.
    * Photo B (The "Bug" Stamp): PASS if focused on the glass corner stamp. IGNORE if the text is unreadable due to blur/glare; just verify the stamp is in the frame.

    === 3. INTACT TRUNK / REAR GLASS ===
    * Photo A (Hardware Check): PASS if the rear window/tailgate is visible.
    * Photo B (Technology Grid): PASS if close-up on the glass surface/wires.

    === 4. MISSING / BROKEN GLASS (PROXY PHOTOS) ===
    * Service Sticker: PASS if the white/silver build sticker is in the frame.
    * Headliner Harness: PASS if showing the interior ceiling above the mirror.
    * HUD Dashboard Check: PASS if showing the driver dashboard top.
    * Master Window Switch: PASS if showing the driver door buttons.
    * Wiper Motor Stub Area: PASS if showing the center tailgate metal under the window.

    === REQUIRED OUTPUT ===
    Respond ONLY with a valid JSON object. DO NOT USE LINE BREAKS OR NEWLINES INSIDE YOUR JSON STRINGS:
    {
      "isPerfect": boolean,
      "arabicInstruction": "If isPerfect is true, return '✅'. If false, give a short, polite Arabic instruction (Moroccan Darija style if possible) explaining how to fix the angle or pointing."
    }`;

    // Convert the base64 string back into a format Gemini can read (added webp support just in case)
    const base64Data = image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    // === SMART 503 RETRY LOOP ===
    let rawText = "";
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Send the image AND the strict rules to Gemini
        const result = await model.generateContent([
          gatekeeperInstructions,
          { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
        ]);
        rawText = result.response.text();
        break; // Success! Break out of the loop.
      } catch (error: any) {
        const is503 = error.status === 503 || (error.message && error.message.includes("503"));
        
        if (is503 && attempt < maxRetries) {
          console.warn(`[503 High Demand] Bouncer retrying... Attempt ${attempt} of ${maxRetries}`);
          // Wait 2000 milliseconds (2 seconds) before knocking again
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          // If it is NOT a 503, or we are out of retries, throw the error immediately
          throw error;
        }
      }
    }
    
    // === THE BULLETPROOF JSON CLEANER ===
    // 1. Extract ONLY the JSON block (ignores extra chatty text the AI might add)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI did not return valid JSON structure.");
    }
    
    // 2. Strip all literal line breaks, tabs, and hidden control characters that crash JSON.parse
    const cleanJson = jsonMatch[0].replace(/[\n\r\t]/g, ' ');

    // 3. Parse safely and send to frontend
    return res.status(200).json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error("Gatekeeper Error:", error);
    return res.status(500).json({ error: error.message || "Unknown AI Error" });
  }
}