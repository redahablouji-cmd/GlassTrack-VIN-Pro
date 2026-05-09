import { GoogleGenerativeAI } from '@google/generative-ai';

// --- THE FORENSIC RULEBOOK (LOCKED IN) ---
const FORENSIC_GUIDES: Record<string, string> = {
  windshield_intact: `
    1. SENSOR DEPTH (45° Mirror Side-View): Check the thickness behind the rearview mirror. Identify if a Rain Sensor or LDWS Camera hardware profile is physically present.
    2. HEATER GRID (Cowl-View): Look at the black frit area where the wipers rest. If you see thin orange/copper wires, it requires a Heated Wiper Park (Eurocode 'H'). If only black glass, it is standard (Eurocode 'A').
    3. SILHOUETTE & TINT (Full Exterior): Confirm the Shade Band color (Blue, Green, or Gray) and check the dashboard line for a Head-Up Display (HUD) projection area.`,

  windshield_shattered: `
    1. HEADLINER HARNESS: Look above the rearview mirror. A dangling 10-pin green connector = Rain/Light sensor. A large rectangular LVDS cable = LDWS Camera.
    2. HUD WELL: Look for a deep rectangular hole or "sink" on the driver-side dashboard top. If present, the car requires a HUD windshield.
    3. THE UNIVERSAL KEY (B-Pillar/Service Sticker): Read the PR-Codes/Trim Codes (e.g., VAG group codes like 4GF = heat-insulating glass) to confirm factory build specifications.`,

  lateral_glass_intact: `
    1. POSITION CHECK: Confirm if the door is Front/Rear or Left/Right. Check if the glass has plastic/rubber encapsulation bonded to the edge.
    2. THE BUG / CORNER STAMP (CRITICAL): Read the manufacturer text. You MUST prove if the glass is 'Tempered' (single pane) or 'Laminated/Acoustic' (two panes, higher price).`,

  lateral_glass_shattered: `
    1. MASTER WINDOW SWITCH: Look at the driver armrest buttons. If they say "Auto" or have an "A", it is a high-trim car likely equipped with Acoustic/Laminated glass. Basic trims use standard tempered.
    2. DOOR CHANNEL: Look at the empty rubber U-channel groove width. Laminated (Acoustic) glass requires a thicker channel than Tempered glass.
    3. THE UNIVERSAL KEY (B-Pillar/Service Sticker): Read the PR-Codes/Trim Codes (e.g., 4KC) to confirm factory side-glass specifications.`,

  rear_glass_intact: `
    1. HARDWARE CHECK: Confirm body shape (Hatchback vs Sedan). Detect if there is a Rear Wiper Motor Hole in the glass.
    2. TECHNOLOGY GRID (Macro): Differentiate between a simple Heated Grid and a Heated Grid + Integrated Antenna. Vertical lines alongside horizontal ones = Antenna.`,

  rear_glass_shattered: `
    1. WIPER MOTOR STUB: Look at the tailgate center. If there is a metal motor spindle sticking out, the glass MUST have a hole drilled in it. No motor = solid glass.
    2. C-PILLAR CONNECTORS: Look at the metal tabs/wires hanging near the trunk hinges. Count the wires to confirm Heated Grid vs Heated Grid + Antenna.
    3. THE UNIVERSAL KEY (B-Pillar/Service Sticker): Read the PR-Codes/Trim Codes to determine exact factory rear glass specs.`
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { vinImage, position, isShattered, proofImages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Using 3.1 Pro for the final, deep-reasoning forensic extraction
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro" });

    const imageParts = [];
    
    if (vinImage) {
      imageParts.push({
        inlineData: { data: vinImage.replace(/^data:image\/(png|jpeg|jpg);base64,/, ""), mimeType: "image/jpeg" }
      });
    }

    for (const [key, base64] of Object.entries(proofImages)) {
      imageParts.push({
        inlineData: { data: (base64 as string).replace(/^data:image\/(png|jpeg|jpg);base64,/, ""), mimeType: "image/jpeg" }
      });
    }

    // Map the UI state to the correct Forensic Guide
    const condition = isShattered ? 'shattered' : 'intact';
    // Fallback logic just in case the position string varies
    const activeGuide = FORENSIC_GUIDES[`${position.toLowerCase().replace(' ', '_')}_${condition}`] || 
                        FORENSIC_GUIDES[`lateral_glass_${condition}`];

    const prompt = `You are an elite Auto Glass Homologation Expert and VIN Decoder.
    A technician has submitted photos for a B2B glass replacement order.
    
    DAMAGE LOCATION: ${position.toUpperCase()}
    GLASS SHATTERED/MISSING: ${isShattered ? "YES (Using missing-glass forensic protocol)" : "NO (Glass is intact)"}
    
    === YOUR FORENSIC INSTRUCTIONS ===
    Apply the following specific checks based on the uploaded photos. You MUST execute these rules:
    ${activeGuide}
    
    === REQUIRED OUTPUT ===
    Extract the required replacement glass codes based strictly on your forensic findings. 
    Respond ONLY with a valid JSON object in this exact format (no markdown tags):
    {
      "decodedVIN": "The 17-digit VIN from the barcode scan (if provided)",
      "eurocode": "Extracted or deduced Eurocode based on your forensic checks",
      "nagsCode": "Extracted or deduced NAGS code based on your forensic checks",
      "confidence": "High, Medium, or Low",
      "detectedFeatures": ["List", "of", "detected", "features", "like", "Acoustic Glass", "LDWS Camera", "Heated Wiper"],
      "analysisNotes": "A highly technical explanation of exactly what you saw in the photos that proved these features exist. Reference the PR-Codes, wires, or stamps you identified."
    }`;

    const result = await model.generateContent([prompt, ...imageParts]);
    const cleanJson = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    
    return res.status(200).json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error("Pro Decoder Error:", error);
    return res.status(500).json({ error: error.message || error.toString() });
  }
}