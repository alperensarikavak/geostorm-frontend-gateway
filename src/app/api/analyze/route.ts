import { NextResponse } from "next/server";
import axios, { AxiosError } from "axios";

const REQUEST_TIMEOUT_MS = 65_000;

type AnalyzeRequest = {
  prompt?: unknown;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeRequest;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

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
    }, {
      timeout: REQUEST_TIMEOUT_MS,
    });

    return NextResponse.json(response.data);
  } catch (error: unknown) {
    const normalizedError = normalizeGatewayError(error);
    console.error("API Gateway Error:", normalizedError.message);

    return NextResponse.json(
      {
        error: "FastAPI service could not be reached or returned an error.",
        details: normalizedError.details,
      },
      { status: normalizedError.status }
    );
  }
}

function normalizeGatewayError(error: unknown): {
  status: number;
  message: string;
  details: unknown;
} {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    return {
      status: axiosError.response?.status || 502,
      message: axiosError.message,
      details: axiosError.response?.data || axiosError.message,
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      message: error.message,
      details: error.message,
    };
  }

  return {
    status: 500,
    message: "Unknown gateway error.",
    details: "Unknown gateway error.",
  };
}
