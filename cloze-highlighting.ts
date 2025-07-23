/**
 * Recursive cloze deletion highlighting utilities
 */
export class ClozeHighlighter {
	/**
	 * Recursively processes cloze deletions, handling nested patterns.
	 * Supports both {{c1::answer}} and {{c1::answer::hint}} formats.
	 * 
	 * @param text The text containing cloze deletions to process
	 * @returns HTML with cloze deletions wrapped in spans with color classes
	 */
	static highlightClozes(text: string): string {
		let result = '';
		let i = 0;
		
		while (i < text.length) {
			// Look for the start of a cloze deletion
			const clozeStart = text.indexOf('{{c', i);
			if (clozeStart === -1) {
				// No more cloze deletions, append the rest
				result += text.substring(i);
				break;
			}
			
			// Append text before the cloze deletion
			result += text.substring(i, clozeStart);
			
			// Parse the cloze deletion
			const clozeMatch = this.parseClozeAtPosition(text, clozeStart);
			if (clozeMatch) {
				const { clozeNum, content, endPos } = clozeMatch;
				// Recursively process the content
				const processedContent = this.highlightClozes(content);
				const clozeClass = `cloze-${(clozeNum - 1) % 10 + 1}`;
				result += `<span class="cloze-deletion ${clozeClass}" data-cloze=${clozeNum}>${processedContent}</span>`;
				i = endPos;
			} else {
				// Not a valid cloze deletion, just append the characters
				result += text.substring(clozeStart, clozeStart + 3);
				i = clozeStart + 3;
			}
		}
		
		return result;
	}
	
	/**
	 * Parses a cloze deletion starting at the given position.
	 * Handles balanced braces to support nested clozes.
	 */
	private static parseClozeAtPosition(text: string, startPos: number): { clozeNum: number, content: string, endPos: number } | null {
		// Check if it starts with {{c followed by a number
		const match = text.substring(startPos).match(/^\{\{c(\d+)::/);
		if (!match) {
			return null;
		}
		
		const clozeNum = parseInt(match[1]);
		const contentStart = startPos + match[0].length;
		
		// Find the matching }} by counting balanced braces
		let braceCount = 2; // We started with {{
		let pos = contentStart;
		let lastDoubleColon = -1;
		
		while (pos < text.length && braceCount > 0) {
			if (text.substring(pos, pos + 2) === '{{') {
				braceCount += 2;
				pos += 2;
			} else if (text.substring(pos, pos + 2) === '}}') {
				braceCount -= 2;
				if (braceCount === 0) {
					// Found the end of our cloze deletion
					const fullContent = text.substring(contentStart, pos);
					
					// Check for hint (::hint at the end, not inside nested clozes)
					let content = fullContent;
					if (lastDoubleColon !== -1 && this.isHintSeparator(fullContent, lastDoubleColon - contentStart)) {
						content = fullContent.substring(0, lastDoubleColon - contentStart);
					}
					
					return {
						clozeNum,
						content,
						endPos: pos + 2
					};
				}
				pos += 2;
			} else if (text.substring(pos, pos + 2) === '::' && braceCount === 2) {
				// This might be a hint separator (only at the top level)
				lastDoubleColon = pos;
				pos += 2;
			} else {
				pos++;
			}
		}
		
		return null; // Unmatched braces
	}
	
	/**
	 * Checks if a :: at the given position is a hint separator (not part of nested content)
	 */
	private static isHintSeparator(content: string, colonPos: number): boolean {
		// Count braces before this position to see if we're at the top level
		let braceCount = 0;
		for (let i = 0; i < colonPos; i++) {
			if (content.substring(i, i + 2) === '{{') {
				braceCount += 2;
				i++; // Skip the next character
			} else if (content.substring(i, i + 2) === '}}') {
				braceCount -= 2;
				i++; // Skip the next character
			}
		}
		return braceCount === 0; // We're at the top level
	}
}
