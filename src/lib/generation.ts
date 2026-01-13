export class ArticleGeneration {
  constructor(
    private readonly params: {
      category: string;
      language: string;
      subject: string;
    }
  ) {}

  async start() {
    console.log(
      `Generating article about ${this.params.subject} in ${this.params.language} (${this.params.category})`
    );
  }
}
