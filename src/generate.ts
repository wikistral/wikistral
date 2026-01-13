import { parseArgs } from "util";
import {
  ArticleGeneration,
  CATEGORIES,
  LANGUAGES,
  type Category,
  type Language,
} from "./lib/generation";

function printUsage() {
  console.log(`Usage: bun gen --category <category> --language <language>... --subject <subject>

Options:
  --category, -c   Category to generate (${CATEGORIES.join(", ")})
  --language, -l   Language code(s), can be specified multiple times (${LANGUAGES.join(", ")})
  --subject, -s    Subject to generate content for
  --help, -h       Show this help message

Examples:
  bun gen --category cities --language fr --subject Paris
  bun gen -c people -l en -l fr -s "Albert Einstein"`);
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    category: { type: "string", short: "c" },
    language: { type: "string", short: "l", multiple: true },
    subject: { type: "string", short: "s" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help) {
  printUsage();
  process.exit(0);
}

if (!values.category || !values.language?.length || !values.subject) {
  console.error("Error: --category, --language, and --subject are required.\n");
  printUsage();
  process.exit(1);
}

const category = values.category.toLowerCase() as Category;
const languageInputs = values.language.map((l) => l.toLowerCase());
const subject = values.subject;

if (!CATEGORIES.includes(category)) {
  console.error(
    `Error: Invalid category "${values.category}". Must be one of: ${CATEGORIES.join(", ")}`
  );
  process.exit(1);
}

const invalidLanguages = languageInputs.filter(
  (l) => !LANGUAGES.includes(l as Language)
);
if (invalidLanguages.length > 0) {
  console.error(
    `Error: Invalid language(s) "${invalidLanguages.join(", ")}". Must be one of: ${LANGUAGES.join(", ")}`
  );
  process.exit(1);
}

const selectedLanguages = languageInputs as Language[];

for (const language of selectedLanguages) {
  const generation = new ArticleGeneration({ category, language, subject });
  await generation.start();
}
