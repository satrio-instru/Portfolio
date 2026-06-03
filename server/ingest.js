import path from "node:path";
import { processAndStoreFile } from "./lib/pipeline.js";

const input = process.argv[2];

if (!input) {
  console.error("Usage: npm run ingest -- <path-to-xls-xlsx-csv>");
  process.exit(1);
}

const resolved = path.resolve(input);
const result = await processAndStoreFile(resolved, path.basename(resolved));

console.log(JSON.stringify({
  id: result.metadata.id,
  originalName: result.metadata.originalName,
  totalRows: result.summary.totalRows,
  anomalyCount: result.summary.anomalyCount,
}, null, 2));
