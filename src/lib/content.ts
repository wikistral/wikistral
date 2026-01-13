import { readFileSync, existsSync } from "fs";
import { join } from "path";

const CONTENT_REPO = "https://raw.githubusercontent.com/wikistral/content/main";

export interface ArticleFacts {
  country?: string;
  region?: string;
  population?: string;
  area?: string;
  timezone?: string;
  mayor?: string;
  founded?: string;
  type?: string;
  industry?: string;
  founders?: string;
  headquarters?: string;
  keyPeople?: string;
  employees?: string;
  website?: string;
  born?: string;
  died?: string;
  nationality?: string;
  occupation?: string;
  yearsActive?: string;
  knownFor?: string;
  notableWorks?: string;
  [key: string]: string | undefined;
}

export interface ArticleReference {
  id: number;
  title: string;
  url: string;
  domain: string;
  publishedDate?: string;
}

export interface ArticleContent {
  slug: string;
  language: string;
  facts: ArticleFacts;
  references: ArticleReference[];
  content: string;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

async function fetchFromGitHub(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

export async function getArticle(
  slug: string,
  language: string,
): Promise<ArticleContent | null> {
  const slugPath = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const contentDir = join(process.cwd(), "content", language, slugPath);
  const factsPath = join(contentDir, "facts.json");
  const refsPath = join(contentDir, "references.json");
  const contentPath = join(contentDir, "content.md");

  if (existsSync(contentDir) && existsSync(factsPath)) {
    const facts = JSON.parse(readFileSync(factsPath, "utf-8")) as ArticleFacts;
    const refs = existsSync(refsPath)
      ? (JSON.parse(readFileSync(refsPath, "utf-8")) as ArticleReference[])
      : [];
    const articleContent = existsSync(contentPath)
      ? readFileSync(contentPath, "utf-8")
      : "";

    return {
      slug,
      language,
      facts,
      references: refs,
      content: articleContent,
    };
  }

  if (isProduction()) {
    const [factsJson, refsJson, md] = await Promise.all([
      fetchFromGitHub(`${CONTENT_REPO}/${language}/${slugPath}/facts.json`),
      fetchFromGitHub(
        `${CONTENT_REPO}/${language}/${slugPath}/references.json`,
      ),
      fetchFromGitHub(`${CONTENT_REPO}/${language}/${slugPath}/content.md`),
    ]);

    if (!factsJson) return null;

    return {
      slug,
      language,
      facts: JSON.parse(factsJson),
      references: refsJson ? JSON.parse(refsJson) : [],
      content: md || "",
    };
  }

  return null;
}

export async function getArticleList(language: string): Promise<string[]> {
  const contentDir = join(process.cwd(), "content", language);

  if (!existsSync(contentDir)) return [];

  const slugs: string[] = [];
  const entries = require("fs").readdirSync(contentDir, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      slugs.push(entry.name);
    }
  }

  return slugs;
}
