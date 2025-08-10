import {App, Modal, Notice, TFile} from 'obsidian';
import {AnkiNote, AnkiService, MediaItem} from './anki-service';
import {Flashcard} from './flashcard';
import {SyncAnalysis} from './sync-analysis';
import {MarkdownService} from './markdown-service';
import {DEFAULT_IMPORT_FILE} from './constants';
import {navigateToFile} from './navigation-utils';
import * as yaml from 'js-yaml';

export interface OperationResult {
	flashcard: Flashcard;
	success: boolean;
	error?: string;
	noteId?: number;
	operation: 'create' | 'update' | 'delete';
}

export interface MediaOperationResult {
	mediaItem: MediaItem;
	success: boolean;
	error?: string;
	ankiFilename?: string;
}

export interface SyncResults {
	totalOperations: number;
	successfulOperations: OperationResult[];
	failedOperations: OperationResult[];
	mediaOperations: MediaOperationResult[];
	isPartialSuccess: boolean;
	startTime: Date;
	endTime: Date;
}

export class SyncExecutionModal extends Modal {
	private analysis: SyncAnalysis;
	private ankiService: AnkiService;
	private vaultName: string;
	private orphanedCardAction: 'delete' | 'import';
	private progressBar: HTMLElement;
	private progressText: HTMLElement;
	private statusText: HTMLElement;
	private successCountText: HTMLElement;
	private failureCountText: HTMLElement;
	private results: SyncResults;

	constructor(app: App, analysis: SyncAnalysis, ankiService: AnkiService, vaultName: string, orphanedCardAction: "delete" | "import" = 'delete') {
		super(app);
		this.analysis = analysis;
		this.ankiService = ankiService;
		this.vaultName = vaultName;
		this.orphanedCardAction = orphanedCardAction;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();

		// Modal title
		contentEl.createEl('h2', {text: 'Syncing to Anki'});

		// Progress section
		const progressSection = contentEl.createEl('div', {cls: 'sync-progress-section'});

		// Progress text
		this.progressText = progressSection.createEl('div', {
			cls: 'sync-progress-text',
			text: 'Starting sync...'
		});

		// Progress bar container
		const progressContainer = progressSection.createEl('div', {cls: 'sync-progress-container'});
		this.progressBar = progressContainer.createEl('div', {cls: 'sync-progress-bar'});

		// Status text
		this.statusText = progressSection.createEl('div', {
			cls: 'sync-status-text',
			text: 'Preparing to sync...'
		});

		// Success/Failure counters
		const countersSection = progressSection.createEl('div', {cls: 'sync-counters'});
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
		const {contentEl} = this;
		contentEl.empty();
	}

