import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, part } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // We strictly use 2.5 Flash here because it is the fastest model for image validation
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    // === THE "GARAGE REALITY" GATEKEEPER PROMPT ===
    const gatekeeperInstructions = `You are an Image Validation Gatekeeper for an automotive B2B inventory system. 
    YOUR ONLY JOB: Verify that the technician captured the requested physical area of the vehicle.

    CRITICAL "GARAGE REALITY" DIRECTIVE: You are evaluating photos taken by mechanics in messy garages with bad lighting, glare, and low-end phone cameras. 
    DO NOT BE A PERFECTIONIST. 
    PASS THE PHOTO even if it is slightly blurry, low quality, has heavy glare, or poor lighting, AS LONG AS the general target area is visible somewhere in the frame.
    ONLY FAIL THE PHOTO IF:
    1. The camera is pointing at completely the wrong part of the car (e.g., asked for the mirror, but pointing at a tire).
    2. The image is 100% pitch black, completely washed out by light, or entirely unrecognizable.
    
    CRITICAL DIRECTIVE 2: DO NOT look for specific hardware features (wires, rain sensors, HUD holes). Just confirm the physical ZONE is in the frame.

    You are evaluating the following Expected Photo Type: "${part}"

    Evaluate strictly against these relaxed rules:

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
    Respond ONLY with a valid JSON object:
    {
      "isPerfect": boolean,
      "arabicInstruction": "If true, return '✅'. If false, give a short, polite Arabic instruction explaining that they are pointing at the wrong part of the car."
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