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

    // === 1. THE NEW PROMPT (UPPERCASE ONLY, NO YEAR) ===
    promptSequence.push(`You are an elite B2B Auto Glass Vision AI.
DAMAGE LOCATION: ${position.toUpperCase()}
GLASS STATUS: ${isShattered ? "MISSING/SHATTERED" : "INTACT"}

1. VIN Decoding: Look at the 17-digit VIN. Extract the Make and Model. You MUST format both as pure UPPERCASE (e.g., "HYUNDAI", "I20"). Do NOT attempt to extract the year.
2. Hardware Verification:
   - Rain Sensor: Look for the gel pad. Set has_sensor to true/false.
   - Camera: Look for the trapezoid lens hole in the frit. Set has_camera to true/false.

Respond ONLY with raw JSON. No markdown formatting.
{
  "needsMorePhotos": false,
  "missingPhotoReason": null,
  "internalVerificationCheck": "Reasoning...",
  "decodedVIN": "17-digit-VIN",
  "vehicle_data": {
    "make": "UPPERCASE_MAKE",
    "model": "UPPERCASE_MODEL"
  },
  "hardware_detected": {
    "has_camera": false,
    "has_sensor": false
  }
}`);

    if (vinImage) {
      promptSequence.push("IMAGE 1: VIN");
      promptSequence.push({ inlineData: { data: vinImage.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, ""), mimeType: "image/jpeg" } });
    }

    let imageCounter = vinImage ? 2 : 1;
    for (const [photoDescription, base64] of Object.entries(proofImages)) {
      promptSequence.push(`IMAGE ${imageCounter}: ${photoDescription}`);
      promptSequence.push({ inlineData: { data: (base64 as string).replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, ""), mimeType: "image/jpeg" } });
      imageCounter++;
    }

    // === 2. AI EXECUTION (Using the stable 150 RPM Model) ===
    let rawText = "";
    let attempt = 1;
    const maxRetries = 3;

    while (attempt <= maxRetries) {
      try {
        const dynamicModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        const result = await dynamicModel.generateContent(promptSequence);
        rawText = result.response.text();
        break;
      } catch (error: any) {
        const is503 = error.status === 503 || (error.message && error.message.includes("503"));
        if (is503 && attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          attempt++;
        } else {
          throw new Error(`System Error: ${error.message || "AI Vision unreachable."}`);
        }
      }
    }

    // === 3. PARSE JSON ===
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI did not return valid JSON.");
    const cleanJson = jsonMatch[0].replace(/[\n\r\t]/g, ' ');
    const aiData = JSON.parse(cleanJson);

    if (aiData.needsMorePhotos) return res.status(200).json(aiData);

    // === 4. CONNECT SUPABASE ===
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase keys.");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // === 5. FETCH DATA (UPPERCASE MATCHING) ===
    const { make, model } = aiData.vehicle_data;
    const { has_sensor, has_camera } = aiData.hardware_detected;

    // We pull the xyg_code so we can filter out door glasses and rear windows!
    const { data: catalogMatch, error } = await supabase.from('glass_catalog')
      .select('xyg_code, eurocode, nags, description, rain_sensor, camera')
      .ilike('description', `%${make}%`)
      .ilike('description', `%${model}%`);

    if (error) throw new Error("Failed to query catalog.");

    // === 6. THE BULLETPROOF LOGIC ===
    let exactMatches = [];
    if (catalogMatch && catalogMatch.length > 0) {
        exactMatches = catalogMatch.filter((row: any) => {
            // RULE 1: Front Windshield Protection
            // XYG uses "LFW" (Laminated Front Windshield). This stops it from matching a rear window.
            const isFrontRequested = position && (position.toLowerCase().includes("front") || position.toLowerCase().includes("windshield"));
            const isFrontPart = row.xyg_code && row.xyg_code.includes("LFW");
            
            if (isFrontRequested && !isFrontPart) return false;

            // RULE 2: Hardware Validation (Safely ignoring empty cells and dashes)
            const rowHasSensor = !!(row.rain_sensor && row.rain_sensor.trim() !== "" && row.rain_sensor.trim() !== "-");
            const rowHasCamera = !!(row.camera && row.camera.trim() !== "" && row.camera.trim() !== "-");

            return rowHasSensor === has_sensor && rowHasCamera === has_camera;
        });
    }

    // === 7. UI INJECTION ===
    if (exactMatches.length > 0) {
       const bestMatch = exactMatches[0];
       
       // UI gets EXACTLY what is in the database (Uppercase Eurocode and Description)
       aiData.primaryCode = referenceFormat === "NAGS" ? bestMatch.nags : bestMatch.eurocode;
       aiData.descriptiveCode = bestMatch.description;
       
       if (!aiData.primaryCode) aiData.primaryCode = "CODE BLANK IN CATALOG";
    } else {
       aiData.primaryCode = "NO EXACT MATCH";
       aiData.descriptiveCode = `Detected: ${make} ${model}. Sensor: ${has_sensor}, Camera: ${has_camera}. Please check catalog manually.`;
    }

    return res.status(200).json(aiData);

  } catch (error: any) {
    console.error("Pro Decoder Error:", error);
    return res.status(500).json({ error: error.message || error.toString() });
  }
}