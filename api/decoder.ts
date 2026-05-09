import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { vinImage, position, isShattered, proofImages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Explicitly using the heavy-duty Pro model for final deep reasoning
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro" });

    // 1. Prepare all the images to be sent at once
    const imageParts = [];
    
    // Add the VIN image
    if (vinImage) {
      imageParts.push({
        inlineData: { data: vinImage.replace(/^data:image\/(png|jpeg|jpg);base64,/, ""), mimeType: "image/jpeg" }
      });
    }

    // Add all the specific proof images (mirror bracket, glass stamp, etc.)
    for (const [key, base64] of Object.entries(proofImages)) {
      imageParts.push({
        inlineData: { data: (base64 as string).replace(/^data:image\/(png|jpeg|jpg);base64,/, ""), mimeType: "image/jpeg" }
      });
    }

    // 2. The Master Prompt for the B2B Inventory System
    const prompt = `You are an elite Auto Glass Homologation Expert and VIN Decoder.
    A technician has submitted photos for a glass replacement. 
    Damage Location: ${position}. Shattered/Missing: ${isShattered}.
    
    Analyze all attached photos carefully. Read the VIN barcode. Look at the glass manufacturer stamps for Acoustic vs Tempered markings. Look at the mirror bracket for sensors (LDWS, Rain). Look at the wipers for heating elements.
    
    Extract the required replacement glass codes and respond ONLY with a valid JSON object in this format:
    {
      "decodedVIN": "The 17-digit VIN",
      "eurocode": "Extracted or deduced Eurocode (e.g., 8586AGSGNMVZ1)",
      "nagsCode": "Extracted or deduced NAGS code (e.g., FW02345 GBY)",
      "confidence": "High, Medium, or Low",
      "detectedFeatures": ["Rain Sensor", "Heated Wiper", "Acoustic Glass", etc],
      "analysisNotes": "A short sentence explaining why you chose this code based on the photos."
    }`;

    // 3. Send everything to Gemini 3.1 Pro
    const result = await model.generateContent([prompt, ...imageParts]);
    const cleanJson = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    
    return res.status(200).json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error("Pro Decoder Error:", error);
    return res.status(500).json({ error: error.message });
  }
}