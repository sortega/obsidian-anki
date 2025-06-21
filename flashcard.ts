export interface FlashcardData {
	note_type?: string;
	anki_id?: string;
	tags?: string[] | string;
	[key: string]: any;
}

export interface FlashcardParseResult {
	data?: FlashcardData;
	error?: string;
}

export class BlockFlashcardParser {
	static parseFlashcard(source: string): FlashcardParseResult {
		try {
			// Simple YAML parsing - look for key: value pairs
			const lines = source.split('\n');
			const data: FlashcardData = {};
			let currentKey: string | null = null;
			let currentValue: string[] = [];
			let inMultilineValue = false;
			const invalidLines: string[] = [];

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const trimmedLine = line.trim();
				
				// Skip empty lines
				if (!trimmedLine) {
					if (inMultilineValue) {
						currentValue.push('');
					}
					continue;
				}

				// Check for new key: value pair
				const keyValueMatch = trimmedLine.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
				
				if (keyValueMatch) {
					// Save previous key-value if exists
					if (currentKey && currentValue.length > 0) {
						data[currentKey] = this.processFieldValue(currentValue.join('\n'));
					}

					currentKey = keyValueMatch[1];
					const value = keyValueMatch[2];

					if (value === '|') {
						// Multi-line value starting
						inMultilineValue = true;
						currentValue = [];
					} else if (value.trim()) {
						// Single line value
						inMultilineValue = false;
						currentValue = [value];
					} else {
						// Empty value
						inMultilineValue = false;
						currentValue = [''];
					}
				} else if (inMultilineValue && currentKey) {
					// Continuation of multi-line value
					// Remove leading spaces but preserve relative indentation
					const unindentedLine = line.replace(/^  /, '');
					currentValue.push(unindentedLine);
				} else if (trimmedLine.startsWith('-') && currentKey === 'tags') {
					// Handle tags as list
					if (!inMultilineValue) {
						currentValue = [];
						inMultilineValue = true;
					}
					const tag = trimmedLine.replace(/^-\s*/, '').trim();
					if (tag) {
						currentValue.push(tag);
					}
				} else {
					// Invalid line format
					invalidLines.push(`Line ${i + 1}: "${trimmedLine}"`);
				}
			}

			// Save the last key-value pair
			if (currentKey && (currentValue.length > 0 || inMultilineValue)) {
				data[currentKey] = this.processFieldValue(currentValue.join('\n'));
			}

			// Special handling for tags
			if (data.tags && typeof data.tags === 'string') {
				// If tags is a string with newlines, split into array
				data.tags = data.tags.split('\n').map((tag: string) => tag.trim()).filter((tag: string) => tag);
			}

			if (Object.keys(data).length === 0) {
				return {
					error: invalidLines.length > 0 
						? `No valid key:value pairs found. Invalid lines:\n${invalidLines.join('\n')}`
						: 'No content found in flashcard block'
				};
			}

			if (invalidLines.length > 0) {
				return {
					error: `Invalid YAML format. Problem lines:\n${invalidLines.join('\n')}`
				};
			}

			return { data };
		} catch (error) {
			return {
				error: `Parsing error: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}

	private static processFieldValue(value: string): string | string[] {
		const trimmed = value.trim();
		
		// If it's a multi-line string with actual content, return as-is
		if (trimmed.includes('\n')) {
			return trimmed;
		}
		
		return trimmed;
	}
}