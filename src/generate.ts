import { parseArgs } from "util";
import { ArticleGeneration } from "./lib/generation";

const categories = ["cities", "companies", "people"] as const;
const languages = ["fr", "en"] as const;

type Category = (typeof categories)[number];
type Language = (typeof languages)[number];

function printUsage() {
  console.log(`Usage: bun gen --category <category> --language <language>... --subject <subject>

Options:
  --category, -c   Category to generate (${categories.join(", ")})
  --language, -l   Language code(s), can be specified multiple times (${languages.join(", ")})
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

if (!categories.includes(category)) {
  console.error(
    `Error: Invalid category "${values.category}". Must be one of: ${categories.join(", ")}`
  );
  process.exit(1);
}

const invalidLanguages = languageInputs.filter(
  (l) => !languages.includes(l as Language)
);
if (invalidLanguages.length > 0) {
  console.error(
    `Error: Invalid language(s) "${invalidLanguages.join(", ")}". Must be one of: ${languages.join(", ")}`
  );
  process.exit(1);
}

const selectedLanguages = languageInputs as Language[];

for (const language of selectedLanguages) {
  const generation = new ArticleGeneration({ category, language, subject });
  await generation.start();
}
