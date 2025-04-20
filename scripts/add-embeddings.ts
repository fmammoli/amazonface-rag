// This script adds OpenAI embeddings to each entry in data.json and saves the result as data_with_embeddings.json
import fs from "fs/promises";
import path from "path";
import { OpenAI } from "openai";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const openai = new OpenAI({
  apiKey: process.env.OPENA_AI_KEY,
});

async function main() {
  const dataPath = path.join(__dirname, "../public/data.json");
  const outPath = path.join(__dirname, "../public/data_with_embeddings.json");
  const raw = await fs.readFile(dataPath, "utf8");
  const data = JSON.parse(raw);

  for (const entry of data) {
    // Create a text representation for embedding
    const text = `Species: ${entry.Species}\nFamily: ${
      entry.Family
    }\nEcosystemService: ${(entry.EcosystemService || []).join(
      ", "
    )}\nPartsUsed: ${(entry.PartsUsed || []).join(", ")}
    \nRelatedFunctionalTraits: ${(entry.RelatedFunctionalTraits || []).join(
      ", "
    )}`;
    // Get embedding from OpenAI
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    entry.embedding = embeddingResponse.data[0].embedding;
  }

  await fs.writeFile(outPath, JSON.stringify(data, null, 2), "utf8");
  console.log(`Wrote embeddings to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
