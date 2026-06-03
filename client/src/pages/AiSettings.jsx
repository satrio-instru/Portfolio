import { useState, useEffect } from "react";
import { BrainCircuit, KeyRound, Settings } from "lucide-react";
import { providerOptions, defaultProviderModel, defaultProviderBaseUrl, toDraftConfig, defaultAiPrompt } from "../config/providers";

export default function AiSettingsPage({ config, saving, message, onSave }) {
  const [draft, setDraft] = useState(() => toDraftConfig(config));

  useEffect(() => {
    setDraft(toDraftConfig(config));
  }, [config]);

  function update(key, value) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "provider" || key === "compatibility") {
        next.baseUrl = defaultProviderBaseUrl(next.provider, next.compatibility);
        next.model = defaultProviderModel(next.provider, next.compatibility);
      }
      return next;
    });
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">AI configuration</p>
          <h2>Atur provider AI dari UI.</h2>
        </div>
        <button className="upload-button" disabled={saving} onClick={() => onSave(draft)}>
          <KeyRound size={16} />
          {saving ? "Menyimpan..." : "Save config"}
        </button>
      </section>

      <section className="ai-config-grid">
        <article className="info-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Provider</p>
              <h3>Pilih AI engine</h3>
            </div>
            <BrainCircuit size={22} />
          </div>
          <div className="provider-grid">
            {providerOptions.map((provider) => (
              <button
                key={provider.id}
                className={draft.provider === provider.id ? "provider-card active" : "provider-card"}
                onClick={() => update("provider", provider.id)}
                type="button"
              >
                <span className="provider-logo" style={{ color: provider.color, borderColor: provider.color }}>
                  {provider.logo}
                </span>
                <span>{provider.label}</span>
              </button>
            ))}
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => update("enabled", event.target.checked)}
            />
            <span>Aktifkan AI eksternal saat ingest/upload berikutnya</span>
          </label>
          {config?.apiKeyConfigured && (
            <p className="muted small">API key tersimpan: {config.apiKeyPreview}</p>
          )}
          {message && <p className="success-text">{message}</p>}
        </article>

        <article className="info-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Connection</p>
              <h3>Model, key, dan base URL</h3>
            </div>
            <Settings size={22} />
          </div>
          {draft.provider === "mimo" && (
            <div className="segmented-control">
              {["anthropic", "openai"].map((mode) => (
                <button
                  type="button"
                  key={mode}
                  className={draft.compatibility === mode ? "active" : ""}
                  onClick={() => update("compatibility", mode)}
                >
                  {mode === "anthropic" ? "Anthropic compatible" : "OpenAI compatible"}
                </button>
              ))}
            </div>
          )}
          <div className="form-grid">
            <label>
              <span>Model</span>
              <input value={draft.model} onChange={(event) => update("model", event.target.value)} />
            </label>
            <label>
              <span>Base URL</span>
              <input value={draft.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} />
            </label>
            <label>
              <span>API key</span>
              <input
                type="password"
                value={draft.apiKey}
                placeholder={config?.apiKeyConfigured ? "Kosongkan untuk tetap pakai key tersimpan" : "Masukkan API key"}
                onChange={(event) => update("apiKey", event.target.value)}
              />
            </label>
            <label>
              <span>Max tokens</span>
              <input
                type="number"
                min="256"
                max="8000"
                value={draft.maxTokens}
                onChange={(event) => update("maxTokens", Number(event.target.value))}
              />
            </label>
            {(draft.provider === "mimo" || draft.provider === "claude") && (
              <label>
                <span>Anthropic version</span>
                <input
                  value={draft.anthropicVersion}
                  onChange={(event) => update("anthropicVersion", event.target.value)}
                />
              </label>
            )}
            <label className="full-width">
              <span>Prompt analisa</span>
              <textarea
                className="prompt-box"
                value={draft.prompt}
                onChange={(event) => update("prompt", event.target.value)}
                placeholder={defaultAiPrompt}
              />
            </label>
          </div>
          <div className="config-actions">
            <button className="ghost-button" type="button" onClick={() => update("prompt", defaultAiPrompt)}>
              Default prompt
            </button>
            <button className="ghost-button" type="button" onClick={() => onSave({ ...draft, clearApiKey: true, apiKey: "" })}>
              Clear saved key
            </button>
          </div>
          <p className="muted">
            Konfigurasi ini disimpan di storage backend lokal. Setelah mengganti provider, key, atau prompt,
            buka tab Input lalu klik Analyze with AI untuk memperbarui narasi AI dataset aktif.
          </p>
        </article>
      </section>
    </>
  );
}
