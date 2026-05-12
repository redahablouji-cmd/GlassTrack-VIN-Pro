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

    // === THE VISION EXTRACTOR PROMPT ===
    promptSequence.push(`You are an elite B2B Auto Glass Vision AI. Your only job is to analyze a vehicle's VIN and physical photos to extract the vehicle details and hardware presence.

    DAMAGE LOCATION: ${position.toUpperCase()}
    GLASS STATUS: ${isShattered ? "MISSING/SHATTERED" : "INTACT"}

    1. VIN Decoding:
    Look at the 17-digit VIN. Extract the Make and Model. You MUST extract the exact Year by looking at the 10th digit of the VIN (e.g., P = 2023).

    2. Hardware Verification (Cross-Reference Rules):
    - Camera: Interior mirror bracket MUST be cross-referenced with the exterior top windshield photo. If the exterior black frit has NO clear geometric cutout for a lens, set has_camera to false, regardless of interior plastic covers.
    - Rain Sensor: If the interior mirror bracket photo clearly shows a sensor housing/gel pad glued directly to the glass, set has_sensor to true (ignore exterior reflections).
    - Heater: Look at the exterior bottom wipers. Are there orange wires in the black glass? Set has_heater to true/false.

    3. Garbage/Mismatch Protocol:
    If the photos are not of the requested vehicle part, set "needsMorePhotos" to true and abort extraction.

    === OUTPUT REQUIREMENT ===
    Respond ONLY with a raw, valid JSON object. Do NOT wrap the JSON in markdown code blocks. Do NOT use line breaks inside JSON strings.
    {
      "needsMorePhotos": false,
      "missingPhotoReason": "If true, explain what is missing. If false, leave null.",
      "internalVerificationCheck": "Write your reasoning here. Example: 'VIN 10th digit is P (2023). Interior shows sensor housing. Exterior frit is solid black, no camera cutout. Therefore: Camera=False, Sensor=True.'",
      "vehicle_data": {
        "make": "string",
        "model": "string",
        "year": 2023
      },
      "hardware_detected": {
        "has_camera": false,
        "has_sensor": false,
        "has_heater": false,
        "has_acoustic": false
      }
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