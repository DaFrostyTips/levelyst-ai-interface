const host = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const model = process.env.LEVELYST_LOCAL_AI_MODEL ?? "qwen3:4b";

async function main() {
  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      keep_alive: "30m",
      options: {
        temperature: 0,
        num_ctx: 1024,
      },
      messages: [
        {
          role: "user",
          content: "Reply with Ready.",
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Warmup failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const message = payload?.message?.content?.trim() || "Ready";

  console.log(`Local AI warmup complete for ${model} at ${host}.`);
  console.log(`Model reply: ${message}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Local AI warmup failed.");
  process.exitCode = 1;
});
