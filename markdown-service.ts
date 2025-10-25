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
		
		// Convert Obsidian image wikilinks to HTML img tags before markdown processing
		const processedMarkdown = this.convertImageWikilinks(markdown);
		
		if (!processedMarkdown.includes('\n')) {
			return marked.parseInline(processedMarkdown) as string;
		}
		return marked.parse(processedMarkdown) as string;
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

	/**
	 * Convert Obsidian image wikilinks (![[image.ext]]) to HTML img tags
	 * Only processes files with image extensions: png, jpg, jpeg, gif, webp, svg, bmp
	 */
	private static convertImageWikilinks(markdown: string): string {
		// Pattern matches: ![[filename.ext]] or ![[filename.ext|display]]
		// Only matches image extensions (case-insensitive)
		const wikilinkPattern = /!\[\[([^|\]]+\.(png|jpe?g|gif|webp|svg|bmp))(\|([^\]]*)?)?\]\]/gi;
		
		return markdown.replace(wikilinkPattern, (_match, filename, _extension, _displayPart, displayValue) => {
			// Build img tag with src attribute
			let imgTag = `<img src="${filename}"`;
			
			// Parse display properties if present (only if displayValue is not empty)
			if (displayValue && displayValue.trim()) {
				const sizeAttributes = this.parseDisplayProperties(displayValue);
				if (sizeAttributes) {
					imgTag += ` ${sizeAttributes}`;
				}
			}
			
			imgTag += '>';
			return imgTag;
		});
	}

	/**
	 * Parse display properties from wikilink syntax
	 * Examples: "100" -> 'width="100"', "100x50" -> 'width="100" height="50"'
	 */
	private static parseDisplayProperties(displayValue: string): string | null {
		if (!displayValue.trim()) {
			return null;
		}
		
		// Check for width x height format (e.g., "100x50")
		const dimensionMatch = displayValue.match(/^(\d+)x(\d+)$/);
		if (dimensionMatch) {
			const width = dimensionMatch[1];
			const height = dimensionMatch[2];
			return `width="${width}" height="${height}"`;
		}
		
		// Check for width only format (e.g., "100")
		const widthMatch = displayValue.match(/^(\d+)$/);
		if (widthMatch) {
			const width = widthMatch[1];
			return `width="${width}"`;
		}
		
		// Invalid format - ignore
		return null;
	}
}
