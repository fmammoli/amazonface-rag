// scripts/xlsx-to-json.ts
import XLSX from "xlsx";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Path to your spreadsheet (update if needed)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const spreadsheetPath = join(__dirname, "../public/data.xlsx");
// Output path
const outputPath = join(__dirname, "../public/data.json");

// Read the workbook
const workbook = XLSX.readFile(spreadsheetPath);

// Try to find the sheet or table by name
const sheetName = workbook.SheetNames.find(
  (name) => name.trim() === "1 Partes usadas, atributos"
);

if (!sheetName) {
  throw new Error('Sheet "1 Partes usadas, atributos" not found.');
}

const sheet = workbook.Sheets[sheetName];

// Define the type for a row in the spreadsheet
interface RawRow {
  [key: string]: string;
}

const rawRows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });

// Get the ecosystem service names from the first row
const serviceNames = [
  rawRows[0]["Ecosystem Service"],
  rawRows[0]["__EMPTY"],
  rawRows[0]["__EMPTY_1"],
];

const data = rawRows.slice(1).map((row) => {
  const services: string[] = [];
  if (row["Ecosystem Service"] === "X") services.push(serviceNames[0]);
  if (row["__EMPTY"] === "X") services.push(serviceNames[1]);
  if (row["__EMPTY_1"] === "X") services.push(serviceNames[2]);

  // Split PartsUsed into an array, trimming whitespace and filtering out empty strings
  const partsUsedArr = row["Parts used"]
    ? row["Parts used"]
        .split(",")
        .flatMap((part) => part.split(/\se\s/i)) // split by ' e ' (and)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // Split Related Functional Traits into an array, trimming whitespace and filtering out empty strings
  const relatedFunctionalTraitsArr = row["Related Functional Traits"]
    ? row["Related Functional Traits"].split(",")
    : [];

  // Translation map for Portuguese to English
  const partsTranslation: Record<string, string> = {
    fruto: "fruit",
    frutos: "fruits",
    folha: "leaf",
    folhas: "leaves",
    casca: "bark",
    tronco: "trunk",
    galhos: "branches",
    sementes: "seeds",
    semente: "seed",
    raiz: "root",
    raízes: "roots",
    látex: "latex",
    flores: "flowers",
    resina: "resin",
    seiva: "sap",
  };

  const partsUsedArrEn = partsUsedArr.map((pt) => {
    // Remove parenthesis and extra info
    const clean = pt
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .trim();
    // Try to translate each word
    return partsTranslation[clean] || pt.trim();
  });

  return {
    Species: row["Species"] || "",
    Family: row["Family"] || "",
    EcosystemService: services,
    PartsUsed: partsUsedArrEn,
    RelatedFunctionalTraits: relatedFunctionalTraitsArr,
    OBS: row["OBS"] || undefined,
  };
});

fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
console.log(`Exported ${data.length} rows to ${outputPath}`);
