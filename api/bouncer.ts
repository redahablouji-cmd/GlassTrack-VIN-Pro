import { GoogleGenerativeAI } from '@google/generative-ai';

// Vercel Serverless Function handler
export default async function handler(req: any, res: any) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, part } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
  }

  try {
    // Initialize Gemini (We use 1.5 Flash because it is insanely fast, perfect for the "Pulse" checking)
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // The strict prompt for the AI
    const prompt = `You are a real-time AI Camera Guide for Auto Glass technicians.
    The technician is currently trying to capture a photo of: ${part}.
    
    Review the attached frame from their live camera. Is the car part clearly visible, in focus, and at the correct angle?
    
    Respond ONLY with a valid JSON object in this exact format, with no markdown formatting or backticks:
    {
      "isPerfect": boolean,
      "arabicInstruction": "If true, reply with '✅ الزاوية صحيحة، التقط الصورة الآن'. If false, give a very short 2-to-4 word instruction in Arabic on how they need to adjust the camera to get the right shot (e.g., 'اقترب أكثر' [get closer], 'ارجع للخلف' [step back], 'قم بإمالة الهاتف لأسفل' [tilt down], 'غير واضح' [too blurry])."
    }`;

    // Clean the base64 string so Gemini can read it
    const base64Data = image.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const imageParts = [{
      inlineData: {
        data: base64Data,
        mimeType: "image/jpeg"
      }
    }];

    // Ask Gemini
    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text();
    
    // Clean up the response just in case Gemini adds markdown code blocks
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonResponse = JSON.parse(cleanJson);

    // Send the Arabic instruction instantly back to the phone
    return res.status(200).json(jsonResponse);

  } catch (error: any) {
    console.error("AI Bouncer Error:", error);
    return res.status(500).json({ error: error.message });
  }
}