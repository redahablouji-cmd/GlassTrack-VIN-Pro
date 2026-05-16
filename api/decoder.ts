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
2. Hardware Verification (THE NO-GUESSING FRIT WINDOW RULE):
   - You MUST cross-reference the interior mirror photo (Photo A) with the EXTERIOR TOP CLOSE-UP photo (Photo C).
   - THE JAWAZ / DASHCAM TRAP: Aftermarket tags are glued to the inside. Ignore them.
   - Rain Sensor: Look at Photo C. Is there a distinct circular/teardrop clear window in the exterior black frit? IN CLOSE-UP PHOTOS: Look for a circular purple/blue silicone gel pad or tiny optical diodes inside this cutout. Set true/false.
   - Camera: Look at Photo C. Is there a distinct trapezoid/triangle clear window? Set true/false.
   - Heated Wiper Grid: Look at Photo B (The Wiper Edge). Do you see distinct orange/brown heater lines in the black band at the bottom? Set true/false.
   - CRITICAL ZERO-ASSUMPTION RULE: If glare completely obscures the black frit in Photo C and you cannot physically verify the cutouts, you MUST output false for the hidden hardware. Do not guess.
   Respond ONLY with raw JSON:
{
  "needsMorePhotos": false,
  "missingPhotoReason": null,
  "internalVerificationCheck": "Reasoning...",
  "vin_10th_digit": "Extract EXACTLY the 10th character from the raw 17-digit VIN in the photo (e.g. 'P', 'R', 'D'). If no VIN is provided, leave this empty.",
  "decodedVIN": "The raw 17-digit string you extracted from the VIN photo, e.g. NLHBN51...",
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

    // === NEW: THE FOOLPROOF VIN YEAR EXTRACTOR ===
    let exactYear = 0;

    // We now look directly at the dedicated 10th digit field the AI gave us
    const tenthDigit = (aiData.vin_10th_digit || "").toString().trim().toUpperCase();

    if (tenthDigit.length > 0) {
        const vinYearMap: Record<string, number> = {
            'Y': 2000, '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005, '6': 2006, '7': 2007, '8': 2008, '9': 2009,
            'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014, 'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
            'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024, 'S': 2025, 'T': 2026, 'V': 2027, 'W': 2028, 'X': 2029
        };
        
        // Grab the very first letter of whatever it extracted to be safe
        exactYear = vinYearMap[tenthDigit.charAt(0)] || 0;
    }

    // THE FAILSAFE: If the VIN photo was blurry, check if the AI got a 4-digit year from somewhere else
    if (exactYear === 0 && aiData.vehicle_data && aiData.vehicle_data.year) {
        const parsedYear = parseInt(aiData.vehicle_data.year.toString().replace(/\D/g, ''));
        if (!isNaN(parsedYear) && parsedYear > 1980) {
            exactYear = parsedYear;
        }
    }
    
    // Inject it so the downstream filters (and the UI) can use it
    if (exactYear > 0) {
        aiData.vehicle_data.year = exactYear.toString();
    }

    // === 4. CONNECT SUPABASE ===
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase keys.");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // === 5. FETCH DATA (SMART ALIAS & SPACE-PROOF FALLBACK) ===
    let { make, model } = aiData.vehicle_data;
    const { has_sensor, has_camera } = aiData.hardware_detected;

    // Clean up the text so there are no accidental spaces at the edges
    make = make.trim().toUpperCase();
    model = model.trim().toUpperCase();

    // THE SPACE-PROOF HACK: Creates a version with zero spaces (e.g., "SANTA FE" -> "SANTAFE")
    const modelNoSpace = model.replace(/\s+/g, '');

    // First attempt: Search exact Make, and check BOTH spaced and unspaced Models
    let { data: catalogMatch, error } = await supabase.from('glass_catalog')
      .select('*')
      .ilike('description', `%${make}%`)
      .or(`description.ilike.%${model}%,description.ilike.%${modelNoSpace}%`);

    if (error) throw new Error("Failed to query catalog on first attempt.");

    // If the first try found NOTHING, check if we need to use an abbreviation (e.g., VOLKSWAGEN -> VW)
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
        
        // If an abbreviation exists, run a second search using the Space-Proof logic!
        if (abbreviation) {
            const { data: fallbackMatch, error: fallbackError } = await supabase.from('glass_catalog')
              .select('*')
              .ilike('description', `%${abbreviation}%`)
              .or(`description.ilike.%${model}%,description.ilike.%${modelNoSpace}%`);
              
            if (fallbackError) throw new Error("Failed to query catalog on fallback attempt.");
            
            // Overwrite our empty results with the newly found abbreviation results
            catalogMatch = fallbackMatch; 
        }
    }

    // === 6. THE STAGE-BASED JAVASCRIPT FILTER ===
    const getCol = (rowObj: any, possibleNames: string[]) => {
        const key = Object.keys(rowObj).find(k => possibleNames.includes(k.trim().toUpperCase()));
        return key ? (rowObj[key] || "").toString().trim() : "";
    };

    // STAGE 1: Filter Front Windshields Only
    let frontWindshields = catalogMatch ? catalogMatch.filter((row: any) => {
        const xygCode = getCol(row, ["XYG CODE", "XYG_CODE"]).toUpperCase();
        return xygCode.includes("LFW");
    }) : [];

    // STAGE 2: The VIN Year Filter (Lock onto the correct generation!)
    let generationMatches = frontWindshields.filter((row: any) => {
        if (exactYear === 0) return true; // Skip if no VIN year decoded
        const desc = getCol(row, ["DESCRIPTION"]).toUpperCase();
        const yearMatch = desc.match(/20(\d{2})-(?:20)?(\d{2})?/);
        if (yearMatch) {
            const startYear = parseInt("20" + yearMatch[1]);
            const endYear = yearMatch[2] ? parseInt("20" + yearMatch[2]) : new Date().getFullYear() + 1;
            // The +/- 1 Year Tolerance
            if (exactYear < (startYear - 1) || exactYear > (endYear + 1)) {
                return false; 
            }
        }
        return true;
    });

    // STAGE 3: The Hardware Filter (The strict match)
    let exactMatches = generationMatches.filter((row: any) => {
        const rsCol = getCol(row, ["RS", "RAIN_SENSOR", "SENSOR PLACE"]);
        const camCol = getCol(row, ["CAMERA", "CAMERA PLACE"]);
        const rowHasSensor = rsCol !== "" && rsCol !== "-";
        const rowHasCamera = camCol !== "" && camCol !== "-";
        return rowHasSensor === has_sensor && rowHasCamera === has_camera;
    });

    // Sort Tie-Breakers (Newest generation first)
    const sortFn = (a: any, b: any) => {
        return getCol(b, ["DESCRIPTION"]).localeCompare(getCol(a, ["DESCRIPTION"]));
    };
    generationMatches.sort(sortFn);
    exactMatches.sort(sortFn);


    // === 7. THE HUMAN-IN-THE-LOOP UI INJECTION ===
    if (exactMatches.length > 0) {
       const bestMatch = exactMatches[0];
       const finalDescription = getCol(bestMatch, ["DESCRIPTION"]) || "UNKNOWN DESCRIPTION";
       
       // THE CROSSOVER DILEMMA DETECTOR 
       if (exactMatches.length > 1) {
           const secondMatch = exactMatches[1];
           const altDescription = getCol(secondMatch, ["DESCRIPTION"]) || "";
           const baseDescFinal = finalDescription.split('/')[0].trim();
           const baseDescAlt = altDescription.split('/')[0].trim();
           
           if (baseDescFinal !== baseDescAlt) {
               aiData.primaryCode = "ACTION REQUIRED";
               
               // THE FIX: Push the question directly into the VEHICLE UI box!
               aiData.vehicle_data.make = `DILEMMA: Is this [${baseDescAlt}] or [${baseDescFinal}]?`;
               aiData.vehicle_data.model = "";
               aiData.vehicle_data.year = "";
               
               return res.status(200).json(aiData); 
           }
       }

       // PROCEED NORMALLY
       const dbEuroKey = getCol(bestMatch, ["EUROCODE"]);
       const dbNagsKey = getCol(bestMatch, ["NAGS"]);
       aiData.primaryCode = (referenceFormat === "NAGS" ? dbNagsKey : dbEuroKey) || "CODE BLANK IN CATALOG";
       aiData.descriptiveCode = finalDescription;
       
       aiData.vehicle_data.make = finalDescription;
       aiData.vehicle_data.model = ""; 

    } else if (generationMatches.length > 0) {
       // HARDWARE MISMATCH FALLBACK
       const baseMatch = generationMatches[0];
       const baseDescription = getCol(baseMatch, ["DESCRIPTION"]) || "UNKNOWN DESCRIPTION";

       aiData.primaryCode = "CHECK CATALOG";
       
       // THE FIX: Tell the mechanic exactly what hardware failed in the VEHICLE UI box!
       aiData.vehicle_data.make = `HARDWARE MISMATCH: AI saw Camera: ${has_camera}, Sensor: ${has_sensor}. Please check manual catalog for ${baseDescription}`; 
       aiData.vehicle_data.model = "";
       aiData.vehicle_data.year = "";

    } else {
       // Completely missing from DB
       aiData.primaryCode = "NO EXACT MATCH";
       aiData.vehicle_data.make = `Vehicle not found in catalog.`;
       aiData.vehicle_data.model = "";
    }

    return res.status(200).json(aiData);