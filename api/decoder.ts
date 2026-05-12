import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { vinImage, position, isShattered, referenceFormat, proofImages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); 

    const promptSequence: any[] = [];

    // === THE PRO-LEVEL DECODER PROMPT (V2 - ACCESSORY FILTERED) ===
promptSequence.push(`You are an elite B2B Auto Glass Decoding AI. Your objective is to analyze a vehicle's VIN and physical photos to determine the exact 100% accurate replacement glass codes.

PRIMARY FORMAT REQUESTED: ${referenceFormat}
DAMAGE LOCATION: ${position.toUpperCase()}
GLASS STATUS: ${isShattered ? "MISSING/SHATTERED" : "INTACT"}

CRITICAL HARDWARE VERIFICATION RULES:
You MUST verify hardware by cross-referencing the interior and exterior photos. Do not assume hardware exists based on interior plastic covers or stuck-on items.

1. Camera Verification: Look at the interior mirror bracket. Then, CROSS-REFERENCE the exterior top windshield photo. If the exterior black dotted area (frit) has NO clear geometric cutout (trapezoid/triangle) for a lens, there is NO CAMERA, even if the interior plastic shroud is massive.

2. Rain/Light Sensor Verification (Accessory Filtered): 
   - Look for a circular or teardrop-shaped gel pad integrated into the mirror bracket housing.
   - EXCLUSION RULE: Do NOT confuse automotive sensors with aftermarket accessories. Aftermarket toll tags (e.g., Jawaz, Salik, EZ-Pass, Dashcams) are typically rectangular white, beige, or black plastic boxes stuck to the glass surface. 
   - If the device is a rectangular box stuck NEXT to the mirror with visible brand markings or barcodes, it is an accessory. Set Sensor = False.

3. Heater Verification: Look at the exterior bottom wipers. Are there orange/copper wires embedded in the black glass?

4. Missing/Shattered Glass Protocol: If the GLASS STATUS is "MISSING/SHATTERED", ignore the frit/glass rules above. Instead, verify hardware by looking for exposed wire harnesses hanging from the headliner or dashboard.

5. Code Generation (Pro-Level): Use the 17-digit VIN to identify the Make, Model, and 10th-digit Year. Generate the correct 4-digit base code and exact suffix grammar. 
   - Base grammar: A=Windshield, G=Green. 
   - Hardware grammar: Use 'C' if it has a Camera. Use 'M' if it has a Sensor but NO Camera. 
   - THE BARE WINDSHIELD RULE: If the car has NO Camera and NO Sensor, you MUST use 'S' (Standard) in the hardware position. (Example: 4193AGSVZ).
   - End with 'VZ' for VIN Window/Encapsulated.
. Strict Internal Consistency: Your final "descriptiveCode" MUST exactly match your "primaryCode". 
   - Model Match: 4-digit base code must match the Model name (e.g., 7653 = Ibiza/Arona).
   - Hardware Match: If your code uses 'M' (e.g., AGMVZ), description must say "Rain Sensor, NO Camera". If your code uses 'S' (e.g., AGSVZ), description MUST explicitly say "NO Camera, NO Rain Sensor". Your text is a literal translation of your code.

=== OUTPUT REQUIREMENT ===
Respond ONLY with a raw, valid JSON object. No markdown code blocks (no \`\`\`json). No line breaks in strings. 
You MUST write the "internalVerificationCheck" BEFORE generating the final codes.

{
  "needsMorePhotos": false,
  "missingPhotoReason": "If true, explain what is missing. If false, leave null.",
  "decodedVIN": "The 17-digit VIN text",
  "internalVerificationCheck": "Write your reasoning here. Example: 'Interior shows a Jawaz toll tag, not a sensor. Exterior frit has no camera cutout. Therefore Camera=False, Sensor=False. Applying Bare Windshield Rule (S).'",
  "primaryCode": "The final ${referenceFormat} code",
  "descriptiveCode": "Full descriptive text"
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

    // === SMART FALLBACK & RETRY LOOP ===
    let rawText = "";
    const maxRetries = 3;
    
    // Start with your preferred genius model
    let currentModelName = "gemini-3.1-pro-preview"; 

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Initialize the model dynamically on each try
        const dynamicModel = genAI.getGenerativeModel({ model: currentModelName });
        
        const result = await dynamicModel.generateContent(promptSequence);
        rawText = result.response.text();
        break; // Success! Break out of the loop.
        
      } catch (error: any) {
        const is503 = error.status === 503 || (error.message && error.message.includes("503"));
        
        if (is503 && attempt < maxRetries) {
          console.warn(`[503 High Demand] Decoder failed on ${currentModelName}. Attempt ${attempt} of ${maxRetries}`);
          
          // THE FALLBACK: If 3.1 Pro fails twice, switch to the hyper-stable 2.5 Pro for the final rescue attempt
          if (attempt === 2) {
             currentModelName = "gemini-2.5-pro";
             console.warn("Falling back to gemini-2.5-pro to ensure client gets a response...");
          }
          
          // Wait 3 seconds to let the server breathe
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
          // If it is NOT a 503, or we are completely out of retries, throw the error
          throw error;
        }
      }
    }

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