import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, part } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Locked in to your remaining 2.5 Flash Lite quota
    const model = genAI.getGenerativeModel({ model: "gemini-2-flash-lite" });

    const gatekeeperInstructions = `You are an Image Validation Gatekeeper for an automotive B2B inventory system. 
    YOUR ONLY JOB: Verify that the technician captured the requested physical area of the vehicle.

    CRITICAL "GARAGE REALITY" DIRECTIVE: You are evaluating photos taken by mechanics in messy garages with bad lighting, glare, and low-end phone cameras. 
    DO NOT BE A PERFECTIONIST. 
    PASS THE PHOTO even if it is slightly blurry, low quality, has heavy glare, or poor lighting, AS LONG AS the general target area is visible somewhere in the frame.
    ONLY FAIL THE PHOTO IF:
    1. The camera is pointing at completely the wrong part of the car.
    2. The image is 100% pitch black, completely washed out by light, or entirely unrecognizable.

    You are evaluating the following Expected Photo Type: "${part}"

    Evaluate strictly against these relaxed rules:

    === 0. THE VIN (VEHICLE IDENTIFICATION NUMBER) ===
    * VIN Barcode/Text: PASS if a 17-digit alphanumeric string or a barcode is visible anywhere in the frame. IGNORE heavy glare, reflections from the glass, dust, or minor blur. The extraction model will read it later. FAIL ONLY if the image contains no text/barcode at all.

    === 1. INTACT FRONT WINDSHIELD ===
    * Photo A (Sensor Depth): PASS if the rearview mirror area is in the frame.
    * Photo B (Heater Grid): PASS if the bottom edge where wipers rest is in the frame.
    * Photo C (Silhouette & Tint): PASS if the front windshield shape is generally visible.

    === 2. INTACT LATERAL GLASS ===
    * Photo A (Position Check): PASS if the car door/window is generally visible.
    * Photo B (The "Bug" Stamp): PASS if the glass corner/stamp area is visible, even if the text is hard to read due to blur or glare. (The Pro model will try to read it later).

    === 3. INTACT TRUNK / REAR GLASS ===
    * Photo A (Hardware Check): PASS if the rear window is generally visible.
    * Photo B (Technology Grid): PASS if the glass surface is in the frame.

    === 4. MISSING / BROKEN GLASS (PROXY PHOTOS) ===
    * The Service Sticker: PASS if the white/silver build sticker is in the frame, even if it is slightly blurry.
    * Headliner Harness: PASS if the interior ceiling above the mirror is in the frame.
    * HUD Dashboard Check: PASS if the driver dashboard top is in the frame.
    * Master Window Switch: PASS if the driver door buttons are in the frame.
    * The Door Channel: PASS if the empty window track at the top of the door is in the frame.
    * Wiper Motor Stub Area: PASS if the center tailgate metal under the window is in the frame.
    * C-Pillar Connectors: PASS if the interior trunk side-frame is in the frame.

    === REQUIRED OUTPUT ===
    Respond ONLY with a valid JSON object. DO NOT USE LINE BREAKS OR NEWLINES INSIDE YOUR JSON STRINGS:
    {
      "isPerfect": boolean,
      "arabicInstruction": "If true, return '✅'. If false, give a short, polite Arabic instruction explaining that they are pointing at the wrong part of the car."
    }`;

    // Convert the base64 string back into a format Gemini can read (added webp support just in case)
    const base64Data = image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    // Send the image AND the strict rules to Gemini 2.5 Flash Lite
    const result = await model.generateContent([
      gatekeeperInstructions,
      { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
    ]);

    const rawText = result.response.text();
    
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