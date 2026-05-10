import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { vinImage, position, isShattered, proofImages } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro" });

    // This array will hold alternating Text and Images (Interleaved Prompting)
    const promptSequence: any[] = [];

    // 1. Set the Master Instruction
    promptSequence.push(`You are an elite Auto Glass Homologation Expert and VIN Decoder.
    A technician has submitted photos for a B2B glass replacement order.
    
    DAMAGE LOCATION: ${position.toUpperCase()}
    GLASS SHATTERED/MISSING: ${isShattered ? "YES" : "NO"}
    
    I will now provide the specific photos taken by the technician. 
    Preceding each photo is the exact description of what the photo is, and what you MUST look for in it.
    Analyze each photo according to its attached description.`);

    // 2. Attach the VIN Image (if it exists)
    if (vinImage) {
      promptSequence.push("IMAGE 1: The VIN Barcode. Please read the 17-digit VIN.");
      promptSequence.push({
        inlineData: { data: vinImage.replace(/^data:image\/(png|jpeg|jpg);base64,/, ""), mimeType: "image/jpeg" }
      });
    }

    // 3. Attach Proof Images WITH their specific descriptions
    // This loops through the object you sent from the frontend
    let imageCounter = vinImage ? 2 : 1;
    for (const [photoDescription, base64] of Object.entries(proofImages)) {
      // First, push the text describing the image
      promptSequence.push(`IMAGE ${imageCounter}: ${photoDescription}`);
      
      // Next, push the actual image right after the text
      promptSequence.push({
        inlineData: { data: (base64 as string).replace(/^data:image\/(png|jpeg|jpg);base64,/, ""), mimeType: "image/jpeg" }
      });
      imageCounter++;
    }

    // 4. Set the Required Output Format
    promptSequence.push(`
    === REQUIRED OUTPUT ===
    Based strictly on the specific forensic checks you just performed on the labeled photos above, extract the required replacement glass codes.
    
    Respond ONLY with a valid JSON object in this exact format:
    {
      "decodedVIN": "The 17-digit VIN",
      "eurocode": "Extracted or deduced Eurocode (e.g., 8586AGSGNMVZ1)",
      "nagsCode": "Extracted or deduced NAGS code (e.g., FW02345 GBY)",
      "confidence": "High, Medium, or Low",
      "detectedFeatures": ["List", "of", "detected", "features"],
      "analysisNotes": "Explain step-by-step how the specific labeled photos led you to these codes."
    }`);

    // 5. Send the entire sequence to Gemini 3.1 Pro
    const result = await model.generateContent(promptSequence);
    const cleanJson = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    
    return res.status(200).json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error("Pro Decoder Error:", error);
    return res.status(500).json({ error: error.message || error.toString() });
  }
}