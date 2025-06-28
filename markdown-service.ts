import { marked } from 'marked';
import { Flashcard, HtmlFlashcard } from './flashcard';

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
		if (!markdown.includes('\n')) {
			return marked.parseInline(markdown) as string;
		}
		return marked.parse(markdown) as string;
	}

	// Convert Flashcard with markdown fields to HtmlFlashcard with HTML fields
	static toHtmlFlashcard(flashcard: Flashcard): HtmlFlashcard {
		const htmlFields: Record<string, string> = {};
		for (const [fieldName, fieldValue] of Object.entries(flashcard.contentFields)) {
			htmlFields[fieldName] = this.renderToHtml(fieldValue);
		}
		
		return {
			sourcePath: flashcard.sourcePath,
			lineStart: flashcard.lineStart,
			lineEnd: flashcard.lineEnd,
			noteType: flashcard.noteType,
			ankiId: flashcard.ankiId,
			tags: flashcard.tags,
			htmlFields: htmlFields
		};
	}
}
