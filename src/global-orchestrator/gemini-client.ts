import { GEMINI_MODEL } from "./constants.js";

export interface GeminiContent {
  role: string;
  parts: Array<{ text: string }>;
}

export interface GeminiGenerateOptions {
  temperature?: number;
}

export interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiInvocationResult<T> {
  result: T;
  invocation: {
    systemInstruction: string;
    contents: GeminiContent[];
  };
  usage?: GeminiUsage;
  reasoning?: string;
  rawContent: string;
  durationMs: number;
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; thought?: boolean }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

function extractReasoning(
  parts: Array<{ text?: string; thought?: boolean }> | undefined,
): { text: string; reasoning?: string } {
  if (!parts || parts.length === 0) {
    return { text: "" };
  }

  const reasoningParts: string[] = [];
  const contentParts: string[] = [];

  for (const part of parts) {
    if (!part.text) {
      continue;
    }
    if (part.thought) {
      reasoningParts.push(part.text);
    } else {
      contentParts.push(part.text);
    }
  }

  return {
    text: contentParts.join("") || parts[0]?.text || "",
    reasoning:
      reasoningParts.length > 0 ? reasoningParts.join("\n") : undefined,
  };
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  contents: GeminiContent[],
  options?: GeminiGenerateOptions & { json?: boolean },
): Promise<GeminiApiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const start = Date.now();

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        ...(options?.json ? { responseMimeType: "application/json" } : {}),
        temperature: options?.temperature ?? (options?.json ? 0.2 : 0.4),
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${body}`);
  }

  const payload = (await response.json()) as GeminiApiResponse;
  (payload as GeminiApiResponse & { durationMs: number }).durationMs =
    Date.now() - start;
  return payload;
}

function mapUsage(
  metadata: GeminiApiResponse["usageMetadata"],
): GeminiUsage | undefined {
  if (!metadata) {
    return undefined;
  }
  return {
    promptTokenCount: metadata.promptTokenCount,
    candidatesTokenCount: metadata.candidatesTokenCount,
    totalTokenCount: metadata.totalTokenCount,
  };
}

export async function generateJsonWithMeta<T>(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  options?: GeminiGenerateOptions,
): Promise<GeminiInvocationResult<T>> {
  const contents: GeminiContent[] = [
    { role: "user", parts: [{ text: userPrompt }] },
  ];
  const payload = await callGemini(apiKey, systemPrompt, contents, {
    ...options,
    json: true,
  });
  const durationMs =
    (payload as GeminiApiResponse & { durationMs?: number }).durationMs ?? 0;
  const parts = payload.candidates?.[0]?.content?.parts;
  const { text, reasoning } = extractReasoning(parts);

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return {
    result: JSON.parse(text) as T,
    invocation: { systemInstruction: systemPrompt, contents },
    usage: mapUsage(payload.usageMetadata),
    reasoning,
    rawContent: text,
    durationMs,
  };
}

export async function generateJson<T>(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  options?: GeminiGenerateOptions,
): Promise<T> {
  const meta = await generateJsonWithMeta<T>(
    apiKey,
    systemPrompt,
    userPrompt,
    options,
  );
  return meta.result;
}

export async function generateTextWithMeta(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  options?: GeminiGenerateOptions,
): Promise<GeminiInvocationResult<string>> {
  const contents: GeminiContent[] = [
    { role: "user", parts: [{ text: userPrompt }] },
  ];
  const payload = await callGemini(apiKey, systemPrompt, contents, options);
  const durationMs =
    (payload as GeminiApiResponse & { durationMs?: number }).durationMs ?? 0;
  const parts = payload.candidates?.[0]?.content?.parts;
  const { text, reasoning } = extractReasoning(parts);

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return {
    result: text.trim(),
    invocation: { systemInstruction: systemPrompt, contents },
    usage: mapUsage(payload.usageMetadata),
    reasoning,
    rawContent: text,
    durationMs,
  };
}

export async function generateText(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const meta = await generateTextWithMeta(apiKey, systemPrompt, userPrompt);
  return meta.result;
}

export async function generateJsonWithContents<T>(
  apiKey: string,
  systemPrompt: string,
  contents: GeminiContent[],
  options?: GeminiGenerateOptions,
): Promise<GeminiInvocationResult<T>> {
  const payload = await callGemini(apiKey, systemPrompt, contents, {
    ...options,
    json: true,
  });
  const durationMs =
    (payload as GeminiApiResponse & { durationMs?: number }).durationMs ?? 0;
  const parts = payload.candidates?.[0]?.content?.parts;
  const { text, reasoning } = extractReasoning(parts);

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return {
    result: JSON.parse(text) as T,
    invocation: { systemInstruction: systemPrompt, contents },
    usage: mapUsage(payload.usageMetadata),
    reasoning,
    rawContent: text,
    durationMs,
  };
}
