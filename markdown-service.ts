import { marked } from 'marked';

export class MarkdownService {
	private static initialized = false;

	static initialize() {
		if (this.initialized) return;

		// Configure marked for consistent HTML output
		marked.setOptions({
			gfm: true,           // GitHub Flavored Markdown
			breaks: false,       // Don't convert \n to <br>
			pedantic: false      // Don't be strict about original Markdown
		});

		this.initialized = true;
	}

	// Single rendering method for all use cases
	static renderToHtml(markdown: string): string {
		this.initialize(); // Ensure marked is configured
		return marked.parse(markdown) as string;
	}
}