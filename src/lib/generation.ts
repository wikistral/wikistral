import { generateObject, generateText, stepCountIs } from "ai";
import { mistral } from "@ai-sdk/mistral";
import { webSearch } from "@exalabs/ai-sdk";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { z } from "zod";

export const CATEGORIES = ["cities", "companies", "people"] as const;
export const LANGUAGES = ["fr", "en"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Language = (typeof LANGUAGES)[number];

const CityInfoboxSchema = z.object({
  country: z.string().describe("Country where the city is located"),
  region: z.string().describe("State, province, or region"),
  population: z.string().describe("Population count with year"),
  area: z.string().describe("Area in km² or mi²"),
  timezone: z.string().describe("Timezone (e.g., UTC+1)"),
  mayor: z.string().describe("Current mayor or leader"),
  founded: z.string().describe("Year or date founded"),
});

const CompanyInfoboxSchema = z.object({
  type: z
    .string()
    .describe("Company type: Public, Private, Startup, Non-profit, etc."),
  industry: z.string().describe("Primary industry or sector"),
  founded: z.string().describe("Year founded"),
  founders: z.string().describe("Founder(s) names"),
  headquarters: z.string().describe("Headquarters location"),
  keyPeople: z.string().describe("CEO, President, or key executives"),
  employees: z.string().describe("Number of employees"),
  website: z.string().describe("Official website URL"),
});

const PersonInfoboxSchema = z.object({
  born: z.string().describe("Birth date and place"),
  died: z.string().describe("Death date and place, or 'N/A' if alive"),
  nationality: z.string().describe("Nationality or nationalities"),
  occupation: z.string().describe("Primary occupation(s)"),
  yearsActive: z.string().describe("Years active in their field"),
  knownFor: z.string().describe("What they are best known for"),
  notableWorks: z
    .string()
    .describe("Notable works, achievements, or contributions"),
});

export const INFOBOX_SCHEMAS: Record<Category, z.ZodObject<z.ZodRawShape>> = {
  cities: CityInfoboxSchema,
  companies: CompanyInfoboxSchema,
  people: PersonInfoboxSchema,
};

export type CityInfobox = z.infer<typeof CityInfoboxSchema>;
export type CompanyInfobox = z.infer<typeof CompanyInfoboxSchema>;
export type PersonInfobox = z.infer<typeof PersonInfoboxSchema>;
export type Infobox = CityInfobox | CompanyInfobox | PersonInfobox;

interface ArticleParams {
  category: Category;
  language: Language;
  subject: string;
}

interface Reference {
  title: string;
  url: string;
  content: string;
  domain: string;
  publishedDate?: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
};

const EXCLUDED_DOMAINS = [
  "wikipedia.org",
  "en.wikipedia.org",
  "fr.wikipedia.org",
  "simple.wikipedia.org",
];

const PREFERRED_DOMAINS = [
  ".gov",
  ".edu",
  "britannica.com",
  "reuters.com",
  "bbc.com",
  "nytimes.com",
  "theguardian.com",
  "apnews.com",
];

export class ArticleGeneration {
  private readonly params: ArticleParams;

  constructor(params: ArticleParams) {
    this.params = params;
  }

  async start(): Promise<string> {
    const { category, language, subject } = this.params;
    const languageName = LANGUAGE_NAMES[language] ?? language;

    console.log(`\n📚 Generating article about "${subject}"...`);
    console.log(`   Category: ${category}`);
    console.log(`   Language: ${languageName}\n`);

    // Step 1: Fast parallel research
    console.log("🔍 Researching...");
    const { references, knowledgeBase } = await this.research(subject, category);
    console.log(`   Found ${references.length} sources`);

    // Step 2: Generate infobox and article in parallel
    console.log("✍️  Generating content...");
    const [infobox, articleText] = await Promise.all([
      this.generateInfobox(subject, category, languageName, knowledgeBase),
      this.generateArticle(subject, category, languageName, knowledgeBase),
    ]);

    // Save to files
    await this.saveToFiles(language, subject, infobox, references, articleText);

    console.log("\n✅ Article generated successfully!\n");

    return articleText;
  }

  private async research(
    subject: string,
    category: Category
  ): Promise<{ references: Reference[]; knowledgeBase: string }> {
    const queries = this.getSearchQueries(subject, category);

    // Run all searches in parallel
    const searchPromises = queries.map((query) =>
      this.executeSearch(query).catch(() => [] as Reference[])
    );

    const results = await Promise.all(searchPromises);
    const allRefs = results.flat();

    // Deduplicate and score
    const uniqueRefs = this.deduplicateReferences(allRefs);
    const scoredRefs = this.scoreReferences(uniqueRefs);

    return {
      references: scoredRefs,
      knowledgeBase: this.buildKnowledgeBase(scoredRefs),
    };
  }

  private async executeSearch(query: string): Promise<Reference[]> {
    const { steps } = await generateText({
      model: mistral("mistral-large-latest"),
      prompt: `Search: "${query}"`,
      tools: {
        webSearch: webSearch({
          numResults: 3,
          excludeDomains: EXCLUDED_DOMAINS,
          contents: {
            text: { maxCharacters: 2000 },
          },
        }),
      },
      stopWhen: stepCountIs(2),
    });

    return this.extractReferences(steps);
  }

  private getSearchQueries(subject: string, category: Category): string[] {
    const queries: Record<Category, string[]> = {
      cities: [
        `${subject} city history population`,
        `${subject} economy culture landmarks`,
        `${subject} government geography`,
      ],
      companies: [
        `${subject} company history founders`,
        `${subject} business products headquarters`,
        `${subject} CEO employees industry`,
      ],
      people: [
        `${subject} biography early life career`,
        `${subject} achievements works legacy`,
        `${subject} awards influence`,
      ],
    };

    return queries[category];
  }

  private deduplicateReferences(refs: Reference[]): Reference[] {
    const seen = new Set<string>();
    return refs.filter((ref) => {
      const key = ref.url.toLowerCase().replace(/\/$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private scoreReferences(refs: Reference[]): Reference[] {
    return refs
      .map((ref) => ({
        ref,
        score: this.calculateSourceScore(ref),
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ ref }) => ref);
  }

  private calculateSourceScore(ref: Reference): number {
    let score = 0;

    // Prefer authoritative domains
    for (const domain of PREFERRED_DOMAINS) {
      if (ref.domain.includes(domain) || ref.url.includes(domain)) {
        score += 10;
        break;
      }
    }

    // Prefer longer content (more detailed)
    score += Math.min(ref.content.length / 500, 5);

    // Prefer recent content
    if (ref.publishedDate) {
      const date = new Date(ref.publishedDate);
      const yearsOld =
        (Date.now() - date.getTime()) / (365 * 24 * 60 * 60 * 1000);
      if (yearsOld < 1) score += 5;
      else if (yearsOld < 3) score += 3;
      else if (yearsOld < 5) score += 1;
    }

    // Penalize short snippets
    if (ref.content.length < 200) score -= 3;

    return score;
  }

  private buildKnowledgeBase(refs: Reference[]): string {
    if (refs.length === 0) return "";

    return refs
      .slice(0, 15) // Use top 15 sources
      .map(
        (ref, i) => `
<source id="${i + 1}">
<title>${ref.title}</title>
<url>${ref.url}</url>
<domain>${ref.domain}</domain>
<content>
${ref.content}
</content>
</source>`
      )
      .join("\n\n");
  }

  private async generateInfobox(
    subject: string,
    category: Category,
    languageName: string,
    knowledgeBase: string
  ): Promise<Record<string, string>> {
    const schema = INFOBOX_SCHEMAS[category];

    const { object } = await generateObject({
      model: mistral("mistral-large-latest"),
      schema,
      prompt: `
Based on the following research about "${subject}", extract accurate factual information for an encyclopedia infobox.

IMPORTANT:
- Only use facts explicitly stated in the sources
- Use "N/A" for any information not found in the research
- All values should be in ${languageName}
- Be precise with dates, numbers, and names

<research>
${knowledgeBase}
</research>

Generate the infobox data for ${subject} (${category}).
`.trim(),
    });

    return object as Record<string, string>;
  }

  private async generateArticle(
    subject: string,
    category: Category,
    languageName: string,
    knowledgeBase: string
  ): Promise<string> {
    const { text } = await generateText({
      model: mistral("mistral-large-latest"),
      system: this.buildSystemPrompt(languageName, category),
      prompt: `
Write an encyclopedia article about "${subject}".

<sources>
${knowledgeBase}
</sources>

Write the article now, following all guidelines precisely.
`.trim(),
    });

    return text;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private async saveToFiles(
    language: Language,
    subject: string,
    infobox: Record<string, string>,
    references: Reference[],
    content: string
  ): Promise<void> {
    const slug = this.slugify(subject);
    const dir = join(process.cwd(), "content", language, slug);

    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "facts.json"),
      JSON.stringify(infobox, null, 2),
      "utf-8"
    );

    // Save references with more detail
    const refsForExport = references.map((ref, i) => ({
      id: i + 1,
      title: ref.title,
      url: ref.url,
      domain: ref.domain,
      publishedDate: ref.publishedDate,
    }));

    await writeFile(
      join(dir, "references.json"),
      JSON.stringify(refsForExport, null, 2),
      "utf-8"
    );

    await writeFile(join(dir, "content.md"), content, "utf-8");

    console.log(`📁 Saved to content/${language}/${slug}/`);
  }

  private buildSystemPrompt(languageName: string, category: Category): string {
    return `
<role>
You are a world-class encyclopedia writer with deep expertise in ${category}. 
You write with the authority and precision of Encyclopædia Britannica contributors.
Your goal is to produce content that rivals the world's foremost specialists on any topic.
</role>

<writing_principles>

  <information_density>
    Every sentence must convey substantive information. Avoid:
    - Filler phrases ("It is worth noting that...", "Interestingly...")
    - Vague qualifiers ("very", "quite", "somewhat")
    - Redundant statements that repeat what was just said
    - Unnecessary preambles before getting to the point
    
    Prefer:
    - Specific facts: dates, numbers, names, places
    - Precise technical terminology (defined on first use)
    - Concrete examples that illustrate abstract concepts
    - Cause-and-effect relationships
  </information_density>

  <encyclopedic_tone>
    Write with detached authority. The prose should be:
    - Objective: present facts without editorial judgment
    - Neutral: avoid superlatives ("greatest", "most important") unless directly quoting
    - Formal but accessible: no colloquialisms, but not impenetrably academic
    - Passive voice is acceptable when it keeps focus on the subject
    
    Never use:
    - First person ("I", "we")
    - Second person ("you")
    - Rhetorical questions
    - Exclamation marks
    - Editorializing ("remarkably", "unfortunately", "of course")
  </encyclopedic_tone>

  <formatting_restraint>
    Use formatting sparingly and purposefully:
    
    **Bold**: Only for the article subject on first mention in the lead paragraph.
    Do NOT bold every important term—this is not a textbook.
    
    *Italic*: Only for:
    - Titles of works (books, films, compositions, artworks)
    - Foreign words not naturalized in ${languageName}
    - Scientific names (genus/species)
    
    Headings (##): 
    - Use for major thematic sections
    - Keep headings short and descriptive (2-5 words)
    - Avoid questions as headings
    
    Lists:
    - Use sparingly, only when enumeration genuinely aids comprehension
    - Prefer prose for flowing narrative
  </formatting_restraint>

  <structure>
    <lead_paragraph>
      The opening paragraph (no heading) must:
      - Define the subject in the first sentence
      - State why it matters (significance)
      - Provide essential context (dates, places, categories)
      - Summarize the most important points
      - Stand alone as a complete mini-article
      
      The lead should answer: Who/What? When? Where? Why significant?
    </lead_paragraph>
    
    <body_sections>
      Organize thematically, not chronologically unless chronology is essential.
      Each section should:
      - Open with a topic sentence stating the section's main point
      - Provide supporting evidence from sources
      - Connect logically to adjacent sections
      
      Typical section progression varies by category:
      - People: Early life → Career → Major works/achievements → Legacy
      - Companies: History → Products/Services → Operations → Impact
      - Cities: Geography → History → Economy → Culture → Demographics
    </body_sections>
  </structure>

  <citations>
    Cite sources using bracket notation [1], [2], etc.
    - Cite specific facts, statistics, and direct claims
    - Multiple sources for a single claim: [1][3]
    - Do not over-cite obvious or general statements
    - Place citations at the end of the sentence, before the period
  </citations>

  <accuracy>
    - Use ONLY information explicitly stated in provided sources
    - Never invent, extrapolate, or assume facts
    - If sources conflict, either note the discrepancy or cite the more authoritative source
    - Use "N/A" or omit rather than guess unknown information
    - Dates, numbers, and proper names must exactly match sources
  </accuracy>

  <language>
    Write entirely in ${languageName}.
    - Translate concepts appropriately for the target language
    - Use standard conventions for dates, numbers, and measurements
    - Preserve proper names in their original form unless a standard translation exists
  </language>

</writing_principles>

<quality_checklist>
Before finishing, verify:
□ Lead paragraph defines the subject and establishes significance
□ Every sentence adds new information
□ No unsupported claims (all facts cited)
□ Bold used only once for subject name
□ Italic used only for titles and foreign terms
□ Neutral tone throughout (no editorializing)
□ Headings are short and descriptive
□ Article flows logically from section to section
</quality_checklist>
`.trim();
  }

  private extractReferences(steps: unknown[]): Reference[] {
    const references: Reference[] = [];

    for (const step of steps as Array<{ toolResults?: unknown[] }>) {
      if (!step.toolResults) continue;

      for (const result of step.toolResults as Array<{ result?: unknown }>) {
        const searchResult = result.result as
          | {
              results?: Array<{
                title?: string;
                url?: string;
                text?: string;
                publishedDate?: string;
              }>;
            }
          | undefined;

        if (!searchResult?.results) continue;

        for (const item of searchResult.results) {
          if (item.url) {
            const domain = this.extractDomain(item.url);
            references.push({
              title: item.title ?? "Untitled",
              url: item.url,
              content: item.text ?? "",
              domain,
              publishedDate: item.publishedDate,
            });
          }
        }
      }
    }

    return references;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return "unknown";
    }
  }
}
