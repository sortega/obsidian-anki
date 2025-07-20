// Mock yanki-connect module only
jest.mock('yanki-connect', () => ({
  YankiConnect: jest.fn().mockImplementation(() => ({
    media: {
      storeMediaFile: jest.fn().mockResolvedValue('stored-filename'),
      retrieveMediaFile: jest.fn().mockResolvedValue('base64-content'),
    }
  })),
}), { virtual: true });

import { YankiConnectAnkiService, MediaItem } from '../anki-service';

describe('Media Sync', () => {
	let service: YankiConnectAnkiService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new YankiConnectAnkiService();
	});

	describe('storeMediaFile', () => {
		it('should store a media file and return the result', async () => {
			const mediaItem: MediaItem = {
				sourcePath: 'image.png',
				contents: new Uint8Array([1, 2, 3, 4])
			};

			const result = await service.storeMediaFile(mediaItem);
			expect(result).toBe('stored-filename');
		});
	});

	describe('hasMediaFile', () => {
		it('should return true when media file exists', async () => {
			const mediaItem: MediaItem = {
				sourcePath: 'image.png',
				contents: new Uint8Array([1, 2, 3, 4])
			};
			
			// Get the mock function and ensure it's properly set up
			const mockYankiConnect = (service as any).yankiConnect;
			const mockRetrieveMediaFile = mockYankiConnect.media.retrieveMediaFile;
			
			// Mock returns some data (not false) when file exists
			mockRetrieveMediaFile.mockResolvedValue(btoa(String.fromCharCode(...mediaItem.contents)));
			
			const result = await service.hasMediaFile(mediaItem);
			
			// Check that the mock was called with the generated Anki filename
			expect(mockRetrieveMediaFile).toHaveBeenCalledWith({ 
				filename: expect.stringMatching(/^obsidian-synced-.*\.png$/)
			});
			
			expect(result).toBe(true);
		});

		it('should return false when file not found', async () => {
			const mediaItem: MediaItem = {
				sourcePath: 'nonexistent.png',
				contents: new Uint8Array([1, 2, 3, 4])
			};
			
			const mockYankiConnect = (service as any).yankiConnect;
			mockYankiConnect.media.retrieveMediaFile.mockResolvedValue(false);
			
			const result = await service.hasMediaFile(mediaItem);
			expect(result).toBe(false);
		});

		it('should return false on error', async () => {
			const mediaItem: MediaItem = {
				sourcePath: 'error.png',
				contents: new Uint8Array([1, 2, 3, 4])
			};
			
			const mockYankiConnect = (service as any).yankiConnect;
			mockYankiConnect.media.retrieveMediaFile.mockRejectedValue(new Error('Network error'));
			
			const result = await service.hasMediaFile(mediaItem);
			expect(result).toBe(false);
		});
	});
});