	private async executeSync() {
		try {
			let completed = 0;
			const totalOperations = this.analysis.newFlashcards.length +
				this.analysis.changedFlashcards.length +
				this.analysis.deletedAnkiNotes.length +
				this.analysis.unsyncedMediaItems.length;

			// Initialize results tracking
			this.results = {
				totalOperations,
				successfulOperations: [],
				failedOperations: [],
				mediaOperations: [],
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
					const htmlFlashcard = MarkdownService.toHtmlFlashcard(flashcard, this.vaultName);
					const noteId = await this.ankiService.createNote(htmlFlashcard, this.analysis.mediaItems);
					createdNoteIds.push({flashcard, noteId});

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
			for (const changedFlashcard of this.analysis.changedFlashcards) {
				try {
					this.updateProgress(completed / totalOperations, `Updating: ${changedFlashcard.flashcard.sourcePath}:${changedFlashcard.flashcard.lineStart}`);

					// Update note content
					await this.ankiService.updateNote(changedFlashcard.ankiNote.noteId, changedFlashcard.htmlFlashcard, this.analysis.mediaItems);

					// Check if the deck has changed and move the cards if needed
					if (
						changedFlashcard.ankiNote.deckNames.size > 1 ||
						!changedFlashcard.ankiNote.deckNames.has(changedFlashcard.htmlFlashcard.deck)
					) {
						await this.ankiService.moveCard(changedFlashcard.ankiNote.noteId, changedFlashcard.htmlFlashcard.deck);
						console.log(`📦 Moved cards of ${changedFlashcard.ankiNote.noteId} to '${changedFlashcard.htmlFlashcard.deck}'`);
					}

					// Track successful operation
					this.results.successfulOperations.push({
						flashcard: changedFlashcard.flashcard,
						success: true,
						noteId: changedFlashcard.ankiNote.noteId,
						operation: 'update'
					});
					this.updateCounters();

					console.log(`✅ Updated note ${changedFlashcard.ankiNote.noteId} for ${changedFlashcard.flashcard.sourcePath}:${changedFlashcard.flashcard.lineStart}`);
				} catch (error) {
					// Track failed operation with user-friendly error
					this.results.failedOperations.push({
						flashcard: changedFlashcard.flashcard,
						success: false,
						error: this.parseUserFriendlyError(error, 'update'),
						noteId: changedFlashcard.ankiNote.noteId,
						operation: 'update'
					});
					this.updateCounters();

					console.error(`❌ Failed to update note ${changedFlashcard.ankiNote.noteId}:`, error);
				}
				completed++;
			}

			// Handle orphaned cards (delete or import)
			if (this.analysis.deletedAnkiNotes.length > 0) {
				if (this.orphanedCardAction === 'delete') {
					await this.handleDeleteOrphanedCards(completed, totalOperations);
				} else {
					await this.handleImportOrphanedCards(completed, totalOperations);
				}
				completed += this.analysis.deletedAnkiNotes.length;
			}

			// Sync media files as the final step
			if (this.analysis.unsyncedMediaItems.length > 0) {
				await this.syncMediaFiles(completed, totalOperations);
				completed += this.analysis.unsyncedMediaItems.length;
			}

			// Update Obsidian files with new ankiId values
			if (createdNoteIds.length > 0) {
				this.updateProgress(0.95, 'Updating Obsidian files with Anki IDs...');
				await this.updateObsidianFiles(createdNoteIds);
			}

			// Finalize results
			this.results.endTime = new Date();
			const mediaFailures = this.results.mediaOperations.filter(op => !op.success);
			this.results.isPartialSuccess = this.results.failedOperations.length > 0 || mediaFailures.length > 0;

			this.updateProgress(1, 'Sync complete!');

			// Show results based on success/failure
			if (this.results.failedOperations.length === 0 && mediaFailures.length === 0) {
				// Complete success
				const mediaCount = this.results.mediaOperations.filter(op => op.success).length;
				const successMessage = `Sync completed successfully!\n` +
					`• Created: ${this.results.successfulOperations.filter(op => op.operation === 'create').length} flashcards\n` +
					`• Updated: ${this.results.successfulOperations.filter(op => op.operation === 'update').length} flashcards\n` +
					`• Deleted: ${this.results.successfulOperations.filter(op => op.operation === 'delete').length} flashcards` +
					(mediaCount > 0 ? `\n• Media: ${mediaCount} files synced` : '');

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

	private async handleDeleteOrphanedCards(completed: number, totalOperations: number) {
		try {
			this.updateProgress(completed / totalOperations, `Deleting ${this.analysis.deletedAnkiNotes.length} orphaned notes...`);

			const noteIds = this.analysis.deletedAnkiNotes.map(note => note.noteId);
			await this.ankiService.deleteNotes(noteIds);

			// Track successful delete operations
			for (const deletedNote of this.analysis.deletedAnkiNotes) {
				const flashcardForTracking: Flashcard = {
					sourcePath: '',
					lineStart: 0,
					lineEnd: 0,
					noteType: deletedNote.modelName,
					tags: deletedNote.tags || [],
					contentFields: {},
					ankiId: deletedNote.noteId,
					warnings: [],
					deck: deletedNote.deckNames[Symbol.iterator]().next().value
				};

				this.results.successfulOperations.push({
					flashcard: flashcardForTracking,
					success: true,
					noteId: deletedNote.noteId,
					operation: 'delete'
				});
			}
			this.updateCounters();

			console.log(`✅ Deleted ${noteIds.length} orphaned notes:`, noteIds);
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
					ankiId: deletedNote.noteId,
					warnings: [],
					deck: deletedNote.deckNames[Symbol.iterator]().next().value
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

			console.error(`❌ Failed to delete orphaned notes:`, error);
		}
	}

	private async handleImportOrphanedCards(completed: number, totalOperations: number) {
		this.updateProgress(completed / totalOperations, `Importing ${this.analysis.deletedAnkiNotes.length} orphaned cards...`);

		for (const orphanedNote of this.analysis.deletedAnkiNotes) {
			try {
				await this.importOrphanedCard(orphanedNote);

				// Track successful import operation
				const flashcardForTracking: Flashcard = {
					sourcePath: '',
					lineStart: 0,
					lineEnd: 0,
					noteType: orphanedNote.modelName,
					tags: orphanedNote.tags || [],
					contentFields: {},
					ankiId: orphanedNote.noteId,
					warnings: [],
					deck: orphanedNote.deckNames[Symbol.iterator]().next().value
				};

				this.results.successfulOperations.push({
					flashcard: flashcardForTracking,
					success: true,
					noteId: orphanedNote.noteId,
					operation: 'create' // Import is like creating in Obsidian
				});
				this.updateCounters();
			} catch (error) {
				// Track failed import operation
				const flashcardForTracking: Flashcard = {
					sourcePath: '',
					lineStart: 0,
					lineEnd: 0,
					noteType: orphanedNote.modelName,
					tags: orphanedNote.tags || [],
					contentFields: {},
					ankiId: orphanedNote.noteId,
					warnings: [],
					deck: orphanedNote.deckNames[Symbol.iterator]().next().value
				};

				this.results.failedOperations.push({
					flashcard: flashcardForTracking,
					success: false,
					error: this.parseUserFriendlyError(error, 'create'),
					noteId: orphanedNote.noteId,
					operation: 'create'
				});
				this.updateCounters();

				console.error(`❌ Failed to import orphaned note ${orphanedNote.noteId}:`, error);
			}
		}
	}

	private async syncMediaFiles(completed: number, totalOperations: number): Promise<void> {
		this.updateProgress(completed / totalOperations, `Syncing ${this.analysis.unsyncedMediaItems.length} media files...`);

		for (let i = 0; i < this.analysis.unsyncedMediaItems.length; i++) {
			const mediaItem = this.analysis.unsyncedMediaItems[i];
			const progressPercent = completed + i;
			this.updateProgress(progressPercent / totalOperations, `Syncing media: ${mediaItem.sourcePath}`);

			try {
				// Store media file in Anki - the service handles filename generation internally
				const ankiFilename = await this.ankiService.storeMediaFile(mediaItem);

				// Track successful operation
				this.results.mediaOperations.push({
					mediaItem,
					success: true,
					ankiFilename
				});

				console.log(`✅ Synced media file: ${mediaItem.sourcePath} → ${ankiFilename}`);
			} catch (error) {
				// Track failed operation
				this.results.mediaOperations.push({
					mediaItem,
					success: false,
					error: error instanceof Error ? error.message : String(error)
				});

				console.error(`❌ Failed to sync media file ${mediaItem.sourcePath}:`, error);
			}
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

				for (const {flashcard, noteId} of items) {
					updatedContent = this.addAnkiIdToFlashcard(updatedContent, flashcard, noteId);
				}

				if (updatedContent !== content) {
					await this.app.vault.modify(file, updatedContent);
					console.log(`✅ Updated ${filePath} with ${items.length} Anki ID values`);
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

		// Parse the YAML content and add ankiId
		const yamlLines = lines.slice(blockStart + 1, blockEnd);
		const yamlContent = yamlLines.join('\n');

		try {
			// Add ankiId to the YAML content
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

	private async importOrphanedCard(orphanedNote: AnkiNote) {
		// Convert AnkiNote to Flashcard using the AnkiService
		const flashcard = this.ankiService.convertOrphanedNoteToFlashcard(orphanedNote);

		// Determine target file and ensure .md extension is added if not present
		let targetFilePath = flashcard.sourcePath || DEFAULT_IMPORT_FILE;
		if (!targetFilePath.endsWith('.md')) {
			targetFilePath = targetFilePath + '.md';
		}

		// Convert flashcard to YAML format
		const flashcardYaml = this.convertFlashcardToYaml(flashcard);

		// Append to target file
		await this.appendFlashcardToFile(targetFilePath, flashcardYaml);

		console.log(`✅ Imported orphaned card ${orphanedNote.noteId} to ${targetFilePath}`, flashcard);
	}

	private convertFlashcardToYaml(flashcard: Flashcard): string {
		const yamlData: any = {
			NoteType: flashcard.noteType,
			AnkiId: flashcard.ankiId
		};

		// Add field content (already converted to markdown by AnkiService)
		for (const [fieldName, fieldValue] of Object.entries(flashcard.contentFields)) {
			yamlData[fieldName] = fieldValue;
		}

		// Add tags if present
		if (flashcard.tags.length > 0) {
			yamlData.Tags = flashcard.tags;
		}

		return yaml.dump(yamlData, {
			indent: 2,
			lineWidth: -1,
			noRefs: true,
			sortKeys: false
		});
	}

	private async appendFlashcardToFile(filePath: string, flashcardYaml: string) {
		let file = this.app.vault.getAbstractFileByPath(filePath);

		// Create file if it doesn't exist
		if (!file) {
			await this.app.vault.create(filePath, '# Imported Flashcards\n\n');
			file = this.app.vault.getAbstractFileByPath(filePath);
		}

		if (!(file instanceof TFile)) {
			throw new Error(`Could not create or access file: ${filePath}`);
		}

		// Read current content
		const currentContent = await this.app.vault.read(file);

		// Append the flashcard block
		const newContent = currentContent + (currentContent.endsWith('\n') ? '' : '\n') +
			`\n\`\`\`flashcard\n${flashcardYaml.trim()}\n\`\`\`\n`;

		// Write back to file
		await this.app.vault.modify(file, newContent);
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
		const {contentEl} = this;
		contentEl.empty();

		// Modal title
		contentEl.createEl('h2', {text: 'Sync Results'});

		// Summary section
		const summarySection = contentEl.createEl('div', {cls: 'sync-results-summary'});

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

		// Media operations sections
		const successfulMediaOps = this.results.mediaOperations.filter(op => op.success);
		const failedMediaOps = this.results.mediaOperations.filter(op => !op.success);

		if (successfulMediaOps.length > 0) {
			this.createMediaResultSection(summarySection, 'Successful Media Operations', successfulMediaOps, 'success');
		}

		if (failedMediaOps.length > 0) {
			this.createMediaResultSection(summarySection, 'Failed Media Operations', failedMediaOps, 'failure');
		}

		// Action buttons
		const buttonContainer = contentEl.createEl('div', {cls: 'sync-button-container'});

		const closeButton = buttonContainer.createEl('button', {
			text: 'Close',
			cls: 'mod-cta'
		});
		closeButton.onclick = () => this.close();

	}

	private createResultSection(container: HTMLElement, title: string, operations: OperationResult[], type: 'success' | 'failure') {
		const details = container.createEl('details', {cls: `sync-result-section sync-result-${type}`});
		const summary = details.createEl('summary', {cls: 'sync-result-summary'});

		summary.createEl('span', {
			cls: 'sync-result-title',
			text: `${title} (${operations.length})`
		});

		// Lazy load content when expanded
		details.addEventListener('toggle', () => {
			if (details.open && !details.querySelector('.sync-result-content')) {
				const content = details.createEl('div', {cls: 'sync-result-content'});

				for (const operation of operations.slice(0, 10)) {
					const item = content.createEl('div', {cls: 'sync-result-item'});

					const icon = operation.operation === 'create' ? '➕' : operation.operation === 'update' ? '📝' : '🗑️';
					const locationDiv = item.createEl('div', {cls: 'sync-result-location'});

					locationDiv.createEl('span', {text: `${icon} `});

					if (operation.flashcard.sourcePath) {
						// Create clickable file link
						this.createFileLink(locationDiv, operation.flashcard.sourcePath, operation.flashcard.lineStart);
					} else {
						locationDiv.createEl('span', {text: `Anki Note ${operation.noteId}`});
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

	private createMediaResultSection(container: HTMLElement, title: string, operations: MediaOperationResult[], type: 'success' | 'failure') {
		const details = container.createEl('details', {cls: `sync-result-section sync-result-${type}`});
		const summary = details.createEl('summary', {cls: 'sync-result-summary'});

		summary.createEl('span', {
			cls: 'sync-result-title',
			text: `${title} (${operations.length})`
		});

		// Lazy load content when expanded
		details.addEventListener('toggle', () => {
			if (details.open && !details.querySelector('.sync-result-content')) {
				const content = details.createEl('div', {cls: 'sync-result-content'});

				for (const operation of operations.slice(0, 10)) {
					const item = content.createEl('div', {cls: 'sync-result-item'});

					const locationDiv = item.createEl('div', {cls: 'sync-result-location'});
					locationDiv.createEl('span', {text: `📁 ${operation.mediaItem.sourcePath}`});

					if (operation.success && operation.ankiFilename) {
						item.createEl('div', {
							cls: 'sync-result-anki-filename',
							text: `→ ${operation.ankiFilename}`
						});
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

		fileLink.addEventListener('click', async (e) => {
			e.preventDefault();
			const success = await navigateToFile(this.app, filePath, lineNumber);
			if (success) {
				this.close();
			}
		});
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
