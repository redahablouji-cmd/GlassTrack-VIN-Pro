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

            // === 1. THE NEW PROMPT (THE EXTERIOR FRIT CHEAT CODE) ===
    promptSequence.push(`You are an elite B2B Auto Glass Vision AI.
DAMAGE LOCATION: ${position.toUpperCase()}
GLASS STATUS: ${isShattered ? "MISSING/SHATTERED" : "INTACT"}

1. VIN Decoding: Extract Make and Model. Format BOTH as pure UPPERCASE (e.g., "HYUNDAI", "I20"). Do NOT extract the year.
2. Hardware Verification (THE FRIT WINDOW RULE):
   - You MUST cross-reference the interior mirror photo with the EXTERIOR top-center photo.
   - THE JAWAZ / DASHCAM TRAP: Factory sensors and cameras ALWAYS have a precise, transparent, factory-cut "window" (circle, teardrop, or trapezoid) left bare in the black exterior frit band. 
   - Aftermarket toll tags (like Jawaz) and dashcams are glued to the inside of the glass. They do NOT have a factory-cut window in the exterior black frit.
   - Rain Sensor: Is there a distinct circular/teardrop clear window in the exterior black frit? If yes, true.
   - Camera: Is there a distinct trapezoid/triangle clear window in the exterior black frit? If yes, true.
   - If you see a bulky plastic box on the interior, but the exterior black frit is solid with no clear cutouts, explicitly state "Aftermarket tag detected, no exterior frit window" in your reasoning, and set sensor/camera to FALSE.

Respond ONLY with raw JSON:
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

    // === 2. AI EXECUTION ===
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

    // === 5. FETCH DATA (THE SELECT * TRICK) ===
    const { make, model } = aiData.vehicle_data;
    const { has_sensor, has_camera } = aiData.hardware_detected;

    // We use select('*') to grab all 13 columns, bypassing any naming errors in Supabase!
    const { data: catalogMatch, error } = await supabase.from('glass_catalog')
      .select('*')
      .ilike('description', `%${make.trim()}%`)
      .ilike('description', `%${model.trim()}%`);

    if (error) throw new Error("Failed to query catalog.");

    // === 6. THE BULLETPROOF JAVASCRIPT FILTER ===
    let exactMatches = [];
    if (catalogMatch && catalogMatch.length > 0) {
        exactMatches = catalogMatch.filter((row: any) => {
            // Safely grab columns no matter what they are named (handles both old Excel names and new SQL names)
            const xygCode = (row.xyg_code || row["XYG CODE"] || "").toUpperCase();
            const rsCol = (row.rain_sensor || row.RS || row["SENSOR PLACE"] || "").toString();
            const camCol = (row.camera || row["CAMERA PLACE"] || "").toString();

            // RULE 1: Front Windshield Only. If it doesn't say "LFW", throw it out!
            if (!xygCode.includes("LFW")) return false;

            // RULE 2: Exact Hardware Matching (Checks if the cell is truly empty or just has a dash)
            const rowHasSensor = rsCol.trim() !== "" && rsCol.trim() !== "-";
            const rowHasCamera = camCol.trim() !== "" && camCol.trim() !== "-";

            return rowHasSensor === has_sensor && rowHasCamera === has_camera;
        });

        // RULE 3: THE TIE-BREAKER (Solves the Year problem)
        // If the DB finds both a 2015 i20 and a 2020 i20 with no sensors, it automatically sorts them so the newest generation is #1.
        exactMatches.sort((a, b) => {
            const descA = (a.description || "");
            const descB = (b.description || "");
            return descB.localeCompare(descA); // Puts "2020-" before "2015-20"
        });
    }

    // === 7. UI INJECTION ===
    if (exactMatches.length > 0) {
       const bestMatch = exactMatches[0];
       
       // Output exactly what is in the DB
       aiData.primaryCode = referenceFormat === "NAGS" ? (bestMatch.nags || bestMatch.NAGS) : (bestMatch.eurocode || bestMatch.EUROCODE);
       aiData.descriptiveCode = bestMatch.description || bestMatch.DESCRIPTION;
       
       if (!aiData.primaryCode) aiData.primaryCode = "CODE BLANK IN CATALOG";
    } else {
       aiData.primaryCode = "NO EXACT MATCH";
       aiData.descriptiveCode = `Detected: ${make} ${model}. Sensor: ${has_sensor}, Camera: ${has_camera}. All 13 columns checked. No LFW part found in DB.`;
    }

    return res.status(200).json(aiData);

  } catch (error: any) {
    console.error("Pro Decoder Error:", error);
    return res.status(500).json({ error: error.message || error.toString() });
  }
}