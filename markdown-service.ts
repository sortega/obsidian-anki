import {marked} from 'marked';
import {Flashcard, HtmlFlashcard} from './flashcard';
import {OBSIDIAN_FILE_TAG_PREFIX, OBSIDIAN_SYNC_TAG, OBSIDIAN_VAULT_TAG_PREFIX} from './constants';

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

	// Convert Flashcard with Markdown fields to HtmlFlashcard with HTML fields
	static toHtmlFlashcard(flashcard: Flashcard, vaultName: string): HtmlFlashcard {
		const htmlFields: Record<string, Document> = {};
		const parser = new DOMParser();
		for (const [fieldName, fieldValue] of Object.entries(flashcard.contentFields)) {
			const htmlString = this.renderToHtml(fieldValue);
			htmlFields[fieldName] = parser.parseFromString(htmlString, 'text/html');
		}
		
		const tags = [
			...flashcard.tags,
			OBSIDIAN_SYNC_TAG,
			`${OBSIDIAN_VAULT_TAG_PREFIX}${vaultName}`,
		];

		if (flashcard.sourcePath) {
			tags.push(`${OBSIDIAN_FILE_TAG_PREFIX}${encodeURI(flashcard.sourcePath)}`);
		}

		tags.sort()

		return {
			sourcePath: flashcard.sourcePath,
			lineStart: flashcard.lineStart,
			lineEnd: flashcard.lineEnd,
			noteType: flashcard.noteType,
			ankiId: flashcard.ankiId,
			tags,
			htmlFields,
			warnings: flashcard.warnings,
			deck: flashcard.deck
		};
	}
}
