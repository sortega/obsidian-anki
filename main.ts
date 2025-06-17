import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { YankiConnect } from 'yanki-connect';
import { FlashcardInsertModal, FlashcardInsertModalProps } from './flashcard-insert-modal';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
	lastUsedNoteType: string;
	availableNoteTypes: Record<string, string[]>;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	lastUsedNoteType: 'Basic',
	availableNoteTypes: {}
}

export default class ObsidianAnkiPlugin extends Plugin {
	settings: MyPluginSettings;
	private ankiConnect: YankiConnect;
	private ankiStatusBar: HTMLElement;
	private availableDecks: string[] = [];
	private insertFlashcardButton: HTMLElement;

	async onload() {
		await this.loadSettings();

		// Initialize Anki Connect
		this.ankiConnect = new YankiConnect();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('star', 'Sync to Anki', async (evt: MouseEvent) => {
			await this.connectToAnki('Sync operation');
		});
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// Add ribbon icon for inserting flashcards
		this.insertFlashcardButton = this.addRibbonIcon('file-plus', 'Insert Flashcard', (evt: MouseEvent) => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView) {
				const modalProps: FlashcardInsertModalProps = {
					availableNoteTypes: this.settings.availableNoteTypes,
					lastUsedNoteType: this.settings.lastUsedNoteType,
					onNoteTypeSelected: async (noteType: string) => {
						this.settings.lastUsedNoteType = noteType;
						await this.saveSettings();
					}
				};
				new FlashcardInsertModal(this.app, modalProps).open();
			}
		});
		this.insertFlashcardButton.addClass('insert-flashcard-ribbon-class');

		// This adds a status bar item to the bottom of the app
		this.ankiStatusBar = this.addStatusBarItem();
		
		// Connect to Anki on startup
		await this.connectToAnki('Plugin startup');

		// Connect to Anki every 10 seconds
		this.registerInterval(window.setInterval(() => {
			this.connectToAnki('Periodic check');
		}, 10 * 1000));

		// Update button state when active view changes
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			this.updateInsertFlashcardButtonState();
		}));
		
		// Update button state initially
		this.updateInsertFlashcardButtonState();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ObsidianAnkiSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async connectToAnki(context: string) {
		try {
			const [noteTypeNames, deckNames] = await Promise.all([
				this.ankiConnect.model.modelNames(),
				this.ankiConnect.deck.deckNames()
			]);
			
			this.availableDecks = deckNames;

			// Get field names for each note type
			this.settings.availableNoteTypes = {};
			for (const noteTypeName of noteTypeNames) {
				const fieldNames = await this.ankiConnect.model.modelFieldNames({ modelName: noteTypeName });
				this.settings.availableNoteTypes[noteTypeName] = fieldNames;
			}

			// Save note types to settings
			await this.saveSettings();

			console.log(`[${context}] Anki connection successful. Note types with fields:`, this.settings.availableNoteTypes, 'Decks:', this.availableDecks);
			this.ankiStatusBar.setText(`🟢 Anki: ${deckNames.length} decks`);
			
			// Update button state since note types might have changed
			this.updateInsertFlashcardButtonState();
		} catch (error) {
			this.availableDecks = [];
			// Note: availableNoteTypes remain in settings from last successful connection
			console.log(`[${context}] Anki connection failed:`, error);
			this.ankiStatusBar.setText('🔴 Anki disconnected');
			
			// Update button state since note types are now from cache
			this.updateInsertFlashcardButtonState();
		}
	}

	private updateInsertFlashcardButtonState() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const hasNoteTypes = Object.keys(this.settings.availableNoteTypes).length > 0;
		const isEnabled = activeView !== null && hasNoteTypes;
		
		if (isEnabled) {
			this.insertFlashcardButton.removeClass('is-disabled');
			this.insertFlashcardButton.setAttribute('aria-label', 'Insert Flashcard');
		} else {
			this.insertFlashcardButton.addClass('is-disabled');
			let reason = '';
			if (!activeView) {
				reason = 'No markdown editor active';
			} else if (!hasNoteTypes) {
				reason = 'No Anki note types available';
			}
			this.insertFlashcardButton.setAttribute('aria-label', `Insert Flashcard (${reason})`);
		}
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class ObsidianAnkiSettingTab extends PluginSettingTab {
	plugin: ObsidianAnkiPlugin;

	constructor(app: App, plugin: ObsidianAnkiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));

		// Available Note Types section
		const hasNoteTypes = Object.keys(this.plugin.settings.availableNoteTypes).length > 0;
		
		new Setting(containerEl)
			.setName('Anki Note Types')
			.setDesc(hasNoteTypes 
				? 'Note types saved from the last successful connection to Anki' 
				: 'No note types cached yet')
			.addButton(button => button
				.setButtonText('Reset Cache')
				.setDisabled(!hasNoteTypes)
				.onClick(async () => {
					this.plugin.settings.availableNoteTypes = {};
					await this.plugin.saveSettings();
					this.plugin['updateInsertFlashcardButtonState']();
					this.display();
				}));

		if (hasNoteTypes) {
			const noteTypesList = containerEl.createEl('div', { cls: 'cached-note-types-list' });
			noteTypesList.style.marginLeft = '20px';
			noteTypesList.style.marginTop = '10px';
			
			for (const [noteType, fields] of Object.entries(this.plugin.settings.availableNoteTypes)) {
				const noteTypeItem = noteTypesList.createEl('div', { cls: 'note-type-item' });
				noteTypeItem.style.marginBottom = '8px';
				
				const noteTypeName = noteTypeItem.createEl('strong', { text: noteType });
				noteTypeName.style.display = 'block';
				
				const fieldsText = noteTypeItem.createEl('small', { 
					text: `Fields: ${fields.join(', ')}`,
					cls: 'note-type-fields'
				});
				fieldsText.style.color = 'var(--text-muted)';
			}
		}
	}
}
