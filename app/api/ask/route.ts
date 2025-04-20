import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import OpenAI from "openai";

// Load your OpenAI API key from environment variables
const openAIApiKey = process.env.OPENAI_API_KEY;

// Define the type for a tree species entry
interface TreeSpecies {
  Species: string;
  Family: string;
  EcosystemService: string[];
  PartsUsed: string[];
  RelatedFunctionalTraits: string[];
}

type ScoredTreeSpecies = TreeSpecies & {
  embedding: number[];
  similarity: number;
};

// Define the type for the query
interface Query {
  species: string | null;
  ecosystemService: string | null;
  partUsed: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question) {
      return NextResponse.json(
        { error: "No question provided" },
        { status: 400 }
      );
    }

    // --- Load data.json and data_with_embeddings.json via HTTP fetch for Vercel compatibility ---
    async function fetchPublicJson(filename: string) {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const res = await fetch(`${baseUrl}/` + filename);
      if (!res.ok) throw new Error(`Failed to fetch ${filename}`);
      return await res.json();
    }

    // --- Synonym dictionaries ---
    const speciesSynonyms = [
      "tree",
      "trees",
      "plant",
      "plants",
      "vegetation",
      "species",
    ];
    const ecosystemServiceSynonyms: Record<string, string[]> = {
      Medicinal: [
        "medicine",
        "medicinal",
        "healing",
        "remedy",
        "pharmaceutical",
        "health",
      ],
      Food: [
        "food",
        "edible",
        "nutrition",
        "eat",
        "eating",
        "consumed",
        "nutritional",
      ],
      "Raw Material": [
        "raw material",
        "material",
        "timber",
        "wood",
        "construction",
        "building",
        "fiber",
        "latex",
        "resource",
      ],
    };
    const partUsedSynonyms: Record<string, string[]> = {
      fruit: ["fruit", "fruits", "edible fruit"],
      seed: ["seed", "seeds", "edible seed"],
      bark: ["bark"],
      trunk: ["trunk", "wood", "timber"],
      leaves: ["leaf", "leaves", "edible leaves"],
      root: ["root", "roots"],
      latex: ["latex"],
      resin: ["resin"],
      branch: ["branch", "branches"],
      flower: ["flower", "flowers"],
      sap: ["sap"],
    };

    // --- Use ChatOpenAI to extract query ---
    let query: Query = {
      species: null,
      ecosystemService: null,
      partUsed: null,
    };
    let only: boolean | undefined = undefined;
    let and: { ecosystemService?: string; partUsed?: string } | undefined =
      undefined;
    let usedLLM = false;
    try {
      const llm = new ChatOpenAI({ openAIApiKey });
      const prompt = new PromptTemplate({
        template: `Given the following JSON schema for Amazon forest tree species:
        [{{"Species": string, "EcosystemService": string[], "PartsUsed": string[]}}]
        and a user question, extract the most relevant query as a JSON object with possible values for:
        - species: string or null
        - ecosystemService: string or null (must match one of the values in the EcosystemService array)
        - partUsed: string or null (must match one of the values in the PartsUsed array)
        - only: boolean (true if the user asks for species used exclusively for a service)
        - and: object (if the user asks for multiple conditions, e.g. both a service and a part used)
        If a field is not specified, set it to null. Output only the JSON object, nothing else.
        
        User question: {question}
        Query:`,
        inputVariables: ["question"],
      });
      const formattedPrompt = await prompt.format({ question });
      const response = await llm.call([
        {
          role: "system",
          content:
            "You are a helpful assistant that extracts structured queries from user questions.",
        },
        { role: "user", content: formattedPrompt },
      ]);
      const llmQuery = JSON.parse(
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content)
      );
      // --- Normalization step for synonyms ---
      function normalizeField(
        value: string | null,
        synonymsDict: Record<string, string[]>
      ): string | null {
        if (!value) return null;
        const lowerValue = value.trim().toLowerCase();
        for (const [canonical, synonyms] of Object.entries(synonymsDict)) {
          if (canonical.toLowerCase() === lowerValue) return canonical;
          if (synonyms.some((syn) => syn.toLowerCase() === lowerValue))
            return canonical;
        }
        return value; // fallback to original if no match
      }
      query = {
        species: llmQuery.species ?? null,
        ecosystemService: normalizeField(
          llmQuery.ecosystemService ?? null,
          ecosystemServiceSynonyms
        ),
        partUsed: normalizeField(llmQuery.partUsed ?? null, partUsedSynonyms),
      };
      only = llmQuery.only;
      and = llmQuery.and;
      usedLLM = true;
    } catch {
      // fallback to synonym/keyword logic
      const lowerQ = question.toLowerCase();
      // 1. EcosystemService detection
      for (const [service, synonyms] of Object.entries(
        ecosystemServiceSynonyms
      )) {
        if (synonyms.some((syn) => lowerQ.includes(syn))) {
          query.ecosystemService = service;
          break;
        }
      }
      // 2. PartsUsed detection (only if not already matched as ecosystemService)
      if (!query.ecosystemService) {
        for (const [part, synonyms] of Object.entries(partUsedSynonyms)) {
          if (synonyms.some((syn) => lowerQ.includes(syn))) {
            query.partUsed = part;
            break;
          }
        }
      }
      // 3. Species detection (broad query if any synonym is present)
      if (speciesSynonyms.some((syn) => lowerQ.includes(syn))) {
        query.species = null;
      }
      // 4. Fallback for 'only' logic on PartsUsed
      const onlyPartsUsedPatterns = [
        /only the ([a-z]+) are used/, // e.g. only the leaves are used
        /([a-z]+) are the only part used/, // e.g. leaves are the only part used
        /parts used is only ([a-z]+)/, // e.g. parts used is only leaves
        /the only value in partsused is ([a-z]+)/, // e.g. the only value in PartsUsed is leaves
      ];
      for (const pattern of onlyPartsUsedPatterns) {
        const match = lowerQ.match(pattern);
        if (match && match[1]) {
          only = true;
          // Try to normalize the matched part
          const normalizedPart = Object.entries(partUsedSynonyms).find(
            ([canonical, synonyms]) =>
              canonical.toLowerCase() === match[1] ||
              synonyms.includes(match[1])
          );
          query.partUsed = normalizedPart ? normalizedPart[0] : match[1];
          break;
        }
      }
    }

    // 4. Count query detection
    const isCountQuery = /how many|number of|count/i.test(question);

    // Debug log for troubleshooting
    console.log("Final query used for filtering:", query, {
      only,
      and,
      usedLLM,
    });

    // --- Vector search: get embedding for the question ---
    const questionText = question;
    let questionEmbedding: number[] | null = null;
    try {
      const openai = new OpenAI({ apiKey: openAIApiKey });
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: questionText,
      });
      questionEmbedding = embeddingResponse.data[0].embedding;
    } catch (e) {
      console.error("Error generating question embedding:", e);
      return NextResponse.json(
        { error: "Failed to generate embedding for question." },
        { status: 500 }
      );
    }

    // --- Load data with embeddings ---
    // const dataWithEmbeddingsPath = path.join(
    //   process.cwd(),
    //   "public",
    //   "data_with_embeddings.json"
    // );
    // const dataWithEmbeddingsRaw = await fs.readFile(
    //   dataWithEmbeddingsPath,
    //   "utf8"
    // );
    // const dataWithEmbeddings: ScoredTreeSpecies[] = JSON.parse(
    //   dataWithEmbeddingsRaw
    // );
    const dataWithEmbeddings: ScoredTreeSpecies[] = await fetchPublicJson(
      "data_with_embeddings.json"
    );

    // --- Cosine similarity function ---
    function cosineSimilarity(a: number[], b: number[]) {
      const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
      const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
      const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
      return dot / (normA * normB);
    }

    // --- Compute similarities and get top N ---
    const scored = dataWithEmbeddings.map((entry) => ({
      ...entry,
      similarity: cosineSimilarity(questionEmbedding!, entry.embedding),
    }));
    scored.sort((a, b) => b.similarity - a.similarity);
    let filtered: ScoredTreeSpecies[];

    // If 'only' logic is requested, apply filtering to the entire dataset
    if (only) {
      filtered = dataWithEmbeddings.filter((item) => {
        let match = true;
        if (query.ecosystemService) {
          match =
            match &&
            item.EcosystemService.length === 1 &&
            item.EcosystemService[0].toLowerCase() ===
              query.ecosystemService!.toLowerCase();
        }
        if (query.partUsed) {
          match =
            match &&
            item.PartsUsed.length === 1 &&
            item.PartsUsed[0].toLowerCase() === query.partUsed!.toLowerCase();
        }
        return match;
      });
    } else {
      // Return all matches, not just top N
      filtered = scored.filter((item: ScoredTreeSpecies) => {
        const speciesMatch =
          !query.species ||
          item.Species.toLowerCase().includes(query.species.toLowerCase());
        const ecosystemMatch =
          !query.ecosystemService ||
          item.EcosystemService.some((s: string) =>
            s.toLowerCase().includes(query.ecosystemService!.toLowerCase())
          );
        const partMatch =
          !query.partUsed ||
          item.PartsUsed.some((p: string) =>
            p.toLowerCase().includes(query.partUsed!.toLowerCase())
          );
        return speciesMatch && ecosystemMatch && partMatch;
      });
    }

    // Handle 'only' logic (species used exclusively for a service or part)
    if (only) {
      if (query.ecosystemService) {
        filtered = filtered.filter(
          (item) =>
            item.EcosystemService.length === 1 &&
            item.EcosystemService[0].toLowerCase() ===
              query.ecosystemService!.toLowerCase()
        );
      }
      if (query.partUsed) {
        filtered = filtered.filter(
          (item) =>
            item.PartsUsed.length === 1 &&
            item.PartsUsed[0].toLowerCase() === query.partUsed!.toLowerCase()
        );
      }
    }
    // Handle 'and' logic (multiple conditions)
    if (and) {
      if (and.ecosystemService) {
        filtered = filtered.filter((item) =>
          item.EcosystemService.some((s: string) =>
            s.toLowerCase().includes(and.ecosystemService!.toLowerCase())
          )
        );
      }
      if (and.partUsed) {
        filtered = filtered.filter((item) =>
          item.PartsUsed.some((p: string) =>
            p.toLowerCase().includes(and.partUsed!.toLowerCase())
          )
        );
      }
    }

    // Debug log for filtered results
    console.log(`Filtered results count: ${filtered.length}`);
    console.log("First 3 filtered results:", filtered.slice(0, 3));

    // --- After filtering, fetch GBIF images for each species ---
    async function fetchGbifImages(speciesName: string): Promise<string[]> {
      try {
        const gbifApiUrl = `https://api.gbif.org/v1/occurrence/search?mediaType=StillImage&scientificName=${encodeURIComponent(
          speciesName
        )}&limit=10`;
        const resp = await fetch(gbifApiUrl);
        if (!resp.ok) return [];
        const data = await resp.json();
        const images: string[] = [];
        for (const result of data.results || []) {
          if (result.media && Array.isArray(result.media)) {
            for (const media of result.media) {
              if (
                media.type === "StillImage" &&
                media.identifier &&
                images.length < 5
              ) {
                images.push(media.identifier);
              }
              if (images.length >= 5) break;
            }
          }
          if (images.length >= 5) break;
        }
        return images;
      } catch {
        return [];
      }
    }

    // Fetch images for each species in parallel (limit concurrency if needed)
    const resultsWithImages = await Promise.all(
      filtered.map(async (item) => {
        const images = await fetchGbifImages(item.Species);
        return { ...item, images };
      })
    );

    if (isCountQuery) {
      return NextResponse.json({ count: filtered.length });
    }

    return NextResponse.json({ results: resultsWithImages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
