import { App, Modal, Notice, TFile, MarkdownView } from 'obsidian';
import { AnkiService, AnkiNote } from './anki-service';
import { Flashcard } from './flashcard';
import { SyncAnalysis } from './sync-analysis';
import { MarkdownService } from './markdown-service';
import * as yaml from 'js-yaml';

export interface OperationResult {
	flashcard: Flashcard;
	success: boolean;
	error?: string;
	noteId?: number;
	operation: 'create' | 'update' | 'delete';
}

export interface SyncResults {
	totalOperations: number;
	successfulOperations: OperationResult[];
	failedOperations: OperationResult[];
	isPartialSuccess: boolean;
	startTime: Date;
	endTime: Date;
}

export class SyncExecutionModal extends Modal {
	private analysis: SyncAnalysis;
	private ankiService: AnkiService;
	private defaultDeck: string;
	private vaultName: string;
	private progressBar: HTMLElement;
	private progressText: HTMLElement;
	private statusText: HTMLElement;
	private successCountText: HTMLElement;
	private failureCountText: HTMLElement;
	private results: SyncResults;

	constructor(app: App, analysis: SyncAnalysis, ankiService: AnkiService, defaultDeck: string, vaultName: string) {
		super(app);
		this.analysis = analysis;
		this.ankiService = ankiService;
		this.defaultDeck = defaultDeck;
		this.vaultName = vaultName;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Modal title
		contentEl.createEl('h2', { text: 'Syncing to Anki' });

		// Progress section
		const progressSection = contentEl.createEl('div', { cls: 'sync-progress-section' });
		
		// Progress text
		this.progressText = progressSection.createEl('div', { 
			cls: 'sync-progress-text',
			text: 'Starting sync...'
		});

		// Progress bar container
		const progressContainer = progressSection.createEl('div', { cls: 'sync-progress-container' });
		this.progressBar = progressContainer.createEl('div', { cls: 'sync-progress-bar' });

		// Status text
		this.statusText = progressSection.createEl('div', { 
			cls: 'sync-status-text',
			text: 'Preparing to sync...'
		});

		// Success/Failure counters
		const countersSection = progressSection.createEl('div', { cls: 'sync-counters' });
		this.successCountText = countersSection.createEl('div', { 
			cls: 'sync-counter sync-counter-success',
			text: '✅ Successful: 0'
		});
		this.failureCountText = countersSection.createEl('div', { 
			cls: 'sync-counter sync-counter-failure',
			text: '❌ Failed: 0'
		});

		// Start sync execution
		this.executeSync();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async executeSync() {
		try {
			let completed = 0;
			const totalOperations = this.analysis.newFlashcards.length + 
								   this.analysis.changedFlashcards.length + 
								   this.analysis.deletedAnkiNotes.length;

			// Initialize results tracking
			this.results = {
				totalOperations,
				successfulOperations: [],
				failedOperations: [],
				isPartialSuccess: false,
				startTime: new Date(),
				endTime: new Date()
			};

			this.updateProgress(0, `Starting sync (${totalOperations} operations)...`);

			// Create new flashcards
			const createdNoteIds: Array<{ flashcard: Flashcard, noteId: number }> = [];
			for (const flashcard of this.analysis.newFlashcards) {
				try {
					this.updateProgress(completed / totalOperations, `Creating: ${flashcard.sourcePath}:${flashcard.lineStart}`);
					
					// Convert markdown fields to HTML
					const htmlFlashcard = this.renderFlashcardToHtml(flashcard);
					const noteId = await this.ankiService.createNote(htmlFlashcard, this.defaultDeck, this.vaultName);
					createdNoteIds.push({ flashcard, noteId });
					
					// Track successful operation
					this.results.successfulOperations.push({
						flashcard,
						success: true,
						noteId,
						operation: 'create'
					});
					this.updateCounters();
					
					console.log(`✅ Created note ${noteId} for ${flashcard.sourcePath}:${flashcard.lineStart}`);
				} catch (error) {
					// Track failed operation with user-friendly error
					this.results.failedOperations.push({
						flashcard,
						success: false,
						error: this.parseUserFriendlyError(error, 'create'),
						operation: 'create'
					});
					this.updateCounters();
					
					console.error(`❌ Failed to create note for ${flashcard.sourcePath}:${flashcard.lineStart}:`, error);
				}
				completed++;
			}

			// Update changed flashcards
			for (const [ankiNote, flashcard] of this.analysis.changedFlashcards) {
				try {
					this.updateProgress(completed / totalOperations, `Updating: ${flashcard.sourcePath}:${flashcard.lineStart}`);
					
					// Convert markdown fields to HTML
					const htmlFlashcard = this.renderFlashcardToHtml(flashcard);
					await this.ankiService.updateNote(ankiNote.noteId, htmlFlashcard, this.vaultName);
					
					// Track successful operation
					this.results.successfulOperations.push({
						flashcard,
						success: true,
						noteId: ankiNote.noteId,
						operation: 'update'
					});
					this.updateCounters();
					
					console.log(`✅ Updated note ${ankiNote.noteId} for ${flashcard.sourcePath}:${flashcard.lineStart}`);
				} catch (error) {
					// Track failed operation with user-friendly error
					this.results.failedOperations.push({
						flashcard,
						success: false,
						error: this.parseUserFriendlyError(error, 'update'),
						noteId: ankiNote.noteId,
						operation: 'update'
					});
					this.updateCounters();
					
					console.error(`❌ Failed to update note ${ankiNote.noteId}:`, error);
				}
				completed++;
			}

			// Delete removed flashcards
			if (this.analysis.deletedAnkiNotes.length > 0) {
				try {
					this.updateProgress(completed / totalOperations, `Deleting ${this.analysis.deletedAnkiNotes.length} removed notes...`);
					
					const noteIds = this.analysis.deletedAnkiNotes.map(note => note.noteId);
					await this.ankiService.deleteNotes(noteIds);
					
					// Track successful delete operations
					for (const deletedNote of this.analysis.deletedAnkiNotes) {
						// Convert AnkiNote to Flashcard for tracking
						const flashcardForTracking: Flashcard = {
							sourcePath: '',
							lineStart: 0,
							lineEnd: 0,
							noteType: deletedNote.modelName,
							tags: deletedNote.tags || [],
							contentFields: {},
							ankiId: deletedNote.noteId
						};
						
						this.results.successfulOperations.push({
							flashcard: flashcardForTracking,
							success: true,
							noteId: deletedNote.noteId,
							operation: 'delete'
						});
					}
					this.updateCounters();
					
					console.log(`✅ Deleted ${noteIds.length} notes:`, noteIds);
				} catch (error) {
					// Track failed delete operations
					for (const deletedNote of this.analysis.deletedAnkiNotes) {
						const flashcardForTracking: Flashcard = {
							sourcePath: '',
							lineStart: 0,
							lineEnd: 0,
							noteType: deletedNote.modelName,
							tags: deletedNote.tags || [],
							contentFields: {},
							ankiId: deletedNote.noteId
						};
						
						this.results.failedOperations.push({
							flashcard: flashcardForTracking,
							success: false,
							error: this.parseUserFriendlyError(error, 'delete'),
							noteId: deletedNote.noteId,
							operation: 'delete'
						});
					}
					this.updateCounters();
					
					console.error(`❌ Failed to delete notes:`, error);
				}
				completed += this.analysis.deletedAnkiNotes.length;
			}

			// Update Obsidian files with new anki_id values
			if (createdNoteIds.length > 0) {
				this.updateProgress(0.9, 'Updating Obsidian files with Anki IDs...');
				await this.updateObsidianFiles(createdNoteIds);
			}

			// Finalize results
			this.results.endTime = new Date();
			this.results.isPartialSuccess = this.results.failedOperations.length > 0;
			
			this.updateProgress(1, 'Sync complete!');
			
			// Show results based on success/failure
			if (this.results.failedOperations.length === 0) {
				// Complete success
				const successMessage = `Sync completed successfully!\n` +
					`• Created: ${this.results.successfulOperations.filter(op => op.operation === 'create').length} flashcards\n` +
					`• Updated: ${this.results.successfulOperations.filter(op => op.operation === 'update').length} flashcards\n` +
					`• Deleted: ${this.results.successfulOperations.filter(op => op.operation === 'delete').length} flashcards`;
				
				new Notice(successMessage);
				setTimeout(() => this.close(), 2000);
			} else {
				// Partial success or complete failure - show detailed results
				this.showDetailedResults();
			}

		} catch (error) {
			console.error('Sync execution failed:', error);
			new Notice(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
			this.close();
		}
	}

	private async updateObsidianFiles(createdNoteIds: Array<{ flashcard: Flashcard, noteId: number }>) {
		const fileUpdates = new Map<string, Array<{ flashcard: Flashcard, noteId: number }>>();
		
		// Group by file path
		for (const item of createdNoteIds) {
			const filePath = item.flashcard.sourcePath;
			if (!fileUpdates.has(filePath)) {
				fileUpdates.set(filePath, []);
			}
			fileUpdates.get(filePath)!.push(item);
		}

		// Update each file
		for (const [filePath, items] of fileUpdates) {
			try {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (!file || !(file instanceof TFile)) {
					console.warn(`File not found: ${filePath}`);
					continue;
				}

				const content = await this.app.vault.read(file);
				let updatedContent = content;

				// Sort by line number descending to avoid line number shifts
				items.sort((a, b) => b.flashcard.lineStart - a.flashcard.lineStart);

				for (const { flashcard, noteId } of items) {
					updatedContent = this.addAnkiIdToFlashcard(updatedContent, flashcard, noteId);
				}

				if (updatedContent !== content) {
					await this.app.vault.modify(file, updatedContent);
					console.log(`✅ Updated ${filePath} with ${items.length} anki_id values`);
				}
			} catch (error) {
				console.error(`❌ Failed to update file ${filePath}:`, error);
				new Notice(`Failed to update file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	private addAnkiIdToFlashcard(content: string, flashcard: Flashcard, noteId: number): string {
		const lines = content.split('\n');
		
		// Find the flashcard block
		let blockStart = -1;
		let blockEnd = -1;
		
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim() === '```flashcard') {
				blockStart = i;
				// Find the end of this block
				for (let j = i + 1; j < lines.length; j++) {
					if (lines[j].trim() === '```') {
						blockEnd = j;
						break;
					}
				}
				
				// Check if this is the right block by line number (approximate match)
				if (blockStart + 1 >= flashcard.lineStart - 2 && blockStart + 1 <= flashcard.lineStart + 2) {
					break;
				}
			}
		}
		
		if (blockStart === -1 || blockEnd === -1) {
			console.warn(`Could not find flashcard block at line ${flashcard.lineStart} in ${flashcard.sourcePath}`);
			return content;
		}
		
		// Parse the YAML content and add anki_id
		const yamlLines = lines.slice(blockStart + 1, blockEnd);
		const yamlContent = yamlLines.join('\n');
		
		try {
			// Add anki_id to the YAML content
			const updatedYaml = this.upsertAnkiIdInYaml(yamlContent, noteId);
			
			// Replace the lines
			const newLines = [...lines];
			newLines.splice(blockStart + 1, blockEnd - blockStart - 1, ...updatedYaml.split('\n'));
			
			return newLines.join('\n');
		} catch (error) {
			console.warn(`Failed to parse YAML for ${flashcard.sourcePath}:${flashcard.lineStart}:`, error);
			return content;
		}
	}

	private upsertAnkiIdInYaml(yamlContent: string, noteId: number): string {
		const data = yaml.load(yamlContent) as Record<string, any> || {};
		data['AnkiId'] = noteId;
		return yaml.dump(data, {
			indent: 2,
			lineWidth: -1, // Disable line wrapping
			noRefs: true,  // Don't use references
			sortKeys: false // Preserve order
		});
	}

	private renderFlashcardToHtml(flashcard: Flashcard): Flashcard {
		const htmlContentFields: Record<string, string> = {};
		
		// Render each markdown field to HTML using MarkdownService
		for (const [fieldName, fieldValue] of Object.entries(flashcard.contentFields)) {
			htmlContentFields[fieldName] = MarkdownService.renderToHtml(fieldValue);
		}
		
		// Return a new flashcard with HTML content
		return {
			...flashcard,
			contentFields: htmlContentFields
		};
	}


	private updateProgress(progress: number, statusText: string) {
		const percentage = Math.round(progress * 100);
		this.progressBar.style.width = `${percentage}%`;
		this.progressText.setText(`${percentage}% complete`);
		this.statusText.setText(statusText);
	}

	private updateCounters() {
		const successCount = this.results.successfulOperations.length;
		const failureCount = this.results.failedOperations.length;
		
		this.successCountText.setText(`✅ Successful: ${successCount}`);
		this.failureCountText.setText(`❌ Failed: ${failureCount}`);
	}

	private showDetailedResults() {
		// Replace current content with detailed results
		const { contentEl } = this;
		contentEl.empty();

		// Modal title
		contentEl.createEl('h2', { text: 'Sync Results' });

		// Summary section
		const summarySection = contentEl.createEl('div', { cls: 'sync-results-summary' });
		
		const totalOps = this.results.successfulOperations.length + this.results.failedOperations.length;
		const successRate = totalOps > 0 ? Math.round((this.results.successfulOperations.length / totalOps) * 100) : 0;
		
		summarySection.createEl('div', { 
			cls: `sync-result-item ${this.results.isPartialSuccess ? 'sync-result-warning' : 'sync-result-success'}`,
			text: this.results.isPartialSuccess 
				? `⚠️ Partial Success: ${successRate}% (${this.results.successfulOperations.length}/${totalOps})`
				: `✅ Complete Success: ${this.results.successfulOperations.length} operations`
		});

		// Detailed sections
		if (this.results.successfulOperations.length > 0) {
			this.createResultSection(summarySection, 'Successful Operations', this.results.successfulOperations, 'success');
		}

		if (this.results.failedOperations.length > 0) {
			this.createResultSection(summarySection, 'Failed Operations', this.results.failedOperations, 'failure');
		}

		// Action buttons
		const buttonContainer = contentEl.createEl('div', { cls: 'sync-button-container' });
		
		const closeButton = buttonContainer.createEl('button', { 
			text: 'Close',
			cls: 'mod-cta'
		});
		closeButton.onclick = () => this.close();

	}

	private createResultSection(container: HTMLElement, title: string, operations: OperationResult[], type: 'success' | 'failure') {
		const details = container.createEl('details', { cls: `sync-result-section sync-result-${type}` });
		const summary = details.createEl('summary', { cls: 'sync-result-summary' });
		
		summary.createEl('span', { 
			cls: 'sync-result-title',
			text: `${title} (${operations.length})`
		});

		// Lazy load content when expanded
		details.addEventListener('toggle', () => {
			if (details.open && !details.querySelector('.sync-result-content')) {
				const content = details.createEl('div', { cls: 'sync-result-content' });
				
				for (const operation of operations.slice(0, 10)) {
					const item = content.createEl('div', { cls: 'sync-result-item' });
					
					const icon = operation.operation === 'create' ? '➕' : operation.operation === 'update' ? '📝' : '🗑️';
					const locationDiv = item.createEl('div', { cls: 'sync-result-location' });
					
					locationDiv.createEl('span', { text: `${icon} ` });
					
					if (operation.flashcard.sourcePath) {
						// Create clickable file link
						this.createFileLink(locationDiv, operation.flashcard.sourcePath, operation.flashcard.lineStart);
					} else {
						locationDiv.createEl('span', { text: `Anki Note ${operation.noteId}` });
					}

					if (!operation.success && operation.error) {
						item.createEl('div', { 
							cls: 'sync-result-error',
							text: operation.error
						});
					}
				}

				if (operations.length > 10) {
					content.createEl('div', { 
						cls: 'sync-more-items',
						text: `... and ${operations.length - 10} more`
					});
				}
			}
		});
	}

	private createFileLink(container: HTMLElement, filePath: string, lineNumber: number) {
		const fileLink = container.createEl('a', { 
			cls: 'sync-result-file-link',
			text: `${filePath}:${lineNumber}`
		});
		
		fileLink.addEventListener('click', (e) => {
			e.preventDefault();
			this.navigateToFile(filePath, lineNumber);
		});
	}

	private navigateToFile(filePath: string, lineNumber: number) {
		// Use Obsidian's workspace to open the file at specific line
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file) {
			this.app.workspace.openLinkText(filePath, '', true).then(() => {
				// Try to navigate to the specific line
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView) {
					const editor = activeView.editor;
					// Convert to 0-based line number for editor
					const targetLine = Math.max(0, lineNumber - 1);
					editor.setCursor(targetLine, 0);
					editor.scrollIntoView({ from: { line: targetLine, ch: 0 }, to: { line: targetLine, ch: 0 } }, true);
				}
			});
		}
		
		// Close the modal after navigation
		this.close();
	}

	private parseUserFriendlyError(error: unknown, operation: 'create' | 'update' | 'delete'): string {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const lowerError = errorMessage.toLowerCase();
		
		// Parse common Anki error patterns
		if (lowerError.includes('duplicate') || lowerError.includes('already exists')) {
			if (operation === 'create') {
				return 'Card already exists in Anki. Try refreshing the sync or check for duplicate content.';
			}
		}
		
		if (lowerError.includes('connection') || lowerError.includes('network') || lowerError.includes('timeout')) {
			return 'Connection to Anki lost. Make sure Anki is running and AnkiConnect is installed.';
		}
		
		if (lowerError.includes('permission') || lowerError.includes('access denied')) {
			return 'Permission denied. Check Anki and AnkiConnect permissions.';
		}
		
		if (lowerError.includes('model') || lowerError.includes('note type')) {
			return 'Note type not found in Anki. Refresh your connection or recreate the note type.';
		}
		
		if (lowerError.includes('deck')) {
			return 'Deck not found in Anki. Check your default deck setting.';
		}
		
		if (lowerError.includes('field')) {
			return 'Invalid field configuration. Check that all fields match the note type in Anki.';
		}
		
		if (lowerError.includes('not found') && operation === 'update') {
			return 'Note no longer exists in Anki. It may have been deleted manually.';
		}
		
		if (lowerError.includes('not found') && operation === 'delete') {
			return 'Note already deleted from Anki.';
		}
		
		// Return original error if no pattern matches, but make it more user-friendly
		return `${operation === 'create' ? 'Creation' : operation === 'update' ? 'Update' : 'Deletion'} failed: ${errorMessage}`;
	}

}
