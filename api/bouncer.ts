import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image, part } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing API Key' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Explicitly using the Flash model for the live camera pulse
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are an expert Auto Glass AI Bouncer. 
    The technician is trying to capture this specific part/view: "${part}".
    
    Look at the provided image frame. 
    Is the requested part visible in the image? Is the angle acceptable (roughly 90% correct)? 
    
    If it is a mirror bracket, expect to see the interior of the car roof/windshield. 
    If it is a glass stamp, expect to see tiny text on glass.
    
    Respond ONLY with a valid JSON object:
    {
      "isPerfect": boolean,
      "arabicInstruction": "If true, reply EXACTLY with '✅ الزاوية صحيحة، التقط الصورة الآن'. If false, give a very short 2-to-4 word instruction in Arabic (e.g., 'اقترب من المرآة' [get closer to mirror], 'وجه الكاميرا للزجاج' [point at glass], 'الصورة ضبابية' [blurry])."
    }`;

    const base64Data = image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
    ]);
    
    const cleanJson = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    return res.status(200).json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error("AI Bouncer Error:", error);
    // Force the exact Google error message to be sent to the frontend
    const errorMessage = error?.message || error?.toString() || "Unknown AI Error";
    return res.status(500).json({ error: errorMessage });
  }
}
