export const defaultAiPrompt =
  "Anda adalah senior workforce analytics auditor. Analisa data access-log dan shift dalam Bahasa Indonesia. Fokus pada keterlambatan, pulang cepat, lembur, keluar-masuk selama shift, anomali human error, vulnerability operasional, dan rekomendasi audit yang bisa ditindaklanjuti. Jangan mengarang di luar data JSON.";

export const providerOptions = [
  { id: "mimo", label: "MiMo", logo: "MI", color: "#ff7a45" },
  { id: "openai", label: "OpenAI", logo: "OA", color: "#78f2a5" },
  { id: "claude", label: "Claude", logo: "CL", color: "#f8b84e" },
  { id: "gemini", label: "Gemini", logo: "GE", color: "#6aa9ff" },
  { id: "local", label: "Local AI", logo: "LO", color: "#36d1dc" },
];

export function defaultProviderModel(provider, compatibility) {
  if (provider === "mimo") return compatibility === "openai" ? "mimo-v2.5-pro" : "mimo-v2.5-pro";
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "claude") return "claude-3-5-sonnet-latest";
  if (provider === "gemini") return "gemini-1.5-flash";
  return "local-rules";
}

export function defaultProviderBaseUrl(provider, compatibility) {
  if (provider === "mimo") {
    return compatibility === "openai"
      ? "https://api.xiaomimimo.com/openai"
      : "https://api.xiaomimimo.com/anthropic";
  }
  if (provider === "openai") return "https://api.openai.com";
  if (provider === "claude") return "https://api.anthropic.com";
  if (provider === "gemini") return "https://generativelanguage.googleapis.com/v1beta";
  return "";
}

export function toDraftConfig(config) {
  return {
    enabled: config?.enabled ?? false,
    provider: config?.provider ?? "mimo",
    compatibility: config?.compatibility ?? "anthropic",
    model: config?.model ?? "",
    baseUrl: config?.baseUrl ?? "",
    apiKey: config?.apiKey ?? "",
    maxTokens: config?.maxTokens ?? 4000,
    anthropicVersion: config?.anthropicVersion ?? "2023-06-01",
    prompt: config?.prompt ?? defaultAiPrompt,
  };
}
