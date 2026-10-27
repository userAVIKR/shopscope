// Lists the Gemini models your API key can use for ShopScope (those that support generateContent).
// Run: npm run ai:models   (reads GEMINI_API_KEY from backend/.env)

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY is not set in backend/.env. Create a free key at https://aistudio.google.com/apikey");
  process.exit(1);
}

type Model = { name: string; displayName?: string; supportedGenerationMethods?: string[] };

const models: Model[] = [];
let pageToken = "";
do {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
  const response = await fetch(url, { headers: { "x-goog-api-key": key } });
  if (!response.ok) {
    console.error(`Gemini returned ${response.status}. Is the API key correct?`);
    process.exit(1);
  }
  const page = (await response.json()) as { models?: Model[]; nextPageToken?: string };
  models.push(...(page.models ?? []));
  pageToken = page.nextPageToken ?? "";
} while (pageToken);

const usable = models.filter((m) => m.supportedGenerationMethods?.includes("generateContent"));
const current = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

console.log("Models you can set as GEMINI_MODEL (Flash models are the best free choice):\n");
for (const m of usable.sort((a, b) => a.name.localeCompare(b.name))) {
  const id = m.name.replace(/^models\//, "");
  const marker = id === current ? "  <- current" : /flash/i.test(id) ? "  (flash)" : "";
  console.log(`  ${id.padEnd(40)} ${m.displayName ?? ""}${marker}`);
}
if (!usable.some((m) => m.name === `models/${current}`)) {
  console.log(`\nGEMINI_MODEL=${current} is not in this list. Pick one above and update backend/.env.`);
}
