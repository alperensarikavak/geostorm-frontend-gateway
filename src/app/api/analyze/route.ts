import { NextResponse } from "next/server";
import axios from "axios";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Call the Python FastAPI service
    const fastapiUrl = process.env.FASTAPI_URL || "http://localhost:8000/api/v1/insight";
    
    const response = await axios.post(fastapiUrl, {
      prompt,
    });

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error("API Gateway Error:", error.message);
    
    return NextResponse.json(
      { 
        error: "FastAPI servisine ulaşılamadı veya bir hata oluştu.",
        details: error.response?.data || error.message
      },
      { status: error.response?.status || 500 }
    );
  }
}
