/**
 * Storage management utility for screenshot files
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';

export class ScreenshotStorage {
  constructor() {
    this.storagePath = process.env.SCREENSHOT_PATH || './screenshots';
    this.prefix = process.env.SCREENSHOT_PREFIX || 'screenshot';
    this.maxFiles = parseInt(process.env.AUTO_CAPTURE_MAX_FILES) || 100;
    this.maxStorageMB = parseInt(process.env.MAX_STORAGE_SIZE_MB) || 500;
    this.cleanupDays = parseInt(process.env.CLEANUP_OLDER_THAN_DAYS) || 7;
  }

  /**
   * Initialize storage directory
   */
  async initialize() {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      logger.info('Screenshot storage initialized', { path: this.storagePath });
      
      // Perform initial cleanup
      await this.cleanup();
    } catch (error) {
      logger.error('Failed to initialize storage', { error: error.message });
      throw new Error(`Storage initialization failed: ${error.message}`);
    }
  }

  /**
   * Generate filename with timestamp
   * @param {string} format - Image format (png, jpg, jpeg)
   * @returns {string} Generated filename
   */
  generateFilename(format = 'png') {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/:/g, '-')
      .replace(/\..+/, '')
      .replace(/T/, '_');
    return `${this.prefix}_${timestamp}.${format}`;
  }

  /**
   * Save screenshot data to file
   * @param {Buffer} imageBuffer - Image data
   * @param {string} filename - Optional custom filename
   * @returns {Promise<object>} File information
   */
  async saveScreenshot(imageBuffer, filename = null) {
    const startTime = Date.now();
    
    try {
      const finalFilename = filename || this.generateFilename();
      const filepath = path.join(this.storagePath, finalFilename);
      
      await fs.writeFile(filepath, imageBuffer);
      
      const stats = await fs.stat(filepath);
      const fileInfo = {
        filename: finalFilename,
        filepath,
        size: stats.size,
        created: stats.ctime,
        modified: stats.mtime,
        sizeFormatted: this.formatFileSize(stats.size)
      };

      logger.debug('Screenshot saved', {
        filename: finalFilename,
        size: fileInfo.sizeFormatted,
        executionTime: Date.now() - startTime
      });

      // Check if cleanup is needed
      await this.checkStorageLimits();

      return fileInfo;
    } catch (error) {
      logger.error('Failed to save screenshot', { error: error.message, filename });
      throw new Error(`Save failed: ${error.message}`);
    }
  }

  /**
   * List all screenshots
   * @param {object} options - Listing options
   * @returns {Promise<Array>} List of screenshots
   */
  async listScreenshots(options = {}) {
    const { limit = 50, sortBy = 'created', order = 'desc' } = options;

    try {
      const files = await fs.readdir(this.storagePath);
      const screenshots = [];

      for (const file of files) {
        if (this.isImageFile(file)) {
          const filepath = path.join(this.storagePath, file);
          try {
            const stats = await fs.stat(filepath);
            screenshots.push({
              filename: file,
              filepath,
              size: stats.size,
              created: stats.ctime,
              modified: stats.mtime,
              sizeFormatted: this.formatFileSize(stats.size)
            });
          } catch (statError) {
            logger.warn('Could not stat file', { file, error: statError.message });
          }
        }
      }

      // Sort screenshots
      screenshots.sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        
        if (order === 'desc') {
          return bValue > aValue ? 1 : -1;
        } else {
          return aValue > bValue ? 1 : -1;
        }
      });

      return screenshots.slice(0, limit);
    } catch (error) {
      logger.error('Failed to list screenshots', { error: error.message });
      throw new Error(`List failed: ${error.message}`);
    }
  }

  /**
   * Get screenshot by filename
   * @param {string} filename - Screenshot filename
   * @returns {Promise<object>} Screenshot info and data
   */
  async getScreenshot(filename) {
    try {
      const filepath = path.join(this.storagePath, filename);
      const stats = await fs.stat(filepath);
      const data = await fs.readFile(filepath);

      return {
        filename,
        filepath,
        size: stats.size,
        created: stats.ctime,
        modified: stats.mtime,
        sizeFormatted: this.formatFileSize(stats.size),
        data,
        base64: data.toString('base64')
      };
    } catch (error) {
      logger.error('Failed to get screenshot', { filename, error: error.message });
      throw new Error(`Get screenshot failed: ${error.message}`);
    }
  }

  /**
   * Get latest screenshot
   * @returns {Promise<object>} Latest screenshot info and data
   */
  async getLatestScreenshot() {
    const screenshots = await this.listScreenshots({ limit: 1, sortBy: 'created', order: 'desc' });
    
    if (screenshots.length === 0) {
      throw new Error('No screenshots found');
    }

    return await this.getScreenshot(screenshots[0].filename);
  }

  /**
   * Delete screenshot by filename
   * @param {string} filename - Screenshot filename
   * @returns {Promise<boolean>} Success status
   */
  async deleteScreenshot(filename) {
    try {
      if (process.env.ALLOW_DELETE !== 'true') {
        throw new Error('Delete operations are disabled');
      }

      const filepath = path.join(this.storagePath, filename);
      await fs.unlink(filepath);
      
      logger.info('Screenshot deleted', { filename });
      return true;
    } catch (error) {
      logger.error('Failed to delete screenshot', { filename, error: error.message });
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  /**
   * Delete multiple screenshots
   * @param {Array} filenames - Array of filenames to delete
   * @returns {Promise<object>} Deletion results
   */
  async deleteMultiple(filenames) {
    const results = {
      deleted: [],
      failed: []
    };

    for (const filename of filenames) {
      try {
        await this.deleteScreenshot(filename);
        results.deleted.push(filename);
      } catch (error) {
        results.failed.push({ filename, error: error.message });
      }
    }

    return results;
  }

  /**
   * Cleanup old screenshots
   * @returns {Promise<object>} Cleanup results
   */
  async cleanup() {
    try {
      const screenshots = await this.listScreenshots({ limit: 1000 });
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - (this.cleanupDays * 24 * 60 * 60 * 1000));
      
      const toDelete = screenshots.filter(screenshot => 
        screenshot.created < cutoffDate
      );

      // Also delete excess files if over limit
      if (screenshots.length > this.maxFiles) {
        const excess = screenshots
          .sort((a, b) => a.created - b.created)
          .slice(0, screenshots.length - this.maxFiles);
        toDelete.push(...excess);
      }

      if (toDelete.length > 0) {
        const filenames = toDelete.map(s => s.filename);
        const results = await this.deleteMultiple(filenames);
        
        logger.info('Cleanup completed', {
          deleted: results.deleted.length,
          failed: results.failed.length,
          totalFiles: screenshots.length
        });

        return results;
      }

      return { deleted: [], failed: [] };
    } catch (error) {
      logger.error('Cleanup failed', { error: error.message });
      throw new Error(`Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Check storage limits and cleanup if needed
   */
  async checkStorageLimits() {
    try {
      const totalSize = await this.getTotalStorageSize();
      const sizeMB = totalSize / (1024 * 1024);

      if (sizeMB > this.maxStorageMB) {
        logger.warn('Storage limit exceeded, performing cleanup', {
          currentSize: `${sizeMB.toFixed(2)}MB`,
          limit: `${this.maxStorageMB}MB`
        });
        
        await this.cleanup();
      }
    } catch (error) {
      logger.error('Failed to check storage limits', { error: error.message });
    }
  }

  /**
   * Get total storage size
   * @returns {Promise<number>} Total size in bytes
   */
  async getTotalStorageSize() {
    try {
      const screenshots = await this.listScreenshots({ limit: 1000 });
      return screenshots.reduce((total, screenshot) => total + screenshot.size, 0);
    } catch (error) {
      logger.error('Failed to get total storage size', { error: error.message });
      return 0;
    }
  }

  /**
   * Get storage statistics
   * @returns {Promise<object>} Storage statistics
   */
  async getStorageStats() {
    try {
      const screenshots = await this.listScreenshots({ limit: 1000 });
      const totalSize = screenshots.reduce((total, s) => total + s.size, 0);
      const sizeMB = totalSize / (1024 * 1024);

      return {
        totalFiles: screenshots.length,
        totalSize,
        totalSizeFormatted: this.formatFileSize(totalSize),
        totalSizeMB: sizeMB.toFixed(2),
        storageLimit: `${this.maxStorageMB}MB`,
        fileLimit: this.maxFiles,
        utilizationPercent: Math.round((sizeMB / this.maxStorageMB) * 100),
        oldestFile: screenshots.length > 0 ? screenshots[screenshots.length - 1] : null,
        newestFile: screenshots.length > 0 ? screenshots[0] : null
      };
    } catch (error) {
      logger.error('Failed to get storage stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if file is an image
   * @param {string} filename - File name
   * @returns {boolean} Whether file is an image
   */
  isImageFile(filename) {
    const extensions = ['.png', '.jpg', '.jpeg', '.bmp', '.gif'];
    const ext = path.extname(filename).toLowerCase();
    return extensions.includes(ext);
  }

  /**
   * Format file size for display
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export singleton instance
export const screenshotStorage = new ScreenshotStorage();