import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { vinImage, position, isShattered, referenceFormat, proofImages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const promptSequence: any[] = [];

    // === 1. THE NEW VISION EXTRACTOR PROMPT ===
    promptSequence.push(`You are an elite B2B Auto Glass Vision AI. Your only job is to analyze a vehicle's VIN and physical photos to extract the vehicle details and hardware presence.

DAMAGE LOCATION: ${position.toUpperCase()}
GLASS STATUS: ${isShattered ? "MISSING/SHATTERED" : "INTACT"}

1. VIN Decoding:
Look at the 17-digit VIN. Extract the Make and Model. You MUST extract the exact Year by looking at the 10th digit of the VIN.

2. Hardware Verification (Cross-Reference Rules):
- Camera: Interior mirror bracket MUST be cross-referenced with the exterior top windshield photo. If the exterior black frit has NO clear geometric cutout for a lens, set has_camera to false, regardless of interior plastic covers.
- Rain/Light Sensor: If the interior mirror bracket photo clearly shows a circular or teardrop-shaped gel pad glued directly to the glass, set has_sensor to true. IGNORE aftermarket accessories like Jawaz tags or dashcams.

3. Garbage/Mismatch Protocol:
If the photos are not of the requested vehicle part, set "needsMorePhotos" to true and abort extraction.

=== OUTPUT REQUIREMENT ===
Respond ONLY with a raw, valid JSON object. Do NOT wrap the JSON in markdown code blocks. Do NOT use line breaks inside JSON strings.
{
  "needsMorePhotos": false,
  "missingPhotoReason": "If true, explain what is missing. If false, leave null.",
  "internalVerificationCheck": "Write your reasoning here.",
  "decodedVIN": "The 17-digit VIN text",
  "vehicle_data": {
    "make": "string",
    "model": "string",
    "year": 2023
  },
  "hardware_detected": {
    "has_camera": false,
    "has_sensor": false
  }
}`);

    // Append Images
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

        // === 2. FAST AI EXECUTION (NO MORE 5-MINUTE HANGS) ===
    let rawText = "";
    
    try {
      // Pointing directly to Google's official, stable production model
      // Replace the old model line with this:
const dynamicModel = genAI.getGenerativeModel({ model: "gemini-3.1-pro" });
      
      // Execute the vision analysis
      const result = await dynamicModel.generateContent(promptSequence);
      rawText = result.response.text();
      
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      // We fail fast so the mechanic isn't stuck waiting 5 minutes.
      throw new Error("The AI Vision service is currently overloaded or the photos are too large. Please try again.");
    }

    // === 3. PARSE THE AI VISION JSON ===
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI did not return valid JSON structure.");
    
    const cleanJson = jsonMatch[0].replace(/[\n\r\t]/g, ' ');
    const aiData = JSON.parse(cleanJson);

    // Stop here if AI needs better photos
    if (aiData.needsMorePhotos) {
        return res.status(200).json(aiData);
    }

    // === 4. CONNECT TO SUPABASE ===
    // Using your VITE_ keys to connect to your central platform database
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration keys.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // === 5. BUILD THE SMART DATABASE QUERY ===
    const { make, model } = aiData.vehicle_data;
    const { has_sensor, has_camera } = aiData.hardware_detected;

    // Search for Make and Model in the description
    let query = supabase.from('glass_catalog')
      .select('eurocode, nags, description')
      .ilike('description', `%${make}%`)
      .ilike('description', `%${model}%`);

    // Hardware Filters (Matches your new Supabase columns)
    if (has_sensor) {
       query = query.not('rain_sensor', 'is', null);
    } else {
       query = query.is('rain_sensor', null);
    }

    if (has_camera) {
       query = query.not('camera', 'is', null);
    } else {
       query = query.is('camera', null);
    }

    // Execute the query
    const { data: catalogMatch, error } = await query;

    if (error) {
       console.error("Supabase Error:", error);
       throw new Error("Failed to query glass catalog.");
    }

    // === 6. INJECT RESULTS FOR THE UI ===
    if (catalogMatch && catalogMatch.length > 0) {
       // We take the best match from the XYG catalog
       const bestMatch = catalogMatch[0];
       
       // Output Eurocode or NAGS based on UI dropdown
       aiData.primaryCode = referenceFormat === "NAGS" ? bestMatch.nags : bestMatch.eurocode;
       aiData.descriptiveCode = bestMatch.description;
       
       if (!aiData.primaryCode) aiData.primaryCode = "CODE BLANK IN CATALOG";

    } else {
       // Vehicle features were extracted, but XYG catalog doesn't have that exact combo
       aiData.primaryCode = "NO EXACT MATCH";
       aiData.descriptiveCode = `Detected: ${make} ${model}. Sensor: ${has_sensor}, Camera: ${has_camera}. Please check catalog manually.`;
    }

    // Send the final bulletproof payload to the React UI
    return res.status(200).json(aiData);

      } catch (error: any) {
      console.error("Gemini API Error:", error);
      // Let's pass the EXACT Google error straight to your phone screen
      throw new Error(`Google API Error: ${error.message || "Unknown AI failure"}`);
    }
}