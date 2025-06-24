import { App, Modal, Notice, TFile } from 'obsidian';
import { AnkiService } from './anki-service';
import { Flashcard } from './flashcard';
import { SyncAnalysis } from './sync-analysis';
import { MarkdownService } from './markdown-service';

export class SyncExecutionModal extends Modal {
	private analysis: SyncAnalysis;
	private ankiService: AnkiService;
	private defaultDeck: string;
	private vaultName: string;
	private progressBar: HTMLElement;
	private progressText: HTMLElement;
	private statusText: HTMLElement;

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
					
					console.log(`✅ Created note ${noteId} for ${flashcard.sourcePath}:${flashcard.lineStart}`);
				} catch (error) {
					console.error(`❌ Failed to create note for ${flashcard.sourcePath}:${flashcard.lineStart}:`, error);
					new Notice(`Failed to create flashcard: ${error instanceof Error ? error.message : String(error)}`);
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
					
					console.log(`✅ Updated note ${ankiNote.noteId} for ${flashcard.sourcePath}:${flashcard.lineStart}`);
				} catch (error) {
					console.error(`❌ Failed to update note ${ankiNote.noteId}:`, error);
					new Notice(`Failed to update flashcard: ${error instanceof Error ? error.message : String(error)}`);
				}
				completed++;
			}

			// Delete removed flashcards
			if (this.analysis.deletedAnkiNotes.length > 0) {
				try {
					this.updateProgress(completed / totalOperations, `Deleting ${this.analysis.deletedAnkiNotes.length} removed notes...`);
					
					const noteIds = this.analysis.deletedAnkiNotes.map(note => note.noteId);
					await this.ankiService.deleteNotes(noteIds);
					
					console.log(`✅ Deleted ${noteIds.length} notes:`, noteIds);
				} catch (error) {
					console.error(`❌ Failed to delete notes:`, error);
					new Notice(`Failed to delete removed flashcards: ${error instanceof Error ? error.message : String(error)}`);
				}
				completed += this.analysis.deletedAnkiNotes.length;
			}

			// Update Obsidian files with new anki_id values
			if (createdNoteIds.length > 0) {
				this.updateProgress(0.9, 'Updating Obsidian files with Anki IDs...');
				await this.updateObsidianFiles(createdNoteIds);
			}

			this.updateProgress(1, 'Sync complete!');
			
			// Show completion message
			const successMessage = `Sync completed successfully!\n` +
				`• Created: ${this.analysis.newFlashcards.length} flashcards\n` +
				`• Updated: ${this.analysis.changedFlashcards.length} flashcards\n` +
				`• Deleted: ${this.analysis.deletedAnkiNotes.length} flashcards`;
			
			new Notice(successMessage);
			
			// Auto-close after success
			setTimeout(() => this.close(), 2000);

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
			const updatedYaml = this.insertAnkiIdInYaml(yamlContent, noteId);
			
			// Replace the lines
			const newLines = [...lines];
			newLines.splice(blockStart + 1, blockEnd - blockStart - 1, ...updatedYaml.split('\n'));
			
			return newLines.join('\n');
		} catch (error) {
			console.warn(`Failed to parse YAML for ${flashcard.sourcePath}:${flashcard.lineStart}:`, error);
			return content;
		}
	}

	private insertAnkiIdInYaml(yamlContent: string, noteId: number): string {
		const lines = yamlContent.split('\n');
		
		// Find where to insert anki_id (after note_type if it exists, otherwise at the beginning)
		let insertIndex = 0;
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith('note_type:')) {
				insertIndex = i + 1;
				break;
			}
		}
		
		// Insert the anki_id line
		const ankiIdLine = `anki_id: ${noteId}`;
		lines.splice(insertIndex, 0, ankiIdLine);
		
		return lines.join('\n');
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
}