import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { vinImage, position, isShattered, referenceFormat, proofImages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use the heavy-hitting Pro model for deep B2B logic extraction
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); 

    const promptSequence: any[] = [];

    // === THE MASTER SYSTEM PROMPT ===
    promptSequence.push(`You are an elite B2B Auto Glass Decoding AI. Your objective is to analyze a vehicle's VIN and physical photos to determine the exact 100% accurate replacement glass code.

    TARGET FORMAT REQUESTED: ${referenceFormat}
    DAMAGE LOCATION: ${position.toUpperCase()}
    GLASS STATUS: ${isShattered ? "MISSING/SHATTERED" : "INTACT"}
    
    CRITICAL HARDWARE VERIFICATION RULES:
    You are strictly forbidden from assuming hardware exists based solely on interior plastic shrouds. You MUST verify hardware by cross-referencing the interior and exterior photos.
    
    1. Camera / LDWS Verification:
       - CROSS-REFERENCE: Look at the exterior top windshield photo. Does the black dotted area (frit) have a clear geometric cutout (trapezoid or triangle) for a camera lens to physically see the road?
       - Rule: If there is NO clear lens cutout in the exterior frit, there is NO CAMERA, regardless of how massive the interior plastic shroud is.
    2. Rain/Light Sensor Verification:
       - CROSS-REFERENCE: Look at the exterior frit. Do you see a small circular gel pad or clear window with diodes?
       - Rule: A rain sensor requires a physical gel pad window visible from the outside.
    3. Heated Wiper Verification:
       - Look at the exterior cowl photo. Are there orange/copper wires embedded in the bottom black frit?
    4. Acoustic / Tint Verification:
       - Check the corner glass stamp photo for 'Acoustic' or an ear symbol, and verify the shade band color.

    === OUTPUT REQUIREMENT ===
    Respond ONLY with a valid JSON object in this exact format. Do NOT use line breaks inside JSON strings.
    {
      "needsMorePhotos": boolean, // Set to true ONLY if a critical reflection/glare makes it impossible to verify the required hardware.
      "missingPhotoReason": "If needsMorePhotos is true, explain exactly what new angle is needed. If false, leave blank.",
      "decodedVIN": "The 17-digit VIN (if visible)",
      "requestedCode": "The final deduced ${referenceFormat} code (e.g. Eurocode, NAGS, or descriptive format like 'Hyundai Santa Fe (2013-2018) - Windshield: Acoustic, Auto-Dimming...')",
      "confidence": "High, Medium, or Low",
      "reasoningSummary": "Provide a very high-level summary of your reasoning in a few sentences, omitting intermediate steps. Keep only the most direct hardware verification steps leading to the final answer (e.g. 'Interior shroud present, but exterior frit lacks camera cutout. Camera verified absent. Code generated.')."
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
    
    // Strip hidden formatting to prevent UI crashes
    const cleanJson = jsonMatch[0].replace(/[\n\r\t]/g, ' ');

    return res.status(200).json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error("Pro Decoder Error:", error);
    return res.status(500).json({ error: error.message || error.toString() });
  }
}