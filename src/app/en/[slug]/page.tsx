import { notFound } from "next/navigation";
import { getArticle } from "@/lib/content";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const article = await getArticle(slug, "en");

  if (!article) {
    return { title: slug };
  }

  const title = slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return {
    title: `${title} - WikiStral`,
    description: article.content.slice(0, 160).replace(/[#*\[\]]/g, ""),
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const article = await getArticle(slug, "en");

  if (!article) {
    notFound();
  }

  const title = slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <div className="article-container">
      <article className="article">
        <header className="article-header">
          <h1>{title}</h1>
        </header>

        <div className="article-layout">
          <aside className="infobox">
            <table>
              <caption className="infobox-title">Facts</caption>
              <tbody>
                {Object.entries(article.facts).map(([key, value]) => (
                  <tr key={key}>
                    <th className="infobox-label">
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                    </th>
                    <td className="infobox-value">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </aside>

          <div className="article-content">
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(article.content),
              }}
            />

            {article.references.length > 0 && (
              <section className="references">
                <h2>References</h2>
                <ol>
                  {article.references.map((ref) => (
                    <li key={ref.id}>
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {ref.title}
                      </a>
                      <span className="ref-domain"> ({ref.domain})</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}

function renderMarkdown(text: string): string {
  let html = text;

  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(/^## (.*$)/gm, "<h2>$1</h2>");
  html = html.replace(/^### (.*$)/gm, "<h3>$1</h3>");
  html = html.replace(/^\* (.*$)/gm, "<li>$1</li>");
  html = html.replace(/\[(\d+)\]/g, '<sup class="citation">[$1]</sup>');
  html = html.replace(/\n\n/g, "</p><p>");

  return `<p>${html}</p>`;
}
