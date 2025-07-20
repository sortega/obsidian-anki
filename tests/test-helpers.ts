/**
 * Shared test utilities and helpers
 */

/**
 * Creates a Document object from HTML string for testing purposes
 * @param html The HTML string to parse
 * @returns A Document object parsed from the HTML
 */
export const createDocument = (html: string): Document => {
	const parser = new DOMParser();
	return parser.parseFromString(html, 'text/html');
};

/**
 * Creates a mock HtmlFlashcard for testing with Document objects
 * @param fields Object with field names and their HTML content
 * @param options Optional properties to override defaults
 * @returns A mock HtmlFlashcard object
 */
export const createMockHtmlFlashcard = (
	fields: Record<string, string>,
	options: Partial<{
		sourcePath: string;
		lineStart: number;
		lineEnd: number;
		noteType: string;
		tags: string[];
		warnings: string[];
		deck: string;
		ankiId?: number;
	}> = {}
) => {
	const htmlFields: Record<string, Document> = {};
	
	// Convert string fields to Document objects
	for (const [fieldName, htmlContent] of Object.entries(fields)) {
		htmlFields[fieldName] = createDocument(htmlContent);
	}
	
	return {
		sourcePath: options.sourcePath || 'test.md',
		lineStart: options.lineStart || 1,
		lineEnd: options.lineEnd || 5,
		noteType: options.noteType || 'Basic',
		htmlFields,
		tags: options.tags || [],
		warnings: options.warnings || [],
		deck: options.deck || 'Default',
		...(options.ankiId !== undefined && { ankiId: options.ankiId })
	};
};