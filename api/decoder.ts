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

    // === NEW: THE VIN YEAR CHEAT CODE ===
    let exactYear = 0;
    if (aiData.decodedVIN && aiData.decodedVIN.length >= 10) {
        // Grab the 10th character
        const tenthDigit = aiData.decodedVIN.charAt(9).toUpperCase();
        
        // The Modern VIN Dictionary (2000 - 2030)
        // Note: VINs never use I, O, Q, U, or Z.
        const vinYearMap: Record<string, number> = {
            'Y': 2000, '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005, '6': 2006, '7': 2007, '8': 2008, '9': 2009,
            'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014, 'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
            'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024, 'S': 2025, 'T': 2026, 'V': 2027, 'W': 2028, 'X': 2029
        };
        
        exactYear = vinYearMap[tenthDigit] || 0;
        
        // Inject the decoded year into the UI so the mechanic sees it!
        if (exactYear > 0) {
            aiData.vehicle_data.year = exactYear.toString();
        }
    }

    // === 4. CONNECT SUPABASE ===
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase keys.");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // === 5. FETCH DATA (SMART ALIAS FALLBACK) ===
    let { make, model } = aiData.vehicle_data;
    const { has_sensor, has_camera } = aiData.hardware_detected;

    // Clean up the text so there are no accidental spaces
    make = make.trim().toUpperCase();
    model = model.trim().toUpperCase();

    // First attempt: Search with the exact Make and Model the AI found
    let { data: catalogMatch, error } = await supabase.from('glass_catalog')
      .select('*')
      .ilike('description', `%${make}%`)
      .ilike('description', `%${model}%`);

    if (error) throw new Error("Failed to query catalog on first attempt.");

    // If the first try found NOTHING, check if we need to use an abbreviation
    if (!catalogMatch || catalogMatch.length === 0) {
        
        // THE B2B BRAND DICTIONARY
        const brandDictionary: Record<string, string> = {
            "VOLKSWAGEN": "VW",
            "MERCEDES-BENZ": "BENZ",
            "MERCEDES BENZ": "BENZ",
            "CHEVROLET": "CHEVY",
            "LAND ROVER": "ROVER"
        };

        const abbreviation = brandDictionary[make];
        
        // If an abbreviation exists for this brand, run a second search!
        if (abbreviation) {
            const { data: fallbackMatch, error: fallbackError } = await supabase.from('glass_catalog')
              .select('*')
              .ilike('description', `%${abbreviation}%`)
              .ilike('description', `%${model}%`);
              
            if (fallbackError) throw new Error("Failed to query catalog on fallback attempt.");
            
            // Overwrite our empty results with the newly found abbreviation results
            catalogMatch = fallbackMatch; 
        }
    }

    // === 6. THE BULLETPROOF JAVASCRIPT FILTER ===
    let exactMatches = [];
    if (catalogMatch && catalogMatch.length > 0) {
        exactMatches = catalogMatch.filter((row: any) => {
            // Safely grab columns no matter what they are named
            const xygCode = (row.xyg_code || row["XYG CODE"] || "").toUpperCase();
            const rsCol = (row.rain_sensor || row.RS || row["SENSOR PLACE"] || "").toString();
            const camCol = (row.camera || row["CAMERA PLACE"] || "").toString();
            const desc = (row.description || row.DESCRIPTION || "").toUpperCase();

            // RULE 1: Front Windshield Only. If it doesn't say "LFW", throw it out!
            if (!xygCode.includes("LFW")) return false;

            // RULE 2: Exact Hardware Matching
            const rowHasSensor = rsCol.trim() !== "" && rsCol.trim() !== "-";
            const rowHasCamera = camCol.trim() !== "" && camCol.trim() !== "-";

            if (rowHasSensor !== has_sensor || rowHasCamera !== has_camera) return false;

            // RULE 3: THE VIN YEAR FILTER (The Mastermind Logic)
            if (exactYear > 0) {
                // Look for generation ranges in the description (e.g., "2017-23" or "2020-")
                const yearMatch = desc.match(/20(\d{2})-(?:20)?(\d{2})?/);
                
                if (yearMatch) {
                    const startYear = parseInt("20" + yearMatch[1]);
                    // If it says "2020-" with no end date, assume it goes up to next year
                    const endYear = yearMatch[2] ? parseInt("20" + yearMatch[2]) : new Date().getFullYear() + 1;
                    
                    // If the decoded VIN year is outside this generation, delete this row!
                    if (exactYear < startYear || exactYear > endYear) {
                        return false; 
                    }
                }
            }

            return true; // It survived all filters!
        });

        // RULE 4: THE TIE-BREAKER (Fallback)
        // If the VIN year wasn't found, or if there's still a tie, sort newest generation first.
        exactMatches.sort((a, b) => {
            const descA = (a.description || a.DESCRIPTION || "");
            const descB = (b.description || b.DESCRIPTION || "");
            return descB.localeCompare(descA); // Puts "2020-" before "2015-20"
        });
    }

    // === 7. THE BULLETPROOF UI INJECTION ===
    if (exactMatches.length > 0) {
       const bestMatch = exactMatches[0];
       
       // Bulletproof Excel Column Finder: Ignores invisible spaces in your Supabase headers!
       const dbDescKey = Object.keys(bestMatch).find(k => k.trim().toUpperCase() === 'DESCRIPTION');
       const dbEuroKey = Object.keys(bestMatch).find(k => k.trim().toUpperCase() === 'EUROCODE');
       const dbNagsKey = Object.keys(bestMatch).find(k => k.trim().toUpperCase() === 'NAGS');

       const finalDescription = dbDescKey ? bestMatch[dbDescKey] : "UNKNOWN DESCRIPTION";
       
       let finalCode;
       if (referenceFormat === "NAGS") {
           finalCode = dbNagsKey ? bestMatch[dbNagsKey] : null;
       } else {
           finalCode = dbEuroKey ? bestMatch[dbEuroKey] : null;
       }
       
       aiData.primaryCode = finalCode || "CODE BLANK IN CATALOG";
       aiData.descriptiveCode = finalDescription;
       
       // THE HACK: Overwrite the AI's generic Make/Model with the exact Database Description
       // This forces your UI to display "VW TIGUAN SUV 2017-23" instead of "VOLKSWAGEN TIGUAN"
       aiData.vehicle_data.make = finalDescription;
       aiData.vehicle_data.model = ""; 
       aiData.vehicle_data.year = "";

    } else if (catalogMatch && catalogMatch.length > 0) {
       // Fallback: It found the car brand/model in the catalog, but the camera/sensor didn't match perfectly.
       const baseMatch = catalogMatch[0];
       const dbDescKey = Object.keys(baseMatch).find(k => k.trim().toUpperCase() === 'DESCRIPTION');
       const baseDescription = dbDescKey ? baseMatch[dbDescKey] : "UNKNOWN DESCRIPTION";

       aiData.primaryCode = "NO EXACT MATCH";
       aiData.descriptiveCode = "Hardware mismatch. Check manual catalog.";

       // Still push the official catalog description to the UI so the mechanic has a starting point!
       aiData.vehicle_data.make = baseDescription;
       aiData.vehicle_data.model = "";
       aiData.vehicle_data.year = "";

    } else {
       // The car is completely missing from the database
       aiData.primaryCode = "NO EXACT MATCH";
       aiData.descriptiveCode = `Not found in catalog.`;
    }

    // Send the final manipulated payload to the React UI
    return res.status(200).json(aiData);

  } catch (error: any) {
    console.error("Pro Decoder Error:", error);
    return res.status(500).json({ error: error.message || error.toString() });
  }
}