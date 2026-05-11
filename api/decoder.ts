import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { vinImage, position, isShattered, referenceFormat, proofImages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Using 3.1 Flash Lite for testing as you have the 500/day quota
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" }); 

    const promptSequence: any[] = [];

    // === THE MASTER SYSTEM PROMPT ===
    promptSequence.push(`You are an elite B2B Auto Glass Decoding AI. Your objective is to analyze a vehicle's VIN and physical photos to determine the exact 100% accurate replacement glass codes.

    PRIMARY FORMAT REQUESTED: ${referenceFormat}
    DAMAGE LOCATION: ${position.toUpperCase()}
    GLASS STATUS: ${isShattered ? "MISSING/SHATTERED" : "INTACT"}
    
    CRITICAL HARDWARE VERIFICATION RULES:
    You are strictly forbidden from assuming hardware exists based solely on interior plastic shrouds. You MUST verify hardware by cross-referencing the interior and exterior photos.
    
    1. Camera / LDWS Verification:
       - CROSS-REFERENCE: Look at the exterior top windshield photo. Does the black dotted area (frit) have a clear geometric cutout (trapezoid or triangle) for a camera lens to physically see the road?
       - Rule: If there is NO clear lens cutout in the exterior frit, there is NO CAMERA, regardless of how massive the interior plastic shroud is.
    2. Rain/Light Sensor Verification:
       - CROSS-REFERENCE: Look at the exterior frit. Do you see a small circular gel pad or clear window with diodes?
    3. Heated Wiper Verification:
       - Look at the exterior cowl photo. Are there orange/copper wires embedded in the bottom black frit?
    4. Acoustic / Tint Verification:
       - Check the corner glass stamp photo for 'Acoustic' or an ear symbol.

    === OUTPUT REQUIREMENT ===
    Respond ONLY with a valid JSON object using exactly these keys. Do NOT use line breaks inside JSON strings.
    {
      "needsMorePhotos": false,
      "missingPhotoReason": "If needsMorePhotos is true, explain what specific angle is missing. Otherwise leave empty.",
      "decodedVIN": "The 17-digit VIN text",
      "primaryCode": "The deduced ${referenceFormat} code (e.g. Eurocode or NAGS)",
      "descriptiveCode": "The full descriptive text (e.g. 'Hyundai Santa Fe (2013-2018) - Windshield: Acoustic Glass, Solar/Tinted. No LDWS, No Rain Sensor.')",
      "confidence": "High, Medium, or Low",
      "reasoningSummary": "One short sentence explaining your hardware findings (e.g. 'Interior shroud present, but exterior frit lacks camera cutout. Camera absent.')."
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