import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { vinImage, position, isShattered, referenceFormat, proofImages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro" }); 

    const promptSequence: any[] = [];

    // === THE CHAIN-OF-THOUGHT MASTER PROMPT (FLASH OPTIMIZED) ===
    promptSequence.push(`You are an elite B2B Auto Glass Decoding AI. Your objective is to analyze a vehicle's VIN and physical photos to determine the exact 100% accurate replacement glass codes.

    PRIMARY FORMAT REQUESTED: ${referenceFormat}
    DAMAGE LOCATION: ${position.toUpperCase()}
    GLASS STATUS: ${isShattered ? "MISSING/SHATTERED" : "INTACT"}
    
    CRITICAL HARDWARE VERIFICATION RULES:
    You MUST verify hardware by cross-referencing the interior and exterior photos. Do not assume hardware exists based on interior plastic covers.
    
    1. Camera Verification: Look at the interior mirror bracket. Then, CROSS-REFERENCE the exterior top windshield photo. If the exterior black dotted area (frit) has NO clear geometric cutout (trapezoid/triangle) for a lens, there is NO CAMERA, even if the interior plastic shroud is massive.
    
    2. Rain/Light Sensor Verification: Look closely at the interior mirror bracket photo. Does the black plastic housing connect directly to a circular gel pad or sensor lens glued to the glass? 
       - Rule: If you can clearly see the sensor housing attached to the glass from the inside photo, you MUST mark Sensor = True. Do NOT rely solely on the exterior photo for the rain sensor, as glare/reflections often hide it. (Note: The Camera verification STILL requires the exterior clear cutout check, but the Rain Sensor does not).
    
    3. Heater Verification: Look at the exterior bottom wipers. Are there orange/copper wires embedded in the black glass?
    
    4. Acoustic / Tint Verification: Check the corner glass stamp photo for 'Acoustic' or an ear symbol.

    5. Base Eurocode Grounding: You must rely strictly on the standard European auto glass catalog for the 4-digit base code. If you successfully identify the chassis via the VIN (e.g., SEAT Ibiza V / Arona KJ), you must output the universally accepted Eurocode prefix for that exact chassis (which is 7653). Do not invent or approximate the 4-digit prefix.

    === OUTPUT REQUIREMENT ===
    Respond ONLY with a valid JSON object. Do NOT use line breaks inside JSON strings. 
    You MUST write the "internalVerificationCheck" BEFORE generating the final codes so you can calculate the correct answer.

    {
      "needsMorePhotos": false,
      "missingPhotoReason": "If true, explain what is missing. If false, leave blank.",
      "decodedVIN": "The 17-digit VIN text",
      "internalVerificationCheck": "Write your Chain of Thought here. Example: 'Interior shows sensor housing glued to glass. Exterior frit glare is heavy, but interior confirms sensor. Frit is solid black, no camera cutout. Therefore: Camera=False, Sensor=True, Heater=False.'",
      "primaryCode": "The final ${referenceFormat} code (e.g. 7653AGAMVZ)",
      "descriptiveCode": "Full descriptive text (e.g. 'SEAT Ibiza - Acoustic Glass, Rain Sensor, NO Camera, NO Heater.')"
    }`);
    if (vinImage) {
      promptSequence.push("IMAGE 1: The VIN Barcode/Text.");
      promptSequence.push({ inlineData: { data: vinImage.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, ""), mimeType: "image/jpeg" } });
    }

    let imageCounter = vinImage ? 2 : 1;
    for (const [photoDescription, base64] of Object.entries(proofImages)) {
      promptSequence.push(`IMAGE ${imageCounter}: ${photoDescription}`);
      promptSequence.push({ inlineData: { data: (base64 as string).replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, ""), mimeType: "image/jpeg" } });
      imageCounter++;
    }

    const result = await model.generateContent(promptSequence);
    const rawText = result.response.text();

    // === BULLETPROOF JSON CLEANER ===
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI did not return valid JSON structure.");
    
    const cleanJson = jsonMatch[0].replace(/[\n\r\t]/g, ' ');
    return res.status(200).json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error("Pro Decoder Error:", error);
    return res.status(500).json({ error: error.message || error.toString() });
  }
}