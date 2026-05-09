import { GoogleGenerativeAI } from '@google/generative-ai';

// --- THE FORENSIC RULEBOOK ---
// This teaches the AI exactly what it is looking at and why.
const FORENSIC_GUIDES: Record<string, string> = {
  windshield_intact: `
    - Interior Mirror Bracket: Look at the depth behind the plastic housing. Identify hidden Lane Departure Warning (LDWS) cameras or Rain Sensors.
    - Bottom Cowl/Wipers: Look at the black frit edge where wipers rest. Search for embedded orange/copper wires indicating Heated Wiper Park (Cold Weather Package).
    - Full Exterior View: Map the top shade band color and the exact curvature of the upper sensor window.`,
  windshield_shattered: `
    - B-Pillar Sticker: Read the exact PR-Codes (build sheet codes) to determine trim level and hardware packages.
    - Dashboard Top: Look for a physical square hole indicating a Head-Up Display (HUD) projector.
    - Dangling Roof Wires: Count the disconnected electronic wire harness plugs (e.g., 3 plugs = Rain Sensor, Camera, Auto-Dim Mirror) to deduce missing glass features.`,
  rear_glass_intact: `
    - Full Center Rear: Confirm body shape (Hatchback vs Sedan). Look for a physical rear wiper motor hole and vertical defroster grid lines.
    - Technical Corner Stamp: Read the light transmittance percentage (Privacy Tint) and check for embedded microscopic AM/FM/GPS radio antennas.`,
  rear_glass_shattered: `
    - B-Pillar Sticker: Read the exact PR-Codes (build sheet codes) to determine trim level.
    - Empty Hatch/Trunk Frame: Assess the shape to determine vehicle body style and original glass mounting requirements.`,
  side_glass_intact: `
    - Full Door/Window: Confirm exact door placement (Front/Rear, Left/Right). Check if it requires pre-attached rubber encapsulation molding.
    - The Bug / Corner Stamp: THIS IS CRITICAL. Read the manufacturer text. Determine if the glass is "Laminated/Acoustic" (luxury noise reduction) OR "Tempered" (standard).`,
  side_glass_shattered: `
    - B-Pillar Sticker: Read the exact PR-Codes (build sheet codes) to determine trim level.
    - Empty Door Frame: Assess the frame to confirm door location and encapsulation needs.`
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { vinImage, position, isShattered, proofImages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Using 3.1 Pro for heavy-duty forensic analysis
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro" });

    const imageParts = [];
    
    // 1. Attach VIN Photo
    if (vinImage) {
      imageParts.push({
        inlineData: { data: vinImage.replace(/^data:image\/(png|jpeg|jpg);base64,/, ""), mimeType: "image/jpeg" }
      });
    }

    // 2. Attach All Proof Photos
    for (const [key, base64] of Object.entries(proofImages)) {
      imageParts.push({
        inlineData: { data: (base64 as string).replace(/^data:image\/(png|jpeg|jpg);base64,/, ""), mimeType: "image/jpeg" }
      });
    }

    // Determine which rulebook to use
    const condition = isShattered ? 'shattered' : 'intact';
    const activeGuide = FORENSIC_GUIDES[`${position}_${condition}`] || "Analyze the glass features carefully.";

    // 3. The Master B2B Decoder Prompt
    const prompt = `You are an elite Auto Glass Homologation Expert and VIN Decoder.
    A technician has submitted photos for a B2B glass replacement order.
    
    DAMAGE LOCATION: ${position.toUpperCase()}
    GLASS SHATTERED/MISSING: ${isShattered ? "YES (Using alternative hardware forensic protocol)" : "NO (Glass is intact)"}
    
    === YOUR FORENSIC INSTRUCTIONS ===
    Apply the following specific checks based on the uploaded photos:
    ${activeGuide}
    
    === REQUIRED OUTPUT ===
    Extract the required replacement glass codes and respond ONLY with a valid JSON object in this exact format (no markdown tags):
    {
      "decodedVIN": "The 17-digit VIN from the barcode scan",
      "eurocode": "Extracted or deduced Eurocode (e.g., 8586AGSGNMVZ1)",
      "nagsCode": "Extracted or deduced NAGS code (e.g., FW02345 GBY)",
      "confidence": "High, Medium, or Low",
      "detectedFeatures": ["List", "of", "detected", "features", "based", "on", "your", "forensic", "checks"],
      "analysisNotes": "A precise, technical explanation of how you deduced these codes from the specific photos."
    }`;

    // 4. Send to Gemini 3.1 Pro
    const result = await model.generateContent([prompt, ...imageParts]);
    const cleanJson = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    
    return res.status(200).json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error("Pro Decoder Error:", error);
    return res.status(500).json({ error: error.message });
  }
}